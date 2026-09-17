export function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function documentDescription(type: string) {
  const descriptions: Record<string, string> = {
    FPB: "Form Permintaan Barang — rincian kebutuhan dan persetujuan pengadaan.",
    RFP: "Request for Proposal — ruang lingkup pekerjaan dan spesifikasi kebutuhan.",
    "MEMO IZIN PRINSIP": "Persetujuan prinsip atas kebutuhan dan ruang lingkup pengadaan.",
    "FORM EVALUATION VENDOR": "Form evaluasi kinerja vendor untuk maintenance atau renewal.",
    "PQ VENDOR": "Price Quotation — penawaran harga dari vendor (opsional).",
  };
  return descriptions[type.trim().replaceAll("_", " ").toUpperCase()] ?? "";
}

