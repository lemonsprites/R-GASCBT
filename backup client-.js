<!DOCTYPE html>
<html lang="id">

<head>
  <base target="_top">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link
    href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap"
    rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">
  <style>
    :root {
      --primary-color: #0d47a1;
      --accent-color: #ffca28;
    }

    body {
      background-color: #f8f9fa;
      font-family: "Noto Sans", sans-serif;
    }

    /* Navbar Style */
    .navbar-cbt {
      background: var(--primary-color);
      border-bottom: 5px solid var(--accent-color);
      color: white;
    }

    /* Login Card */
    .login-container {
      max-width: 450px;
      margin-top: 80px;
    }

    .card-login {
      border: none;
      border-radius: 15px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    }

    /* Exam Style */
    .q-card {
      border: none;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
      background: white;
    }

    .btn-nomor {
      width: 45px;
      height: 45px;
      margin: 4px;
      font-weight: bold;
      border-radius: 8px;
    }

    .status-yakin {
      background-color: #0d6efd !important;
      color: white;
      border: none;
    }

    .status-ragu {
      background-color: #ffc107 !important;
      color: black;
      border: none;
    }

    .active-now {
      border: 3px solid #333 !important;
    }

    /* Option Boxes */
    .opt-box {
      cursor: pointer;
      border: 1px solid #dee2e6;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 10px;
      transition: 0.3s;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .opt-box:hover {
      background-color: #f1f3f5;
    }

    .opt-selected {
      background-color: #e3f2fd;
      border-color: #0d6efd;
      font-weight: 500;
    }

    /* Image Styles */
    .gambar-pertanyaan {
      max-width: 100%;
      height: auto;
      margin: 15px 0;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .gambar-opsi {
      width: 120px;
      height: 120px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #dee2e6;
      flex-shrink: 0;
    }

    .teks-opsi {
      align-items: center;
      flex: 1;
    }

    .opsi-badge {
      display: inline-block;
      font-weight: bold;
      margin-right: 8px;
      color: #0d6efd;
    }

    /* Utility */
    .d-none {
      display: none !important;
    }

    #timer-display {
      font-weight: bold;
      font-size: 1.2rem;
      color: #d32f2f;
      background: white;
      padding: 5px 15px;
      border-radius: 30px;
    }

    /* RTL Support untuk Arabic - DIPERBAIKI */
    .rtl-text {
      direction: rtl;
      text-align: right;
      font-family: 'Amiri', 'Noto Sans', sans-serif;
      font-size: 1.8rem !important;
      /* Ukuran normal, bisa disesuaikan */
      line-height: 1.8;
    }

    .rtl-opt {
      direction: rtl;
      text-align: right;
    }

    .rtl-opt .teks-opsi {
      font-family: 'Amiri', 'Noto Sans', sans-serif;
      font-size: 1.6rem !important;
    }

    .opt-box.rtl-opt .opsi-badge {
      float: left;
      margin-right: 0;
      margin-left: 8px;
    }

    /* Tambahan untuk tampilan Arab yang lebih baik */
    [dir="rtl"] {
      letter-spacing: normal;
    }

    [dir="rtl"] .teks-opsi {
      text-align: right;
    }

    /* Arabic text styling - DIPERBAIKI */
    .arabic-text {
      font-family: 'Amiri', 'Noto Sans', sans-serif;
      font-size: 1rem;
      line-height: 1.8;
      word-break: break-word;
    }

    /* Nomor opsi di RTL */
    .rtl-opt .opsi-badge {
      order: 2;
    }

    .rtl-opt .teks-opsi {
      order: 1;
      flex: 1;
    }

    .rtl-opt .gambar-opsi {
      order: 0;
    }

    /* Kustomisasi ukuran font Arabic - Gunakan class ini jika perlu */
    .arabic-large {
      font-size: 2rem !important
    }

    .arabic-small {
      font-size: 0.9rem !important;
    }

    /* Highlight / Mark style */
    .highlight {
      background-color: #ffeb3b;
      color: #000;
      padding: 0 4px;
      border-radius: 4px;
      font-weight: 500;
    }

    /* Untuk mode gelap / dark mode jika diperlukan */
    @media (prefers-color-scheme: dark) {
      .highlight {
        background-color: #ffc107;
        color: #1a1a1a;
      }
    }

    /* Arabic text dengan highlight */
    .rtl-text .highlight {
      display: inline-block;
      padding: 0 4px;
    }

    /* Baris Arab (RTL) */
    .arabic-line {
      direction: rtl;
      text-align: right;
      font-family: 'Amiri', 'Traditional Arabic', 'Noto Sans Arabic', 'Tahoma', sans-serif;
      font-size: 1.8rem;
      line-height: 1.8;
      margin-bottom: 0.75rem;
    }

    /* Baris Latin (LTR) */
    .latin-line {
      direction: ltr;
      text-align: left;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin-bottom: 0.5rem;
    }

    /* Opsi yang mengandung Arab */
    .rtl-opt {
      direction: rtl;
      text-align: right;
    }

    .rtl-opt .opsi-badge {
      float: left;
      margin-left: 8px;
      margin-right: 0;
    }

    .opt-box {
      transition: all 0.3s ease;
      justify-content: flex-start;
    }

    /* Spasi antar baris */
    #area-soal .arabic-line:last-child,
    #area-soal .latin-line:last-child {
      margin-bottom: 0;
    }
  </style>
