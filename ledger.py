import pandas as pd
import numpy as np
from datetime import datetime
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.platypus.flowables import HRFlowable

# ========== KONFIGURASI ==========
CSV_JAWABAN_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=1738707171&single=true&output=csv"
CSV_SISWA_URL   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=241253314&single=true&output=csv"
CSV_JADWAL_URL  = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=1098143183&single=true&output=csv"

DOWNLOAD_DIR = "./legger_ujian"
TAHUN_PELAJARAN = "2024/2025"   # sesuaikan
SEMESTER = "Genap"
KEPALA_MADRASAH = "Drs. H. SUKANDAR, M.Pd. I"   # bisa diambil dari data-pegawai nanti
NIP_KEPALA = "196507141994031002"
WALI_KELAS_DEFAULT = "IRWAN PERMANA SAPUTRA, S.Ag."  # bisa di-custom per kelas
NIP_WALI_DEFAULT = "19760109202211005"

def fetch_csv(url, nama):
    try:
        df = pd.read_csv(url)
        print(f"✅ {nama}: {len(df)} baris")
        return df
    except Exception as e:
        print(f"❌ Gagal ambil {nama}: {e}")
        return None

def main():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    # 1. Ambil data
    df_jawaban = fetch_csv(CSV_JAWABAN_URL, "Jawaban")
    df_siswa   = fetch_csv(CSV_SISWA_URL,   "Siswa")
    df_jadwal  = fetch_csv(CSV_JADWAL_URL,  "Jadwal")
    if df_jawaban is None or df_siswa is None or df_jadwal is None:
        print("Data tidak lengkap.")
        return

    # 2. Proses jadwal: urutkan, dapatkan daftar mapel dan singkatan
    df_jadwal['Tanggal_parsed'] = pd.to_datetime(df_jadwal['Tanggal'], dayfirst=True)
    df_jadwal = df_jadwal.sort_values('Tanggal_parsed')
    mapel_list = df_jadwal['Mapel'].tolist()
    singkat_list = df_jadwal['MAPEL'].tolist()   # singkatan dari kolom MAPEL
    print(f"Mapel: {mapel_list} -> {singkat_list}")

    # 3. Proses jawaban: skor terbaru per siswa per mapel
    df_jawaban['Skor'] = pd.to_numeric(df_jawaban['Skor'], errors='coerce').fillna(0).astype(int)
    df_jawaban['Timestamp'] = pd.to_datetime(df_jawaban['Timestamp'], dayfirst=True)
    df_jawaban_sorted = df_jawaban.sort_values('Timestamp')
    df_latest = df_jawaban_sorted.groupby(['Nama', 'Mapel']).last().reset_index()

    # 4. Bangun data per kelas
    kelas_list = sorted(df_siswa['Kelas'].unique())
    print("Kelas ditemukan:", kelas_list)

    for kelas in kelas_list:
        # Filter siswa kelas ini
        df_kelas = df_siswa[df_siswa['Kelas'] == kelas].copy()
        if df_kelas.empty:
            continue
        # Urutkan siswa berdasarkan Nama
        df_kelas = df_kelas.sort_values('Nama')
        siswa_list = []
        for _, row in df_kelas.iterrows():
            nama = row['Nama']
            # Ambil skor per mapel (urut sesuai jadwal)
            scores = {}
            for mapel in mapel_list:
                match = df_latest[(df_latest['Nama'] == nama) & (df_latest['Mapel'] == mapel)]
                if not match.empty:
                    scores[mapel] = int(match.iloc[0]['Skor'])
                else:
                    scores[mapel] = None   # tidak ada data
            # Hitung total (hanya yang ada nilainya)
            nilai_valid = [v for v in scores.values() if v is not None]
            total = sum(nilai_valid) if nilai_valid else 0
            siswa_list.append({
                'nama': nama,
                'scores': scores,
                'total': total
            })

        if not siswa_list:
            continue

        # 5. Buat PDF landscape untuk kelas ini
        output_pdf = os.path.join(DOWNLOAD_DIR, f"Legger_{kelas}.pdf")
        doc = SimpleDocTemplate(
            output_pdf,
            pagesize=landscape(A4),
            topMargin=1.5*cm,
            bottomMargin=1.5*cm,
            leftMargin=1.5*cm,
            rightMargin=1.5*cm
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title2', parent=styles['Title'], fontSize=16, alignment=1)
        subtitle_style = ParagraphStyle('Sub', parent=styles['Normal'], fontSize=10, alignment=1)

        story = []

        # Kop
        story.append(Paragraph("LEGGER NILAI UJIAN MADRASAH", title_style))
        story.append(Paragraph(f"Kelas : {kelas} &nbsp;&nbsp; Madrasah : MTsN 1 CIAMIS", subtitle_style))
        story.append(Paragraph(f"Tahun Pelajaran : {TAHUN_PELAJARAN} &nbsp;&nbsp; Semester : {SEMESTER}", subtitle_style))
        story.append(Spacer(1, 0.3*cm))

        # Tabel data
        # Header: No, Nama, Singkatan Mapel, Total
        header = ['No', 'Nama'] + singkat_list + ['Total']
        table_data = [header]

        for i, s in enumerate(siswa_list, 1):
            row_data = [str(i), s['nama']]
            for mapel in mapel_list:
                val = s['scores'].get(mapel)
                if val is not None:
                    row_data.append(str(val))
                else:
                    row_data.append('-')
            row_data.append(str(s['total']))
            table_data.append(row_data)

        # Lebar kolom disesuaikan: No kecil, Nama lebar, mapel kecil, Total sedang
        col_widths = [1.2*cm, 5.5*cm] + [1.5*cm]*len(mapel_list) + [2*cm]

        table = Table(table_data, colWidths=col_widths, repeatRows=1)
        # Styling
        base_style = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2F5496')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F2F7FB')]),
        ]
        # Tebalkan baris total
        table.setStyle(TableStyle(base_style))

        story.append(table)
        story.append(Spacer(1, 0.5*cm))

        
        doc.build(story)
        print(f"📄 {output_pdf} ({len(siswa_list)} siswa)")

    print(f"\n✅ Semua Legger disimpan di: {os.path.abspath(DOWNLOAD_DIR)}")

if __name__ == "__main__":
    main()