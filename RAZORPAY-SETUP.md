# Razorpay tips — setup (≈5 min, free)

This replaces the raw UPI ID in the Support sheet with a hosted **Razorpay payment page**. Your personal UPI ID is never shown in the app; supporters pay by UPI, card, netbanking or wallet on Razorpay's own secure page.

## Why Razorpay (vs. exposing UPI)

- Your `ribhav2003@ybl` UPI ID stays private.
- One clean button; Razorpay handles every payment method.
- You get a proper dashboard, receipts, and settlement to your bank.
- Looks far more trustworthy than a raw UPI string.

## 1. Create the account

1. Go to **razorpay.com** → Sign up with your email/phone.
2. Complete **KYC** (PAN + bank account). Individuals are allowed — you don't need a registered company. Approval is usually within a day.

## 2. Get your payment-page link (two options)

**Option A — Razorpay.me (simplest, recommended)**
1. In the dashboard, search for **Razorpay.me** and claim a handle, e.g. `kahandekhu`.
2. Your link becomes **`https://razorpay.me/@kahandekhu`** (supporters can enter any amount, or you can fix one).

**Option B — Payment Pages**
1. Dashboard → **Payment Pages → Create Payment Page**.
2. Title it "Support KahanDekhu", allow a custom amount, publish.
3. Copy the published URL (looks like `https://pages.razorpay.com/...`).

## 3. Put the link in the app

Open `index.html`, find this near the top of the `<script>`:

```js
const SUPPORT_RAZORPAY = '';   // ← paste your link, e.g. 'https://razorpay.me/@kahandekhu'
```

Paste your link between the quotes, then **copy `index.html` to `public/index.html`** and redeploy.

That's it. The Support sheet now shows a single **"Support securely via Razorpay"** button, and the UPI ID/QR are hidden automatically.

## Compliance notes (keep these true)

- This is a **voluntary tip** — never tie any app feature, perk, or unlock to it (that would require Google Play billing and risks a ban).
- The wording in the app already says "voluntary tip, not a purchase — no goods or services are promised in return." Keep it.
- The tip button is **still hidden entirely inside the Play (TWA) build** via the `?source=twa` flag — Razorpay or not. It only ever appears on the web.
- The word "donation" is not used anywhere; "tip/support" is correct for an individual (a real "donation" implies a registered charity).

## Order of precedence in code

1. `SUPPORT_RAZORPAY` set → shows the Razorpay button.
2. else `SUPPORT_URL` set → shows that page button (e.g. Buy Me a Coffee).
3. else → **the Support button is hidden entirely.**

**There is no raw-UPI fallback.** The app never displays a UPI ID or any personal name under any circumstance — the hosted page is the only payment surface that can ever appear. (`https://` is added automatically if you omit it from the link.)
