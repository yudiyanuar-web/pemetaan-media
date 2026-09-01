# Pemetaan Media Pembelajaran — Jawa Barat (Prototipe)

Prototipe tampilan ulang untuk dashboard [pemetaan-media.bbgtkjabar.id](https://pemetaan-media.bbgtkjabar.id),
yang aslinya dibangun di Google Sites. Prototipe ini murni HTML/CSS/JS (tanpa proses build),
jadi bisa langsung dijalankan atau dipublikasikan ke GitHub Pages.

**Fitur utama:**
- Daftar 27 kabupaten/kota Jawa Barat, bisa dicari
- Klik satu wilayah → muncul grafik kebutuhan vs penggunaan per jenis media, plus
  **rekomendasi 3 media prioritas untuk dikembangkan** di wilayah itu
- Ringkasan tingkat provinsi (jenis media dengan gap tertinggi, wilayah paling prioritas, dst.)

## Menjalankan secara lokal

Karena dashboard mengambil `data/media-mapping.json` lewat `fetch()`, file harus dibuka lewat
server lokal, bukan langsung dobel-klik `index.html` (browser akan memblokir fetch dari `file://`).

```bash
# dari dalam folder ini
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

## Deploy ke GitHub Pages

1. Buat repo baru di GitHub, push seluruh isi folder ini ke branch `main`.
2. Buka **Settings → Pages** di repo tersebut.
3. Pilih source: `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Tunggu 1–2 menit, situs akan aktif di `https://<username>.github.io/<nama-repo>/`.

Tidak perlu Node.js, npm, atau proses build apa pun.

## Struktur file

```
index.html            # struktur halaman
assets/style.css       # semua styling (token warna & tipografi di bagian atas file)
assets/script.js        # logika: render daftar wilayah, chart, dan rekomendasi
data/media-mapping.json # SUMBER DATA — lihat catatan di bawah
```

## Soal data: apakah excel aslinya perlu disertakan?

**Data pada `data/media-mapping.json` saat ini adalah data contoh (dummy)**, dibuat hanya untuk
menunjukkan bentuk tampilan dan cara kerja fitur rekomendasi. Bukan data asli hasil pemetaan.

Beberapa hal yang perlu dipertimbangkan sebelum memasukkan data asli ke repo GitHub:

- **Kalau repo-nya publik**, sebaiknya jangan unggah file Excel mentah apa adanya — terutama jika
  berisi kolom seperti nama sekolah/guru, kontak pribadi, atau catatan internal yang tidak
  dimaksudkan untuk konsumsi publik. Yang perlu ditaruh cukup **hasil rekap/agregat** (skor
  kebutuhan & penggunaan per wilayah per jenis media) dalam bentuk JSON/CSV seperti struktur
  `media-mapping.json` ini — bukan spreadsheet kerja aslinya.
- Kalau repo-nya privat/internal, boleh saja excel aslinya ikut disertakan sebagai arsip, tapi
  dashboard tetap sebaiknya membaca dari file JSON/CSV hasil olahan, bukan langsung dari Excel
  (Excel tidak bisa dibaca langsung oleh JavaScript di browser tanpa proses konversi tambahan).
- Alternatif lain: simpan data di **Google Sheets** dan publish sebagai CSV, lalu `fetch()` dari
  situ — datanya tetap bisa diupdate tim tanpa harus push ulang ke GitHub tiap kali. Beri tahu
  saya kalau mau versi seperti ini, strukturnya cukup diubah sedikit di `script.js`.

### Cara mengganti dengan data asli

Ikuti struktur berikut di `data/media-mapping.json`:

```json
{
  "meta": { "judul": "...", "versi": "...", "diperbarui": "YYYY-MM" },
  "mediaTypes": ["Video Pembelajaran", "..."],
  "regions": [
    {
      "id": "kab-bandung",
      "name": "Kab. Bandung",
      "signal": "Sedang",
      "avgNeed": 0, "avgUsage": 0, "gap": 0,
      "media": [
        { "type": "Video Pembelajaran", "need": 80, "usage": 45, "gap": 35 }
      ]
    }
  ]
}
```

`need` dan `usage` dalam skala 0–100 (persentase/skor). `gap = need - usage`; nilai ini yang
dipakai script untuk menyusun urutan rekomendasi — jadi pastikan konsisten.

## Contoh nyata: game edukasi dibuat AI

Folder `games/tebak-wilayah-jabar.html` berisi contoh game edukasi HTML5 sungguhan (kuis tebak
wilayah Jawa Barat) — dibuat langsung oleh Claude, sekali jalan, sebagai file statis. Ini contoh
konkret dari **Pola A** yang disarankan di atas: AI (lewat Claude Code atau chat Claude biasa)
menulis kode game, developer/tim mereview sekali, lalu hasil jadinya disimpan di repo dan
ditautkan dari dashboard — bukan digenerate ulang tiap kali ada pengunjung yang klik.

**Cara mengembangkan pustaka game seperti ini untuk media lain:**
1. Lihat jenis media dengan gap tertinggi di dashboard (mis. dari panel rekomendasi tiap wilayah)
2. Minta Claude Code (atau Claude di claude.ai) membuatkan game/media serupa untuk topik itu —
   berikan konteks: mapel, jenjang, dan kondisi wilayah (sinyal lemah → game harus ringan & offline)
3. Review hasilnya, taruh di folder `games/` (atau `media/` untuk jenis lain), lalu tautkan dari
   panel "Sumber & kurasi" seperti contoh di atas
4. Ulangi untuk gap berikutnya — lama-lama pustaka media terisi tanpa harus memanggil AI di runtime

Alur ini jauh lebih murah dan konsisten kualitasnya dibanding membiarkan AI menulis kode game
utuh setiap kali pengunjung klik tombol di website (Pola B) — yang lambat, mahal, dan hasilnya
tidak terjamin lolos review sebelum sampai ke pengguna akhir.

## Tentang logika rekomendasi (dua lapis)

Dashboard ini punya dua sumber rekomendasi yang sengaja dipisah:

1. **"Media yang disarankan untuk dikembangkan"** — dihitung murni dari selisih (gap) antara
   skor kebutuhan dan skor penggunaan per jenis media, **bukan AI/LLM**. Karena datanya sudah
   terstruktur, aturan sederhana (urutkan berdasarkan gap terbesar) lebih transparan, murah,
   dan mudah diaudit — ini yang menentukan *jenis media apa* yang prioritas.

2. **"Ide kreatif dari AI"** (tombol di bawahnya) — memakai Claude API sungguhan untuk mengusulkan
   *bentuk konkret* dari media itu (misalnya "game edukasi HTML5 ringan" vs "video 5 menit" vs
   "podcast offline-friendly"), dengan mempertimbangkan konteks wilayah seperti kekuatan sinyal.
   Bagian kreatif seperti ini cocok untuk AI karena tidak butuh presisi angka, hanya butuh variasi
   ide yang relevan dengan konteks.

### Cara mengaktifkan AI sungguhan

Secara default (`assets/config.js` kosong), tombol AI jalan dalam **mode demo** — memakai contoh
saran statis, supaya prototipe tetap bisa dicoba langsung di GitHub Pages tanpa setup tambahan.

Untuk AI sungguhan:
1. Baca `ai-worker/README.md` — deploy backend kecil (Cloudflare Worker, contoh disediakan)
   yang menyimpan API key Claude dengan aman.
2. Isi `window.AI_ENDPOINT` di `assets/config.js` dengan URL backend tersebut.

**Penting:** API key Claude tidak boleh pernah ditaruh langsung di `assets/config.js` atau file
JS lain yang ikut di-push ke GitHub — karena repo (dan isi filenya) bisa dibaca siapa saja kalau
publik. Itu sebabnya perlu backend perantara seperti di `ai-worker/`.

## Kredit

Data asli & konsep: BBGP/BBGTK Provinsi Jawa Barat, versi 1.0 (November 2024).
Prototipe tampilan ini dibuat ulang sebagai bahan diskusi, bukan pengganti resmi.
