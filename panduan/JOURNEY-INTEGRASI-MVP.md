# Journey Integrasi Portal ke Procurement MVP

## Tujuan akhir

Requester bekerja di portal. Procurement bekerja di MVP existing. Apps Script menjadi satu pintu backend dan spreadsheet tetap menjadi database sementara.

```text
Portal requester ─┐
                  ├─> Apps Script ─> PORTAL_* sheets + Google Drive
Procurement MVP ──┘                         │
                                           └─> promote ke MASTER DATABASE PENGADAAN
```

Data portal hanya masuk ke master setelah Procurement menekan **Approve for Process** dan menjalankan promotion. Existing master tetap berjalan seperti sekarang.

## Tahap 0 — Amankan kondisi existing

1. Buat branch Git khusus integrasi.
2. Simpan salinan source dan spreadsheet yang sedang dipakai.
3. Catat header dan posisi header production.
4. Jangan rename, hapus, pindah, atau reorder kolom existing.
5. Jalankan build sebelum mulai agar error lama dan error baru tidak tercampur.

Hasil audit source existing saat ini:

- Batas akses Google Sheets sudah ada di `lib/google-sheets.ts`.
- Normalisasi XLSX dan Google Sheets bertemu di `lib/procurement-data.ts`.
- Bentuk data utama ada di `lib/procurement-types.ts`.
- Banyak tampilan/alur masih berada di `app/procurement-app.tsx`; menu Document Review sebaiknya dibuat sebagai komponen baru, bukan ditumpuk di file ini.
- Adapter existing masih memanggil Google Sheets API dari browser. Untuk migrasi berikutnya, pertahankan perilakunya dulu lalu pindahkan write sensitif secara bertahap ke backend.

## Tahap 1 — Login dan role Procurement

Tambahkan Google Login ke MVP menggunakan Client ID yang sama atau Client ID web khusus MVP.

- Identitas reviewer berasal dari token Google yang diverifikasi backend.
- Browser tidak boleh mengirim nama/role lalu dipercaya begitu saja.
- Role dibaca dari `PORTAL_USERS` atau allowlist backend.
- Role minimal: `REQUESTER`, `PROCUREMENT_REVIEWER`, `PROCUREMENT_ADMIN`.
- User non-Procurement tidak boleh membuka review queue atau melakukan action review.

Jika MVP memakai origin berbeda, tambahkan origin MVP ke **Authorized JavaScript origins** pada OAuth Client ID.

## Tahap 2 — Tambahkan jalur repository portal

Jangan mengganti jalur master yang sudah bekerja. Tambahkan kontrak terpisah, misalnya:

```text
PortalReviewRepository
├── listReviewQueue
├── getRequestDetail
├── startReview
├── reviewDocument
├── requestClarification
├── approveRequest
├── rejectRequest
└── promoteToProcurement
```

Implementasi pertama memakai Apps Script. Nanti adapter yang sama dapat diganti REST/PostgreSQL tanpa mengubah halaman Document Review.

## Tahap 3 — Menu Document Review di MVP

Buat menu baru tanpa mengubah menu/proses procurement existing.

Halaman minimal:

1. Review Queue: request Submitted, Procurement Review, dan Need Clarification.
2. Request Detail: requester, tipe, notes, dokumen, versi, link Drive, timeline.
3. Review per dokumen: `Valid` atau `Revision Required` dengan note.
4. Action request: mulai review, minta klarifikasi, approve, reject.

Reviewer dan timestamp selalu otomatis dari session.

## Tahap 4 — Lengkapi action Apps Script

Tambah action backend berikut ke router yang sama:

| Action | Hasil utama |
|---|---|
| `listReviewQueue` | Daftar request untuk Procurement |
| `startReview` | `SUBMITTED` → `PROCUREMENT_REVIEW` |
| `reviewDocument` | Simpan status dan note per dokumen |
| `requestClarification` | Status → `NEED_CLARIFICATION` |
| `approveRequest` | Status → `APPROVED_FOR_PROCESS` |
| `rejectRequest` | Status → `REJECTED` |
| `promoteToProcurement` | Buat record master dan tautkan kedua ID |

