// /api/state.js
//
// One shared "document" of inventory data (items, transactions, users)
// stored as JSONB in a single Postgres row. This mirrors how the app used
// to keep everything as three arrays in localStorage — it just persists
// them centrally now, so every device sees the same data.
//
// GET  -> { items, transactions, users, version }
// POST -> body { items, transactions, users, version }
//         Writes only if `version` still matches the row in the database
//         (optimistic concurrency). If someone else saved in the meantime,
//         responds 409 with the latest data so the client can reload it.
//
// Requires a Postgres connection string in one of these env vars, which
// Vercel injects automatically once you add a Postgres integration
// (Neon/Supabase/etc.) from the Storage tab: DATABASE_URL,
// POSTGRES_URL, or DATABASE_URL_UNPOOLED.

import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

// Set ACCESS_CODE in Vercel -> Settings -> Environment Variables. Every request
// must send it in the x-access-code header or it is rejected (fails closed).
function codeOk(req) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return 'unset';
  const given = String(req.headers['x-access-code'] || '');
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  console.error(
    'No Postgres connection string found. Add a Postgres integration to this ' +
    'project in the Vercel dashboard (Storage tab) so DATABASE_URL is set.'
  );
}

const sql = connectionString ? neon(connectionString) : null;

const EMPTY_STATE = { items: [], transactions: [], users: [], activity: [] };

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS app_state (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      version INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    INSERT INTO app_state (id, data, version)
    VALUES (1, ${JSON.stringify(EMPTY_STATE)}::jsonb, 0)
    ON CONFLICT (id) DO NOTHING
  `;
}

export default async function handler(req, res) {
  if (!sql) {
    res.status(500).json({
      error: 'Database not configured. Add a Postgres integration in the Vercel Storage tab.'
    });
    return;
  }

  const ok = codeOk(req);
  if (ok === 'unset') {
    res.status(500).json({ error: 'ACCESS_CODE is not set on the server. Add it in Vercel environment variables and redeploy.' });
    return;
  }
  if (!ok) {
    await new Promise(r => setTimeout(r, 800));
    res.status(401).json({ error: 'Incorrect access code.' });
    return;
  }

  try {
    await ensureTable();

    if (req.method === 'GET') {
      const rows = await sql`SELECT data, version FROM app_state WHERE id = 1`;
      const row = rows[0];
      res.status(200).json({ ...row.data, version: row.version });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { items, transactions, users, version } = body || {};
      const activity = Array.isArray(body && body.activity) ? body.activity.slice(-2000) : [];

      if (!Array.isArray(items) || !Array.isArray(transactions) || !Array.isArray(users)) {
        res.status(400).json({ error: 'items, transactions, and users must be arrays.' });
        return;
      }

      const rows = await sql`SELECT data, version FROM app_state WHERE id = 1`;
      const current = rows[0];

      if (typeof version !== 'number' || version !== current.version) {
        res.status(409).json({ conflict: true, ...current.data, version: current.version });
        return;
      }

      const newVersion = current.version + 1;
      const data = { items, transactions, users, activity };
      await sql`
        UPDATE app_state
        SET data = ${JSON.stringify(data)}::jsonb, version = ${newVersion}, updated_at = now()
        WHERE id = 1
      `;
      res.status(200).json({ ok: true, version: newVersion });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + (err && err.message ? err.message : String(err)) });
  }
}
