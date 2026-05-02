const SS = SpreadsheetApp.getActiveSpreadsheet();

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CBT MTsN 1 CIAMIS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function cekAksesUjian(tokenUser) {
  try {
    const sheet = SS.getSheetByName('Jadwal');
    const data = sheet.getDataRange().getValues();
    data.shift(); 
    const jadwal = data.find(row => row[4].toString() === tokenUser);
    
    if (!jadwal) return { status: "error", pesan: "Token tidak valid!" };
    
    const dataUjian = getSoalDanKunci(jadwal[5]);
    return {
      status: "success",
      mapel: jadwal[0],
      durasi: jadwal[3] || 90,
      soal: dataUjian.soal,
      kunci: dataUjian.kunci
    };
  } catch(e) { return { status: "error", pesan: "Error: " + e.message }; }
}

function getSoalDanKunci(url) {
  const form = FormApp.openByUrl(url);
  const items = form.getItems();
  let soal = [], kunci = {};

  items.forEach(item => {
    let tipe = item.getType().toString();
    let itemObj = null;
    if (tipe === "MULTIPLE_CHOICE") itemObj = item.asMultipleChoiceItem();
    else if (tipe === "CHECKBOX") itemObj = item.asCheckboxItem();
    else if (tipe === "LIST") itemObj = item.asListItem();

    // let imageList = itemObj.getItems(form.ItemType.IMAGE)

    if (itemObj) {
      const id = item.getId().toString();
      soal.push({ id: id, tipe: tipe, pertanyaan: item.getTitle(), opsi: itemObj.getChoices().map(c => c.getValue()) });
      try {
        const correct = itemObj.getChoices().filter(c => c.isCorrectAnswer());
        if (correct.length > 0) kunci[id] = correct.map(c => c.getValue());
      } catch(e) { kunci[id] = null; }
    }
  });
  return { soal, kunci };
}

function simpanKeDatabase(payload) {
  const sheet = SS.getSheetByName('Jawaban') || SS.insertSheet('Jawaban');
  let skorBenar = 0;
  const totalSoal = Object.keys(payload.kunci).length;
  
  for (let id in payload.kunci) {
    if (JSON.stringify(payload.kunci[id]) === JSON.stringify([payload.jawaban[id]])) skorBenar++;
  }
  const skorFinal = totalSoal > 0 ? Math.round((skorBenar / totalSoal) * 100) : 0;
  sheet.appendRow([new Date(), payload.nama, payload.kelas, payload.mapel, skorFinal, JSON.stringify(payload.jawaban), payload.pelanggaran]);
  return skorFinal;
}