Setiap action wajib memverifikasi role, memakai lock bila menulis beberapa sheet, dan menambahkan log append-only.

## Tahap 5 — Promotion ke master existing

Promotion adalah satu action khusus, bukan copy manual.

1. Pastikan request sudah `APPROVED_FOR_PROCESS`.
2. Pastikan `MASTER_REQUEST_ID` masih kosong agar tidak double insert.
3. Generate ID master melalui mekanisme existing.
4. Append satu record menggunakan pencarian header, bukan nomor kolom tetap.
5. Jangan membuat/reorder header existing saat promotion.
6. Simpan ID master pada `PORTAL_REQUESTS.MASTER_REQUEST_ID`.
7. Simpan status portal menjadi `IN_PROCESS`.
8. Tambahkan event `PROMOTED_TO_PROCUREMENT`.

Mapping awal yang aman:

| Portal | Master existing |
|---|---|
| Requester name | `Nama` |
| Requester email | `Alamat Email User` |
| Request type | `Jenis Permintaan` atau mapping yang disepakati |
| Submitted date | `Tanggal Request` |
| Portal request number | simpan sebagai referensi pada field yang disepakati; jangan menimpa ID master |
| Master request ID | `Nomor Request` |

Field item, budget, vendor, dan PO tetap dilengkapi Procurement di MVP karena portal tidak meminta metadata tersebut.

## Tahap 6 — Sinkronkan progres ke portal

Saat Procurement menyimpan perubahan master, backend memperbarui portal yang memiliki `MASTER_REQUEST_ID` terkait.

| Kondisi master | Status portal |
|---|---|
| Baru dipromote / Upcoming | `IN_PROCESS` |
| Ongoing | `IN_PROCESS` |
| Nomor atau link PO sudah tersedia | `PO_ISSUED` |
| Complete | `COMPLETED` |
| Dropped/Cancelled | `REJECTED` atau status pembatalan yang disepakati |

Simpan `PO_NUMBER`, `PO_URL`, atau email/note pengiriman pada field add-on portal, bukan dengan mengubah kolom master existing. Setiap perubahan menambah `STATUS_CHANGED` ke log.

## Tahap 7 — Template dokumen

Template dikelola Procurement dari MVP atau langsung lewat Drive/Sheet untuk tahap awal.

Rekomendasi akhir:

- MVP menyediakan halaman **Template Portal**.
- File diunggah ke Drive.
- Metadata disimpan di `PORTAL_TEMPLATE_LIBRARY`.
- Portal hanya membaca dan menampilkan link Download Template, Guide, dan Example.

Jangan membuat tombol admin template di requester portal.

## Tahap 8 — Uji sebelum dipakai luas

Uji minimal:

- Dua akun requester hanya melihat request miliknya.
- Akun tanpa role Procurement ditolak dari review action.
- Upload/revisi membuat version baru dan version lama tetap tercatat.
- PQ Vendor tetap opsional.
- Mandatory document menghalangi submit jika kosong.
- Need Clarification dapat berulang.
- Promotion dua kali tidak membuat dua record master.
- Semua action membuat audit log dengan actor dan timestamp.
- Data existing, jumlah row, formula, dan dashboard MVP tidak berubah setelah integrasi.

## Tahap 9 — Siap migrasi database

Saat pindah ke PostgreSQL/MySQL:

- UI tetap memakai repository yang sama.
- Ganti Apps Script adapter dengan REST API adapter.
- Migrasikan immutable ID, document version, status log, config, dan template.
- File tetap di Drive/object storage; database menyimpan metadata saja.
- Browser tidak pernah terhubung langsung ke database.
