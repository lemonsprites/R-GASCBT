const SS = SpreadsheetApp.getActiveSpreadsheet();
const SHEET_SEMENTARA = 'JawabanSementara';
const SHEET_PERMANEN = 'Jawaban';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CBT MTsN 1 CIAMIS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==== SHEET SEMENTARA ====
function getTempSheet() {
  let sheet = SS.getSheetByName(SHEET_SEMENTARA);
  if (!sheet) {
    sheet = SS.insertSheet(SHEET_SEMENTARA);
    sheet.getRange(1, 1, 1, 10).setValues([['token', 'nama', 'kelas', 'mapel', 'soalId', 'jawaban', 'timestamp', 'sisaWaktu', 'lastUpdate', 'username']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ==== VALIDASI SISWA (cukup salah satu cocok) ====
function validasiSiswa(inputValue, kelasUser) {
  const sheetSiswa = SS.getSheetByName('Siswa');
  if (!sheetSiswa) {
    return { valid: false, pesan: "Database siswa tidak ditemukan! Hubungi admin." };
  }
  
  const dataSiswa = sheetSiswa.getDataRange().getValues();
  if (dataSiswa.length <= 1) {
    return { valid: false, pesan: "Data siswa kosong! Hubungi admin." };
  }
  
  const inputClean = String(inputValue).trim();
  if (!inputClean) {
    return { valid: false, pesan: "Username atau Nama harus diisi!" };
  }
  
  for (let i = 1; i < dataSiswa.length; i++) {
    const usernameSheet = String(dataSiswa[i][0]).trim();
    const namaSheet = String(dataSiswa[i][1]).trim();
    const kelasSheet = String(dataSiswa[i][2]).trim();
    
    if (usernameSheet === inputClean || namaSheet.toLowerCase() === inputClean.toLowerCase()) {
      if (kelasSheet === kelasUser) {
        return { 
          valid: true, 
          username: usernameSheet, 
          nama: namaSheet,
          kelas: kelasSheet,
          loginVia: (usernameSheet === inputClean) ? 'username' : 'nama'
        };
      } else {
        return { 
          valid: false, 
          pesan: `Kelas tidak sesuai! Anda terdaftar di kelas ${kelasSheet}.` 
        };
      }
    }
  }
  
  return { 
    valid: false, 
    pesan: `"${inputClean}" tidak ditemukan. Pastikan Username atau Nama Anda terdaftar.` 
  };
}

function migrateTempSheet() {
  const sheet = getTempSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!headers.includes('sisaWaktu')) {
    sheet.getRange(1, 8).setValue('sisaWaktu');
    sheet.getRange(1, 9).setValue('lastUpdate');
  }
  if (!headers.includes('username')) {
    sheet.getRange(1, 10).setValue('username');
  }
}

// ==== SIMPAN JAWABAN (pakai username) ====
function simpanJawabanSementara(token, username, nama, kelas, mapel, soalId, jawaban, sisaWaktu = null) {
  const sheet = getTempSheet();
  migrateTempSheet();
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
    newRow.push(username);
    sheet.appendRow(newRow);
  }
  SpreadsheetApp.flush();
  return true;
}

function simpanSisaWaktu(token, username, kelas, mapel, sisaWaktu) {
  return simpanJawabanSementara(token, username, '', kelas, mapel, '_SESSION_', JSON.stringify({ sisaWaktu }), sisaWaktu);
}

function ambilJawabanSementara(token, username, mapel) {
  const sheet = getTempSheet();
  const data = sheet.getDataRange().getValues();
  const jawabanMap = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === token && row[9] === username && row[3] === mapel && row[4] !== '_SESSION_') {
      jawabanMap[row[4]] = row[5];
    }
  }
  return jawabanMap;
}

function ambilSisaWaktu(token, username, mapel) {
  const sheet = getTempSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === token && row[9] === username && row[3] === mapel && row[4] === '_SESSION_') {
      return { sisaWaktu: row[7] ? parseInt(row[7], 10) : null, lastUpdate: row[8] ? new Date(row[8]) : null };
    }
  }
  return null;
}

