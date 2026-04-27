const SS = SpreadsheetApp.getActiveSpreadsheet();
const SHEET_PERMANEN = 'Jawaban';

// ==================== KONFIGURASI REDIS ====================
function getRedisConfig_() {
  return {
    endpoint: PropertiesService.getScriptProperties().getProperty('REDIS_ENDPOINT'),
    token: PropertiesService.getScriptProperties().getProperty('REDIS_TOKEN')
  };
}



// Helper untuk request HTTP ke Redis (GET, POST, dll)
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

// === OPERASI REDIS UNTUK DATA DINAMIS ===

// Simpan jawaban sementara (HASH)
function simpanKeRedis(token, username, soalId, jawaban) {
  try {
    const key = `cbt:${token}:${username}`;
    const field = soalId;
    const value = jawaban;
    const path = `/hset/${encodeURIComponent(key)}/${encodeURIComponent(field)}/${encodeURIComponent(value)}`;
    redisRequest_('GET', path);
    return true;
  } catch (e) {
    console.error('simpanKeRedis error:', e.message);
    return false;
  }
}

// Ambil semua jawaban sementara (HGETALL)
function ambilSemuaJawabanDariRedis(token, username) {
  try {
    const key = `cbt:${token}:${username}`;
    const path = `/hgetall/${encodeURIComponent(key)}`;
    const resp = redisRequest_('GET', path);
    const rawData = JSON.parse(resp.getContentText());

    // Upstash mengembalikan { "result": ["field1", "value1", "field2", "value2"] }
    const resultArr = rawData.result || [];
    const jawabanObj = {};

    for (let i = 0; i < resultArr.length; i += 2) {
      jawabanObj[resultArr[i]] = resultArr[i + 1];
    }
    return jawabanObj;
  } catch (e) {
    console.error('ambilSemuaJawabanDariRedis error:', e.message);
    return {};
  }
}

// Simpan sisa waktu (SETEX)
function simpanSisaWaktuRedis(token, username, mapel, sisaWaktu) {
  try {
    const key = `cbt:session:${token}:${username}:${mapel}`;
    const path = `/setex/${encodeURIComponent(key)}/3600/${sisaWaktu}`;
    redisRequest_('GET', path);
    return true;
  } catch (e) {
    console.error('simpanSisaWaktuRedis error:', e.message);
    return false;
  }
}

// Ambil sisa waktu (GET)
function ambilSisaWaktuRedis(token, username, mapel) {
  try {
    const key = `cbt:session:${token}:${username}:${mapel}`;
    const path = `/get/${encodeURIComponent(key)}`;
    const resp = redisRequest_('GET', path);
    const rawData = JSON.parse(resp.getContentText());

    // rawData format: { "result": "3600" }
    if (rawData.result !== null && rawData.result !== undefined) {
      return parseInt(rawData.result, 10);
    }
    return null;
  } catch (e) {
    console.error('ambilSisaWaktuRedis error:', e.message);
    return null;
  }
}

// Hapus data Redis (jawaban & session)
function hapusDataRedis(token, username, mapel) {
  try {
    const key1 = `cbt:${token}:${username}`;
    const key2 = `cbt:session:${token}:${username}:${mapel}`;
    const path = `/del/${encodeURIComponent(key1)}/${encodeURIComponent(key2)}`;
    redisRequest_('GET', path);
    return true;
  } catch (e) {
    console.error('hapusDataRedis error:', e.message);
    return false;
  }
}

// Cek sudah ujian (EXISTS)
function cekSudahUjianRedis(username, mapel) {
  try {
    const key = `done:${mapel}:${username}`;
    const path = `/exists/${encodeURIComponent(key)}`;
    const resp = redisRequest_('GET', path);
    const rawData = JSON.parse(resp.getContentText());

    // Upstash mengembalikan { "result": 1 } atau { "result": 0 }
    return rawData.result === 1;
  } catch (e) {
    console.error('cekSudahUjianRedis error:', e.message);
    return false;
  }
}

// Tandai sudah ujian (SETEX)
function tandaiSudahUjianRedis(username, mapel) {
  try {
    const key = `done:${mapel}:${username}`;
    const path = `/setex/${encodeURIComponent(key)}/86400/1`;
    redisRequest_('GET', path);
    return true;
  } catch (e) {
    console.error('tandaiSudahUjianRedis error:', e.message);
    return false;
  }
}

