/**
 * Projects routes
 * GET    /api/projects              — list projects (student: own, tutor: assigned)
 * POST   /api/projects (admin/tutor) — create project for student
 * PUT    /api/projects/:id/submit   — student submits project
 * PUT    /api/projects/:id/review   — tutor reviews project
 */

const express = require('express');
const { z }   = require('zod');

const pool   = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const notify = require('../services/notificationService');

const router = express.Router();

const reviewSchema = z.object({
  remarks: z.string().trim().min(1, 'Please write feedback for the student'),
  score:   z.number({ invalid_type_error: 'Please give a score out of 100', required_error: 'Please give a score out of 100' })
            .int().min(0).max(100),
});
const { penalised } = require('../services/learningService');

function isLink(s) { return /^https?:\/\/\S+\.\S+/i.test(String(s || '').trim()); }

/* ── GET /api/projects ── */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      params.push(req.user.id); where += ` AND p.student_id = $${params.length}`;
    } else if (req.user.role === 'tutor') {
      params.push(req.user.id); where += ` AND p.tutor_id = $${params.length}`;
    }

    if (status) { params.push(status); where += ` AND p.status = $${params.length}`; }

    const result = await pool.query(
      `SELECT p.*, u_s.name AS student_name, u_s.staff_id AS student_staff_id,
              u_t.name AS tutor_name, c.name AS course_name,
              pl.lesson_number, pl.title AS lesson_title,
              to_char(b.date, 'YYYY-MM-DD') AS class_date
       FROM projects p
       LEFT JOIN users u_s ON u_s.id = p.student_id
       LEFT JOIN users u_t ON u_t.id = p.tutor_id
       LEFT JOIN courses c ON c.id   = p.course_id
       LEFT JOIN pathway_lessons pl ON pl.id = p.lesson_id
       LEFT JOIN bookings b ON b.id = p.booking_id
       ${where}
       ORDER BY p.created_at DESC`,
      params
    );

    res.json({ success: true, projects: result.rows });
  } catch (err) { next(err); }
});

/* ── POST /api/projects (admin/tutor assigns project to student) ── */
router.post('/', requireAuth, requireRole('admin','super_admin','tutor'), async (req, res, next) => {
  try {
    const { studentId, courseId, title, brief, dueDate } = req.body;
    if (!studentId || !title) {
      return res.status(400).json({ success: false, error: 'studentId and title required' });
    }

    const result = await pool.query(
      `INSERT INTO projects (student_id, tutor_id, course_id, title, brief, due_date)
       VALUES ($1, $2, $3, $4, $5, $6::date)
       RETURNING *`,
      [studentId, req.user.id, courseId || null, title, brief || null, dueDate || null]
    );

    /* Notify student */
    await notify.saveNotification(studentId, 'project_assigned', '📁 New Project Assigned',
      `"${title}" has been assigned. Due: ${dueDate || 'No deadline'}`);

    res.status(201).json({ success: true, project: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── PUT /api/projects/:id/submit (student) ── */
router.put('/:id/submit', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    /* Links only (Scratch, Replit, Google Drive, Docs…) */
    const link = String((req.body && (req.body.link || req.body.submission)) || '').trim();
    const note = String((req.body && req.body.note) || '').trim().slice(0, 2000) || null;
    if (!isLink(link)) return res.status(400).json({ success: false, error: 'Please paste a full link to your work (starting with https://)' });

    /* Can be (re)submitted until the tutor reviews it; after the due date it is marked late (half marks) */
    const result = await pool.query(
      `UPDATE projects
       SET status = 'submitted', submission = $1, submission_note = $2, submitted_at = NOW(),
           is_late = (due_at IS NOT NULL AND NOW() > due_at)
       WHERE id = $3 AND student_id = $4 AND status IN ('pending', 'submitted')
       RETURNING *, tutor_id`,
      [link, note, req.params.id, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Project not found, not yours, or already reviewed' });
    }

    /* Notify tutor */
    const project = result.rows[0];
    if (project.tutor_id) {
      await notify.saveNotification(project.tutor_id, 'project_submitted',
        '📁 Project Submitted', `A student submitted "${project.title}" for review.`);
    }

    res.json({ success: true, project: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── PUT /api/projects/:id/review (tutor) ── */
router.put('/:id/review', requireAuth, requireRole('tutor','admin','super_admin'), async (req, res, next) => {
  try {
    const { remarks, score } = reviewSchema.parse(req.body);

    /* A tutor reviews their own students' work; admins any */
    const cur = (await pool.query('SELECT tutor_id, is_late, status FROM projects WHERE id = $1', [req.params.id])).rows[0];
    if (!cur) return res.status(404).json({ success: false, error: 'Project not found' });
    if (req.user.role === 'tutor' && cur.tutor_id && cur.tutor_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'This project belongs to another tutor' });
    }
    if (cur.status === 'pending') return res.status(400).json({ success: false, error: 'The student has not submitted this yet' });
    const points = Math.round(penalised(score, cur.is_late));

    const result = await pool.query(
      `UPDATE projects
       SET status = 'reviewed', remarks = $1, score = $2, points = $3,
           reviewed_at = NOW(), tutor_id = COALESCE(tutor_id, $4)
       WHERE id = $5
       RETURNING *, student_id`,
      [remarks, score, points, req.user.id, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const project = result.rows[0];

    /* Notify student */
    await notify.saveNotification(project.student_id, 'project_reviewed',
      '⭐ Project Reviewed', `"${project.title}" has been reviewed. Score: ${score}/100${project.is_late ? ` — handed in late, so ${points} points` : ''}`);

    res.json({ success: true, project: result.rows[0] });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

module.exports = router;