function hapusJawabanSementara(token, username, mapel) {
  const sheet = getTempSheet();
  const data = sheet.getDataRange().getValues();
  const rowsToDelete = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === token && row[9] === username && row[3] === mapel) {
      rowsToDelete.push(i + 1);
    }
  }
  for (let i = rowsToDelete.length - 1; i >= 0; i--) sheet.deleteRow(rowsToDelete[i]);
  return true;
}

// ==== SIMPAN FINAL ====
function simpanKeDatabaseFinal(payload) {
  const sheetPermanen = SS.getSheetByName(SHEET_PERMANEN) || SS.insertSheet(SHEET_PERMANEN);
  
  const headers = sheetPermanen.getRange(1, 1, 1, sheetPermanen.getLastColumn()).getValues()[0];
  if (!headers.includes('username')) {
    sheetPermanen.getRange(1, 8).setValue('username');
    sheetPermanen.getRange(1, 9).setValue('loginVia');
  }
  
  const existingData = sheetPermanen.getDataRange().getValues();
  for (let i = 1; i < existingData.length; i++) {
    const row = existingData[i];
    const existingUsername = row[8] || '';
    if (existingUsername === payload.username && row[3] === payload.mapel) {
      return 0;
    }
  }

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
    new Date(),
    payload.nama,
    payload.kelas,
    payload.mapel,
    skorFinal,
    JSON.stringify(payload.jawaban),
    payload.pelanggaran,
    payload.username,
    payload.loginVia
  ]);

  const props = PropertiesService.getUserProperties();
  const sessionKey = `session_${payload.username}_${payload.mapel}`;
  props.deleteProperty(sessionKey);
  props.deleteProperty(`start_${payload.token}_${payload.username}_${payload.mapel}`);
  hapusJawabanSementara(payload.token, payload.username, payload.mapel);
  
  return skorFinal;
}

// ==== FUNGSI LOGIN (FIX) ====
function cekLogin(tokenUser, inputUser, kelasUser) {
  try {
    const sheetJadwal = SS.getSheetByName('Jadwal');
    const data = sheetJadwal.getDataRange().getValues();
    if (data.length <= 1) return { status: "error", pesan: "Data jadwal kosong!" };

    const tokenInput = String(tokenUser).trim();
    const inputClean = String(inputUser).trim();

    if (!inputClean) {
      return { status: "error", pesan: "Username/Nama wajib diisi!" };
    }

    // VALIDASI SISWA
    const validasi = validasiSiswa(inputClean, kelasUser);
    if (!validasi.valid) {
      return { status: "error", pesan: validasi.pesan };
    }
    
    const usernameAsli = validasi.username;
    const namaAsli = validasi.nama;
    const loginVia = validasi.loginVia;

    // Cari jadwal
    let jadwal = null;
    for (let i = 1; i < data.length; i++) {
      let rowToken = data[i][4];
      if (rowToken === undefined) continue;
      if (String(rowToken).trim() === tokenInput) {
        jadwal = data[i];
        break;
      }
    }

    if (!jadwal) {
      return { status: "error", pesan: `Token "${tokenInput}" tidak valid.` };
    }

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
    if (isNaN(startTime.getTime())) {
      return { status: "error", pesan: "Format tanggal/jam tidak valid" };
    }

    const now = new Date();
    const startTimestamp = startTime.getTime();
    const nowTimestamp = now.getTime();

    if (nowTimestamp < startTimestamp) {
      const options = { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' };
      return { status: "error", pesan: `Ujian belum dimulai. Mulai pada ${startTime.toLocaleString('id-ID', options)}` };
    }

    const endTimestamp = startTimestamp + (durasiMenit * 60 * 1000);
    if (nowTimestamp > endTimestamp) {
      return { status: "error", pesan: "Waktu ujian telah berakhir." };
    }

    // CEK SUDAH UJIAN
    const sheetPermanen = SS.getSheetByName(SHEET_PERMANEN);
    if (sheetPermanen) {
      const rows = sheetPermanen.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        const existingUsername = rows[i][8] || '';
        if (existingUsername === usernameAsli && rows[i][3] === mapel) {
          return { status: "error", pesan: `${namaAsli} sudah mengikuti ujian ${mapel}!` };
        }
      }
    }

    // CEK SESSION AKTIF (mencegah login di tab lain)
    const props = PropertiesService.getUserProperties();
    const sessionKey = `session_${usernameAsli}_${mapel}`;
    const existingSession = props.getProperty(sessionKey);
    if (existingSession) {
      const sessionData = JSON.parse(existingSession);
      if (Date.now() - sessionData.startTime < (durasiMenit * 60 * 1000)) {
        return { status: "error", pesan: `Anda sedang mengikuti ujian ini di tab lain!` };
      }
    }
    
    props.setProperty(sessionKey, JSON.stringify({ startTime: Date.now() }));

    // START TIME UJIAN
    const startKey = `start_${tokenUser}_${usernameAsli}_${mapel}`;
    let startTimeUjian = props.getProperty(startKey);
    if (!startTimeUjian) {
      startTimeUjian = Date.now().toString();
      props.setProperty(startKey, startTimeUjian);
    }
    
    const durasiDetik = durasiMenit * 60;
    const elapsed = Math.floor((Date.now() - parseInt(startTimeUjian)) / 1000);
    const sisaServer = Math.max(0, durasiDetik - elapsed);

    const dataUjian = getSoalDanKunci(linkForm);
    const jawabanTersimpan = ambilJawabanSementara(tokenUser, usernameAsli, mapel);

    return {
      status: "success",
      token: tokenUser,
      sisaWaktuServer: sisaServer,
      mapel: mapel,
      durasi: durasiMenit,
      soal: dataUjian.soal,
      kunci: dataUjian.kunci,
      username: usernameAsli,
      namaSiswa: namaAsli,
      loginVia: loginVia,
      jawabanTersimpan: jawabanTersimpan
    };
  } catch (e) {
    return { status: "error", pesan: "Error: " + e.message };
  }
}

