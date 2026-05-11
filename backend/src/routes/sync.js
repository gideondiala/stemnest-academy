/**
 * Sync routes — receive bulk data pushes from frontend localStorage
 * POST /api/sync/class-reports   — save class reports from tutor
 * POST /api/sync/pipeline        — save sales pipeline records
 * POST /api/sync/late-joins      — save late join records
 * POST /api/sync/completed-demos — save completed demo records
 * POST /api/sync/incomplete-demos — save incomplete demo records
 * POST /api/sync/sales-leads     — save sales leads
 * POST /api/sync/credits         — update student credits
 * GET  /api/sync/dashboard/:role — get all data for a dashboard role
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();

/* ── Helper: upsert a record by a unique key ── */
async function upsert(table, data, conflictKey) {
  const keys   = Object.keys(data);
  const values = Object.values(data);
  const cols   = keys.join(', ');
  const params = keys.map((_, i) => `$${i + 1}`).join(', ');
  const updates = keys.filter(k => k !== conflictKey).map((k, i) => `${k} = EXCLUDED.${k}`).join(', ');

  await pool.query(
    `INSERT INTO ${table} (${cols}) VALUES (${params})
     ON CONFLICT (${conflictKey}) DO UPDATE SET ${updates}`,
    values
  );
}

/* ══════════════════════════════════════════════
   POST /api/sync/class-reports
   Tutor submits end-of-class report
══════════════════════════════════════════════ */
router.post('/class-reports', requireAuth, async (req, res, next) => {
  try {
    const { bookingId, outcome, classQuality, studentInterest, purchasingPower,
            incompleteReason, notes, recordingLink, payAmount, creditDeducted } = req.body;

    if (!bookingId || !outcome) {
      return res.status(400).json({ success: false, error: 'bookingId and outcome required' });
    }

    /* Save class report */
    await pool.query(
      `INSERT INTO class_reports
         (booking_id, tutor_id, outcome, class_quality, student_interest,
          purchasing_power, incomplete_reason, notes, recording_link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (booking_id) DO UPDATE SET
         outcome = EXCLUDED.outcome,
         class_quality = EXCLUDED.class_quality,
         student_interest = EXCLUDED.student_interest,
         purchasing_power = EXCLUDED.purchasing_power,
         incomplete_reason = EXCLUDED.incomplete_reason,
         notes = EXCLUDED.notes,
         recording_link = EXCLUDED.recording_link`,
      [bookingId, req.user.id, outcome, classQuality || null, studentInterest || null,
       purchasingPower || null, incompleteReason || null, notes || null, recordingLink || null]
    ).catch(async () => {
      /* If conflict constraint doesn't exist, just insert */
      await pool.query(
        `INSERT INTO class_reports
           (booking_id, tutor_id, outcome, class_quality, student_interest,
            purchasing_power, incomplete_reason, notes, recording_link)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [bookingId, req.user.id, outcome, classQuality || null, studentInterest || null,
         purchasingPower || null, incompleteReason || null, notes || null, recordingLink || null]
      );
    });

    /* Update booking status */
    await pool.query(
      `UPDATE bookings SET status = $1, completed_at = NOW() WHERE id = $2`,
      [outcome, bookingId]
    ).catch(() => {});

    /* Deduct student credit if completed */
    if (creditDeducted && (outcome === 'completed' || outcome === 'partially_completed')) {
      const bResult = await pool.query('SELECT student_id FROM bookings WHERE id = $1', [bookingId]);
      const studentId = bResult.rows[0]?.student_id;
      if (studentId) {
        await pool.query(
          `UPDATE student_profiles SET credits = GREATEST(0, credits - 1) WHERE user_id = $1`,
          [studentId]
        ).catch(() => {});
        await pool.query(
          `INSERT INTO credit_transactions (student_id, type, amount, description, booking_id)
           VALUES ($1, 'class_deduction', -1, 'Class completed — 1 credit used', $2)`,
          [studentId, bookingId]
        ).catch(() => {});
      }
    }

    /* Update tutor earnings */
    if (payAmount && payAmount > 0) {
      await pool.query(
        `UPDATE tutor_profiles SET earnings = earnings + $1, classes_done = classes_done + 1
         WHERE user_id = $2`,
        [payAmount, req.user.id]
      ).catch(() => {});
    }

    logger.info(`[SYNC] Class report: booking ${bookingId} → ${outcome}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   POST /api/sync/pipeline
   Sales person saves pitch record
══════════════════════════════════════════════ */
router.post('/pipeline', requireAuth, async (req, res, next) => {
  try {
    const records = Array.isArray(req.body) ? req.body : [req.body];

    for (const p of records) {
      if (!p.bookingId) continue;
      await pool.query(
        `INSERT INTO pipeline
           (booking_id, sales_id, student_name, subject, course_pitched,
            status, interest_level, purchasing_power, payment_amount, notes, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (booking_id) DO UPDATE SET
           status = EXCLUDED.status,
           course_pitched = EXCLUDED.course_pitched,
           interest_level = EXCLUDED.interest_level,
           purchasing_power = EXCLUDED.purchasing_power,
           payment_amount = EXCLUDED.payment_amount,
           notes = EXCLUDED.notes,
           updated_at = NOW()`,
        [p.bookingId, req.user.id, p.studentName || '', p.subject || '',
         p.course || '', p.status || 'pitched',
         p.interest || null, p.purchasingPower || null,
         p.paymentAmount ? parseFloat(p.paymentAmount) : null,
         p.notes || null]
      ).catch(() => {
        /* If conflict constraint missing, just insert */
        pool.query(
          `INSERT INTO pipeline
             (booking_id, sales_id, student_name, subject, course_pitched,
              status, interest_level, purchasing_power, payment_amount, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [p.bookingId, req.user.id, p.studentName || '', p.subject || '',
           p.course || '', p.status || 'pitched',
           p.interest || null, p.purchasingPower || null,
           p.paymentAmount ? parseFloat(p.paymentAmount) : null,
           p.notes || null]
        ).catch(() => {});
      });
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   POST /api/sync/late-joins
   Operations: log a late join
══════════════════════════════════════════════ */
router.post('/late-joins', requireAuth, async (req, res, next) => {
  try {
    const { bookingId, tutorId, joinTime, minsLate, penalty, pardoned } = req.body;
    if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId required' });

    await pool.query(
      `INSERT INTO late_joins (booking_id, tutor_id, join_time, mins_late, penalty, pardoned)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [bookingId, tutorId || req.user.id,
       joinTime ? new Date(joinTime) : new Date(),
       minsLate || 0, penalty || 0, pardoned !== false]
    ).catch(() => {});

    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   POST /api/sync/credits
   Update student credits
══════════════════════════════════════════════ */
router.post('/credits', requireAuth, async (req, res, next) => {
  try {
    const { studentEmail, credits, type, description, bookingId } = req.body;
    if (!studentEmail) return res.status(400).json({ success: false, error: 'studentEmail required' });

    /* Find student by email */
    const userResult = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [studentEmail]
    );
    if (!userResult.rows.length) {
      return res.json({ success: true, message: 'Student not in DB yet — localStorage only' });
    }

    const studentId = userResult.rows[0].id;

    /* Set absolute credit value */
    if (credits !== undefined) {
      await pool.query(
        `INSERT INTO student_profiles (user_id, credits)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET credits = $2`,
        [studentId, parseInt(credits)]
      ).catch(() => {});
    }

    /* Log transaction */
    if (type) {
      await pool.query(
        `INSERT INTO credit_transactions (student_id, type, amount, description, booking_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [studentId, type, parseInt(credits) || 0, description || '', bookingId || null]
      ).catch(() => {});
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/sync/dashboard/:role
   Returns all data needed for a dashboard
══════════════════════════════════════════════ */
router.get('/dashboard/:role', requireAuth, async (req, res, next) => {
  try {
    const { role } = req.params;
    const userId   = req.user.id;
    const result   = {};

    if (role === 'operations') {
      const [lateJoins, classReports, absentTeachers] = await Promise.all([
        pool.query(`SELECT lj.*, u.name AS tutor_name, u.staff_id AS tutor_staff_id
                    FROM late_joins lj LEFT JOIN users u ON u.id = lj.tutor_id
                    ORDER BY lj.created_at DESC LIMIT 500`),
        pool.query(`SELECT cr.*, u.name AS tutor_name, b.date, b.time, b.subject,
                           b.notes AS booking_notes
                    FROM class_reports cr
                    LEFT JOIN users u ON u.id = cr.tutor_id
                    LEFT JOIN bookings b ON b.id = cr.booking_id
                    ORDER BY cr.created_at DESC LIMIT 500`),
        pool.query(`SELECT b.*, u.name AS tutor_name
                    FROM bookings b LEFT JOIN users u ON u.id = b.tutor_id
                    WHERE b.status = 'teacher_absent'
                    ORDER BY b.date DESC LIMIT 200`),
      ]);
      result.lateJoins      = lateJoins.rows;
      result.classReports   = classReports.rows;
      result.absentTeachers = absentTeachers.rows;
    }

    if (role === 'sales') {
      const [pipeline, bookings] = await Promise.all([
        pool.query(`SELECT p.*, b.date, b.time, b.subject,
                           u_s.name AS student_name, u_s.email AS student_email
                    FROM pipeline p
                    LEFT JOIN bookings b ON b.id = p.booking_id
                    LEFT JOIN users u_s ON u_s.id = b.student_id
                    WHERE p.sales_id = $1
                    ORDER BY p.updated_at DESC`, [userId]),
        pool.query(`SELECT b.*, u_s.name AS student_name, u_s.email AS student_email,
                           u_t.name AS tutor_name
                    FROM bookings b
                    LEFT JOIN users u_s ON u_s.id = b.student_id
                    LEFT JOIN users u_t ON u_t.id = b.tutor_id
                    WHERE b.sales_id = $1 AND b.status = 'scheduled'
                    ORDER BY b.date ASC`, [userId]),
      ]);
      result.pipeline = pipeline.rows;
      result.bookings = bookings.rows;
    }

    if (role === 'presales') {
      const bookings = await pool.query(
        `SELECT b.*, u_s.name AS student_name, u_s.email AS student_email,
                u_t.name AS tutor_name, u_sp.name AS sales_name
         FROM bookings b
         LEFT JOIN users u_s  ON u_s.id  = b.student_id
         LEFT JOIN users u_t  ON u_t.id  = b.tutor_id
         LEFT JOIN users u_sp ON u_sp.id = b.sales_id
         WHERE b.is_demo = TRUE
         ORDER BY b.booked_at DESC LIMIT 500`
      );
      result.bookings = bookings.rows;
    }

    if (role === 'postsales') {
      const [payments, students] = await Promise.all([
        pool.query(`SELECT p.*, u_s.name AS student_name, u_s.email AS student_email,
                           c.name AS course_name
                    FROM payments p
                    LEFT JOIN users u_s ON u_s.id = p.student_id
                    LEFT JOIN courses c ON c.id   = p.course_id
                    ORDER BY p.created_at DESC LIMIT 500`),
        pool.query(`SELECT u.id, u.name, u.email, u.phone, sp.credits, sp.grade
                    FROM users u
                    LEFT JOIN student_profiles sp ON sp.user_id = u.id
                    WHERE u.role = 'student' AND u.is_active = TRUE
                    ORDER BY u.created_at DESC`),
      ]);
      result.payments = payments.rows;
      result.students = students.rows;
    }

    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

module.exports = router;
