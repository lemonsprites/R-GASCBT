const SS = SpreadsheetApp.getActiveSpreadsheet();
const SHEET_SEMENTARA = 'JawabanSementara';
const SHEET_PERMANEN = 'Jawaban';
const SHEET_START_TIME = 'StartTime';

function doGet() {
  // Deteksi apakah user minta admin atau siswa
  const url = ScriptApp.getService().getUrl();
  const parameter = arguments[0]?.parameter;
  
  if (parameter && parameter.page === 'admin') {
    return HtmlService.createTemplateFromFile('Admin')
      .evaluate()
      .setTitle('Admin Panel CBT')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CBT MTsN 1 CIAMIS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==================== SHEET SEMENTARA ====================
function getTempSheet() {
  let sheet = SS.getSheetByName(SHEET_SEMENTARA);
  if (!sheet) {
    sheet = SS.insertSheet(SHEET_SEMENTARA);
    sheet.getRange(1, 1, 1, 10).setValues([['token', 'nama', 'kelas', 'mapel', 'soalId', 'jawaban', 'timestamp', 'sisaWaktu', 'lastUpdate', 'username']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
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

// ==================== VALIDASI SISWA ====================
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

// ==================== START TIME (PAKAI SHEET) ====================
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
      return true;
    }
  }
  sheet.appendRow([key, timestamp]);
  return true;
}

function ambilStartTime(key) {
  const sheet = getStartTimeSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return data[i][1];
    }
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

// ==================== SIMPAN JAWABAN SEMENTARA ====================
function simpanJawabanSementara(token, username, nama, kelas, mapel, soalId, jawaban, sisaWaktu = null) {
  try {
    const sheet = getTempSheet();
    migrateTempSheet();
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;
    
    // CARI BARIS YANG SUDAH ADA (berdasarkan token, username, mapel, soalId)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowToken = row[0];
      const rowUsername = row[9];
      const rowMapel = row[3];
      const rowSoalId = row[4];
      
      if (rowToken === token && rowUsername === username && rowMapel === mapel && rowSoalId === soalId) {
        foundRow = i + 1;
        break;
      }
    }
    
    const now = new Date();
    
    if (foundRow !== -1) {
      // UPDATE baris yang sudah ada
      if (sisaWaktu !== null) {
        // Update jawaban, timestamp, sisaWaktu, lastUpdate
        sheet.getRange(foundRow, 6, 1, 4).setValues([[jawaban, now, sisaWaktu, now]]);
      } else {
        // Update jawaban dan timestamp saja
        sheet.getRange(foundRow, 6, 1, 2).setValues([[jawaban, now]]);
      }
    } else {
      // INSERT baris baru hanya jika belum ada
      const newRow = [token, nama, kelas, mapel, soalId, jawaban, now];
      if (sisaWaktu !== null) {
        newRow.push(sisaWaktu, now);
      } else {
        newRow.push('', ''); // placeholder untuk sisaWaktu dan lastUpdate
      }
      newRow.push(username);
      sheet.appendRow(newRow);
    }
    
    SpreadsheetApp.flush();
    return true;
    
  } catch (e) {
    console.error('Error simpanJawabanSementara:', e);
    return false;
  }
}

function simpanSisaWaktu(token, username, kelas, mapel, sisaWaktu) {
  return simpanJawabanSementara(token, username, '', kelas, mapel, '_SESSION_', JSON.stringify({ sisaWaktu }), sisaWaktu);
}

function ambilJawabanSementara(token, username, mapel) {
  try {
    const sheet = getTempSheet();
    migrateTempSheet();
    const data = sheet.getDataRange().getValues();
    const jawabanMap = {};
    const lastUpdateMap = {}; // Untuk tracking jawaban terbaru
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Skip session row
      if (row[4] === '_SESSION_') continue;
      
      // Cek kecocokan
      if (row[0] === token && row[9] === username && row[3] === mapel) {
        const soalId = row[4];
        const jawabanValue = row[5];
        const timestamp = row[6] ? new Date(row[6]).getTime() : 0;
        
        // Ambil jawaban dengan timestamp terbaru
        if (!lastUpdateMap[soalId] || timestamp > lastUpdateMap[soalId]) {
          lastUpdateMap[soalId] = timestamp;
          jawabanMap[soalId] = jawabanValue;
        }
      }
    }
    
    console.log(`Total jawaban unik ditemukan: ${Object.keys(jawabanMap).length}`);
    return jawabanMap;
    
  } catch (e) {
    console.error('Error ambilJawabanSementara:', e);
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
        return { sisaWaktu: row[7] ? parseInt(row[7], 10) : null, lastUpdate: row[8] ? new Date(row[8]) : null };
      }
    }
    return null;
  } catch (e) {
    console.error('Error ambilSisaWaktu:', e);
    return null;
  }
}

function hapusJawabanSementara(token, username, mapel) {
  try {
    const sheet = getTempSheet();
    const data = sheet.getDataRange().getValues();
    const rowsToDelete = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] === token && row[9] === username && row[3] === mapel) {
        rowsToDelete.push(i + 1);
      }
    }
    
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      sheet.deleteRow(rowsToDelete[i]);
    }
    return true;
  } catch (e) {
    console.error('Error hapusJawabanSementara:', e);
    return false;
  }
}

