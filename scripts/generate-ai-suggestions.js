#!/usr/bin/env node
/**
 * Generate saran AI untuk SEMUA wilayah sekaligus, lalu simpan hasilnya ke
 * data/ai-suggestions.json — supaya bisa di-commit ke repo dan dibaca semua
 * orang tanpa perlu API key atau backend live.
 *
 * Jalankan sekali di komputer kamu (bukan di browser), setiap kali data
 * kebutuhan/penggunaan media di media-mapping.json diperbarui:
 *
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *   node scripts/generate-ai-suggestions.js
 *   git add data/ai-suggestions.json
 *   git commit -m "chore: perbarui saran AI"
 *
 * Setelah itu dashboard otomatis membaca file ini duluan (lihat assets/script.js),
 * tanpa perlu backend/worker apa pun untuk pengunjung biasa.
 */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "media-mapping.json");
const OUT_PATH = path.join(__dirname, "..", "data", "ai-suggestions.json");
const MODEL = "claude-haiku-4-5-20251001"; // model murah & cepat, cukup untuk tugas ini

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY belum di-set. Contoh:\n  export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }

  const mapping = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const results = {};

  for (const region of mapping.regions) {
    const top3 = [...region.media].sort((a, b) => b.gap - a.gap).slice(0, 3);
    console.log(`Generating: ${region.name}...`);

    try {
      const ideas = await generateForRegion(apiKey, region, top3);
      results[region.id] = {
        region: region.name,
        generatedAt: new Date().toISOString(),
        model: MODEL,
        ideas
      };
    } catch (err) {
      console.error(`  Gagal untuk ${region.name}: ${err.message}`);
    }

    // jeda kecil supaya tidak kena rate limit
    await new Promise(r => setTimeout(r, 400));
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nSelesai. Tersimpan di ${path.relative(process.cwd(), OUT_PATH)}`);
}

async function generateForRegion(apiKey, region, top3) {
  const gapLines = top3
    .map(m => `- ${m.type}: kebutuhan ${m.need}%, penggunaan ${m.usage}% (gap ${m.gap} poin)`)
    .join("\n");

  const prompt = `Kamu adalah asisten perencanaan media pembelajaran untuk dinas pendidikan di Jawa Barat, Indonesia.

Wilayah: ${region.name}
Data kesenjangan kebutuhan vs penggunaan media pembelajaran:
${gapLines}

Untuk masing-masing dari 3 jenis media di atas, usulkan SATU bentuk media pembelajaran konkret yang cocok dikembangkan. Bentuknya boleh game edukasi sederhana, simulasi, video, modul, dsb — pilih yang paling relevan, jangan selalu sama.

Balas HANYA dalam format JSON array, tanpa teks lain, tanpa markdown code fence:
[{"title": "...", "format": "...", "description": "..."}, ...]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

main();
