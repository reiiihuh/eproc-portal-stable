"use client";

import { ArrowUpRight, CircleAlert, Clock3, FileCheck2, FolderOpen, Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { LabelStatus } from "../komponen/LabelStatus";
import { formatDate } from "../layanan/format-tampilan";
import type { PortalRequest } from "../tipe/data-portal";

export function PermintaanSaya({
  requests,
  loading,
  onSubmit,
  onOpen,
}: {
  requests: PortalRequest[];
  loading: boolean;
  onSubmit: () => void;
  onOpen: (request: PortalRequest) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => requests.filter((request) => `${request.number} ${request.requestType} ${request.status} ${request.notes ?? ""}`.toLowerCase().includes(query.toLowerCase())),
    [requests, query],
  );
  const active = requests.filter((request) => !["Completed", "Rejected", "Cancelled", "Dropped"].includes(request.status)).length;
  const clarification = requests.filter((request) => request.status === "Need Clarification").length;

  return (
    <div className="page">
      <header className="pagehead">
        <div><span className="eyebrow">Requester workspace</span><h1>My Requests</h1><p>Pantau pengajuan dan hasil review dokumen.</p></div>
        <button className="primary" onClick={onSubmit}><Plus size={18} /> New Request</button>
      </header>
      <section className="stats">
        <div><Clock3 /><strong>{active}</strong><span>Active requests</span></div>
        <div><FileCheck2 /><strong>{requests.length}</strong><span>Total requests</span></div>
        <div><CircleAlert /><strong>{clarification}</strong><span>Need clarification</span></div>
      </section>
      <section className="panel">
        <div className="panelhead panelhead-row">
          <div><h2>Recent submissions</h2><p>Pengajuan terbaru dari akun Anda.</p></div>
          <label className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari request" /></label>
        </div>
        {loading ? (
          <div className="empty"><RefreshCw className="spin" /> Memuat pengajuan...</div>
        ) : visible.length === 0 ? (
          <div className="empty"><FolderOpen /><strong>Belum ada pengajuan</strong><span>Buat request pertama untuk mulai mengirim dokumen.</span><button className="primary" onClick={onSubmit}><Plus size={17} /> New Request</button></div>
        ) : (
          <div className="requestlist">
            {visible.map((request) => (
              <button key={request.id} onClick={() => onOpen(request)} className="requestrow">
                <div><strong>{request.number}</strong><span>{request.requestType}{request.notes ? ` · ${request.notes}` : ""}</span></div>
                <div><span>{request.updatedAt ? formatDate(request.updatedAt) : "Draft"}</span><LabelStatus status={request.status} /><ArrowUpRight size={17} /></div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
