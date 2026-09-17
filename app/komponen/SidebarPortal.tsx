import { LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import Image from "next/image";
import type { PortalPage, PortalUser } from "../tipe/data-portal";
import { MerekNano } from "./MerekNano";

export function SidebarPortal({
  user,
  page,
  open,
  collapsed,
  onClose,
  onToggleCollapsed,
  onNavigate,
  onLogout,
}: {
  user: PortalUser;
  page: PortalPage;
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapsed: () => void;
  onNavigate: (page: "requests" | "submit") => void;
  onLogout: () => void;
}) {
  return (
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="sidebar-top">
        <MerekNano monogram={collapsed} />
        <button className="desktop-collapse" onClick={onToggleCollapsed} aria-label={collapsed ? "Perbesar sidebar" : "Kecilkan sidebar"} title={collapsed ? "Perbesar sidebar" : "Kecilkan sidebar"}>
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </button>
        <button className="mobile-close" onClick={onClose} aria-label="Tutup menu"><X /></button>
      </div>
      <nav>
        <button title={collapsed ? "My Requests" : undefined} className={page === "requests" || page === "detail" ? "active" : ""} onClick={() => onNavigate("requests")}>
          <LayoutDashboard size={19} /><span>My Requests</span>
        </button>
        <button title={collapsed ? "Submit Request" : undefined} className={page === "submit" ? "active" : ""} onClick={() => onNavigate("submit")}>
          <Plus size={19} /><span>Submit Request</span>
        </button>
      </nav>
      <div className="userbox">
        <div className="avatar">{user.picture ? <Image src={user.picture} alt={user.name} width={38} height={38} unoptimized /> : user.name.slice(0, 1)}</div>
        <div className="user-details"><strong>{user.name}</strong><span>{user.email}</span></div>
        <button onClick={onLogout} aria-label="Keluar"><LogOut size={18} /></button>
      </div>
    </aside>
  );
}
