/*
 * Dashboard Pemetaan Media Pembelajaran — Jawa Barat
 * Semua logika rekomendasi di sini bersifat rule-based (berdasarkan gap
 * kebutuhan vs penggunaan pada data), TIDAK menggunakan AI/LLM.
 * Lihat README.md untuk cara mengganti data contoh dengan data asli.
 */

const GAP_HIGH = 25; // di atas ini dianggap prioritas tinggi
const GAP_MID = 10;

let STATE = { regions: [], mediaTypes: [], active: null, chart: null, provinceChart: null, savedSuggestions: {} };

function gapLevel(gap){
  if (gap >= GAP_HIGH) return "high";
  if (gap >= GAP_MID) return "mid";
  return "low";
}

function gapLabel(gap){
  if (gap >= GAP_HIGH) return "Gap tinggi";
  if (gap >= GAP_MID) return "Gap sedang";
  return "Gap rendah";
}

async function loadData(){
  const res = await fetch("data/media-mapping.json");
  const json = await res.json();
  STATE.regions = json.regions;
  STATE.mediaTypes = json.mediaTypes;
  renderHeroStats(json);
  renderRegionList(json.regions);
  renderProvinceChart(json);

  // Saran AI yang sudah pernah digenerate & disimpan di repo (lihat data/ai-suggestions.json).
  // Kalau file ini tidak ada / gagal dimuat, dashboard tetap jalan normal (fallback ke tombol live).
  try {
    const aiRes = await fetch("data/ai-suggestions.json");
    if (aiRes.ok) STATE.savedSuggestions = await aiRes.json();
  } catch {
    STATE.savedSuggestions = {};
  }
}

function renderHeroStats(json){
  const regions = json.regions;
  const avgGap = Math.round(regions.reduce((s,r)=>s+r.gap,0)/regions.length);

  // jenis media dengan rata-rata gap tertinggi se-provinsi
  const byMedia = {};
  json.mediaTypes.forEach(t => byMedia[t] = []);
  regions.forEach(r => r.media.forEach(m => byMedia[m.type].push(m.gap)));
  let topMedia = json.mediaTypes[0], topMediaGap = -Infinity;
  Object.entries(byMedia).forEach(([type, gaps]) => {
    const avg = gaps.reduce((a,b)=>a+b,0)/gaps.length;
    if (avg > topMediaGap){ topMediaGap = avg; topMedia = type; }
  });

  const topRegion = [...regions].sort((a,b)=>b.gap-a.gap)[0];

  document.getElementById("stat-total-wilayah").textContent = regions.length;
  document.getElementById("stat-avg-gap").textContent = avgGap + " poin";
  document.getElementById("stat-top-media").textContent = topMedia;
  document.getElementById("stat-top-region").textContent = topRegion.name;
}

