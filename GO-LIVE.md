# KahanDekhu — Go-live checklist (kahandekhu.in)

Do the setup steps first, THEN redeploy, THEN verify. Nothing here costs money.

---

## 1. Email — Zoho Mail (free forever, legit) ✉️
Zoho Mail "Forever Free": 5 users · 5 GB each · 1 domain · ₹0 forever (Zoho is a major Indian company; this is a real free plan, not a trial). The free plan works via Zoho's **webmail + mobile app** only (no IMAP/Outlook) — perfectly fine for a contact inbox.

**A) Find the free plan (Zoho hides it):**
- [ ] Open the pricing page: **https://www.zoho.com/mail/zohomail-pricing.html**
- [ ] **Scroll to the very bottom**, past the paid plans (Mail Lite / Mail Premium / Workplace). There's a separate box titled **"Forever Free Plan"** (Up to 5 users · 5 GB/user · single domain). Click **Sign Up Now** in *that* box.
  - ⚠️ Do **not** use the big "Sign Up / Get Started" buttons at the top — those start a paid 15-day trial. Only the bottom **Forever Free Plan** box is actually free.
  - If you still don't see it, make sure you're on the **Zoho Mail** pricing page (link above), not Zoho Workplace.

**B) Sign up with your domain:**
- [ ] On the signup screen choose **"Sign up with a domain I already own"** (NOT the personal `@zoho.com` option) → enter **kahandekhu.in**
- [ ] Create your admin account (verify with mobile **OTP**)

**C) Verify the domain + create the mailbox:**
- [ ] Zoho **Admin Console → Domains** → it shows a **TXT** (or CNAME) verification record → add it in **Cloudflare → DNS → Records** → back in Zoho click **Verify**
- [ ] **Users → Add user →** create **hello@kahandekhu.in**

**D) Turn on mail delivery (records in Cloudflare DNS):**
- [ ] In Zoho → **Domains → Email Configuration / MX** copy the **MX records shown for YOUR account** (usually `mx.zoho.in`, `mx2.zoho.in`, `mx3.zoho.in` with priorities 10/20/50) and add them in Cloudflare DNS
- [ ] Also add the **SPF** and **DKIM** (TXT) records Zoho lists — they stop your mail landing in spam
- [ ] Test: email hello@kahandekhu.in from another address → read it at **mail.zoho.in** or the Zoho Mail app

**E) Don't double up / don't get billed:**
- ⚠️ Do **not** also enable Cloudflare Email Routing — both use MX records and will conflict. Pick one (Zoho).
- [ ] Cancel the BigRock **Titan** free trial so you're not charged after 30 days.

## 2. Domain → Cloudflare → Pages 🌐
- [ ] Cloudflare dashboard → **Add a site** → `kahandekhu.in` (Free plan) → copy the 2 nameservers
- [ ] BigRock (myorders.bigrock.in) → domain → **Nameservers** → replace with Cloudflare's 2 → save
- [ ] Wait until the Cloudflare site shows **Active**
- [ ] Workers & Pages → your `kahandekhu` Pages project → **Custom domains** → add `kahandekhu.in` **and** `www.kahandekhu.in` → Activate (SSL auto)

## 3. Razorpay (tips) 💳
- [ ] Finish **KYC** at razorpay.com (PAN + bank; individuals OK)
- [ ] Claim your **razorpay.me** handle — it must match `SUPPORT_RAZORPAY` in `index.html` (currently `razorpay.me/@kahandekhu`)
- [ ] Open the link in a browser and confirm the payment page loads

## 4. Supabase (accounts) 🔐
- [ ] Supabase → Authentication → **URL Configuration** → set **Site URL** to `https://kahandekhu.in` and add it to the **Redirect allowlist**

## 5. Telegram bot security 🤖 (IMPORTANT)
- [ ] **Revoke the old bot token** in @BotFather (it was pasted in chat = exposed) → get a **new token**
- [ ] `npx wrangler secret put BOT_TOKEN -c wrangler.telegram.toml` (paste the new token)
- [ ] Ensure `WEBHOOK_SECRET` secret is set too

