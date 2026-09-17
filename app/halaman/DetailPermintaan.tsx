"use client";

import { ArrowLeft, ArrowRight, CircleAlert, FileText, FolderOpen, History, RefreshCw, UploadCloud } from "lucide-react";
import { acceptedFileTypes } from "../komponen/KartuUnggahDokumen";
import { LabelStatus } from "../komponen/LabelStatus";
import { ProgresPermintaan } from "../komponen/ProgresPermintaan";
import { documentDescription, formatDate } from "../layanan/format-tampilan";
import type { PortalDocument, PortalRequest } from "../tipe/data-portal";

export function DetailPermintaan({
  request,
  busy,
  onBack,
  onReplace,
  onSubmit,
}: {
  request: PortalRequest;
  busy: boolean;
  onBack: () => void;
  onReplace: (document: PortalDocument, file: File) => Promise<void>;
  onSubmit: () => Promise<void>;
}) {
  const requiredDocuments = request.documents.filter((document) => document.required);
  const ready = requiredDocuments.every((document) => document.fileName || document.version > 0);
  const editable = ["Draft", "Need Clarification", "Rejected"].includes(request.status);
  const clarificationNote = [...request.logs]
    .reverse()
    .find((log) => log.eventType.includes("REVISION") || log.eventType.includes("CLARIFICATION"))?.note;

  return (
    <div className="page">
      <button className="back" onClick={onBack}><ArrowLeft size={16} /> Kembali ke My Requests</button>
      <header className="detailhead">
        <div><span className="eyebrow">{request.number}</span><h1>{request.requestType}</h1><p>{request.requesterName || "Requester"}{request.division ? ` · ${request.division}` : ""}</p></div>
        <LabelStatus status={request.status} />
      </header>

      {request.status === "Need Clarification" && (
        <div className="alert"><CircleAlert size={21} /><div><strong>Procurement membutuhkan revisi</strong><p>{clarificationNote || "Periksa catatan pada dokumen lalu unggah versi pengganti."}</p></div></div>
      )}

      <ProgresPermintaan request={request} />

      <div className="detailgrid">
        <section className="panel">
          <div className="panelhead panelhead-row">
            <div><h2>Documents</h2><p>Versi terbaru dan hasil review Procurement.</p></div>
            {request.driveFolderUrl && <a className="drive-link" href={request.driveFolderUrl} target="_blank" rel="noreferrer"><FolderOpen size={16} /> Drive Folder</a>}
          </div>
          {request.documents.length === 0 ? (
            <div className="empty">Detail dokumen belum tersedia.</div>
          ) : request.documents.map((document) => (
            <div className="detaildoc" key={document.id}>
              <div className="docicon"><FileText size={19} /></div>
              <div>
                <div className="doc-title"><strong>{document.type}</strong><b className={document.required ? "required" : "optional"}>{document.required ? "Wajib" : "Opsional"}</b></div>
                <small className="document-description">{documentDescription(document.type)}</small>
                <span>{document.fileName || "Belum diunggah"}{document.version > 0 ? ` · v${document.version}` : ""}</span>
                {document.reviewNote && <p><b>Catatan:</b> {document.reviewNote}</p>}
                <div className="doc-actions">
                  {document.fileUrl && <a href={document.fileUrl} target="_blank" rel="noreferrer">Lihat file</a>}
                  {editable && <label className="mini-upload">
                    <UploadCloud size={14} /> {document.fileName ? "Ganti file" : "Pilih file"}
                    <input hidden type="file" accept={acceptedFileTypes} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onReplace(document, file); }} />
                  </label>}
                </div>
              </div>
              <LabelStatus status={document.status} />
            </div>
          ))}
          {editable && (
            <div className="detail-submit">
              <button className="primary" disabled={!ready || busy} onClick={() => void onSubmit()}>
                {busy ? <RefreshCw className="spin" size={17} /> : <ArrowRight size={17} />} {request.status === "Draft" ? "Submit to Procurement" : "Kirim Ulang ke Procurement"}
              </button>
            </div>
          )}
        </section>

        <aside className="side-stack">
          <section className="panel">
            <div className="panelhead"><h2>Request Info</h2></div>
            <dl className="request-info">
              <div><dt>Requester</dt><dd>{request.requesterName || "—"}</dd><small>{request.requesterEmail}</small></div>
              <div><dt>Divisi</dt><dd>{request.division || "—"}</dd></div>
              <div><dt>Jabatan</dt><dd>{request.position || "—"}</dd></div>
              <div><dt>Lokasi</dt><dd>{request.location || "—"}</dd></div>
              <div><dt>Submitted</dt><dd>{formatDate(request.submittedAt)}</dd></div>
              <div><dt>Last updated</dt><dd>{formatDate(request.updatedAt)}</dd></div>
              {request.notes && <div><dt>Notes</dt><dd>{request.notes}</dd></div>}
              {request.masterRequestId && <div><dt>Procurement ID</dt><dd>{request.masterRequestId}</dd></div>}
              {request.poNumber && <div><dt>Nomor PO</dt><dd>{request.poUrl ? <a className="drive-link" href={request.poUrl} target="_blank" rel="noreferrer">{request.poNumber}</a> : request.poNumber}</dd></div>}
            </dl>
          </section>
          <section className="panel">
            <div className="panelhead panelhead-row"><div><h2>Activity</h2><p>Riwayat aktivitas request.</p></div><History size={18} /></div>
            <div className="timeline">
              {request.logs.length === 0 ? <span className="muted">Belum ada aktivitas.</span> : [...request.logs].reverse().map((log) => (
                <div className="timelineitem" key={log.id || `${log.eventType}-${log.at}`}>
                  <i />
                  <div><strong>{log.eventType.replaceAll("_", " ")}</strong><span>{formatDate(log.at)}</span><p>{log.note || [log.actorRole, log.actorEmail].filter(Boolean).join(" · ")}</p></div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
