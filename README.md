# CBT MTsN 1 CIAMIS - Computer Based Test

Sistem ujian berbasis komputer (CBT) menggunakan Google Sheets sebagai database utama, Google Apps Script sebagai backend server, dan Redis (Upstash) untuk caching, penjadwalan acak, serta antrean submit yang aman.
> Lisensi: MIT

## ✨ Fitur Utama

- ✅ **Login peserta** – Validasi dari sheet `Siswa` dan `Jadwal` (token, kelas, waktu ujian)
- ✅ **Acak soal & opsi secara konsisten per siswa** – Pola acakan disimpan di Redis dengan TTL sesuai durasi ujian
- ✅ **Penyimpanan jawaban sebagai teks** – Bukan indeks opsi, sehingga tidak tergantung pada urutan opsi
- ✅ **Autosave jawaban tiap 5 soal** – Langsung ke Redis (Upstash) via client-side fetch
- ✅ **Batching submit final** – Data ditampung di Redis queue (`pending_submissions_batch`), ditulis ke sheet secara batch (20 baris) atau oleh trigger periodik (tiap 1 menit)
- ✅ **Penanganan offline/online** – Fallback ke localStorage, sinkronisasi otomatis saat koneksi pulih
- ✅ **Mode layar penuh (fullscreen)** dengan peringatan pelanggaran (tab switch / keluar fullscreen)
- ✅ **Tampilan responsif (mobile-friendly)** – Bootstrap + CSS custom
- ✅ **Admin panel** – Statistik, lihat data, force submit, reset sesi
- ✅ **Load testing built‑in** – Fungsi `testConcurrentSubmitNoDelay()` untuk simulasi 156 siswa

## 📋 Prasyarat

- Akun **Google** (bisa pribadi, tapi sangat disarankan **Google Workspace for Education** untuk kuota lebih besar)
- Form Google dengan Pertanyaannya, saat ini hanya bisa akomodir tipe `MULTIPLE_COICE`. tapi dengan fitur:
   - Stimulan (Ilustrasi Paragraf atau Ilustrasi pada soal misal illustrasi1 untuk soal 6-10) dengan tag `stimulan:id_stimulan` pada description/help text google form;
   - Opsi Gambar dengan tag custom `opsi:link_gambar` (public asset tentunya)
   - Untuk Opsi dan Soal diacak untuk meminimalisir kecurangan dengan data konsisten. sesuai `CACHE:id_form` di redis
