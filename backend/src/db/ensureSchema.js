/**
 * Idempotent schema additions applied on server start.
 * Each statement must be safe to run repeatedly (IF NOT EXISTS etc.).
 * Running these at startup means a deploy can never run code ahead
 * of the columns it depends on.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');

const STATEMENTS = [
  /* Each user's IANA timezone, e.g. 'Africa/Lagos', 'Africa/Nairobi' */
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(80)`,
  /* All staff are currently in Nigeria */
  `UPDATE users SET timezone = 'Africa/Lagos'
     WHERE timezone IS NULL AND role <> 'student'`,
];

async function ensureSchema() {
  for (const sql of STATEMENTS) {
    try { await pool.query(sql); }
    catch (e) { logger.warn('[SCHEMA] ' + e.message); }
  }
}

module.exports = { ensureSchema };
