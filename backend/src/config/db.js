/**
 * PostgreSQL connection pool.
 * Uses DATABASE_URL from .env.
 *
 * Password rotation: if DB_PASSWORD_NEXT is set, the pool keeps working
 * across a Supabase password change. When the database (or its pooler)
 * rejects the current password, new connections switch to the other one.
 */

const { Pool } = require('pg');
const { parse } = require('pg-connection-string');

const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
const parsed = parse(process.env.DATABASE_URL || '');
const passwords = [parsed.password || '', process.env.DB_PASSWORD_NEXT || ''].filter(Boolean);
let active = 0;

/* Connection details without the password; the password is supplied per
   connection so it can change without a restart */
const pool = new Pool({
  host:     parsed.host,
  port:     parsed.port ? Number(parsed.port) : undefined,
  user:     parsed.user,
  database: parsed.database,
  password: passwords.length > 1 ? () => passwords[active] : passwords[0],
  ssl,
});

function isAuthFailure(err) {
  return err && (err.code === '28P01' || /password authentication failed|password must be a string/i.test(err.message || ''));
}

/* Switch to the other password once, and retry */
function switchPassword(err) {
  if (!isAuthFailure(err) || passwords.length < 2) return false;
  active = (active + 1) % passwords.length;
  console.warn(`[DB] Password rejected — switched to password #${active + 1} of ${passwords.length}`);
  return true;
}

const rawQuery = pool.query.bind(pool);
pool.query = function (...args) {
  if (typeof args[args.length - 1] === 'function') return rawQuery(...args);   /* callback style: unchanged */
  return rawQuery(...args).catch(err => {
    if (switchPassword(err)) return rawQuery(...args);
    throw err;
  });
};

const rawConnect = pool.connect.bind(pool);
pool.connect = function (cb) {
  if (typeof cb === 'function') return rawConnect(cb);
  return rawConnect().catch(err => {
    if (switchPassword(err)) return rawConnect();
    throw err;
  });
};

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;
