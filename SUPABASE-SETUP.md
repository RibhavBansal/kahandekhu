# KahanDekhu — accounts & cross-device sync (Supabase)

This adds optional sign-in so a user's **watchlist, region, and services follow them across devices**. The app still works fully without it (everything just stays local). Free tier covers early usage.

## 1. Create a Supabase project
1. Go to **supabase.com** → create a free account → **New project**.
2. Pick a name, a strong database password (you won't need it for the app), and a region close to your users (e.g. Mumbai/Singapore for India).
3. Wait ~2 minutes for it to provision.

## 2. Create the tables (with security)
- Open **SQL Editor** → **New query** → paste the contents of **`supabase-schema.sql`** → **Run**.
- This creates the `preferences` and `watchlist` tables **and enables Row Level Security** so each user can only ever access their own data. Don't skip or disable RLS — it's the security boundary.

## 3. Get your keys
- Go to **Project Settings → API**.
- Copy the **Project URL** and the **anon / public** key.

In `kahandekhu.html`, fill these in near the top of the script:
```js
    const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGci...';   // the anon/public key
```
Once both are set, an **Account** button appears in the app. Re-deploy.

> 🔒 **Security:** the **anon key is meant to be public** — it's safe in client code because RLS protects the rows. **Never** put the **service_role** key (also on that settings page) in the app or any client-side code; it bypasses RLS.

## 4. Email confirmation (choose one)
By default Supabase requires users to confirm their email before they can sign in.
- **For quick testing:** Authentication → **Providers → Email** → turn **"Confirm email" off**. Sign-ups then log in immediately.
- **For production:** leave it **on** (prevents fake signups). The app already handles this — on sign-up it tells the user to check their email.
- Supabase's built-in email has low rate limits; for real volume, add your own SMTP under Authentication → Emails.

## 5. Test it
1. Open the deployed app → **Sign in** → **Create an account**.
2. Add a few titles to your watchlist and set your region/services.
3. Open the app in another browser (or phone) and sign in with the same account — your watchlist and settings should appear.

## How sync works (so you know what to expect)
- **First sign-in on a device:** your local watchlist is **merged** with the cloud (nothing is lost — it's a union), and your cloud preferences load.
- **After that:** every add/remove and every settings change writes through to the cloud automatically.
- **Signed out:** the app keeps working on local storage only.
- **Notifications** still go through the Telegram bot (separate) — accounts and notifications are independent on purpose.

## Notes
- This stores only what's needed for sync: region, chosen services, and saved titles. It does **not** store anything sensitive. (Your privacy policy already reflects local-first storage — update it to mention optional account sync if you enable this.)
- Want Google/Apple sign-in later? Supabase supports OAuth providers — configure them under Authentication → Providers and they'll slot into the same flow.
