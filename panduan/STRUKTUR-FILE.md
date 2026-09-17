# Struktur File Portal

```text
nano-procurement-portal/
├── app/
│   ├── halaman/
│   │   ├── HalamanMasuk.tsx
│   │   ├── PermintaanSaya.tsx
│   │   ├── AjukanPermintaan.tsx
│   │   └── DetailPermintaan.tsx
│   ├── komponen/
│   │   ├── KerangkaPortal.tsx
│   │   ├── SidebarPortal.tsx
│   │   ├── KartuUnggahDokumen.tsx
│   │   ├── ProgresPermintaan.tsx
│   │   ├── LabelStatus.tsx
│   │   ├── ModalProses.tsx
│   │   ├── LayarPembuka.tsx
│   │   └── MerekNano.tsx
│   ├── layanan/
│   │   ├── akses-backend.ts
│   │   ├── alur-portal.ts
│   │   ├── validasi-dokumen.ts
│   │   └── format-tampilan.ts
│   ├── konfigurasi/
│   │   └── portal-default.ts
│   ├── tipe/
│   │   └── data-portal.ts
│   ├── api/
│   │   ├── apps-script/route.ts
│   │   └── config/route.ts
│   ├── AplikasiPortal.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── apps-script/
│   ├── BackendPortal.gs
│   ├── RouterPortal.gs
│   └── PANDUAN-SETUP.md
├── panduan/
├── public/
├── tests/
├── .env.example
└── package.json
```

## Arti singkatnya

- `halaman`: satu file untuk satu layar utama.
- `komponen`: potongan tampilan yang dipakai ulang, misalnya sidebar dan kartu upload.
- `layanan`: alur kerja dan komunikasi dengan backend; bukan tempat tampilan.
- `konfigurasi`: nilai fallback jika konfigurasi Sheet belum dapat dibaca.
- `tipe`: bentuk data yang dipakai bersama.
- `api`: perantara aman antara browser dan Apps Script. Nama `route.ts` wajib mengikuti framework.
- `apps-script`: source yang ditempel ke project Apps Script.

## Kalau ingin mengubah sesuatu

| Kebutuhan | File utama |
|---|---|
| Logo atau nama brand | `app/komponen/MerekNano.tsx` |
| Sidebar dan header mobile | `app/komponen/KerangkaPortal.tsx`, `SidebarPortal.tsx` |
| Tampilan login | `app/halaman/HalamanMasuk.tsx` |
| Form pengajuan | `app/halaman/AjukanPermintaan.tsx` |
| Kartu upload | `app/komponen/KartuUnggahDokumen.tsx` |
| Detail dan timeline | `app/halaman/DetailPermintaan.tsx`, `ProgresPermintaan.tsx` |
| Warna dan font | `app/globals.css` |
| Login/draft/upload/submit | `app/layanan/alur-portal.ts` |
| Bentuk request ke backend | `app/layanan/akses-backend.ts` |
| Validasi tipe dan ukuran file | `app/layanan/validasi-dokumen.ts` |
| Apps Script portal | `apps-script/BackendPortal.gs` |

Komponen tetap dipisah supaya perubahan satu halaman tidak mudah merusak halaman lain. ZIP hanya tidak membawa folder `node_modules`; source tetap modular dan mudah dibaca.
