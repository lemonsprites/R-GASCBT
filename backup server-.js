const SS = SpreadsheetApp.getActiveSpreadsheet();
const SHEET_PERMANEN = 'Jawaban';

// ==================== KONFIGURASI REDIS ====================
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
  if (body) {
    options.payload = body;
    options.headers['Content-Type'] = 'application/json';
  }
  return UrlFetchApp.fetch(url, options);
}

// ==================== BATCH SAVE JAWABAN (PIPELINE) ====================
function simpanMassal(token, username, mapel, jawabanObj) {
  const cfg = getRedisConfig_();
  const key = `TEMP_CBT:${token}:${username}:${mapel}`;
  const body = JSON.stringify(["SET", key, JSON.stringify(jawabanObj), "EX", "7200"]);
  const options = {
    method: "POST",
    headers: { "Authorization": "Bearer " + cfg.token, "Content-Type": "application/json" },
    payload: body,
    muteHttpExceptions: true
  };
  const res = UrlFetchApp.fetch(cfg.endpoint + "/pipeline", options);
  const result = JSON.parse(res.getContentText());
  if (result && result[0] && result[0].result === "OK") return true;
  throw new Error("Batch save gagal");
}
function ambilMassal(token, username, mapel) {
  const cfg = getRedisConfig_();
  const key = `TEMP_CBT:${token}:${username}:${mapel}`;
  const body = JSON.stringify(["GET", key]);
  const options = {
    method: "POST",
    headers: { "Authorization": "Bearer " + cfg.token, "Content-Type": "application/json" },
    payload: body,
    muteHttpExceptions: true
  };
  const res = UrlFetchApp.fetch(cfg.endpoint + "/pipeline", options);
  const data = JSON.parse(res.getContentText());
  if (data && data[0] && data[0].result) return JSON.parse(data[0].result);
  return {};
}
function hapusMassal(token, username, mapel) {
  const cfg = getRedisConfig_();
  const key = `TEMP_CBT:${token}:${username}:${mapel}`;
  const body = JSON.stringify(["DEL", key]);
  const options = {
    method: "POST",
    headers: { "Authorization": "Bearer " + cfg.token, "Content-Type": "application/json" },
    payload: body,
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(cfg.endpoint + "/pipeline", options);
}

// ==================== DATA DINAMIS LAINNYA (SISA WAKTU, STATUS UJIAN) ====================
function simpanSisaWaktuRedis(token, username, mapel, sisaWaktu) {
  const key = `cbt:session:${token}:${username}:${mapel}`;
  const path = `/setex/${encodeURIComponent(key)}/3600/${sisaWaktu}`;
  redisRequest_('GET', path);
}
function ambilSisaWaktuRedis(token, username, mapel) {
  const key = `cbt:session:${token}:${username}:${mapel}`;
  const path = `/get/${encodeURIComponent(key)}`;
  const resp = redisRequest_('GET', path);
  const rawData = JSON.parse(resp.getContentText());
  return rawData.result ? parseInt(rawData.result, 10) : null;
}
function cekSudahUjianRedis(username, mapel) {
  const key = `done:${mapel}:${username}`;
  const path = `/exists/${encodeURIComponent(key)}`;
  const resp = redisRequest_('GET', path);
  const rawData = JSON.parse(resp.getContentText());
  return rawData.result === 1;
}
function tandaiSudahUjianRedis(username, mapel) {
  const key = `done:${mapel}:${username}`;
  const path = `/setex/${encodeURIComponent(key)}/86400/1`;
  redisRequest_('GET', path);
}
function simpanStartTime(key, timestamp) { redisRequest_('GET', `/setex/${encodeURIComponent(key)}/14400/${timestamp}`); }
function ambilStartTime(key) {
  const resp = redisRequest_('GET', `/get/${encodeURIComponent(key)}`);
  const rawData = JSON.parse(resp.getContentText());
  return rawData.result || null;
}
function hapusStartTime(key) { redisRequest_('GET', `/del/${encodeURIComponent(key)}`); }
function hapusDataRedis(token, username, mapel) {
  const key1 = `cbt:${token}:${username}`;
  const key2 = `cbt:session:${token}:${username}:${mapel}`;
  redisRequest_('GET', `/del/${encodeURIComponent(key1)}/${encodeURIComponent(key2)}`);
}

// ==================== DATA MASTER (CacheService) ====================
function getDataSiswa() { /* sama seperti sebelumnya */ }
function validasiSiswa(inputValue, kelasUser) { /* sama */ }
function getDataJadwal() { /* sama */ }

// ==================== FUNGSI CLIENT CALLBACK ====================
function simpanJawabanSementara(token, username, nama, kelas, mapel, soalId, jawaban, sisaWaktu = null) {
  // Tidak digunakan langsung karena pakai batch. Biarkan kosong atau fallback.
  return true;
}
function simpanSisaWaktu(token, username, kelas, mapel, sisaWaktu) {
  try { simpanSisaWaktuRedis(token, username, mapel, sisaWaktu); } catch(e) {}
  return true;
}
function ambilJawabanSementara(token, username, mapel) { return ambilMassal(token, username, mapel); }
function ambilSisaWaktu(token, username, mapel) {
  const sisa = ambilSisaWaktuRedis(token, username, mapel);
  return sisa !== null ? { sisaWaktu: sisa, lastUpdate: new Date() } : null;
}
function hapusJawabanSementara(token, username, mapel) {
  hapusDataRedis(token, username, mapel);
  hapusMassal(token, username, mapel);
}

// ==================== SIMPAN FINAL KE SHEET (OPTIMASI TANPA GETVALUES) ====================
function simpanKeDatabaseFinal(payload) {
  if (cekSudahUjianRedis(payload.username, payload.mapel)) return 0;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
    // Double check lagi setelah lock
    if (cekSudahUjianRedis(payload.username, payload.mapel)) return 0;
    const sheetPermanen = SS.getSheetByName(SHEET_PERMANEN) || SS.insertSheet(SHEET_PERMANEN);
    let skorBenar = 0, total = Object.keys(payload.kunci).length;
    for (let id in payload.kunci) {
      const user = payload.jawaban[id];
      const benar = payload.kunci[id];
      if (Array.isArray(benar)) {
        if (Array.isArray(user) && JSON.stringify(user.sort()) === JSON.stringify(benar.sort())) skorBenar++;
      } else {
        if (user === benar) skorBenar++;
      }
    }
    const skorFinal = total ? Math.round((skorBenar/total)*100) : 0;
    sheetPermanen.appendRow([
      new Date(), payload.nama, payload.kelas, payload.mapel, skorFinal,
      JSON.stringify(payload.jawaban), payload.pelanggaran, payload.username, payload.loginVia
    ]);
    tandaiSudahUjianRedis(payload.username, payload.mapel);
    const startKey = `START_${payload.token}_${payload.username}_${payload.mapel}`;
    hapusStartTime(startKey);
    hapusJawabanSementara(payload.token, payload.username, payload.mapel);
    return skorFinal;
  } catch(e) {
    console.error('simpanKeDatabaseFinal error:', e);
    return -1;
  } finally { lock.releaseLock(); }
}