</head>

<body>

  <nav class="navbar navbar-cbt shadow sticky-top mb-4">
    <div class="container d-flex justify-content-between align-items-center">
      <span class="navbar-brand h4 m-0 fw-bold text-white"><i class="bi bi-mortarboard-fill me-2"></i>CBT MTsN 1
        CIAMIS</span>
      <div id="wrapper-timer" class="d-none">
        <span id="timer-display">00:00:00</span>
      </div>
    </div>
  </nav>

  <div class="container">

    <!-- Bagian form login yang berubah -->
    <div id="view-login" class="login-container mx-auto">
      <div class="card card-login p-4">
        <h4 class="text-center fw-bold mb-4 text-primary">LOGIN PESERTA</h4>

        <div class="mb-3">
          <label class="form-label small fw-bold text-muted">USERNAME ATAU NAMA</label>
          <input type="text" id="in-user" class="form-control form-control-lg fs-6"
            placeholder="Masukkan Username atau Nama Lengkap">
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold text-muted">KELAS</label>
          <select id="in-kelas" class="form-select form-control-lg fs-6">
            <option value="" disabled selected>-- Pilih Kelas --</option>
            <option value="9A">Kelas 9A</option>
            <option value="9B">Kelas 9B</option>
            <option value="9C">Kelas 9C</option>
            <option value="9D">Kelas 9D</option>
            <option value="9E">Kelas 9E</option>
            <option value="9F">Kelas 9F</option>
          </select>
        </div>

        <div class="mb-4">
          <label class="form-label small fw-bold text-danger">TOKEN</label>
          <input type="text" id="in-token" class="form-control form-control-lg text-center fw-bold"
            placeholder="MASUKKAN TOKEN">
        </div>

        <button class="btn btn-primary w-100 py-3 fw-bold shadow" onclick="mulaiProses()">MULAI UJIAN</button>
      </div>
    </div>

    <div id="view-exam" class="row d-none">
      <div class="col-lg-8 mb-4">
        <div class="q-card p-4">
          <div class="d-flex justify-content-between border-bottom pb-3 mb-4">
            <span id="txt-mapel" class="badge bg-secondary p-2">MAPEL</span>
            <span id="txt-no" class="fw-bold text-primary">SOAL NOMOR 1</span>
          </div>

          <div id="area-soal" class="mb-5" style="min-height: 250px;">
          </div>

          <div class="row g-2 text-center border-top pt-4">
            <div class="col-4"><button class="btn btn-outline-dark w-100 py-2" onclick="move(-1)">KEMBALI</button></div>
            <div class="col-4">
              <button id="btn-ragu" class="btn btn-warning w-100 py-2 fw-bold" onclick="setRagu()">RAGU-RAGU</button>
            </div>
            <div class="col-4"><button class="btn btn-primary w-100 py-2 fw-bold" onclick="move(1)">LANJUT</button>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-4">
        <div class="q-card p-3">
          <h6 class="fw-bold mb-3"><i class="bi bi-grid-3x3-gap-fill me-2"></i>NOMOR SOAL</h6>
          <div id="area-nav" class="d-flex flex-wrap justify-content-center mb-4">
          </div>
          <hr>
          <div id="info-lock" class="text-center mb-2 small text-danger fw-bold"></div>
          <button id="btn-selesai" class="btn btn-danger w-100 fw-bold py-2 shadow-sm" disabled
            onclick="konfirmasiSelesai()">SELESAI UJIAN</button>
        </div>
      </div>
    </div>

  </div>

  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <script>
    let quest = [], kunci = {}, jawUser = {}, ragu = {}, info = {};
    let idx = 0, sisa = 0, statusUjian = "OFF";
    let pelanggaran = 0;
    let currentToken = '', currentNama = '', currentKelas = '', currentMapel = '';
    let syncQueue = [], retryInterval = null, timerInterval = null, lastSavedTime = null;
    let isSubmitting = false;

    window.onblur = () => {
      if (statusUjian === "AKTIF") {
        pelanggaran++;
        if (pelanggaran === 1) Swal.fire('Peringatan 1', 'Jangan pindah tab atau membuka aplikasi lain!', 'warning');
        else if (pelanggaran === 2) Swal.fire('Peringatan 2', 'Sekali lagi melanggar, ujian akan otomatis dikirim!', 'error');
        else if (pelanggaran >= 3) {
          // Jangan ubah statusUjian di sini, biarkan kirimJawaban yang menentukan
          Swal.fire('Diskualifikasi', 'Anda melanggar 3 kali. Jawaban dikirim otomatis.', 'error').then(() => kirimJawaban());
        }
      }
    };

    function mulaiProses() {
      const userInput = document.getElementById('in-user').value;
      const k = document.getElementById('in-kelas').value;
      const t = document.getElementById('in-token').value;

      if (!userInput || !k || !t) return Swal.fire('Error', 'Lengkapi Username/Nama, Kelas, dan Token!', 'error');

      currentToken = t;
      currentInputUser = userInput;
      currentKelas = k;

      Swal.fire({ title: 'Menyiapkan Soal...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      google.script.run.withSuccessHandler(res => {
        if (res.status === "success") {
          quest = res.soal;
          kunci = res.kunci;
          currentMapel = res.mapel;
          currentUsername = res.username;
          currentNama = res.namaSiswa;
          currentLoginVia = res.loginVia;

          // Tampilkan info login via apa
          Swal.fire({
            title: 'Login Berhasil!',
            html: `Login via: <strong>${res.loginVia}</strong><br>Nama: ${res.namaSiswa}<br>Mapel: ${res.mapel}`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          });

          jawUser = res.jawabanTersimpan || {};
          sisa = res.sisaWaktuServer;

          if (sisa <= 0) {
            Swal.fire('Waktu Habis', 'Anda tidak dapat mengikuti ujian karena waktu telah habis.', 'error').then(() => location.reload());
            return;
          }

          statusUjian = "AKTIF";
          document.getElementById('view-login').classList.add('d-none');
          document.getElementById('view-exam').classList.remove('d-none');
          document.getElementById('wrapper-timer').classList.remove('d-none');
          document.getElementById('txt-mapel').innerText = res.mapel;
          showQuest();
          showNav();
          startTimer();
          Swal.close();
        } else {
          Swal.fire('Gagal', res.pesan, 'error');
        }
      }).cekLogin(t, userInput, k);
    }

    function showQuest() {
      const s = quest[idx];
      if (!s) return;
      document.getElementById('txt-no').innerHTML = `SOAL NOMOR ${idx + 1}`;
      const lines = s.pertanyaan.split(/\r?\n/);
      let pertanyaanHtml = '';
      lines.forEach(line => {
        line = line.trim();
        if (line === '') return;
        const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(line);
        const dir = hasArabic ? 'rtl' : 'ltr';
        const className = hasArabic ? 'arabic-line' : 'latin-line';
        pertanyaanHtml += `<div class="${className}" dir="${dir}">${formatMarkdownInline(line)}</div>`;
      });
      let html = `<div class="fs-5 mb-4 fw-medium">${pertanyaanHtml}</div>`;
      if (s.gambarPertanyaan) html += `<div class="text-center mb-3"><img src="${s.gambarPertanyaan}" class="gambar-pertanyaan" onerror="this.style.display='none'" alt="Gambar soal"></div>`;
      if (s.opsi && s.opsi.length > 0) {
        s.opsi.forEach((opsi, optIndex) => {
          const optKey = `${s.id}_${optIndex}`;
          const isSelected = jawUser[s.id] === optKey;
          const optionLetter = String.fromCharCode(65 + optIndex);
          const hasArabicOpt = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(opsi.text);
          const optDir = hasArabicOpt ? 'rtl' : 'ltr';
          const optClass = hasArabicOpt ? 'rtl-opt' : '';
          html += `<div class="opt-box ${isSelected ? 'opt-selected' : ''} ${optClass}" onclick="pilih('${s.id}', '${optKey}', '${escapeHtml(opsi.text)}')" dir="${optDir}">
          <div class="opsi-badge">${optionLetter}.</div>`;
          if (opsi.imageUrl) html += `<img src="${opsi.imageUrl}" class="gambar-opsi" onerror="this.style.display='none'" alt="Gambar opsi">`;
          html += `<div class="teks-opsi">${formatMarkdownInline(opsi.text || `Pilihan ${optionLetter}`)}</div>`;
          if (isSelected) html += `<i class="bi bi-check-circle-fill text-primary fs-5"></i>`;
          html += `</div>`;
        });
      } else html += '<p class="text-muted">Tidak ada opsi jawaban</p>';
      document.getElementById('area-soal').innerHTML = html;
    }

    function formatMarkdownInline(text) {
      if (!text) return '';
      let html = escapeHtml(text);
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/__(.*?)__/g, '<strong>$1</strong>');
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/_(.*?)_/g, '<em>$1</em>');
      html = html.replace(/==(.*?)==/g, '<mark class="highlight">$1</mark>');
      html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
      html = html.replace(/\+\+(.*?)\+\+/g, '<u>$1</u>');
      html = html.replace(/`(.*?)`/g, '<code>$1</code>');
      return html;
    }

    function pilih(soalId, optKey, optText) {
      jawUser[soalId] = optKey;
      delete ragu[soalId];
      showQuest(); showNav();
      simpanJawabanKeServer(soalId, optKey);
    }

    function simpanJawabanKeServer(soalId, jawaban) {
      if (!currentToken || !currentUsername) return;
      google.script.run.withFailureHandler(err => {
        console.error(err);
        syncQueue.push({ soalId, jawaban });
        scheduleRetry();
      }).simpanJawabanSementara(currentToken, currentUsername, currentNama, currentKelas, currentMapel, soalId, jawaban);
    }

    function scheduleRetry() {
      if (retryInterval) return;
      retryInterval = setInterval(() => {
        if (syncQueue.length === 0) { clearInterval(retryInterval); retryInterval = null; return; }
        const item = syncQueue.shift();
        google.script.run.simpanJawabanSementara(currentToken, currentNama, currentKelas, currentMapel, item.soalId, item.jawaban);
      }, 5000);
    }

    function setRagu() {
      const currentSoal = quest[idx];
      if (!currentSoal) return;
      const id = currentSoal.id;
      if (!jawUser[id]) return Swal.fire('Info', 'Pilih jawaban dulu sebelum memberi tanda ragu-ragu', 'info');
      ragu[id] = !ragu[id];
      showNav();
      Swal.fire('Info', `Soal ${idx + 1} ${ragu[id] ? 'ditandai ragu-ragu' : 'tidak ragu lagi'}`, 'info', 1000);
    }

    function showNav() {
      let h = '';
      quest.forEach((s, i) => {
        let cls = 'btn-outline-secondary';
        if (ragu[s.id]) cls = 'status-ragu';
        else if (jawUser[s.id]) cls = 'status-yakin';
        let act = i === idx ? 'active-now' : '';
        h += `<button class="btn btn-nomor ${cls} ${act}" onclick="idx=${i};showQuest();showNav()">${i + 1}</button>`;
      });
      document.getElementById('area-nav').innerHTML = h;
      const terjawab = Object.keys(jawUser).length;
      document.getElementById('info-lock').innerHTML = `<i class="bi bi-check-circle"></i> Terjawab: ${terjawab}/${quest.length}`;
    }

    function move(n) {
      if (idx + n >= 0 && idx + n < quest.length) {
        idx += n; showQuest(); showNav();
        simpanSisaWaktuKeServer(sisa);
      }
    }

    function startTimer() {
      if (timerInterval) clearInterval(timerInterval);
      if (sisa <= 0) {
        kirimJawaban();
        return;
      }
      const display = document.getElementById('timer-display');
      const infoLock = document.getElementById('info-lock');
      const btnSelesai = document.getElementById('btn-selesai');
      timerInterval = setInterval(() => {
        if (statusUjian !== "AKTIF") { clearInterval(timerInterval); return; }
        if (sisa <= 0) { clearInterval(timerInterval); kirimJawaban(); return; }
        sisa--;
        let h = Math.floor(sisa / 3600), m = Math.floor((sisa % 3600) / 60), s = sisa % 60;
        display.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (sisa > 600) {
          let sisaKunci = sisa - 600;
          let mk = Math.floor(sisaKunci / 60), sk = sisaKunci % 60;
          infoLock.innerHTML = `<i class="bi bi-lock-fill"></i> Selesai aktif dalam: ${mk}:${sk.toString().padStart(2, '0')}`;
          infoLock.classList.add('text-danger'); infoLock.classList.remove('text-success');
          btnSelesai.disabled = true;
        } else {
          infoLock.innerHTML = `<i class="bi bi-unlock-fill"></i> Tombol Selesai Terbuka`;
          infoLock.classList.remove('text-danger'); infoLock.classList.add('text-success');
          btnSelesai.disabled = false;
        }
        const now = Date.now();
        if (!lastSavedTime || (now - lastSavedTime) >= 10000) {
          lastSavedTime = now;
          simpanSisaWaktuKeServer(sisa);
        }
      }, 1000);
    }

    function simpanSisaWaktuKeServer(sisaWaktu) {
      if (!currentToken || !currentUsername) return;
      google.script.run.withFailureHandler(err => console.error('Gagal simpan sisa waktu:', err))
        .simpanSisaWaktu(currentToken, currentUsername, currentKelas, currentMapel, sisaWaktu);
    }

    function konfirmasiSelesai() {
      if (isSubmitting) return;
      const raguCount = Object.keys(ragu).filter(id => ragu[id] === true).length;
      if (raguCount > 0) return Swal.fire('Peringatan', `Masih ada ${raguCount} soal yang ditandai RAGU-RAGU (kuning)!`, 'warning');
      const belumTerjawab = quest.filter(s => !jawUser[s.id]).length;
      if (belumTerjawab > 0) return Swal.fire('Peringatan', `Masih ada ${belumTerjawab} soal yang belum dijawab!`, 'warning');
      Swal.fire({ title: 'Akhiri Ujian?', text: "Jawaban yang sudah dikirim tidak bisa diubah.", icon: 'question', showCancelButton: true, confirmButtonText: 'Ya, Kirim!', cancelButtonText: 'Batal' })
        .then(res => { if (res.isConfirmed) kirimJawaban(); });
    }

    // Fungsi kirimJawaban yang diperbaiki
    function kirimJawaban() {
      if (statusUjian !== "AKTIF" || isSubmitting) return;
      isSubmitting = true;
      statusUjian = "SELESAI";
      if (timerInterval) clearInterval(timerInterval);
      if (retryInterval) clearInterval(retryInterval);

      Swal.fire({ title: 'Mengirim Jawaban...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      // Konversi jawaban dari optKey ke teks
      const jawabanTeks = {};
      for (let soalId in jawUser) {
        const optKey = jawUser[soalId];
        const soal = quest.find(q => q.id === soalId);
        if (soal && optKey) {
          const parts = optKey.split('_');
          const optIndex = parseInt(parts[1]);
          if (soal.opsi && soal.opsi[optIndex]) jawabanTeks[soalId] = soal.opsi[optIndex].text;
        }
      }

      const payload = {
        token: currentToken,
        nama: currentNama,
        kelas: currentKelas,
        mapel: currentMapel,
        jawaban: jawabanTeks,
        kunci: kunci,
        pelanggaran: pelanggaran
      };

      google.script.run
        .withSuccessHandler(skor => {
          Swal.fire('Berhasil!', `Ujian Selesai. Skor Anda: ${skor}`, 'success').then(() => {
            // Reset semua state global
            quest = [];
            kunci = {};
            jawUser = {};
            ragu = {};
            idx = 0;
            sisa = 0;
            statusUjian = "OFF";
            pelanggaran = 0;
            currentToken = '';
            currentNama = '';
            currentKelas = '';
            currentMapel = '';
            syncQueue = [];
            if (retryInterval) clearInterval(retryInterval);
            retryInterval = null;
            lastSavedTime = null;
            isSubmitting = false;

            // Sembunyikan area ujian dan timer
            document.getElementById('view-exam').classList.add('d-none');
            document.getElementById('wrapper-timer').classList.add('d-none');

            // Tampilkan form login dan bersihkan input
            const loginDiv = document.getElementById('view-login');
            loginDiv.classList.remove('d-none');
            document.getElementById('in-nama').value = '';
            document.getElementById('in-kelas').selectedIndex = 0;
            document.getElementById('in-token').value = '';

            // Beri tahu pengguna bahwa mereka sudah selesai
            Swal.fire('Selamat!', `Anda telah menyelesaikan ujian ${currentMapel} dengan skor ${skor}. Silakan hubungi admin jika memiliki kendala.`, 'info');
          });
        })
        .withFailureHandler(err => {
          console.error(err);
          Swal.fire('Error', 'Gagal menyimpan jawaban: ' + err.message, 'error').then(() => {
            // Kembalikan ke login jika gagal (opsional)
            document.getElementById('view-exam').classList.add('d-none');
            document.getElementById('wrapper-timer').classList.add('d-none');
            document.getElementById('view-login').classList.remove('d-none');
            isSubmitting = false;
          });
        })
        .simpanKeDatabaseFinal(payload);
    }

    function loginAdmin() {
      Swal.fire({
        title: 'Login Admin', html: '<input id="admin-pass" type="password" class="swal2-input" placeholder="Password Admin">', preConfirm: () => {
          const pass = document.getElementById('admin-pass').value;
          if (pass === 'admin123') google.script.run.withSuccessHandler(() => Swal.fire('Sukses', 'Redirect ke admin panel', 'success')).adminLogin();
          else Swal.showValidationMessage('Password salah!');
        }
      });
    }

    function escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

    let fullscreenBypass = false; // izin keluar fullscreen via Ctrl+Space
    // Masuk ke mode layar penuh
    function enterFullscreen() {
      const docEl = document.documentElement;
      const requestMethod = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
      if (requestMethod) {
        requestMethod.call(docEl).catch(err => {
          console.warn('Gagal fullscreen:', err);
        });
      }
    }

    // Keluar dari layar penuh
    function exitFullscreen() {
      const exitMethod = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (exitMethod) {
        exitMethod.call(document);
      }
    }

    // Handler perubahan fullscreen
    function onFullscreenChange() {
      const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (statusUjian === "AKTIF" && !isFullscreen && !fullscreenBypass) {
        Swal.fire('Peringatan', 'Ujian harus dalam mode layar penuh!', 'warning').then(() => {
          enterFullscreen();
        });
      }
    }

    // Pasang event listener
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);


    // Shortcut Ctrl+Space untuk bypass (keluar fullscreen)
    window.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        if (statusUjian === "AKTIF") {
          fullscreenBypass = true;
          exitFullscreen();
          Swal.fire('Admin Bypass', 'Anda keluar dari mode layar penuh. Ujian tetap berjalan.', 'info');
        }
      }
    });
  </script>
</body>

</html>