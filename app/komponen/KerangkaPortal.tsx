"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import type { PortalPage, PortalUser } from "../tipe/data-portal";
import { MerekNano } from "./MerekNano";
import { SidebarPortal } from "./SidebarPortal";

export function KerangkaPortal({
  user,
  page,
  menuOpen,
  setMenuOpen,
  onNavigate,
  onProfile,
  onLogout,
  children,
}: {
  user: PortalUser;
  page: PortalPage;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  onNavigate: (page: "requests" | "submit") => void;
  onProfile: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <div className={`shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <SidebarPortal
        user={user}
        page={page}
        open={menuOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setMenuOpen(false)}
        onToggleCollapsed={() => setSidebarCollapsed(collapsed => !collapsed)}
        onNavigate={onNavigate}
        onProfile={onProfile}
        onLogout={onLogout}
      />
      <main className="workspace">
        <header className="mobile-header">
          <button onClick={() => setMenuOpen(true)} aria-label="Buka menu"><Menu /></button>
          <MerekNano compact />
        </header>
        {children}
      </main>
      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" />}
    </div>
  );
}
