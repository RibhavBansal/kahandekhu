# KahanDekhu Telegram bot — setup

This deploys the bot + "notify me when it streams" backend. Unlike the simple proxy, this one uses a database and a cron trigger, so it's deployed with the **Wrangler CLI** (not the dashboard paste).

Files (keep them together in one folder):
`telegram-bot.worker.js` · `wrangler.toml` · `schema.sql`

## 1. Create the bot
1. In Telegram, message **@BotFather** → `/newbot`.
2. Choose a name and a **username** (must end in `bot`, e.g. `KahanDekhuBot`).
3. Copy the **token** it gives you (looks like `123456:ABC-...`).
4. Note the **username** — you'll put it in the web app.

## 2. Install Wrangler & log in
```
    npm install -g wrangler
    wrangler login
```

## 3. Create the database
```
    wrangler d1 create kahandekhu
```
Copy the printed **`database_id`** into `wrangler.toml` (replace `PASTE_YOUR_D1_DATABASE_ID_HERE`).

Then create the table:
```
    wrangler d1 execute kahandekhu --remote --file=schema.sql
```

## 4. Set the secrets
Run each and paste the value when prompted:
```
    wrangler secret put BOT_TOKEN          # the @BotFather token
    wrangler secret put TMDB_API_KEY       # your free TMDB v3 key (same one is fine)
    wrangler secret put WEBHOOK_SECRET     # any random string you invent, e.g. a long password
```

## 5. Deploy
```
    wrangler deploy
```
Note the Worker URL it prints, e.g. `https://kahandekhu-bot.<your-subdomain>.workers.dev`.

## 6. Point Telegram at your Worker (webhook)
Replace `<TOKEN>`, `<WORKER_URL>`, and `<WEBHOOK_SECRET>` and run this once (in a terminal/browser):
```
    curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>/&secret_token=<WEBHOOK_SECRET>"
```
You should get `{"ok":true,...}`. (The `secret_token` must match the `WEBHOOK_SECRET` you set in step 4 — the Worker rejects requests that don't carry it.)

## 7. Test it
- Open your bot in Telegram and send a title, e.g. **Dune Part Two**.
- Pick a result. It either tells you where it's streaming, or saves a reminder.
- Try `/list` to see/cancel reminders.

The **cron** (step in `wrangler.toml`) runs automatically every 6 hours and notifies people when a saved title becomes available. To test the cron immediately without waiting:
```
    wrangler dev --test-scheduled
    # then in another terminal:
    curl "http://localhost:8787/__scheduled"
```

## 8. Connect the web app
In `kahandekhu.html`, set your bot username (without `@`):
```js
    const TELEGRAM_BOT = 'KahanDekhuBot';
```
Now any title that isn't streaming yet shows a **"Notify me when it streams"** button that opens the bot and auto-subscribes the user. Re-deploy the web app.

## 9. (Optional) Nicer bot menu
Message @BotFather → `/setcommands` → choose your bot → paste:
```
    list - Your reminders
    help - How this works
```

## Notes & scaling
- **Free tiers** comfortably cover early usage: Workers (100k req/day), D1 (generous free reads/writes), Telegram (free).
- The cron loops through all reminders sequentially. With thousands of reminders you'd batch them or spread checks across runs — fine to ignore until you're big.
- **Region:** the bot currently checks **India**. To support more regions later, store each user's region and pass it to the availability check (the schema already has a `region` column).
- Keep the **TMDB + JustWatch** attribution in the web app (it's there) and stay donations-only until you license the data.
