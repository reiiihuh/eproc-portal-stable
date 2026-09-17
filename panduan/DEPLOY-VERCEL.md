# Deploy Portal ke Vercel

Repository ini tetap memakai Vinext untuk build lokal/Sites. Saat dijalankan di
Vercel, `vercel.json` otomatis memilih build native Next.js agar halaman dan API
route berjalan sebagai Vercel Functions.

## Pengaturan project

1. Import repository di Vercel dan biarkan **Root Directory** di root repository.
2. Vercel akan membaca **Framework Preset: Next.js** dan build command dari
   `vercel.json`. Dependency khusus deployment ini dipasang memakai lockfile npm
   yang sudah ada. Jangan isi Output Directory atau Install Command secara manual.
3. Tambahkan environment variables berikut untuk Preview dan Production:

   - `APPS_SCRIPT_URL`: URL deployment Apps Script yang berakhiran `/exec`.
   - `GOOGLE_CLIENT_ID`: OAuth Client ID Google portal.
   - `PORTAL_ENVIRONMENT`: isi `production`.

4. Deploy project.

Setelah domain Vercel tersedia, tambahkan origin HTTPS tersebut ke **Authorized
JavaScript origins** pada OAuth Client ID Google. Tambahkan domain production
dan setiap domain preview yang memang akan dipakai untuk login.

## Verifikasi setelah deploy

- Halaman login terbuka tanpa error konfigurasi.
- Login Google menampilkan portal.
- Endpoint `/api/config` menampilkan `backendConfigured: true`.
- Daftar request dapat dimuat dan detail request dapat dibuka.
- Upload dokumen sampai 3 MB berhasil. Batas ini menjaga payload base64 tetap di
  bawah batas request Vercel Functions sebesar 4,5 MB.