// ==================== AMBIL SOAL DARI GOOGLE FORM DENGAN LOCK & CACHE ====================
function getSoalDanKunci(url) {
  const redisKey = `CACHE_SOAL:${Utilities.base64Encode(url).substring(0, 50)}`;
  try {
    // Cek cache
    const cacheResp = redisRequest_('GET', `/get/${encodeURIComponent(redisKey)}`);
    const cacheData = JSON.parse(cacheResp.getContentText());
    if (cacheData && cacheData.result) return JSON.parse(cacheData.result);
    // Lock untuk mencegah parsing berulang
    const lockKey = `${redisKey}:lock`;
    const lockPath = `/set/${encodeURIComponent(lockKey)}/LOCKED?nx=true&ex=10`;
    const lockResp = JSON.parse(redisRequest_('GET', lockPath).getContentText());
    if (lockResp.result === null) {
      Utilities.sleep(1000);
      const retryResp = redisRequest_('GET', `/get/${encodeURIComponent(redisKey)}`);
      const retryData = JSON.parse(retryResp.getContentText());
      if (retryData && retryData.result) return JSON.parse(retryData.result);
    }
    // Parsing form (hanya sekali)
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
    // Simpan ke redis dengan TTL 2 jam
    const setPath = `/set/${encodeURIComponent(redisKey)}?ex=7200`;
    redisRequest_('POST', setPath, JSON.stringify(hasil));
    redisRequest_('GET', `/del/${encodeURIComponent(lockKey)}`);
    return hasil;
  } catch(e) {
    console.error("getSoalDanKunci error:", e);
    return { soal: [], kunci: {} };
  }
}

