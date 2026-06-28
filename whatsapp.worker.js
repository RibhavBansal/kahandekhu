// KahanDekhu — WhatsApp bot (Cloudflare Worker)
// Users message a title (or "where to watch X") → instant "where to watch in India" reply.
// Reply-only: it always answers INSIDE the 24-hour customer window, so messages are FREE
// (service messages). It never sends business-initiated templates, so there is no cost.
//
// Endpoints:
//   GET  /webhook  → Meta webhook verification (hub.challenge)
//   POST /webhook  → incoming WhatsApp messages
//
// Vars (wrangler):   TMDB_PROXY, APP_URL, GRAPH_VERSION
// Secrets:           WHATSAPP_TOKEN (permanent access token), PHONE_NUMBER_ID, VERIFY_TOKEN

const REGIONS = [["IN","India","🇮🇳"],["US","USA","🇺🇸"],["GB","UK","🇬🇧"],["AE","UAE","🇦🇪"],["CA","Canada","🇨🇦"],["AU","Australia","🇦🇺"],["SG","Singapore","🇸🇬"]];

export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        
        // 1) Webhook verification handshake
        if (req.method === "GET" && url.pathname === "/webhook") {
            const mode = url.searchParams.get("hub.mode");
            const token = url.searchParams.get("hub.verify_token");
            const challenge = url.searchParams.get("hub.challenge");
            if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
                return new Response(challenge, { status: 200 });
            }
            return new Response("forbidden", { status: 403 });
        }
        
        // 2) Incoming messages
        if (req.method === "POST" && url.pathname === "/webhook") {
            let body;
            try { body = await req.json(); } catch { return new Response("ok"); }
            // Acknowledge fast; process in the background.
            try {
                const value = body?.entry?.[0]?.changes?.[0]?.value;
                const msg = value?.messages?.[0];
                if (msg && msg.from) {
                    if (msg.type === "text") {
                        await handleMessage(msg.from, (msg.text?.body || "").trim(), env);
                    } else if (msg.type === "interactive") {
                        // User tapped a disambiguation list option.
                        const id = msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id;
                        if (id) await handleSelection(msg.from, id, env);
                    }
                }
            } catch (e) { /* never fail the webhook — Meta retries on non-200 */ }
            return new Response("ok", { status: 200 });
        }
        
        return new Response("kahandekhu-whatsapp", { status: 200 });
    },
};

const HELP =
"👋 *KahanDekhu* — I tell you where to watch any movie or show in India.\n\n" +
"Just send me a title, e.g. *Jawan*, *Scam 1992*, or *where to watch Oppenheimer*.";

async function handleMessage(to, text, env) {
    const q = cleanQuery(text);
    if (!q || /^(hi|hello|hey|start|help|menu)$/i.test(text.trim())) {
        return send(to, HELP, env);
    }
    try {
        const sr = await proxyFetch(env, `/search/multi?query=${encodeURIComponent(q)}&include_adult=false&region=IN`);
        const sd = await sr.json();
        const all = (sd.results || []).filter(r => r.media_type === "movie" || r.media_type === "tv")
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        if (!all.length) {
            return send(to, `🔍 I couldn't find *"${q}"*.\nCheck the spelling, or try the original title.`, env);
        }
        // Several titles share the exact name (e.g. "Guilty") → let the user pick.
        const exact = all.filter(r => norm(titleOfRaw(r)) === norm(q));
        if (exact.length > 1) {
            return sendChooser(to, q, exact.slice(0, 10), env);
        }
        const hit = exact[0] || all[0];
        const dr = await proxyFetch(env, `/${hit.media_type}/${hit.id}?append_to_response=watch/providers`);
        const d = await dr.json();
        return send(to, formatReply(d, hit.media_type, env), env);
    } catch (e) {
        return send(to, "⚠️ Something went wrong fetching that. Please try again in a moment.", env);
    }
}

