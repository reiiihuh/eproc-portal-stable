"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultPortalConfig } from "../konfigurasi/portal-default";
import type { PortalConfig, PortalDocument, PortalPage, PortalRequest, PortalUser, RuntimeConfig } from "../tipe/data-portal";
import { portalApi } from "./akses-backend";
import { validateDocument } from "./validasi-dokumen";

type Notice = { kind: "success" | "error"; text: string };

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

export function useAlurPortal() {
  const [splash, setSplash] = useState(true);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [runtime, setRuntime] = useState<RuntimeConfig>({ googleClientId: "", backendConfigured: false, environment: "development" });
  const [config, setConfig] = useState<PortalConfig>(defaultPortalConfig);
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [page, setPage] = useState<PortalPage>("requests");
  const [selected, setSelected] = useState<PortalRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [processing, setProcessing] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const requestRefreshActive = useRef(false);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setSplash(false), 350);
    const sessionTimer = window.setTimeout(() => {
      const saved = sessionStorage.getItem("nano_portal_user");
      if (!saved) return;
      try { setUser(JSON.parse(saved) as PortalUser); } catch { sessionStorage.clear(); }
    }, 0);
    fetch("/api/config")
      .then(async (response) => await response.json() as RuntimeConfig)
      .then(setRuntime)
      .catch(() => setNotice({ kind: "error", text: "Konfigurasi portal gagal dimuat." }));
    return () => {
      window.clearTimeout(splashTimer);
      window.clearTimeout(sessionTimer);
    };
  }, []);

  const loadRequests = useCallback(async (silent = false) => {
    if (!user || !runtime.backendConfigured || requestRefreshActive.current) return;
    requestRefreshActive.current = true;
    if (!silent) setLoading(true);
    try {
      const next = await portalApi.listMyRequests();
      setRequests(next);
      setSelected(current => {
        if (!current) return current;
        const summary = next.find(request => request.id === current.id);
        return summary ? { ...current, ...summary, documents: current.documents, logs: current.logs } : current;
      });
    } catch (error) {
      if (!silent) setNotice({ kind: "error", text: error instanceof Error ? error.message : "Pengajuan gagal dimuat." });
    } finally {
      requestRefreshActive.current = false;
      if (!silent) setLoading(false);
    }
  }, [user, runtime.backendConfigured]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRequests(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  useEffect(() => {
    if (!user || !runtime.backendConfigured) return;
    const refresh = () => { if (document.visibilityState === "visible") void loadRequests(true); };
    // Pull ringan menjaga status master tampil otomatis tanpa refresh manual.
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user, runtime.backendConfigured, loadRequests]);

  useEffect(() => {
    if (!runtime.backendConfigured) return;
    portalApi.getConfig().then((remote) => {
      const requirements = Object.fromEntries(
        Object.entries({ ...defaultPortalConfig.requirements, ...remote.requirements }).map(([type, documents]) => [
          type,
          documents.map((document) => ({ ...document, required: document.type.toLowerCase() === "pq vendor" ? false : document.required })),
        ]),
      );
      setConfig({ requestTypes: remote.requestTypes.length ? remote.requestTypes : defaultPortalConfig.requestTypes, requirements });
    }).catch((error) => {
      setNotice({ kind: "error", text: `Konfigurasi dokumen memakai fallback: ${error instanceof Error ? error.message : "backend unavailable"}` });
    });
  }, [runtime.backendConfigured]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool || !user) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "list_my_procurement_requests",
      title: "List procurement requests",
      description: "Return procurement requests visible to the signed-in requester.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => requests.map(({ number, requestType, status, updatedAt }) => ({ number, requestType, status, updatedAt })),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [user, requests]);

  const login = useCallback((nextUser: PortalUser, idToken?: string) => {
    if (idToken) sessionStorage.setItem("nano_google_id_token", idToken);
    else sessionStorage.removeItem("nano_google_id_token");
    sessionStorage.setItem("nano_portal_user", JSON.stringify(nextUser));
    setUser(nextUser);
    setNotice(null);
  }, []);

  function logout() {
    window.google?.accounts.id.disableAutoSelect();
    sessionStorage.removeItem("nano_google_id_token");
    sessionStorage.removeItem("nano_portal_user");
    setUser(null);
    setRequests([]);
    setSelected(null);
    setPage("requests");
  }

  function navigate(next: "requests" | "submit") {
    setPage(next);
    setSelected(null);
    setMenuOpen(false);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openRequest(summary: PortalRequest) {
    setSelected(summary);
    setPage("detail");
    setLoading(true);
    setProcessing("Memuat detail dan timeline request...");
    setNotice(null);
    window.scrollTo({ top: 0 });
    try {
      const detail = await portalApi.getRequestDetail(summary.id);
      setSelected({ ...detail, requesterName: detail.requesterName || user?.name, requesterEmail: detail.requesterEmail || user?.email });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Detail request gagal dimuat." });
    } finally {
      setLoading(false);
      setProcessing("");
    }
  }

  async function saveDraft(requestType: string, notes: string) {
    if (!user) return;
    setBusy(true);
    setProcessing("Menyimpan draft request...");
    setNotice(null);
    try {
      const draft = await portalApi.createDraft(requestType, notes, user);
      setSelected({ ...draft, requesterName: draft.requesterName || user.name, requesterEmail: draft.requesterEmail || user.email });
      setPage("detail");
      await loadRequests();
      setNotice({ kind: "success", text: `${draft.number} berhasil disimpan sebagai draft.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Draft gagal disimpan." });
    } finally {
      setBusy(false);
      setProcessing("");
    }
  }

  async function submitNew(requestType: string, notes: string, files: Record<string, File>) {
    if (!user) return;
    setBusy(true);
    setProcessing("Membuat request dan mengunggah dokumen...");
    setNotice(null);
    try {
      Object.values(files).forEach(validateDocument);
      let draft = await portalApi.createDraft(requestType, notes, user);
      if (!draft.documents.some(document => document.id)) {
        try { draft = await portalApi.getRequestDetail(draft.id); } catch { /* createDraft normally contains the document rows */ }
      }
      const uploads = Object.entries(files);
      for (const [index, [documentType, file]] of uploads.entries()) {
        setProcessing(`Mengunggah ${index + 1}/${uploads.length}: ${documentType}...`);
        const document = draft.documents.find((item) => item.type.trim().toLowerCase() === documentType.trim().toLowerCase());
        if (!document?.id) throw new Error(`ID dokumen ${documentType} belum dibuat oleh backend. Draft tersimpan; buka draft lalu coba upload lagi.`);
        await portalApi.uploadDocument(draft, document, file);
      }
      await portalApi.submitRequest(draft.id);
      let complete = draft;
      try { complete = await portalApi.getRequestDetail(draft.id); } catch { complete = { ...draft, status: "Submitted" }; }
      setSelected({ ...complete, requesterName: complete.requesterName || user.name, requesterEmail: complete.requesterEmail || user.email });
      setPage("detail");
      await loadRequests();
      setNotice({ kind: "success", text: `${complete.number} berhasil dikirim ke Procurement.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Request gagal dikirim." });
    } finally {
      setBusy(false);
      setProcessing("");
    }
  }

  async function replaceDocument(document: PortalDocument, file: File) {
    if (!selected) return;
    setBusy(true);
    setProcessing(`${document.version ? "Mengganti" : "Mengunggah"} ${document.type}...`);
    setNotice(null);
    try {
      validateDocument(file);
      await portalApi.uploadDocument(selected, document, file);
      const [refreshed] = await Promise.all([portalApi.getRequestDetail(selected.id), loadRequests()]);
      setSelected(refreshed);
      setNotice({ kind: "success", text: `${document.type} berhasil ${document.version ? "diganti" : "diunggah"}.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Upload gagal." });
    } finally {
      setBusy(false);
      setProcessing("");
    }
  }

  async function submitExisting() {
    if (!selected) return;
    setBusy(true);
    setProcessing(selected.status === "Draft" ? "Mengirim request ke Procurement..." : "Mengirim ulang request ke Procurement...");
    try {
      await portalApi.submitRequest(selected.id);
      setSelected(await portalApi.getRequestDetail(selected.id));
      setPage("detail");
      await loadRequests();
      setNotice({ kind: "success", text: "Request berhasil dikirim ke Procurement." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Request gagal dikirim." });
    } finally {
      setBusy(false);
      setProcessing("");
    }
  }

  return {
    splash, user, runtime, config, requests, page, selected, loading, busy,
    menuOpen, setMenuOpen, processing, notice, setNotice, login, logout,
    navigate, openRequest, saveDraft, submitNew, replaceDocument, submitExisting,
  };
}
