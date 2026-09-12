/**
 * Enrollment Requests & Referrals routes
 * 
 * POST /api/enrollments/request        — public: submit enrollment request from website
 * GET  /api/enrollments/requests       — postsales: list all enrollment requests
 * PUT  /api/enrollments/requests/:id   — postsales: update payment link/status/proceed
 * 
 * POST /api/enrollments/referral       — student: submit a referral
 * GET  /api/enrollments/referrals      — presales/postsales: list referrals
 * PUT  /api/enrollments/referrals/:id  — presales/postsales: update referral status
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();

/* ══════════════════════════════════════════════
   ENROLLMENT REQUESTS (from website Enrol Now)
══════════════════════════════════════════════ */

/* POST /api/enrollments/request — public */
router.post('/request', async (req, res, next) => {
  try {
    const { studentName, age, email, phone, timezone, courseId, courseName, coursePrice, notes } = req.body;
    if (!studentName) return res.status(400).json({ success: false, error: 'studentName required' });
    if (!email && !phone) return res.status(400).json({ success: false, error: 'email or phone required' });

    const result = await pool.query(
      `INSERT INTO enrollment_requests
         (student_name, age, email, phone, timezone, course_id, course_name, course_price, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'website')
       RETURNING id`,
      [studentName, age||null, email||null, phone||null, timezone||null,
       courseId||null, courseName||null, parseFloat(coursePrice)||null, notes||null]
    );

    logger.info(`[ENROLLMENT REQUEST] ${studentName} → ${courseName}`);
    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) { next(err); }
});

/* GET /api/enrollments/requests — postsales/admin */
router.get('/requests', requireAuth, requireRole('postsales','admin','super_admin'), async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = `SELECT er.*, c.name AS course_name_db, c.price AS course_price_db
                 FROM enrollment_requests er
                 LEFT JOIN courses c ON c.id = er.course_id
                 WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); query += ` AND er.status = $${params.length}`; }
    query += ' ORDER BY er.created_at DESC LIMIT 500';
    const result = await pool.query(query, params);
    res.json({ success: true, requests: result.rows });
  } catch (err) { next(err); }
});

/* PUT /api/enrollments/requests/:id — postsales updates payment link/status */
router.put('/requests/:id', requireAuth, requireRole('postsales','admin','super_admin'), async (req, res, next) => {
  try {
    const { paymentLink, paymentStatus, status, proceed } = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (paymentLink !== undefined)  { fields.push(`payment_link = $${i++}`);   values.push(paymentLink); }
    if (paymentStatus !== undefined){ fields.push(`payment_status = $${i++}`); values.push(paymentStatus); }
    if (status !== undefined)       { fields.push(`status = $${i++}`);         values.push(status); }

    /* When proceed=true, mark as processed and move to paid students */
    if (proceed === true) {
      fields.push(`status = $${i++}`);         values.push('processed');
      fields.push(`processed_by = $${i++}`);   values.push(req.user.id);
      fields.push(`processed_at = NOW()`);
    }

    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    values.push(req.params.id);
    await pool.query(
      `UPDATE enrollment_requests SET ${fields.join(', ')} WHERE id = $${i}`,
      values
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   REFERRALS (from student Refer and Earn)
══════════════════════════════════════════════ */

/* POST /api/enrollments/referral — authenticated student */
router.post('/referral', requireAuth, async (req, res, next) => {
  try {
    const { studentName, grade, age, parentEmail, parentPhone, relationship, needsDemo } = req.body;
    if (!studentName) return res.status(400).json({ success: false, error: 'studentName required' });
    if (!parentEmail && !parentPhone) return res.status(400).json({ success: false, error: 'parentEmail or parentPhone required' });

    /* Get referrer details */
    const referrer = await pool.query('SELECT name, staff_id FROM users WHERE id = $1', [req.user.id]);
    const referrerName = referrer.rows[0]?.name || '';
    const referrerStaffId = referrer.rows[0]?.staff_id || '';

    const result = await pool.query(
      `INSERT INTO referrals
         (referrer_id, referrer_name, referrer_staff_id, student_name, grade, age,
          parent_email, parent_phone, relationship, needs_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [req.user.id, referrerName, referrerStaffId, studentName, grade||null, age||null,
       parentEmail||null, parentPhone||null, relationship||null, needsDemo !== false]
    );

    logger.info(`[REFERRAL] ${referrerName} referred ${studentName}`);
    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) { next(err); }
});