## 6. Free description auto-translation 🌐 (code ready — just attach + deploy)
Already done in the repo: `tmdb-proxy.worker.js` has the translation logic and `wrangler.tmdb.toml` already declares `[ai] binding = "AI"`. You only need to attach Workers AI and redeploy the proxy. Free tier = 10k requests/day, and results are edge-cached, so you stay well inside it. Pick one path:

**Path A — CLI (one command):**
- [ ] `npx wrangler deploy -c wrangler.tmdb.toml`

**Path B — Dashboard (no CLI):**
- [ ] Cloudflare → Workers & Pages → **kahandekhu-tmdb** → Settings → **Bindings → Add → Workers AI** → Variable name **`AI`** → Save
- [ ] Redeploy so the binding attaches: open **Edit code** (Quick Edit) → **Deploy** — **no code change needed.**
  - The worker's deployed code **already contains the translation logic** (it has `m2m100`, `env.AI`, and the `X-KD-Translate` header). Do **not** replace the whole code. Only paste `tmdb-proxy.worker.js` if you ever find the deployed version is missing that logic.

**Verify it worked** (use a **GET**, not `curl -I`/HEAD — the worker rejects HEAD, which is why you'd only see the CORS `access-control-expose-headers` line):
- [ ] Body check (simplest): `curl -s "https://kahandekhu-tmdb.bansalribhav0987.workers.dev/movie/20453?language=hi-IN&cb=1" | grep -o '"kd_translated":true'`
  → prints `"kd_translated":true` = ✅ working (the description comes back translated).
- [ ] Header check (optional): `curl -s -D - -o /dev/null "…same URL…" | grep -i '^x-kd-translate:'`
  → `x-kd-translate: translated` = ✅ · `NO-AI-BINDING` = binding not attached.
- ✅ **Confirmed live** on 20 Jun 2026 — 3 Idiots returned a Hindi overview + `kd_translated:true`.

---

## 7. REDEPLOY (only after 1–6) 🚀
- [ ] **`public/` → Pages** (redeploy the site; share/push links now use kahandekhu.in)
- [ ] Workers (apply new `APP_URL`, service bindings, new token):
  ```
  npx wrangler deploy -c wrangler.telegram.toml     # bot: new URL, new token, disambiguation, posters
  npx wrangler deploy                               # push worker (wrangler.toml)
  npx wrangler deploy -c wrangler.tmdb.toml         # proxy: enables free description translation (step 6)
  npx wrangler deploy -c wrangler.whatsapp.toml     # when Meta is reconnected
  ```
- [ ] Set the Telegram webhook to the (re)deployed worker URL if it changed (see `TELEGRAM-SETUP.md`)

## 8. Verify after going live ✅
- [ ] `https://kahandekhu.in` loads over HTTPS (no Chrome URL bar once assetlinks verified for TWA)
- [ ] Search works · typo (e.g. `oppenhimer`) recovers · detail page loads
- [ ] Sign up / sign in works · watchlist syncs · **delete account** works (in-app + `/delete-account.html`)
- [ ] Language switch updates UI + titles + watchlist
- [ ] Support button → Razorpay page loads (and is hidden in the TWA build)
- [ ] Push "notify me when it streams" subscribes without error
- [ ] Telegram bot: `/start`, a title, `/features`, a typo, and `Guilty` (chooser) all work
- [ ] Email: hello@kahandekhu.in receives a test message

## 9. Later (Play Store) 📱
- [ ] Package the TWA with launch URL `https://kahandekhu.in/?source=twa`
- [ ] `assetlinks.json` served at `https://kahandekhu.in/.well-known/assetlinks.json` (already in `public/`)
- [ ] Fill Data Safety exactly as in `PLAYSTORE-SETUP.md` (email collected, deletion URL, no ads)

---

### Notes
- Everything (app, workers, docs, Twitter kit, contact email) already points to **kahandekhu.in** — no more code edits needed before redeploy.
- Keep `kahandekhu.pages.dev` alive as a fallback; you can later redirect it to the apex domain.
- **Never** ship the Supabase `service_role` key, VAPID private key, `RUN_SECRET`, or `BOT_TOKEN` in client code — they stay as Worker/Supabase secrets.
