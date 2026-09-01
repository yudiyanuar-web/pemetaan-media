# Backend AI untuk fitur "Ide kreatif dari AI"

Worker kecil (Cloudflare Workers, ada free tier) yang menjadi perantara antara dashboard
dan Claude API — supaya API key Anthropic tidak pernah ada di kode frontend/GitHub.

## Kenapa perlu backend, tidak bisa langsung dari browser?

Kalau `ANTHROPIC_API_KEY` ditaruh langsung di `assets/script.js` atau `config.js`, siapa pun
yang buka dashboard bisa melihat dan memakai key itu (semua kode di browser bisa dilihat lewat
"View Source"). Karena itu panggilan ke Claude API harus lewat server yang menyimpan key sebagai
secret, dan dashboard cukup memanggil server itu.

## Model AI apa yang dipakai, dan kenapa

Worker ini memakai **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) dari Anthropic — bukan model
yang lebih besar (Sonnet/Opus) — karena tugasnya memang ringan: mengubah 3 baris data gap jadi
3 ide singkat berformat JSON. Tidak butuh reasoning berat, jadi model termurah & tercepat sudah
cukup dan hasilnya tetap relevan.

Perbandingan harga per Agustus 2026 (per 1 juta token, input/output terpisah):

| Model | Input | Output | Cocok untuk |
|---|---|---|---|
| **Claude Haiku 4.5** (dipakai di sini) | $1 | $5 | Tugas ringan, terstruktur, respons cepat |
| Claude Sonnet 5 | $2–3 | $10–15 | Tugas dengan nuansa/reasoning lebih dalam |
| Claude Opus 5 | $5 | $25 | Tugas kompleks, riset panjang, coding berat |

Alternatif di luar Anthropic (kalau mau bandingkan): **OpenAI GPT-4o mini** dan **Google Gemini
Flash** juga masuk kategori "murah & cepat" yang setara dengan Haiku untuk tugas seringan ini.
Perbedaan utamanya cuma di kualitas bahasa/konteks lokal Indonesia — dari pengalaman umum, model
kelas Haiku/GPT-4o-mini/Gemini Flash semuanya cukup baik berbahasa Indonesia untuk kasus seperti
ini, jadi pilih yang paling gampang kamu integrasikan.

### Perkiraan biaya per klik

Prompt yang dikirim (lihat `buildPrompt()` di `worker.js`) sekitar ~250–350 token, responsnya
(JSON 3 ide singkat) sekitar ~250–400 token. Estimasi biaya per klik tombol "Buatkan ide media":

```
input:  300 token  ×  $1  / 1.000.000  ≈ $0.0003
output: 350 token  ×  $5  / 1.000.000  ≈ $0.0018
------------------------------------------------
total per klik                        ≈ $0.002  (~Rp 33, kurs ~Rp16.500/USD)
```

Artinya 1.000 klik ≈ $2, dan 27 wilayah × 1 kali generate ≈ $0.06. Sangat murah — bahkan tidak
perlu caching di awal, tapi kalau trafiknya nanti tinggi, README sebelumnya (bagian "Soal biaya")
tetap punya saran caching per wilayah.

## Prompt yang dipakai (ringkas & terstruktur, bukan open-ended)

Prompt-nya sengaja dibuat pendek dan minta output JSON langsung, bukan esai — ini yang bikin
token-nya kecil. Isinya kurang lebih:

```
Kamu adalah asisten perencanaan media pembelajaran untuk dinas pendidikan
di Jawa Barat, Indonesia.

Wilayah: {nama wilayah}
Kekuatan sinyal seluler: {Kuat/Sedang/Lemah}
Data kesenjangan kebutuhan vs penggunaan media pembelajaran:
- {jenis media}: kebutuhan {n}%, penggunaan {n}% (gap {n} poin)
... (3 baris)

Untuk masing-masing dari 3 jenis media di atas, usulkan SATU bentuk media
pembelajaran konkret yang cocok dikembangkan, dengan mempertimbangkan
kekuatan sinyal wilayah (mis. media ringan/offline-friendly untuk sinyal
lemah). Bentuknya boleh game edukasi sederhana, simulasi, video, modul,
dsb — pilih yang paling relevan, jangan selalu sama.

Balas HANYA dalam format JSON array, tanpa teks lain:
[{"title": "...", "format": "...", "description": "..."}, ...]
```

Kenapa hemat token:
- Tidak ada instruksi bertele-tele atau contoh panjang
- Minta output JSON langsung (bukan minta AI "jelaskan dulu baru simpulkan")
- `max_tokens` di-set 500 sebagai batas atas, jadi AI tidak bisa "ngoceh" kepanjangan
- Konteks yang dikirim cuma 3 baris data, bukan seluruh dataset 27 wilayah

Prompt lengkapnya ada di fungsi `buildPrompt()` dalam `worker.js` — tinggal disesuaikan kalau
mau ganti gaya bahasa atau tambah aturan lain.

## Cara deploy

1. Buat akun Cloudflare (gratis) kalau belum punya.
2. Install wrangler:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
3. Dari folder `ai-worker/`, simpan API key sebagai secret (bukan di file):
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   # tempel API key kamu saat diminta
   ```
4. Deploy:
   ```bash
   wrangler deploy
   ```
   Wrangler akan menampilkan URL seperti `https://ecc-jabar-ai.<subdomain>.workers.dev`.
5. Sebelum production, ganti `ALLOWED_ORIGIN` di `worker.js` dari `"*"` menjadi domain
   GitHub Pages kamu, misalnya `"https://<username>.github.io"`, supaya endpoint ini
   tidak bisa dipakai sembarang situs lain.
6. Buka `assets/config.js` di root proyek, isi:
   ```js
   window.AI_ENDPOINT = "https://ecc-jabar-ai.<subdomain>.workers.dev";
   ```
7. Commit & push. Tombol "Buatkan ide media" di dashboard sekarang akan memanggil AI sungguhan.

## Alternatif selain Cloudflare Workers

Pola yang sama (backend kecil menyimpan API key, frontend fetch ke situ) juga bisa dibuat di:
- **Vercel Serverless Functions** / **Netlify Functions** — cocok kalau sudah pakai salah satunya
- **Google Cloud Functions** — kalau tim sudah di ekosistem Google (relevan karena situs asli
  memakai Google Sites/Sheets)

Strukturnya sama saja: terima request dari dashboard → panggil `api.anthropic.com/v1/messages`
dengan key rahasia → kembalikan hasil dalam bentuk JSON ke dashboard.

## Soal biaya

Setiap klik "Buatkan ide media" = satu panggilan ke Claude API = biaya kecil per panggilan
(bukan gratis, tapi murah — dalam kisaran sen dolar per panggilan untuk prompt sependek ini).
Untuk 27 wilayah, pertimbangkan **caching**: simpan hasil AI per wilayah (di KV storage
Cloudflare, atau bahkan cukup file JSON statis yang di-generate sekali lalu di-refresh berkala),
supaya tidak memanggil API berulang untuk wilayah yang sama.
