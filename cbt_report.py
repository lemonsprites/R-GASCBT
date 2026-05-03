import pandas as pd
import requests
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.platypus.flowables import HRFlowable
import os
import numpy as np

# ========== KONFIGURASI ==========
CSV_JAWABAN_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=1738707171&single=true&output=csv"
CSV_SISWA_URL   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=241253314&single=true&output=csv"
CSV_JADWAL_URL  = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=1098143183&single=true&output=csv"

DOWNLOAD_DIR = "./rapor_siswa"
OUTPUT_PDF   = "rapor_semua_siswa.pdf"

def fetch_csv(url, nama):
    """Ambil CSV dari Google Sheets publish link."""
    try:
        df = pd.read_csv(url)
        print(f"✅ {nama}: {len(df)} baris")
        return df
    except Exception as e:
        print(f"❌ Gagal ambil {nama}: {e}")
        return None

def sanitize_filename(name):
    return "".join(c for c in name if c.isalnum() or c in (' ', '_', '-')).rstrip()

def main():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    # 1. Ambil semua data
    print("📡 Mengambil data dari Google Spreadsheet...")
    df_jawaban = fetch_csv(CSV_JAWABAN_URL, "Jawaban")
    df_siswa   = fetch_csv(CSV_SISWA_URL,   "Siswa")
    df_jadwal  = fetch_csv(CSV_JADWAL_URL,  "Jadwal")

    if df_jawaban is None or df_siswa is None or df_jadwal is None:
        print("❌ Data tidak lengkap, hentikan.")
        return

    # 2. Daftar mapel dari jadwal (urut berdasarkan tanggal)
    df_jadwal['Tanggal_parsed'] = pd.to_datetime(df_jadwal['Tanggal'], dayfirst=True)
    df_jadwal = df_jadwal.sort_values('Tanggal_parsed')
    MAPEL_LIST = df_jadwal['Mapel'].tolist()
    print(f"📚 Mapel terjadwal ({len(MAPEL_LIST)}): {MAPEL_LIST}")

    # 3. Bersihkan jawaban
    df_jawaban['Skor'] = pd.to_numeric(df_jawaban['Skor'], errors='coerce').fillna(0).astype(int)
    df_jawaban['Pelanggaran'] = pd.to_numeric(df_jawaban['Pelanggaran'], errors='coerce').fillna(0).astype(int)
    df_jawaban['Timestamp'] = pd.to_datetime(df_jawaban['Timestamp'], dayfirst=True)

    # Ambil jawaban terbaru per siswa per mapel
    df_jawaban_sorted = df_jawaban.sort_values('Timestamp')
    df_latest = df_jawaban_sorted.groupby(['Nama', 'Mapel']).last().reset_index()

    # 4. Daftar siswa dari CSV siswa
    siswa_list = []
    for _, row in df_siswa.iterrows():
        nama  = row['Nama']
        kelas = row.get('Kelas', '')
        username = row.get('Username', '')
        # Skor per mapel
        skor_mapel = {}
        pelanggaran_mapel = {}
        for mapel in MAPEL_LIST:
            match = df_latest[(df_latest['Nama'] == nama) & (df_latest['Mapel'] == mapel)]
            if not match.empty:
                skor_mapel[mapel] = int(match.iloc[0]['Skor'])
                pelanggaran_mapel[mapel] = int(match.iloc[0]['Pelanggaran'])
            else:
                skor_mapel[mapel] = None   # tidak ada data
                pelanggaran_mapel[mapel] = 0

        siswa_list.append({
            'nama': nama,
            'kelas': kelas,
            'username': username,
            'skor_mapel': skor_mapel,
            'pelanggaran_mapel': pelanggaran_mapel
        })

    siswa_list.sort(key=lambda x: x['nama'])
    print(f"👨‍🎓 Total siswa: {len(siswa_list)}")

    # 5. Siapkan PDF
    styles = getSampleStyleSheet()
    title_style = styles['Title']
    normal_style = styles['Normal']

    pdf_path = os.path.join(DOWNLOAD_DIR, OUTPUT_PDF)
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm,
        leftMargin=1.8*cm,
        rightMargin=1.8*cm
    )
    story = []

    # Header global
    story.append(Paragraph("LAPORAN HASIL UJIAN MADRASAH", title_style))
    story.append(Paragraph(f"MTsN 1 Ciamis — Dicetak: {datetime.now().strftime('%d %B %Y %H:%M')}", normal_style))
    story.append(Spacer(1, 0.4*cm))

    for idx, siswa in enumerate(siswa_list):
        nama     = siswa['nama']
        kelas    = siswa['kelas']
        username = siswa['username']
        skor_mapel = siswa['skor_mapel']
        pelanggaran_mapel = siswa['pelanggaran_mapel']

        # Hitung rata-rata hanya dari mapel yang sudah dikerjakan
        nilai_ada = [v for v in skor_mapel.values() if v is not None]
        rata_rata = sum(nilai_ada) / len(nilai_ada) if nilai_ada else 0.0

        # Bangun tabel
        table_data = [['No', 'Mata Pelajaran', 'Nilai', 'Ket']]
        anomali_list = []

        for i, mapel in enumerate(MAPEL_LIST, 1):
            nilai = skor_mapel.get(mapel)
            pel   = pelanggaran_mapel.get(mapel, 0)

            if nilai is None:
                ket = "❌ Tidak hadir / tidak ada data"
                anomali_list.append(mapel)
                nilai_str = "-"
            elif nilai == 0:
                ket = "⚠️  Nilai 0 — remedial"
                anomali_list.append(mapel)
                nilai_str = "0"
            else:
                ket = ""
                if pel > 0:
                    ket = f"⚠️  Pelanggaran ({pel}x)"
                    anomali_list.append(mapel)
                nilai_str = str(nilai)

            table_data.append([str(i), mapel, nilai_str, ket])

        # Baris rata-rata
        table_data.append(['', 'Rata-rata', f"{rata_rata:.1f}", ''])

        col_widths = [1.2*cm, 5.5*cm, 1.8*cm, 7.5*cm]
        table = Table(table_data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2F5496')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (2, 0), (2, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -2), 0.4, colors.grey),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#D6E4F0')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEBELOW', (0, -1), (-1, -1), 1.2, colors.black),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F2F7FB')]),
            ('FONTSIZE', (0, 1), (-1, -2), 8),
        ]))

        # Kop siswa
        story.append(Paragraph(f"<b>Nama : {nama}</b>", normal_style))
        story.append(Paragraph(f"Kelas : {kelas} &nbsp;&nbsp;|&nbsp;&nbsp; ID: {username}", normal_style))
        story.append(Spacer(1, 0.15*cm))
        story.append(table)
        story.append(Spacer(1, 0.2*cm))

        # Simpulan
        jml_hadir = len(nilai_ada)
        jml_mapel = len(MAPEL_LIST)
        if anomali_list:
            anomali_str = ", ".join(anomali_list)
            simpulan = Paragraph(
                f"<b>Anomali:</b> Terdeteksi {len(anomali_list)} mapel bermasalah: {anomali_str}. "
                f"Siswa hadir {jml_hadir}/{jml_mapel} mapel. "
                f"<b>Rekomendasi:</b> Remedial untuk mapel dengan nilai 0 atau tidak hadir.",
                normal_style
            )
        else:
            simpulan = Paragraph(
                f"<b>Status:</b> Semua {jml_mapel} mapel lengkap & bersih. Rata-rata: {rata_rata:.1f}. Tidak ada anomali.",
                normal_style
            )
        story.append(simpulan)
        story.append(Spacer(1, 0.3*cm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))

        if idx < len(siswa_list) - 1:
            story.append(PageBreak())

    # Build
    doc.build(story)
    print(f"\n✅ PDF gabungan tersimpan: {os.path.abspath(pdf_path)}")

if __name__ == "__main__":
    main()