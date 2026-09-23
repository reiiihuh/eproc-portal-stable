# Update Apps Script `eproc-mvp backend`

1. Tambahkan file script baru bernama `BackendPortal`, lalu salin seluruh isi `BackendPortal.gs`.
2. Tambahkan file script baru bernama `RouterPortal`, lalu salin seluruh isi `RouterPortal.gs`.
   Jangan menghapus underscore pada nama function. Hanya `authorizePortalServices` yang sengaja tidak memakai underscore agar tampil di dropdown Run.
3. Buka **Project Settings → Script Properties** dan pastikan tersedia:
   - `GOOGLE_CLIENT_ID` = `19043389330-43lb36q9aa54oiju0pnedhsgrap30292.apps.googleusercontent.com`
   - `PORTAL_ROOT_FOLDER_ID` = ID folder Drive dummy portal.
4. Di fungsi `handleRequest_(request)`, letakkan blok berikut **sebelum `switch (request.action)`**. Posisi ini penting supaya case legacy dengan nama action yang sama tidak mengambil request portal lebih dulu.

```javascript
var portalResult = tryPortalRoute_(request);
if (portalResult) return jsonResponse_(portalResult);
```

Contoh posisi yang benar:

```javascript
function handleRequest_(request) {
  try {
    var portalResult = tryPortalRoute_(request);
    if (portalResult) return jsonResponse_(portalResult);

    switch (request.action) {
      // health, validateSchema, getPortalConfig, dan action existing
    }
  } catch (error) {
    // error handler existing
  }
}
```

5. Pastikan folder `PORTAL_ROOT_FOLDER_ID` dibagikan sebagai **Editor** ke akun yang memiliki deployment Apps Script.
6. Save. Jalankan fungsi `authorizePortalServices` sekali dari editor dan setujui izinnya. Fungsi ini membuat lalu membuang file uji kecil untuk memastikan akses tulis. Execution log harus menampilkan nama spreadsheet, nama folder Drive, `driveWritable: true`, dan `urlFetchAuthorized: true`.
7. **Deploy → Manage deployments → Edit → New version → Deploy**. Pertahankan:
   - Execute as: **Me**
   - Who has access: **Anyone**
8. URL `/exec` tidak perlu diganti selama deployment yang sama diedit.

Pada versi `2026-09-15.1`, keputusan **Approve** langsung menambahkan request ke `MASTER DATABASE PENGADAAN`, menyimpan `MASTER_REQUEST_ID`, dan mengubah status portal menjadi `IN_PROCESS`. Saat antrean review dibuka, request lama yang sudah telanjur berstatus `APPROVED_FOR_PROCESS` juga direkonsiliasi otomatis. Tombol/action promote terpisah tetap tersedia sebagai jalur pemulihan manual.

Nomor request tidak dihapus atau digunakan ulang. Request `REJECTED` dapat diperbaiki dan dikirim ulang dengan nomor yang sama sehingga seluruh riwayat tetap tersambung. Status master `Dropped`/`Cancelled` disinkronkan sebagai `CANCELLED` dan disimpan sebagai histori final.

Backend menerima akun Google mana pun yang menghasilkan ID token untuk OAuth Client ID tersebut. Supaya tidak terbatas ke test user, atur Google Auth Platform Audience sebagai **External** dan publishing status **In production**. Backend tetap memverifikasi token dan hanya mengembalikan request dengan `REQUESTER_EMAIL` yang sama.
