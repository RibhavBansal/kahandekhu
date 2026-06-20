# KahanDekhu — Where to Watch, India
### Master project reference

India-first streaming aggregator. Type a movie or show → see every legal Indian platform it's on. Free to run, donation-supported, installable as a PWA, and publishable on the Play Store.

---

## Contents of this folder

| File | What it is | Deploy where |
|---|---|---|
| `index.html` | The entire web app (single file) | Cloudflare Pages |
| `manifest.json` | PWA manifest (icons, screenshots, theme) | Cloudflare Pages |
| `service-worker.js` | Offline shell + precache | Cloudflare Pages |
| `privacy.html` | Privacy policy (hosted public page) | Cloudflare Pages |
| `icon-192.png` | App icon 192×192 | Cloudflare Pages |
| `icon-512.png` | App icon 512×512 | Cloudflare Pages |
| `icon-512-maskable.png` | Maskable icon (Android adaptive icons) | Cloudflare Pages |
| `screenshot-mobile.png` | PWA install preview — mobile (390×844) | Cloudflare Pages |
| `screenshot-wide.png` | PWA install preview — desktop (1280×800) | Cloudflare Pages |
| `tmdb-proxy.worker.js` | TMDB API proxy (hides key, edge caches) | Cloudflare Workers |
| `telegram-bot.worker.js` | Telegram bot + notify-me cron | Cloudflare Workers |
| `wrangler.toml` | Wrangler config for the bot Worker | Local (CLI config) |
| `schema.sql` | D1 schema for bot reminder subscriptions | Cloudflare D1 |
| `supabase-schema.sql` | Postgres schema + RLS for accounts | Supabase SQL Editor |
| `PLAYSTORE-SETUP.md` | Play Store / TWA submission guide | Reference |
| `TELEGRAM-BOT-SETUP.md` | Telegram bot deploy guide | Reference |
| `SUPABASE-SETUP.md` | Supabase accounts + sync guide | Reference |

---

## Architecture overview

```
Browser / PWA / TWA
       │
       ├── index.html  (all UI, vanilla JS, localStorage + Supabase sync)
       │
       ├── Cloudflare Worker: tmdb-proxy  (hides TMDB key, edge caches results)
       │       └── TMDB API  →  movie/show data, posters, availability (JustWatch data)
       │
       ├── Cloudflare Worker: telegram-bot  (search, subscribe, cron notify)
       │       ├── Cloudflare D1  (reminder subscriptions table)
       │       ├── TMDB API  (re-checks availability on cron)
       │       └── Telegram Bot API  (sends notifications)
       │
       └── Supabase  (optional accounts + cross-device sync)
               ├── auth.users  (managed email/password auth)
               ├── preferences  (region, services — RLS per user)
               └── watchlist   (saved titles — RLS per user)
```

**Cost at launch: ₹0/month** (all free tiers). The only one-time cost is the Play Console registration fee (~₹2,000 / $25).

---

## Features

### Web app (`index.html`)
- **Search** — debounced autocomplete with poster thumbnails, keyboard nav, Movie/Series badges
- **Browse** — Popular / In cinemas / Top rated rails for Movies and Shows, with Movies⇄Shows toggle
- **Detail** — Ticket-stub UI with backdrop hero, rating, runtime, genres, overview, Trailer button
- **Where to Watch** — Subscription / Free / Rent / Buy sections with provider logos, India-first
- **Region switcher** — India, USA, UK, UAE, Canada, Australia, Singapore, Germany
- **My Services** — pick the platforms you pay for; app flags "YOURS" on matching providers and shows a banner ("✓ On your services — watch it on Netflix")
- **Only mine filter** — on any detail page, hide platforms you don't subscribe to
- **Watchlist** — save titles locally; syncs to cloud when signed in
- **Shareable cards** — canvas-rendered 1080×1350 image with poster, title, where-to-watch, and wordmark; fires native share sheet on mobile or downloads on desktop
- **Trailer button** — links to YouTube trailer when TMDB has one
- **Accounts** (optional) — email/password sign-in via Supabase; syncs watchlist + region + services across all devices
- **Offline shell** — service worker precaches the app; loads even without internet
- **PWA installable** — manifest + SW + icons + screenshots; Chrome shows richer install dialog with previews
- **JustWatch + TMDB attribution** — visible on every detail page (required by TMDB API terms)
- **Offline/online banner** — detects network changes
- **Donations** — UPI QR, copy UPI ID, deep-link to any UPI app, Razorpay for cards/netbanking

