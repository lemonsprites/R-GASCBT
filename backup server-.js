const SS = SpreadsheetApp.getActiveSpreadsheet();
const SHEET_PERMANEN = 'Jawaban';

function getRedisConfig_() {
  return {
    endpoint: PropertiesService.getScriptProperties().getProperty('REDIS_ENDPOINT'),
    token: PropertiesService.getScriptProperties().getProperty('REDIS_TOKEN')
  };
}

function redisRequest_(method, path, body = null) {
  const cfg = getRedisConfig_();
  if (!cfg.endpoint || !cfg.token) throw new Error("Redis tidak dikonfigurasi");
  const url = `${cfg.endpoint}${path.startsWith('/') ? path : '/' + path}`;
  const options = {
    method: method,
    headers: { 'Authorization': `Bearer ${cfg.token}` },
    muteHttpExceptions: true
  };
  if (body) options.payload = body;
  return UrlFetchApp.fetch(url, options);
}

// ==================== DATA MASTER ====================
function getDataSiswa() {
  const sheet = SS.getSheetByName('Siswa');
  if (!sheet) return [];
  return sheet.getDataRange().getValues();
}

function validasiSiswa(inputValue, kelasUser) {
  const dataSiswa = getDataSiswa();
  if (dataSiswa.length <= 1) return { valid: false, pesan: "Data siswa kosong!" };
  const inputClean = String(inputValue).trim();
  if (!inputClean) return { valid: false, pesan: "Username/Nama harus diisi!" };
  for (let i = 1; i < dataSiswa.length; i++) {
    const usernameSheet = String(dataSiswa[i][0]).trim();
    const namaSheet = String(dataSiswa[i][1]).trim();
    const kelasSheet = String(dataSiswa[i][2]).trim();
    if (usernameSheet === inputClean || namaSheet.toLowerCase() === inputClean.toLowerCase()) {
      if (kelasSheet === kelasUser) {
        return {
          valid: true, username: usernameSheet, nama: namaSheet, kelas: kelasSheet,
          loginVia: usernameSheet === inputClean ? 'username' : 'nama'
        };
      } else {
        return { valid: false, pesan: `Kelas tidak sesuai! Anda terdaftar di kelas ${kelasSheet}.` };
      }
    }
  }
  return { valid: false, pesan: `"${inputClean}" tidak ditemukan.` };
}

function getDataJadwal() {
  const sheet = SS.getSheetByName('Jadwal');
  if (!sheet) return [];
  return sheet.getDataRange().getValues();
}

