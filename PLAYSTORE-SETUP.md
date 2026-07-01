# KahanDekhu → Play Store (TWA) — submission & compliance guide

This wraps your live PWA in a thin Android app (a Trusted Web Activity) so it can ship on the Play Store. Everything below has been checked against current Google Play policy (verified June 2026). Do the steps in order.

---

## ⚠️ Compliance summary — read first

Your account-ban risk comes from three areas. Here's where each stands:

| Area | Status | Why |
|---|---|---|
| **Donations via UPI/Razorpay** | ✅ Allowed | Google treats a contribution as a permitted peer-to-peer payment (no Google Play billing needed) when **100% goes to you and it unlocks no content or features**. Your copy already says "voluntary donation, not a purchase — nothing's locked behind it." **Never tie any perk to a donation** or this breaks. |
| **Account deletion** | ✅ Now handled | Because the app lets users create an account, Google **requires** an in-app delete path *and* a public web deletion link. Both now exist (in-app "Delete account & data" button + `delete-account.html`). |
| **Data Safety accuracy** | ✅ Fixed below | The app collects **email** (Supabase sign-in). The form must say so. The old "no data collected" answer was wrong and is itself a bannable mismatch. |
| **Brand logos / impersonation** | ✅ Mitigated | App name (KahanDekhu) and icon (bulb) are original — no impersonation. Streaming logos come from TMDB and are shown descriptively with a visible "not affiliated/endorsed" disclaimer in-app. |
| **TMDB / JustWatch terms** | ✅ Attributed | Full TMDB + JustWatch attribution is visible in-app. Keep it. Free tier is non-commercial → **no ads until you license the data** (donations are fine). |

---

## 0. Prerequisites (must be live before packaging)

1. **App deployed** to HTTPS (Cloudflare Pages) — the `public/` folder, including the new `delete-account.html`.
2. **Privacy policy** hosted: `https://kahandekhu.in/privacy.html` (already updated to disclose email + accounts).
3. **Deletion page** hosted: `https://kahandekhu.in/delete-account.html`.
4. **Account-deletion Edge Function deployed** so the in-app delete button works:
- In Supabase: **Edge Functions → Deploy a new function** named `delete-account`, paste the contents of `supabase/functions/delete-account/index.ts`.
- Or via CLI: `supabase functions deploy delete-account`.
- No secrets to set — Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` automatically.
- Test: sign in on the live site → Synced → Delete account & data → confirm the account disappears from Supabase → Authentication → Users.
5. **Lighthouse → Installable** passes in Chrome DevTools, with no manifest warnings.

---

## 1. Generate the Android package (PWABuilder — easiest)

1. Go to **pwabuilder.com**, enter your live URL.
2. **Package For Stores → Android** → open **Android options** before downloading.
3. **⚠️ Set the launch/start URL to include the TWA flag:** change it to **`https://kahandekhu.in/?source=twa`** (PWABuilder: "Start URL" field in Android options; Bubblewrap: `startUrl: "/?source=twa"` in `twa-manifest.json`). **Do NOT change `manifest.json`'s `start_url`** — only the Android package's launch URL. This flag makes the app hide the tip/support button (Play compliance) without affecting web/iOS users.
4. Download the package — it produces a **signed `.aab`** plus the **SHA-256 signing fingerprint** and a ready-made `assetlinks.json`.
- Keep the signing key/keystore it gives you **safe and backed up** — losing it means you can never update the app.
- *(CLI alternative: `npm i -g @bubblewrap/cli` → `bubblewrap init --manifest https://kahandekhu.in/manifest.json` → set `startUrl` to `/?source=twa` in `twa-manifest.json` → `bubblewrap build`.)*

## 2. Verify domain ownership (removes the browser URL bar)

Host the generated **`assetlinks.json`** at exactly:
`https://kahandekhu.in/.well-known/assetlinks.json`

On Cloudflare Pages, put it in a `.well-known` folder inside `public/`. Without this the app shows a Chrome address bar (looks unfinished).

---

## 3. Play Console (one-time ~₹2,000 / $25)

Create the app at **play.google.com/console**, then complete each section.

### Store listing — copy you can paste

