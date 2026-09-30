/**
 * Resolve the timezone to use when showing a user a class time
 * (emails, notifications).
 *
 * Order of preference:
 *   1. users.timezone (auto-detected from the browser on login)
 *   2. timezone captured on the student's demo booking
 *   3. timezone captured on an enrolment request with the same email
 *   4. WAT (platform default)
 */

const pool = require('../config/db');
const { PLATFORM_TZ, isValidTimeZone } = require('../utils/timezone');

async function resolveUserTimeZone(userId, email) {
  try {
    if (userId) {
      const u = await pool.query('SELECT email, timezone FROM users WHERE id = $1', [userId]);
      if (u.rows.length) {
        if (isValidTimeZone(u.rows[0].timezone)) return u.rows[0].timezone;
        email = email || u.rows[0].email;
      }

      /* Demo booking for this student (timezone captured in notes) */
      const b = await pool.query(
        `SELECT notes FROM bookings
         WHERE student_id = $1 AND is_demo = TRUE
         ORDER BY booked_at DESC LIMIT 5`,
        [userId]
      );
      for (const row of b.rows) {
        const tz = _notesTz(row.notes);
        if (isValidTimeZone(tz)) return tz;
      }
    }

    if (email) {
      const e = await pool.query(
        `SELECT timezone FROM enrollment_requests
         WHERE LOWER(email) = LOWER($1) AND timezone IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        [email]
      ).catch(() => ({ rows: [] }));
      if (e.rows.length && isValidTimeZone(e.rows[0].timezone)) return e.rows[0].timezone;
    }
  } catch { /* fall through to default */ }
  return PLATFORM_TZ;
}

function _notesTz(notes) {
  try {
    const n = typeof notes === 'string' ? JSON.parse(notes || '{}') : (notes || {});
    return n.timezone || null;
  } catch { return null; }
}

module.exports = { resolveUserTimeZone };
