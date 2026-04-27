const SS = SpreadsheetApp.getActiveSpreadsheet();
const SHEET_PERMANEN = 'Jawaban';
const SHEET_SEMENTARA = 'JawabanSementara';
const SHEET_START_TIME = 'StartTime';

// ==================== DATA SISWA ====================
function getDataSiswa() {
  const sheet = SS.getSheetByName('Siswa');
  if (!sheet) throw new Error("Sheet 'Siswa' tidak ditemukan!");
  return sheet.getDataRange().getValues();
}

function validasiSiswa(inputValue, kelasUser) {
  try {
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
          return { valid: true, username: usernameSheet, nama: namaSheet, kelas: kelasSheet,
                   loginVia: usernameSheet === inputClean ? 'username' : 'nama' };
        } else {
          return { valid: false, pesan: `Kelas tidak sesuai! Anda terdaftar di kelas ${kelasSheet}.` };
        }
      }
    }
    return { valid: false, pesan: `"${inputClean}" tidak ditemukan.` };
  } catch (e) {
    return { valid: false, pesan: e.message };
  }
}

// ==================== DATA JADWAL ====================
function getDataJadwal() {
  const sheet = SS.getSheetByName('Jadwal');
  if (!sheet) throw new Error("Sheet 'Jadwal' tidak ditemukan!");
  return sheet.getDataRange().getValues();
}

// ==================== CEK SUDAH UJIAN (SHEET PERMANEN) ====================
function cekSudahUjian(username, nama, kelas, mapel) {
  try {
    const sheet = SS.getSheetByName(SHEET_PERMANEN);
    if (!sheet) return false;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if ((row[8] || '') === username && row[3] === mapel) return true;
      if ((row[1] || '') === nama && (row[2] || '') === kelas && row[3] === mapel) return true;
    }
    return false;
  } catch(e) { return false; }
}

