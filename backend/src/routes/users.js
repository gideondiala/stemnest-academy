/**
 * Users routes
 * GET /api/users/:id   — get user profile
 * PUT /api/users/:id   — update user profile (own profile only)
 */

const express = require('express');
const { z }   = require('zod');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const updateSchema = z.object({
  name:         z.string().min(2).optional(),
  phone:        z.string().optional(),
  bio:          z.string().optional(),
  subjects:     z.string().optional(),
  ageGroups:    z.string().optional(),
  availability: z.string().optional(),
});

// GET /api/users/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    // Users can only fetch their own profile (unless admin)
    if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    // TODO: fetch from DB
    res.json({ success: true, user: req.user });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const data = updateSchema.parse(req.body);
    // TODO: update in DB
    res.json({ success: true, user: { ...req.user, ...data } });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

module.exports = router;
