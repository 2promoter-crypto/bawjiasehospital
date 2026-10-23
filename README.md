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
2. Open `supabase-schema.sql` and replace `CHANGE-THIS-ACCESS-CODE` with your own long, hard-to-guess **access code** (e.g. four random words). Then open **SQL Editor → New query**, paste the whole file, and run it.
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

- **Access code:** the database only answers requests that carry the access code, so someone who finds the site address and the public anon key still cannot read or change anything. Staff enter the code once per device. It is checked inside Supabase (`app_access_ok()` in the schema), not just in the browser.
  - To change the code later, edit it in the schema file and run only the `create or replace function app_access_ok()` statement again. Every device will then ask for the new code.
  - If you already ran an older version of `supabase-schema.sql`, re-run this one once — it replaces the old open policies (safe to re-run).
  - Use a long code: the check can be tried repeatedly, so a short one could be guessed.
- **Resetting a forgotten password:** an admin opens **Password → Accounts** and clicks **Reset password** next to the person's name, then types (or generates) a new password and gives it to them. Any admin can reset any other account, including the owner's. Anyone can change their own password with **Change my password** on the same page.
  - If the **owner** forgets their password, run this in Supabase's SQL Editor (replace `NewPassword123`):
    ```sql
    update app_users
    set pass_hash = encode(extensions.digest('NewPassword123', 'sha256'), 'hex')
    where username = 'addae_mintah';
    ```
- **Forgot password (date of birth):** each account stores a hashed date of birth (asked at sign-up; existing accounts are asked to add one the next time they log in, or via **Password → Set my date of birth**). On the login screen, **Forgot password?** takes a username + date of birth and lets the person set a new password. After 5 wrong tries on a device it pauses for 15 minutes. **One-time step:** run `alter table app_users add column if not exists dob_hash text;` in the Supabase SQL Editor (it's also in `supabase-schema.sql`). A date of birth is easier to guess than a password, so keep admins' accounts protected by also using a strong password.
- **Not issued in 2 months alert:** the Dashboard shows a banner and a table of items that are in stock but have had no Stock Out in the past 2 months (with the last issue date and how long they've been idle). Items received less than 2 months ago and items with no stock left are not listed. No database change is needed.
- **Procurement request:** in the Export tab, pick 4, 5 or 6 months and export a CSV or PDF. For each item it totals the Stock Out quantity over that period, averages it per month, and requests (average x months) minus the current balance, rounded up, with unit cost and estimated cost plus a grand total. Items with no consumption or enough stock are left out.
- **Admin-only tabs:** Transactions, Items and Export are visible and openable only to admins (the owner and anyone made an admin). Other users see Dashboard, Stock, Search and Password. This is enforced in the app's screens; it does not stop someone technical from reading the data directly from the database.
- **Bin cards in detail:** the Stock tab has a Layout switch. **Details (table)** (the default) lists every item with prices, total received, total issued, balance on hand, stock value, reorder level, expiry and last activity. **Bin card** (or **View details** in Cards layout) opens the full ledger for that item: each transaction with date, type, supplier/department, received, issued, running balance and who recorded it, with CSV and PDF export.
- **Live sync:** when someone saves a change, other open devices are nudged within about a second and re-read the data; a refresh also runs every 30 seconds as a safety net.
- New accounts now need an admin to approve them (Accounts panel) before they can log in — except the named super admin and the very first account created on a fresh database, so there's always someone able to approve others.
- The Supabase **anon public** key is meant to be visible in client-side code — it is not a secret. Access is controlled by the row-level-security policies (which require the access code) in `supabase-schema.sql`, not by hiding the key. Never put your **service_role** key in this file.
- Each browser also keeps a local cache (`localStorage`) so the app opens instantly and still works offline for a moment before syncing.
