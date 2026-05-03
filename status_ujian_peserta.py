import pandas as pd
import os
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.platypus.flowables import HRFlowable

# ========== KONFIGURASI ==========
CSV_JAWABAN_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=1738707171&single=true&output=csv"
CSV_SISWA_URL   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=241253314&single=true&output=csv"

KKM = 75
DOWNLOAD_DIR = "./laporan_peserta"
SKOR_ANOMALI = 10   # skor <= ini dianggap anomali

def main():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    print("📡 Mengunduh data...")
    df_jwb = pd.read_csv(CSV_JAWABAN_URL)
    df_siswa = pd.read_csv(CSV_SISWA_URL)

    # Bersihkan
    df_siswa.columns = df_siswa.columns.str.strip()
    df_siswa['Nama'] = df_siswa['Nama'].str.strip()
    df_siswa['Kelas'] = df_siswa['Kelas'].str.strip()

    df_jwb.columns = df_jwb.columns.str.strip()
    df_jwb = df_jwb[['Nama', 'Kelas', 'Mapel', 'Skor']].copy()
    df_jwb['Skor'] = pd.to_numeric(df_jwb['Skor'], errors='coerce').fillna(0).astype(int)
    df_jwb.dropna(subset=['Nama', 'Kelas', 'Mapel'], inplace=True)

    # 1. Gabungkan: semua siswa + ringkasan jawaban
    siswa_all = df_siswa[['Nama', 'Kelas']].drop_duplicates()

    # Hitung per siswa dari jawaban: jumlah mapel, rata2, nilai terendah, nilai per mapel (max per mapel)
    # Ambil nilai max per mapel dulu
    df_max = df_jwb.groupby(['Nama', 'Kelas', 'Mapel'])['Skor'].max().reset_index()

    # Fungsi ringkasan
    def hitung_ringkasan(grp):
        return pd.Series({
            'Jumlah_Mapel': grp['Mapel'].nunique(),
            'Rata_Nilai': grp['Skor'].mean(),
            'Min_Nilai': grp['Skor'].min(),
            'Ada_Anomali': (grp['Skor'] <= SKOR_ANOMALI).any(),
            'Remedial': (grp['Skor'] < KKM).any()   # jika ada mapel di bawah KKM
        })

    ringkasan = df_max.groupby(['Nama', 'Kelas']).apply(hitung_ringkasan).reset_index()

    # Gabungkan dengan semua siswa
    laporan = siswa_all.merge(ringkasan, on=['Nama', 'Kelas'], how='left')

    # Tentukan status ikut
    laporan['Status_Ikut'] = laporan['Jumlah_Mapel'].notna() & (laporan['Jumlah_Mapel'] > 0)
    laporan['Status_Ikut'] = laporan['Status_Ikut'].map({True: 'Mengikuti', False: 'Belum'})

    # Isi NaN untuk yang belum ikut
    laporan['Jumlah_Mapel'] = laporan['Jumlah_Mapel'].fillna(0).astype(int)
    laporan['Rata_Nilai'] = laporan['Rata_Nilai'].fillna(0).round(1)
    laporan['Ada_Anomali'] = laporan['Ada_Anomali'].fillna(False).astype(bool)
    laporan['Remedial'] = laporan['Remedial'].fillna(False).astype(bool)

    # Urutkan: Kelas, Nama
    laporan.sort_values(['Kelas', 'Nama'], inplace=True)
    laporan.reset_index(drop=True, inplace=True)

    # 2. Buat PDF landscape
    pdf_path = os.path.join(DOWNLOAD_DIR, "Laporan_Per_Peserta.pdf")
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=landscape(A4),
        topMargin=1.5*cm,
        bottomMargin=1.5*cm,
        leftMargin=1.5*cm,
        rightMargin=1.5*cm
    )
    styles = getSampleStyleSheet()
    title_style = styles['Title']
    normal = styles['Normal']

    story = []
    story.append(Paragraph("LAPORAN PER PESERTA UJIAN", title_style))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(f"KKM: {KKM} | Tanggal Cetak: {datetime.now().strftime('%d %B %Y')}", normal))
    story.append(Spacer(1, 0.5*cm))

    # Siapkan data tabel
    header = ['No', 'Nama Siswa', 'Kelas', 'Status Ikut', 'Jumlah Mapel', 'Rata-rata', 'Anomali', 'Remedial']
    table_data = [header]

    for i, row in laporan.iterrows():
        no = i + 1
        nama = row['Nama']
        kelas = row['Kelas']
        status_ikut = row['Status_Ikut']
        jml = row['Jumlah_Mapel']
        rata = row['Rata_Nilai']
        anomali = 'Ya' if row['Ada_Anomali'] else 'Tidak'
        remedial = 'Ya' if row['Remedial'] else 'Tidak'

        table_data.append([str(no), nama, kelas, status_ikut,
                           str(jml) if jml > 0 else '-',
                           f"{rata:.1f}" if jml > 0 else '-',
                           anomali, remedial])

    # Lebar kolom (total ~24cm di landscape)
    col_widths = [1.2*cm, 5.5*cm, 1.6*cm, 2.2*cm, 2.5*cm, 2.5*cm, 2.3*cm, 2.3*cm]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)

    # Style dasar
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495E')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
    ]

    # Warna baris per status
    for i, row in laporan.iterrows():
        idx = i + 1  # baris di tabel (skip header)
        if row['Status_Ikut'] == 'Belum':
            bg = colors.HexColor('#E5E7E9')  # abu terang
        elif row['Ada_Anomali']:
            bg = colors.HexColor('#F1948A')  # merah muda anomali
        elif row['Remedial']:
            bg = colors.HexColor('#F9E79F')  # kuning remedial
        else:
            bg = colors.HexColor('#A9DFBF')  # hijau tuntas

        style_commands.append(('BACKGROUND', (0, idx), (-1, idx), bg))

    t.setStyle(TableStyle(style_commands))
    story.append(t)

    doc.build(story)
    print(f"✅ Laporan per peserta tersimpan di: {pdf_path}")
    print(f"Total peserta: {len(laporan)}")

if __name__ == "__main__":
    main()