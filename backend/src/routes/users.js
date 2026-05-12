/**
 * Users routes
 * GET    /api/users/me/notifications  — get my notifications
 * PUT    /api/users/me/notifications/:id/read
 * GET    /api/users/:id               — get user profile
 * PUT    /api/users/:id               — update own profile
 * PUT    /api/users/:id/password      — change password
 * GET    /api/users (admin only)      — list all users
 * POST   /api/users (admin only)      — create user
 * DELETE /api/users/:id (admin only)  — deactivate user
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const { z }   = require('zod');

const pool   = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const emailSvc = require('../services/emailService');
const logger   = require('../utils/logger');

const router = express.Router();

const updateSchema = z.object({
  name:         z.string().min(2).optional(),
  phone:        z.string().optional(),
  whatsapp:     z.string().optional(),
  bio:          z.string().optional(),
  date_of_birth: z.string().optional(),
});

const createUserSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(['student','tutor','admin','super_admin','sales','presales','postsales','operations','hr']),
  staff_id: z.string().optional(),
  phone:    z.string().optional(),
  whatsapp: z.string().optional(),
});

/* Postsales can only create students */
function validateCreateRole(req, data) {
  if (req.user.role === 'postsales' && data.role !== 'student') {
    throw Object.assign(new Error('Post-Sales can only create student accounts'), { status: 403 });
  }
}

/* ── GET /api/users/me/notifications ── */
router.get('/me/notifications', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, notifications: result.rows });
  } catch (err) { next(err); }
});

/* ── PUT /api/users/me/notifications/:id/read ── */
router.put('/me/notifications/:id/read', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── GET /api/users (admin only) ── */
router.get('/', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { role, search } = req.query;
    let query = 'SELECT id, name, email, role, staff_id, phone, is_active, created_at FROM users WHERE 1=1';
    const params = [];

    if (role) {
      params.push(role);
      query += ` AND role = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, users: result.rows });
  } catch (err) { next(err); }
});

/* ── POST /api/users (admin only) — create any user ── */
router.post('/', requireAuth, requireRole('admin', 'super_admin', 'postsales'), async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);
    validateCreateRole(req, data);

    /* Check duplicate email */
    const exists = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [data.email]);
    if (exists.rows.length) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_id, phone, whatsapp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, staff_id`,
      [data.name, data.email, passwordHash, data.role, data.staff_id || null, data.phone || null, data.whatsapp || null]
    );

    const user = result.rows[0];

    /* Send welcome email */
    await emailSvc.sendWelcomeEmail({
      to: data.email, name: data.name, role: data.role,
      loginUrl: `${process.env.APP_URL}/pages/login.html`,
      password: data.password,
    }).catch(e => logger.error('Welcome email failed:', e.message));

    logger.info(`[CREATE USER] ${data.email} (${data.role}) by admin ${req.user.email}`);
    res.status(201).json({ success: true, user });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ── GET /api/users/:id ── */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    /* Users can only fetch their own profile unless admin */
    if (req.user.id !== req.params.id && !['admin','super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.staff_id, u.phone, u.whatsapp,
              u.photo_url, u.bio, u.date_of_birth, u.email_verified, u.last_login_at,
              tp.subject, tp.courses, tp.grade_groups, tp.availability, tp.dbs_checked,
              tp.earnings, tp.points, tp.classes_done,
              sp.grade, sp.age, sp.parent_name, sp.parent_email, sp.credits
       FROM users u
       LEFT JOIN tutor_profiles   tp ON tp.user_id = u.id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
});

/* ── PUT /api/users/:id ── */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.id !== req.params.id && !['admin','super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const data = updateSchema.parse(req.body);
    const fields = [];
    const values = [];
    let i = 1;

    if (data.name)          { fields.push(`name = $${i++}`);          values.push(data.name); }
    if (data.phone)         { fields.push(`phone = $${i++}`);         values.push(data.phone); }
    if (data.whatsapp)      { fields.push(`whatsapp = $${i++}`);      values.push(data.whatsapp); }
    if (data.bio)           { fields.push(`bio = $${i++}`);           values.push(data.bio); }
    if (data.date_of_birth) { fields.push(`date_of_birth = $${i++}`); values.push(data.date_of_birth); }

    if (!fields.length) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${i} RETURNING id, name, email, role, phone, whatsapp, bio`,
      values
    );

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ── PUT /api/users/:id/password ── */
router.put('/:id/password', requireAuth, async (req, res, next) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Both current and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.params.id]);
    const user   = result.rows[0];
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.params.id]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

/* ── DELETE /api/users/:id (admin only — soft delete) ── */
router.delete('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [req.params.id]);
    logger.info(`[DEACTIVATE USER] ${req.params.id} by ${req.user.email}`);
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
