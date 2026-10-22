# Bawjiase Primary Hospital — Inventory Ledger (shared/hosted version)

This is your inventory app modified so the data (items, transactions, staff
logins) lives in a real shared database instead of the browser's local
storage. Deploy it once on Vercel and every computer that opens the link
sees the same inventory.

## What changed from your original file

- `items`, `transactions`, and `users` are now stored in one Postgres row
  and fetched/saved through a small API (`/api/state.js`), instead of
  `localStorage`.
- Everything else — the UI, the login screen, PDF/CSV export, the theme
  toggle, the app-open password lock — works exactly as before. Those
  small settings (theme, device password lock, "who's logged in on this
  browser") intentionally stay local to each device, since they're not
  shared inventory data.
- The app polls the database every 20 seconds and refreshes automatically
  if another device has saved changes, so staff don't have to keep
  reloading the page.
- **Known limitation:** if two people save an edit at the exact same
  moment, the second save is rejected and that device reloads the latest
  data (you'll see a message). This is a simple "whole document" backend,
  not row-level locking — fine for a small hospital's day-to-day use, but
  worth knowing about.

## Deploy steps

1. **Push this folder to a GitHub repo** (or use the Vercel CLI to deploy
   the folder directly — `npx vercel` from inside it).

2. **Import the repo into Vercel** (vercel.com → Add New → Project).
   No build settings are needed — it's a static `index.html` plus one
   serverless function in `/api`.

3. **Add a Postgres database:** in your Vercel project, go to
   **Storage → Create Database**, and choose a Postgres provider (Neon is
   the default free option). This automatically sets a `DATABASE_URL`
   (or `POSTGRES_URL`) environment variable on your project — you don't
   need to copy/paste any connection string yourself.

3b. **Set the access code:** Settings → Environment Variables → add `ACCESS_CODE` with a long, hard-to-guess code (e.g. 4+ random words) for Production. Without it the API refuses every request. Staff enter it once per device.

4. **Redeploy** (Vercel will prompt you to redeploy after linking the
   database, so the new environment variable is picked up).

5. Open your `*.vercel.app` URL. The first person to open it registers
   the first account, which automatically becomes the owner/admin
   account — same as before. The database table is created automatically
   on first request (`ensureTable()` in `/api/state.js`), so there's no
   manual SQL step.

## Local testing (optional)

```
npm install
npx vercel dev
```

`vercel dev` runs the static file and the `/api` function together and
will ask you to link the same Postgres database (or create one) for your
local environment.

## Files

- `index.html` — the app (frontend). Only the data-loading/saving code
  near the top and bottom of the `<script>` block changed.
- `api/state.js` — the serverless function. `GET` returns the current
  data; `POST` saves it (with a version check to catch simultaneous
  edits).
- `package.json` — declares the one dependency (`@neondatabase/serverless`)
  used to talk to Postgres.

## Account approval

New accounts are created as "awaiting approval" and cannot log in until an
admin approves them (Password tab → Accounts → Approve). The first account,
and the owner username, are approved automatically. Admins can also revoke
access later; the person is signed out the next time their screen syncs.

## Forgotten password by email

Passwords are stored only as hashes, so they can't be emailed back. Instead
people get a one-time link (valid 30 minutes) to choose a new one.

1. Create a free account at resend.com, create an API key, and (to email
   anyone other than yourself) verify a sending domain there.
2. In Vercel -> Settings -> Environment Variables add, for Production:
   - `RESEND_API_KEY` — the key from Resend
   - `MAIL_FROM` — e.g. `Bawjiase Inventory <noreply@yourdomain.com>`
   - `APP_URL` (optional) — e.g. `https://bawjiasehospital.vercel.app`
3. Redeploy.
4. New accounts enter an email when registering. For existing accounts, an
   admin opens Password tab -> Accounts -> Set email.
5. On the login screen, "Forgot password?" sends the link.