// ==== AMBIL SOAL DAN KUNCI ====
function getSoalDanKunci(url) {
  const form = FormApp.openByUrl(url);
  const items = form.getItems();
  let soal = [], kunci = {};
  items.forEach(item => {
    let tipe = item.getType().toString();
    let id = item.getId().toString();
    let pertanyaan = item.getTitle();
    let pertanyaanGambar = null;
    let pertanyaanTeks = pertanyaan;
    const illustMatch = pertanyaan.match(/illust:(https?:\/\/[^\s]+)/i);
    if (illustMatch) {
      pertanyaanGambar = illustMatch[1];
      pertanyaanTeks = pertanyaan.replace(/illust:[^\s]+/i, '').trim();
    }
    let itemObj = null;
    if (tipe === "MULTIPLE_CHOICE") itemObj = item.asMultipleChoiceItem();
    else if (tipe === "CHECKBOX") itemObj = item.asCheckboxItem();
    else if (tipe === "LIST") itemObj = item.asListItem();
    if (itemObj) {
      const choices = itemObj.getChoices();
      let opsi = [], jawabanBenar = [];
      choices.forEach((choice, idx) => {
        let value = choice.getValue(), imageUrl = null, text = value;
        const imageMatch = value.match(/(?:opsi|gambar):(https?:\/\/[^\s]+)/i);
        if (imageMatch) {
          imageUrl = imageMatch[1];
          text = value.replace(/(?:opsi|gambar):[^\s]+/i, '').trim();
          if (text === '') text = `Pilihan ${String.fromCharCode(65 + idx)}`;
        }
        text = text.replace(/\*\*/g, '').replace(/__/g, '').replace(/\*/g, '').replace(/_/g, '');
        opsi.push({ text, imageUrl });
        if (choice.isCorrectAnswer()) jawabanBenar.push(text);
      });
      soal.push({ id, tipe, pertanyaan: pertanyaanTeks, gambarPertanyaan: pertanyaanGambar, opsi });
      kunci[id] = jawabanBenar.length === 1 ? jawabanBenar[0] : jawabanBenar;
    }
  });
  return { soal, kunci };
}