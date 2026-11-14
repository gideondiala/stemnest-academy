/**
 * Renewals waiting for staff.
 *
 * When a student is at RENEW_AT credits or fewer, a renewal is prepared,
 * pre-filled with the last package the parent paid for (amount, currency,
 * number of classes). Staff always confirm or change the price in the
 * Post-Sales dashboard (Needs Top-Up) before any payment link reaches the
 * parent. Nothing here sends anything to a parent.
 *
 * Statuses: open → sending → sent, or open → dismissed / closed.
 *   closed: no longer needed (topped up, a link was sent another way,
 *   student paused or inactive).
 */
const pool   = require('../config/db');
const logger = require('../utils/logger');

const RENEW_AT = 3;
/* After a renewal is sent or dismissed, or while a payment link is still open,
   no new renewal is prepared for this many days. */
const QUIET_DAYS = 14;

/** The last package the parent paid for, or null. */
async function lastPaidPackage(db, studentId) {
  const r = await db.query(
    `SELECT id, amount::float AS amount, UPPER(currency) AS currency, credits_purchased AS credits,
            provider, course_id AS "courseId"
     FROM payments
     WHERE student_id = $1 AND status IN ('confirmed','paid')
       AND amount > 0 AND credits_purchased > 0
       AND COALESCE(kind, '') <> 'referral_reward'
     ORDER BY COALESCE(confirmed_at, created_at) DESC
     LIMIT 1`, [studentId]);
  return r.rows[0] || null;
}

/** Card/online provider to suggest: the last one used, else by currency. */
function suggestProvider(pkg) {
  if (pkg && ['fincra', 'flutterwave'].includes(String(pkg.provider || '').toLowerCase())) return pkg.provider.toLowerCase();
  return !pkg || pkg.currency === 'NGN' ? 'fincra' : 'flutterwave';
}

/* A student who should be renewed: active, low on credits, taking classes,
   and not paused by staff (a credit pause still needs a renewal). */
const ELIGIBLE = `
  u.role = 'student' AND u.is_active = TRUE
  AND COALESCE(sp.credits, 0) <= ${RENEW_AT}
  AND (COALESCE(sp.class_paused, FALSE) = FALSE OR COALESCE(sp.credits_suspended, FALSE) = TRUE)
  AND (
    EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = u.id AND e.status IN ('active','paused'))
    OR EXISTS (SELECT 1 FROM batch_members bm WHERE bm.student_id = u.id AND bm.status = 'active')
    OR EXISTS (SELECT 1 FROM bookings b WHERE b.student_id = u.id AND b.status = 'completed'
               AND COALESCE(b.is_demo, FALSE) = FALSE AND b.date >= CURRENT_DATE - 45)
  )
  AND NOT EXISTS (SELECT 1 FROM renewal_drafts d WHERE d.student_id = u.id
                  AND (d.status IN ('open','sending')
                       OR (d.status IN ('sent','dismissed') AND d.decided_at > NOW() - INTERVAL '${QUIET_DAYS} days')))
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.student_id = u.id AND p.status = 'pending'
                  AND p.payment_link IS NOT NULL AND p.created_at > NOW() - INTERVAL '${QUIET_DAYS} days')`;

/**
 * Prepare a renewal for one student if they need one. Safe to call often:
 * returns the new renewal, or null when none is needed or one already exists.
 */
