import { RefreshCw } from "lucide-react";

export function ModalProses({ open, message }: { open: boolean; message: string }) {
  if (!open) return null;
  return (
    <div className="processing-backdrop" role="dialog" aria-modal="true" aria-live="polite">
      <div className="processing-modal">
        <div className="processing-spinner"><RefreshCw size={25} /></div>
        <h2>Mohon tunggu</h2>
        <p>{message}</p>
      </div>
    </div>
  );
}

