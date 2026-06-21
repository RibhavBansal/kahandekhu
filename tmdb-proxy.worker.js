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
        
        const bodyText = await resp.text();
        const ttl = ttlFor(path);
        const out = new Response(bodyText, {
            status: resp.status,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': `public, max-age=${ttl}`,
                ...corsHeaders(),
            },
        });
        
        // 4) Store successful responses in the edge cache (don't block the response).
        if (resp.ok) ctx.waitUntil(cache.put(cacheKey, out.clone()));
        
        return out;
    },
};

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