async function ensureRenewal(studentId, db = pool) {
  const s = await db.query(
    `SELECT u.id, COALESCE(sp.credits, 0) AS credits
     FROM users u JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND ${ELIGIBLE}`, [studentId]);
  if (!s.rows.length) return null;
  const pkg = await lastPaidPackage(db, studentId);
  const ins = await db.query(
    `INSERT INTO renewal_drafts (student_id, credits_at_trigger, source_payment_id, suggested_amount,
        suggested_currency, suggested_credits, suggested_provider, course_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [studentId, s.rows[0].credits, pkg ? pkg.id : null, pkg ? pkg.amount : null,
     pkg ? pkg.currency : 'NGN', pkg ? pkg.credits : null, suggestProvider(pkg), pkg ? pkg.courseId : null]);
  if (ins.rows.length) logger.info(`[RENEWAL] Prepared for student ${studentId} at ${s.rows[0].credits} credits${pkg ? ` (last package ${pkg.currency} ${pkg.amount} for ${pkg.credits} classes)` : ' (no previous package)'}`);
  return ins.rows[0] || null;
}

/**
 * Close renewals that are no longer needed, and free any left half-sent.
 * Returns how many were closed.
 */
async function closeStale(db = pool) {
  /* A send interrupted part-way (server restart) goes back to the list */
  await db.query(
    `UPDATE renewal_drafts SET status = 'open', updated_at = NOW()
     WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '10 minutes'`);
  const r = await db.query(
    `UPDATE renewal_drafts d SET status = 'closed', updated_at = NOW(), close_reason = x.reason
     FROM (
       SELECT d2.id,
         CASE
           WHEN u.id IS NULL OR u.is_active = FALSE THEN 'student_inactive'
           WHEN COALESCE(sp.credits, 0) > ${RENEW_AT} THEN 'topped_up'
           WHEN COALESCE(sp.class_paused, FALSE) = TRUE AND COALESCE(sp.credits_suspended, FALSE) = FALSE THEN 'paused_by_staff'
           WHEN EXISTS (SELECT 1 FROM payments p WHERE p.student_id = d2.student_id
                        AND p.created_at > d2.created_at
                        AND (p.status IN ('confirmed','paid') OR (p.status = 'pending' AND p.payment_link IS NOT NULL)))
             THEN 'handled_elsewhere'
         END AS reason
       FROM renewal_drafts d2
       LEFT JOIN users u ON u.id = d2.student_id
       LEFT JOIN student_profiles sp ON sp.user_id = d2.student_id
       WHERE d2.status = 'open'
     ) x
     WHERE d.id = x.id AND x.reason IS NOT NULL
     RETURNING d.id`);
  return r.rowCount;
}

/** Daily: close what is no longer needed, then prepare any renewals missed. */
async function sweepRenewals() {
  try {
    const closed = await closeStale();
    const due = await pool.query(
      `SELECT u.id FROM users u JOIN student_profiles sp ON sp.user_id = u.id WHERE ${ELIGIBLE}`);
    let created = 0;
    for (const row of due.rows) {
      try { if (await ensureRenewal(row.id)) created++; }
      catch (e) { logger.warn(`[RENEWAL] ${row.id}: ${e.message}`); }
    }
    logger.info(`[RENEWAL] Daily sweep: ${created} prepared, ${closed} closed`);
    return { created, closed };
  } catch (e) {
    logger.warn('[RENEWAL] Daily sweep failed: ' + e.message);
    return { created: 0, closed: 0, error: e.message };
  }
}

/** Renewals waiting for staff, with what they need to decide. */
async function listOpen(db = pool) {
  await closeStale(db);
  const r = await db.query(
    `SELECT d.id, d.student_id AS "studentId", d.status, d.created_at AS "createdAt",
            d.credits_at_trigger AS "creditsAtTrigger",
            d.suggested_amount::float AS "amount", d.suggested_currency AS "currency",
            d.suggested_credits AS "credits", d.suggested_provider AS "provider", d.course_id AS "courseId",
            (d.source_payment_id IS NOT NULL) AS "hasLastPackage",
            u.name AS "studentName", u.staff_id AS "studentCode",
            COALESCE(sp.parent_email, u.email) AS "parentEmail", sp.parent_name AS "parentName",
            COALESCE(sp.credits, 0) AS "creditsNow",
            COALESCE(sp.credits_suspended, FALSE) AS "onHold",
            c.name AS "courseName"
     FROM renewal_drafts d
     JOIN users u ON u.id = d.student_id
     LEFT JOIN student_profiles sp ON sp.user_id = d.student_id
     LEFT JOIN courses c ON c.id::text = d.course_id
     WHERE d.status = 'open'
     ORDER BY COALESCE(sp.credits, 0) ASC, d.created_at ASC`);
  return r.rows;
}

module.exports = { RENEW_AT, QUIET_DAYS, ensureRenewal, closeStale, sweepRenewals, listOpen, lastPaidPackage, suggestProvider };