/* GET /api/enrollments/referrals — presales/postsales/admin see all; student sees own */
router.get('/referrals', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const role = req.user.role;
    const staffRoles = ['presales', 'postsales', 'admin', 'super_admin'];

    let query, params;

    if (staffRoles.includes(role)) {
      /* Staff: see all referrals, optionally filtered by status */
      query = `SELECT * FROM referrals WHERE 1=1`;
      params = [];
      if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    } else {
      /* Student: see only their own referrals */
      params = [req.user.id];
      query = `SELECT * FROM referrals WHERE referrer_id = $1`;
      if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    }

    query += ' ORDER BY created_at DESC LIMIT 500';
    const result = await pool.query(query, params);
    res.json({ success: true, referrals: result.rows });
  } catch (err) { next(err); }
});

/* PUT /api/enrollments/referrals/:id — update referral status */
router.put('/referrals/:id', requireAuth, requireRole('presales','postsales','admin','super_admin'), async (req, res, next) => {
  try {
    const { status, paymentLink, paymentStatus, bookingId, proceed } = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (status !== undefined)        { fields.push(`status = $${i++}`);         values.push(status); }
    if (paymentLink !== undefined)   { fields.push(`payment_link = $${i++}`);   values.push(paymentLink); }
    if (paymentStatus !== undefined) { fields.push(`payment_status = $${i++}`); values.push(paymentStatus); }
    if (bookingId !== undefined)     { fields.push(`booking_id = $${i++}`);     values.push(bookingId); }
    if (proceed === true)            { fields.push(`status = $${i++}`);         values.push('enrolled'); }

    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    values.push(req.params.id);
    await pool.query(
      `UPDATE referrals SET ${fields.join(', ')} WHERE id = $${i}`,
      values
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   PUT /api/enrollments/students/:studentId/pause
   Pauses all active enrolments for a student.
   - Cancels all future scheduled paid bookings
   - Sets enrolments.status = 'paused'
   - Sets student_profiles.class_paused = TRUE
   - Preserves credits exactly as-is
   ══════════════════════════════════════════════ */
router.put('/students/:studentId/pause', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'A pause reason is required' });
    }

    /* Verify student exists */
    const stuResult = await pool.query(
      `SELECT u.id, u.name, sp.credits, sp.class_paused
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'student'`,
      [studentId]
    );
    if (!stuResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    if (stuResult.rows[0].class_paused) {
      return res.status(400).json({ success: false, error: 'Student is already paused' });
    }

    /* Count future bookings that will be cancelled — for confirmation display */
    const countResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM bookings
       WHERE student_id = $1 AND status = 'scheduled' AND is_demo = FALSE AND date >= CURRENT_DATE`,
      [studentId]
    );
    const futureCount = parseInt(countResult.rows[0].cnt);

    /* Get current lessons_completed from active enrolment to remember where to resume */
    const enrolResult = await pool.query(
      `SELECT id, lessons_completed, current_grade FROM enrolments
       WHERE student_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [studentId]
    );
    const enrolment = enrolResult.rows[0];

    /* Cancel all future scheduled paid bookings */
    await pool.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE student_id = $1 AND status = 'scheduled' AND is_demo = FALSE AND date >= CURRENT_DATE`,
      [studentId]
    );

    /* Mark enrolment as paused, store lesson progress */
    if (enrolment) {
      await pool.query(
        `UPDATE enrolments SET
           status = 'paused',
           paused_at = NOW(),
           paused_reason = $2,
           paused_by = $3,
           last_lesson_at_pause = $4
         WHERE id = $1`,
        [enrolment.id, reason.trim(), req.user.id, enrolment.lessons_completed || 0]
      );
    }

    /* Set class_paused flag on student_profiles */
    await pool.query(
      `UPDATE student_profiles SET class_paused = TRUE WHERE user_id = $1`,
      [studentId]
    );

    logger.info(`[PAUSE] Student ${studentId} (${stuResult.rows[0].name}) paused by ${req.user.email}. ${futureCount} bookings cancelled. Reason: ${reason}`);

    res.json({
      success: true,
      studentName: stuResult.rows[0].name,
      bookingsCancelled: futureCount,
      lessonsPausedAt: enrolment ? enrolment.lessons_completed : 0,
    });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   PUT /api/enrollments/students/:studentId/resume
   Resumes a paused student.
   - Creates new bookings from where they left off
   - Sets enrolments.status = 'active'
   - Sets student_profiles.class_paused = FALSE
   - Credits remain exactly as frozen — no change
   Body: { tutorId, schedule: [{weekday, time}], startDate, classLink }
   ══════════════════════════════════════════════ */
router.put('/students/:studentId/resume', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { tutorId, schedule, startDate, classLink } = req.body;

    if (!tutorId)   return res.status(400).json({ success: false, error: 'tutorId required' });
    if (!schedule || !Array.isArray(schedule) || !schedule.length) {
      return res.status(400).json({ success: false, error: 'schedule required (array of {weekday, time})' });
    }
    if (!startDate) return res.status(400).json({ success: false, error: 'startDate required' });

    /* Verify student exists and is paused */
    const stuResult = await pool.query(
      `SELECT u.id, u.name, u.email, sp.credits, sp.class_paused, sp.grade
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'student'`,
      [studentId]
    );
    if (!stuResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    if (!stuResult.rows[0].class_paused) {
      return res.status(400).json({ success: false, error: 'Student is not currently paused' });
    }
    const student = stuResult.rows[0];

    /* Get the enrolment — optional, students without pathway enrolments can still resume */
    const enrolResult = await pool.query(
      `SELECT e.*, p.name AS pathway_name
       FROM enrolments e
       LEFT JOIN pathways p ON p.id = e.pathway_id
       WHERE e.student_id = $1
       ORDER BY CASE WHEN e.status = 'paused' THEN 0 ELSE 1 END, e.created_at DESC LIMIT 1`,
      [studentId]
    );
    const enrolment = enrolResult.rows[0] || null;
    const lessonsCompleted = enrolment ? (enrolment.last_lesson_at_pause || enrolment.lessons_completed || 0) : 0;
    const startingLesson   = lessonsCompleted + 1;

    /* Verify tutor exists */
    const tutorResult = await pool.query('SELECT id, name FROM users WHERE id = $1', [tutorId]);
    if (!tutorResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Tutor not found' });
    }
    const tutorName = tutorResult.rows[0].name;

    /* ── Clash detection: check all new proposed dates against tutor's calendar ── */
    const effectiveStart = startDate;
    for (const slot of schedule) {
      const start = new Date(effectiveStart + 'T12:00:00Z');
      const dayDiff = (slot.weekday - start.getDay() + 7) % 7;
      start.setDate(start.getDate() + dayDiff);
      /* Check first 4 occurrences of each slot */
      for (let w = 0; w < 4; w++) {
        const d = new Date(start);
        d.setDate(d.getDate() + w * 7);
        const dateStr  = d.toISOString().split('T')[0];
        const timeNorm = slot.time.substring(0, 5);
        const clash = await pool.query(
          `SELECT b.date, b.time, u_s.name AS student_name
           FROM bookings b
           LEFT JOIN users u_s ON u_s.id = b.student_id
           WHERE b.tutor_id = $1 AND b.status = 'scheduled'
             AND b.date = $2::date AND b.time = $3::time
             AND b.student_id != $4::uuid
           LIMIT 1`,
          [tutorId, dateStr, timeNorm, studentId]
        );
        if (clash.rows.length) {
          const c = clash.rows[0];
          const fd = new Date(c.date).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
          return res.status(409).json({
            success: false,
            error: `Schedule clash: ${fd} at ${timeNorm} is already booked for ${c.student_name || 'another student'} with this tutor.`,
            clash: { date: dateStr, time: timeNorm, studentName: c.student_name }
          });
        }
      }
    }

    /* ── Get remaining lessons from pathway ── */
    let remainingLessons = [];
    if (enrolment.pathway_id && enrolment.current_grade) {
      const gradeResult = await pool.query(
        `SELECT id FROM pathway_grades WHERE pathway_id = $1 AND grade_number = $2 AND is_active = TRUE LIMIT 1`,
        [enrolment.pathway_id, enrolment.current_grade]
      );
      if (gradeResult.rows.length) {
        const gradeId = gradeResult.rows[0].id;
        const lessonsResult = await pool.query(
          `SELECT id, lesson_number, title FROM pathway_lessons
           WHERE grade_id = $1 AND is_active = TRUE AND lesson_number >= $2
           ORDER BY lesson_number ASC`,
          [gradeId, startingLesson]
        );
        remainingLessons = lessonsResult.rows;
      }
    }

    const totalRemaining = remainingLessons.length || (72 - lessonsCompleted);

    /* ── Generate new booking dates ── */
    const newDates = [];
    const start = new Date(startDate + 'T12:00:00Z');
    const slotStarts = schedule.map(slot => {
      const d = new Date(start);
      const dayDiff = (slot.weekday - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + dayDiff);
      return { ...slot, next: new Date(d) };
    });

    while (newDates.length < totalRemaining) {
      slotStarts.sort((a, b) => a.next - b.next);
      const slot = slotStarts[0];
      newDates.push({ date: slot.next.toISOString().split('T')[0], time: slot.time });
      const nextOcc = new Date(slot.next);
      nextOcc.setDate(nextOcc.getDate() + 7);
      slotStarts[0].next = nextOcc;
    }

    /* ── Create new bookings ── */
    const resolvedLink = classLink || '';
    const createdIds = [];
    for (let i = 0; i < newDates.length; i++) {
      const nd      = newDates[i];
      const lesson  = remainingLessons[i] || null;
      const lessonNum = lesson ? lesson.lesson_number : (startingLesson + i);
      const result = await pool.query(
        `INSERT INTO bookings
           (subject, grade, date, time, class_link, status, is_demo,
            tutor_id, student_id, lesson_name, notes, booked_at, scheduled_at,
            pathway_lesson_id, lesson_number_in_grade)
         VALUES ($1,$2,$3::date,$4::time,$5,'scheduled',FALSE,$6,$7,$8,$9,NOW(),NOW(),$10,$11)
         RETURNING id`,
        [
          'Coding',
          student.grade || `Grade ${enrolment.current_grade || 1}`,
          nd.date,
          nd.time.substring(0, 5),
          resolvedLink,
          tutorId,
          studentId,
          student.name,
          JSON.stringify({
            studentName: student.name,
            email:       student.email || '',
            tutorName,
            classLink:   resolvedLink,
            isPaidClass: true,
            resumed:     true,
            resumedAt:   new Date().toISOString(),
          }),
          lesson ? lesson.id : null,
          lessonNum,
        ]
      );
      createdIds.push(result.rows[0].id);
    }

    /* ── Update enrolment to active ── */
    await pool.query(
      `UPDATE enrolments SET
         status = 'active',
         tutor_id = $2,
         schedule = $3,
         class_link = $4,
         resumed_at = NOW()
       WHERE id = $1`,
      [enrolment.id, tutorId, JSON.stringify(schedule), resolvedLink]
    );

    /* ── Clear class_paused flag ── */
    await pool.query(
      `UPDATE student_profiles SET class_paused = FALSE WHERE user_id = $1`,
      [studentId]
    );

    logger.info(`[RESUME] Student ${studentId} (${student.name}) resumed by ${req.user.email}. ${createdIds.length} bookings created from lesson ${startingLesson}.`);

    res.json({
      success: true,
      studentName: student.name,
      bookingsCreated: createdIds.length,
      resumedFromLesson: startingLesson,
      tutorName,
    });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/enrollments/students/paused
   Returns all currently paused students — for the
   Post-Sales Pause & Resume tab.
   ══════════════════════════════════════════════ */
router.get('/students/paused', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id            AS "studentId",
        u.name          AS "studentName",
        u.email,
        sp.credits,
        sp.grade,
        e.id            AS "enrolmentId",
        e.paused_at     AS "pausedAt",
        e.paused_reason AS "pausedReason",
        e.last_lesson_at_pause AS "lastLesson",
        e.current_grade AS "currentGrade",
        e.pathway_id    AS "pathwayId",
        p.name          AS "pathwayName",
        u_t.name        AS "lastTutorName",
        u_t.id          AS "lastTutorId",
        e.class_link    AS "classLink",
        e.schedule
      FROM student_profiles sp
      JOIN users u        ON u.id = sp.user_id
      LEFT JOIN enrolments e  ON e.student_id = u.id
                             AND e.status IN ('paused','active')
      LEFT JOIN users u_t ON u_t.id = e.tutor_id
      LEFT JOIN pathways p ON p.id = e.pathway_id
      WHERE sp.class_paused = TRUE
      ORDER BY COALESCE(e.paused_at, NOW()) DESC
    `);
    res.json({ success: true, students: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/enrollments/students/active
   Returns all active (non-paused) enrolled students
   with their current enrolment — for the Post-Sales
   Pause & Resume tab (to find who to pause).
   ══════════════════════════════════════════════ */
router.get('/students/active', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id            AS "studentId",
        u.name          AS "studentName",
        u.email,
        sp.credits,
        sp.grade,
        sp.class_paused AS "classPaused",
        e.id            AS "enrolmentId",
        e.status        AS "enrolmentStatus",
        e.lessons_completed AS "lessonsCompleted",
        e.current_grade AS "currentGrade",
        p.name          AS "pathwayName",
        u_t.name        AS "tutorName",
        u_t.id          AS "tutorId"
      FROM users u
      JOIN student_profiles sp ON sp.user_id = u.id
      LEFT JOIN enrolments e ON e.student_id = u.id AND e.status = 'active'
      LEFT JOIN pathways p ON p.id = e.pathway_id
      LEFT JOIN users u_t ON u_t.id = e.tutor_id
      WHERE u.role = 'student'
        AND sp.class_paused = FALSE
      ORDER BY u.name ASC
    `);
    res.json({ success: true, students: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
