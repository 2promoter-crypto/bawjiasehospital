// /api/reset.js — password reset by email.
//
//   POST { action: 'request', identifier }  -> emails a one-time link (valid 30 min)
//   POST { action: 'confirm', token, passHash } -> sets the new password hash
//
// Passwords are never emailed (they are only stored as hashes and can't be
// read back) — the person gets a link to choose a new one.
//
// Environment variables (Vercel -> Settings -> Environment Variables):
//   ACCESS_CODE     same hospital access code the app already uses
//   RESEND_API_KEY  API key from resend.com
//   MAIL_FROM       e.g. "Bawjiase Inventory <noreply@yourdomain.com>"
//   APP_URL         optional, e.g. https://bawjiasehospital.vercel.app

import { neon } from '@neondatabase/serverless';
import { timingSafeEqual, randomBytes, createHash, randomUUID } from 'node:crypto';

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;
const sql = connectionString ? neon(connectionString) : null;

function codeOk(req) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return 'unset';
  const a = Buffer.from(String(req.headers['x-access-code'] || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function ensureTables() {
  await sql`CREATE TABLE IF NOT EXISTS reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  )`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!sql) return res.status(500).json({ error: 'Database not configured.' });

  const ok = codeOk(req);
  if (ok === 'unset') return res.status(500).json({ error: 'ACCESS_CODE is not set on the server.' });
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800));
    return res.status(401).json({ error: 'Incorrect access code.' });
  }

  try {
    await ensureTables();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

    // ---------- request a reset link ----------
    if (body.action === 'request') {
      if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
        return res.status(500).json({ error: 'Email sending is not set up yet. Ask the administrator to add RESEND_API_KEY and MAIL_FROM on the server.' });
      }
      const generic = { ok: true, message: 'If that account has an email on file, a reset link has been sent. Check your inbox and spam folder.' };
      const id = String(body.identifier || '').trim().toLowerCase();
      if (!id) return res.status(400).json({ error: 'Enter your username or email.' });

      const rows = await sql`SELECT data FROM app_state WHERE id = 1`;
      const users = (rows[0] && rows[0].data.users) || [];
      const user = users.find((u) => String(u.username || '').toLowerCase() === id || String(u.email || '').toLowerCase() === id);
      if (!user || !user.email || user.approved === false) return res.status(200).json(generic);

      const recent = await sql`SELECT 1 FROM reset_tokens WHERE user_id = ${user.id} AND created_at > now() - interval '60 seconds'`;
      if (recent.length) return res.status(200).json(generic);

      const token = randomBytes(32).toString('hex');
      await sql`DELETE FROM reset_tokens WHERE user_id = ${user.id} OR expires_at < now()`;
      await sql`INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (${sha256(token)}, ${user.id}, now() + interval '30 minutes')`;

      const base = (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, '');
      const link = `${base}/?reset=${token}`;
      const mail = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.MAIL_FROM,
          to: [user.email],
          subject: 'Reset your Bawjiase Inventory password',
          html: `<p>Hello ${esc(user.name)},</p><p>We received a request to reset your password for the Bawjiase Primary Hospital inventory ledger (username <b>${esc(user.username)}</b>).</p><p><a href="${link}">Choose a new password</a></p><p>This link works once and expires in 30 minutes. If you did not ask for this, ignore this email — your password is unchanged.</p>`,
        }),
      });
      if (!mail.ok) {
        console.error('Email send failed', mail.status, await mail.text());
        return res.status(502).json({ error: 'The email could not be sent. Ask the administrator to check the email settings.' });
      }
      return res.status(200).json(generic);
    }

    // ---------- set the new password ----------
    if (body.action === 'confirm') {
      const token = String(body.token || '');
      const passHash = String(body.passHash || '');
      if (!/^[0-9a-f]{64}$/.test(passHash) || !/^[0-9a-f]{64}$/.test(token)) {
        return res.status(400).json({ error: 'Invalid request.' });
      }
      const t = await sql`SELECT user_id FROM reset_tokens WHERE token_hash = ${sha256(token)} AND expires_at > now()`;
      if (!t.length) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });

      const st = await sql`SELECT data, version FROM app_state WHERE id = 1`;
      const data = st[0].data;
      const user = (data.users || []).find((u) => u.id === t[0].user_id);
      if (!user) return res.status(400).json({ error: 'Account not found.' });

      user.passHash = passHash;
      data.activity = Array.isArray(data.activity) ? data.activity : [];
      data.activity.push({ id: randomUUID(), ts: new Date().toISOString(), userId: user.id, name: user.name, username: user.username, action: 'Password reset by email link', detail: '' });
      data.activity = data.activity.slice(-2000);

      const upd = await sql`UPDATE app_state SET data = ${JSON.stringify(data)}::jsonb, version = ${st[0].version + 1}, updated_at = now()
                            WHERE id = 1 AND version = ${st[0].version} RETURNING version`;
      if (!upd.length) return res.status(409).json({ error: 'Someone else was saving at the same moment. Please try again.' });
      await sql`DELETE FROM reset_tokens WHERE user_id = ${user.id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error.' });
  }
}
