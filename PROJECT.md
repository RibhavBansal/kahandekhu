# KahanDekhu — Project Reference (living document)

> **Maintained by Claude.** This file is updated on every change to the project — features, fixes, deploys, decisions. It is the single source of truth for how everything works.
> **Last updated:** 21 Jun 2026 — Telegram bot + `SUPPORT_URL` option + verified PWA/TWA is Play-allowed. **Fix:** bots/push now call the TMDB proxy via a Cloudflare **service binding** (`env.TMDB`), not a public fetch — a same-account Worker→Worker fetch is blocked with error 1042. (Redeploy each worker to apply.)

---

## 1. What it is

KahanDekhu is an **India-first "where to watch" tracker**. Type a movie or show → see every legal streaming platform it's on in your region (subscription / free / rent / buy). It is:

- A **PWA** (installable web app) served from Cloudflare Pages.
- Wrapped as an **Android app (TWA)** for the Play Store.
- Free, donation-supported, with optional accounts for cross-device sync.

**Live URL:** https://kahandekhu.in

---

## 2. Architecture

```
    ┌─────────────────────────────────────────────────────────────┐
    │  Browser / installed PWA / Android TWA                       │
    │  index.html  (all UI + logic, single file, vanilla JS)       │
    └───────┬───────────────┬───────────────┬─────────────────────┘
    │               │               │
    ▼               ▼               ▼
    TMDB proxy       Push worker      Supabase
    (Worker)         (Worker + D1)    (Auth + Postgres + Edge fn)
    │               │               │
    ▼               ▼               ▼
    TMDB API        Web Push +       Accounts, preferences,
    (movie data +    cron re-check    watchlist sync, account
    JustWatch       of availability  deletion
    availability)
```

**Cost:** ₹0/month on free tiers. One-time ~$25 Play Console fee.

---

## 3. Repository map

| Path | What it is | Deployed to |
|---|---|---|
| `index.html` | The entire web app — UI, styles, logic (single file) | Cloudflare Pages |
| `manifest.json` | PWA manifest (icons, screenshots, theme) | Pages |
| `service-worker.js` | Offline precache + web-push handlers | Pages |
| `qrcode.min.js` | Self-hosted QR library (donation QR, offline-safe) | Pages |
| `privacy.html` | Privacy policy (discloses optional accounts/email) | Pages |
| `delete-account.html` | Public account-deletion page (Play Store requirement) | Pages |
| `icon-192/512/512-maskable.png` | App icons | Pages |
| `screenshot-mobile/wide.png` | PWA install previews | Pages |
| `public/.well-known/assetlinks.json` | TWA domain verification | Pages |
| `public/` | **The folder actually deployed to Pages** (mirror of the above) | Pages |
| `tmdb-proxy.worker.js` | TMDB API proxy (hides key, edge-caches, CORS) | Cloudflare Workers |
| `push.worker.js` | Web-push backend (subscribe + cron + send) | Cloudflare Workers |
| `whatsapp.worker.js` | WhatsApp "where to watch" bot (reply-only, free) | Cloudflare Workers |
| `telegram.worker.js` | Telegram "where to watch" bot (free, unlimited, no verification) | Cloudflare Workers |
| `wrangler.toml` | Wrangler config for the **push** worker (name `kahandekhu-push`) | local |
| `wrangler.whatsapp.toml` | Wrangler config for the WhatsApp bot (name `kahandekhu-whatsapp`) | local |
| `wrangler.telegram.toml` | Wrangler config for the Telegram bot (name `kahandekhu-telegram`) | local |
| `WHATSAPP-SETUP.md` | WhatsApp bot setup guide (Meta + deploy) | reference |
| `TELEGRAM-SETUP.md` | Telegram bot setup guide (BotFather + deploy) | reference |
| `push-schema.sql` | D1 schema for push reminders | Cloudflare D1 |
| `supabase-schema.sql` | Postgres schema + RLS for accounts | Supabase |
| `supabase/functions/delete-account/index.ts` | Edge Function that deletes a user | Supabase |
| `ui-kit.html` | Standalone premium UI component kit (reference only) | — |
| `store-assets/feature-graphic.png` | 1024×500 Play Store feature graphic | — |
| `PLAYSTORE-SETUP.md` | Play Store submission + compliance guide | reference |
| `STORE-LISTING.md` | ASO-optimized listing copy (English + Hindi) | reference |
| `PUSH-SETUP.md` | Web-push deploy guide | reference |
| `SUPABASE-SETUP.md` | Accounts/sync setup guide | reference |
| `telegram-legacy/` | Archived (unused) Telegram bot — kept for future | — |