- **App name:** `KahanDekhu — Where to Watch`
- **Short description (≤80 chars):**
`Find where to watch any movie or show in India — across every streaming app.`
- **Full description:**
```
KahanDekhu tells you where to legally watch any movie or show in India.

Type a title and instantly see every platform it's on — Netflix, JioHotstar,
Prime Video, SonyLIV, ZEE5 and more — split into subscription, free, rent and buy.

• Search any movie or series with instant results
• Browse what's trending, in cinemas, and top rated
• "My Services" — pick what you pay for and we flag what you can already watch
• Save titles to a watchlist
• Switch regions: India, USA, UK, UAE, Canada, Australia, Singapore, Germany
• Optional free account to sync your watchlist across devices
• Works offline and installs like a native app
• Or just ask on WhatsApp — no install needed: message "where to watch <title>" to wa.me/<your-number>

KahanDekhu is a free, independent app. It is not affiliated with, endorsed by,
or sponsored by any streaming service. Where-to-watch data by JustWatch;
metadata by TMDB (this product uses the TMDB API but is not endorsed or
certified by TMDB).
```
    - **App icon:** 512×512 — use `icon-512.png`
    - **Feature graphic:** 1024×500 (create one; can reuse the wordmark + tagline on the dark theme)
    - **Phone screenshots (min 2):** capture search, a detail page, and the browse view (your `screenshot-mobile.png` is a start)
    
    ### Data safety form — answer EXACTLY like this
    
    > These answers must match the privacy policy and the actual app. Mismatches get apps removed.
    
    - **Does your app collect or share any of the required user data types?** → **Yes**
    - **Data collected:**
    - **Email address** — Collected. Purpose: **App functionality / Account management**. **Optional** (app works without an account). Not shared with third parties. **Encrypted in transit: Yes.**
    - (Watchlist/region/preferences are app content, stored locally or in the user's own account — not a "personal data type" you must list. Don't over-declare.)
    - **Is all collected data encrypted in transit?** → **Yes**
    - **Do you provide a way for users to request that their data be deleted?** → **Yes**
    - **Account deletion URL:** `https://kahandekhu.in/delete-account.html`
    - **Data shared with third parties?** → **No**
    
    ### Account deletion questions (in App content)
    
    - **Does your app let users create an account?** → **Yes**
    - **In-app deletion available?** → **Yes** (the "Delete account & data" button)
    - **Web deletion URL:** `https://kahandekhu.in/delete-account.html`
    
    ### Other declarations
    
    - **Ads:** **No ads** — keep it this way until you license the watch-availability data. Turning on an ad SDK on the free TMDB/JustWatch tier risks losing API access *and* contradicts your data terms.
    - **Content rating:** complete the questionnaire — general audience, no objectionable content. Likely rated **3+ / Everyone**.
    - **Target audience & content:** **13+** (general audience; not directed at children — keeps you out of the stricter Families program).
    - **Government app / financial / health:** No to all.
    - **Payments:** You are **not** using Google Play billing. Donations are peer-to-peer (see compliance summary). Do not declare in-app purchases.
    
    ### Release
    
    - Upload the `.aab` to **Internal testing** first → install on your own phone → verify: search works, sign-in works, **Delete account works**, donate button opens your UPI, no Chrome URL bar.
    - Then promote to **Production** and submit for review.
    
    ---
    
    ## 4. After approval
    
    - Web app changes deploy instantly (the TWA points at your live site). You only re-submit to Play if you change the Android wrapper itself (name, icon, package id).
    - If you ever add OAuth (Google sign-in), update the Data Safety form if new data types are collected.
    
    ---
    
    ## Hard rules to never break (these cause bans)
    
    1. **No perks for donations.** The moment a donation unlocks anything, it becomes a digital purchase that legally requires Google Play billing.
    2. **No ads / affiliate links** until you have a commercial data license (JustWatch Partner API or Watchmode). The free tier is non-commercial.
    3. **Keep Data Safety truthful.** If you change what you collect, update the form the same day.
    4. **Keep attribution + the "not affiliated" disclaimer visible** in the app. They're already in the footer and on every detail page.
    5. **Never put the Supabase `service_role` key in the app** — it only lives in the Edge Function.
    6. **Back up your signing keystore.** Losing it permanently blocks app updates.
