/**
 * Users routes
 * GET    /api/users/me/notifications  Ã¢â‚¬â€ get my notifications
 * PUT    /api/users/me/notifications/:id/read
 * GET    /api/users/:id               Ã¢â‚¬â€ get user profile
 * PUT    /api/users/:id               Ã¢â‚¬â€ update own profile
 * PUT    /api/users/:id/password      Ã¢â‚¬â€ change password
 * GET    /api/users (admin only)      Ã¢â‚¬â€ list all users
 * POST   /api/users (admin only)      Ã¢â‚¬â€ create user
 * DELETE /api/users/:id (admin only)  Ã¢â‚¬â€ deactivate user
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
  grade:    z.string().optional(),
  age:      z.string().optional(),
  credits:  z.number().optional(),
  course:   z.string().optional(),
  subject:  z.string().optional(),
  pathway:  z.string().optional(),
  courses:  z.array(z.string()).optional(),
  gradeGroups: z.array(z.string()).optional(),
  availability: z.string().optional(),
  dbs:      z.string().optional(),
  regions:  z.array(z.string()).optional(),
});

/* Postsales can only create students */
function validateCreateRole(req, data) {
  if (req.user.role === 'postsales' && data.role !== 'student') {
    throw Object.assign(new Error('Post-Sales can only create student accounts'), { status: 403 });
  }
}

/* Ã¢â€â‚¬Ã¢â€â‚¬ GET /api/users/me/notifications Ã¢â€â‚¬Ã¢â€â‚¬ */
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

/* Ã¢â€â‚¬Ã¢â€â‚¬ PUT /api/users/me/notifications/:id/read Ã¢â€â‚¬Ã¢â€â‚¬ */
router.put('/me/notifications/:id/read', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* Ã¢â€â‚¬Ã¢â€â‚¬ GET /api/users Ã¢â€â‚¬Ã¢â€â‚¬ */
/* Admin/super_admin: full access. Presales/postsales: can only list tutors and sales. */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { role, search } = req.query;
    const callerRole = req.user.role;

    /* Access control */
    const isAdmin = ['admin', 'super_admin'].includes(callerRole);
    const isStaff = ['presales', 'postsales', 'sales', 'operations', 'hr'].includes(callerRole);

    if (!isAdmin && !isStaff) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    /* Staff (non-admin) can only query tutors or sales Ã¢â‚¬â€ not all users */
    if (!isAdmin && role && !['tutor', 'sales'].includes(role)) {
      return res.status(403).json({ success: false, error: 'Access denied for this role filter' });
    }
    if (!isAdmin && !role) {
      return res.status(403).json({ success: false, error: 'Role filter required' });
    }

    let query = `SELECT users.id, users.name, users.email, users.role, users.staff_id,
                        users.phone, users.is_active, users.created_at,
                        tp.subject, tp.courses, tp.grade_groups, tp.availability, tp.regions,
                        sp.grade, sp.credits, sp.credits_suspended, sp.enrolled_at
                 FROM users
                 LEFT JOIN tutor_profiles tp ON tp.user_id = users.id
                 LEFT JOIN student_profiles sp ON sp.user_id = users.id
                 WHERE 1=1`;
    const params = [];

    if (role) {
      params.push(role);
      query += ` AND users.role = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (users.name ILIKE $${params.length} OR users.email ILIKE $${params.length})`;
    }

    query += ' ORDER BY users.created_at DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, users: result.rows });
  } catch (err) { next(err); }
});

