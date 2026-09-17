# Nano Procurement Portal

Portal requester internal Bank Nano Syariah untuk membuat permintaan pengadaan, mengunggah dokumen, melihat status review, mengganti dokumen saat diminta revisi, dan mengikuti progres sampai selesai.

Portal dan Procurement MVP adalah dua aplikasi berbeda. Keduanya berbagi backend Apps Script dan spreadsheet yang sama, tetapi portal hanya memakai sheet tambahan bernama `PORTAL_*`.

## Jalankan di komputer

Kebutuhan: Node.js 22 atau lebih baru.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Buka alamat yang tampil di terminal, biasanya `http://localhost:5173`.

Di Windows PowerShell, buat file environment dengan:

```powershell
Copy-Item .env.example .env.local
```

## File yang paling sering diubah

- `app/halaman/` — isi setiap halaman portal.
- `app/komponen/` — sidebar, kartu upload, status, modal loading, dan komponen tampilan lain.
- `app/layanan/akses-backend.ts` — komunikasi portal ke Apps Script.
- `app/layanan/alur-portal.ts` — alur login, draft, upload, submit, dan buka detail.
- `app/konfigurasi/portal-default.ts` — fallback konfigurasi dokumen.
- `app/globals.css` — warna, font, dan tampilan umum.
- `apps-script/` — kode add-on untuk project Apps Script `eproc-mvp backend`.
- `panduan/` — setup lokal dan rencana integrasi ke MVP.

File `app/page.tsx`, `app/layout.tsx`, dan folder `app/api/` memakai nama bawaan framework sehingga sebaiknya tidak diganti.

## Dokumen panduan

1. `panduan/MULAI-DI-VSCODE.md`
2. `panduan/STRUKTUR-FILE.md`
3. `panduan/JOURNEY-INTEGRASI-MVP.md`
4. `panduan/PROMPT-CODEX-MVP.md`

## Batas penting

- Jangan rename, hapus, atau reorder sheet/kolom existing seperti `MASTER DATABASE PENGADAAN`, `MASTER PIC`, dan `VENDOR REKANAN`.
- Frontend tidak membaca Google Sheets secara langsung.
- Identitas requester berasal dari Google Login dan diverifikasi ulang oleh server.
- File disimpan di Google Drive; Sheet hanya menyimpan metadata dan link.
- `node_modules`, hasil build, dan `.env.local` tidak disertakan dalam ZIP sumber.
