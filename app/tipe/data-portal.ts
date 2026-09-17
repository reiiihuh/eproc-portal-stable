export type RequestStatus =
  | "Draft"
  | "Submitted"
  | "Procurement Review"
  | "Need Clarification"
  | "Approved for Process"
  | "In Process"
  | "PO Issued"
  | "Completed"
  | "Rejected"
  | "Cancelled"
  | "Dropped";

export type PortalUser = {
  email: string;
  name: string;
  picture?: string;
};

export type DocumentRequirement = {
  type: string;
  required: boolean;
  sortOrder: number;
  templateUrl?: string;
  guideUrl?: string;
  exampleUrl?: string;
};

export type PortalDocument = DocumentRequirement & {
  id: string;
  version: number;
  status: string;
  fileName?: string;
  fileUrl?: string;
  reviewNote?: string;
};

export type StatusLog = {
  id: string;
  eventType: string;
  at: string;
  actorEmail?: string;
  actorRole?: string;
  note?: string;
  relatedDocumentId?: string;
};

export type PortalRequest = {
  id: string;
  number: string;
  requestType: string;
  status: RequestStatus | string;
  notes?: string;
  requesterName?: string;
  requesterEmail?: string;
  division?: string;
  createdAt?: string;
  submittedAt?: string;
  updatedAt?: string;
  driveFolderUrl?: string;
  masterRequestId?: string;
  poNumber?: string;
  poUrl?: string;
  documents: PortalDocument[];
  logs: StatusLog[];
};

export type PortalConfig = {
  requestTypes: Array<{ key: string; label: string }>;
  requirements: Record<string, DocumentRequirement[]>;
};

export type RuntimeConfig = {
  googleClientId: string;
  backendConfigured: boolean;
  environment: string;
};

export type PortalPage = "requests" | "submit" | "detail";