// ==================== AMBIL SOAL DARI GOOGLE FORM ====================
function getSoalDanKunci(url) {
  const redisKey = `CACHE_SOAL:${Utilities.base64Encode(url).substring(0, 50)}`;
  try {
    const cacheResp = redisRequest_('GET', `/get/${encodeURIComponent(redisKey)}`);
    const cacheData = JSON.parse(cacheResp.getContentText());
    if (cacheData && cacheData.result) return JSON.parse(cacheData.result);
    
    const lockKey = `${redisKey}:lock`;
    const lockPath = `/set/${encodeURIComponent(lockKey)}/LOCKED?nx=true&ex=10`;
    const lockResp = JSON.parse(redisRequest_('GET', lockPath).getContentText());
    if (lockResp.result === null) {
      Utilities.sleep(1000);
      const retryResp = redisRequest_('GET', `/get/${encodeURIComponent(redisKey)}`);
      const retryData = JSON.parse(retryResp.getContentText());
      if (retryData && retryData.result) return JSON.parse(retryData.result);
    }
    
    const form = FormApp.openByUrl(url);
    const items = form.getItems();
    let soal = [], kunci = {};
    items.forEach(item => {
      const tipe = item.getType().toString();
      const id = item.getId().toString();
      let itemObj = null;
      if (tipe === "MULTIPLE_CHOICE") itemObj = item.asMultipleChoiceItem();
      else if (tipe === "CHECKBOX") itemObj = item.asCheckboxItem();
      else if (tipe === "LIST") itemObj = item.asListItem();
      if (itemObj) {
        const deskripsi = itemObj.getHelpText() || "";
        let linkGambarPertanyaan = null, teksPertanyaan = item.getTitle();
        let matchIllust = deskripsi.match(/illust:\s*(https?:\/\/\S+)/i);
        if (matchIllust) linkGambarPertanyaan = matchIllust[1];
        else {
          const judul = item.getTitle();
          matchIllust = judul.match(/illust:\s*(https?:\/\/\S+)/i);
          if (matchIllust) {
            linkGambarPertanyaan = matchIllust[1];
            teksPertanyaan = judul.replace(/illust:\s*https?:\/\/\S+/i, '').trim();
          }
        }
        const choices = itemObj.getChoices();
        const opsi = [], jawabanBenar = [];
        choices.forEach(choice => {
          let value = choice.getValue(), teksMurni = value, linkGambarOpsi = null;
          if (value.includes("opsi:")) {
            const matchOpsi = value.match(/opsi:\s*(https?:\/\/\S+)/i);
            if (matchOpsi) {
              linkGambarOpsi = matchOpsi[1];
              teksMurni = value.replace(/opsi:\s*https?:\/\/\S+/i, "").trim();
            }
          }
          opsi.push({ text: teksMurni || "", imageUrl: linkGambarOpsi });
          if (choice.isCorrectAnswer()) jawabanBenar.push(teksMurni);
        });
        soal.push({ id, tipe, pertanyaan: teksPertanyaan, opsi, gambarPertanyaan: linkGambarPertanyaan });
        kunci[id] = jawabanBenar.length === 1 ? jawabanBenar[0] : jawabanBenar;
      }
    });
    const hasil = { soal, kunci };
    const setPath = `/set/${encodeURIComponent(redisKey)}?ex=7200`;
    redisRequest_('POST', setPath, JSON.stringify(hasil));
    redisRequest_('GET', `/del/${encodeURIComponent(lockKey)}`);
    return hasil;
  } catch (e) {
    console.error("getSoalDanKunci error:", e);
    return { soal: [], kunci: {} };
  }
}

