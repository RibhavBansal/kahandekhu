# KahanDekhu — WhatsApp bot setup

A "where to watch" bot: users WhatsApp a title (or "where to watch X") and get an instant reply with where it's streaming in India. **Free** — it only ever replies inside the 24-hour user window (service messages, free worldwide), never sends paid templates.

## Cost (why it's free)

- The WhatsApp Cloud API has **no platform fee**.
- When a user messages you first, your replies within 24h are **service messages — free** (1,000 free service conversations/month, and customer-initiated replies are free).
- This bot is **reply-only**, so it never triggers paid (template) messages.
- Build/test entirely free with Meta's **test number** (up to 5 recipients, no business verification).

---

## 1. Create the Meta app

1. Go to **developers.facebook.com → My Apps → Create App → "Business"**.
2. In the app, **Add product → WhatsApp → Set up**.
3. The **API Setup** page shows:
- a **Test phone number** and its **Phone number ID** → this is `PHONE_NUMBER_ID`
- a **temporary access token** (expires in 24h — fine for first test)
4. Under **"To"**, add your own WhatsApp number as a test recipient (free, up to 5).

## 2. Get a permanent token (so the bot stays up)

The 24h token dies overnight. For a permanent one:
1. **business.facebook.com → Business Settings → Users → System users → Add** (a system user).
2. Give it the app, then **Generate token** with scopes **`whatsapp_business_messaging`** and **`whatsapp_business_management`**.
3. Copy it → this is `WHATSAPP_TOKEN`.

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