// ==================== CEK LOGIN ====================
function cekLogin(tokenUser, inputUser, kelasUser) {
  try {
    const dataJadwal = getDataJadwal();
    if (dataJadwal.length <= 1) return { status: "error", pesan: "Data jadwal kosong!" };
    const tokenInput = String(tokenUser).trim(), inputClean = String(inputUser).trim();
    if (!inputClean) return { status: "error", pesan: "Username/Nama wajib diisi!" };
    const validasi = validasiSiswa(inputClean, kelasUser);
    if (!validasi.valid) return { status: "error", pesan: validasi.pesan };
    const usernameAsli = validasi.username, namaAsli = validasi.nama, loginVia = validasi.loginVia;
    let jadwal = null;
    for (let i = 1; i < dataJadwal.length; i++) {
      let rowToken = dataJadwal[i][4];
      if (rowToken === undefined) continue;
      if (String(rowToken).trim() === tokenInput) { jadwal = dataJadwal[i]; break; }
    }
    if (!jadwal) return { status: "error", pesan: `Token "${tokenInput}" tidak valid.` };
    const mapel = jadwal[0];
    let tglStr = jadwal[1], jamStr = jadwal[2];
    if (tglStr instanceof Date) tglStr = Utilities.formatDate(tglStr, Session.getScriptTimeZone(), "dd/MM/yyyy");
    if (jamStr instanceof Date) jamStr = Utilities.formatDate(jamStr, Session.getScriptTimeZone(), "hh:mm:ss a");
    else jamStr = String(jamStr);
    const durasiMenit = parseInt(jadwal[3],10) || 90;
    const linkForm = jadwal[5];
    // parsing waktu (sama)
    const dateParts = tglStr.split('/');
    const day = parseInt(dateParts[0],10), month = parseInt(dateParts[1],10)-1, year = parseInt(dateParts[2],10);
    let hour=0, minute=0, second=0;
    const timeMatch = jamStr.match(/(\d+):(\d+):(\d+)\s*([AP]M)/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1],10);
      minute = parseInt(timeMatch[2],10);
      second = parseInt(timeMatch[3],10);
      const ampm = timeMatch[4].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      hour = h;
    } else {
      const timeParts = jamStr.split(':');
      if (timeParts.length >= 2) {
        hour = parseInt(timeParts[0],10);
        minute = parseInt(timeParts[1],10);
        second = timeParts[2] ? parseInt(timeParts[2],10) : 0;
      }
    }
    const startTime = new Date(year, month, day, hour, minute, second);
    if (isNaN(startTime.getTime())) return { status: "error", pesan: "Format tanggal/jam tidak valid" };
    const now = new Date();
    const nowTimestamp = now.getTime(), startTimestamp = startTime.getTime();
    if (nowTimestamp < startTimestamp) {
      const options = { day:'numeric', month:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' };
      return { status: "error", pesan: `Ujian belum dimulai. Mulai pada ${startTime.toLocaleString('id-ID',options)}` };
    }
    const endTimestamp = startTimestamp + (durasiMenit*60*1000);
    if (nowTimestamp > endTimestamp) return { status: "error", pesan: "Waktu ujian telah berakhir." };
    if (cekSudahUjianRedis(usernameAsli, mapel)) return { status: "error", pesan: `${namaAsli} sudah mengikuti ujian ${mapel}!` };
    const startKey = `START_${tokenInput}_${usernameAsli}_${mapel}`;
    let startTimeUjian = ambilStartTime(startKey);
    if (!startTimeUjian) { startTimeUjian = Date.now().toString(); simpanStartTime(startKey, startTimeUjian); }
    const durasiDetik = durasiMenit*60;
    const elapsed = Math.floor((Date.now() - parseInt(startTimeUjian)) / 1000);
    const sisaServer = Math.max(0, durasiDetik - elapsed);
    const dataUjian = getSoalDanKunci(linkForm);
    if (!dataUjian.soal || dataUjian.soal.length === 0) return { status: "error", pesan: "Gagal memuat soal ujian." };
    const jawabanTersimpan = ambilMassal(tokenInput, usernameAsli, mapel);
    return {
      status: "success", token: tokenInput, sisaWaktuServer: sisaServer,
      mapel, durasi: durasiMenit, soal: dataUjian.soal, kunci: dataUjian.kunci,
      username: usernameAsli, namaSiswa: namaAsli, loginVia, jawabanTersimpan
    };
  } catch(e) {
    console.error("cekLogin error:", e);
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