/**
 * KahanDekhu — TMDB proxy (Cloudflare Worker)
 * ------------------------------------------------------------------
 * Why this exists:
 *   • Hides your TMDB API key — it lives as an encrypted secret on the
 *     server, never in the browser.
 *   • Caches responses at Cloudflare's edge so you make far fewer TMDB
 *     calls and the app stays fast (and well within free limits).
 *   • Adds CORS so your web app can call it from the browser.
 *
 * Deploy: see the setup steps in chat. You only need to set ONE secret:
 *   TMDB_API_KEY  (your free TMDB v3 key)
 *
 * After deploying, point the app at this Worker:
 *   USE_PROXY = true
 *   API_BASE  = 'https://<your-worker>.<your-subdomain>.workers.dev'
 */

const TMDB = 'https://api.themoviedb.org/3';

// Only these TMDB path prefixes are allowed through — stops the Worker
// from becoming an open proxy for arbitrary requests.
const ALLOW = [
    '/search/multi',
    '/search/movie',
    '/search/tv',
    '/trending/',
    '/movie/',
    '/tv/',
    '/configuration',
];

// UI language code → m2m100 target language name (for free description auto-translation).
// Only languages we ship in the app. Anything else → no translation (English fallback).
const M2M = {
    hi: 'hindi', bn: 'bengali', ta: 'tamil', te: 'telugu', mr: 'marathi',
    kn: 'kannada', ml: 'malayalam', gu: 'gujarati', pa: 'punjabi',
};
// Only translate single-title detail calls, e.g. /movie/12345 or /tv/678.
const DETAIL_RE = /^\/(movie|tv)\/\d+$/;

// How long to cache each kind of response (seconds).
// Availability + details change slowly, so cache them hard.
function ttlFor(path) {
    if (path.startsWith('/search/'))   return 600;     // 10 minutes
    if (path.startsWith('/trending/')) return 3600;    // 1 hour
    return 86400;                                       // details + watch/providers: 24 hours
}

// CORS. In production, replace '*' with your exact site origin,
// e.g. 'https://kahandekhu.app', so only your app can use the Worker.
const ALLOWED_ORIGIN = '*';
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Expose-Headers': 'X-KD-Translate',
        'Access-Control-Max-Age': '86400',
    };
}

export default {
    async fetch(request, env, ctx) {
        // Preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }
        if (request.method !== 'GET') {
            return json({ error: 'Method not allowed' }, 405);
        }
        
        const incoming = new URL(request.url);
        const path = incoming.pathname;
        
        if (!ALLOW.some((p) => path.startsWith(p))) {
            return json({ error: 'Path not allowed' }, 403);
        }
        
        if (!env.TMDB_API_KEY) {
            return json({ error: 'Server is missing TMDB_API_KEY' }, 500);
        }
        
        // 1) Serve from edge cache if we have it.
        //    Cache key = the incoming request URL (which has NO api key in it).
        const cache = caches.default;
        const cacheKey = new Request(incoming.toString(), { method: 'GET' });
        const hit = await cache.match(cacheKey);
        if (hit) return withCors(hit);
        
        // 2) Build the upstream TMDB URL, forwarding the client's params
        //    and injecting the secret key.
        const upstream = new URL(TMDB + path);
        incoming.searchParams.forEach((v, k) => {
            if (k !== 'api_key') upstream.searchParams.set(k, v);
        });
        upstream.searchParams.set('api_key', env.TMDB_API_KEY);
        
        // 3) Fetch from TMDB.
        let resp;
        try {
            resp = await fetch(upstream.toString(), {
                headers: { 'Accept': 'application/json' },
            });
        } catch (e) {
            return json({ error: 'Upstream fetch failed' }, 502);
        }
        
        let bodyText = await resp.text();

        // 3b) FREE description auto-translation (Cloudflare Workers AI, m2m100).
        //     When the user's language has no TMDB synopsis, translate the English
        //     one. Fully guarded: if env.AI is unbound or anything fails, we keep the
        //     original body untouched (the app then uses its own English fallback).
        //     `xlate` records the outcome — surfaced as the X-KD-Translate header AND
        //     console.log (see it live with: wrangler tail -c wrangler.tmdb.toml).
        let xlate = 'na';
        if (DETAIL_RE.test(path)) {
            const lang = (incoming.searchParams.get('language') || '').slice(0, 2).toLowerCase();
            const target = M2M[lang];
            if (!resp.ok)        xlate = 'upstream-' + resp.status;
            else if (!env.AI)    xlate = 'NO-AI-BINDING';          // ← binding missing: add it + redeploy
            else if (!target)    xlate = 'lang-skipped:' + (lang || 'none');
            else {
                try {
                    const data = JSON.parse(bodyText);
                    if (String(data.overview || '').trim()) {
                        xlate = 'has-native-overview';            // TMDB already had a translation
                    } else {
                        const en = await fetchEnglishOverview(env, path);
                        if (!en) {
                            xlate = 'no-english-source';
                        } else {
                            const r = await env.AI.run('@cf/meta/m2m100-1.2b', {
                                text: en, source_lang: 'english', target_lang: target,
                            });
                            const translated = r && (r.translated_text || (r.result && r.result.translated_text));
                            if (translated && String(translated).trim()) {
                                data.overview = String(translated).trim();
                                data.kd_translated = true;        // marker for the app's "Auto-translated" tag
                                bodyText = JSON.stringify(data);
                                xlate = 'translated';
                            } else {
                                xlate = 'ai-empty:' + JSON.stringify(r || {}).slice(0, 100);
                            }
                        }
                    }
                } catch (e) { xlate = 'error:' + (e && e.message ? e.message : String(e)); }
            }
            console.log('KD-translate', path, 'lang=' + (incoming.searchParams.get('language') || ''), '→', xlate);
        }
        const xlateHeader = String(xlate).replace(/[^\x20-\x7E]/g, '?').slice(0, 180);

        const ttl = ttlFor(path);
        const out = new Response(bodyText, {
            status: resp.status,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': `public, max-age=${ttl}`,
                'X-KD-Translate': xlateHeader,
                ...corsHeaders(),
            },
        });
        
        // 4) Store successful responses in the edge cache (don't block the response).
        if (resp.ok) ctx.waitUntil(cache.put(cacheKey, out.clone()));
        
        return out;
    },
};

// Fetch just the English synopsis for a title (used as the source text to translate).
async function fetchEnglishOverview(env, path) {
    try {
        const u = new URL(TMDB + path);
        u.searchParams.set('language', 'en-US');
        u.searchParams.set('api_key', env.TMDB_API_KEY);
        const r = await fetch(u.toString(), { headers: { 'Accept': 'application/json' } });
        if (!r.ok) return '';
        const d = await r.json();
        return d && d.overview ? String(d.overview) : '';
    } catch (e) { return ''; }
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
    });
}

function withCors(resp) {
    const r = new Response(resp.body, resp);
    const h = corsHeaders();
    Object.keys(h).forEach((k) => r.headers.set(k, h[k]));
    return r;
}