### Telegram bot (`telegram-bot.worker.js`)
- Search any title by name via Telegram message
- Inline buttons to pick the right match
- If streaming in India → tells you exactly where
- If not streaming → saves a reminder (D1 database)
- Cron runs every 6 hours, re-checks every reminder, notifies users the moment a title lands on an Indian streaming service
- `/list` — view and cancel reminders
- Deep-link from web app: "Notify me when it streams" button auto-subscribes in one tap
- No login required — Telegram chat ID is the identity

### TMDB proxy (`tmdb-proxy.worker.js`)
- Hides TMDB API key server-side (never exposed to browser)
- Allowlists only needed TMDB paths (not an open proxy)
- Edge-caches responses at Cloudflare (search 10min, trending 1hr, details 24hr)
- Adds CORS so the web app can call it from any origin
- Already deployed at: `https://kahandekhu-tmdb.bansalribhav0987.workers.dev`

---

## Everything you need to do (in order)

### Step 1 — Placeholders to fill in `index.html`
Open `index.html` and fill these near the top of the `<script>`:

```js
const SUPPORT_UPI      = 'kahandekhu@upi';          // → your real UPI ID
const SUPPORT_RAZORPAY = 'https://razorpay.me/@kahandekhu'; // → your real Razorpay link
const TELEGRAM_BOT     = '';                         // → your bot username e.g. 'KahanDekhuBot'
const SUPABASE_URL     = '';                         // → from Supabase project settings
const SUPABASE_ANON_KEY = '';                        // → anon/public key (safe to be public)
const APP_URL          = 'https://kahandekhu.pages.dev'; // → your real deployed URL
```

Also fill in `privacy.html`:
- `[ADD DATE]` — today's date (effective date of the policy)
- `[ADD YOUR EMAIL]` — your contact email

### Step 2 — Deploy the web app (Cloudflare Pages)
1. Go to dash.cloudflare.com → **Workers & Pages → Create → Pages → Upload assets**
2. Upload all files in this folder (everything except the `.md` files and `.sql` files)
3. Deploy → note your URL (e.g. `kahandekhu.pages.dev`)
4. Update `APP_URL` in `index.html` to your real URL, then redeploy
5. Custom domain (optional): buy via Cloudflare Registrar → Pages → Custom domains → add it

### Step 3 — Verify the TMDB proxy is live
Open in a browser:
```
https://kahandekhu-tmdb.bansalribhav0987.workers.dev/trending/all/day
```
You should see JSON. If not, go to the Worker in the Cloudflare dashboard → Settings → Variables and Secrets → confirm `TMDB_API_KEY` is set as a Secret.

### Step 4 — Deploy the Telegram bot (follow `TELEGRAM-BOT-SETUP.md`)
Short version:
```bash
npm install -g wrangler
wrangler login
wrangler d1 create kahandekhu            # paste the database_id into wrangler.toml
wrangler d1 execute kahandekhu --remote --file=schema.sql
wrangler secret put BOT_TOKEN            # from @BotFather
wrangler secret put TMDB_API_KEY         # your TMDB v3 key
wrangler secret put WEBHOOK_SECRET       # any random string
wrangler deploy                          # note the Worker URL
# then register the webhook:
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>&secret_token=<WEBHOOK_SECRET>"
```
Then set `TELEGRAM_BOT = 'YourBotUsername'` in `index.html` and redeploy the web app.

### Step 5 — Set up accounts/sync (follow `SUPABASE-SETUP.md`)
1. Create free project at supabase.com
2. SQL Editor → paste contents of `supabase-schema.sql` → Run
3. Project Settings → API → copy Project URL and anon key
4. Paste into `index.html` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) → redeploy

