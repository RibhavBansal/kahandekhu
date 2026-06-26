// KahanDekhu — Telegram bot (Cloudflare Worker)
// Users message a title (or "where to watch X") → instant "where to watch in India" reply.
// Free, unlimited, no verification. Reuses the TMDB proxy — no extra data source.
//
// Endpoint: POST /  (Telegram webhook)
// Vars (wrangler):  TMDB_PROXY, APP_URL
// Secrets:          BOT_TOKEN (from @BotFather), WEBHOOK_SECRET (any random string)

const REGIONS = [["IN","India","🇮🇳"],["US","USA","🇺🇸"],["GB","UK","🇬🇧"],["AE","UAE","🇦🇪"],["CA","Canada","🇨🇦"],["AU","Australia","🇦🇺"],["SG","Singapore","🇸🇬"]];

export default {
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("kahandekhu-telegram", { status: 200 });
    // Verify the request really came from Telegram (matches the secret set on setWebhook).
    if (env.WEBHOOK_SECRET && req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    let update;
    try { update = await req.json(); } catch { return new Response("ok"); }
    const msg = update.message || update.edited_message;
    try {
      if (msg && msg.chat && typeof msg.text === "string") {
        await handle(msg.chat.id, msg.text.trim(), env);
      }
    } catch (e) { /* never fail the webhook — Telegram retries on non-200 */ }
    return new Response("ok", { status: 200 });
  },
};

const HELP =
  "👋 <b>KahanDekhu</b> — I tell you where to watch any movie or show in India.\n\n" +
  "Just send me a title, e.g. <b>Jawan</b>, <b>Scam 1992</b>, or “where to watch Oppenheimer”.";

async function handle(chatId, text, env) {
  if (/^\/start\b/.test(text) || /^\/help\b/.test(text) || !cleanQuery(text)) {
    return tgSend(chatId, HELP, env);
  }
  const q = cleanQuery(text);
  try {
    const sr = await proxyFetch(env, `/search/multi?query=${encodeURIComponent(q)}&include_adult=false&region=IN`);
    const sd = await sr.json();
    const hit = (sd.results || []).filter(r => r.media_type === "movie" || r.media_type === "tv")
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
    if (!hit) return tgSend(chatId, `🔍 I couldn't find <b>${esc(q)}</b>.\nCheck the spelling, or try the original title.`, env);
    const dr = await proxyFetch(env, `/${hit.media_type}/${hit.id}?append_to_response=watch/providers`);
    const d = await dr.json();
    return tgSend(chatId, formatReply(d, env), env);
  } catch (e) {
    console.error("telegram handle error:", e && e.stack || String(e));
    return tgSend(chatId, "⚠️ Something went wrong fetching that. Please try again in a moment.", env);
  }
}

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function cleanQuery(text) {
  return String(text || "")
    .replace(/^\/\w+\s*/g, "")
    .replace(/where (can i |to )?watch/gi, "")
    .replace(/kah?an?\s*dekhu/gi, "")
    .replace(/[?!.]+$/g, "")
    .trim();
}
function dedupe(arr) {
  const seen = new Set(), out = [];
  (arr || []).forEach(p => { if (!seen.has(p.provider_name)) { seen.add(p.provider_name); out.push(p.provider_name); } });
  return out;
}
// Calls the TMDB proxy via the service binding (env.TMDB) when available — a plain
// same-account Worker→Worker fetch to its public URL is blocked with error 1042.
function proxyFetch(env, path) {
  if (env.TMDB && typeof env.TMDB.fetch === "function") {
    return env.TMDB.fetch(new Request("https://tmdb-proxy" + path));
  }
  return fetch((env.TMDB_PROXY || "https://kahandekhu-tmdb.bansalribhav0987.workers.dev") + path);
}

function formatReply(d, env) {
  const title = d.title || d.name || "Untitled";
  const year = (d.release_date || d.first_air_date || "").slice(0, 4);
  const rating = (typeof d.vote_average === "number" && d.vote_average > 0) ? ` · ⭐ ${d.vote_average.toFixed(1)}` : "";
  const head = `🎬 <b>${esc(title)}</b>${year ? ` (${year})` : ""}${rating}`;

  const results = (d["watch/providers"] && d["watch/providers"].results) || {};
  const inIN = results.IN;
  let body = "";
  if (inIN) {
    const flat = dedupe([...(inIN.flatrate || []), ...(inIN.free || []), ...(inIN.ads || [])]);
    const rent = dedupe([...(inIN.rent || []), ...(inIN.buy || [])]);
    if (flat.length) body = `\n\n✅ <b>Streaming in India</b> 🇮🇳\n${flat.map(p => "• " + esc(p)).join("\n")}`;
    else if (rent.length) body = `\n\n💳 <b>In India</b> 🇮🇳 — rent/buy on:\n${rent.map(p => "• " + esc(p)).join("\n")}`;
  }
  if (!body) {
    const others = [];
    REGIONS.forEach(([code, name, flag]) => {
      if (code === "IN") return;
      const r = results[code];
      if (r && ((r.flatrate || []).length || (r.free || []).length || (r.ads || []).length)) others.push(`${flag} ${name}`);
    });
    body = others.length
      ? `\n\n❌ Not streaming in India yet.\n🌍 <b>Available in:</b> ${others.join(" · ")}`
      : `\n\n❌ Not on any streaming platform we can find yet.`;
  }
  return `${head}${body}\n\n📲 Save it to your watchlist & get a reminder when it lands — open KahanDekhu:\n${env.APP_URL || "https://kahandekhu.pages.dev"}`;
}

async function tgSend(chatId, text, env) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: false }),
  });
}
