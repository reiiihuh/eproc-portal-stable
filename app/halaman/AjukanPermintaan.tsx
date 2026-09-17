"use client";

import { CheckCircle2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { KartuUnggahDokumen } from "../komponen/KartuUnggahDokumen";
import { allowedFileDescription } from "../layanan/validasi-dokumen";
import type { PortalConfig } from "../tipe/data-portal";

export function AjukanPermintaan({
  config,
  busy,
  onSaveDraft,
  onSubmit,
}: {
  config: PortalConfig;
  busy: boolean;
  onSaveDraft: (type: string, notes: string) => Promise<void>;
  onSubmit: (type: string, notes: string, files: Record<string, File>) => Promise<void>;
}) {
  const types = config.requestTypes.map((item) => item.label);
  const [type, setType] = useState(types[0] ?? "Pengadaan Baru");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<Record<string, File>>({});
  const activeType = types.includes(type) ? type : types[0] ?? "";
  const documents = config.requirements[activeType] ?? [];
  const requiredDocuments = documents.filter((document) => document.required);
  const ready = requiredDocuments.length > 0 && requiredDocuments.every((document) => files[document.type]);
  const uploadedCount = requiredDocuments.filter((document) => files[document.type]).length;

  return (
    <div className="page">
      <header className="pagehead">
        <div><span className="eyebrow">New procurement request</span><h1>Submit Documents</h1><p>Pilih tipe pengadaan dan unggah dokumen.</p></div>
      </header>
      <section className="panel submitpanel">
        <div className="formgrid">
          <label>
            Request Type
            <select value={activeType} onChange={(event) => { setType(event.target.value); setFiles({}); }}>
              {types.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="full">
            Notes <em>(optional)</em>
            <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Informasi tambahan untuk Procurement..." />
          </label>
        </div>
        <div className="sectionhead">
          <div><h2>Documents</h2><p>Format: {allowedFileDescription}. Maksimal 10 MB per file.</p></div>
          <span>{uploadedCount}/{requiredDocuments.length} required</span>
        </div>
        <div className="docstack">
          {documents.map((item) => (
            <KartuUnggahDokumen
              key={item.type}
              item={item}
              file={files[item.type]}
              onFile={(file) => setFiles((current) => ({ ...current, [item.type]: file }))}
            />
          ))}
        </div>
        <footer className="submitfooter">
          <div><strong>{ready ? "Ready to submit" : "Documents incomplete"}</strong><span>{ready ? "Semua dokumen wajib sudah terlampir." : "Upload seluruh dokumen wajib terlebih dahulu."}</span></div>
          <div className="footer-actions">
            <button className="secondary" disabled={busy} onClick={() => onSaveDraft(activeType, notes)}>Save Draft</button>
            <button className="primary" disabled={!ready || busy} onClick={() => onSubmit(activeType, notes, files)}>
              {busy ? <RefreshCw className="spin" size={17} /> : <CheckCircle2 size={17} />} Submit to Procurement
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
