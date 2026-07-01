/**
 * KahanDekhu — Telegram bot + "notify me when it streams"
 * Cloudflare Worker (with D1 + Cron Trigger)
 *
 * What it does
 *  - User messages the bot a movie/show name → it searches TMDB and offers matches.
 *  - User picks a title:
 *      • If it's already streaming in India → bot tells them where.
 *      • If not → bot saves a reminder (D1) and pings them later when it lands.
 *  - The web app deep-links here: t.me/<bot>?start=movie_27205 auto-subscribes.
 *  - A cron trigger periodically re-checks every reminder and notifies + clears it.
 *
 * Secrets to set (wrangler secret put ...):
 *   BOT_TOKEN        — from @BotFather
 *   TMDB_API_KEY     — your free TMDB v3 key (same one is fine)
 *   WEBHOOK_SECRET   — any random string; also passed to Telegram setWebhook
 *
 * Binding (wrangler.toml): D1 database as DB
 */

const TMDB = 'https://api.themoviedb.org/3';
const REGION = 'IN';
const REGION_NAME = 'India';
const APP_URL = 'https://kahandekhu.in';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (request.method === 'GET') return new Response('KahanDekhu bot is running 🎬');
        if (request.method !== 'POST') return new Response('OK');
        
        // Verify the request really came from Telegram (secret token set at setWebhook time)
        if (env.WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
            return new Response('forbidden', { status: 403 });
        }
        
        let update;
        try { update = await request.json(); } catch (e) { return new Response('bad request', { status: 400 }); }
        
        // Respond to Telegram immediately; do the work in the background.
        ctx.waitUntil(handleUpdate(update, env).catch((e) => console.log('handle error', e)));
        return new Response('OK');
    },
    
    // Cron: re-check every reminder and notify when a title becomes available.
    async scheduled(event, env, ctx) {
        ctx.waitUntil(checkSubscriptions(env).catch((e) => console.log('cron error', e)));
    }
};

/* ---------------- routing ---------------- */
async function handleUpdate(update, env) {
    if (update.message) return handleMessage(update.message, env);
    if (update.callback_query) return handleCallback(update.callback_query, env);
}

const WELCOME =
'🎬 <b>KahanDekhu</b> — I find where to watch movies &amp; shows in India.\n\n' +
'Send me a title and I\'ll tell you where it\'s streaming. If it\'s not out yet, I\'ll <b>message you the moment it lands</b> on an Indian streaming service.\n\n' +
'Try: <i>Dune Part Two</i>\n\n' +
'Commands:\n/list — your reminders\n/help — how this works';

const HELP =
'<b>How it works</b>\n\n' +
'1. Send me a movie or show name.\n' +
'2. Pick the right title from the buttons.\n' +
'3. If it\'s streaming in ' + REGION_NAME + ', I\'ll show you where.\n' +
'4. If it isn\'t yet, I\'ll save a reminder and ping you when it arrives.\n\n' +
'/list — see or cancel your reminders\n\n' +
'Browse everything at ' + APP_URL;

async function handleMessage(msg, env) {
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    
    if (text.startsWith('/start')) {
        const payload = text.split(/\s+/)[1]; // deep-link param e.g. movie_27205
        if (payload && /^(movie|tv)_\d+$/.test(payload)) {
            const [type, id] = payload.split('_');
            return handleTitleChosen(chatId, type, parseInt(id, 10), env);
        }
        return sendMessage(env, chatId, WELCOME);
    }
    if (text.startsWith('/help')) return sendMessage(env, chatId, HELP);
    if (text.startsWith('/list')) return sendList(chatId, env);
    if (text.startsWith('/')) return sendMessage(env, chatId, 'Unknown command. Just send me a movie or show name to search. 🍿');
    if (!text) return sendMessage(env, chatId, 'Send me a movie or show name and I\'ll find where to watch it.');
    
    return doSearch(chatId, text, env);
}

async function handleCallback(cq, env) {
    const chatId = cq.message && cq.message.chat && cq.message.chat.id;
    const data = cq.data || '';
    await answerCallback(env, cq.id);
    if (!chatId) return;
    
    if (data.startsWith('pick:')) {
        const [, type, id] = data.split(':');
        return handleTitleChosen(chatId, type, parseInt(id, 10), env);
    }
    if (data.startsWith('unsub:')) {
        const subId = data.split(':')[1];
        await env.DB.prepare('DELETE FROM subscriptions WHERE id = ? AND chat_id = ?').bind(subId, chatId).run();
        return sendMessage(env, chatId, '🗑️ Reminder removed.');
    }
}

/* ---------------- search & pick ---------------- */
async function doSearch(chatId, query, env) {
    let results;
    try { results = await tmdbSearch(query, env); }
    catch (e) { return sendMessage(env, chatId, 'I couldn\'t reach the catalog right now — try again in a moment.'); }
    
    if (!results.length) {
        return sendMessage(env, chatId, `I couldn't find "<b>${esc(query)}</b>". Check the spelling, or try the original title.`);
    }
    const buttons = results.slice(0, 6).map((r) => {
        const type = r.media_type === 'tv' ? 'tv' : 'movie';
        const title = r.title || r.name || 'Untitled';
        const yr = (r.release_date || r.first_air_date || '').slice(0, 4);
        return [{ text: yr ? `${title} (${yr})` : title, callback_data: `pick:${type}:${r.id}` }];
    });
    return sendMessage(env, chatId, 'Which one?', { inline_keyboard: buttons });
}

