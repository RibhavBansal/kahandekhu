# KahanDekhu — Web Push ("Notify me when it streams") setup

Replaces the Telegram bot with native push notifications — works on Android/Chrome and the installed app, nothing India-blocks it. Do these once.

## Your keys

Generate your own VAPID key pair locally (so the private key never leaves your machine):

```bash
    node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const b=x=>Buffer.from(x).toString('base64url');console.log('PUBLIC =',b(publicKey.export({type:'spki',format:'der'}).slice(-65)));console.log('PRIVATE =',privateKey.export({format:'jwk'}).d)"
```

| Key | Where it goes |
|---|---|
| **VAPID public** | Goes in `VAPID_PUBLIC` in both `index.html` and `wrangler.toml`. Public — safe to ship. |
| **VAPID private** | A **secret** on the Worker (step 3). You paste it directly into `wrangler secret put`. Never put it in `index.html` or any committed file. |

> The public key already in `index.html` / `wrangler.toml` is yours (you regenerated it). Just keep both in sync and set the matching private key as the secret below.

## 1. Create the D1 database

```bash
    npm install -g wrangler
    wrangler login
    wrangler d1 create kahandekhu-push
```

Paste the printed `database_id` into `wrangler.toml` (replace `PASTE_YOUR_D1_DATABASE_ID_HERE`).

## 2. Create the tables

```bash
    wrangler d1 execute kahandekhu-push --remote --file=push-schema.sql
```

## 3. Set the secrets

```bash
    wrangler secret put VAPID_PRIVATE
    #   paste: your generated VAPID private key
    #   (if it asks to create the "kahandekhu-push" Worker, answer YES)
    
    wrangler secret put RUN_SECRET
    #   paste: any random string you choose (used only to manually trigger a check)
```

## 4. Deploy the Worker

```bash
    wrangler deploy
```

Note the deployed URL, e.g. `https://kahandekhu-push.<you>.workers.dev`.

## 5. Turn it on in the app

In `index.html`, set:

```js
    const PUSH_API = 'https://kahandekhu-push.<you>.workers.dev';
```

Re-copy `index.html` into `public/` and redeploy Pages. The "Notify me when it streams" button now appears on any title that **isn't** currently streaming in the user's region.

## 6. Test the whole chain

1. Open the **installed** app (or Chrome on Android) on a title that isn't streaming in India → tap **Notify me when it streams** → allow notifications. Button shows "✓ We'll notify you".
2. Force a check immediately instead of waiting for the cron:
```
    https://kahandekhu-push.<you>.workers.dev/run?secret=YOUR_RUN_SECRET
```
It returns `{ "sent": N }`. If the title is now streaming, you get a push. (To guarantee a push for a test, subscribe to a title that *is* already streaming — it'll fire on the next `/run`.)

## How it works

- Tapping "Notify me" subscribes the browser to push and stores `{subscription, tmdb_id, region}` in D1.
- Every 6 hours the cron re-checks each title's availability via your TMDB proxy.
- When a title lands on a streaming service, the Worker sends an encrypted Web Push (VAPID + aes128gcm) and clears the reminder.
- Dead subscriptions (404/410) are pruned automatically.

## Notes

- iOS requires the app be **installed to the Home Screen** (Add to Home Screen) before web push works; Android/Chrome works in-browser and installed.
- The old `telegram-bot.worker.js`, `wrangler.toml`, and `schema.sql` are no longer used — you can delete them.
