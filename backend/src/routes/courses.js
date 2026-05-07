/**
 * Courses routes
 * GET    /api/courses              — list all active courses (public)
 * GET    /api/courses/:id          — get course + lessons
 * POST   /api/courses (admin)      — create course
 * PUT    /api/courses/:id (admin)  — update course
 * DELETE /api/courses/:id (admin)  — deactivate course
 * POST   /api/courses/:id/lessons (admin) — add/replace lessons
 */

const express = require('express');
const { z }   = require('zod');

const pool   = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const courseSchema = z.object({
  id:          z.string().optional(),
  name:        z.string().min(2),
  description: z.string().optional(),
  subject:     z.enum(['coding','maths','sciences']),
  level:       z.string().optional(),
  age_range:   z.string().optional(),
  price:       z.number().positive(),
  num_classes: z.number().int().positive(),
  duration:    z.string().optional(),
  rating:      z.number().min(1).max(5).optional(),
  students:    z.number().int().optional(),
  emoji:       z.string().optional(),
  color:       z.string().optional(),
  badge:       z.string().optional(),
});

const lessonSchema = z.array(z.object({
  lesson_number:  z.number().int().positive(),
  name:           z.string().min(1),
  activity_link:  z.string().url().optional().or(z.literal('')),
  slides_link:    z.string().url().optional().or(z.literal('')),
}));

/* ── GET /api/courses ── */
router.get('/', async (req, res, next) => {
  try {
    const { subject } = req.query;
    let query = 'SELECT * FROM courses WHERE is_active = TRUE';
    const params = [];
    if (subject) { params.push(subject); query += ` AND subject = $1`; }
    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json({ success: true, courses: result.rows });
  } catch (err) { next(err); }
});

/* ── GET /api/courses/:id ── */
router.get('/:id', async (req, res, next) => {
  try {
    const courseResult = await pool.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    if (!courseResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    const lessonsResult = await pool.query(
      'SELECT * FROM lessons WHERE course_id = $1 ORDER BY lesson_number',
      [req.params.id]
    );
    res.json({ success: true, course: courseResult.rows[0], lessons: lessonsResult.rows });
  } catch (err) { next(err); }
});

/* ── POST /api/courses (admin) ── */
router.post('/', requireAuth, requireRole('admin','super_admin'), async (req, res, next) => {
  try {
    const data = courseSchema.parse(req.body);

    /* Auto-generate ID if not provided */
    let courseId = data.id;
    if (!courseId) {
      const last = await pool.query("SELECT id FROM courses ORDER BY id DESC LIMIT 1");
      const lastNum = last.rows.length ? parseInt(last.rows[0].id.replace('CRS','')) : 0;
      courseId = 'CRS' + String(lastNum + 1).padStart(3, '0');
    }

    const result = await pool.query(
      `INSERT INTO courses (id, name, description, subject, level, age_range, price,
                            num_classes, duration, rating, students, emoji, color, badge)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [courseId, data.name, data.description || null, data.subject, data.level || null,
       data.age_range || null, data.price, data.num_classes, data.duration || null,
       data.rating || 5.0, data.students || 0, data.emoji || '📚',
       data.color || 'blue', data.badge || null]
    );

    res.status(201).json({ success: true, course: result.rows[0] });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ── PUT /api/courses/:id (admin) ── */
router.put('/:id', requireAuth, requireRole('admin','super_admin'), async (req, res, next) => {
  try {
    const data = courseSchema.partial().parse(req.body);
    const fields = [];
    const values = [];
    let i = 1;

    const allowed = ['name','description','subject','level','age_range','price',
                     'num_classes','duration','rating','students','emoji','color','badge'];
    allowed.forEach(f => {
      if (data[f] !== undefined) {
        fields.push(`${f} = $${i++}`);
        values.push(data[f]);
      }
    });

    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE courses SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values
    );

    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Course not found' });
    res.json({ success: true, course: result.rows[0] });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ── DELETE /api/courses/:id (admin) ── */
router.delete('/:id', requireAuth, requireRole('admin','super_admin'), async (req, res, next) => {
  try {
    await pool.query('UPDATE courses SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Course deactivated' });
  } catch (err) { next(err); }
});

/* ── POST /api/courses/:id/lessons (admin) — replace all lessons ── */
router.post('/:id/lessons', requireAuth, requireRole('admin','super_admin'), async (req, res, next) => {
  try {
    const lessons = lessonSchema.parse(req.body.lessons || req.body);

    /* Delete existing lessons and replace */
    await pool.query('DELETE FROM lessons WHERE course_id = $1', [req.params.id]);

    if (lessons.length) {
      const values = lessons.map((l, idx) =>
        `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4}, $${idx * 4 + 5})`
      ).join(', ');

      const params = lessons.flatMap(l => [
        req.params.id, l.lesson_number, l.name,
        l.activity_link || null, l.slides_link || null,
      ]);

      await pool.query(
        `INSERT INTO lessons (course_id, lesson_number, name, activity_link, slides_link)
         VALUES ${lessons.map((_, i) => `($${i*5+1},$${i*5+2},$${i*5+3},$${i*5+4},$${i*5+5})`).join(',')}`,
        params
      );
    }

    res.json({ success: true, message: `${lessons.length} lessons saved` });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

module.exports = router;