async function handleTitleChosen(chatId, type, id, env) {
    let info;
    try { info = await tmdbTitle(type, id, env); }
    catch (e) { return sendMessage(env, chatId, 'Couldn\'t load that title — try again.'); }
    if (!info) return sendMessage(env, chatId, 'Couldn\'t load that title — try again.');
    
    const title = info.title || info.name || 'This title';
    const providers = getFlatrate(info, REGION);
    
    if (providers.length) {
        return sendMessage(env, chatId,
                           `✅ <b>${esc(title)}</b> is streaming in ${REGION_NAME} on:\n` +
                           providers.map((p) => `• ${esc(p)}`).join('\n') +
                           `\n\nOpen in the app → ${APP_URL}`);
    }
    
    // Not available → create a reminder (dedupe via unique index + explicit check)
    const existing = await env.DB
    .prepare('SELECT id FROM subscriptions WHERE chat_id = ? AND tmdb_id = ? AND media_type = ?')
    .bind(chatId, id, type).first();
    
    if (existing) {
        return sendMessage(env, chatId, `🔔 You're already on the list for <b>${esc(title)}</b>. I'll message you when it streams in ${REGION_NAME}.`);
    }
    
    try {
        await env.DB
        .prepare('INSERT INTO subscriptions (chat_id, tmdb_id, media_type, title, region, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(chatId, id, type, title, REGION, Date.now()).run();
    } catch (e) {
        return sendMessage(env, chatId, 'Hmm, I couldn\'t save that reminder. Please try again.');
    }
    
    return sendMessage(env, chatId,
                       `🔔 Done! <b>${esc(title)}</b> isn't on any ${REGION_NAME} streaming service yet.\n\n` +
                       `I'll message you the moment it lands on one. (Use /list to view or cancel.)`);
}

async function sendList(chatId, env) {
    const { results } = await env.DB
    .prepare('SELECT id, title FROM subscriptions WHERE chat_id = ? ORDER BY created_at DESC')
    .bind(chatId).all();
    
    if (!results || !results.length) {
        return sendMessage(env, chatId, 'You have no reminders yet. Send me a movie or show name to add one. 🍿');
    }
    const buttons = results.map((r) => [{ text: `❌ ${r.title}`, callback_data: `unsub:${r.id}` }]);
    return sendMessage(env, chatId, '🔔 <b>Your reminders</b> — tap to remove:', { inline_keyboard: buttons });
}

/* ---------------- cron: notify when available ---------------- */
async function checkSubscriptions(env) {
    const { results } = await env.DB.prepare('SELECT * FROM subscriptions').all();
    if (!results || !results.length) return;
    
    for (const sub of results) {
        try {
            const info = await tmdbTitle(sub.media_type, sub.tmdb_id, env);
            if (!info) continue;
            const providers = getFlatrate(info, sub.region || REGION);
            if (providers.length) {
                await sendMessage(env, sub.chat_id,
                                  `🎉 <b>${esc(sub.title)}</b> is now streaming in ${REGION_NAME}!\n\n` +
                                  `Watch it on:\n` + providers.map((p) => `• ${esc(p)}`).join('\n') +
                                  `\n\nOpen in the app → ${APP_URL}`);
                await env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(sub.id).run();
            }
        } catch (e) { /* skip this one, try the rest */ }
        await sleep(120); // be gentle on rate limits
    }
}

/* ---------------- TMDB ---------------- */
async function tmdbSearch(query, env) {
    const u = new URL(TMDB + '/search/multi');
    u.searchParams.set('api_key', env.TMDB_API_KEY);
    u.searchParams.set('query', query);
    u.searchParams.set('include_adult', 'false');
    u.searchParams.set('region', REGION);
    u.searchParams.set('language', 'en-IN');
    const r = await fetch(u);
    if (!r.ok) throw new Error('tmdb ' + r.status);
    const d = await r.json();
    return (d.results || [])
    .filter((x) => x.media_type === 'movie' || x.media_type === 'tv')
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
}
async function tmdbTitle(type, id, env) {
    const u = new URL(`${TMDB}/${type}/${id}`);
    u.searchParams.set('api_key', env.TMDB_API_KEY);
    u.searchParams.set('append_to_response', 'watch/providers');
    u.searchParams.set('language', 'en-IN');
    const r = await fetch(u);
    if (!r.ok) return null;
    return r.json();
}
function getFlatrate(info, region) {
    const res = info['watch/providers'] && info['watch/providers'].results;
    const wp = res && res[region];
    if (!wp || !wp.flatrate) return [];
    const seen = new Set(); const out = [];
    wp.flatrate.forEach((p) => { if (!seen.has(p.provider_name)) { seen.add(p.provider_name); out.push(p.provider_name); } });
    return out;
}

/* ---------------- Telegram helpers ---------------- */
function tg(env, method, body) {
    return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}
function sendMessage(env, chatId, html, replyMarkup) {
    const body = { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
    if (replyMarkup) body.reply_markup = replyMarkup;
    return tg(env, 'sendMessage', body);
}
function answerCallback(env, id) { return tg(env, 'answerCallbackQuery', { callback_query_id: id }); }

/* ---------------- utils ---------------- */
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
