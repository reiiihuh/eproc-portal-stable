# Prompt Bertahap untuk Codex di Source Procurement MVP

Gunakan prompt ini satu per satu. Jangan langsung memberikan semua tahap sekaligus. Setelah setiap tahap, review hasil, jalankan test/build, lalu commit sebelum lanjut.

## Prompt 1 — Audit tanpa edit

```text
Pelajari source Procurement MVP ini untuk persiapan integrasi Nano Procurement Portal. Pada tahap ini jangan mengubah file apa pun.

Konteks penting:
- Sheet production existing seperti MASTER DATABASE PENGADAAN, MASTER PIC, VENDOR REKANAN, PENAWARAN VENDOR, dan DOKUMEN PENGADAAN sudah dipakai dan tidak boleh di-rename, dihapus, dipindah, di-reorder, atau diganti headernya.
- Portal memakai sheet add-on PORTAL_REQUESTS, PORTAL_DOCUMENTS, PORTAL_DOCUMENT_VERSIONS, PORTAL_STATUS_LOG, PORTAL_USERS, PORTAL_CONFIG, dan PORTAL_TEMPLATE_LIBRARY.
- Portal dan MVP memakai Apps Script backend yang sama.
- Request portal baru masuk ke master setelah Procurement approve dan promote.

Audit khusus:
1. Petakan semua read/write Google Sheets, terutama lib/google-sheets.ts.
2. Pelajari normalizer di lib/procurement-data.ts dan type di lib/procurement-types.ts.
3. Petakan state/menu/action di app/procurement-app.tsx.
4. Temukan cara MVP menyimpan status, requester, PIC, dokumen, nomor PO, dan link PO.
5. Catat risiko compatibility dan titik integrasi minimal.

Output hanya laporan temuan dan rencana file yang akan ditambah/diubah. Jangan implementasi dulu.
```

## Prompt 2 — Login Procurement dan repository

```text
Implementasikan fondasi login Google dan repository untuk Document Review berdasarkan hasil audit sebelumnya.

Syarat:
- Jangan mengubah perilaku existing dashboard/master/PIC/vendor.
- Jangan mengubah sheet/header production existing.
- Gunakan Google Identity Services, tanpa password lokal.
- Token diverifikasi backend; React tidak boleh dipercaya menentukan email atau role.
- Role Procurement dibaca backend dari PORTAL_USERS atau allowlist config.
- Buat interface PortalReviewRepository dan AppsScriptPortalReviewRepository.
- URL backend dan Google Client ID berasal dari environment/config, bukan hardcode.
- Reviewer identity, email, dan role selalu berasal dari authenticated session.
- Pecah komponen baru ke file yang mudah dibaca; jangan menambah isi besar ke app/procurement-app.tsx.

Action repository yang disiapkan: listReviewQueue, getRequestDetail, startReview, reviewDocument, requestClarification, approveRequest, rejectRequest, promoteToProcurement.

Tambahkan test untuk auth boundary dan mapping response. Jalankan test, typecheck/lint jika tersedia, dan build. Laporkan file yang diubah serta hasil verifikasi.
```

## Prompt 3 — Menu Document Review

```text
Tambahkan menu baru “Document Review” ke Procurement MVP menggunakan PortalReviewRepository yang sudah dibuat.

Fitur:
- Review Queue untuk SUBMITTED, PROCUREMENT_REVIEW, dan NEED_CLARIFICATION.
- Detail request berisi nomor portal, requester, email, divisi, tipe request, notes, dokumen, versi, status review, note, link Drive, dan timeline.
- Reviewer dapat Start Review.
- Per dokumen dapat ditandai Valid atau Revision Required dan diberi note.
- Request dapat Request Clarification, Approve for Process, atau Reject.
- Tombol action mengikuti status yang valid dan memiliki loading/error/success state yang jelas.
- Reviewer tidak pernah mengetik nama/email sendiri.
- UI existing procurement tidak boleh rusak atau berubah perilakunya.

Gunakan file halaman/komponen baru dengan nama yang jelas. Jangan melakukan promotion ke master pada tahap ini. Tambahkan test untuk render/mapping action penting lalu jalankan build.
```

## Prompt 4 — Action review di Apps Script

