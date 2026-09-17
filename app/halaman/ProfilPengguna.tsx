"use client";

import { Building2, LoaderCircle, MapPin, Save, UserRound } from "lucide-react";
import { useState } from "react";
import type { PortalUser } from "../tipe/data-portal";
import { MerekNano } from "../komponen/MerekNano";

export function ProfilPengguna({ user, busy, onSave, onLogout }: {
  user: PortalUser;
  busy: boolean;
  onSave: (profile: Pick<PortalUser, "division" | "position" | "location">) => Promise<void>;
  onLogout: () => void;
}) {
  const [division, setDivision] = useState(user.division || "");
  const [position, setPosition] = useState(user.position || "");
  const [location, setLocation] = useState(user.location || "");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!division.trim() || !position.trim() || !location.trim()) {
      setError("Divisi, jabatan, dan lokasi wajib diisi.");
      return;
    }
    setError("");
    try {
      await onSave({ division: division.trim(), position: position.trim(), location: location.trim() });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profil gagal disimpan.");
    }
  }

  return (
    <main className="profile-page">
      <section className="profile-card">
        <MerekNano />
        <div className="profile-heading">
          <span className="profile-icon"><UserRound size={22} /></span>
          <div><span className="eyebrow">Profil requester</span><h1>Lengkapi data diri</h1></div>
        </div>
        <div className="profile-identity"><strong>{user.name}</strong><span>{user.email}</span></div>
        <form onSubmit={submit} className="profile-form">
          <label><span><Building2 size={15} /> Divisi / Group</span><input value={division} onChange={event => setDivision(event.target.value)} placeholder="Contoh: IT Strategy & GRC" autoFocus /></label>
          <label><span><UserRound size={15} /> Jabatan</span><input value={position} onChange={event => setPosition(event.target.value)} placeholder="Contoh: Officer" /></label>
          <label><span><MapPin size={15} /> Lokasi</span><input value={location} onChange={event => setLocation(event.target.value)} placeholder="Contoh: Head Office" /></label>
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} Simpan profil</button>
        </form>
        <button className="profile-logout" onClick={onLogout}>Masuk dengan akun lain</button>
      </section>
    </main>
  );
}
