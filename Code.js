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

function redisCmd_(...args) {
  const response = redisRequest_('POST', '', JSON.stringify(args));
  const data = JSON.parse(response.getContentText());
  if (data.error) throw new Error(data.error);
  return data.result;
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

    // --- KUMPULKAN STIMULUS DARI HELP TEXT YANG BERAWALAN "stimulus:" ---
    const stimulusMap = {};
    items.forEach(item => {
      const help = item.getHelpText() || "";
      const stimMatch = help.match(/^stimulus:(\S+)/i);
      if (stimMatch) {
        const id = stimMatch[1];
        // Ambil teks stimulus: hilangkan keyword "stimulus:xxx" dari help text
        const text = help.replace(/^stimulus:\S+\s*/i, '').trim() || item.getTitle();
        stimulusMap[id] = text;
      }
    });

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
        soal.push({
          id, tipe,
          pertanyaan: teksPertanyaan,
          opsi,
          gambarPertanyaan: linkGambarPertanyaan
        });
        kunci[id] = jawabanBenar.length === 1 ? jawabanBenar[0] : jawabanBenar;
      }
    });
    const hasil = { soal, kunci, stimulus: stimulusMap }; // <-- KIRIM JUGA STIMULUS
    const setPath = `/set/${encodeURIComponent(redisKey)}?ex=7200`;
    redisRequest_('POST', setPath, JSON.stringify(hasil));
    redisRequest_('GET', `/del/${encodeURIComponent(lockKey)}`);
    return hasil;
  } catch (e) {
    console.error("getSoalDanKunci error:", e);
    return { soal: [], kunci: {}, stimulus: {} };
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleQuestionsOnly(soal) {
  const shuffled = JSON.parse(JSON.stringify(soal)); // clone
  shuffleArray(shuffled); // hanya acak urutan soal
  return shuffled;
}

function shuffleQuestionsAndOptions(soal) {
  const shuffled = JSON.parse(JSON.stringify(soal));
  shuffleArray(shuffled); // acak urutan soal
  for (let i = 0; i < shuffled.length; i++) {
    if (shuffled[i].opsi) shuffleArray(shuffled[i].opsi);
  }
  return shuffled;
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

    const shuffleKey = `shuffle:${tokenInput}:${validasi.username}`;
    let shuffledSoal = null;
    try {
      const cached = redisCmd_('GET', shuffleKey);
      if (cached) {
        shuffledSoal = JSON.parse(cached);
      }
    } catch (e) {
      console.error('Gagal baca shuffle dari Redis:', e);
    }

    if (!shuffledSoal) {
      shuffledSoal = shuffleQuestionsAndOptions(dataUjian.soal);
      try {
        // TTL = sisa waktu ujian + buffer 2 jam (7200 detik)
        // sisaWaktuServer sudah dalam detik dari sekarang hingga akhir ujian
        let ttlShuffle = sisaWaktuServer + 3600;
        // Batasi minimal 1 jam (3600) dan maksimal 7 hari (604800) untuk keamanan
        if (ttlShuffle < 3600) ttlShuffle = 3600;
        if (ttlShuffle > 604800) ttlShuffle = 604800;
        redisCmd_('SETEX', shuffleKey, ttlShuffle, JSON.stringify(shuffledSoal));
      } catch (e) {
        console.error('Gagal simpan shuffle ke Redis:', e);
      }
    }
    // --- AKHIR PENANGANAN ---

    return {
      status: "success",
      token: tokenInput,
      sisaWaktuServer: sisaWaktuServer,
      mapel: mapel,
      durasi: durasiMenit,
      soal: shuffledSoal,
      kunci: dataUjian.kunci,
      stimulus: dataUjian.stimulus || {},  // <-- TAMBAHKAN INI
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
  // Hitung skor
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
  payload.skorFinal = skorFinal;
  addToWriteQueue(payload);
  return skorFinal;
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

  // Ambil kunci dari cache
  const { kunci } = getSoalDanKunci(linkForm);
  if (!kunci || Object.keys(kunci).length === 0) return { success: false, error: "Gagal mengambil kunci jawaban" };

  // Ambil pola acakan siswa
  const shuffleKey = `shuffle:${token}:${username}`;
  let shuffledSoal = null;
  try {
    const cached = redisCmd_('GET', shuffleKey);
    if (cached) shuffledSoal = JSON.parse(cached);
  } catch (e) { console.error('Gagal baca shuffle:', e); }

  // Ambil jawaban dari Redis
  const redisKey = `cbt:${token}:${username}`;
  let jawabanRaw = {};
  try {
    const result = redisCmd_('HGETALL', redisKey);
    if (!result || result.length === 0) return { success: false, error: "Tidak ada jawaban tersimpan" };
    for (let i = 0; i < result.length; i += 2) {
      jawabanRaw[result[i]] = result[i + 1];
    }
  } catch (e) {
    return { success: false, error: "Gagal membaca Redis: " + e.message };
  }

  // Konversi jawaban ke teks (jika masih indeks)
  const jawabanTeks = {};
  for (let id in jawabanRaw) {
    let val = jawabanRaw[id];
    if (typeof val === 'string' && val.includes('_') && shuffledSoal) {
      const soalItem = shuffledSoal.find(s => String(s.id) === String(id));
      if (soalItem) {
        const idx = parseInt(val.split('_')[1]);
        if (soalItem.opsi && soalItem.opsi[idx]) {
          jawabanTeks[id] = soalItem.opsi[idx].text;
          continue;
        }
      }
    }
    jawabanTeks[id] = val; // sudah teks atau tidak bisa konversi
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

  // Hapus key-key Redis
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



/**
 * MEMBACA SHEET "JawabanSementara" DAN MENYIMPAN KE REDIS
 * Format Redis:
 *   - Hash: cbt:{token}:{username}
 *     Field: soalId -> jawaban
 *   - Key: active:{token}:{username} -> sisaWaktu (jika ada)
 *   - Key: sisaWaktu:{token}:{username} -> timestamp update terakhir (opsional)
 */
function submitJawabanSementaraKeRedis() {
  const sheetName = "JawabanSementara";
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan`);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // Mapping index kolom
  const colIndex = {
    token: headers.indexOf("token"),
    nama: headers.indexOf("nama"),
    kelas: headers.indexOf("kelas"),
    mapel: headers.indexOf("mapel"),
    soalId: headers.indexOf("soalId"),
    jawaban: headers.indexOf("jawaban"),
    timestamp: headers.indexOf("timestamp"),
    sisaWaktu: headers.indexOf("sisaWaktu"),
    username: headers.indexOf("username")
  };
  for (let key in colIndex) {
    if (colIndex[key] === -1) throw new Error(`Kolom "${key}" tidak ditemukan di header`);
  }

  // Kelompokkan per siswa (token + username)
  const studentMap = new Map(); // key: `${token}|${username}`
  for (const row of rows) {
    const token = String(row[colIndex.token]).trim();
    const username = String(row[colIndex.username]).trim();
    const nama = String(row[colIndex.nama]).trim();
    const kelas = String(row[colIndex.kelas]).trim();
    const mapel = String(row[colIndex.mapel]).trim();
    const soalId = String(row[colIndex.soalId]).trim();
    let jawaban = row[colIndex.jawaban];
    const sisaWaktuRaw = row[colIndex.sisaWaktu];
    const timestampRaw = row[colIndex.timestamp];

    if (!token || !username) continue; // skip baris tidak valid

    // Skip baris dengan soalId = "_SESSION_" (hanya data sesi)
    if (soalId === "_SESSION_") {
      // Jika ada sisaWaktu, simpan ke key terpisah
      if (sisaWaktuRaw !== undefined && sisaWaktuRaw !== "") {
        const key = `${token}|${username}`;
        if (!studentMap.has(key)) {
          studentMap.set(key, {
            token, username, nama, kelas, mapel,
            answers: [],
            sisaWaktu: null,
            lastUpdate: null
          });
        }
        const student = studentMap.get(key);
        student.sisaWaktu = parseInt(sisaWaktuRaw, 10);
        student.lastUpdate = timestampRaw ? new Date(timestampRaw).getTime() : Date.now();
      }
      continue;
    }

    // Proses jawaban biasa
    // Bersihkan jawaban: jika dalam format "soalId_0" -> ambil bagian setelah underscore sebagai index
    let jawabanClean = String(jawaban).trim();
    if (jawabanClean.includes("_") && jawabanClean.split("_").length === 2) {
      // Biarkan apa adanya, nanti di client akan diparse
    }

    const key = `${token}|${username}`;
    if (!studentMap.has(key)) {
      studentMap.set(key, {
        token, username, nama, kelas, mapel,
        answers: [],
        sisaWaktu: null,
        lastUpdate: null
      });
    }
    const student = studentMap.get(key);
    student.answers.push({ soalId, jawaban: jawabanClean });
  }

  // Sekarang simpan ke Redis
  let totalSaved = 0;
  for (const student of studentMap.values()) {
    const redisHashKey = `cbt:${student.token}:${student.username}`;
    const activeKey = `active:${student.token}:${student.username}`;
    const lastUpdateKey = `lastUpdate:${student.token}:${student.username}`;

    // Simpan jawaban sebagai hash (HSET multiple)
    if (student.answers.length > 0) {
      const args = [redisHashKey];
      for (const ans of student.answers) {
        args.push(ans.soalId, ans.jawaban);
      }
      try {
        redisCmd_('HSET', ...args);
        console.log(`HSET ${redisHashKey} -> ${student.answers.length} fields`);
      } catch (e) {
        console.error(`Gagal HSET ${redisHashKey}: ${e.message}`);
      }
    }

    // Simpan sisaWaktu jika ada
    if (student.sisaWaktu !== null && !isNaN(student.sisaWaktu)) {
      try {
        redisCmd_('SETEX', activeKey, student.sisaWaktu, Date.now().toString());
        console.log(`SETEX ${activeKey} ${student.sisaWaktu}`);
      } catch (e) {
        console.error(`Gagal SETEX ${activeKey}: ${e.message}`);
      }
    }

    // Simpan timestamp last update (opsional)
    if (student.lastUpdate) {
      try {
        redisCmd_('SET', lastUpdateKey, student.lastUpdate.toString());
      } catch (e) { }
    }
    totalSaved++;
  }

  SpreadsheetApp.getUi().alert(`Berhasil menyimpan ${totalSaved} siswa ke Redis.\nTotal jawaban: ${studentMap.reduce((acc, s) => acc + s.answers.length, 0)}`);
  return { success: true, totalSiswa: totalSaved };
}

// =============== OPTIMASI SUBMISI ==============

const BATCH_SIZE = 20;        // Tulis setiap 20 submit
const BATCH_TIMEOUT_MS = 30000; // Atau setiap 30 detik

// Fungsi untuk menambahkan payload ke antrean (dipanggil oleh simpanKeDatabaseFinal)
function addToWriteQueue(payload) {
  const queueKey = 'pending_submissions_batch';
  const serialized = JSON.stringify(payload);
  redisCmd_('RPUSH', queueKey, serialized); // Tambah ke antrean (FIFO)

  const queueLength = redisCmd_('LLEN', queueKey);
  if (queueLength >= BATCH_SIZE) {
    flushWriteQueue();
  }
}

// Trigger periodik untuk memastikan antrean tidak menggantung
function setupPeriodicFlush() {
  ScriptApp.newTrigger('flushWriteQueue')
    .timeBased()
    .everyMinutes(1) // Setiap 1 menit
    .create();
}

function flushWriteQueue() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // coba lock, jika gagal lewati
  try {
    const queueKey = 'pending_submissions_batch';
    const batch = [];
    let item;
    while ((item = redisCmd_('LPOP', queueKey)) !== null) {
      batch.push(JSON.parse(item));
    }
    if (batch.length === 0) return;
    const sheet = SS.getSheetByName(SHEET_PERMANEN) || SS.insertSheet(SHEET_PERMANEN);
    const lastRow = sheet.getLastRow();
    const newRows = batch.map(p => [
      new Date(), p.nama, p.kelas, p.mapel, p.skorFinal,
      JSON.stringify(p.jawaban), p.pelanggaran, p.username, p.loginVia
    ]);
    sheet.getRange(lastRow + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    console.log(`Flushed ${batch.length} pending submissions.`);
  } catch (e) {
    console.error('Flush gagal:', e);
  } finally {
    lock.releaseLock();
  }
}

// ==================== TEST =====================

async function loadTestFinalSubmit() {
  // --- CONFIGURATION ---
  // !!! IMPORTANT: USE TEST DATA ONLY !!!
  const TOTAL_REQUESTS = 156;   // Jumlah total permintaan
  const BATCH_SIZE = 30;        // Kirim per batch (≤ batas konkurensi akun Anda)
  const TEST_JADWAL_TOKEN = 'TEST002';
  const TEST_KELAS = 'TEST';
  // Buat data siswa dummy di sheet 'Siswa', misal: testuser1, testuser2, ...
  // --- END CONFIGURATION ---

  const testUsernames = [];
  for (let i = 1; i <= TOTAL_REQUESTS; i++) {
    testUsernames.push(`testuser${i}`);
  }

  console.log(`Memulai load test untuk ${TOTAL_REQUESTS} pengguna.`);
  const startTime = new Date();

  const simulateOneSubmit = (username) => {
    try {
      const loginData = cekLogin(TEST_JADWAL_TOKEN, username, TEST_KELAS);
      if (loginData.status !== 'success') {
        console.error(`Login gagal untuk ${username}: ${loginData.pesan}`);
        return null;
      }
      const dummyAnswers = {};
      for (const soal of loginData.soal) {
        if (soal.opsi && soal.opsi.length) {
          dummyAnswers[soal.id] = soal.opsi[0].text;
        }
      }
      const payload = {
        token: loginData.token,
        nama: loginData.namaSiswa,
        kelas: loginData.kelas,
        mapel: loginData.mapel,
        jawaban: dummyAnswers,
        kunci: loginData.kunci,
        pelanggaran: 0,
        username: loginData.username,
        loginVia: loginData.loginVia
      };
      return simpanKeDatabaseFinal(payload);
    } catch (e) {
      console.error(`Error untuk ${username}: ${e.message}`);
      return null;
    }
  };

  // Proses dalam batch agar tidak melampaui batas konkurensi
  for (let i = 0; i < testUsernames.length; i += BATCH_SIZE) {
    const batch = testUsernames.slice(i, i + BATCH_SIZE);
    console.log(`Memproses batch ${i / BATCH_SIZE + 1} dengan ${batch.length} pengguna...`);

    const promises = batch.map(username => {
      return new Promise((resolve) => {
        const result = simulateOneSubmit(username);
        resolve({ username, result });
      });
    });

    const results = await Promise.all(promises);
    for (const res of results) {
      if (res.result === null) {
        console.error(`Gagal untuk ${res.username}`);
      } else {
        console.log(`Sukses untuk ${res.username}, skor: ${res.result}`);
      }
    }

    // Jeda untuk menghindari rate limit (gunakan Utilities.sleep)
    Utilities.sleep(2000);
  }

  const endTime = new Date();
  console.log(`Load test selesai dalam ${(endTime - startTime) / 1000} detik.`);
}

async function testConcurrentSubmit() {
  const TOTAL_REQUESTS = 156;
  const BATCH_SIZE = 30; // karena batas konkurensi 30
  const TOKEN = 'TEST002';
  const USERNAME_BASE = 'testuser'; // asumsi testuser1..testuser156 sudah login sebelumnya
  const KELAS = 'TEST'

  // Ambil satu contoh soal dan kunci (cukup sekali)
  const sampleLogin = cekLogin(TOKEN, `${USERNAME_BASE}1`, KELAS);
  if (sampleLogin.status !== 'success') throw new Error('Login sample gagal');
  const { kunci, mapel } = sampleLogin;

  // Buat jawaban dummy
  const jawabanDummy = {};
  for (let soal of sampleLogin.soal) {
    if (soal.opsi && soal.opsi.length) jawabanDummy[soal.id] = soal.opsi[0].text;
  }

  // Fungsi submit untuk satu user (tidak perlu login ulang)
  const submitOne = (username) => {
    const payload = {
      token: TOKEN,
      nama: `Siswa ${username}`,
      kelas: KELAS,
      mapel: mapel,
      jawaban: jawabanDummy,
      kunci: kunci,
      pelanggaran: 0,
      username: username,
      loginVia: 'test'
    };
    try {
      return simpanKeDatabaseFinal(payload);
    } catch (e) {
      console.error(`Submit gagal untuk ${username}: ${e.message}`);
      return null;
    }
  };

  // Kirim dalam batch paralel
  const allUsernames = Array.from({ length: TOTAL_REQUESTS }, (_, i) => `${USERNAME_BASE}${i + 1}`);
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < allUsernames.length; i += BATCH_SIZE) {
    const batch = allUsernames.slice(i, i + BATCH_SIZE);
    console.log(`Memproses batch ${Math.floor(i / BATCH_SIZE) + 1} dengan ${batch.length} user...`);
    const results = await Promise.all(batch.map(username => submitOne(username)));
    for (const res of results) {
      if (res !== null && res !== -1) successCount++;
      else failCount++;
    }
    console.log(`Batch selesai. Sukses: ${successCount}, Gagal: ${failCount}`);
    // Utilities.sleep(1000); // jeda opsional untuk meringankan sheet
  }
  console.log(`Selesai. Total sukses: ${successCount}, gagal: ${failCount}`);
}

async function testConcurrentSubmitNoDelay() {
  const TOTAL_REQUESTS = 156;
  const TOKEN = 'TEST002';      // Ganti dengan token valid
  const USERNAME_BASE = 'testuser';           // Sesuai data dummy di sheet Siswa
  const KELAS = 'TEST';

  // 1. Ambil sample data ujian (cukup satu kali)
  const sampleLogin = cekLogin(TOKEN, `${USERNAME_BASE}1`, KELAS);
  if (sampleLogin.status !== 'success') {
    console.error('Sample login gagal:', sampleLogin.pesan);
    return;
  }
  const { kunci, mapel, soal } = sampleLogin;

  // 2. Buat jawaban dummy (opsi pertama setiap soal)
  const jawabanDummy = {};
  for (const q of soal) {
    if (q.opsi && q.opsi.length) jawabanDummy[q.id] = q.opsi[0].text;
    else jawabanDummy[q.id] = '';
  }

  // 3. Fungsi submit untuk satu user
  const submitOne = (username) => {
    const payload = {
      token: TOKEN,
      nama: `Siswa ${username}`,
      kelas: KELAS,
      mapel: mapel,
      jawaban: jawabanDummy,
      kunci: kunci,
      pelanggaran: 0,
      username: username,
      loginVia: 'test'
    };
    try {
      return simpanKeDatabaseFinal(payload);
    } catch (e) {
      console.error(`Error untuk ${username}: ${e.message}`);
      return null;
    }
  };

  // 4. Generate semua username
  const allUsernames = Array.from({ length: TOTAL_REQUESTS }, (_, i) => `${USERNAME_BASE}${i + 1}`);

  console.log(`🚀 Memulai ${TOTAL_REQUESTS} request submit PARALEL PENUH tanpa jeda...`);
  const start = Date.now();

  // 🔥 KIRIM SEMUA REQUEST SEKALIGUS (paralel maksimal)
  const results = await Promise.all(allUsernames.map(username => submitOne(username)));

  const elapsed = (Date.now() - start) / 1000;
  let success = 0, fail = 0;
  for (const res of results) {
    if (res !== null && res !== -1) success++;
    else fail++;
  }

  console.log(`✅ Selesai dalam ${elapsed} detik.`);
  console.log(`📊 Sukses: ${success}, Gagal: ${fail}`);
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