> **Deploy rule:** only the `public/` folder goes to Pages. After editing `index.html` (or any asset) at the repo root, it is copied into `public/`. The two are kept identical.

---

## 4. Frontend (`index.html`)

One file: `<style>` (theme + components), markup (4 views), and `<script>` (all logic). External deps: `qrcode.min.js` (local), `@supabase/supabase-js@2` (jsdelivr), Google Fonts.

### 4.1 Config constants (top of `<script>`)
| Constant | Purpose |
|---|---|
| `API_BASE` | TMDB proxy URL |
| `APP_URL` | Public app URL (share links, push deep-link) |
| `PUSH_API` | Push worker URL (empty → notify button hidden) |
| `VAPID_PUBLIC` | Public push key (safe to ship) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Accounts (anon key is RLS-protected, safe to ship) |
| `SUPPORT_RAZORPAY` | Tip path — razorpay.me link (`https://` auto-added). Only payment surface in the app (see `RAZORPAY-SETUP.md`) |
| `SUPPORT_URL` | Optional alt page (Buy Me a Coffee / Ko-fi) |

> **No raw UPI / personal name is ever shown.** There is no UPI fallback. If neither link above is set, the Support button is removed from the DOM entirely.

> **Never** ship the Supabase `service_role` key, VAPID private key, or `RUN_SECRET` — those live only as Worker/Supabase secrets.

