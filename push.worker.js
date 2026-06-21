// KahanDekhu — Web Push Worker
// Stores "notify me" reminders in D1, and on a cron re-checks each title's
// India (or chosen region) availability via the TMDB proxy. When a title
// starts streaming, it sends a Web Push notification, then clears the reminder.
//
// Endpoints:
//   POST /subscribe   { subscription, tmdb_id, media_type, title, region }
//   POST /unsubscribe { endpoint }
//   GET  /run?secret=RUN_SECRET   (manual trigger — same logic as the cron, for testing)
//
// Secrets (wrangler secret put ...): VAPID_PRIVATE, RUN_SECRET
// Vars (wrangler.toml [vars]): VAPID_PUBLIC, VAPID_SUBJECT, TMDB_PROXY, DEFAULT_APP_URL
// Binding: DB (D1)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const enc = new TextEncoder();

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/subscribe') {
      try {
        const b = await req.json();
        const s = b.subscription;
        if (!s || !s.endpoint || !s.keys) return json({ error: 'bad subscription' }, 400);
        await env.DB.prepare(
          `INSERT OR REPLACE INTO reminders (endpoint, p256dh, auth, tmdb_id, media_type, title, region, created_at)
           VALUES (?,?,?,?,?,?,?,?)`
        ).bind(s.endpoint, s.keys.p256dh, s.keys.auth, b.tmdb_id, b.media_type, b.title || '', b.region || 'IN', Date.now()).run();
        return json({ ok: true });
      } catch (e) { return json({ error: String(e) }, 500); }
    }

    if (req.method === 'POST' && url.pathname === '/unsubscribe') {
      try {
        const b = await req.json();
        await env.DB.prepare(`DELETE FROM reminders WHERE endpoint = ?`).bind(b.endpoint).run();
        return json({ ok: true });
      } catch (e) { return json({ error: String(e) }, 500); }
    }

    if (req.method === 'GET' && url.pathname === '/run') {
      if (url.searchParams.get('secret') !== env.RUN_SECRET) return json({ error: 'forbidden' }, 403);
      const n = await checkAndNotify(env);
      return json({ ok: true, sent: n });
    }

    // Delivery test: pushes to every stored subscription regardless of streaming
    // status, and reports the push-service status code per subscription.
    if (req.method === 'GET' && url.pathname === '/test') {
      if (url.searchParams.get('secret') !== env.RUN_SECRET) return json({ error: 'forbidden' }, 403);
      const { results } = await env.DB.prepare(`SELECT * FROM reminders`).all();
      const out = [];
      for (const r of results || []) {
        const sub = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
        const payload = JSON.stringify({ title: 'KahanDekhu test ✓', body: `Push delivery works! (${r.title})`, url: env.DEFAULT_APP_URL || '/', tag: 'kd-test' });
        let status; try { status = await sendPush(sub, payload, env); } catch (e) { status = 'err: ' + e; }
        out.push({ title: r.title, status });
      }
      return json({ ok: true, count: out.length, results: out });
    }

    return json({ ok: true, service: 'kahandekhu-push' });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkAndNotify(env));
  },
};

// --- core: re-check each reminder, push when it lands on a service ---
async function checkAndNotify(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM reminders`).all();
  let sent = 0;
  for (const r of results || []) {
    try {
      const res = await fetch(`${env.TMDB_PROXY}/${r.media_type}/${r.tmdb_id}?append_to_response=watch/providers`);
      if (!res.ok) continue;
      const data = await res.json();
      const region = (data['watch/providers'] && data['watch/providers'].results && data['watch/providers'].results[r.region]) || null;
      const streaming = region && ((region.flatrate && region.flatrate.length) || (region.free && region.free.length) || (region.ads && region.ads.length));
      if (!streaming) continue;

      const where = (region.flatrate && region.flatrate[0] && region.flatrate[0].provider_name) || 'a streaming service';
      const payload = JSON.stringify({
        title: `${r.title} is now streaming 🎉`,
        body: `Now available on ${where} in ${r.region}. Tap to see where to watch.`,
        url: env.DEFAULT_APP_URL || '/',
        tag: `kd-${r.tmdb_id}`,
      });
      const sub = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
      const code = await sendPush(sub, payload, env);
      if (code === 201 || code === 200) sent++;
      // Clear on success or if the subscription is gone (404/410).
      if (code === 201 || code === 200 || code === 404 || code === 410) {
        await env.DB.prepare(`DELETE FROM reminders WHERE endpoint = ? AND tmdb_id = ? AND media_type = ?`)
          .bind(r.endpoint, r.tmdb_id, r.media_type).run();
      }
    } catch (e) { /* skip this one, try again next run */ }
  }
  return sent;
}

// ---------- Web Push crypto (VAPID + aes128gcm, RFC 8291/8292) ----------
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - s.length % 4) % 4);
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function bytesToB64url(buf) {
  const u = new Uint8Array(buf); let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs) {
  let len = 0; for (const a of arrs) len += a.length;
  const out = new Uint8Array(len); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hmacSha256(keyBytes, data) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
// HKDF for a single output block (length <= 32)
async function hkdf(salt, ikm, info, length) {
  const prk = await hmacSha256(salt, ikm);
  const t = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return t.slice(0, length);
}

async function vapidHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:admin@example.com' };
  const signingInput = bytesToB64url(enc.encode(JSON.stringify(header))) + '.' + bytesToB64url(enc.encode(JSON.stringify(payload)));

  const pub = b64urlToBytes(env.VAPID_PUBLIC); // 65-byte uncompressed point
  const jwk = { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE, x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)));
  const jwt = signingInput + '.' + bytesToB64url(sig);
  return { Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}` };
}

async function encryptPayload(sub, payloadStr) {
  const uaPublic = b64urlToBytes(sub.keys.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(sub.keys.auth); // 16 bytes

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey)); // 65 bytes
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256)); // 32 bytes

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const plaintext = concat(enc.encode(payloadStr), new Uint8Array([2])); // 0x02 = last record delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  // header: salt(16) | record_size(4, big-endian = 4096) | idlen(1) | keyid(as_public, 65)
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  const idlen = new Uint8Array([asPublic.length]);
  return concat(salt, rs, idlen, asPublic, ciphertext);
}

async function sendPush(sub, payloadStr, env) {
  const body = await encryptPayload(sub, payloadStr);
  const vapid = await vapidHeader(sub.endpoint, env);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      ...vapid,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '2419200',
    },
    body,
  });
  return res.status;
}
