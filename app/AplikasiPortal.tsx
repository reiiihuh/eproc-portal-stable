"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { useState } from "react";
import { KerangkaPortal } from "./komponen/KerangkaPortal";
import { LayarPembuka } from "./komponen/LayarPembuka";
import { ModalProses } from "./komponen/ModalProses";
import { ModalProfil } from "./komponen/ModalProfil";
import { AjukanPermintaan } from "./halaman/AjukanPermintaan";
import { DetailPermintaan } from "./halaman/DetailPermintaan";
import { HalamanMasuk } from "./halaman/HalamanMasuk";
import { PermintaanSaya } from "./halaman/PermintaanSaya";
import { ProfilPengguna } from "./halaman/ProfilPengguna";
import { useAlurPortal } from "./layanan/alur-portal";

export function AplikasiPortal() {
  const portal = useAlurPortal();
  const [profileOpen, setProfileOpen] = useState(false);

  if (portal.splash) return <LayarPembuka />;
  if (!portal.user) return <HalamanMasuk clientId={portal.runtime.googleClientId} onLogin={portal.login} />;
  if (!portal.profileChecked) return <LayarPembuka />;
  if (portal.runtime.backendConfigured && !portal.user.profileComplete) {
    return <ProfilPengguna user={portal.user} busy={portal.busy} onSave={portal.saveProfile} onLogout={portal.logout} />;
  }

  return (
    <KerangkaPortal
      user={portal.user}
      page={portal.page}
      menuOpen={portal.menuOpen}
      setMenuOpen={portal.setMenuOpen}
      onNavigate={portal.navigate}
      onProfile={() => setProfileOpen(true)}
      onLogout={portal.logout}
    >
      <ModalProses open={Boolean(portal.processing)} message={portal.processing} />
      {profileOpen && <ModalProfil user={portal.user} busy={portal.busy} onClose={() => setProfileOpen(false)} onSave={portal.saveProfile} />}
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
