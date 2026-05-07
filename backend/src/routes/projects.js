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
  remarks: z.string().min(1),
  score:   z.number().int().min(0).max(100),
});

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
      `SELECT p.*, u_s.name AS student_name, u_t.name AS tutor_name, c.name AS course_name
       FROM projects p
       LEFT JOIN users u_s ON u_s.id = p.student_id
       LEFT JOIN users u_t ON u_t.id = p.tutor_id
       LEFT JOIN courses c ON c.id   = p.course_id
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
    const { submission } = req.body;
    if (!submission) return res.status(400).json({ success: false, error: 'submission text required' });

    const result = await pool.query(
      `UPDATE projects
       SET status = 'submitted', submission = $1, submitted_at = NOW()
       WHERE id = $2 AND student_id = $3
       RETURNING *, tutor_id`,
      [submission, req.params.id, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Project not found or not yours' });
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

    const result = await pool.query(
      `UPDATE projects
       SET status = 'reviewed', remarks = $1, score = $2, points = $2,
           reviewed_at = NOW(), tutor_id = $3
       WHERE id = $4
       RETURNING *, student_id`,
      [remarks, score, req.user.id, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const project = result.rows[0];

    /* Notify student */
    await notify.saveNotification(project.student_id, 'project_reviewed',
      '⭐ Project Reviewed', `"${project.title}" has been reviewed. Score: ${score}/100`);

    res.json({ success: true, project: result.rows[0] });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

module.exports = router;
