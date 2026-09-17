import type {
  DocumentRequirement,
  PortalConfig,
  PortalDocument,
  PortalRequest,
  StatusLog,
} from "../tipe/data-portal";

type JsonRow = Record<string, unknown>;
const value = (row: JsonRow, ...keys: string[]) => keys.map(key => row[key]).find(item => item !== undefined && item !== null);
const text = (row: JsonRow, ...keys: string[]) => String(value(row, ...keys) ?? "");
const number = (row: JsonRow, ...keys: string[]) => Number(value(row, ...keys) ?? 0);
const titleCase = (input: string) => input.toLowerCase().replace(/(^|_)([a-z])/g, (_, space, letter) => `${space ? " " : ""}${letter.toUpperCase()}`);
const requestTypeKeys: Record<string, string> = { "Pengadaan Baru": "PENGADAAN_BARU", Maintenance: "MAINTENANCE", Renewal: "RENEWAL" };
const requestTypeLabel = (input: string) => Object.keys(requestTypeKeys).find(label => requestTypeKeys[label] === input.trim() || label.toLowerCase() === input.trim().toLowerCase()) ?? input.trim();
const statusLabels: Record<string, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", PROCUREMENT_REVIEW: "Procurement Review",
  NEED_CLARIFICATION: "Need Clarification", APPROVED_FOR_PROCESS: "Approved for Process",
  IN_PROCESS: "In Process", PO_ISSUED: "PO Issued", COMPLETED: "Completed",
  REJECTED: "Rejected", CANCELLED: "Dropped", DROPPED: "Dropped",
};
const statusLabel = (input: string) => {
  const key = input.trim().toUpperCase().replace(/[ -]+/g, "_");
  return statusLabels[key] ?? (key.includes("_") ? titleCase(key) : input.trim());
};
const isRow = (input: unknown): input is JsonRow => Boolean(input) && typeof input === "object" && !Array.isArray(input);
const rows = (input: unknown): JsonRow[] => Array.isArray(input) ? input.filter(isRow) : isRow(input) ? Object.values(input).filter(isRow) : [];

function envelopeRows(data: JsonRow, kind: "documents" | "logs"): JsonRow[] {
  const request = isRow(data.request) ? data.request : {};
  const requestData = isRow(data.requestData) ? data.requestData : {};
  const candidates = kind === "documents"
    ? [data.documents, request.documents, data.portalDocuments, data.documentRows, requestData.documents]
    : [data.logs, request.logs, data.statusLogs, data.activityLogs, requestData.logs];
  for (const candidate of candidates) {
    const found = rows(candidate);
    if (found.length) return found;
  }
  if (kind === "documents") {
    const ids = isRow(data.documentIds) ? data.documentIds : isRow(request.documentIds) ? request.documentIds : null;
    if (ids) return Object.entries(ids).map(([documentType, documentId], index) => ({ DOCUMENT_TYPE: documentType, DOCUMENT_ID: documentId, SORT_ORDER: (index + 1) * 10 }));
  }
  return [];
}

function token() {
  return typeof window === "undefined" ? "" : sessionStorage.getItem("nano_google_id_token") ?? "";
}

async function invoke<T = JsonRow>(action: string, input: JsonRow = {}): Promise<T> {
  const response = await fetch("/api/apps-script", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, idToken: token(), ...input }),
  });
  const payload = await response.json().catch(() => ({})) as JsonRow;
  if (!response.ok || payload.ok === false) {
    const message = String(payload.message ?? payload.error ?? "Backend tidak dapat memproses request.");
    throw new Error(message === "Backend tidak dapat memproses request." ? `${message} [${action}]` : message);
  }
  return (payload.data ?? payload) as T;
}

