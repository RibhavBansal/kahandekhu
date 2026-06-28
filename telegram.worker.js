// KahanDekhu — Telegram bot (Cloudflare Worker)
// Users message a title (or "where to watch X") → instant "where to watch in India" reply.
// Free, unlimited, no verification. Reuses the TMDB proxy — no extra data source.
//
// Endpoint: POST /  (Telegram webhook)
// Vars (wrangler):  TMDB_PROXY, APP_URL
// Secrets:          BOT_TOKEN (from @BotFather), WEBHOOK_SECRET (any random string)

const REGIONS = [["IN","India","🇮🇳"],["US","USA","🇺🇸"],["GB","UK","🇬🇧"],["AE","UAE","🇦🇪"],["CA","Canada","🇨🇦"],["AU","Australia","🇦🇺"],["SG","Singapore","🇸🇬"]];
const IMG = "https://image.tmdb.org/t/p";   // TMDB poster CDN (free)

export default {
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("kahandekhu-telegram", { status: 200 });
    // Verify the request really came from Telegram (matches the secret set on setWebhook).
    if (env.WEBHOOK_SECRET && req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    let update;
    try { update = await req.json(); } catch { return new Response("ok"); }
    try {
      if (update.callback_query) {
        await handleCallback(update.callback_query, env);   // user tapped a disambiguation option
      } else {
        const msg = update.message || update.edited_message;
        if (msg && msg.chat && typeof msg.text === "string") {
          await handle(msg.chat.id, msg.text.trim(), env);
        }
      }
    } catch (e) { /* never fail the webhook — Telegram retries on non-200 */ }
    return new Response("ok", { status: 200 });
  },
};

const HELP =
  "👋 <b>Namaste! I'm KahanDekhu</b> — your where-to-watch buddy for India 🇮🇳\n\n" +
  "Send me any movie or show and I'll tell you <b>exactly where it's streaming in India</b> — free.\n" +
  "Try: <b>Jawan</b> · <b>Panchayat</b> · <b>Animal</b>\n\n" +
  "🎬 I check <b>Netflix, JioHotstar, Prime Video, SonyLIV, ZEE5, Apple TV+ &amp; more</b> — and tell you if it's subscription, free, rent or buy.\n\n" +
  "⭐ <b>The free app does so much more:</b>\n" +
  "🔔 Get a reminder the moment a title starts streaming in India\n" +
  "📥 Save a watchlist that syncs across all your devices\n" +
  "🗣️ Browse by language — Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali &amp; more\n" +
  "📺 Add your apps → instantly see what you can already watch\n" +
  "✨ Personalised picks based on what you save\n" +
  "🌍 Not in India yet? See which countries have it\n" +
  "🇮🇳 App in 10 Indian languages · works offline · no login needed\n\n" +
  "Type a title now, or tap below to open the app 👇\n" +
  "Send /features to see everything I can do.";

const FEATURES =
  "✨ <b>Why KahanDekhu</b> — built for India 🇮🇳\n\n" +
  "🔎 <b>Find where to watch</b> any movie or web series across Netflix, JioHotstar, Prime Video, SonyLIV, ZEE5, Apple TV+, Sun NXT, aha &amp; more — split into <b>subscription, free, rent &amp; buy</b>.\n\n" +
  "🔔 <b>Streaming reminders</b> — we ping you the moment a title lands on OTT in India.\n" +
  "📥 <b>Watchlist</b> — save titles, synced across your phone, laptop &amp; tablet.\n" +
  "🗣️ <b>Regional languages</b> — browse Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi &amp; Punjabi.\n" +
  "📺 <b>My Services</b> — pick the apps you pay for; we flag what you can already watch.\n" +
  "✨ <b>For You</b> — personalised recommendations from your watchlist.\n" +
  "🌍 <b>Multi-region</b> — not in India? See which countries stream it (perfect for NRIs).\n" +
  "🌐 <b>10 Indian languages</b> — the whole app, including descriptions.\n" +
  "🎲 <b>Discover</b> — trending, in cinemas, top rated &amp; a “Surprise me” pick.\n\n" +
  "💯 Free · no login needed · installs like an app · works offline.\n\n" +
  "Tap below to start 👇";

// Rotating one-line teasers appended to each where-to-watch reply — keeps repeat
// users discovering new reasons to install, without bloating every message.
const TIPS = [
  "🔔 Want a ping the moment it hits OTT in India? The free app does that.",
  "📥 Save this to your watchlist — synced across all your devices, free.",
  "🗣️ Browse Tamil, Telugu, Hindi &amp; more in the free app.",
  "📺 Add your apps in the app → instantly see what you can already watch.",
  "✨ Get personalised picks based on what you save — free.",
  "🌍 Travelling or abroad? Switch regions to see where it streams worldwide.",
];