function renderRegionList(regions){
  const ul = document.getElementById("region-list");
  ul.innerHTML = "";
  regions.forEach(r => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "region-item";
    btn.type = "button";
    btn.dataset.id = r.id;
    btn.innerHTML = `<span>${r.name}</span><span class="gap-pill ${gapLevel(r.gap)}">${gapLabel(r.gap)}</span>`;
    btn.addEventListener("click", () => selectRegion(r.id));
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function selectRegion(id){
  const region = STATE.regions.find(r => r.id === id);
  if (!region) return;
  STATE.active = region;

  document.querySelectorAll(".region-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  document.getElementById("detail-empty").hidden = true;
  const content = document.getElementById("detail-content");
  content.hidden = false;

  document.getElementById("detail-name").textContent = region.name;
  const badge = document.getElementById("detail-gap-badge");
  badge.textContent = `Gap ${region.gap} poin`;
  badge.style.color = region.gap >= GAP_HIGH ? "var(--coral)" : region.gap >= GAP_MID ? "var(--gold)" : "var(--teal)";

  renderDetailChart(region);
  renderRecommendations(region);
  renderSavedOrEmptyAi(region);

  document.getElementById("detail-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- Ide kreatif dari AI ---------- */

function renderSavedOrEmptyAi(region){
  const saved = STATE.savedSuggestions[region.id];
  const btn = document.getElementById("ai-btn");
  const box = document.getElementById("ai-result");

  if (saved && saved.ideas && saved.ideas.length){
    box.hidden = false;
    const when = saved.generatedAt ? new Date(saved.generatedAt).toLocaleDateString("id-ID", { year: "numeric", month: "long" }) : "";
    box.innerHTML = `<p class="ai-saved-note">Tersimpan di repo${when ? " · dibuat " + when : ""}${saved.model ? " · model: " + saved.model : ""}</p>` +
      saved.ideas.map(renderIdeaCard).join("");
    btn.textContent = "Buat ulang dengan AI";
  } else {
    box.hidden = true;
    box.innerHTML = "";
    btn.textContent = "Buatkan ide media";
  }
  btn.disabled = false;
}

function renderIdeaCard(idea){
  return `
    <div class="ai-idea">
      <div class="ai-idea-title">${idea.title || idea.format}</div>
      <div class="ai-idea-format">${idea.format || ""}</div>
      <p class="ai-idea-desc">${idea.description || ""}</p>
    </div>
  `;
}

async function requestAiSuggestion(){
  const region = STATE.active;
  if (!region) return;

  const btn = document.getElementById("ai-btn");
  const box = document.getElementById("ai-result");
  btn.disabled = true;
  btn.textContent = "Meminta ide…";
  box.hidden = true;

  // 3 media dengan gap terbesar = konteks yang dikirim ke AI
  const topGaps = [...region.media].sort((a,b)=>b.gap-a.gap).slice(0,3);

  try {
    let ideas;
    if (window.AI_ENDPOINT) {
      ideas = await callAiEndpoint(region, topGaps);
    } else {
      ideas = await mockAiSuggestion(region, topGaps); // mode demo, tanpa backend
    }
    renderAiResult(ideas, !window.AI_ENDPOINT);
  } catch (err) {
    box.hidden = false;
    box.innerHTML = `<p class="ai-error">Gagal mengambil saran AI (${err.message}). Coba lagi, atau cek konfigurasi AI_ENDPOINT di assets/config.js.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Buatkan ide media lain";
  }
}

async function callAiEndpoint(region, topGaps){
  const res = await fetch(window.AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      region: region.name,
      gaps: topGaps.map(m => ({ jenis: m.type, kebutuhan: m.need, penggunaan: m.usage, gap: m.gap }))
    })
  });
  if (!res.ok) throw new Error(`server merespons ${res.status}`);
  const data = await res.json();
  // Backend diharapkan mengembalikan: { ideas: [{ title, format, description }, ...] }
  return data.ideas || [];
}

// Placeholder lokal supaya prototipe tetap bisa dicoba tanpa backend AI.
// Ini BUKAN AI sungguhan — hanya contoh struktur output yang akan dikembalikan backend nanti.
async function mockAiSuggestion(region, topGaps){
  await new Promise(r => setTimeout(r, 500));
  const templates = {
    "Video Pembelajaran": { format: "Seri video pendek 3–5 menit", description: "Video per sub-topik dengan animasi sederhana, ringan agar mudah diakses." },
    "Modul Interaktif / E-learning": { format: "Modul web interaktif ringan", description: "Modul dengan kuis dan umpan balik langsung." },
    "Media Cetak": { format: "Lembar kerja & poster cetak", description: "Materi cetak sebagai pelengkap materi digital." },
    "Podcast / Audio Pembelajaran": { format: "Podcast audio 10–15 menit", description: "Format audio ringan, mudah didengarkan berulang." },
    "Game Edukasi & Simulasi": { format: "Game edukasi sederhana berbasis HTML5", description: "Game ringan (mis. kuis bertingkat atau simulasi drag-and-drop) yang jalan di browser tanpa instalasi." }
  };
  return topGaps.map(m => ({
    title: `Prioritas: ${m.type}`,
    format: templates[m.type]?.format || "Media pembelajaran baru",
    description: templates[m.type]?.description || `Kembangkan ${m.type} untuk menutup gap ${m.gap} poin di ${region.name}.`
  }));
}

function renderAiResult(ideas, isDemo){
  const box = document.getElementById("ai-result");
  box.hidden = false;
  const demoNote = isDemo
    ? `<p class="ai-demo-note">Mode demo — ini bukan hasil AI sungguhan. Sambungkan assets/config.js ke backend AI kamu untuk hasil nyata.</p>`
    : `<p class="ai-saved-note">Baru saja digenerate ulang (belum disimpan ke repo — commit data/ai-suggestions.json kalau mau dipermanenkan).</p>`;
  box.innerHTML = demoNote + ideas.map(renderIdeaCard).join("");
}

function renderRecommendations(region){
  const list = document.getElementById("reco-list");
  list.innerHTML = "";
  // ambil 3 media dengan gap terbesar sebagai rekomendasi utama
  const top3 = [...region.media].sort((a,b)=>b.gap-a.gap).slice(0,3);
  top3.forEach(m => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span></span>
      <span>
        <div class="reco-media">${m.type}</div>
        <div class="reco-detail">Kebutuhan ${m.need}% · Penggunaan saat ini ${m.usage}%</div>
      </span>
      <span class="reco-gap">+${m.gap}</span>
    `;
    list.appendChild(li);
  });
}

function renderDetailChart(region){
  const ctx = document.getElementById("detail-chart");
  const labels = region.media.map(m => m.type);
  const need = region.media.map(m => m.need);
  const usage = region.media.map(m => m.usage);

  if (STATE.chart) STATE.chart.destroy();
  STATE.chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Kebutuhan", data: need, backgroundColor: "#D9A441" },
        { label: "Penggunaan saat ini", data: usage, backgroundColor: "#4E9B84" }
      ]
    },
    options: chartOptions()
  });
}

function renderProvinceChart(json){
  const ctx = document.getElementById("province-chart");
  const labels = json.mediaTypes;
  const need = labels.map(type => avgFor(json.regions, type, "need"));
  const usage = labels.map(type => avgFor(json.regions, type, "usage"));

  STATE.provinceChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Rata-rata kebutuhan", data: need, backgroundColor: "#D9A441" },
        { label: "Rata-rata penggunaan", data: usage, backgroundColor: "#4E9B84" }
      ]
    },
    options: chartOptions()
  });
}

function avgFor(regions, type, key){
  const values = regions.map(r => r.media.find(m => m.type === type)[key]);
  return Math.round(values.reduce((a,b)=>a+b,0)/values.length);
}

function chartOptions(){
  return {
    responsive: true,
    plugins: {
      legend: { labels: { color: "#F1EFE7", font: { family: "Inter" } } }
    },
    scales: {
      x: { ticks: { color: "#9FADC7", font: { family: "Inter", size: 11 } }, grid: { color: "rgba(234,238,231,0.08)" } },
      y: { ticks: { color: "#9FADC7" }, grid: { color: "rgba(234,238,231,0.08)" }, suggestedMax: 100 }
    }
  };
}

function setupSearch(){
  const input = document.getElementById("region-search");
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll(".region-item").forEach(el => {
      const match = el.textContent.toLowerCase().includes(q);
      el.parentElement.style.display = match ? "" : "none";
    });
  });
}

loadData();
setupSearch();
document.getElementById("ai-btn").addEventListener("click", requestAiSuggestion);
