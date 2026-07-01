# KahanDekhu — WhatsApp bot setup

A "where to watch" bot: users WhatsApp a title (or "where to watch X") and get an instant reply with where it's streaming in India. **Free** — it only ever replies inside the 24-hour user window (service messages, free worldwide), never sends paid templates.

## Cost (why it's free)

- The WhatsApp Cloud API has **no platform fee**.
- When a user messages you first, your replies within 24h are **service messages — free** (1,000 free service conversations/month, and customer-initiated replies are free).
- This bot is **reply-only**, so it never triggers paid (template) messages.
- Build/test entirely free with Meta's **test number** (up to 5 recipients, no business verification).

---

## 0. Create your business portfolio (Meta)

WhatsApp requires a **business portfolio** first (Meta's container for your assets — formerly "Business Manager"). It's **free**, and you do **not** need a registered company — create it with your own details.

1. Click **Create a business portfolio**.
2. Fill in: **Portfolio name** = `KahanDekhu`, **Your name**, **Business email** = `hello@kahandekhu.in`.
3. Submit → return to the onboarding page and continue with step 1 below.

> **Business verification** (ID/legal docs) is a *separate, later* step. You do NOT need it to build or test (test number + up to 5 recipients). It's only required to message the general public at scale.

## 1. Create the Meta app

1. Go to **developers.facebook.com → My Apps → Create App → "Business"**.
2. In the app, **Add product → WhatsApp → Set up**.
3. The **API Setup** page shows:
- a **Test phone number** and its **Phone number ID** → this is `PHONE_NUMBER_ID`
- a **temporary access token** (expires in 24h — fine for first test)
4. Under **"To"**, add your own WhatsApp number as a test recipient (free, up to 5).

## 2. Get a permanent token (so the bot stays up)

The 24h token dies overnight. For a permanent one:
1. **business.facebook.com → Business Settings → Users → System users → Add**. Name it `kahandekhu-bot`, role **Admin** (simplest — avoids permission errors).
2. **Add assets** → select your app + WhatsApp account → enable **full control**.
3. **Generate new token** → pick the app → check scopes **`whatsapp_business_messaging`** and **`whatsapp_business_management`** → Generate.
4. Copy it immediately (shown once) → this is `WHATSAPP_TOKEN`.

## 3. Deploy the Worker

```bash
    wrangler deploy -c wrangler.whatsapp.toml
    wrangler secret put WHATSAPP_TOKEN   -c wrangler.whatsapp.toml   # the permanent token
    wrangler secret put PHONE_NUMBER_ID  -c wrangler.whatsapp.toml   # from API Setup
    wrangler secret put VERIFY_TOKEN     -c wrangler.whatsapp.toml   # any random string you make up
```
Note the deployed URL, e.g. `https://kahandekhu-whatsapp.<you>.workers.dev`.

## 4. Connect the webhook

In the Meta app → **WhatsApp → Configuration → Webhook → Edit**:
- **Callback URL:** `https://kahandekhu-whatsapp.<you>.workers.dev/webhook`
- **Verify token:** the same `VERIFY_TOKEN` you set above
- Click **Verify and save** (Meta calls the GET endpoint and expects the challenge back).
- Under **Webhook fields**, **Subscribe** to **`messages`**.

## 5. Test

From your added test number, WhatsApp the test number: **`Jawan`** (or "where to watch Oppenheimer").
You should get back a "where to watch in India" reply within a second.

---

## 6. Going live (still free)

- **Up to 5 testers:** works immediately in test mode, no verification.
- **For everyone:** complete Meta **Business Verification** (free) and add/register a real phone number (one not on a personal WhatsApp). Service replies stay free.
- Publish your bot's number anywhere — the app footer, Play listing, Instagram bio — as a **`wa.me/<number>`** link. It's forwardable in groups, which is how it spreads.

## What the bot replies

- A title → where it's streaming in India (subscription / rent / buy), with rating.
- Not in India → which other regions have it (🇺🇸 🇬🇧 🇦🇪 …).
- A greeting/help → short instructions.
- Every reply links back to the app for full options + reminders.

> The bot reuses your existing TMDB proxy — no new data source, no extra cost.

---

## Troubleshooting

**"This business account didn't comply with our Advertising Policies or other standards."**
Meta's automated systems often flag *brand-new* business portfolios with this — usually a **false positive**, not anything you did. Fix:
1. Go to **business.facebook.com/accountquality** → select the portfolio → **Request review**. (Re-review is typically 24–48h.)
2. Improve approval odds: ensure the **personal Facebook account** that owns it is established (real name, photo, confirmed email/phone); complete the portfolio info (name + website `kahandekhu.in`); don't spin up multiple portfolios quickly.
3. If it stays blocked, use a **BSP** (Twilio / Gupshup / Wati) which handles onboarding for you, **or skip WhatsApp for now** — it's a bonus channel; the app, accounts, push, and Play Store launch don't depend on it.

**"Account Restricted — This account's messaging capabilities have been restricted… You can request a review."**
Same new-account auto-flag, now on the WhatsApp side — it blocks sending/receiving (so the Test step won't work until it's lifted).
1. **Business Support Home** (business.facebook.com/support) → open the restriction → **Request review**. Wait for the decision (often 24–72h).
2. If you've hit this **more than once** on the same new account, the direct Meta path may keep fighting you. Two pragmatic routes:
   - **Use a BSP that has a sandbox** — e.g. **Twilio WhatsApp Sandbox**: you join a shared test number instantly (no Meta business verification, no restriction) and can test the bot **today, free**. (The bot's `send()` would need Twilio's API format instead of Meta's Graph API — a small worker change; ask and it'll be added.)
   - **Or ship without WhatsApp now** and add it once Meta clears the account. Nothing else depends on it.

> Reality check: repeated new-account restrictions are common with Meta. Don't let WhatsApp block your launch — it's the one feature gated on Meta's approval, and it's a bonus.
