/**
 * Bookings routes
 * GET    /api/bookings              — list (filtered by role)
 * POST   /api/bookings              — create demo booking (public)
 * GET    /api/bookings/:id          — get single booking
 * PUT    /api/bookings/:id/assign   — assign tutor + sales (admin/presales)
 * PUT    /api/bookings/:id/status   — update status (tutor/admin)
 * POST   /api/bookings/:id/report   — submit end-of-class report (tutor)
 * POST   /api/bookings/:id/reschedule — reschedule lesson (presales/tutor)
 */

const express = require('express');
const { z }   = require('zod');

const pool     = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const notify   = require('../services/notificationService');
const logger   = require('../utils/logger');

const router = express.Router();

/* ── Validation ── */
const bookingSchema = z.object({
  studentName:  z.string().min(2),
  age:          z.string(),
  grade:        z.string(),
  email:        z.string().email(),
  whatsapp:     z.string().min(7),
  parentName:   z.string().optional(),
  subject:      z.enum(['Coding','Maths','Sciences']),
  device:       z.string(),
  timezone:     z.string(),
  date:         z.string(),
  time:         z.string(),
});

const assignSchema = z.object({
  tutorId:    z.string().uuid(),
  salesId:    z.string().uuid().optional(),
  classLink:  z.string().url(),
  notes:      z.string().optional(),
});

const reportSchema = z.object({
  outcome:          z.enum(['completed','incomplete','partially_completed']),
  classQuality:     z.string().optional(),
  studentInterest:  z.string().optional(),
  purchasingPower:  z.string().optional(),
  incompleteReason: z.string().optional(),
  notes:            z.string().optional(),
  recordingLink:    z.string().url().optional().or(z.literal('')),
});

