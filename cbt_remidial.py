import pandas as pd
import numpy as np
import os
from datetime import datetime
from collections import Counter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.platypus import PageBreak, BaseDocTemplate, Frame, PageTemplate
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus.flowables import HRFlowable
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

# ========== KONFIGURASI ==========
CSV_JAWABAN_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=1738707171&single=true&output=csv"
CSV_SISWA_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=241253314&single=true&output=csv"
CSV_JADWAL_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfv5ip3YYIR1VTTyO2WYWVNDOCotVLhEDlOuL44bybAmedb2cGGCRXiCWP_sqcBI9RDxz2cigE6aha/pub?gid=1098143183&single=true&output=csv"

KKM = 75
DOWNLOAD_DIR = "./analisis_ujian"
SKOR_ERROR_THRESHOLD = 10  # skor <= ini dianggap data error (force submit / kosong)


def main():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    # 1. Baca semua data
    print("📡 Mengunduh data...")
    df_jwb = pd.read_csv(CSV_JAWABAN_URL)
    df_siswa = pd.read_csv(CSV_SISWA_URL)
    df_jadwal = pd.read_csv(CSV_JADWAL_URL)

    # Bersihkan data siswa
    df_siswa.columns = df_siswa.columns.str.strip()
    df_siswa["Nama"] = df_siswa["Nama"].str.strip()
    df_siswa["Kelas"] = df_siswa["Kelas"].str.strip()

    # Bersihkan jawaban
    df_jwb.columns = df_jwb.columns.str.strip()
    df_jwb = df_jwb[["Nama", "Kelas", "Mapel", "Skor"]].copy()
    df_jwb["Skor"] = (
        pd.to_numeric(df_jwb["Skor"], errors="coerce").fillna(0).astype(int)
    )
    df_jwb.dropna(subset=["Nama", "Kelas", "Mapel"], inplace=True)

    # Bersihkan jadwal: Mapel, Tanggal, Jam, MAPEL (kode pendek)
    df_jadwal.columns = df_jadwal.columns.str.strip()
    df_jadwal["Tanggal"] = pd.to_datetime(df_jadwal["Tanggal"], dayfirst=True)
    # Buat mapping Mapel -> Tanggal
    mapel_to_tanggal = dict(zip(df_jadwal["Mapel"], df_jadwal["Tanggal"]))
    # Juga mapping dari MAPEL pendek ke Mapel jika diperlukan (gunakan Mapel saja)

    # 2. Analisis: siswa belum ujian
    print("🔍 Analisis: Belum Ujian")
    sudah_ujian = df_jwb[["Nama", "Kelas"]].drop_duplicates()
    semua_siswa = df_siswa[["Nama", "Kelas"]].drop_duplicates()
    belum_ujian = semua_siswa.merge(
        sudah_ujian, on=["Nama", "Kelas"], how="left", indicator=True
    )
    belum_ujian = belum_ujian[belum_ujian["_merge"] == "left_only"][["Nama", "Kelas"]]

    # 3. Analisis: Remedial (nilai maks per mapel < KKM)
    print("🔍 Analisis: Remedial")
    df_max = df_jwb.groupby(["Nama", "Kelas", "Mapel"])["Skor"].max().reset_index()
    siswa_remedial = []
    for (nama, kelas), grp in df_max.groupby(["Nama", "Kelas"]):
        mapel_bawah = grp[grp["Skor"] < KKM]
        if not mapel_bawah.empty:
            siswa_remedial.append(
                (nama, kelas, mapel_bawah[["Mapel", "Skor"]].sort_values("Mapel"))
            )

    # 4. Analisis: Data Error (skor <= SKOR_ERROR_THRESHOLD, tapi bukan karena remedial)
    print("🔍 Analisis: Data Error")
    error_data = df_jwb[df_jwb["Skor"] <= SKOR_ERROR_THRESHOLD].copy()
    # Kelompokkan per siswa
    siswa_error = []
    for (nama, kelas), grp in error_data.groupby(["Nama", "Kelas"]):
        mapel_error = grp[["Mapel", "Skor"]].sort_values("Mapel")
        siswa_error.append((nama, kelas, mapel_error))

    # 5. Statistik Harian (gabung dengan jadwal)
    print("📊 Statistik Harian")
    # Tambahkan tanggal ke jawaban
    df_jwb["Tanggal"] = df_jwb["Mapel"].map(mapel_to_tanggal)
    # Hanya yang ada tanggal valid
    df_stat = df_jwb.dropna(subset=["Tanggal"]).copy()
    if not df_stat.empty:
        stat_harian = (
            df_stat.groupby("Tanggal")
            .agg(
                Jumlah_Peserta=("Nama", "nunique"),
                Rata_Skor=("Skor", "mean"),
                Median_Skor=("Skor", "median"),
                Std_Skor=("Skor", "std"),
            )
            .reset_index()
        )
        # Hitung juga jumlah mapel per hari (dari jadwal)
        mapel_per_hari = (
            df_jadwal.groupby("Tanggal")["Mapel"]
            .nunique()
            .reset_index(name="Jumlah_Mapel")
        )
        stat_harian = stat_harian.merge(mapel_per_hari, on="Tanggal", how="left")
        stat_harian = stat_harian.sort_values("Tanggal")
    else:
        stat_harian = pd.DataFrame()

    # 6. Buat PDF
    print("📄 Membuat laporan PDF...")
    pdf_path = os.path.join(DOWNLOAD_DIR, "Laporan_Analisis_Ujian_Lengkap.pdf")
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    h2_style = ParagraphStyle(
        "H2", parent=styles["Heading2"], fontSize=14, spaceAfter=10
    )
    normal = styles["Normal"]

    story = []
    story.append(Paragraph("LAPORAN ANALISIS PELAKSANAAN UJIAN", title_style))
    story.append(Spacer(1, 0.3 * cm))
    story.append(
        Paragraph(
            f"KKM: {KKM} | Tanggal Cetak: {datetime.now().strftime('%d %B %Y')}", normal
        )
    )
    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 0.5 * cm))

    # # ---- BAGIAN A: SISWA BELUM UJIAN ----
    # story.append(Paragraph("A. SISWA BELUM MENGIKUTI UJIAN", h2_style))
    # if belum_ujian.empty:
    #     story.append(Paragraph("✅ Semua siswa telah mengikuti ujian.", normal))
    # else:
    #     for _, row in belum_ujian.iterrows():
    #         story.append(Paragraph(f"{row['Nama']} — {row['Kelas']}", normal))
    #     story.append(Spacer(1, 0.3 * cm))
    # story.append(Spacer(1, 0.3 * cm))
    # story.append(HRFlowable(width="80%", thickness=0.5, color=colors.grey))

    # # ========== BAGIAN B (COVER + DETAIL) – DIPERBAIKI ==========
    # # Hitung statistik untuk cover
    # total_peserta = len(siswa_remedial)
    # mapel_counter = Counter()
    # for nama, kelas, mapel_df in siswa_remedial:
    #     for _, row in mapel_df.iterrows():
    #         mapel_counter[row['Mapel']] += 1
    # sorted_mapel = sorted(mapel_counter.items(), key=lambda x: x[1], reverse=True)

    # # --- COVER REMEDIAL ---
    # story.append(PageBreak())
    # story.append(Spacer(1, 2*cm))

    # # Kotak judul utama
    # title_table = Table([[Paragraph("LAPORAN REMEDIAL", h2_style)]], colWidths=[doc.width])
    # title_table.setStyle(TableStyle([
    #     ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#8B0000')),
    #     ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
    #     ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    #     ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    #     ('TOPPADDING', (0, 0), (-1, -1), 15),
    #     ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
    # ]))
    # story.append(title_table)
    # story.append(Spacer(1, 1*cm))

    # # Subtitle
    # story.append(Paragraph(f"MTSN 1 CIAMIS — TAHUN PELAJARAN 2025/2026", normal))
    # story.append(Spacer(1, 1.5*cm))

    # # Total Peserta (Angka besar)
    # total_box = Table([[Paragraph(f"{total_peserta}", ParagraphStyle('Total', fontSize=48, alignment=TA_CENTER, textColor=colors.white)),
    #                     Paragraph("PESERTA REMEDIAL", ParagraphStyle('TotalSub', fontSize=18, alignment=TA_CENTER, textColor=colors.white))]],
    #                   colWidths=[doc.width])
    # total_box.setStyle(TableStyle([
    #     ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D35400')),  # Orange
    #     ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    #     ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    #     ('TOPPADDING', (0, 0), (-1, -1), 20),
    #     ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
    # ]))
    # story.append(total_box)
    # story.append(Spacer(1, 1.5*cm))

    # # Grouping Mapel
    # story.append(Paragraph("RINCIAN PER MATA PELAJARAN", h2_style))
    # story.append(Spacer(1, 0.3*cm))
    # grouping_data = [['Mata Pelajaran', 'Jumlah Peserta']]
    # for mapel, count in sorted_mapel:
    #     grouping_data.append([mapel, str(count)])
    # grouping_table = Table(grouping_data, colWidths=[12*cm, 4*cm])
    # grouping_table.setStyle(TableStyle([
    #     ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#27AE60')),
    #     ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    #     ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    #     ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
    #     ('ALIGN', (1, 0), (1, -1), 'CENTER'),
    #     ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    #     ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#EAFAF1')]),
    # ]))
    # story.append(grouping_table)
    # story.append(Spacer(1, 1*cm))
    # story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))

    # # --- DETAIL PESERTA PER MAPEL (DIPERBAIKI) ---
    # story.append(PageBreak())
    # story.append(Paragraph("DAFTAR NAMA PESERTA REMEDIAL", h2_style))
    # story.append(Spacer(1, 0.3*cm))
    # story.append(Paragraph(f"Total: {total_peserta} peserta | KKM: {KKM}", normal))
    # story.append(Spacer(1, 0.5*cm))

    # if not siswa_remedial:
    #     story.append(Paragraph("✅ Tidak ada siswa yang memerlukan remedial.", normal))
    # else:
    #     for mapel, _ in sorted_mapel:
    #         # Kumpulkan siswa yang remedial di mapel ini
    #         siswa_per_mapel = []
    #         for nama, kelas, mapel_df in siswa_remedial:
    #             nilai_row = mapel_df[mapel_df['Mapel'] == mapel]
    #             if not nilai_row.empty:
    #                 nilai = nilai_row.iloc[0]['Skor']
    #                 siswa_per_mapel.append((nama, kelas, nilai))

    #         if not siswa_per_mapel:
    #             continue  # seharusnya tidak terjadi

    #         # Buang duplikat (mungkin ada siswa yang muncul >1 karena beberapa mapel)
    #         # Namun karena kita sudah loop per mapel, duplikat tidak mungkin di dalam satu mapel yang sama.
    #         # Tetap sort berdasarkan Kelas lalu Nama
    #         siswa_per_mapel.sort(key=lambda x: (x[1], x[0]))  # Kelas, Nama

    #         # Sub-judul mapel
    #         story.append(Paragraph(f"Mapel: {mapel}", ParagraphStyle('MapelHeader', parent=h2_style, textColor=colors.HexColor('#C0392B'))))
    #         story.append(Spacer(1, 0.2*cm))

    #         # Tabel daftar
    #         table_data = [['No', 'Nama Siswa', 'Kelas', 'Nilai']]
    #         for i, (nama, kelas, nilai) in enumerate(siswa_per_mapel, 1):
    #             table_data.append([str(i), nama, kelas, str(nilai)])

    #         t = Table(table_data, colWidths=[1*cm, 9*cm, 3*cm, 3*cm])
    #         t.setStyle(TableStyle([
    #             ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#A93226')),
    #             ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    #             ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    #             ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    #             ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
    #             ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    #             ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#FDEBD0')]),
    #         ]))
    #         story.append(t)
    #         story.append(Spacer(1, 0.5*cm))

    #         # Garis pemisah yang lebih jelas antar mapel
    #         story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#C0392B')))
    #         story.append(Spacer(1, 0.5*cm))

    # story.append(Spacer(1, 0.5*cm))
    # story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    # story.append(Spacer(1, 0.5*cm))

    # ---- BAGIAN C: DATA ERROR (DISEMPURNAKAN) ----
    story.append(Paragraph("C. DATA ERROR — SKOR MENcurigakan (≤ 10)", h2_style))
    story.append(Spacer(1, 0.2 * cm))

    if not siswa_error:
        story.append(Paragraph("✅ Tidak ada data error terdeteksi.", normal))
    else:
        # Ringkasan
        total_error = sum(len(df) for _, _, df in siswa_error)
        story.append(
            Paragraph(
                f"⚠️ Ditemukan <b>{len(siswa_error)} siswa</b> dengan total <b>{total_error} entri</b> "
                f"bernilai sangat rendah. Kemungkinan penyebab: <i>force-submit</i>, jawaban kosong, "
                f"atau kendala teknis saat ujian berlangsung.",
                normal,
            )
        )
        story.append(Spacer(1, 0.3 * cm))

        # Tabel utama dengan warna kontras
        table_data = [["No", "Nama Siswa", "Kelas", "Mata Pelajaran", "Skor"]]
        no = 1
        for nama, kelas, mapel_df in siswa_error:
            for _, row in mapel_df.iterrows():
                table_data.append(
                    [str(no), nama, kelas, row["Mapel"], str(row["Skor"])]
                )
                no += 1

        col_widths = [1.2 * cm, 5.5 * cm, 1.8 * cm, 5.5 * cm, 2 * cm]
        t = Table(table_data, colWidths=col_widths, repeatRows=1)
        t.setStyle(
            TableStyle(
                [
                    # Header merah gelap
                    (
                        "BACKGROUND",
                        (0, 0),
                        (-1, 0),
                        colors.HexColor("#8B0000"),
                    ),  # dark red
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    # Body: selang-seling merah muda / putih
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.HexColor("#FFE4E1"), colors.white],
                    ),  # MistyRose
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), 9),
                    ("ALIGN", (0, 1), (0, -1), "CENTER"),  # No
                    ("ALIGN", (3, 1), (3, -1), "LEFT"),  # Mapel
                    ("ALIGN", (4, 1), (4, -1), "CENTER"),  # Skor
                    # Highlight skor = 0 dengan teks merah tebal
                    ("TEXTCOLOR", (4, 1), (4, -1), None),  # dibiarkan default dulu
                    # Kita akan set manual di bawah
                    # Garis
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#B0B0B0")),
                    ("LINEBELOW", (0, 0), (-1, 0), 1.5, colors.black),
                ]
            )
        )

        # Efek tambahan: skor 0 ditulis tebal merah
        for i, row in enumerate(table_data[1:], start=1):  # skip header
            skor_val = int(row[4])
            if skor_val == 0:
                t.setStyle(
                    TableStyle(
                        [
                            ("TEXTCOLOR", (4, i), (4, i), colors.red),
                            ("FONTNAME", (4, i), (4, i), "Helvetica-Bold"),
                        ]
                    )
                )
            elif skor_val <= 5:
                t.setStyle(
                    TableStyle(
                        [
                            (
                                "TEXTCOLOR",
                                (4, i),
                                (4, i),
                                colors.HexColor("#CC5500"),
                            ),  # oranye
                        ]
                    )
                )

        story.append(t)
        story.append(Spacer(1, 0.3 * cm))
        story.append(
            Paragraph(
                "<i>Keterangan: Skor <b>0</b> (merah tebal) sangat mungkin disebabkan oleh kegagalan sistem atau "
                "peserta tidak menjawab. Disarankan untuk verifikasi manual.</i>",
                styles["Italic"],
            )
        )

    story.append(Spacer(1, 0.4 * cm))
    story.append(HRFlowable(width="80%", thickness=0.5, color=colors.grey))

    # ---- BAGIAN D: STATISTIK HARIAN ----
    story.append(Paragraph("D. STATISTIK HARIAN", h2_style))
    if stat_harian.empty:
        story.append(Paragraph("Tidak cukup data untuk statistik harian.", normal))
    else:
        table_data = [["Tanggal", "Mapel", "Peserta", "Rata²", "Median", "Std Dev"]]
        for _, row in stat_harian.iterrows():
            tgl_str = row["Tanggal"].strftime("%d/%m/%Y")
            table_data.append(
                [
                    tgl_str,
                    str(int(row["Jumlah_Mapel"])),
                    str(int(row["Jumlah_Peserta"])),
                    f"{row['Rata_Skor']:.1f}",
                    f"{row['Median_Skor']:.0f}",
                    f"{row['Std_Skor']:.1f}" if not pd.isna(row["Std_Skor"]) else "-",
                ]
            )
        t = Table(
            table_data,
            colWidths=[3 * cm, 2 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm],
        )
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2E86C1")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#EBF5FB")],
                    ),
                ]
            )
        )
        story.append(t)

    doc.build(story)
    print(f"✅ Laporan lengkap tersimpan di: {pdf_path}")


if __name__ == "__main__":
    main()