// ==================== START TIME (SHEET) ====================
function getStartTimeSheet() {
  let sheet = SS.getSheetByName(SHEET_START_TIME);
  if (!sheet) {
    sheet = SS.insertSheet(SHEET_START_TIME);
    sheet.getRange(1, 1, 1, 2).setValues([['key', 'timestamp']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function simpanStartTime(key, timestamp) {
  const sheet = getStartTimeSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(timestamp);
      return;
    }
  }
  sheet.appendRow([key, timestamp]);
}

function ambilStartTime(key) {
  const sheet = getStartTimeSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function hapusStartTime(key) {
  const sheet = getStartTimeSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

// ==================== JAWABAN SEMENTARA (SHEET) ====================
function getTempSheet() {
  let sheet = SS.getSheetByName(SHEET_SEMENTARA);
  if (!sheet) {
    sheet = SS.insertSheet(SHEET_SEMENTARA);
    sheet.getRange(1, 1, 1, 10).setValues([['token', 'nama', 'kelas', 'mapel', 'soalId', 'jawaban', 'timestamp', 'sisaWaktu', 'lastUpdate', 'username']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function simpanJawabanSementara(token, username, nama, kelas, mapel, soalId, jawaban, sisaWaktu = null) {
  try {
    const sheet = getTempSheet();
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === token && data[i][9] === username && data[i][3] === mapel && data[i][4] === soalId) {
        foundRow = i + 1;
        break;
      }
    }
    const now = new Date();
    if (foundRow !== -1) {
      if (sisaWaktu !== null) {
        sheet.getRange(foundRow, 6, 1, 4).setValues([[jawaban, now, sisaWaktu, now]]);
      } else {
        sheet.getRange(foundRow, 6, 1, 2).setValues([[jawaban, now]]);
      }
    } else {
      const newRow = [token, nama, kelas, mapel, soalId, jawaban, now];
      if (sisaWaktu !== null) newRow.push(sisaWaktu, now);
      else newRow.push('', '');
      newRow.push(username);
      sheet.appendRow(newRow);
    }
    return true;
  } catch (e) {
    console.error('Error simpanJawabanSementara:', e);
    return false;
  }
}

function simpanSisaWaktu(token, username, kelas, mapel, sisaWaktu) {
  return simpanJawabanSementara(token, username, '', kelas, mapel, '_SESSION_', '', sisaWaktu);
}

function ambilJawabanSementara(token, username, mapel) {
  try {
    const sheet = getTempSheet();
    const data = sheet.getDataRange().getValues();
    const jawabanMap = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[4] === '_SESSION_') continue;
      if (row[0] === token && row[9] === username && row[3] === mapel) {
        jawabanMap[row[4]] = row[5];
      }
    }
    return jawabanMap;
  } catch (e) {
    return {};
  }
}

function ambilSisaWaktu(token, username, mapel) {
  try {
    const sheet = getTempSheet();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] === token && row[9] === username && row[3] === mapel && row[4] === '_SESSION_') {
        const sisa = row[7] ? parseInt(row[7], 10) : null;
        return { sisaWaktu: sisa, lastUpdate: row[8] };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function hapusJawabanSementara(token, username, mapel) {
  try {
    const sheet = getTempSheet();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === token && data[i][9] === username && data[i][3] === mapel) {
        sheet.deleteRow(i + 1);
      }
    }
  } catch (e) {}
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
    
    const startKey = `START_${payload.token}_${payload.username}_${payload.mapel}`;
    hapusStartTime(startKey);
    hapusJawabanSementara(payload.token, payload.username, payload.mapel);
    return skorFinal;
  } catch (e) {
    console.error('Error simpanKeDatabaseFinal:', e);
    return -1;
  } finally {
    lock.releaseLock();
  }
}

// ==================== AMBIL SOAL DARI GOOGLE FORM ====================
function getSoalDanKunci(url) {
  try {
    if (!url) throw new Error("URL kosong");
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
        const choices = itemObj.getChoices();
        const opsi = [], jawabanBenar = [];
        choices.forEach(choice => {
          const value = choice.getValue();
          opsi.push({ text: value });
          if (choice.isCorrectAnswer()) jawabanBenar.push(value);
        });
        soal.push({ id, tipe, pertanyaan: item.getTitle(), opsi, gambarPertanyaan: null });
        kunci[id] = jawabanBenar.length === 1 ? jawabanBenar[0] : jawabanBenar;
      }
    });
    if (soal.length === 0) console.warn("⚠️ Tidak ada soal yang dihasilkan");
    return { soal, kunci };
  } catch (e) {
    console.error("Error getSoalDanKunci: " + e.message);
    return { soal: [], kunci: {} };
  }
}

// ==================== CEK LOGIN ====================
function cekLogin(tokenUser, inputUser, kelasUser) {
  try {
    console.log('cekLogin start');
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

    const sudahUjian = cekSudahUjian(usernameAsli, namaAsli, kelasUser, mapel);
    if (sudahUjian) return { status: "error", pesan: `${namaAsli} sudah mengikuti ujian ${mapel}!` };

    const startKey = `START_${tokenInput}_${usernameAsli}_${mapel}`;
    let startTimeUjian = ambilStartTime(startKey);
    if (!startTimeUjian) {
      startTimeUjian = Date.now().toString();
      simpanStartTime(startKey, startTimeUjian);
    }
    const durasiDetik = durasiMenit * 60;
    const elapsed = Math.floor((Date.now() - parseInt(startTimeUjian)) / 1000);
    const sisaServer = Math.max(0, durasiDetik - elapsed);

    const dataUjian = getSoalDanKunci(linkForm);
    if (!dataUjian.soal || dataUjian.soal.length === 0) {
      return { status: "error", pesan: "Gagal memuat soal ujian. Pastikan form dapat diakses dan berisi pertanyaan." };
    }

    const jawabanTersimpan = ambilJawabanSementara(tokenInput, usernameAsli, mapel);
    return {
      status: "success", token: tokenInput, sisaWaktuServer: sisaServer,
      mapel: mapel, durasi: durasiMenit,
      soal: dataUjian.soal, kunci: dataUjian.kunci,
      username: usernameAsli, namaSiswa: namaAsli, loginVia: loginVia,
      jawabanTersimpan: jawabanTersimpan
    };
  } catch (e) {
    console.error("FATAL error in cekLogin:", e.message, e.stack);
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