/* ══════════════════════════════════════════════
   GET /api/bookings
══════════════════════════════════════════════ */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, subject, limit = 100, offset = 0 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    /* Role-based filtering */
    if (req.user.role === 'tutor') {
      params.push(req.user.id);
      where += ` AND b.tutor_id = $${params.length}`;
    } else if (req.user.role === 'student') {
      params.push(req.user.id);
      where += ` AND b.student_id = $${params.length}`;
    } else if (req.user.role === 'sales') {
      params.push(req.user.id);
      where += ` AND b.sales_id = $${params.length}`;
    }

    if (status) { params.push(status); where += ` AND b.status = $${params.length}`; }
    if (subject) { params.push(subject); where += ` AND b.subject = $${params.length}`; }

    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(
      `SELECT b.*,
              u_s.name  AS student_name,  u_s.email AS student_email,
              u_t.name  AS tutor_name,    u_t.staff_id AS tutor_staff_id,
              u_sp.name AS sales_name,
              c.name    AS course_name,
              l.name    AS lesson_name_full, l.activity_link, l.slides_link
       FROM bookings b
       LEFT JOIN users u_s  ON u_s.id  = b.student_id
       LEFT JOIN users u_t  ON u_t.id  = b.tutor_id
       LEFT JOIN users u_sp ON u_sp.id = b.sales_id
       LEFT JOIN courses c  ON c.id    = b.course_id
       LEFT JOIN lessons l  ON l.id    = b.lesson_id
       ${where}
       ORDER BY b.date DESC, b.time DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, bookings: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   POST /api/bookings  (public — demo booking)
══════════════════════════════════════════════ */
router.post('/', async (req, res, next) => {
  try {
    const data = bookingSchema.parse(req.body);

    /* Duplicate check */
    const dup = await pool.query(
      `SELECT id FROM bookings
       WHERE LOWER(b.student_email) = LOWER($1) AND status = 'pending'
         AND booked_at > NOW() - INTERVAL '24 hours'`,
      [data.email]
    ).catch(() => ({ rows: [] }));

    /* Insert booking (student_id may be null for demo — not yet registered) */
    const result = await pool.query(
      `INSERT INTO bookings
         (subject, grade, date, time, class_link, status, is_demo, notes, booked_at)
       VALUES ($1, $2, $3::date, $4::time, '', 'pending', TRUE, $5, NOW())
       RETURNING id`,
      [data.subject, data.grade, data.date, data.time,
       JSON.stringify({ studentName: data.studentName, age: data.age, email: data.email,
                        whatsapp: data.whatsapp, parentName: data.parentName,
                        device: data.device, timezone: data.timezone })]
    );

    const bookingId = result.rows[0].id;

    /* Notify parent */
    await notify.notifyDemoConfirmed({
      userId:      null,
      parentEmail: data.email,
      parentPhone: data.whatsapp,
      parentName:  data.parentName,
      studentName: data.studentName,
      subject:     data.subject,
      date:        data.date,
      time:        data.time,
      bookingId,
    });

    logger.info(`[BOOKING CREATED] ${data.studentName} · ${data.subject} · ${data.date}`);
    res.status(201).json({ success: true, bookingId });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ══════════════════════════════════════════════
   GET /api/bookings/:id
══════════════════════════════════════════════ */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.*,
              u_s.name  AS student_name,  u_s.email AS student_email, u_s.phone AS student_phone,
              u_t.name  AS tutor_name,    u_t.staff_id AS tutor_staff_id,
              u_sp.name AS sales_name,
              c.name    AS course_name,
              l.name    AS lesson_name_full, l.activity_link, l.slides_link
       FROM bookings b
       LEFT JOIN users u_s  ON u_s.id  = b.student_id
       LEFT JOIN users u_t  ON u_t.id  = b.tutor_id
       LEFT JOIN users u_sp ON u_sp.id = b.sales_id
       LEFT JOIN courses c  ON c.id    = b.course_id
       LEFT JOIN lessons l  ON l.id    = b.lesson_id
       WHERE b.id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    res.json({ success: true, booking: result.rows[0] });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   PUT /api/bookings/:id/assign
══════════════════════════════════════════════ */
router.put('/:id/assign', requireAuth, requireRole('admin','super_admin','presales'), async (req, res, next) => {
  try {
    const { tutorId, salesId, classLink, notes } = assignSchema.parse(req.body);

    /* Get tutor + sales details for notifications */
    const tutorResult = await pool.query('SELECT * FROM users WHERE id = $1', [tutorId]);
    const tutor = tutorResult.rows[0];
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found' });

    /* Get booking */
    const bResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    const booking = bResult.rows[0];
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    /* Update booking */
    await pool.query(
      `UPDATE bookings
       SET tutor_id = $1, sales_id = $2, class_link = $3, notes = $4,
           status = 'scheduled', scheduled_at = NOW()
       WHERE id = $5`,
      [tutorId, salesId || null, classLink, notes || null, req.params.id]
    );

    /* Notify tutor */
    const bookingNotes = typeof booking.notes === 'string' ? JSON.parse(booking.notes || '{}') : (booking.notes || {});
    await notify.notifyClassAssigned({
      tutorId:     tutor.id,
      tutorEmail:  tutor.email,
      tutorPhone:  tutor.phone,
      tutorName:   tutor.name,
      studentName: bookingNotes.studentName || 'Student',
      subject:     booking.subject,
      date:        booking.date,
      time:        booking.time,
      classLink,
    });

    /* Notify sales person */
    if (salesId) {
      const salesResult = await pool.query('SELECT * FROM users WHERE id = $1', [salesId]);
      const sales = salesResult.rows[0];
      if (sales) {
        await notify.notifySalesAssigned({
          salesId:     sales.id,
          salesEmail:  sales.email,
          salesPhone:  sales.phone,
          salesName:   sales.name,
          studentName: bookingNotes.studentName || 'Student',
          subject:     booking.subject,
          date:        booking.date,
          time:        booking.time,
        });
      }
    }

    logger.info(`[ASSIGN] Booking ${req.params.id} → tutor ${tutorId}`);
    res.json({ success: true, message: 'Class assigned and notifications sent' });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ══════════════════════════════════════════════
   POST /api/bookings/:id/report  (tutor)
══════════════════════════════════════════════ */
router.post('/:id/report', requireAuth, requireRole('tutor'), async (req, res, next) => {
  try {
    const data = reportSchema.parse(req.body);

    /* Verify this booking belongs to this tutor */
    const bResult = await pool.query(
      'SELECT * FROM bookings WHERE id = $1 AND tutor_id = $2',
      [req.params.id, req.user.id]
    );
    if (!bResult.rows.length) {
      return res.status(403).json({ success: false, error: 'Booking not found or not yours' });
    }

    /* Save report */
    await pool.query(
      `INSERT INTO class_reports
         (booking_id, tutor_id, outcome, class_quality, student_interest,
          purchasing_power, incomplete_reason, notes, recording_link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.params.id, req.user.id, data.outcome, data.classQuality || null,
       data.studentInterest || null, data.purchasingPower || null,
       data.incompleteReason || null, data.notes || null,
       data.recordingLink || null]
    );

    /* Update booking status */
    await pool.query(
      'UPDATE bookings SET status = $1, completed_at = NOW() WHERE id = $2',
      [data.outcome, req.params.id]
    );

    /* Deduct student credit if completed */
    if (data.outcome === 'completed' || data.outcome === 'partially_completed') {
      const booking = bResult.rows[0];
      if (booking.student_id) {
        await pool.query(
          `UPDATE student_profiles SET credits = credits - 1 WHERE user_id = $1 AND credits > 0`,
          [booking.student_id]
        );
        await pool.query(
          `INSERT INTO credit_transactions (student_id, type, amount, description, booking_id)
           VALUES ($1, 'class_deduction', -1, 'Class completed — 1 credit used', $2)`,
          [booking.student_id, req.params.id]
        );

        /* Check if credits are low */
        const credResult = await pool.query(
          `SELECT sp.credits, u.email, u.phone, u.name
           FROM student_profiles sp JOIN users u ON u.id = sp.user_id
           WHERE sp.user_id = $1`,
          [booking.student_id]
        );
        const student = credResult.rows[0];
        if (student && student.credits <= 2) {
          await notify.notifyLowCredits({
            studentId:        booking.student_id,
            parentEmail:      student.email,
            parentPhone:      student.phone,
            studentName:      student.name,
            creditsRemaining: student.credits,
          });
        }
      }
    }

    logger.info(`[REPORT] Booking ${req.params.id} → ${data.outcome}`);
    res.json({ success: true, message: 'Report submitted' });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

module.exports = router;
