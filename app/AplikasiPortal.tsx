"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { KerangkaPortal } from "./komponen/KerangkaPortal";
import { LayarPembuka } from "./komponen/LayarPembuka";
import { ModalProses } from "./komponen/ModalProses";
import { AjukanPermintaan } from "./halaman/AjukanPermintaan";
import { DetailPermintaan } from "./halaman/DetailPermintaan";
import { HalamanMasuk } from "./halaman/HalamanMasuk";
import { PermintaanSaya } from "./halaman/PermintaanSaya";
import { useAlurPortal } from "./layanan/alur-portal";

export function AplikasiPortal() {
  const portal = useAlurPortal();

  if (portal.splash) return <LayarPembuka />;
  if (!portal.user) return <HalamanMasuk clientId={portal.runtime.googleClientId} onLogin={portal.login} />;

  return (
    <KerangkaPortal
      user={portal.user}
      page={portal.page}
      menuOpen={portal.menuOpen}
      setMenuOpen={portal.setMenuOpen}
      onNavigate={portal.navigate}
      onLogout={portal.logout}
    >
      <ModalProses open={Boolean(portal.processing)} message={portal.processing} />
      {portal.notice && (
        <div className={`toast ${portal.notice.kind}`}>
          <div>
            {portal.notice.kind === "success" ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}
            <span>{portal.notice.text}</span>
          </div>
          <button onClick={() => portal.setNotice(null)} aria-label="Tutup notifikasi"><X size={17} /></button>
        </div>
      )}
      {portal.page === "requests" && (
        <PermintaanSaya requests={portal.requests} loading={portal.loading} onSubmit={() => portal.navigate("submit")} onOpen={portal.openRequest} />
      )}
      {portal.page === "submit" && (
        <AjukanPermintaan config={portal.config} busy={portal.busy} onSaveDraft={portal.saveDraft} onSubmit={portal.submitNew} />
      )}
      {portal.page === "detail" && portal.selected && (
        <DetailPermintaan request={portal.selected} busy={portal.busy || portal.loading} onBack={() => portal.navigate("requests")} onReplace={portal.replaceDocument} onSubmit={portal.submitExisting} />
      )}
    </KerangkaPortal>
  );
}

