/**
 * Class operations routes — /api/class-ops
 *
 * POST /:id/join             — tutor clicked Join (late joins are timed here)
 * GET  /late-joins           — late joins for a month (?month=YYYY-MM) — operations/admin; a tutor sees their own
 * GET  /unended              — classes whose time has passed and are not ended yet
 * POST /:id/mark-incomplete  — Admin marks a class the tutor did not end as incomplete
 * GET  /pay-rates            — tutor pay rates (Naira)
 * PUT  /pay-rates            — set pay rates (admin / super admin)
 * GET  /my-pay               — tutor's pay: this month + previous months
 * GET  /my-pay/:month        — every paid class in a month (for the Excel pay sheet)
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger  = require('../utils/logger');
const notify  = require('../services/notificationService');
const ops     = require('../services/classOpsService');

const router = express.Router();
const OPS_ROLES = ['admin', 'super_admin', 'operations'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function currentMonthWAT() {
  const d = new Date(Date.now() + 60 * 60 * 1000);   /* WAT = UTC+1 */
  return d.toISOString().slice(0, 7);
}

/* Tutors see their own records; staff may pass ?tutorId= */
function targetTutor(req) {
  if (req.user.role === 'tutor') return req.user.id;
  const t = req.query.tutorId;
  return t && UUID_RE.test(t) ? t : null;
}

/* ── Tutor joins a class ── */
router.post('/:id/join', requireAuth, requireRole('tutor'), async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ success: false, error: 'Invalid class' });
    const r = await ops.recordTutorJoin(req.params.id, req.user.id);
    if (r.notFound) return res.status(404).json({ success: false, error: 'Class not found' });
    res.json({ success: true, ...r });
  } catch (err) { next(err); }
});

/* ── Late joins ── */
router.get('/late-joins', requireAuth, requireRole(...OPS_ROLES, 'tutor'), async (req, res, next) => {
  try {
    const month = MONTH_RE.test(req.query.month || '') ? req.query.month : (req.query.month === 'all' ? null : currentMonthWAT());
    const rows = await ops.lateJoins({ month, tutorId: targetTutor(req) });
    res.json({
      success: true, month, lateJoins: rows,
      rules: { lateAfterMins: ops.LATE_AFTER_MINS, pardonedPerMonth: ops.PARDONED_PER_MONTH, penalty: ops.LATE_PENALTY, penaltyCurrency: 'USD' },
    });
  } catch (err) { next(err); }
});

/* ── Classes not ended ── */
router.get('/unended', requireAuth, requireRole(...OPS_ROLES, 'tutor'), async (req, res, next) => {
  try {
    const rows = await ops.unendedClasses({ tutorId: targetTutor(req), overdueOnly: req.query.overdue === '1' });
    res.json({ success: true, classes: rows, warnAfterMins: 120, followUpFrom: ops.FOLLOW_UP_FROM });
  } catch (err) { next(err); }
});

router.post('/:id/mark-incomplete', requireAuth, requireRole(...OPS_ROLES), async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ success: false, error: 'Invalid class' });
    const b = await pool.query(
      `SELECT b.*, ${ops.CLASS_START_SQL} + make_interval(mins => COALESCE(b.duration_mins, 60)) <= NOW() AS ended
       FROM bookings b WHERE b.id = $1`, [req.params.id]);
    const booking = b.rows[0];
    if (!booking) return res.status(404).json({ success: false, error: 'Class not found' });
    if (booking.status !== 'scheduled') return res.status(409).json({ success: false, error: 'This class is already ' + booking.status });
    if (!booking.ended) return res.status(409).json({ success: false, error: 'This class has not finished yet' });

    const reason = String(req.body.reason || 'Not ended by the tutor').slice(0, 300);
    if (booking.tutor_id) {
      await pool.query(
        `INSERT INTO class_reports (booking_id, tutor_id, outcome, incomplete_reason, notes)
         VALUES ($1, $2, 'incomplete', $3, $4)
         ON CONFLICT (booking_id) DO UPDATE SET outcome = 'incomplete', incomplete_reason = EXCLUDED.incomplete_reason, notes = EXCLUDED.notes`,
        [booking.id, booking.tutor_id, reason, 'Marked incomplete by ' + req.user.email]
      );
    }
    const { movedTo } = await ops.applyIncomplete(booking, { reason, actorLabel: 'admin', markedBy: req.user.id });
    if (booking.tutor_id) {
      await notify.saveNotification(booking.tutor_id, 'class_marked_incomplete', 'Class marked incomplete',
        `Your class on ${String(booking.date instanceof Date ? booking.date.toDateString() : booking.date)} at ${String(booking.time).slice(0, 5)} was not ended, so Admin marked it incomplete.`
      ).catch(() => {});
    }
    logger.info(`[UNENDED] ${req.user.email} marked booking ${booking.id} incomplete`);
    res.json({ success: true, movedTo });
  } catch (err) { next(err); }
});

/* ── Pay rates ── */
router.get('/pay-rates', requireAuth, requireRole('admin', 'super_admin', 'tutor', 'operations', 'hr'), async (req, res, next) => {
  try { res.json({ success: true, rates: await ops.getPayRates() }); }
  catch (err) { next(err); }
});

router.put('/pay-rates', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const rates = await ops.setPayRates(req.body || {});
    logger.info(`[PAY-RATES] Updated by ${req.user.email}: demo ${rates.demo}, paid ${rates.paid1}/${rates.paid2}/${rates.paid3} NGN`);
    res.json({ success: true, rates });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
});

/* ── Tutor pay ── */
router.get('/my-pay', requireAuth, requireRole('tutor', 'admin', 'super_admin', 'hr'), async (req, res, next) => {
  try {
    const tutorId = targetTutor(req);
    if (!tutorId) return res.status(400).json({ success: false, error: 'tutorId required' });
    const months = await ops.payMonths(tutorId);
    const month = currentMonthWAT();
    const current = months.find(m => m.month === month) || { month, total: 0, classes: 0, demos: 0, paid: 0, students: 0 };
    res.json({
      success: true, currency: 'NGN', currentMonth: current,
      previousMonths: months.filter(m => m.month < month),
      rates: await ops.getPayRates(),
    });
  } catch (err) { next(err); }
});

router.get('/my-pay/:month', requireAuth, requireRole('tutor', 'admin', 'super_admin', 'hr'), async (req, res, next) => {
  try {
    const tutorId = targetTutor(req);
    if (!tutorId) return res.status(400).json({ success: false, error: 'tutorId required' });
    if (!MONTH_RE.test(req.params.month)) return res.status(400).json({ success: false, error: 'Month must be YYYY-MM' });
    const t = await pool.query('SELECT name, staff_id FROM users WHERE id = $1', [tutorId]);
    const classes = await ops.payMonthDetail(tutorId, req.params.month);
    res.json({
      success: true, month: req.params.month, currency: 'NGN',
      tutor: t.rows[0] ? { name: t.rows[0].name, staffId: t.rows[0].staff_id } : null,
      classes, total: classes.reduce((a, c) => a + c.amount, 0),
    });
  } catch (err) { next(err); }
});

module.exports = router;
