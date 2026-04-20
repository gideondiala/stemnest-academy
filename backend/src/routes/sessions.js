/**
 * Sessions routes
 * GET  /api/sessions       — list sessions for authenticated user
 * POST /api/sessions       — schedule a new session (tutor/admin)
 */

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const sessionSchema = z.object({
  studentId: z.number().int(),
  tutorId:   z.number().int(),
  subject:   z.string(),
  startTime: z.string().datetime(),
  durationMins: z.number().int().min(15).max(120),
  meetingUrl: z.string().url().optional(),
});

// GET /api/sessions
router.get('/', requireAuth, async (req, res, next) => {
  try {
    // TODO: query sessions for req.user.id filtered by role
    res.json({ success: true, sessions: [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions
router.post('/', requireAuth, requireRole('tutor', 'admin'), async (req, res, next) => {
  try {
    const data = sessionSchema.parse(req.body);
    // TODO: insert into DB
    res.status(201).json({ success: true, session: { id: Date.now(), ...data } });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

module.exports = router;
