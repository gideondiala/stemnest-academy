/**
 * Promoters — referral links for demo bookings (admin).
 *
 * POST /api/promoters/track                  — public: a link was opened { code, page, visitor }
 * GET  /api/promoters                        — list with funnel stats and rewards
 * POST /api/promoters                        — { name, email?, phone?, rewardPct, code?, notes? }
 * PUT  /api/promoters/:id                    — edit (incl. reward %, active)
 * GET  /api/promoters/:id                    — detail: bookings, students, rewards
 * POST /api/promoters/:id/attribute          — { studentId } credit a student to this promoter by hand
 * PUT  /api/promoters/rewards/:rewardId/paid — { note? } mark a reward as paid out
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z }   = require('zod');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger  = require('../utils/logger');
const promo   = require('../services/promoterService');

const router = express.Router();
const ADMIN = ['admin', 'super_admin'];

const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

router.post('/track', trackLimiter, async (req, res, next) => {
  try {
    const id = await promo.idForCode(pool, req.body && req.body.code);
    if (!id) return res.json({ success: true, valid: false });
    const visitor = String((req.body && req.body.visitor) || '').slice(0, 64) || null;
    /* one click per visitor per day */
    const dup = visitor ? (await pool.query(
      `SELECT 1 FROM promoter_clicks WHERE promoter_id = $1 AND visitor = $2 AND created_at > NOW() - INTERVAL '1 day'`, [id, visitor])).rows.length : 0;
    if (!dup) {
      await pool.query(`INSERT INTO promoter_clicks (promoter_id, page, visitor) VALUES ($1, $2, $3)`,
        [id, String((req.body && req.body.page) || '').slice(0, 200), visitor]);
    }
    res.json({ success: true, valid: true });
  } catch (err) { next(err); }
});

const promoterSchema = z.object({
  name:      z.string().trim().min(2, 'Enter the promoter\'s name'),
  email:     z.string().trim().email('Enter a valid email').optional().or(z.literal('')).nullable(),
  phone:     z.string().trim().optional().nullable(),
  rewardPct: z.coerce.number().min(0, 'Reward must be 0–100%').max(100, 'Reward must be 0–100%'),
  code:      z.string().trim().optional().nullable(),
  notes:     z.string().trim().optional().nullable(),
  isActive:  z.boolean().optional(),
});

