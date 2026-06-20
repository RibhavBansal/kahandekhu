# KahanDekhu → Play Store (TWA) setup

This wraps your PWA in a thin Android app (a Trusted Web Activity) so it can ship on the Play Store. Do these in order.

## 0. Prerequisite: the PWA must be live and installable
- Deploy the app to **HTTPS** (Cloudflare Pages): upload `index.html` (rename `kahandekhu.html` → `index.html`), `manifest.json`, `service-worker.js`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, and `privacy.html`.
- Open it in Chrome → DevTools → **Lighthouse → Installable** check should pass. You should also see an install prompt in Chrome's address bar.
- **Note `start_url`/`scope`:** the manifest uses `./index.html`. If you host at a custom path, keep all files in the same folder so these resolve.

## 1. Generate the Android package (easiest path: PWABuilder)
1. Go to **pwabuilder.com**, enter your live URL.
2. It analyses the manifest/SW and lets you **Package For Stores → Android**.
3. Download the package — it produces a **signed `.aab`** (App Bundle) and shows you the **SHA-256 signing fingerprint** plus a ready-made `assetlinks.json`.
   - *(CLI alternative: `npm i -g @bubblewrap/cli` → `bubblewrap init --manifest https://YOURSITE/manifest.json` → `bubblewrap build`.)*

## 2. Verify domain ownership (removes the browser URL bar)
- Host the generated **`assetlinks.json`** at exactly:
  `https://YOURSITE/.well-known/assetlinks.json`
- On Cloudflare Pages, create a `.well-known` folder with that file. Without this, the app shows a Chrome address bar at the top (looks unfinished).

## 3. Play Console (one-time ~₹2,000 / $25)
Create the app at **play.google.com/console**, then complete:

**Store listing**
- App name: KahanDekhu
- Short + full description (lead with: "Find where to watch any movie or show in India")
- **App icon** 512×512 (use `icon-512.png`)
- **Feature graphic** 1024×500
- **Phone screenshots** (min 2 — capture the search, a detail page, browse)

**Policy & compliance**
- **Privacy policy URL** → host `privacy.html` and link it (e.g. `https://YOURSITE/privacy.html`). Fill in the `[ADD DATE]` and `[ADD YOUR EMAIL]` placeholders first.
- **Data safety form** → declare honestly: **no personal data collected**; preferences/watchlist are **stored only on the device**; no data shared with third parties. (This matches your privacy policy.)
- **Content rating** questionnaire → complete it (this app is general audience).
- **Ads** → declare **No ads** (you're donations-only until you license the data — keep it that way).
- **Target audience** → 13+ (general audience, not directed at children).

**Release**
- Upload the `.aab` to a track (start with **Internal testing** to try it on your own phone, then **Production**).
- Submit for review.

## 4. After approval
- Updates to the web app deploy instantly (it's a TWA pointing at your live site) — you only re-submit to Play if you change the Android wrapper itself (icon, name, package).

## Reminders
- Keep **donations-only** (no ad SDK) until you migrate watch-availability to a licensed source — turning on ads on the free TMDB/JustWatch tier risks losing API access.
- Keep the **JustWatch + TMDB attribution** visible in the app (it already is) — required.
- The iOS App Store is a separate, stricter, $99/yr path — skip it for now; the PWA already installs on iPhone via Safari "Add to Home Screen".