// ==================== SIMPAN FINAL ====================
function simpanKeDatabaseFinal(payload) {
  try {
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
        if (Array.isArray(user) && JSON.stringify(user.sort()) === JSON.stringify(benar.sort())) {
          skorBenar++;
        }
      } else {
        if (user === benar) {
          skorBenar++;
        }
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

    const startKey = `START_${payload.token}_${payload.username}_${payload.mapel}`;
    hapusStartTime(startKey);
    hapusJawabanSementara(payload.token, payload.username, payload.mapel);
    
    return skorFinal;
  } catch (e) {
    console.error('Error simpanKeDatabaseFinal:', e);
    return -1;
  }
}

// ==================== FUNGSI LOGIN ====================
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

    const validasi = validasiSiswa(inputClean, kelasUser);
    if (!validasi.valid) {
      return { status: "error", pesan: validasi.pesan };
    }
    
    const usernameAsli = validasi.username;
    const namaAsli = validasi.nama;
    const loginVia = validasi.loginVia;

    // CARI JADWAL
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

    // PARSING WAKTU (sama seperti sebelumnya)
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

    // ========== CEK SUDAH UJIAN (PAKAI FUNGSI BARU) ==========
    const cekUjian = cekSudahUjian(usernameAsli, namaAsli, kelasUser, mapel);
    if (cekUjian.sudah) {
      return { 
        status: "error", 
        pesan: `${namaAsli} sudah mengikuti ujian ${mapel}! (terdeteksi via ${cekUjian.via})` 
      };
    }

    // START TIME UJIAN
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
    const jawabanTersimpan = ambilJawabanSementara(tokenInput, usernameAsli, mapel);

    return {
      status: "success",
      token: tokenInput,
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
    console.error('Error cekLogin:', e);
    return { status: "error", pesan: "Error: " + e.message };
  }
}

// ==================== AMBIL SOAL DAN KUNCI ====================
function getSoalDanKunci(url) {
  try {
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
  } catch (e) {
    console.error('Error getSoalDanKunci:', e);
    return { soal: [], kunci: {} };
  }
}


function cleanupDuplicateAnswers() {
  const sheet = getTempSheet();
  const data = sheet.getDataRange().getValues();
  const rowsToDelete = [];
  const latestAnswer = {};
  
  // Identifikasi jawaban terbaru per (token, username, mapel, soalId)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const key = `${row[0]}|${row[9]}|${row[3]}|${row[4]}`;
    const timestamp = row[6] ? new Date(row[6]).getTime() : 0;
    
    if (!latestAnswer[key] || timestamp > latestAnswer[key].timestamp) {
      if (latestAnswer[key]) {
        rowsToDelete.push(latestAnswer[key].rowIndex);
      }
      latestAnswer[key] = { rowIndex: i + 1, timestamp: timestamp };
    } else {
      rowsToDelete.push(i + 1);
    }
  }
  
  // Hapus baris duplikat dari bawah ke atas
  rowsToDelete.sort((a, b) => b - a);
  for (const rowIndex of rowsToDelete) {
    sheet.deleteRow(rowIndex);
    console.log(`Menghapus baris duplikat: ${rowIndex}`);
  }
  
  console.log(`Bersihkan selesai. ${rowsToDelete.length} baris duplikat dihapus.`);
}

// ==================== CEK SUDAH UJIAN (LEBIH AKURAT) ====================
function cekSudahUjian(username, nama, kelas, mapel) {
  const sheetPermanen = SS.getSheetByName(SHEET_PERMANEN);
  if (!sheetPermanen) return false;
  
  const rows = sheetPermanen.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const existingUsername = row[8] || '';  // kolom username
    const existingNama = row[1] || '';      // kolom nama
    const existingKelas = row[2] || '';     // kolom kelas
    const existingMapel = row[3] || '';     // kolom mapel
    
    // Cek berdasarkan username (paling akurat)
    if (existingUsername === username && existingMapel === mapel) {
      return { sudah: true, via: 'username', nama: existingNama };
    }
    
    // Cek berdasarkan nama + kelas (fallback)
    if (existingNama === nama && existingKelas === kelas && existingMapel === mapel) {
      return { sudah: true, via: 'nama', nama: existingNama };
    }
  }
  
  return { sudah: false };
}

// Jalankan fungsi ini SEKALI untuk memperbaiki data yang sudah ada
function fixExistingData() {
  const sheetPermanen = SS.getSheetByName(SHEET_PERMANEN);
  if (!sheetPermanen) return;
  
  const data = sheetPermanen.getDataRange().getValues();
  const headers = data[0];
  
  // Cek apakah kolom username dan loginVia sudah ada
  let usernameCol = headers.indexOf('username');
  let loginViaCol = headers.indexOf('loginVia');
  
  if (usernameCol === -1) {
    sheetPermanen.getRange(1, 8).setValue('username');
    usernameCol = 7;
  }
  if (loginViaCol === -1) {
    sheetPermanen.getRange(1, 9).setValue('loginVia');
    loginViaCol = 8;
  }
  
  // Perbaiki data yang username-nya kosong
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const existingUsername = row[usernameCol];
    const nama = row[1];
    const kelas = row[2];
    
    if (!existingUsername && nama) {
      // Cari username dari sheet Siswa
      const sheetSiswa = SS.getSheetByName('Siswa');
      if (sheetSiswa) {
        const siswaData = sheetSiswa.getDataRange().getValues();
        for (let j = 1; j < siswaData.length; j++) {
          if (siswaData[j][1] === nama && siswaData[j][2] === kelas) {
            sheetPermanen.getRange(i + 1, usernameCol + 1).setValue(siswaData[j][0]);
            sheetPermanen.getRange(i + 1, loginViaCol + 1).setValue('nama');
            break;
          }
        }
      }
    }
  }
  
  SpreadsheetApp.getUi().alert('Data telah diperbaiki!');
}