// ==================== CEK LOGIN ====================
function cekLogin(tokenUser, inputUser, kelasUser) {
  try {
    const dataJadwal = getDataJadwal();
    if (dataJadwal.length <= 1) return { status: "error", pesan: "Data jadwal kosong!" };
    const tokenInput = String(tokenUser).trim();
    const inputClean = String(inputUser).trim();
    if (!inputClean) return { status: "error", pesan: "Username/Nama wajib diisi!" };
    const validasi = validasiSiswa(inputClean, kelasUser);
    if (!validasi.valid) return { status: "error", pesan: validasi.pesan };
    const usernameAsli = validasi.username;
    const namaAsli = validasi.nama;
    const loginVia = validasi.loginVia;

    let jadwal = null;
    for (let i = 1; i < dataJadwal.length; i++) {
      let rowToken = dataJadwal[i][4];
      if (rowToken === undefined) continue;
      if (String(rowToken).trim() === tokenInput) { jadwal = dataJadwal[i]; break; }
    }
    if (!jadwal) return { status: "error", pesan: `Token "${tokenInput}" tidak valid.` };

    const mapel = jadwal[0];
    let tglStr = jadwal[1];
    let jamStr = jadwal[2];
    if (tglStr instanceof Date) tglStr = Utilities.formatDate(tglStr, Session.getScriptTimeZone(), "dd/MM/yyyy");
    if (jamStr instanceof Date) jamStr = Utilities.formatDate(jamStr, Session.getScriptTimeZone(), "hh:mm:ss a");
    else jamStr = String(jamStr);
    const durasiMenit = parseInt(jadwal[3], 10) || 90;
    const linkForm = jadwal[5];

    const datetimeStr = tglStr + " " + jamStr;
    const timezone = Session.getScriptTimeZone();
    let startTime;
    let format = "dd/MM/yyyy hh:mm:ss a";
    try {
      startTime = Utilities.parseDate(datetimeStr, timezone, format);
      if (isNaN(startTime.getTime())) throw new Error("Invalid");
    } catch (e) {
      format = "dd/MM/yyyy HH:mm:ss";
      startTime = Utilities.parseDate(datetimeStr, timezone, format);
    }
    if (isNaN(startTime.getTime())) {
      return { status: "error", pesan: "Format tanggal/jam tidak valid: " + datetimeStr };
    }
    const now = new Date();
    const nowTimestamp = now.getTime();
    const startTimestamp = startTime.getTime();

    if (nowTimestamp < startTimestamp) {
      const options = { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' };
      return { status: "error", pesan: `Ujian belum dimulai. Mulai pada ${startTime.toLocaleString('id-ID', options)}` };
    }

    const endTimestamp = startTimestamp + (durasiMenit * 60 * 1000);
    if (nowTimestamp > endTimestamp) return { status: "error", pesan: "Waktu ujian telah berakhir." };

    const sisaWaktuServer = Math.max(0, Math.floor((endTimestamp - nowTimestamp) / 1000));

    const dataUjian = getSoalDanKunci(linkForm);
    if (!dataUjian.soal || dataUjian.soal.length === 0) {
      return { status: "error", pesan: "Gagal memuat soal ujian. Pastikan form dapat diakses dan berisi pertanyaan." };
    }

    return {
      status: "success",
      token: tokenInput,
      sisaWaktuServer: sisaWaktuServer,
      mapel: mapel,
      durasi: durasiMenit,
      soal: dataUjian.soal,
      kunci: dataUjian.kunci,
      username: usernameAsli,
      namaSiswa: namaAsli,
      loginVia: loginVia,
      jawabanTersimpan: {}
    };
  } catch (e) {
    console.error("FATAL cekLogin:", e.message, e.stack);
    return { status: "error", pesan: "Server error: " + e.message };
  }
}

// ==================== SIMPAN FINAL KE SHEET ====================
function simpanKeDatabaseFinal(payload) {
  const sheetPermanen = SS.getSheetByName(SHEET_PERMANEN) || SS.insertSheet(SHEET_PERMANEN);
  // Cek duplikat ringkas (tanpa lock)
  const lastRow = sheetPermanen.getLastRow();
  let sudah = false;
  if (lastRow > 0) {
    const range = sheetPermanen.getRange(1, 9, lastRow, 1); // kolom I (username)
    const usernames = range.getValues().flat();
    sudah = usernames.includes(payload.username);
  }
  if (sudah) return 0;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    // Cek ulang setelah lock
    const existingData = sheetPermanen.getDataRange().getValues();
    const isAlreadySubmitted = existingData.some(row => (row[8] || '') === payload.username && row[3] === payload.mapel);
    if (isAlreadySubmitted) return 0;
    
    let skorBenar = 0;
    const totalSoal = Object.keys(payload.kunci).length;
    for (let id in payload.kunci) {
      const user = payload.jawaban[id];
      const benar = payload.kunci[id];
      if (Array.isArray(benar)) {
        if (Array.isArray(user) && JSON.stringify(user.sort()) === JSON.stringify(benar.sort())) skorBenar++;
      } else {
        if (user === benar) skorBenar++;
      }
    }
    const skorFinal = totalSoal > 0 ? Math.round((skorBenar / totalSoal) * 100) : 0;
    sheetPermanen.appendRow([
      new Date(), payload.nama, payload.kelas, payload.mapel, skorFinal,
      JSON.stringify(payload.jawaban), payload.pelanggaran, payload.username, payload.loginVia
    ]);

    // Backup ke Redis (opsional, TTL 1 tahun)
    const finalKey = `FINAL:${payload.mapel}:${payload.username}`;
    const finalData = {
      timestamp: new Date().toISOString(),
      nama: payload.nama,
      kelas: payload.kelas,
      mapel: payload.mapel,
      skor: skorFinal,
      jawaban: payload.jawaban,
      pelanggaran: payload.pelanggaran,
      loginVia: payload.loginVia,
      token: payload.token,
      username: payload.username
    };
    try {
      redisRequest_('POST', `/set/${encodeURIComponent(finalKey)}?ex=31536000`, JSON.stringify(finalData));
    } catch(e) { console.error('Gagal backup Redis:', e); }

    return skorFinal;
  } catch (e) {
    console.error('simpanKeDatabaseFinal error:', e);
    return -1;
  } finally {
    lock.releaseLock();
  }
}

// ==================== DOGET ====================
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CBT MTsN 1 CIAMIS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}