/**
 * Projects routes
 * GET  /api/projects         — list projects for authenticated user
 * POST /api/projects         — submit a project (student)
 * PUT  /api/projects/:id     — review/update a project (tutor)
 */

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const submitSchema = z.object({
  name:        z.string().min(3),
  description: z.string().optional(),
  courseId:    z.number().int(),
  fileUrl:     z.string().url().optional(),
});

const reviewSchema = z.object({
  feedback: z.string().min(1),
  status:   z.enum(['reviewed', 'needs_revision']),
});

// GET /api/projects
router.get('/', requireAuth, async (req, res, next) => {
  try {
    // TODO: query by student or tutor depending on role
    res.json({ success: true, projects: [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects — student submits
router.post('/', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const data = submitSchema.parse(req.body);
    // TODO: insert into DB
    res.status(201).json({ success: true, project: { id: Date.now(), studentId: req.user.id, status: 'pending', ...data } });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

// PUT /api/projects/:id — tutor reviews
router.put('/:id', requireAuth, requireRole('tutor', 'admin'), async (req, res, next) => {
  try {
    const data = reviewSchema.parse(req.body);
    // TODO: update in DB
    res.json({ success: true, project: { id: req.params.id, ...data } });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

module.exports = router;