- Spreadsheet **Google Sheets** sebagai database
- Akun **Redis** – disarankan [Upstash](https://upstash.com/) (free tier 10.000 command/hari)
- (Opsional) Akun **GitHub** untuk menyimpan kode

### DISCLAIMER 
Script masih dalam tahap pengembangan dan baru final di data konsistensi dan masih perjalanan panjang, Yang penting sabar kalo error kulik lagi aja🤭
jangan lupa fork kalo mau pakai repo! (Star kalo suka) selamat mencoba🙏

## 🗂️ Persiapan Spreadsheet

Buat spreadsheet baru dengan **tiga sheet** (nama case‑sensitive):

### 1. Sheet `Siswa`
| A (username) | B (nama) | C (kelas) |
|--------------|----------|-----------|
| `siswa1`     | `Ahmad`  | `9A`      |
| `siswa2`     | `Budi`   | `9A`      |

### 2. Sheet `Jadwal`
| A (mapel) | B (tanggal) | C (jam)       | D (durasi menit) | E (token)  | F (link Google Form) |
|-----------|-------------|---------------|------------------|------------|----------------------|
| `Matematika` | `02/05/2026` | `08:00:00` | `90`             | `TOKEN123` | `https://.../edit   |

Note: Jangan lupa kasih akses editor untuk `anyone with link`


> Format tanggal di **B** : `dd/MM/yyyy`  
> Format jam di **C**   : `hh:mm:ss a` (AM/PM) **atau** `HH:mm:ss` (24 jam)

### 3. Sheet `Jawaban` (akan dibuat otomatis oleh sistem)
Berisi kolom:
- `Timestamp`, `Nama`, `Kelas`, `Mapel`, `Skor`, `Jawaban (JSON)`, `Pelanggaran`, `Username`, `LoginVia`

### 4. (Opsional) Sheet `JawabanSementara`
Digunakan untuk migrasi data lama. Tidak wajib.

## ☁️ Setup Redis (Upstash)

1. Daftar di [Upstash](https://upstash.com) (bisa pakai akun GitHub).
2. Buat database Redis dengan pilihan **Global** (bebas) dan **Eviction = noeviction** (biar data tidak hilang sebelum waktunya).
3. Salin **endpoint** (misal `https://dear-monarch-83839.upstash.io`) dan **token** (misal `gQAAAAAAAUd_...`).
4. Simpan kedua nilai tersebut untuk digunakan di **Properties** Apps Script nanti.

## 🧩 Menyiapkan Google Apps Script

1. Buka spreadsheet Anda → **Extensions** → **Apps Script**.
2. Hapus kode default, lalu salin seluruh kode dari file **server** (Code.gs) yang sudah Anda buat.
3. Simpan proyek dengan nama, misal `CBT_Server`.
4. Buka **Project Settings** → **Script Properties** → **Add Property**:
   - `REDIS_ENDPOINT` = endpoint Upstash
   - `REDIS_TOKEN` = token Upstash
   - (Opsional) `ADMIN_PASSWORD` = password untuk halaman admin (default `admin123` jika tidak diisi)

### Fungsi yang harus dijalankan sekali (setup)

- Jalankan fungsi `setupPeriodicFlush()` dari editor (pilih fungsi → Run). Fungsi ini membuat **trigger waktu** setiap 1 menit untuk memastikan antrean submit tetap dikosongkan. (tanpa trigger, data hanya akan tertulis jika antrean mencapai `BATCH_SIZE` = 20)
- (Opsional) Untuk testing beban, Anda bisa menjalankan `testConcurrentSubmitNoDelay()` – **gunakan spreadsheet duplikat**, bukan produksi.

## 🌐 Deploy Web App (Client)

1. Di editor Apps Script, klik **Deploy** → **New deployment**.
2. Pilih **Web app**.
3. Isi:
   - **Execute as** = `Me` (pemilik script)
   - **Who has access** = `Anyone` (jika ujian via internet) atau `Anyone with link` (jika internal sekolah)
4. Klik **Deploy**, otorisasi jika diminta.
5. Salin URL web app (misal `https://script.google.com/macros/s/.../exec`).
6. Buat file HTML baru di proyek Apps Script dengan nama **`Index`** (case‑sensitive). Salin seluruh kode **client** ke dalam file tersebut.
7. Klik **Deploy** lagi untuk memperbarui deployment.
8. Buka URL web app – Anda akan melihat halaman login CBT.

## 📂 Struktur Kode (Penjelasan Singkat)

| File            | Isi                                                                                                 |
|-----------------|-----------------------------------------------------------------------------------------------------|
| **Code.gs**     | Semua fungsi server: `cekLogin`, `simpanKeDatabaseFinal`, `addToWriteQueue`, `flushWriteQueue`, `setupPeriodicFlush`, admin functions, load test. |
| **Index.html**  | Tampilan antarmuka pengguna (login, ujian, timer, navigasi soal) + client‑side logic (Redis via fetch, autosave, offline handling, markdown). |
| **Admin.html** (opsional) | (Belum disertakan dalam kode di atas, bisa dibuat terpisah)                                       |

## 🧠 Arsitektur & Alur Data

1. **Login**  
   Client → `google.script.run.cekLogin()` → Server validasi dari sheet Siswa & Jadwal.  
   Server membaca `shuffle:token:username` dari Redis; jika tidak ada, buat pola acakan & simpan dengan TTL `(sisaWaktu + 3600)` detik.  
   Server mengembalikan soal yang sudah diacak, kunci, dan stimulus.

2. **Menjawab**  
   Client menyimpan jawaban (teks) ke `jawUser`. Setiap jawaban disimpan ke localStorage. Setiap **5 jawaban** → memanggil `saveAllJawaban()` → mengirim `HSET` langsung ke Redis (client‑side fetch, **bukan** melalui GAS).  
   Jika offline, `saveAllJawaban` yang sudah di‑override hanya menyimpan ke localStorage dan menandai `pendingSync`.  
   Saat koneksi pulih, event `online` memicu sinkronisasi ulang.

3. **Submit Final**  
   `kirimJawaban()` → `saveAllJawaban()` (terakhir) → hitung skor lokal → kirim payload ke `google.script.run.simpanKeDatabaseFinal(payload)`.  
   Server hanya menghitung skor (validasi ulang) → menambahkan `skorFinal` ke payload → `addToWriteQueue(payload)` → `RPUSH` ke Redis key `pending_submissions_batch`.  
   Jika antrean panjang >= `BATCH_SIZE` (20), server langsung memanggil `flushWriteQueue()`.  
   `flushWriteQueue` mengambil semua item dengan `LPOP` lalu menulis batch ke sheet (1 operasi tulis untuk 20 baris).  
   Trigger periodik (setiap 1 menit) memanggil `flushWriteQueue` untuk memastikan sisa data < 20 tetap tersimpan.

4. **Admin**  
   (Untuk keperluan monitoring & force submit, bisa diakses via `?page=admin` – Anda perlu membuat file `Admin.html` terpisah.)

## 🔐 Keamanan & Kuota

- **Google Workspace (Consumer free)** :  
  - 20.000 panggilan URL Fetch per hari (tidak relevan karena fetch ke Redis dari client).  
  - 20.000 eksekusi script per hari.  
  - 30 eksekusi simultan.  
  - **Untuk 156 siswa, total request ke GAS hanya ≈ 320 → aman**.
- **Redis (Upstash free tier)** :  
  - 10.000 command per hari.  
  - Estimasi untuk 500 siswa ≈ 7.600 command → **aman**.  
  - Jika siswa > 550, pertimbangkan upgrade ke tier Pro.
- **Google Sheets** :  
  - 60 operasi tulis per menit.  
  - Dengan batching (20 baris per tulis) untuk 500 siswa hanya ~25 operasi tulis → **aman**.

`**Catatan:**`
Ini untuk satu kali attempt/sesi dengan durasi 60-90 menit ya🤭

untuk hal lainnya bisa disesuaikan dengan resikonya masing-masing, seperti autosave default (10 Menit Sekali) dan bisa dimatikan karena sudah ada localStorage backup, tapi antisipasi localStorage siswa penuh dan disk habis itu membuat corrupt data namun bisa jadi opsi untuk menekan request.

atau seperti penyesuaian auto-save untuk 5 soal bisa di toleran sampai 10-20 soal tapi siswa otomatis akan melakukan simpan data terakhir setelah mencapai progres pengerjaan dan akan menghilangkan progres yang sedang on-going😊

yah dengan pertimbangan penyesuaian bisa diatur.

## ⚙️ Konfigurasi yang Dapat Disesuaikan

| Parameter           | Lokasi                         | Keterangan                                                                 |
|---------------------|--------------------------------|----------------------------------------------------------------------------|
| `BATCH_SIZE`        | Server: `const BATCH_SIZE = 20`| Jumlah submit sebelum antrean di-flush otomatis.                           |
| `TOLERANSI_DETIK`   | Client: `const TOLERANSI_DETIK = 3` | Detik toleransi saat pindah tab sebelum dicatat sebagai pelanggaran.       |
| `autoSaveInterval`  | Client: `600000` (10 menit)    | Autosave periodik ke Redis (selain autosave kelipatan 5 soal).             |
| TTL Shuffle         | Server `ttlShuffle = sisaWaktuServer + 3600` | Pola acakan berlaku hingga 1 jam setelah ujian selesai.                    |
| TTL `done:mapel:username` | Client `86400` (1 hari)  | Mencegah siswa login ulang setelah ujian.                                  |

## 🧪 Load Testing

Fungsi built‑in di server (gunakan di spreadsheet **copy**):

```javascript
// Uji 156 submit paralel penuh (tanpa jeda)
testConcurrentSubmitNoDelay()