async function handle(chatId, text, env) {
  if (/^\/(features|about|app)\b/i.test(text)) {
    return tgSend(chatId, FEATURES, env);
  }
  if (/^\/start\b/.test(text) || /^\/help\b/.test(text) || !cleanQuery(text)) {
    return tgSend(chatId, HELP, env);
  }
  const q = cleanQuery(text);
  try {
    const all = await searchTitles(env, q);
    if (!all.length) return tgSend(chatId, `🔍 I couldn't find <b>${esc(q)}</b>.\nCheck the spelling, or try the original title.`, env);

    // Build a tappable pick-list of options (one button per row).
    const buildRows = (list) => list.map(r => [{
      text: `${titleOfRaw(r)}${yearOfRaw(r) ? ` (${yearOfRaw(r)})` : ""} · ${r.media_type === "tv" ? "Series" : "Movie"}`.slice(0, 60),
      callback_data: `w:${r.media_type}:${r.id}`,
    }]);
    const exact = all.filter(r => norm(titleOfRaw(r)) === norm(q));
    // Several titles share the exact name (e.g. "Guilty") → let the user pick.
    if (exact.length > 1) {
      return tgSend(chatId, `🔎 There are a few titles called <b>${esc(q)}</b>. Which one do you mean?`, env, false, buildRows(exact.slice(0, 10)));
    }
    // No exact match (likely a typo / partial name) → show related matches instead of guessing.
    if (exact.length === 0 && all.length > 1) {
      return tgSend(chatId, `🤔 I couldn't find an exact match for <b>${esc(q)}</b>. Did you mean one of these?`, env, false, buildRows(all.slice(0, 10)));
    }

    const hit = exact[0] || all[0];
    const dr = await proxyFetch(env, `/${hit.media_type}/${hit.id}?append_to_response=watch/providers`);
    const d = await dr.json();
    return sendReply(chatId, d, env);
  } catch (e) {
    console.error("telegram handle error:", e && e.stack || String(e));
    return tgSend(chatId, "⚠️ Something went wrong fetching that. Please try again in a moment.", env);
  }
}

// Resolve a title/year off a raw search result (movie uses title/release_date, tv uses name/first_air_date).
// Search movies/TV, sorted by popularity. If a query returns nothing (common for
// mid-word typos — TMDB isn't fuzzy), retry with a shorter prefix of the query,
// which recovers most misspellings (e.g. "oppenhimer" → "oppenh" → Oppenheimer).
async function searchTitles(env, q) {
  const run = async (query) => {
    const r = await proxyFetch(env, `/search/multi?query=${encodeURIComponent(query)}&include_adult=false&region=IN`);
    const d = await r.json();
    return (d.results || [])
      .filter(x => x.media_type === "movie" || x.media_type === "tv")
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  };
  let all = await run(q);
  if (!all.length && q.length >= 5) {
    const prefix = q.slice(0, Math.max(4, Math.round(q.length * 0.6)));
    if (prefix && prefix !== q) all = await run(prefix);
  }
  return all;
}

function titleOfRaw(r) { return r.title || r.name || "Untitled"; }
function yearOfRaw(r) { return (r.release_date || r.first_air_date || "").slice(0, 4); }
function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

// User tapped one of the disambiguation buttons → fetch that exact title & answer.
async function handleCallback(cbq, env) {
  await answerCallback(cbq.id, env);   // stop Telegram's loading spinner
  const m = String(cbq.data || "").match(/^w:(movie|tv):(\d+)$/);
  const chat = cbq.message && cbq.message.chat;
  if (!m || !chat) return;
  try {
    const dr = await proxyFetch(env, `/${m[1]}/${m[2]}?append_to_response=watch/providers`);
    const d = await dr.json();
    await sendReply(chat.id, d, env);   // poster + answer
    // Remove the now-answered chooser to keep the thread tidy.
    try { await tgApi("deleteMessage", { chat_id: chat.id, message_id: cbq.message.message_id }, env); } catch (_) {}
  } catch (e) {
    console.error("telegram callback error:", e && e.stack || String(e));
    await tgSend(chat.id, "⚠️ Couldn't load that title. Please try again.", env);
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
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  return `${head}${body}\n\n💡 <b>Get the free KahanDekhu app</b> — built for India 🇮🇳\n${tip}\nSee all features: /features 👇`;
}

function appButtonRow(env) {
  const app = env.APP_URL || "https://kahandekhu.pages.dev";
  return [[{ text: "📲 Open KahanDekhu — free", url: app }]];
}
function tgApi(method, payload, env) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
// appButton=true adds the install CTA; pass `keyboard` (array of button rows) to show a custom
// keyboard instead (e.g. the disambiguation chooser).
async function tgSend(chatId, text, env, appButton = true, keyboard = null) {
  const body = {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  else if (appButton) body.reply_markup = { inline_keyboard: appButtonRow(env) };
  await tgApi("sendMessage", body, env);
}
// Acknowledge a button tap so Telegram stops showing the loading spinner.
function answerCallback(callbackQueryId, env) {
  return tgApi("answerCallbackQuery", { callback_query_id: callbackQueryId }, env);
}
// Send the where-to-watch answer as a poster image + caption (falls back to text when
// there's no poster, or the caption exceeds Telegram's 1024-char photo-caption limit).
async function sendReply(chatId, d, env) {
  const caption = formatReply(d, env);
  const poster = d.poster_path ? `${IMG}/w500${d.poster_path}` : null;
  if (poster && caption.length <= 1024) {
    await tgApi("sendPhoto", {
      chat_id: chatId,
      photo: poster,
      caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: appButtonRow(env) },
    }, env);
  } else {
    await tgSend(chatId, caption, env);
  }
}
