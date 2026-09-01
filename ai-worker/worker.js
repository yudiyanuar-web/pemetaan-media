/**
 * Contoh backend untuk fitur "Ide kreatif dari AI" di dashboard.
 * Deploy sebagai Cloudflare Worker (gratis untuk trafik kecil-menengah).
 *
 * Worker ini yang menyimpan ANTHROPIC_API_KEY dengan aman (sebagai secret,
 * bukan di kode), lalu meneruskan permintaan dari browser ke Claude API.
 * Browser TIDAK PERNAH menyentuh API key secara langsung.
 *
 * Deploy singkat:
 *   npm install -g wrangler
 *   wrangler secret put ANTHROPIC_API_KEY
 *   wrangler deploy
 *
 * Lalu isi assets/config.js di dashboard dengan URL worker ini, contoh:
 *   window.AI_ENDPOINT = "https://ecc-jabar-ai.<subdomain>.workers.dev/suggest";
 */

const ALLOWED_ORIGIN = "*"; // ganti dengan domain GitHub Pages kamu sebelum production,
                             // misalnya "https://<username>.github.io"

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Body harus JSON" }, 400);
    }

    const { region, signal, gaps } = body;
    if (!region || !Array.isArray(gaps) || gaps.length === 0) {
      return json({ error: "Field 'region' dan 'gaps' wajib diisi" }, 400);
    }

    const prompt = buildPrompt(region, signal, gaps);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      return json({ error: "Anthropic API error", detail }, 502);
    }

    const data = await anthropicRes.json();
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    const ideas = parseIdeas(text);
    return json({ ideas });
  }
};

function buildPrompt(region, signal, gaps){
  const gapLines = gaps
    .map(g => `- ${g.jenis}: kebutuhan ${g.kebutuhan}%, penggunaan saat ini ${g.penggunaan}% (gap ${g.gap} poin)`)
    .join("\n");

  return `Kamu adalah asisten perencanaan media pembelajaran untuk dinas pendidikan di Jawa Barat, Indonesia.

Wilayah: ${region}
Kekuatan sinyal seluler: ${signal}
Data kesenjangan kebutuhan vs penggunaan media pembelajaran di wilayah ini:
${gapLines}

Untuk masing-masing dari 3 jenis media di atas (urutan sesuai gap terbesar), usulkan SATU bentuk media pembelajaran konkret yang cocok dikembangkan, dengan mempertimbangkan kekuatan sinyal wilayah (misalnya media ringan/offline-friendly untuk sinyal lemah). Bentuknya boleh berupa game edukasi sederhana, simulasi interaktif, video, modul, dsb — pilih yang paling relevan, jangan selalu sama.

Balas HANYA dalam format JSON array seperti ini, tanpa teks lain, tanpa markdown code fence:
[
  {"title": "judul singkat ide", "format": "jenis media/format", "description": "penjelasan singkat 1-2 kalimat kenapa ini cocok untuk wilayah ini"},
  ...
]`;
}

function parseIdeas(text){
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  // fallback kalau model tidak strict JSON: bungkus mentah supaya frontend tidak error
  return [{ title: "Saran AI", format: "", description: text.slice(0, 500) }];
}

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(obj, status = 200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}