/* Ã¢â€â‚¬Ã¢â€â‚¬ POST /api/users Ã¢â‚¬â€ create any user (requires login) Ã¢â€â‚¬Ã¢â€â‚¬ */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);

    /* Check duplicate email */
    const exists = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [data.email]);
    if (exists.rows.length) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    /* If a staff_id was provided, check it's not already taken and auto-increment if needed.
       For students, auto-generate S-XXXX if no staff_id provided. */
    let finalStaffId = data.staff_id || null;

    /* Auto-generate S-XXXX for students */
    if (!finalStaffId && data.role === 'student') {
      const lastStudent = await pool.query(
        `SELECT staff_id FROM users WHERE role = 'student' AND staff_id LIKE 'S-%'
         ORDER BY created_at DESC LIMIT 1`
      );
      const lastNum = lastStudent.rows.length
        ? parseInt((lastStudent.rows[0].staff_id || 'S-0000').replace('S-', '')) || 0
        : 0;
      finalStaffId = 'S-' + String(lastNum + 1).padStart(4, '0');
    }

    if (finalStaffId) {
      const staffExists = await pool.query('SELECT id FROM users WHERE staff_id = $1', [finalStaffId]);
      if (staffExists.rows.length) {
        const prefix  = finalStaffId.replace(/\d+$/, '');
        const numPart = parseInt(finalStaffId.replace(/^\D+/, '')) || 0;
        const taken   = await pool.query(
          `SELECT staff_id FROM users WHERE staff_id LIKE $1 ORDER BY staff_id`,
          [prefix + '%']
        );
        const takenNums = taken.rows
          .map(r => parseInt((r.staff_id || '').replace(/^\D+/, '')) || 0)
          .filter(n => !isNaN(n));
        const nextNum = takenNums.length ? Math.max(...takenNums) + 1 : numPart + 1;
        finalStaffId = prefix + String(nextNum).padStart(4, '0');
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_id, phone, whatsapp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, staff_id`,
      [data.name, data.email, passwordHash, data.role, finalStaffId, data.phone || null, data.whatsapp || null]
    );

    const user = result.rows[0];

    /* If student, initialize profile */
    if (data.role === 'student') {
      await pool.query(
        `INSERT INTO student_profiles (user_id, grade, age, credits)
         VALUES ($1, $2, $3, $4)`,
        [user.id, data.grade || null, data.age || null, data.credits || 0]
      );
      
      if (typeof emailSvc.sendOnboardingEmail === 'function') {
        await emailSvc.sendOnboardingEmail({
          to:        data.email,
          name:      data.name,
          studentId: user.staff_id || user.id,
          password:  data.password,
          course:    data.course || 'Coding',
          pathway:   data.pathway || null,
          credits:   data.credits || 0,
          loginUrl:  `${process.env.APP_URL}/pages/login.html`
        }).catch(e => logger.error('Onboarding email failed:', e.message));
      } else {
        await emailSvc.sendWelcomeEmail({
          to:       data.email,
          name:     data.name,
          role:     data.role,
          loginUrl: `${process.env.APP_URL}/pages/login.html`,
          password: data.password,
        }).catch(e => logger.error('Welcome email failed:', e.message));
      }
    } else if (data.role === 'tutor') {
      const colors = ['linear-gradient(135deg,var(--blue),#4f87f5)','linear-gradient(135deg,var(--green),#3dd9a4)','linear-gradient(135deg,var(--orange),#ffaa80)','linear-gradient(135deg,var(--purple),#a78bfa)'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      await pool.query(
        `INSERT INTO tutor_profiles (user_id, subject, courses, grade_groups, availability, dbs_checked, color, regions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.id, data.subject || null, data.courses || [], data.gradeGroups || [], data.availability || null, data.dbs || 'pending', randomColor, data.regions || []]
      );

      /* Send welcome email */
      await emailSvc.sendWelcomeEmail({
        to: data.email, name: data.name, role: data.role,
        loginUrl: `${process.env.APP_URL}/pages/login.html`,
        password: data.password,
      }).catch(e => logger.error('Welcome email failed:', e.message));
    } else {
      /* Send welcome email */
      await emailSvc.sendWelcomeEmail({
        to: data.email, name: data.name, role: data.role,
        loginUrl: `${process.env.APP_URL}/pages/login.html`,
        password: data.password,
      }).catch(e => logger.error('Welcome email failed:', e.message));
    }

    // logger.info(`[CREATE USER] ${data.email} (${data.role}) by admin ${req.user?.email}`);
    res.status(201).json({ success: true, user });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    /* Postgres unique constraint violations Ã¢â‚¬â€ return friendly messages */
    if (err.code === '23505') {
      if (err.constraint === 'users_staff_id_key') {
        return res.status(409).json({ success: false, error: 'Staff ID already in use. Please try again.' });
      }
      if (err.constraint === 'users_email_key') {
        return res.status(409).json({ success: false, error: 'Email already registered.' });
      }
      return res.status(409).json({ success: false, error: 'Duplicate entry: ' + (err.detail || err.message) });
    }
    next(err);
  }
});

/* Ã¢â€â‚¬Ã¢â€â‚¬ GET /api/users/:id Ã¢â€â‚¬Ã¢â€â‚¬ */
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

/* Ã¢â€â‚¬Ã¢â€â‚¬ PUT /api/users/:id Ã¢â€â‚¬Ã¢â€â‚¬ */
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

