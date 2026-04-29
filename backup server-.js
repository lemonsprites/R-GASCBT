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

  const lastRow = sheetPermanen.getLastRow();
  if (lastRow > 0) {
    const range = sheetPermanen.getRange(1, 8, lastRow, 1); // kolom H (username)
    const usernames = range.getValues().flat();
    if (usernames.includes(payload.username)) return 0;
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const existingData = sheetPermanen.getDataRange().getValues();
    const isAlreadySubmitted = existingData.some(row => (row[7] || '') === payload.username && row[3] === payload.mapel);
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
    // Hapus backup ke Redis
    return skorFinal;
  } catch (e) {
    console.error('simpanKeDatabaseFinal error:', e);
    return -1;
  } finally {
    lock.releaseLock();
  }
}

// ==================== FUNGSI ADMIN ====================


function adminLogin(password) {
  const adminPass = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  // Fallback sementara jika properti belum diset (hapus setelah diset)
  const validPass = adminPass || 'admin123';
  return { success: password === validPass };
}

function getStats() {
  const sheet = SS.getSheetByName('Jawaban');
  if (!sheet) return { totalSelesai: 0, totalSiswaAktif: 0, perMapel: {} };
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { totalSelesai: 0, totalSiswaAktif: 0, perMapel: {} };
  const rows = data.slice(1);
  const perMapel = {};
  rows.forEach(row => {
    const mapel = row[3];
    perMapel[mapel] = (perMapel[mapel] || 0) + 1;
  });
  // totalSiswaAktif bisa diestimasikan nanti dari Redis atau biarkan 0
  return { totalSelesai: rows.length, totalSiswaAktif: 0, perMapel };
}

function getDataPermanen(limit, offset) {
  const sheet = SS.getSheetByName('Jawaban');
  if (!sheet) return { headers: [], data: [] };
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const start = 1 + offset;
  const end = start + limit;
  const rows = data.slice(start, end);
  return { headers, data: rows };
}

function adminLoginWithToken(password) {
  const adminPass = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  const validPass = adminPass || 'admin123';
  if (password !== validPass) {
    console.warn('Admin login gagal: password salah');
    return { success: false, error: 'Password salah' };
  }

  const cfg = getRedisConfig_();
  if (!cfg.endpoint || !cfg.token) {
    console.error('Redis tidak dikonfigurasi (endpoint/token kosong)');
    return { success: false, error: 'Redis tidak dikonfigurasi' };
  }

  console.log('Admin login sukses, mengirim konfigurasi Redis');
  return {
    success: true,
    redisEndpoint: cfg.endpoint,
    redisToken: cfg.token
  };
}

// Reset siswa hanya dari sheet (Redis dihapus oleh client)
function resetSiswaSheetOnly(username, mapel) {
  const sheet = SS.getSheetByName('Jawaban');
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][7] === username && data[i][3] === mapel) {
      sheet.deleteRow(i + 1);
    }
  }
  return true;
}

function adminForceSubmit(token, username) {
  // Cari jadwal berdasarkan token
  const dataJadwal = getDataJadwal();
  let jadwal = null;
  for (let i = 1; i < dataJadwal.length; i++) {
    if (String(dataJadwal[i][4]).trim() === token) {
      jadwal = dataJadwal[i];
      break;
    }
  }
  if (!jadwal) return { success: false, error: "Token tidak valid" };

  const mapel = jadwal[0];
  const linkForm = jadwal[5];

  // Ambil soal dan kunci dari cache
  const { soal, kunci } = getSoalDanKunci(linkForm);
  if (!kunci || Object.keys(kunci).length === 0) return { success: false, error: "Gagal mengambil kunci jawaban" };

  // Ambil jawaban dari Redis menggunakan redisCmd_
  const redisKey = `cbt:${token}:${username}`;
  let jawabanRaw = {};
  try {
    const result = redisCmd_('HGETALL', redisKey);
    if (!result || result.length === 0) return { success: false, error: "Tidak ada jawaban tersimpan" };
    // Konversi array flat menjadi object
    for (let i = 0; i < result.length; i += 2) {
      jawabanRaw[result[i]] = result[i + 1];
    }
  } catch (e) {
    return { success: false, error: "Gagal membaca Redis: " + e.message };
  }

  // Konversi optKey ke teks jawaban (seperti di client)
  const jawabanTeks = {};
  for (let id in jawabanRaw) {
    const optKey = jawabanRaw[id];
    const soalItem = soal.find(s => String(s.id) === String(id));
    if (soalItem && optKey) {
      const idx = parseInt(optKey.split('_')[1]);
      if (soalItem.opsi && soalItem.opsi[idx]) {
        jawabanTeks[id] = soalItem.opsi[idx].text;
      } else {
        jawabanTeks[id] = optKey;
      }
    } else {
      jawabanTeks[id] = optKey;
    }
  }

  // Hitung skor
  let benar = 0;
  const total = Object.keys(kunci).length;
  for (let id in kunci) {
    const userJawab = jawabanTeks[id] || "";
    const kunciJawab = kunci[id];
    if (Array.isArray(kunciJawab)) {
      const userArr = Array.isArray(userJawab) ? userJawab : [userJawab];
      if (userArr.sort().join() === kunciJawab.sort().join()) benar++;
    } else {
      if (userJawab === kunciJawab) benar++;
    }
  }
  const skor = total > 0 ? Math.round((benar / total) * 100) : 0;

  // Simpan ke sheet permanen
  const sheet = SS.getSheetByName(SHEET_PERMANEN);
  if (!sheet) return { success: false, error: "Sheet Jawaban tidak ditemukan" };
  const dataSiswa = getDataSiswa();
  let nama = username;
  let kelas = '';
  for (let i = 1; i < dataSiswa.length; i++) {
    if (dataSiswa[i][0] === username) {
      nama = dataSiswa[i][1];
      kelas = dataSiswa[i][2];
      break;
    }
  }
  sheet.appendRow([
    new Date(), nama, kelas, mapel, skor,
    JSON.stringify(jawabanTeks), 0, username, 'force_submit_admin'
  ]);

  // Hapus semua key Redis terkait
  redisCmd_('DEL', redisKey);
  redisCmd_('DEL', `active:${token}:${username}`);
  redisCmd_('DEL', `done:${mapel}:${username}`);
  redisCmd_('DEL', `FINAL:${mapel}:${username}`);

  return { success: true, skor: skor };
}

function resetActiveSession(token, username) {
  const activeKey = `active:${token}:${username}`;
  try {
    redisCmd_('DEL', activeKey);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function redisCmd_(...args) {
  const response = redisRequest_('POST', '', JSON.stringify(args));
  const data = JSON.parse(response.getContentText());
  if (data.error) throw new Error(data.error);
  return data.result;
}

// ==================== DOGET ====================
function doGet(e) {
  // Ambil parameter 'page'
  const page = e && e.parameter ? e.parameter.page : null;

  if (page === 'admin') {
    // Pastikan file dengan nama 'Admin' sudah dibuat
    return HtmlService.createTemplateFromFile('Admin')
      .evaluate()
      .setTitle('Admin CBT MTsN 1 CIAMIS')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // Default: halaman user
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CBT MTsN 1 CIAMIS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}