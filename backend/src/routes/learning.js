/**
 * Learning routes
 * POST   /api/learning/class-submissions      — student submits a link for Task 1/2 of a class
 * DELETE /api/learning/class-submissions/:id  — student removes their own submission
 * GET    /api/learning/leaderboard            — student points ranking (projects + quizzes)
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const learning = require('../services/learningService');

const router = express.Router();

function isLink(s) { return /^https?:\/\/\S+\.\S+/i.test(String(s || '').trim()); }

router.post('/class-submissions', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { bookingId, taskNo } = req.body || {};
    const link = String((req.body && req.body.link) || '').trim();
    const note = String((req.body && req.body.note) || '').trim().slice(0, 1000) || null;
    const task = parseInt(taskNo, 10);
    if (![1, 2].includes(task)) return res.status(400).json({ success: false, error: 'Choose Task 1 or Task 2' });
    if (!isLink(link)) return res.status(400).json({ success: false, error: 'Please paste a full link to your work (starting with https://)' });

    const b = (await pool.query(
      `SELECT b.id, b.student_id, b.batch_id, b.pathway_lesson_id,
              ((b.date + b.time) <= (NOW() AT TIME ZONE 'Africa/Lagos')) AS started
       FROM bookings b WHERE b.id = $1`, [bookingId])).rows[0];
    const mine = b && (b.student_id === req.user.id || (b.batch_id && (await pool.query(
      `SELECT 1 FROM batch_members WHERE batch_id = $1 AND student_id = $2`, [b.batch_id, req.user.id])).rows.length));
    if (!mine) return res.status(403).json({ success: false, error: 'This is not one of your classes' });
    if (!b.started) return res.status(400).json({ success: false, error: 'You can submit once the class has started' });

    const r = await pool.query(
      `INSERT INTO class_submissions (booking_id, lesson_id, student_id, task_no, link, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (booking_id, student_id, task_no)
       DO UPDATE SET link = EXCLUDED.link, note = EXCLUDED.note, updated_at = NOW()
       RETURNING id, task_no AS "taskNo", link, note, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [b.id, b.pathway_lesson_id, req.user.id, task, link, note]
    );
    res.json({ success: true, submission: r.rows[0] });
  } catch (err) { next(err); }
});

router.delete('/class-submissions/:id', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const r = await pool.query(`DELETE FROM class_submissions WHERE id = $1 AND student_id = $2 RETURNING id`, [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/leaderboard', requireAuth, async (req, res, next) => {
  try {
    res.json({ success: true, ...(await learning.leaderboard(req.user.id, 20)) });
  } catch (err) { next(err); }
});

module.exports = router;