/* Ã¢â€â‚¬Ã¢â€â‚¬ PUT /api/users/:id/password Ã¢â€â‚¬Ã¢â€â‚¬ */
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

    /* Send password-change confirmation email */
    try {
      const userResult = await pool.query(
        'SELECT name, email FROM users WHERE id = $1',
        [req.params.id]
      );
      const u = userResult.rows[0];
      if (u && u.email) {
        const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
        await emailSvc.sendEmail({
          to:      u.email,
          subject: 'Ã°Å¸â€â€™ Your StemNest password has been changed',
          html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f6fb;margin:0;padding:0;}
  .container{max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);}
  .header{background:linear-gradient(135deg,#1a56db,#0e9f6e);padding:28px 36px;text-align:center;}
  .header h1{color:#fff;font-size:22px;margin:0;font-weight:900;}
  .body{padding:32px 36px;color:#1a202c;font-size:15px;line-height:1.7;}
  .warn-box{background:#fff3e0;border-radius:12px;padding:14px 18px;margin:16px 0;font-size:13px;color:#e65100;font-weight:700;}
  .btn{display:inline-block;background:#1a56db;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:50px;font-weight:700;font-size:14px;margin-top:12px;}
  .footer{background:#f4f6fb;padding:18px 36px;text-align:center;font-size:12px;color:#718096;}
</style></head>
<body><div class="container">
  <div class="header"><h1>Ã°Å¸â€â€™ Password Changed</h1></div>
  <div class="body">
    <p>Hi ${u.name},</p>
    <p>Your StemNest Academy password was successfully changed on <strong>${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</strong>.</p>
    <div class="warn-box">Ã¢Å¡Â Ã¯Â¸Â If you did <strong>not</strong> make this change, please reset your password immediately using the button below or contact us at <strong>support@stemnestacademy.co.uk</strong></div>
    <a href="${appUrl}/pages/login.html" class="btn">Go to Login Ã¢â€ â€™</a>
  </div>
  <div class="footer">Ã‚Â© ${new Date().getFullYear()} StemNest Academy Ltd Ã‚Â· <a href="${appUrl}" style="color:#1a56db;">stemnestacademy.co.uk</a></div>
</div></body></html>`,
          template: 'password_changed',
        }).catch(e => logger.warn('[PASSWORD CHANGE] Confirmation email failed:', e.message));
      }
    } catch (emailErr) {
      logger.warn('[PASSWORD CHANGE] Could not send confirmation email:', emailErr.message);
    }

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

/* Ã¢â€â‚¬Ã¢â€â‚¬ DELETE /api/users/:id (admin only Ã¢â‚¬â€ soft delete) Ã¢â€â‚¬Ã¢â€â‚¬ */
router.delete('/:id', requireAuth, requireRole('admin', 'super_admin', 'postsales'), async (req, res, next) => {
  try {
    const userId = req.params.id;

    /* Verify user exists */
    const userCheck = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [userId]);
    if (!userCheck.rows.length) return res.status(404).json({ success: false, error: 'User not found' });
    const targetUser = userCheck.rows[0];

    /* Deactivate the user account */
    await pool.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [userId]);

    /* If the user is a student, cancel all their future bookings */
    let cancelledCount = 0;
    if (targetUser.role === 'student') {
      const cancelRes = await pool.query(`
        UPDATE bookings
        SET status = 'cancelled'
        WHERE student_id = $1
        AND status = 'scheduled'
        AND date >= CURRENT_DATE
        RETURNING id, tutor_id, date, time
      `, [userId]);
      cancelledCount = cancelRes.rows.length;

      /* Log cancellation for audit */
      logger.info(`[DEACTIVATE] Cancelled ${cancelledCount} future bookings for student ${targetUser.name} (${userId})`);
    }

    logger.info(`[DEACTIVATE USER] ${targetUser.name} (${userId}) deactivated by ${req.user.email}. Bookings cancelled: ${cancelledCount}`);
    res.json({ success: true, message: 'User deactivated', cancelledBookings: cancelledCount });
  } catch (err) { next(err); }
});

/* Ã¢â€â‚¬Ã¢â€â‚¬ PUT /api/users/:id/update-name (admin/postsales Ã¢â‚¬â€ update any user's name) Ã¢â€â‚¬Ã¢â€â‚¬ */
router.put('/:id/update-name', requireAuth, requireRole('admin', 'super_admin', 'postsales'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Name must be at least 2 characters' });
    }
    const cleanName = name.trim();

    /* Update users table */
    const result = await pool.query(
      'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name',
      [cleanName, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'User not found' });

    /* Also update lesson_name on bookings where it stored the student's name */
    await pool.query(`
      UPDATE bookings SET lesson_name = $1
      WHERE student_id = $2 AND (lesson_name = 'Ã¢â‚¬â€' OR lesson_name IS NULL OR lesson_name = '')
    `, [cleanName, req.params.id]);

    logger.info(`[UPDATE NAME] ${req.params.id} Ã¢â€ â€™ "${cleanName}" by ${req.user.email}`);
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