function mapDocument(row: JsonRow): PortalDocument {
  const type = text(row, "DOCUMENT_TYPE", "documentType", "type");
  return {
    id: text(row, "DOCUMENT_ID", "documentId", "id"), type,
    required: type.toLowerCase() !== "pq vendor" && Boolean(value(row, "REQUIRED", "required") ?? true),
    sortOrder: number(row, "SORT_ORDER", "sortOrder"),
    version: number(row, "CURRENT_VERSION_NUMBER", "VERSION_NUMBER", "version"),
    status: text(row, "REVIEW_STATUS", "reviewStatus", "status") || "Not Uploaded",
    fileName: text(row, "FILE_NAME", "fileName") || undefined,
    fileUrl: text(row, "FILE_URL", "DRIVE_URL", "fileUrl", "url") || undefined,
    reviewNote: text(row, "REVIEW_NOTE", "PROCUREMENT_REVIEW_NOTE", "reviewNote") || undefined,
    templateUrl: text(row, "TEMPLATE_URL", "templateUrl") || undefined,
    guideUrl: text(row, "GUIDE_URL", "guideUrl") || undefined,
    exampleUrl: text(row, "EXAMPLE_URL", "exampleUrl") || undefined,
  };
}

function mapLog(row: JsonRow): StatusLog {
  return { id: text(row, "LOG_ID", "logId", "id"), eventType: text(row, "EVENT_TYPE", "eventType"), at: text(row, "EVENT_AT", "TIMESTAMP", "eventAt", "at"), actorEmail: text(row, "ACTOR_EMAIL", "actorEmail") || undefined, actorRole: text(row, "ACTOR_ROLE", "actorRole") || undefined, note: text(row, "NOTE", "note") || undefined, relatedDocumentId: text(row, "RELATED_DOCUMENT_ID", "relatedDocumentId") || undefined };
}

function mapRequest(row: JsonRow, documents: JsonRow[] = [], logs: JsonRow[] = []): PortalRequest {
  return {
    id: text(row, "REQUEST_ID", "requestId", "id"), number: text(row, "REQUEST_NUMBER", "requestNumber", "number") || text(row, "REQUEST_ID", "requestId", "id"),
    requestType: requestTypeLabel(text(row, "REQUEST_TYPE", "requestType", "type")), status: statusLabel(text(row, "CURRENT_STATUS", "status") || "Draft"),
    notes: text(row, "NOTES", "notes") || undefined, requesterName: text(row, "REQUESTER_NAME", "requesterName") || undefined,
    requesterEmail: text(row, "REQUESTER_EMAIL", "requesterEmail") || undefined, division: text(row, "REQUESTER_DIVISION", "DIVISION", "requesterDivision", "division") || undefined,
    createdAt: text(row, "CREATED_AT", "createdAt") || undefined, submittedAt: text(row, "SUBMITTED_AT", "submittedAt") || undefined,
    updatedAt: text(row, "LAST_UPDATED_AT", "UPDATED_AT", "updatedAt") || undefined,
    driveFolderUrl: text(row, "DRIVE_FOLDER_URL", "FOLDER_URL", "driveFolderUrl") || undefined,
    masterRequestId: text(row, "MASTER_REQUEST_ID", "masterRequestId") || undefined,
    poNumber: text(row, "PO_NUMBER", "poNumber") || undefined,
    poUrl: text(row, "PO_URL", "poUrl") || undefined,
    documents: documents.map(mapDocument), logs: logs.map(mapLog),
  };
}

function mapEnvelope(data: JsonRow): PortalRequest {
  const requestData = isRow(data.requestData) ? data.requestData : {};
  const request = isRow(data.request) ? data.request : isRow(requestData.request) ? requestData.request : data;
  return mapRequest(request, envelopeRows(data, "documents"), envelopeRows(data, "logs"));
}

