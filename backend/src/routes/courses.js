/**
 * Courses routes
 * GET    /api/courses
 * GET    /api/courses/:id
 * POST   /api/courses       (tutor/admin only)
 * PUT    /api/courses/:id   (tutor/admin only)
 * DELETE /api/courses/:id   (admin only)
 */

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireRole } = require('../middleware/auth');
// const db = require('../config/db');

const router = express.Router();

const courseSchema = z.object({
  name:     z.string().min(3),
  desc:     z.string().min(10),
  subject:  z.enum(['coding', 'maths', 'sciences']),
  age:      z.string().optional(),
  price:    z.number().positive(),
  classes:  z.number().int().positive().optional(),
  rating:   z.number().min(1).max(5).optional(),
  students: z.number().int().min(0).optional(),
  emoji:    z.string().optional(),
  color:    z.string().optional(),
  badge:    z.enum(['popular', 'new', '']).optional(),
});

// GET /api/courses — public
router.get('/', async (req, res, next) => {
  try {
    const { subject, sort } = req.query;
    // TODO: query DB with optional filters
    // const result = await db.query('SELECT * FROM courses ORDER BY id');
    // res.json({ success: true, courses: result.rows });

    res.json({ success: true, courses: [], message: 'DB not connected yet — returning empty list' });
  } catch (err) {
    next(err);
  }
});

// GET /api/courses/:id — public
router.get('/:id', async (req, res, next) => {
  try {
    // TODO: const result = await db.query('SELECT * FROM courses WHERE id=$1', [req.params.id]);
    res.json({ success: true, course: null, message: 'DB not connected yet' });
  } catch (err) {
    next(err);
  }
});

// POST /api/courses — tutor or admin
router.post('/', requireAuth, requireRole('tutor', 'admin'), async (req, res, next) => {
  try {
    const data = courseSchema.parse(req.body);
    // TODO: insert into DB
    res.status(201).json({ success: true, course: { id: Date.now(), ...data } });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

// PUT /api/courses/:id — tutor or admin
router.put('/:id', requireAuth, requireRole('tutor', 'admin'), async (req, res, next) => {
  try {
    const data = courseSchema.partial().parse(req.body);
    // TODO: update in DB
    res.json({ success: true, course: { id: req.params.id, ...data } });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

// DELETE /api/courses/:id — admin only
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    // TODO: delete from DB
    res.json({ success: true, message: `Course ${req.params.id} deleted` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
