"use client";

import { BriefcaseBusiness, Building2, LoaderCircle, Mail, MapPin, Pencil, Save, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PortalUser } from "../tipe/data-portal";

export function ModalProfil({ user, busy, onClose, onSave }: {
  user: PortalUser;
  busy: boolean;
  onClose: () => void;
  onSave: (profile: Pick<PortalUser, "division" | "position" | "location">) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [division, setDivision] = useState(user.division || "");
  const [position, setPosition] = useState(user.position || "");
  const [location, setLocation] = useState(user.location || "");
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, onClose]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!division.trim() || !position.trim() || !location.trim()) return setError("Semua metadata wajib diisi.");
    setError("");
    try {
      await onSave({ division: division.trim(), position: position.trim(), location: location.trim() });
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profil gagal disimpan.");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="profile-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" onMouseDown={onClose}>
      <section className="profile-modal" onMouseDown={event => event.stopPropagation()}>
        <header><div><span className="eyebrow">MASTER PIC</span><h2 id="profile-modal-title">Detail Profil</h2></div><button onClick={onClose} aria-label="Tutup profil"><X size={19} /></button></header>
        <div className="profile-modal-person"><span><UserRound size={23} /></span><div><strong>{user.name}</strong><small>{user.masterPicId || "PIC terdaftar"}</small></div></div>
        {editing ? (
          <form className="profile-form" onSubmit={save}>
            <label><span><Building2 size={15} /> Divisi / Group</span><input value={division} onChange={event => setDivision(event.target.value)} /></label>
            <label><span><BriefcaseBusiness size={15} /> Jabatan</span><input value={position} onChange={event => setPosition(event.target.value)} /></label>
            <label><span><MapPin size={15} /> Lokasi</span><input value={location} onChange={event => setLocation(event.target.value)} /></label>
            {error && <div className="error">{error}</div>}
            <div className="profile-modal-actions"><button type="button" className="secondary" onClick={() => setEditing(false)}>Batal</button><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} Simpan</button></div>
          </form>
        ) : (
          <><dl className="profile-details"><div><dt><Mail size={15} /> Email</dt><dd>{user.email}</dd></div><div><dt><Building2 size={15} /> Divisi</dt><dd>{user.division || "—"}</dd></div><div><dt><BriefcaseBusiness size={15} /> Jabatan</dt><dd>{user.position || "—"}</dd></div><div><dt><MapPin size={15} /> Lokasi</dt><dd>{user.location || "—"}</dd></div></dl><button className="primary profile-edit" onClick={() => setEditing(true)}><Pencil size={17} /> Edit profil</button></>
        )}
      </section>
    </div>,
    document.body,
  );
}
