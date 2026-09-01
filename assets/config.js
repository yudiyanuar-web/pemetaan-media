/*
 * Konfigurasi fitur "Ide kreatif dari AI".
 *
 * AI_ENDPOINT harus menunjuk ke backend/serverless function KAMU SENDIRI
 * (bukan langsung ke api.anthropic.com), karena API key tidak boleh
 * ditaruh di file yang bisa dibaca publik seperti ini.
 *
 * Contoh Cloudflare Worker yang cocok dipakai sebagai backend tersedia
 * di folder /ai-worker — baca ai-worker/README.md untuk cara deploy.
 *
 * Kalau AI_ENDPOINT dibiarkan kosong (""), dashboard tetap jalan normal:
 * tombol "Buatkan ide media" akan memakai contoh saran statis (mode demo)
 * supaya prototipe ini tetap bisa dicoba langsung di GitHub Pages tanpa
 * server tambahan.
 */
window.AI_ENDPOINT = ""; // contoh: "https://ecc-jabar-ai.username.workers.dev/suggest"
