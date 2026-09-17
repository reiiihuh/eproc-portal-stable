import type { PortalConfig } from "../tipe/data-portal";

export const defaultPortalConfig: PortalConfig = {
  requestTypes: [
    { key: "PENGADAAN_BARU", label: "Pengadaan Baru" },
    { key: "MAINTENANCE", label: "Maintenance" },
    { key: "RENEWAL", label: "Renewal" },
  ],
  requirements: {
    "Pengadaan Baru": [
      { type: "FPB", required: true, sortOrder: 10 },
      { type: "RFP", required: true, sortOrder: 20 },
      { type: "Memo Izin Prinsip", required: true, sortOrder: 30 },
      { type: "PQ Vendor", required: false, sortOrder: 40 },
    ],
    Maintenance: [
      { type: "FPB", required: true, sortOrder: 10 },
      { type: "Form Evaluation Vendor", required: true, sortOrder: 20 },
      { type: "Memo Izin Prinsip", required: true, sortOrder: 30 },
      { type: "PQ Vendor", required: false, sortOrder: 40 },
    ],
    Renewal: [
      { type: "FPB", required: true, sortOrder: 10 },
      { type: "Form Evaluation Vendor", required: true, sortOrder: 20 },
      { type: "Memo Izin Prinsip", required: true, sortOrder: 30 },
      { type: "PQ Vendor", required: false, sortOrder: 40 },
    ],
  },
};

