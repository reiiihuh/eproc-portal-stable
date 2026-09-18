import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nano Procurement Portal",
  description: "Portal pengajuan dokumen pengadaan Bank Nano Syariah.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
