// Variabel timer
let timerInterval = null;
let sisa = 0; // dalam detik
let lastSavedTime = null; // untuk menghindari simpan terlalu sering

function startTimer() {
  const display = document.getElementById('timer-display');
  const infoLock = document.getElementById('info-lock');
  const btnSelesai = document.getElementById('btn-selesai');
  
  // Jika sudah ada interval, clear dulu
  if (timerInterval) clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    if (statusUjian !== "AKTIF") { 
      clearInterval(timerInterval); 
      return; 
    }
    
    if (sisa <= 0) {
      clearInterval(timerInterval);
      kirimJawaban();
      return;
    }
    
    sisa--;
    
    let h = Math.floor(sisa / 3600), m = Math.floor((sisa % 3600) / 60), s = sisa % 60;
    display.innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    
    // Lock tombol selesai
    if(sisa > 600) {
      let sisaKunci = sisa - 600;
      let mk = Math.floor(sisaKunci / 60), sk = sisaKunci % 60;
      infoLock.innerHTML = `<i class="bi bi-lock-fill"></i> Selesai aktif dalam: ${mk}:${sk.toString().padStart(2,'0')}`;
      infoLock.classList.add('text-danger');
      infoLock.classList.remove('text-success');
      btnSelesai.disabled = true;
    } else {
      infoLock.innerHTML = `<i class="bi bi-unlock-fill"></i> Tombol Selesai Terbuka`;
      infoLock.classList.remove('text-danger');
      infoLock.classList.add('text-success');
      btnSelesai.disabled = false;
    }
    
    // Simpan sisa waktu setiap 10 detik
    const now = Date.now();
    if (!lastSavedTime || (now - lastSavedTime) >= 10000) {
      lastSavedTime = now;
      simpanSisaWaktuKeServer(sisa);
    }
    
  }, 1000);
}

// Fungsi simpan sisa waktu ke server
function simpanSisaWaktuKeServer(sisaWaktu) {
  if (!currentToken || !currentNama || !currentKelas || !currentMapel) return;
  google.script.run.withFailureHandler(err => {
    console.error('Gagal simpan sisa waktu:', err);
  }).simpanSisaWaktu(currentToken, currentNama, currentKelas, currentMapel, sisaWaktu);
}

// Saat mulai ujian, setelah ambil jawaban, ambil juga sisa waktu
function mulaiProses() {
  const n = document.getElementById('in-nama').value;
  const k = document.getElementById('in-kelas').value;
  const t = document.getElementById('in-token').value;
  
  if(!n || !k || !t) return Swal.fire('Error', 'Lengkapi Nama, Kelas, dan Token!', 'error');
  
  currentToken = t;
  currentNama = n;
  currentKelas = k;
  
  Swal.fire({ title: 'Menyiapkan Soal...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  
  google.script.run.withSuccessHandler(res => {
    if(res.status === "success") {
      quest = res.soal; 
      kunci = res.kunci;
      currentMapel = res.mapel;
      info = { nama: n, kelas: k, mapel: res.mapel, token: t };
      
      // Ambil jawaban sementara dan sisa waktu secara paralel
      google.script.run.withSuccessHandler(savedJawaban => {
        jawUser = savedJawaban || {};
      }).ambilJawabanSementara(t, n, k, res.mapel);
      
      google.script.run.withSuccessHandler(savedTime => {
        if (savedTime && savedTime.sisaWaktu > 0) {
          // Gunakan sisa waktu yang tersimpan (pastikan tidak melebihi durasi awal)
          const maxDurasi = res.durasi * 60;
          sisa = Math.min(savedTime.sisaWaktu, maxDurasi);
          // Opsional: validasi dengan timestamp server
          if (savedTime.lastUpdate) {
            // Jika sudah lewat 1 jam dari lastUpdate, bisa reset (tapi biarkan saja)
          }
        } else {
          sisa = res.durasi * 60;
        }
        statusUjian = "AKTIF";
        
        // Tampilkan UI
        document.getElementById('view-login').classList.add('d-none');
        document.getElementById('view-exam').classList.remove('d-none');
        document.getElementById('wrapper-timer').classList.remove('d-none');
        document.getElementById('txt-mapel').innerText = res.mapel;
        
        showQuest(); 
        showNav(); 
        startTimer(); // start timer dengan sisa yg sudah ditentukan
        Swal.close();
      }).ambilSisaWaktu(t, n, k, res.mapel);
      
    } else {
      Swal.fire('Gagal', res.pesan, 'error');
    }
  }).cekAksesUjian(t);
}

// Saat pilih jawaban, sekalian simpan sisa waktu terbaru (optional, bisa juga di panggil setiap pindah soal)
function pilih(soalId, optKey, optText) {
  jawUser[soalId] = optKey;
  delete ragu[soalId];
  showQuest(); 
  showNav();
  simpanJawabanKeServer(soalId, optKey);
  // Update sisa waktu juga (opsional agar lebih real-time)
  simpanSisaWaktuKeServer(sisa);
}

// Saat pindah soal juga simpan waktu
function move(n) {
  if(idx + n >= 0 && idx + n < quest.length) {
    idx += n; 
    showQuest(); 
    showNav();
    simpanSisaWaktuKeServer(sisa); // simpan waktu saat berpindah
  }
}