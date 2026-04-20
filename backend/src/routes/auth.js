/**
 * Auth routes
 * POST /api/auth/login
 * POST /api/auth/register
 * GET  /api/auth/me
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { z }   = require('zod');
const rateLimit = require('express-rate-limit');

const { requireAuth } = require('../middleware/auth');
// const db = require('../config/db'); // uncomment when DB is connected

const router = express.Router();

// Stricter rate limit for auth endpoints (10 attempts / 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many login attempts — try again in 15 minutes' },
});

// ── Validation schemas ──
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
  role:     z.enum(['tutor', 'student']),
});

const registerSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(['tutor', 'student']),
});

// ── Helper ──
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ── POST /api/auth/login ──
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password, role } = loginSchema.parse(req.body);

    // TODO: replace with real DB lookup
    // const user = await db.query('SELECT * FROM users WHERE email=$1 AND role=$2', [email, role]);
    // if (!user.rows.length) return res.status(401).json({ success:false, error:'Invalid credentials' });
    // const valid = await bcrypt.compare(password, user.rows[0].password_hash);
    // if (!valid) return res.status(401).json({ success:false, error:'Invalid credentials' });

    // ── DEMO stub (remove when DB is live) ──
    const demoUser = { id: 1, name: 'Sarah Rahman', email, role };
    const token    = signToken(demoUser);
    res.json({ success: true, token, user: demoUser });

  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

// ── POST /api/auth/register ──
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = registerSchema.parse(req.body);

    // TODO: check for existing user, hash password, insert into DB
    // const hash = await bcrypt.hash(password, 12);
    // const result = await db.query(
    //   'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role',
    //   [name, email, hash, role]
    // );
    // const user  = result.rows[0];
    // const token = signToken(user);

    // ── DEMO stub ──
    const user  = { id: 2, name, email, role };
    const token = signToken(user);
    res.status(201).json({ success: true, token, user });

  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

// ── GET /api/auth/me ──
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    // TODO: fetch fresh user data from DB
    // const result = await db.query('SELECT id,name,email,role FROM users WHERE id=$1', [req.user.id]);
    // res.json({ success: true, user: result.rows[0] });

    res.json({ success: true, user: req.user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