// User picked an option from the disambiguation list.
async function handleSelection(to, id, env) {
    const m = String(id || "").match(/^w:(movie|tv):(\d+)$/);
    if (!m) return;
    try {
        const dr = await proxyFetch(env, `/${m[1]}/${m[2]}?append_to_response=watch/providers`);
        const d = await dr.json();
        return send(to, formatReply(d, m[1], env), env);
    } catch (e) {
        return send(to, "⚠️ Couldn't load that title. Please try again.", env);
    }
}

function titleOfRaw(r) { return r.title || r.name || "Untitled"; }
function yearOfRaw(r) { return (r.release_date || r.first_air_date || "").slice(0, 4); }
function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

function cleanQuery(text) {
    return String(text || "")
    .replace(/where (can i |to )?watch/gi, "")
    .replace(/kah?an?\s*dekhu/gi, "")
    .replace(/is .* (streaming|available)/gi, "")
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

function formatReply(d, type, env) {
    const title = d.title || d.name || "Untitled";
    const year = (d.release_date || d.first_air_date || "").slice(0, 4);
    const rating = (typeof d.vote_average === "number" && d.vote_average > 0) ? ` · ⭐ ${d.vote_average.toFixed(1)}` : "";
    const head = `🎬 *${title}*${year ? ` (${year})` : ""}${rating}`;
    
    const results = (d["watch/providers"] && d["watch/providers"].results) || {};
    const inIN = results.IN;
    let body = "";
    
    if (inIN) {
        const flat = dedupe([...(inIN.flatrate || []), ...(inIN.free || []), ...(inIN.ads || [])]);
        const rent = dedupe([...(inIN.rent || []), ...(inIN.buy || [])]);
        if (flat.length) body = `\n\n✅ *Streaming in India* 🇮🇳\n${flat.map(p => "• " + p).join("\n")}`;
        else if (rent.length) body = `\n\n💳 *In India* 🇮🇳 — rent/buy on:\n${rent.map(p => "• " + p).join("\n")}`;
    }
    if (!body) {
        const others = [];
        REGIONS.forEach(([code, name, flag]) => {
            if (code === "IN") return;
            const r = results[code];
            if (r && ((r.flatrate || []).length || (r.free || []).length || (r.ads || []).length)) others.push(`${flag} ${name}`);
        });
        body = others.length
        ? `\n\n❌ Not streaming in India yet.\n🌍 *Available in:* ${others.join(" · ")}`
        : `\n\n❌ Not on any streaming platform we can find yet.`;
    }
    return `${head}${body}\n\n📲 Save it to your watchlist & get a reminder when it lands — open KahanDekhu:\n${env.APP_URL}`;
}

async function send(to, text, env) {
    const v = env.GRAPH_VERSION || "v21.0";
    await fetch(`https://graph.facebook.com/${v}/${env.PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000), preview_url: true } }),
    });
}

// Disambiguation chooser as a WhatsApp interactive LIST (up to 10 rows). Still a free
// service message (sent inside the user-initiated 24h window). Row id = w:<type>:<id>;
// tapping it comes back as an interactive list_reply → handleSelection().
async function sendChooser(to, q, opts, env) {
    const v = env.GRAPH_VERSION || "v21.0";
    const rows = opts.map(r => ({
        id: `w:${r.media_type}:${r.id}`.slice(0, 200),
        title: `${titleOfRaw(r)}${yearOfRaw(r) ? ` (${yearOfRaw(r)})` : ""}`.slice(0, 24),   // WA limit: 24 chars
        description: (r.media_type === "tv" ? "Series" : "Movie").slice(0, 72),
    }));
    const payload = {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "list",
            body: { text: `🔎 There are a few titles called *${q}*. Which one do you mean?`.slice(0, 1024) },
            action: { button: "Choose a title", sections: [{ title: "Results", rows }] },
        },
    };
    await fetch(`https://graph.facebook.com/${v}/${env.PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}
