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
const { isValidTimeZone } = require('../utils/timezone');

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

/* ── PUT /api/users/me/timezone — save the caller's IANA timezone ── */
router.put('/me/timezone', requireAuth, async (req, res, next) => {
  try {
    const { timezone } = req.body || {};
    if (!isValidTimeZone(timezone)) {
      return res.status(400).json({ success: false, error: 'Invalid timezone' });
    }
    /* An admin viewing a dashboard as someone else must not overwrite their timezone */
    if (req.user.impersonatedBy) return res.json({ success: true, skipped: true });
    await pool.query('UPDATE users SET timezone = $1 WHERE id = $2', [timezone, req.user.id]);
    res.json({ success: true, timezone });
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

/* ── POST /api/users — create a user (admin, super_admin; postsales: students only) ──
   For students the whole onboarding is one transaction: account, profile
   (grade, age, parent details, credits), the payment record when an amount
   was received, and the pathway enrolment when a pathway was chosen. */
const studentProfileSchema = z.object({
  grade:        z.union([z.string(), z.number()]).optional().nullable(),
  age:          z.union([z.string(), z.number()]).optional().nullable(),
  credits:      z.coerce.number().int().min(0).optional().nullable(),
  parentName:   z.string().optional().nullable(),
  parentEmail:  z.string().optional().nullable(),
  pathwayId:    z.string().uuid().optional().nullable().or(z.literal('')),
  gradeNumber:  z.coerce.number().int().positive().optional().nullable(),
  subject:      z.string().optional().nullable(),
  course:       z.string().optional().nullable(),
  amount:       z.coerce.number().min(0).optional().nullable(),
  currency:     z.string().max(10).optional().nullable(),
  paymentReference:    z.string().max(120).optional().nullable(),
  timezone:     z.string().optional().nullable(),
  enrollmentRequestId: z.string().uuid().optional().nullable(),
}).partial();

const createUserWithProfileSchema = createUserSchema.extend({
  studentProfile: studentProfileSchema.optional(),
});

/** Next free S-#### student ID (call inside the transaction, after the lock). */
async function nextStudentId(client) {
  const r = await client.query(
    `SELECT COALESCE(MAX(substring(staff_id FROM '^S-(\\d+)$')::int), 0) AS n
     FROM users WHERE staff_id ~ '^S-\\d+$'`
  );
  return 'S-' + String(r.rows[0].n + 1).padStart(4, '0');
}

router.post('/', requireAuth, requireRole('admin', 'super_admin', 'postsales'), async (req, res, next) => {
  let client;
  try {
    const data = createUserWithProfileSchema.parse(req.body);
    validateCreateRole(req, data);

    const sp = data.studentProfile || {};
    const str = v => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();
    const credits     = Number.isInteger(sp.credits) ? sp.credits : (data.credits || 0);
    const parentEmail = str(sp.parentEmail);
    const pathwayId   = str(sp.pathwayId);
    const timezone    = str(sp.timezone);
    if (timezone && !isValidTimeZone(timezone)) {
      return res.status(400).json({ success: false, error: 'Invalid timezone' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    /* Serialise ID allocation so two onboardings never get the same S-#### */
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('users.staff_id'))`);

    const exists = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [data.email]);
    if (exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    let finalStaffId = data.staff_id || null;
    if (!finalStaffId && data.role === 'student') finalStaffId = await nextStudentId(client);
    if (finalStaffId) {
      const taken = await client.query('SELECT id FROM users WHERE staff_id = $1', [finalStaffId]);
      if (taken.rows.length) {
        const prefix = finalStaffId.replace(/\d+$/, '');
        const r = await client.query(
          `SELECT COALESCE(MAX(NULLIF(regexp_replace(staff_id, '^\\D+', ''), '')::int), 0) AS n
           FROM users WHERE staff_id LIKE $1 AND staff_id ~ ('^' || $2 || '\\d+$')`,
          [prefix + '%', prefix]
        );
        finalStaffId = prefix + String(r.rows[0].n + 1).padStart(4, '0');
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, role, staff_id, phone, whatsapp, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, email, role, staff_id`,
      [data.name, data.email, passwordHash, data.role, finalStaffId,
       data.phone || null, data.whatsapp || null,
       timezone || (data.role === 'student' ? null : 'Africa/Lagos')]
    );
    const user = result.rows[0];

    let pathwayName = data.pathway || null;
    let enrolmentId = null;
    let paymentId   = null;

    if (data.role === 'student') {
      await client.query(
        `INSERT INTO student_profiles (user_id, grade, age, credits, parent_name, parent_email, enrolled_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [user.id, str(sp.grade) ?? data.grade ?? null, str(sp.age) ?? data.age ?? null, credits,
         str(sp.parentName), parentEmail]
      );

      if (credits > 0) {
        await client.query(
          `INSERT INTO credit_transactions (student_id, type, amount, description)
           VALUES ($1, 'topup', $2, $3)`,
          [user.id, credits, `Onboarding — ${credits} credit${credits !== 1 ? 's' : ''} added by ${req.user.email}`]
        );
      }

      if (sp.amount && sp.amount > 0) {
        const pay = await client.query(
          `INSERT INTO payments (student_id, sales_id, amount, currency, credits_purchased,
                                 status, notes, created_at, confirmed_at)
           VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, NOW(), NOW())
           RETURNING id`,
          [user.id, req.user.id, sp.amount, (str(sp.currency) || 'GBP').toUpperCase(), credits,
           JSON.stringify({ method: 'manual', reference: str(sp.paymentReference), recordedBy: req.user.email, onboarding: true })]
        );
        paymentId = pay.rows[0].id;
      }

      if (pathwayId) {
        const gradeNumber = sp.gradeNumber || 1;
        const pw = await client.query(
          `SELECT p.name, pg.total_lessons
           FROM pathways p
           LEFT JOIN pathway_grades pg ON pg.pathway_id = p.id AND pg.grade_number = $2
           WHERE p.id = $1`,
          [pathwayId, gradeNumber]
        );
        if (!pw.rows.length) throw Object.assign(new Error('Pathway not found'), { status: 400 });
        pathwayName = pw.rows[0].name;
        const en = await client.query(
          `INSERT INTO enrolments (student_id, pathway_id, current_grade, lessons_completed,
                                   total_lessons, status, created_at, updated_at)
           VALUES ($1, $2, $3, 0, $4, 'active', NOW(), NOW())
           RETURNING id`,
          [user.id, pathwayId, gradeNumber, pw.rows[0].total_lessons || 72]
        );
        enrolmentId = en.rows[0].id;
      }

      if (sp.enrollmentRequestId) {
        await client.query(
          `UPDATE enrollment_requests
           SET status = 'processed', processed_by = $1, processed_at = NOW(), student_id = $2
           WHERE id = $3`,
          [req.user.id, user.id, sp.enrollmentRequestId]
        );
      }
    } else if (data.role === 'tutor') {
      const colors = ['linear-gradient(135deg,var(--blue),#4f87f5)','linear-gradient(135deg,var(--green),#3dd9a4)','linear-gradient(135deg,var(--orange),#ffaa80)','linear-gradient(135deg,var(--purple),#a78bfa)'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      await client.query(
        `INSERT INTO tutor_profiles (user_id, subject, courses, grade_groups, availability, dbs_checked, color, regions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.id, data.subject || null, data.courses || [], data.gradeGroups || [], data.availability || null, data.dbs || 'pending', randomColor, data.regions || []]
      );
    }

    await client.query('COMMIT');
    client.release(); client = null;

    /* Emails after commit — a mail failure must not undo the account */
    const loginUrl = `${process.env.APP_URL}/pages/login.html`;
    if (data.role === 'student') {
      const to = data.email;
      await emailSvc.sendOnboardingEmail({
        to,
        name:      data.name,
        studentId: user.staff_id || user.id,
        password:  data.password,
        course:    str(sp.course) || data.course || str(sp.subject) || 'Coding',
        pathway:   pathwayName,
        credits,
        loginUrl,
      }).catch(e => logger.error('Onboarding email failed:', e.message));
      if (parentEmail && parentEmail.toLowerCase() !== to.toLowerCase()) {
        await emailSvc.sendOnboardingEmail({
          to: parentEmail, name: data.name, studentId: user.staff_id || user.id,
          password: data.password, course: str(sp.course) || 'Coding', pathway: pathwayName,
          credits, loginUrl,
        }).catch(e => logger.error('Parent onboarding email failed:', e.message));
      }
    } else {
      await emailSvc.sendWelcomeEmail({
        to: data.email, name: data.name, role: data.role, loginUrl, password: data.password,
      }).catch(e => logger.error('Welcome email failed:', e.message));
    }

    logger.info(`[CREATE USER] ${user.staff_id || ''} ${data.email} (${data.role}) by ${req.user.email}`);
    res.status(201).json({ success: true, user, enrolmentId, paymentId });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    if (err.name === 'ZodError') {
      const issue = err.errors[0];
      return res.status(400).json({ success: false, error: (issue.path.join('.') ? issue.path.join('.') + ': ' : '') + issue.message });
    }
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    /* Postgres unique constraint violations — return friendly messages */
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
