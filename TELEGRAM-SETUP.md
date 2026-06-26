# KahanDekhu — Telegram bot setup (detailed)

A "where to watch" bot on Telegram: users message a title and instantly get where it's streaming in India, plus a link to the app. **Free, unlimited, no verification, no review** — the easiest channel to launch. Setup is ~10 minutes.

Files: `telegram.worker.js` (the bot), `wrangler.telegram.toml` (config).

---

## Step 1 — Create the bot with BotFather (2 min)

1. Open Telegram and search for **@BotFather** (the one with the blue verified tick). Open it and press **Start**.
2. Send **`/newbot`**.
3. BotFather asks for a **name** (display name) → send: `KahanDekhu`.
4. BotFather asks for a **username** → it must be unique and **end in `bot`**, e.g. `KahanDekhuBot` or `kahandekhu_bot`. Send your choice.
5. BotFather replies with a **token** that looks like:
   ```
   123456789:AAH...your-long-token...xyz
   ```
   **Copy and keep this token private** — it's your `BOT_TOKEN`. Anyone with it can control your bot.

*(Optional polish, still in BotFather):*
- `/setdescription` → a line shown on the bot's profile, e.g. "Find where to watch any movie or show in India."
- `/setabouttext` → short about text.
- `/setuserpic` → upload your `icon-512.png` as the bot avatar.
- `/setcommands` → paste:
  ```
  start - How to use the bot
  help - How to use the bot
  ```

---

## Step 2 — Install Wrangler & log in (skip if already done)

```bash
npm install -g wrangler
wrangler login
```

---

## Step 3 — Deploy the bot Worker

From your project folder:

```bash
wrangler deploy -c wrangler.telegram.toml
```

Note the deployed URL it prints, e.g.:
```
https://kahandekhu-telegram.<you>.workers.dev
```

---

## Step 4 — Set the two secrets

```bash
wrangler secret put BOT_TOKEN -c wrangler.telegram.toml
#   paste the token from BotFather

wrangler secret put WEBHOOK_SECRET -c wrangler.telegram.toml
#   paste any random string you make up (e.g. a long password) — remember it for Step 5
```

If it asks to create the `kahandekhu-telegram` Worker, answer **Yes**.

---

## Step 5 — Connect Telegram to your Worker (register the webhook)

This tells Telegram to send messages to your Worker. Run **one** curl command, filling in:
- `<BOT_TOKEN>` — your BotFather token
- `<WORKER_URL>` — the URL from Step 3
- `<WEBHOOK_SECRET>` — the **same** secret you set in Step 4

> **Replace each `<...>` entirely — delete the angle brackets too.** `secret_token` must exactly match `WEBHOOK_SECRET` and may contain only letters, numbers, `_` and `-` (no `<`, spaces, or symbols). A mismatch makes the Worker reject every update with 403 (bot stays silent).

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<WORKER_URL>&secret_token=<WEBHOOK_SECRET>"
```

You should get back:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

To check anytime:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```
(`"url"` should be your Worker URL, `"pending_update_count"` low.)

---

## Step 6 — Test it

Open your bot in Telegram (search its `@username`, or open `https://t.me/<username>`), press **Start**, then send **`Jawan`**.
You should instantly get back where it's streaming in India + a link to the app. 🎉

---

## Step 7 (optional) — Add an "Open on Telegram" link in the app

Once it works, tell me your bot username and I'll add an **"Ask on Telegram"** link to the app footer / detail page (a `t.me/<username>` deep link), the same way the WhatsApp entry points work — so users discover the bot.

---

## Notes

- **Free & unlimited:** Telegram bots have no per-message cost and no business verification. The only limit is your Cloudflare Workers free tier (100k requests/day, shared with the other workers).
- **Privacy:** keep `BOT_TOKEN` secret. If it ever leaks, run `/revoke` in BotFather to get a new one (then update the secret + re-set the webhook).
- The bot reuses your **TMDB proxy**, so no new API key is needed.
- To stop the bot: `curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook"`.