```text
Lengkapi project Apps Script eproc-mvp backend untuk action Procurement berikut: listReviewQueue, startReview, reviewDocument, requestClarification, approveRequest, dan rejectRequest.

Aturan:
- Pertahankan doGet, doPost, handleRequest_, health, validateSchema, getPortalConfig, dan seluruh action portal requester yang sudah berjalan.
- Jangan membuat doGet/doPost kedua.
- Router harus mencoba tryPortalRoute_ sebelum switch/case legacy yang dapat mencegat action portal.
- Verifikasi Google ID token: signature/audience/expiry/email_verified.
- Verifikasi role Procurement dari PORTAL_USERS; jangan percaya actorEmail/actorRole dari body.
- Terapkan transisi status yang valid.
- Setiap action menambah row append-only ke PORTAL_STATUS_LOG.
- reviewDocument memperbarui REVIEW_STATUS, REVIEW_NOTE, reviewer, dan timestamp.
- Gunakan LockService untuk write yang menyentuh lebih dari satu sheet.
- Jangan membaca/menulis master production pada tahap ini.

Berikan kode final per file dan daftar test URL/action. Jangan memberi pseudocode.
```

## Prompt 5 — Promotion aman ke master

```text
Implementasikan action backend promoteToProcurement dan tombolnya di Procurement MVP.

Wajib:
- Hanya role Procurement yang boleh menjalankan.
- Hanya request APPROVED_FOR_PROCESS yang boleh dipromote.
- Idempotent: jika MASTER_REQUEST_ID sudah ada, jangan append ulang.
- Gunakan LockService.
- Inspect cara existing MVP menentukan row baru dan nomor request; gunakan mekanisme yang sama.
- Append berdasarkan nama header yang ditemukan saat runtime, bukan index kolom hardcode.
- Jangan rename/delete/reorder/menambahkan header ke sheet MASTER DATABASE PENGADAAN secara otomatis.
- Mapping awal: requester name ke Nama, requester email ke Alamat Email User, tanggal submit ke Tanggal Request, dan tipe portal ke field existing yang sudah disepakati dari audit.
- Field procurement yang belum ada dibiarkan untuk Procurement isi di MVP.
- Simpan Nomor Request hasil master ke PORTAL_REQUESTS.MASTER_REQUEST_ID.
- Ubah portal menjadi IN_PROCESS dan append PROMOTED_TO_PROCUREMENT.
- Jika salah satu write gagal, jangan meninggalkan kemungkinan promote kedua membuat duplicate. Tambahkan guard dan laporan rekonsiliasi.

Tambahkan test idempotency dan regression test bahwa parser/dashboard existing tetap menghasilkan hasil yang sama.
```

## Prompt 6 — Sinkron status dan PO

```text
Hubungkan update status procurement existing ke request portal melalui MASTER_REQUEST_ID.

Mapping:
- Upcoming/Ongoing setelah promotion => IN_PROCESS
- Nomor atau link PO tersedia => PO_ISSUED
- Complete => COMPLETED
- Dropped/Cancelled => gunakan mapping pembatalan yang aman dan dokumentasikan

Setiap perubahan harus memperbarui PORTAL_REQUESTS, menambah PORTAL_STATUS_LOG, dan tidak mengubah header/flow existing. Tambahkan field add-on portal untuk PO_NUMBER, PO_URL, dan note/email pengiriman bila header tersebut sudah tersedia pada schema portal; jika belum, buat migration khusus untuk sheet PORTAL_* saja.

Pastikan portal requester dapat melihat status terbaru, link PO, dan timeline setelah refresh. Tambahkan test mapping seluruh status dan build project.
```

## Prompt 7 — Pengelolaan template dari MVP

```text
Tambahkan menu admin “Template Portal” di Procurement MVP.

- Hanya Procurement Admin/Reviewer yang diizinkan backend.
- Upload file ke folder Drive template.
- Simpan metadata ke PORTAL_TEMPLATE_LIBRARY: TEMPLATE_ID, REQUEST_TYPE, DOCUMENT_TYPE, RESOURCE_TYPE, FILE_ID, FILE_URL, ACTIVE, SORT_ORDER, CREATED_AT, CREATED_BY, UPDATED_AT, UPDATED_BY.
- RESOURCE_TYPE: TEMPLATE, GUIDE, atau EXAMPLE.
- Portal requester hanya read/download; tidak memiliki tombol admin.
- Jangan simpan binary di Sheet.
- Semua write mencatat actor dari session.

Tambahkan repository method, halaman terpisah, validation, test, dan build. Jangan sentuh master production.
```

## Prompt 8 — Pemeriksaan akhir

```text
Lakukan regression review penuh setelah integrasi Portal + Procurement MVP.

Jangan menambah fitur. Cari bug, auth bypass, kemungkinan duplicate promotion, race condition, data requester bocor, direct Sheets access baru di komponen, hardcoded production URL, dan perubahan schema existing.

Jalankan seluruh test/build. Bandingkan jumlah record, total PO, total biaya, dashboard, dan parsing workbook sebelum/sesudah perubahan dengan fixture yang sama. Berikan daftar blocker production, risiko tersisa, dan langkah rollback. Perbaiki hanya bug yang terbukti dan masih dalam scope integrasi.
```