// === START TIME (REDIS) ===
function simpanStartTime(key, timestamp) {
  try {
    const path = `/setex/${encodeURIComponent(key)}/14400/${timestamp}`;
    redisRequest_('GET', path);
  } catch (e) { console.error('simpanStartTime error:', e.message); }
}


function ambilStartTime(key) {
  try {
    const path = `/get/${encodeURIComponent(key)}`;
    const resp = redisRequest_('GET', path);
    const rawData = JSON.parse(resp.getContentText());

    // Jika result ada, kembalikan isinya (biasanya string timestamp)
    if (rawData.result !== null && rawData.result !== undefined) {
      return rawData.result;
    }
    return null;
  } catch (e) {
    console.error('ambilStartTime error:', e.message);
    return null;
  }
}

function hapusStartTime(key) {
  try {
    const path = `/del/${encodeURIComponent(key)}`;
    redisRequest_('GET', path);
  } catch (e) { console.error('hapusStartTime error:', e.message); }
}

// ==================== DATA MASTER (CacheService) ====================
function getDataSiswa() {
  const cache = CacheService.getScriptCache();
  const key = 'data_siswa_master';
  let cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  const sheet = SS.getSheetByName('Siswa');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  cache.put(key, JSON.stringify(data), 600);
  return data;
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
  const cache = CacheService.getScriptCache();
  const key = 'data_jadwal_master';
  let cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  const sheet = SS.getSheetByName('Jadwal');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  cache.put(key, JSON.stringify(data), 600);
  return data;
}

// ==================== FUNGSI YANG DIPANGGIL CLIENT ====================
function simpanJawabanSementara(token, username, nama, kelas, mapel, soalId, jawaban, sisaWaktu = null) {
  let ok = true;
  if (soalId !== '_SESSION_') ok = ok && simpanKeRedis(token, username, soalId, jawaban);
  if (sisaWaktu !== null) ok = ok && simpanSisaWaktuRedis(token, username, mapel, sisaWaktu);
  return ok;
}

function simpanSisaWaktu(token, username, kelas, mapel, sisaWaktu) {
  return simpanJawabanSementara(token, username, '', kelas, mapel, '_SESSION_', '', sisaWaktu);
}

function ambilJawabanSementara(token, username, mapel) {
  return ambilSemuaJawabanDariRedis(token, username);
}

function ambilSisaWaktu(token, username, mapel) {
  const sisa = ambilSisaWaktuRedis(token, username, mapel);
  if (sisa !== null) return { sisaWaktu: sisa, lastUpdate: new Date() };
  return null;
}

function hapusJawabanSementara(token, username, mapel) {
  return hapusDataRedis(token, username, mapel);
}

// ==================== SIMPAN FINAL KE SHEET PERMANEN ====================
function simpanKeDatabaseFinal(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheetPermanen = SS.getSheetByName(SHEET_PERMANEN) || SS.insertSheet(SHEET_PERMANEN);
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
    tandaiSudahUjianRedis(payload.username, payload.mapel);
    const startKey = `START_${payload.token}_${payload.username}_${payload.mapel}`;
    hapusStartTime(startKey);
    hapusJawabanSementara(payload.token, payload.username, payload.mapel);
    return skorFinal;
  } catch (e) {
    console.error('simpanKeDatabaseFinal error:', e);
    return -1;
  } finally {
    lock.releaseLock();
  }
}

