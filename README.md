# Bawjiase Primary Hospital — Inventory Ledger

A single-page inventory / bin-card app, wired to a shared Supabase (Postgres)
database so every device sees the same stock, transactions, and accounts.

## Folder contents

```
index.html            the entire app (HTML + CSS + JS)
supabase-schema.sql    run this once in your Supabase project
vercel.json            static-hosting config for Vercel
```

Vercel serves `index.html` automatically as the site's home page — no build
step, no framework, nothing else required.

## 1. Set up the database (one-time)

1. Create a free project at https://supabase.com.
2. Open **SQL Editor → New query**, paste the contents of `supabase-schema.sql`, and run it.
3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key
4. Open `index.html`, find these two lines near the top of the `<script>` block, and paste your values in:
   ```js
   const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```

If you skip this step, the app still works — it just falls back to storing
data only in the current browser, same as before.

## 2. Deploy to Vercel

**Option A — Vercel dashboard (no command line):**
1. Put this folder in a GitHub/GitLab/Bitbucket repo (or use "drag and drop" deploy at https://vercel.com/new).
2. Import the repo in Vercel, or drag the folder onto the new-project page.
3. Framework preset: **Other** / static — Vercel will detect `index.html` automatically.
4. Deploy.

**Option B — Vercel CLI:**
```bash
npm install -g vercel
cd this-folder
vercel        # first deploy, follow the prompts
vercel --prod # subsequent production deploys
```

## Notes

- **Live sync:** once connected to Supabase, the app doesn't just load shared data once — it stays subscribed, so a change made on any device (a new item, a sale, a stock adjustment, an approved account, etc.) is pushed to every other open device automatically, usually within a second, with no manual refresh needed.
  - If you already ran an older version of `supabase-schema.sql`, re-run the updated version once — it adds the four tables to Supabase's realtime publication (safe to re-run; it skips anything already added).
- New accounts now need an admin to approve them (Accounts panel) before they can log in — except the named super admin and the very first account created on a fresh database, so there's always someone able to approve others.
- The Supabase **anon public** key is meant to be visible in client-side code — it is not a secret. Access is controlled by the row-level-security policies in `supabase-schema.sql`, not by hiding the key. Never put your **service_role** key in this file.
- Each browser also keeps a local cache (`localStorage`) so the app opens instantly and still works offline for a moment before syncing.