### Step 6 — Play Store (follow `PLAYSTORE-SETUP.md`)
1. Confirm the web app passes Lighthouse → Installable (no warnings)
2. pwabuilder.com → enter your URL → Package for Android → download `.aab` + signing key
3. Host `.well-known/assetlinks.json` at your domain (PWABuilder generates it)
4. play.google.com/console → Create app → fill store listing → upload `.aab` → complete Data Safety form → submit

---

## Data Safety form answers (Play Store)

| Question | Answer |
|---|---|
| Does the app collect or share user data? | Yes (if Supabase accounts enabled) / No (if local-only) |
| Data types collected | Email address (for account sign-in only) |
| Data shared with third parties | No |
| Data encrypted in transit | Yes |
| Can users request data deletion? | Yes (delete account / clear browser data) |
| Is data required or optional? | Optional (app works fully without sign-in) |

---

## Monetization plan

| Phase | Status | What's allowed |
|---|---|---|
| Now | Live | Voluntary donations (UPI + Razorpay) |
| After real traffic | Pending | Contact JustWatch (data-partner@justwatch.com) for Partner API + commercial TMDB agreement |
| After licensing | Unlocked | Ads (Google AdSense / AdMob for TWA) + affiliate links |

**Do not add ads until you've secured the commercial data license.** The free TMDB/JustWatch tier prohibits commercial use. Donations are explicitly excluded from that restriction.

---

## Legal / compliance checklist

- [x] TMDB API attribution visible on every detail page ("Metadata by TMDB")
- [x] JustWatch attribution visible on every detail page ("Where-to-watch by JustWatch")
- [x] Privacy policy page exists (`privacy.html`)
- [ ] Fill `[ADD DATE]` and `[ADD YOUR EMAIL]` in `privacy.html`
- [ ] Host privacy policy at a public URL and link it in Play Console
- [ ] Replace placeholder UPI ID and Razorpay link before sharing the app
- [ ] Frame all donation UI as "voluntary" (already done in app copy)
- [ ] Consult a CA on income tax treatment of donations (India — taxable as income)
- [ ] Do NOT accept foreign donations without checking FCRA requirements
- [ ] Do NOT add ads until you have commercial data licensing in place

---

## Environment variables / secrets summary

### TMDB proxy Worker (already deployed)
| Secret name | Value |
|---|---|
| `TMDB_API_KEY` | Your free TMDB v3 key |

### Telegram bot Worker
| Secret name | Value |
|---|---|
| `BOT_TOKEN` | From @BotFather |
| `TMDB_API_KEY` | Your free TMDB v3 key (same one) |
| `WEBHOOK_SECRET` | Any random string you choose |

### index.html (client-side — safe to be in code)
| Constant | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Your anon/public key |

> The Supabase **service_role** key must NEVER go in `index.html` or any client code. It bypasses Row Level Security.

---

## Free tier limits (as of mid-2025)

| Service | Free allowance | Your expected usage |
|---|---|---|
| Cloudflare Workers | 100k requests/day | Fine for early traffic |
| Cloudflare KV / edge cache | Included | Proxy caches handle most TMDB calls |
| Cloudflare D1 | 5GB storage, generous reads/writes | Fine for thousands of reminders |
| TMDB API | No hard limit (rate-limited) | Proxy cache keeps calls low |
| Supabase | 500MB DB, 50k MAU | Fine until meaningful scale |
| Telegram Bot API | Free, no limits | Free |
| Cloudflare Pages | Unlimited deploys | Free |

---

## What to build next (after launch)

1. **SEO pages** — static `/where-to-watch/[title]` pages for Google traffic (biggest free growth channel; needs a custom domain first)
2. **"New this week" feed** — weekly email or Telegram broadcast of new arrivals
3. **Regional language filter** — filter by Tamil / Telugu / Malayalam / Bengali
4. **Watchmode migration** — replace JustWatch data with licensed Watchmode API (unlocks deep links + ads)
5. **iOS App Store** — separate, stricter, $99/yr path; PWA already installs on iPhone via Safari for now
6. **Google / Apple sign-in** — add OAuth providers in Supabase (one config change, no code change needed)