// ==================== AMBIL SOAL DARI GOOGLE FORM (LANGSUNG) ====================
function getSoalDanKunci(url) {
  const redisKey = `CACHE_SOAL:${Utilities.base64Encode(url).substring(0, 50)}`;

  try {
    // === 1. CEK CACHE ===
    const cacheResp = redisRequest_('GET', `/get/${encodeURIComponent(redisKey)}`);
    const cacheData = JSON.parse(cacheResp.getContentText());

    if (cacheData && cacheData.result) {
      return JSON.parse(cacheData.result);
    }

    // === 2. AMBIL DARI GOOGLE FORM ===
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
        let linkGambarPertanyaan = null;

        // 1. Cek illust di helpText
        let matchIllust = deskripsi.match(/illust:\s*(https?:\/\/\S+)/i);
        if (matchIllust) {
          linkGambarPertanyaan = matchIllust[1];
        } else {
          // 2. Jika tidak ada, cek di judul pertanyaan (title)
          const judul = item.getTitle();
          matchIllust = judul.match(/illust:(https?:\/\/[^\s]+)/i);
          if (matchIllust) linkGambarPertanyaan = matchIllust[1];
        }

        const choices = itemObj.getChoices();
        const opsi = [], jawabanBenar = [];

        choices.forEach(choice => {
          const value = choice.getValue();
          let teksMurni = value;
          let linkGambarOpsi = null;

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

        soal.push({
          id, tipe, pertanyaan: item.getTitle(),
          opsi: opsi, gambarPertanyaan: linkGambarPertanyaan
        });

        kunci[id] = jawabanBenar.length === 1 ? jawabanBenar[0] : jawabanBenar;
      }
    });

    const hasilUjian = { soal, kunci };

    // === 3. SIMPAN KE REDIS MENGGUNAKAN POST (Lebih Aman & Kapasitas Besar) ===
    // Path untuk SET dengan EXPIRE (PX = milidetik, 7200000 = 2 jam)
    const expireMs = 7200000;
    const setPath = `/set/${encodeURIComponent(redisKey)}?ex=${7200}`;

    // Kirim JSON di dalam body POST agar tidak terkena limit URL
    redisRequest_('POST', setPath, JSON.stringify(hasilUjian));

    return hasilUjian;

  } catch (e) {
    console.error("Error getSoalDanKunci:", e.message);
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

    // Parsing waktu
    const dateParts = tglStr.split('/');
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const year = parseInt(dateParts[2], 10);
    let hour = 0, minute = 0, second = 0;
    const timeMatch = jamStr.match(/(\d+):(\d+):(\d+)\s*([AP]M)/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2], 10);
      second = parseInt(timeMatch[3], 10);
      const ampm = timeMatch[4].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      hour = h;
    } else {
      const timeParts = jamStr.split(':');
      if (timeParts.length >= 2) {
        hour = parseInt(timeParts[0], 10);
        minute = parseInt(timeParts[1], 10);
        second = timeParts[2] ? parseInt(timeParts[2], 10) : 0;
      }
    }
    const startTime = new Date(year, month, day, hour, minute, second);
    if (isNaN(startTime.getTime())) return { status: "error", pesan: "Format tanggal/jam tidak valid" };
    const now = new Date();
    const nowTimestamp = now.getTime();
    const startTimestamp = startTime.getTime();
    if (nowTimestamp < startTimestamp) {
      const options = { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' };
      return { status: "error", pesan: `Ujian belum dimulai. Mulai pada ${startTime.toLocaleString('id-ID', options)}` };
    }
    const endTimestamp = startTimestamp + (durasiMenit * 60 * 1000);
    if (nowTimestamp > endTimestamp) return { status: "error", pesan: "Waktu ujian telah berakhir." };

    // CEK SUDAH UJIAN (REDIS)
    const sudahUjian = cekSudahUjianRedis(usernameAsli, mapel);
    if (sudahUjian) return { status: "error", pesan: `${namaAsli} sudah mengikuti ujian ${mapel}!` };

    // START TIME (REDIS)
    const startKey = `START_${tokenInput}_${usernameAsli}_${mapel}`;
    let startTimeUjian = ambilStartTime(startKey);
    if (!startTimeUjian) {
      startTimeUjian = Date.now().toString();
      simpanStartTime(startKey, startTimeUjian);
    }
    const durasiDetik = durasiMenit * 60;
    const elapsed = Math.floor((Date.now() - parseInt(startTimeUjian)) / 1000);
    const sisaServer = Math.max(0, durasiDetik - elapsed);

    // AMBIL SOAL (LANGSUNG DARI FORM)
    const dataUjian = getSoalDanKunci(linkForm, tokenInput);
    if (!dataUjian.soal || dataUjian.soal.length === 0) {
      return { status: "error", pesan: "Gagal memuat soal ujian. Pastikan form dapat diakses dan berisi pertanyaan." };
    }

    // JAWABAN SEMENTARA (REDIS)
    const jawabanTersimpan = ambilJawabanSementara(tokenInput, usernameAsli, mapel);

    return {
      status: "success", token: tokenInput, sisaWaktuServer: sisaServer,
      mapel: mapel, durasi: durasiMenit,
      soal: dataUjian.soal, kunci: dataUjian.kunci,
      username: usernameAsli, namaSiswa: namaAsli, loginVia: loginVia,
      jawabanTersimpan: jawabanTersimpan
    };
  } catch (e) {
    console.error("FATAL cekLogin:", e.message, e.stack);
    return { status: "error", pesan: "Server error: " + e.message };
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