### 4.2 Views & navigation
Four `<section class="view">`: `v-search` (default), `v-browse`, `v-watchlist`, `v-detail`.
- `showView(id)` toggles the active view, sets `currentTab` (last real tab), and highlights the matching bottom-nav button. On the detail page, the **originating tab stays highlighted**.
- `window.__back = () => showView(currentTab)` — back returns to where you came from.
- **Topbar Settings entry:** `#openSettings` is now a **gear icon + current-region flag + "Settings" label** (was a bare country pill — users couldn't tell language/services lived there). Opens the Settings sheet with labelled **Language / Region / Services** sections. The flag shows the active region at a glance; `reflectRegion()` updates only the flag. On screens ≤430px the `.tbtn-label` text hides (icons + flag only) so the topbar never overlaps. "Settings" label/title come from the `SETTINGS_LABEL` dict (10 langs), applied in `applyI18n()`.
- The floating Support button hides on the detail view; the bottom nav + Support hide while the search keyboard is open (`body.kb-open`).

### 4.3 Data layer
- `apiGet(path, params)` → fetches the proxy with `language=en-IN`.
- `tmdb.searchMulti(q)`, `tmdb.detail(type,id)` (with `append_to_response=watch/providers,videos`), `tmdb.trending()`, `tmdb.list(path, params)`, `tmdb.recommendations(type,id)`.
- `buildCard(item)` → poster (2:3) + **rating badge** (gold star + score) + title + **year · genre**. Used by trending, search, browse, watchlist.
- `GENRES` maps TMDB genre ids → short labels (movie + tv). `genreOf()` / `ratingOf()` helpers.

### 4.3b Localization (i18n) — full app + content
Localized into **10 languages**: English, Hindi, Bengali, Tamil, Telugu, Marathi, Kannada, Malayalam, Gujarati, Punjabi.

**UI chrome.** `STRINGS = { en:{…}, … }` keyed by string id; `LANGS` lists `[code, nativeName]`. `t(key, vars)` resolves `LANG` with English fallback + `{x}` interpolation. Static markup carries `data-i18n` (textContent), `data-i18n-html` (innerHTML, for `<span class="em">`/`<b>`), `data-i18n-ph` (placeholder); `applyI18n()` swaps them all and sets `<html lang>`.

**Movie/show content.** `tmdbLang()` maps `LANG`→TMDB locale (`hi`→`hi-IN`, etc.) and is passed as `language` on every proxy call, so **titles + overviews come back localized**. TMDB returns the original title when it has no translation; overviews can come back empty → `tmdb.detail()` **falls back to an English overview** when the localized one is blank (one extra call, only when empty).

**Country names + genres.** `REGION_NAMES[lang][code]` and `GENRE_NAMES[lang][label]` dictionaries (all 10 langs); `regNameOf(code)` / `tGenre(label)` resolve with English fallback. Wired into the region pill, settings region grid, multi-region "also streaming in" cards, card subtitles (`genreOf`), and Browse genre/language chips (`BROWSE_ALL` covers the "All"/"All langs" chips; language chips show native script via `LANGS`).

**Switching.** `setLang(code)` applies chrome, persists, then `reloadContent()` re-fetches whatever's on screen (trending, for-you, browse + chips, active search, open detail, **watchlist**) so content re-renders in the new language. **Watchlist titles** are stored as a save-time snapshot tagged with `_lang`; `refreshWatchlistTitles()` re-fetches any title whose `_lang !== LANG` in the current language and caches it back (so it only fetches when the language actually changed), then re-renders. `detectLang()` → saved `kd_lang` → `navigator.language` → `en`. **Language is device-local** (localStorage `kd_lang`), not cloud-synced. Picker: `<select id="langSel">` atop Settings, built once in `buildSettings()`. Boot runs `LANG = detectLang(); applyI18n();` before first paint.

> Not yet localized: detail-page section labels (Where to watch / Rent / Buy / Cast / More like this) remain English — candidate for a follow-up.

### 4.4 Search (`v-search`)
- Live, debounced (300 ms). Typing swaps the **Trending grid** out for a **search-results grid** (`#searchSec` ↔ `#trendingSec`).
- **Typo recovery:** `runSearch()` mirrors the bots — if a query returns nothing, it retries with a **prefix** (first ~60% of the query) to recover mid-word misspellings (`oppenhimer`→`oppenh`→Oppenheimer). When the fallback is used, a localized "showing closest results" note (`search.closest`) appears above the grid.
- Enter opens the top result; Esc/✕ clears and restores trending.
- Search button is a gold arrow (icon always visible, text on wider screens).

### 4.5 Trending + "For you" (home)
- `loadTrending()` → `tmdb.trending()` → grid of cards in `#rail-trending` (Netflix-style, not a scroll rail).
- `loadForYou()` → if the watchlist isn't empty, picks a recent saved title and shows a **"Because you saved X"** recommendations rail above Trending. Hidden while searching; refreshed on boot and on returning to the Search tab.

### 4.6 Browse (`v-browse`) — filterable
- **Type** toggle (Movies/Shows), **genre chips**, **regional language chips** (Hindi / Tamil / Telugu / Malayalam / Kannada / Bengali / Marathi / Punjabi / English — client-side on `original_language`), **sort** (Most popular / Top rated / Newest), and **"🎲 Surprise me"** (opens a random title from the filtered set).
- `loadBrowse(type)` fetches a pool: popular (pages 1–2) + top-rated + now-playing/on-the-air, deduped into `BROWSE_POOL`.
- `applyBrowseFilters()` filters by genre + sorts client-side → `BROWSE_SHOWN` → grid. (The proxy doesn't allow `/discover`, so filtering is client-side over the pool.)

### 4.7 Detail (`v-detail`)
- `openItem(item)` → `tmdb.detail()` → `renderDetail(d)`.
- **Where to watch:** from `watch/providers.results[REGION]`, grouped Subscription / Free / Rent / Buy with provider logos. "YOURS" badge + banner for platforms in the user's `SERVICES`. "Only mine" filter.
- **Region pill** (switch region), **rating/runtime/genres facts**, overview, **Trailer** (from `videos`), **Watchlist** toggle, **Share** (canvas 1080×1350 card with gold app-link CTA), **Notify me** (web push, only when not streaming in region).
- **Multi-region availability** — `elsewhereHTML()` reads `watch/providers.results` for all supported regions (same fetch, no extra calls). When not in your region it shows a **full-width tappable list** of regions (`🇸🇬 Singapore … Netflix ›` — full-width rows so long names never overflow); when available it shows a compact "Also streaming in" flag row. Tapping a row calls `switchRegionTo(code)`.
- **"More like this"** rail — `tmdb.recommendations()` for the current title (TMDB `/recommendations`, proxy-allowed).
- **Attribution + disclaimer** ("not affiliated…", TMDB/JustWatch) shown on every detail page.

### 4.8 Watchlist (`v-watchlist`)
- `WATCHLIST` array in `localStorage` (`kd_watchlist`). Items store id, type, title, poster, dates, **genre_ids, vote_average** (so cards show rating/genre). Synced to cloud when signed in.

### 4.9 Region & services (settings modal)
- `REGION` (default `IN`) + `SERVICES` set. `isMine(providerName)` fuzzy-matches a provider to the user's services. Persisted to `kd_region` / `kd_services` and synced.

### 4.10 Accounts (Supabase — optional)
- `initAuth()` creates the client and shows the account button only if keys are set.
- `onSignedIn(user)` merges local + cloud (union of watchlists; cloud prefs win, else push local up).
- `doSignUp()` detects "email already exists" (handles both the explicit error and the silent anti-enumeration case).
- `doSignOut()` wipes local data so the next person starts clean (cloud copy stays).
- `doDeleteAccount()` calls the Supabase Edge Function to delete the auth user (data cascades), then clears local state.
- One-time **sign-in coachmark** points at the account button while signed out.

### 4.11 Donations
- `buildSupport()` renders the donate sheet (opened from the floating Support FAB, which shows on all main views). Two modes:
  - **`SUPPORT_RAZORPAY` set** (razorpay.me) → one "Support securely via Razorpay" button. Razorpay's hosted page accepts UPI/card/netbanking/wallet, so the personal UPI ID is never exposed. **This is the configured default.** `https://` is auto-prepended by `supportPageURL()`. See `RAZORPAY-SETUP.md`.
  - **else `SUPPORT_URL` set** → that page button (e.g. Buy Me a Coffee).
  - **else** → the Support button + modal are **removed from the DOM**. **There is no raw-UPI fallback** — a UPI ID or personal name can never appear in the app.
- Framed as voluntary — **no perks** (keeps it a compliant peer-to-peer payment / external donation link).

### 4.12 Web push (client)
- `pushEnabled()` gates the feature on `PUSH_API` + `VAPID_PUBLIC` + browser support.
- `subscribePush(btn)` → requests permission → `pushManager.subscribe()` → POSTs `{subscription, tmdb_id, media_type, title, region}` to `PUSH_API/subscribe`. Remembers locally (`kd_notify`) so the button shows "✓ We'll notify you" on return.
- Reminders are **locked to the region you subscribed in** (the cron checks that region).

### 4.13 Service worker / PWA / offline
- `service-worker.js`, cache `kahandekhu-v4`. Precaches the shell (incl. `qrcode.min.js`). **Navigations: network-first** (redeploys picked up on refresh); static assets: cache-first.
- Handles `push` (shows the notification) and `notificationclick` (focuses/opens the app).
- Safe-area insets applied to topbar, bottom nav, toast, modals (notch + home indicator).

### 4.13b Add-to-home-screen / install banner (`#a2hs`)
- A bottom banner (above the nav) prompting non-installed users to install. **Two modes:** Android/desktop Chrome → captures `beforeinstallprompt` and shows a one-tap **Install** button (`deferredPrompt.prompt()`); iOS Safari → guided **3-step boxes** (icon over text, chevron-linked: Share → Add to Home Screen → Add), since iOS has no native prompt.
- **Frequency policy (counter-based, not every visit):** a per-load `kd_launch` counter gates it — first offer on the **2nd** launch, then re-checked **every 4th** launch (`FIRST_LAUNCH=2`, `EVERY=4`), with a **lifetime cap of 4 shows** (`kd_a2hs_shown`). Each actual display increments the cap.
- **Also hidden when:** standalone/installed, inside the TWA (`is-twa`), or dismissed `< 7 days` ago (`kd_a2hs_dismissed` timestamp). `appinstalled` suppresses it long-term. Appears ~4s after load; hidden while the keyboard is open.
- Title/subtitle/Install button localized via the `A2HS` dict (10 langs); the iOS button names (Share / Add to Home Screen / Add) stay English to match the actual device UI.

### 4.14 localStorage keys
`kd_region`, `kd_services`, `kd_watchlist`, `kd_notify`, `kd_lang`, `kd_a2hs_dismissed`, `kd_a2hs_shown`, `kd_launch`.

---

## 5. Backend

### 5.1 TMDB proxy (`tmdb-proxy.worker.js`) — `kahandekhu-tmdb`
- Hides the TMDB key (server-side secret `TMDB_API_KEY`).
- **Allowlist:** `/search/multi`, `/search/movie`, `/search/tv`, `/trending/`, `/movie/`, `/tv/` (not an open proxy).
- Edge-caches: search 10 min, trending 1 h, details 24 h. Adds CORS.
- **Free description auto-translation (Workers AI, `@cf/meta/m2m100-1.2b`).** On a detail call (`/movie/{id}` or `/tv/{id}`) in a non-English language where TMDB returns an **empty** overview, the proxy fetches the English synopsis and translates it to the target language (`M2M` map: hi/bn/ta/te/mr/kn/ml/gu/pa), setting `overview` + a `kd_translated` marker. Fully guarded — if the `AI` binding is absent or the call fails, the original body is returned untouched (app then uses its own English fallback). The translated body is edge-cached (24 h), so each title+language is translated at most once per window → stays inside the Workers AI **free tier (10k req/day)**. Config: `wrangler.tmdb.toml` adds `[ai] binding = "AI"`. **Titles are never machine-translated** (proper nouns) — only descriptions.

### 5.2 Push worker (`push.worker.js`) — `kahandekhu-push`
- **Endpoints:** `POST /subscribe`, `POST /unsubscribe`, `GET /run?secret=` (manual cron), `GET /test?secret=` (delivery test — pushes to all subs regardless of streaming).
- **Cron** (every 6 h): for each reminder, re-checks availability via the TMDB proxy in the subscribed region; if now streaming → sends a push and clears the reminder. Prunes dead subs (404/410).
- **Crypto:** VAPID (ES256 JWT) + payload encryption (aes128gcm, RFC 8291) implemented with WebCrypto. Verified with an encrypt→decrypt round-trip test.
- **Binding:** D1 `DB`. **Vars:** `VAPID_PUBLIC`, `VAPID_SUBJECT`, `TMDB_PROXY`, `DEFAULT_APP_URL`. **Secrets:** `VAPID_PRIVATE`, `RUN_SECRET`.
- **D1 schema** (`push-schema.sql`): `reminders(endpoint, p256dh, auth, tmdb_id, media_type, title, region, created_at)`.

### 5.3 Supabase
- **`supabase-schema.sql`:** `preferences` (1/user) + `watchlist` (many/user), both with **Row-Level Security** (each user sees only their own rows). Anon role gets nothing.
- **Edge Function `delete-account`:** verifies the caller's JWT, deletes the auth user with the service-role key; `preferences`/`watchlist` cascade-delete via FK. Env vars (`SUPABASE_URL/ANON/SERVICE_ROLE_KEY`) are auto-injected.
- Email confirmation is **off** (chosen for launch — email is just a login handle).

### 5.4 WhatsApp bot (`whatsapp.worker.js`) — `kahandekhu-whatsapp`
- Users WhatsApp a title (or "where to watch X"); the bot searches via the TMDB proxy and replies with where it's streaming **in India** (subscription / rent / buy), rating, and — if not in India — which other regions have it, plus an app link.
- **Endpoints:** `GET /webhook` (Meta verification), `POST /webhook` (incoming messages).
- **Free by design:** reply-only, always inside the 24-hour user window (service messages are free; no paid templates).
- **Vars:** `TMDB_PROXY`, `APP_URL`, `GRAPH_VERSION`. **Secrets:** `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN`. Setup in `WHATSAPP-SETUP.md`.
- Each reply ends with an app-install CTA ("Save it to your watchlist & get a reminder…").
- **Disambiguation + typo handling:** same `searchTitles()` prefix-trim fallback + related-matches logic as Telegram → sends a WhatsApp **interactive list** (`sendChooser`, mode `exact`/`fuzzy`, up to 10 rows, row id `w:<type>:<id>`). Tapping a row returns an `interactive.list_reply` → `handleSelection()` fetches that title and answers. Still a **free service message** (inside the 24h window).
- **In-app entry points:** an "Ask on WhatsApp" button on the detail page (prefilled with the title) and a footer link — both gated on the client `WHATSAPP_NUMBER` constant (hidden until you set the bot number).

### 5.5 Telegram bot (`telegram.worker.js`) — `kahandekhu-telegram`
- Same "where to watch in India" reply as the WhatsApp bot, via the TMDB proxy; HTML-formatted, ends with the app-install CTA. **Free, unlimited, no verification** — easiest channel.
- **Poster images:** replies are sent via `sendPhoto` (poster from TMDB `w500`) + caption + app button (`sendReply`); falls back to text when there's no poster or the caption exceeds the 1024-char photo-caption limit. Telegram fetches the image from TMDB's CDN — no cost. Callback answers send a fresh poster and delete the chooser.
- **Growth-tuned messaging:** rich `/start` (HELP) feature pitch; a full `/features` (aliases `/about`, `/app`) showcase of every app feature; each where-to-watch reply appends a **rotating one-line teaser** (`TIPS`) so repeat users keep seeing new reasons to install, plus a `/features` pointer. CTA button: "📲 Open KahanDekhu — free". All messages well under Telegram's 4096-char limit.
- **Disambiguation + typo handling** (`searchTitles()`): TMDB search isn't fuzzy, so on an empty result the bot retries with a **prefix** of the query (first ~60%) — recovers most misspellings (`oppenhimer`→`oppenh`→Oppenheimer). Then: several **exact**-name matches → inline-button chooser ("Which one?"); **no exact match** but ≥2 results → "🤔 Did you mean one of these?" chooser of the top 10 related matches; one clear match → answers directly. Rows are `Title (year) · Movie/Series`, `callback_data = w:<type>:<id>`; tapping → `callback_query` → `handleCallback()` sends the poster answer and deletes the chooser.
- **Endpoint:** `POST /` (Telegram webhook; handles both `message` and `callback_query`; verified via `X-Telegram-Bot-Api-Secret-Token`).
- **Vars:** `TMDB_PROXY`, `APP_URL`. **Secrets:** `BOT_TOKEN` (BotFather), `WEBHOOK_SECRET`. Setup in `TELEGRAM-SETUP.md`. (Redeploy after message changes; optionally register `/features` in BotFather's command menu.)

---

## 6. Key data flows

**Search:** type → debounce → `searchMulti` → proxy → TMDB `/search/multi` → cards grid.

**Where to watch:** open title → `detail` (append `watch/providers`) → proxy → TMDB → render `results[REGION]` grouped by monetization type.

**Notify when it streams:** tap Notify → subscribe → store in D1 → cron re-checks region every 6 h → when available, encrypted Web Push → service worker shows notification → tap opens app.

**Account sync:** sign in → merge local + cloud → all prefs/watchlist writes go to both `localStorage` and Supabase (RLS-scoped).

---

## 7. Deployment

| Component | How |
|---|---|
| Web app | Upload `public/` to Cloudflare Pages (or Git-connect with output dir `public`) |
| TMDB proxy | Deployed separately as `kahandekhu-tmdb` (secret `TMDB_API_KEY`) |
| Push worker | `wrangler deploy` (config is `wrangler.toml`); needs D1 created + `VAPID_PRIVATE` + `RUN_SECRET` secrets |
| Push D1 | `wrangler d1 create kahandekhu-push` → paste id → run `push-schema.sql` |
| Supabase | Run `supabase-schema.sql`; deploy `delete-account` Edge Function; set Site URL to the app URL |

---

## 7b. Scale & free-tier limits (verified Jun 2026)

No limit on Play Store installs or app loading (Pages is unlimited). The ceilings are backend free tiers:

| Component | Free limit | ≈ capacity | Upgrade |
|---|---|---|---|
| Cloudflare Pages | Unlimited | ∞ users loading the app | — |
| **Cloudflare Workers** (proxy + push + WhatsApp) | **100k requests/day**, account-wide (Error 1027 over) | **~5–10k daily active users** | Workers Paid **$5/mo** → 10M/month |
| Supabase (optional accounts) | **50k MAU**, 500 MB DB | 50k *sign-ins*/month; most users don't sign in | Pro **$25/mo** |
| Cloudflare D1 (reminders) | 5 GB, 5M reads/100k writes per day | tens of thousands | with Workers Paid |
| TMDB API | no hard daily cap (rate-limited) | proxy edge-caches keep calls low | — |

**Bottleneck:** Workers 100k req/day (~10–12 calls per active user → ~5–10k DAU). Cross it → enable Workers Paid ($5/mo).

**Caveats:** (1) Supabase free projects pause after ~7 days of no auth activity — only account *sync* is affected (search/browse/local watchlist keep working); avoid via traffic, a weekly keep-alive, or Pro. (2) The 100k Workers limit is shared across all three workers.

**Cost ladder:** ₹0 (launch) → ~$5/mo (early scale, Workers Paid) → ~$30/mo (real scale, + Supabase Pro).

## 8. Compliance (verified against current Google Play policy)

- **Tips/support (Play-safe):** the support UI is **removed inside the Android TWA build**. Detection is bulletproof: the TWA is packaged with launch URL **`/?source=twa`** (deterministic), with a `document.referrer` fallback, persisted in `sessionStorage` — then `#openSupport` + `#supportModal` are removed from the DOM. **Don't change `manifest.json` `start_url`** (that would hide support on installed web/iOS PWAs too). Wording is **"tip/support"** everywhere — never "donate/donation". Web + iOS users still see it; peer-to-peer tips (100% to creator, no perks) stay compliant there.
- **Account deletion:** required because accounts exist → satisfied via in-app button + public `delete-account.html`.
- **Data Safety:** declares **email** collected (optional, encrypted, deletable).
- **Disclaimers:** in-app "not affiliated…" + TMDB/JustWatch attribution on every detail page and footer.
- **No ads / affiliate** until a commercial data license (free TMDB/JustWatch tier is non-commercial).

---

## 9. Decisions & behaviors worth remembering

- Notify reminders are **region-locked** to where you subscribed (cron checks that region; switching the app's region to browse elsewhere does not trigger it).
- Email confirmation is off → password recovery depends on a valid email (acceptable for a low-stakes watchlist app).
- Browse filtering is **client-side over a pool** (proxy blocks `/discover`).
- The app is one file; there is no build step.

---

## 10. How to test

- **Search/browse/detail:** open the app, search a title, open it, switch region, toggle "Only mine".
- **Accounts:** sign up → add to watchlist → sign in on another device → it syncs. Delete account → verify it disappears from Supabase → Auth → Users.
- **Push:** `wrangler deploy` → tap Notify on a title → visit `…/test?secret=RUN_SECRET` → expect a notification and `status: 201`.

---

## 11. What's next

1. ~~Phone screenshots~~ ✓ added → **Submit to Play Console** (Internal testing → Production).
2. Custom domain (kahandekhu.com) — prerequisite for SEO + trust.
3. SEO landing pages `/where-to-watch/[title]` — biggest free growth channel.
4. Decide notify scope (India-locked vs. current region vs. anywhere).

> A visual version of status + changelog also lives in the **"KahanDekhu — Project Status"** artifact in the Cowork sidebar.
