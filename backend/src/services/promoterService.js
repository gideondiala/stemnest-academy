/**
 * Promoter (referral link) attribution and rewards.
 *
 * A promoter's link (…?ref=CODE) is remembered in the visitor's browser for
 * 30 days and saved on the demo booking / website enquiry they make. The code
 * follows the student through handover and onboarding (users.promoter_id).
 * When that student's FIRST payment is recorded, the promoter earns their
 * agreed percentage of it — once per student (promoter_rewards.student_id is
 * unique).
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');

function normCode(code) {
  const c = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return c.length >= 2 && c.length <= 40 ? c : null;
}

/** Promoter id for a ref code, if it is a known, active promoter. */
async function idForCode(db, code) {
  const c = normCode(code);
  if (!c) return null;
  const r = await db.query(`SELECT id FROM promoters WHERE code = $1 AND is_active = TRUE`, [c]);
  return r.rows[0] ? r.rows[0].id : null;
}

/**
 * Record the promoter's reward for a student's first payment (no-op when the
 * student has no promoter, the reward already exists, or the amount is 0).
 * Uses the student's earliest confirmed payment as the "first pay". Never throws.
 */
async function rewardFirstPayment(studentId, db = pool) {
  try {
    const s = (await db.query(
      `SELECT u.promoter_id, p.reward_pct, p.is_active FROM users u JOIN promoters p ON p.id = u.promoter_id
       WHERE u.id = $1`, [studentId])).rows[0];
    if (!s) return null;
    const pay = (await db.query(
      `SELECT id, amount, currency FROM payments
       WHERE student_id = $1 AND status = 'confirmed' AND amount > 0
       ORDER BY COALESCE(confirmed_at, created_at) ASC LIMIT 1`, [studentId])).rows[0];
    if (!pay) return null;
    const pct = Number(s.reward_pct) || 0;
    const reward = Math.round(Number(pay.amount) * pct) / 100;
    const r = await db.query(
      `INSERT INTO promoter_rewards (promoter_id, student_id, payment_id, amount_paid, currency, reward_pct, reward_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (student_id) DO NOTHING RETURNING id`,
      [s.promoter_id, studentId, pay.id, pay.amount, pay.currency || 'NGN', pct, reward]);
    if (r.rows.length) logger.info(`[PROMOTER] Reward ${reward} ${pay.currency} (${pct}%) recorded for promoter ${s.promoter_id}, student ${studentId}`);
    return r.rows[0] || null;
  } catch (e) {
    logger.warn(`[PROMOTER] rewardFirstPayment failed for ${studentId}: ${e.message}`);
    return null;
  }
}

module.exports = { normCode, idForCode, rewardFirstPayment };