export const portalApi = {
  async getConfig(): Promise<PortalConfig> {
    const cacheKey = "nano_portal_config_v1";
    if (typeof window !== "undefined") {
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null") as { at: number; value: PortalConfig } | null;
        if (cached && Date.now() - cached.at < 15 * 60_000) return cached.value;
      } catch { sessionStorage.removeItem(cacheKey); }
    }
    const data = await invoke("getPortalConfig");
    const requestTypes = Array.isArray(data.requestTypes) ? data.requestTypes : [];
    for (const item of requestTypes) requestTypeKeys[String(item.label).trim()] = String(item.key).trim();
    const requirements: Record<string, DocumentRequirement[]> = {};
    for (const item of (Array.isArray(data.documentRequirements) ? data.documentRequirements : [])) {
      const row = item as JsonRow, requestType = requestTypeLabel(text(row, "requestType", "REQUEST_TYPE")), type = text(row, "documentType", "DOCUMENT_TYPE");
      (requirements[requestType] ??= []).push({ type, required: type.toLowerCase() !== "pq vendor" && Boolean(value(row, "required", "REQUIRED") ?? true), sortOrder: number(row, "sortOrder", "SORT_ORDER"), templateUrl: text(row, "templateUrl", "TEMPLATE_URL") || undefined, guideUrl: text(row, "guideUrl", "GUIDE_URL") || undefined, exampleUrl: text(row, "exampleUrl", "EXAMPLE_URL") || undefined });
    }
    for (const items of Object.values(requirements)) {
      if (!items.some(item => item.type.trim().toLowerCase().replaceAll("_", " ") === "pq vendor")) items.push({ type: "PQ Vendor", required: false, sortOrder: 40 });
      items.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    let templateRows: JsonRow[] = [];
    try {
      const templates = await invoke("getTemplateLibrary");
      templateRows = Array.isArray(templates) ? templates.filter(isRow) : rows(templates.templates);
    } catch {
      try { const templates = await invoke("listTemplates"); templateRows = Array.isArray(templates) ? templates.filter(isRow) : rows(templates.templates); } catch { templateRows = []; }
    }
    for (const row of templateRows) {
      const requestType = requestTypeLabel(text(row, "REQUEST_TYPE", "requestType"));
      const documentType = text(row, "DOCUMENT_TYPE", "documentType");
      const resourceType = text(row, "RESOURCE_TYPE", "resourceType").toUpperCase();
      const fileId = text(row, "FILE_ID", "fileId");
      const url = text(row, "FILE_URL", "URL", "WEB_VIEW_URL", "fileUrl", "url") || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : "");
      const requirement = requirements[requestType]?.find(item => item.type.toLowerCase() === documentType.toLowerCase());
      if (!requirement || !url) continue;
      if (resourceType === "TEMPLATE") requirement.templateUrl = url;
      if (resourceType === "GUIDE") requirement.guideUrl = url;
      if (["EXAMPLE", "CONTOH"].includes(resourceType)) requirement.exampleUrl = url;
    }
    const result = { requestTypes, requirements };
    if (typeof window !== "undefined") sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), value: result }));
    return result;
  },
  async listMyRequests() {
    const data = await invoke("listMyRequests");
    const requestRows = (Array.isArray(data) ? data : Array.isArray(data.requests) ? data.requests : []) as JsonRow[];
    return requestRows.map((row) => mapRequest(row));
  },
  async getRequestDetail(requestId: string) {
    return mapEnvelope(await invoke("getRequestDetail", { requestId }));
  },
  async createDraft(requestType: string, notes: string, requester: { email: string; name: string }) {
    const data = await invoke("createDraft", { requestType: requestTypeKeys[requestType.trim()] ?? requestType.trim(), notes, requesterEmail: requester.email, requesterName: requester.name, optionalDocumentTypes: ["PQ Vendor"] });
    return mapEnvelope(data);
  },
  async uploadDocument(request: PortalRequest, document: PortalDocument, file: File) {
    if (!document.id.trim()) throw new Error(`Backend belum mengembalikan documentId untuk ${document.type}. Buka ulang draft lalu coba lagi.`);
    const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(new Error("File gagal dibaca.")); reader.readAsDataURL(file); });
    const data = await invoke("uploadDocument", { requestId: request.id, documentId: document.id, documentType: document.type, fileName: file.name, mimeType: file.type || "application/octet-stream", base64 });
    return isRow(data.document) ? mapDocument(data.document) : null;
  },
  async submitRequest(requestId: string) { return invoke("submitRequest", { requestId }); },
};
