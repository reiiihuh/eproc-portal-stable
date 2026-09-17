import { Check, X } from "lucide-react";
import type { PortalRequest } from "../tipe/data-portal";

const processSteps = [
  { status: "SUBMITTED", label: "Dokumen diajukan", description: "Dokumen berhasil diterima Procurement." },
  { status: "PROCUREMENT_REVIEW", label: "Review dokumen", description: "Kelengkapan dan isi dokumen sedang diperiksa." },
  { status: "APPROVED_FOR_PROCESS", label: "Disetujui", description: "Request diterima untuk proses pengadaan." },
  { status: "IN_PROCESS", label: "Proses pengadaan", description: "Procurement memproses pengadaan." },
  { status: "PO_ISSUED", label: "PO diterbitkan", description: "Purchase Order telah diterbitkan." },
  { status: "COMPLETED", label: "Selesai", description: "Proses request telah selesai." },
];

const statusPosition: Record<string, number> = {
  DRAFT: -1, SUBMITTED: 0, PROCUREMENT_REVIEW: 1, NEED_CLARIFICATION: 1,
  APPROVED_FOR_PROCESS: 2, IN_PROCESS: 3, PO_ISSUED: 4, COMPLETED: 5,
};

const statusKey = (status: string) => status.trim().toUpperCase().replace(/[ -]+/g, "_");

export function ProgresPermintaan({ request }: { request: PortalRequest }) {
  const currentStatus = statusKey(request.status);
  const dropped = ["CANCELLED", "DROPPED"].includes(currentStatus);
  const failedAt = currentStatus === "REJECTED" || (dropped && !request.masterRequestId) ? 1 : dropped ? 3 : -1;
  const current = failedAt >= 0 ? failedAt : (statusPosition[currentStatus] ?? -1);
  const failureNote = [...request.logs].reverse().find(log => /REJECT|CANCEL|DROP/.test(statusKey(log.eventType)))?.note;
  return (
    <section className="panel progress-panel">
      <div className="panelhead"><h2>Progress Request</h2><p>Status mengikuti proses Procurement.</p></div>
      <div className="process-progress">
        {processSteps.map((step, index) => {
          const failed = index === failedAt;
          const complete = failedAt >= 0 ? index < failedAt : index <= current;
          const active = failed || (index === current && current >= 0);
          const label = failed ? dropped ? "Dropped" : "Ditolak Procurement" : step.label;
          const description = failed ? failureNote || (dropped ? "Proses dihentikan oleh Procurement dan disimpan sebagai histori." : "Perbaiki request lalu ajukan kembali.") : step.description;
          return (
            <div className={`process-step ${complete ? "complete" : ""} ${active ? "active" : ""} ${failed ? "failed" : ""}`} key={step.status}>
              <span>{failed ? <X size={15} /> : complete ? <Check size={15} /> : index + 1}</span>
              <div><strong>{label}</strong><small>{description}</small></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
