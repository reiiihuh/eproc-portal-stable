# Mulai Portal di VS Code

## 1. Buka source

1. Extract ZIP.
2. Buka folder `nano-procurement-portal` di VS Code.
3. Pastikan Node.js versi 22 atau lebih baru:

```bash
node --version
```

## 2. Install dan jalankan

```bash
npm install
```

Buat `.env.local` dari contoh yang sudah tersedia.

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS/Linux:

```bash
cp .env.example .env.local
```

Lalu jalankan:

```bash
npm run dev
```

Alamat normalnya `http://localhost:5173`. Ikuti alamat yang ditampilkan terminal jika port berubah.

## 3. Tambahkan localhost ke Google Login

Ya, localhost perlu dimasukkan ke Google Cloud Console untuk OAuth Client ID portal.

Buka **Google Auth Platform → Clients → Web client portal → Authorized JavaScript origins**, lalu pastikan ada:

- `http://localhost:5173`
- `https://nano-eproc-portal.reimitsune.chatgpt.site`

Jika browser dibuka memakai `http://127.0.0.1:5173`, tambahkan origin itu juga. Origin harus persis sama dengan alamat browser: protokol, host, dan port. Jangan menambahkan `/exec`, path halaman, atau trailing slash.

Kolom **Authorized redirect URIs** tidak dibutuhkan untuk tombol Google Identity yang dipakai portal ini.

Perubahan origin kadang perlu beberapa menit sebelum aktif. Setelah mengubahnya, tutup tab portal, jalankan ulang dev server, lalu login kembali.

## 4. Hubungan localhost dengan Apps Script

Hanya tampilan portal yang berjalan di localhost. Data tetap dikirim melalui route server portal ke Apps Script deployment berikut:

```text
https://script.google.com/macros/s/AKfycbyO9M05UfBQEPzz5yL-0Y2V6IkTRCIe0XuLlvTqzDNIh7-qsOidGqxap2a60JXWWw2iNQ/exec
```

Apps Script tetap harus memakai deployment aktif dengan:

- Execute as: `Me`
- Who has access: `Anyone`
- Google Auth Platform: `External` dan `In production` untuk login akun Google mana pun.

## 5. Cek sebelum mulai edit

```bash
node --test tests/*.test.mjs
npm run build
```

Keduanya harus selesai tanpa error.

## 6. File yang tidak boleh dibagikan

Jangan masukkan ke Git atau ZIP:

- `.env.local`
- `node_modules/`
- `dist/`
- `.next/`
- `.wrangler/`

Nilai Google Client ID boleh berada di frontend karena bukan client secret. Jangan pernah menaruh Google Client Secret atau token akun di source.