function suggestCode(name) {
  const base = String(name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'PROMO';
  return base + Math.floor(10 + Math.random() * 90);
}

const STATS_SQL = `
  SELECT p.*,
    (SELECT COUNT(*) FROM promoter_clicks c WHERE c.promoter_id = p.id)::int AS clicks,
    (SELECT COUNT(*) FROM bookings b WHERE b.promoter_id = p.id AND b.is_demo = TRUE)::int AS demos_booked,
    (SELECT COUNT(*) FROM bookings b WHERE b.promoter_id = p.id AND b.is_demo = TRUE AND b.status = 'completed')::int AS demos_attended,
    (SELECT COUNT(*) FROM enrollment_requests er WHERE er.promoter_id = p.id AND COALESCE(er.source,'website') = 'website')::int AS enquiries,
    (SELECT COUNT(*) FROM users u WHERE u.promoter_id = p.id AND u.role = 'student')::int AS students,
    (SELECT COUNT(*) FROM promoter_rewards r WHERE r.promoter_id = p.id)::int AS paying_students,
    COALESCE((SELECT json_agg(json_build_object('currency', currency, 'owed', owed, 'paid', paid))
              FROM (SELECT currency,
                           SUM(reward_amount) FILTER (WHERE status = 'owed') AS owed,
                           SUM(reward_amount) FILTER (WHERE status = 'paid') AS paid
                    FROM promoter_rewards r WHERE r.promoter_id = p.id GROUP BY currency) x), '[]') AS rewards
  FROM promoters p`;

router.get('/', requireAuth, requireRole(...ADMIN), async (req, res, next) => {
  try {
    const r = await pool.query(`${STATS_SQL} ORDER BY p.created_at DESC`);
    res.json({ success: true, promoters: r.rows });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole(...ADMIN), async (req, res, next) => {
  try {
    const d = promoterSchema.parse(req.body || {});
    let code = promo.normCode(d.code) || suggestCode(d.name);
    for (let i = 0; i < 5; i++) {
      const taken = (await pool.query(`SELECT 1 FROM promoters WHERE code = $1`, [code])).rows.length;
      if (!taken) break;
      if (d.code) return res.status(409).json({ success: false, error: `The code ${code} is already used` });
      code = suggestCode(d.name);
    }
    const r = await pool.query(
      `INSERT INTO promoters (code, name, email, phone, reward_pct, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [code, d.name, d.email || null, d.phone || null, d.rewardPct, d.notes || null, req.user.id]);
    logger.info(`[PROMOTER] ${code} (${d.name}, ${d.rewardPct}%) created by ${req.user.email}`);
    res.status(201).json({ success: true, promoter: r.rows[0] });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: err.errors[0].message });
    next(err);
  }
});

router.put('/:id', requireAuth, requireRole(...ADMIN), async (req, res, next) => {
  try {
    const d = promoterSchema.partial().parse(req.body || {});
    const fields = [], vals = [];
    const set = (col, v) => { vals.push(v); fields.push(`${col} = $${vals.length}`); };
    if (d.name !== undefined) set('name', d.name);
    if (d.email !== undefined) set('email', d.email || null);
    if (d.phone !== undefined) set('phone', d.phone || null);
    if (d.rewardPct !== undefined) set('reward_pct', d.rewardPct);
    if (d.notes !== undefined) set('notes', d.notes || null);
    if (d.isActive !== undefined) set('is_active', d.isActive);
    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to change' });
    vals.push(req.params.id);
    const r = await pool.query(`UPDATE promoters SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Promoter not found' });
    res.json({ success: true, promoter: r.rows[0] });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: err.errors[0].message });
    next(err);
  }
});

router.get('/:id', requireAuth, requireRole(...ADMIN), async (req, res, next) => {
  try {
    const p = (await pool.query(`${STATS_SQL} WHERE p.id = $1`, [req.params.id])).rows[0];
    if (!p) return res.status(404).json({ success: false, error: 'Promoter not found' });
    const [bookings, students, rewards] = await Promise.all([
      pool.query(
        `SELECT b.id, b.lesson_name AS "studentName", b.notes->>'email' AS email, b.status, to_char(b.date,'YYYY-MM-DD') AS date,
                b.booked_at AS "bookedAt"
         FROM bookings b WHERE b.promoter_id = $1 AND b.is_demo = TRUE ORDER BY b.booked_at DESC LIMIT 200`, [p.id]),
      pool.query(
        `SELECT u.id, u.name, u.staff_id AS "staffId", u.created_at AS "createdAt",
                (SELECT MIN(COALESCE(confirmed_at, created_at)) FROM payments WHERE student_id = u.id AND status = 'confirmed') AS "firstPaidAt"
         FROM users u WHERE u.promoter_id = $1 AND u.role = 'student' ORDER BY u.created_at DESC`, [p.id]),
      pool.query(
        `SELECT r.id, r.student_id AS "studentId", u.name AS "studentName", r.amount_paid AS "amountPaid", r.currency,
                r.reward_pct AS "rewardPct", r.reward_amount AS "rewardAmount", r.status, r.paid_at AS "paidAt", r.paid_note AS "paidNote",
                r.created_at AS "createdAt"
         FROM promoter_rewards r JOIN users u ON u.id = r.student_id WHERE r.promoter_id = $1 ORDER BY r.created_at DESC`, [p.id]),
    ]);
    res.json({ success: true, promoter: p, bookings: bookings.rows, students: students.rows, rewards: rewards.rows });
  } catch (err) { next(err); }
});

/* Credit an existing student to a promoter by hand (e.g. they forgot to use the link) */
router.post('/:id/attribute', requireAuth, requireRole(...ADMIN), async (req, res, next) => {
  try {
    const { studentId } = req.body || {};
    const p = (await pool.query(`SELECT id, name FROM promoters WHERE id = $1`, [req.params.id])).rows[0];
    if (!p) return res.status(404).json({ success: false, error: 'Promoter not found' });
    const u = (await pool.query(`SELECT id, name, promoter_id FROM users WHERE id = $1 AND role = 'student'`, [studentId])).rows[0];
    if (!u) return res.status(404).json({ success: false, error: 'Student not found' });
    const hasReward = (await pool.query(`SELECT promoter_id FROM promoter_rewards WHERE student_id = $1`, [u.id])).rows[0];
    if (hasReward && hasReward.promoter_id !== p.id) return res.status(409).json({ success: false, error: `${u.name}'s first payment is already credited to another promoter` });
    await pool.query(`UPDATE users SET promoter_id = $1 WHERE id = $2`, [p.id, u.id]);
    const reward = await promo.rewardFirstPayment(u.id);
    logger.info(`[PROMOTER] ${u.name} credited to ${p.name} by ${req.user.email}`);
    res.json({ success: true, rewardCreated: !!reward });
  } catch (err) { next(err); }
});

router.put('/rewards/:rewardId/paid', requireAuth, requireRole(...ADMIN), async (req, res, next) => {
  try {
    const r = await pool.query(
      `UPDATE promoter_rewards SET status = 'paid', paid_at = NOW(), paid_note = $1 WHERE id = $2 AND status = 'owed' RETURNING id`,
      [String((req.body && req.body.note) || '').slice(0, 300) || null, req.params.rewardId]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Reward not found or already paid' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
