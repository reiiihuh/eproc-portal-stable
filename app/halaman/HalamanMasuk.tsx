"use client";

import { CircleAlert, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MerekNano } from "../komponen/MerekNano";
import type { PortalUser } from "../tipe/data-portal";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (input: Record<string, unknown>) => void;
          renderButton: (node: HTMLElement, input: Record<string, unknown>) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

function readGoogleIdentity(token: string): PortalUser {
  const normalized = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(normalized);
  const json = decodeURIComponent(
    decoded.split("").map((character) => `%${(`00${character.charCodeAt(0).toString(16)}`).slice(-2)}`).join(""),
  );
  const payload = JSON.parse(json);
  return { email: payload.email, name: payload.name ?? payload.email, picture: payload.picture };
}

export function HalamanMasuk({
  clientId,
  onLogin,
}: {
  clientId: string;
  onLogin: (user: PortalUser, idToken?: string) => void;
}) {
  const button = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(() => typeof window !== "undefined" && Boolean(window.google));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientId) return;
    if (window.google) return;
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => setReady(true), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => setError("Layanan login Google gagal dimuat. Coba refresh halaman.");
    document.head.appendChild(script);
  }, [clientId]);

  useEffect(() => {
    if (!ready || !window.google || !button.current) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response: { credential?: string }) => {
        try {
          if (!response.credential) throw new Error();
          onLogin(readGoogleIdentity(response.credential), response.credential);
        } catch {
          setError("Identitas Google tidak dapat dibaca. Silakan login ulang.");
        }
      },
    });
    button.current.innerHTML = "";
    window.google.accounts.id.renderButton(button.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      logo_alignment: "left",
      width: 360,
    });
  }, [ready, clientId, onLogin]);

  return (
    <main className="login">
      <section className="login-brand">
        <MerekNano inverse />
        <div className="login-copy">
          <span className="eyebrow light"><ShieldCheck size={16} /> Internal procurement portal</span>
          <h1>Portal<br />Pengadaan</h1>
        </div>
        <small>Bank Nano Syariah · IT Procurement</small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">Welcome</span>
          <h2>Masuk untuk melanjutkan</h2>
          <p>Gunakan akun Google kantor atau akun Google lain yang diizinkan.</p>
          <div className="google-button" ref={button} />
          {!clientId && (
            <button className="outline-button" onClick={() => onLogin({ name: "Demo Requester", email: "requester.demo@gmail.com" })}>
              <UserRound size={19} /> Masuk mode demo
            </button>
          )}
          {error && <div className="error"><CircleAlert size={16} />{error}</div>}
          <div className="secure-note">
            <ShieldCheck size={17} />
            <span>Portal dalam pengembangan</span>
          </div>
        </div>
      </section>
    </main>
  );
}
