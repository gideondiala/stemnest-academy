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
    /* Report details only (e.g. a recording link added later). Ending a class —
       its status, the students' credits and the tutor's pay — goes through
       POST /api/bookings/:id/report, so nothing here changes them. */
    const { bookingId, classQuality, studentInterest, purchasingPower,
            incompleteReason, notes, recordingLink } = req.body;

    if (!bookingId || !/^[0-9a-f-]{36}$/i.test(String(bookingId))) {
      return res.status(400).json({ success: false, error: 'bookingId required' });
    }
    const bResult = await pool.query('SELECT id, tutor_id, status FROM bookings WHERE id = $1', [bookingId]);
    const booking = bResult.rows[0];
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    const isStaff = ['admin', 'super_admin', 'operations'].includes(req.user.role);
    if (!isStaff && booking.tutor_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not your class' });
    }

    /* Fill in the given fields; keep everything else */
    await pool.query(
      `INSERT INTO class_reports
         (booking_id, tutor_id, outcome, class_quality, student_interest,
          purchasing_power, incomplete_reason, notes, recording_link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (booking_id) DO UPDATE SET
         class_quality     = COALESCE(EXCLUDED.class_quality,     class_reports.class_quality),
         student_interest  = COALESCE(EXCLUDED.student_interest,  class_reports.student_interest),
         purchasing_power  = COALESCE(EXCLUDED.purchasing_power,  class_reports.purchasing_power),
         incomplete_reason = COALESCE(EXCLUDED.incomplete_reason, class_reports.incomplete_reason),
         notes             = COALESCE(EXCLUDED.notes,             class_reports.notes),
         recording_link    = COALESCE(EXCLUDED.recording_link,    class_reports.recording_link)`,
      [bookingId, booking.tutor_id || req.user.id, booking.status, classQuality || null, studentInterest || null,
       purchasingPower || null, incompleteReason || null, notes || null, recordingLink || null]
    );

    logger.info(`[SYNC] Class report details saved: booking ${bookingId}`);
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
    /* Late joins are now recorded by the server when the tutor clicks Join
       (POST /api/class-ops/:id/join); only staff may add one by hand. */
    if (!['admin', 'super_admin', 'operations'].includes(req.user.role)) {
      return res.json({ success: true });
    }
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
    /* Only staff may set a balance; tutors may only log a transaction */
    const canSet = ['admin', 'super_admin', 'postsales'].includes(req.user.role);
    if (!canSet && !(req.user.role === 'tutor' && credits === undefined)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    /* Find student by email */
    const userResult = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [studentEmail]
    );
    if (!userResult.rows.length) {
      return res.json({ success: true, message: 'Student not in DB yet — localStorage only' });
    }

    const studentId = userResult.rows[0].id;

    /* Class credits are deducted by the class report itself (POST /api/bookings/:id/report),
       so a tutor's log-only call has nothing left to do. */
    if (!canSet || credits === undefined || isNaN(parseInt(credits))) {
      return res.json({ success: true });
    }

    /* Set the absolute balance, and log the change so the student's credit activity adds up */
    const before = await pool.query('SELECT credits FROM student_profiles WHERE user_id = $1', [studentId]);
    const oldCredits = before.rows.length ? parseInt(before.rows[0].credits || 0, 10) : 0;
    const newCredits = parseInt(credits, 10);
    await pool.query(
      `INSERT INTO student_profiles (user_id, credits)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET credits = $2`,
      [studentId, newCredits]
    );
    if (newCredits !== oldCredits) {
      await pool.query(
        `INSERT INTO credit_transactions (student_id, type, amount, description, booking_id, balance_after, created_by)
         VALUES ($1, 'adjustment', $2, $3, $4, $5, $6)`,
        [studentId, newCredits - oldCredits,
         description || `Balance set to ${newCredits} by ${req.user.email}`,
         bookingId || null, newCredits, req.user.id]
      );
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/sync/dashboard/:role
   Returns all data needed for a dashboard
══════════════════════════════════════════════ */
/* Which logged-in roles may load each dashboard's data.
   The student dashboard only ever returns the caller's own data. */
const DASHBOARD_ACCESS = {
  operations: ['operations'],
  sales:      ['sales', 'presales'],   // presales reads its own (empty) pipeline view
  presales:   ['presales'],
  postsales:  ['postsales'],
  hr:         ['hr'],
  admin:      [],
  student:    ['student'],
  retention:  ['sales'],
};

router.get('/dashboard/:role', requireAuth, async (req, res, next) => {
  try {
    const { role } = req.params;
    const allowed = DASHBOARD_ACCESS[role];
    if (!allowed) return res.status(404).json({ success: false, error: 'Unknown dashboard' });
    if (!['admin', 'super_admin'].includes(req.user.role) && !allowed.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
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
      const [pipeline, bookings, classReports] = await Promise.all([
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
        /* Class reports for all completed demos assigned to this sales person */
        pool.query(`SELECT cr.booking_id, cr.outcome, cr.class_quality,
                           cr.student_interest, cr.purchasing_power, cr.notes, cr.recording_link
                    FROM class_reports cr
                    JOIN bookings b ON b.id = cr.booking_id
                    WHERE b.sales_id = $1
                    ORDER BY cr.created_at DESC`, [userId]),
      ]);
      result.pipeline     = pipeline.rows;
      result.bookings     = bookings.rows;
      result.classReports = classReports.rows;
    }

    if (role === 'presales') {
      const [bookingsResult, availability] = await Promise.all([
        pool.query(
          `SELECT b.*, u_s.name AS student_name, u_s.email AS student_email,
                  u_t.name AS tutor_name, u_t.staff_id AS tutor_staff_id,
                  u_sp.name AS sales_name,
                  cr.outcome, cr.class_quality, cr.student_interest,
                  cr.purchasing_power, cr.notes AS report_notes, cr.recording_link
           FROM bookings b
           LEFT JOIN users u_s  ON u_s.id  = b.student_id
           LEFT JOIN users u_t  ON u_t.id  = b.tutor_id
           LEFT JOIN users u_sp ON u_sp.id = b.sales_id
           LEFT JOIN class_reports cr ON cr.booking_id = b.id
           WHERE b.is_demo = TRUE
           ORDER BY b.booked_at DESC LIMIT 500`
        ),
        pool.query(
          `SELECT ta.tutor_id, ta.date, ta.time_slot, ta.is_booked,
                  u.name AS tutor_name, u.staff_id AS tutor_staff_id
           FROM tutor_availability ta
           JOIN users u ON u.id = ta.tutor_id
           WHERE ta.date >= CURRENT_DATE
             AND ta.date <= CURRENT_DATE + INTERVAL '14 days'
             AND ta.is_booked = FALSE
           ORDER BY ta.tutor_id, ta.date, ta.time_slot`
        ),
      ]);

      result.bookings     = bookingsResult.rows;
      result.availability = availability.rows;
    }

    if (role === 'postsales') {
      /* Run each query independently — one failure must NOT kill the whole response */
      let paymentsRows = [], studentsRows = [], scheduledRows = [], convertedRows = [];

      /* All payments */
      try {
        const r = await pool.query(`
          SELECT p.*, u_s.name AS student_name, u_s.email AS student_email,
                 c.name AS course_name
          FROM payments p
          LEFT JOIN users u_s ON u_s.id = p.student_id
          LEFT JOIN courses c ON c.id   = p.course_id
          ORDER BY p.created_at DESC LIMIT 500`);
        paymentsRows = r.rows;
      } catch(e) { logger.error('[SYNC postsales] payments query failed:', e.message); }

      /* Paid Students — all onboarded students with their pathway and last payment */
      try {
        const r = await pool.query(`
          SELECT
            u.id                                                            AS "studentId",
            u.staff_id                                                      AS "staffId",
            u.name                                                          AS "studentName",
            u.email,
            u.phone,
            u.whatsapp,
            u.date_of_birth                                                 AS "dateOfBirth",
            u.created_at                                                    AS "createdAt",
            sp.grade,
            sp.age,
            sp.credits,
            sp.credits_suspended                                            AS "creditsSuspended",
            sp.class_paused                                                 AS "classPaused",
            sp.enrolled_at                                                  AS "enrolledAt",
            sp.parent_name                                                  AS "parentName",
            sp.parent_email                                                 AS "parentEmail",
            pw.name                                                         AS "pathwayName",
            e.pathway_id                                                    AS "pathwayId",
            e.id                                                            AS "enrolmentId",
            u.timezone,
            e.current_grade                                                 AS "currentGrade",
            e.lessons_completed                                             AS "lessonsCompleted",
            e.status                                                        AS "enrolmentStatus",
            u_t.name                                                        AS "tutorName",
            (SELECT pm.amount   FROM payments pm WHERE pm.student_id = u.id ORDER BY pm.created_at DESC LIMIT 1) AS "amountPaid",
            (SELECT pm.currency FROM payments pm WHERE pm.student_id = u.id ORDER BY pm.created_at DESC LIMIT 1) AS "amountCurrency",
            /* Every pathway the student takes (a student can take several) */
            (SELECT COALESCE(json_agg(json_build_object(
                      'enrolmentId', en2.id, 'pathwayId', en2.pathway_id, 'pathwayName', pw2.name,
                      'grade', en2.current_grade, 'lessonsCompleted', en2.lessons_completed,
                      'status', en2.status, 'tutorName', t2.name) ORDER BY en2.created_at), '[]'::json)
             FROM enrolments en2
             LEFT JOIN pathways pw2 ON pw2.id = en2.pathway_id
             LEFT JOIN users t2 ON t2.id = en2.tutor_id
             WHERE en2.student_id = u.id AND en2.status IN ('active','paused')) AS "pathways",
            /* Groups of upcoming 1-on-1 classes not linked to a pathway yet */
            (SELECT COUNT(DISTINCT COALESCE(bx.tutor_id::text, '') || '|' || COALESCE(bx.class_link, ''))::int
             FROM bookings bx
             WHERE bx.student_id = u.id AND bx.enrolment_id IS NULL AND bx.batch_id IS NULL AND bx.is_demo = FALSE
               AND bx.status = 'scheduled' AND bx.date >= CURRENT_DATE) AS "unlinkedTracks"
          FROM users u
          LEFT JOIN student_profiles sp ON sp.user_id  = u.id
          /* One row per student: their most recent live enrolment */
          LEFT JOIN LATERAL (
            SELECT * FROM enrolments en
            WHERE en.student_id = u.id AND en.status IN ('active','paused')
            ORDER BY en.created_at DESC LIMIT 1
          ) e ON TRUE
          LEFT JOIN pathways pw         ON pw.id = e.pathway_id
          LEFT JOIN users u_t           ON u_t.id = e.tutor_id
          WHERE u.role = 'student'
            AND u.is_active = TRUE
          ORDER BY COALESCE(sp.enrolled_at, u.created_at) DESC
        `);
        studentsRows = r.rows;
      } catch(e) { logger.error('[SYNC postsales] students query failed:', e.message); }

      /* Scheduled students */
      try {
        const r = await pool.query(`
          SELECT
            b.student_id                                                    AS "studentId",
            u_s.name                                                        AS "studentName",
            u_s.email,
            b.subject                                                       AS course,
            COALESCE(pw.name, b.subject)                                    AS pathway,
            u_t.name                                                        AS "tutorName",
            u_t.id                                                          AS "tutorId",
            MIN(b.date)                                                     AS "nextDate",
            (SELECT bx.time FROM bookings bx
               WHERE bx.student_id = b.student_id
                 AND bx.status = 'scheduled' AND bx.is_demo = FALSE
                 AND bx.date = MIN(b.date) LIMIT 1)                         AS "nextTime",
            COUNT(*)                                                        AS "remainingCount",
            MAX(b.class_link)                                               AS "classLink",
            (SELECT MIN(bf.date) FROM bookings bf
               WHERE bf.student_id = b.student_id
                 AND bf.is_demo = FALSE AND bf.status != 'cancelled')       AS "firstClassDate",
            (SELECT bf2.time FROM bookings bf2
               WHERE bf2.student_id = b.student_id
                 AND bf2.is_demo = FALSE AND bf2.status != 'cancelled'
               ORDER BY bf2.date ASC LIMIT 1)                               AS "firstClassTime"
          FROM bookings b
          LEFT JOIN users u_s           ON u_s.id = b.student_id
          LEFT JOIN users u_t           ON u_t.id = b.tutor_id
          LEFT JOIN pathway_lessons pl  ON pl.id  = b.pathway_lesson_id
          LEFT JOIN pathway_grades  pg  ON pg.id  = pl.grade_id
          LEFT JOIN pathways        pw  ON pw.id  = pg.pathway_id
          WHERE b.status = 'scheduled'
            AND b.is_demo = FALSE
            AND b.student_id IS NOT NULL
            AND b.date >= CURRENT_DATE
          GROUP BY b.student_id, u_s.name, u_s.email, b.subject, u_t.name, u_t.id, pw.name
          ORDER BY MIN(b.date) ASC
        `);
        scheduledRows = r.rows;
      } catch(e) { logger.error('[SYNC postsales] scheduled query failed:', e.message); }

      /* Converted students from pipeline */
      try {
        const r = await pool.query(`
          SELECT
            pl.id                                                           AS "pipelineId",
            pl.booking_id                                                   AS "bookingId",
            pl.student_name                                                 AS "studentName",
            pl.course_pitched                                               AS "coursePitched",
            pl.payment_amount                                               AS "paymentAmount",
            pl.notes,
            pl.status,
            pl.created_at                                                   AS "convertedAt",
            u_s.id                                                          AS "studentId",
            u_s.email                                                       AS "studentEmail",
            u_s.phone                                                       AS "studentPhone",
            u_s.date_of_birth                                               AS "dateOfBirth",
            u_s.staff_id                                                    AS "staffId",
            sp.grade,
            sp.age,
            sp.parent_name                                                  AS "parentName",
            sp.credits,
            sp2.name                                                        AS "salesPersonName",
            b.subject,
            b.date                                                          AS "demoDate",
            pw.name                                                         AS "pathwayName",
            e.schedule                                                      AS "learningSchedule",
            u_t.name                                                        AS "tutorName",
            cr.student_interest                                             AS "studentInterest",
            cr.purchasing_power                                             AS "purchasingPower"
          FROM pipeline pl
          LEFT JOIN bookings b              ON b.id   = pl.booking_id
          LEFT JOIN users u_s               ON u_s.id = b.student_id
          LEFT JOIN student_profiles sp     ON sp.user_id = u_s.id
          LEFT JOIN users sp2               ON sp2.id = pl.sales_id
          LEFT JOIN enrolments e            ON e.student_id = u_s.id AND e.status IN ('active','paused')
          LEFT JOIN pathways pw             ON pw.id = e.pathway_id
          LEFT JOIN users u_t               ON u_t.id = e.tutor_id
          LEFT JOIN class_reports cr        ON cr.booking_id = pl.booking_id
          WHERE pl.status IN ('converted','paid')
          ORDER BY pl.created_at DESC
          LIMIT 500
        `);
        convertedRows = r.rows;
      } catch(e) { logger.error('[SYNC postsales] converted query failed:', e.message); }

      result.payments          = paymentsRows;
      result.students          = studentsRows;
      result.scheduledStudents = scheduledRows;
      result.convertedStudents = convertedRows;
    }

    if (role === 'hr') {
      const [applications, interviews, trainings, jobAdverts] = await Promise.all([
        pool.query(`SELECT * FROM applications ORDER BY applied_at DESC LIMIT 500`),
        pool.query(`SELECT * FROM interviews ORDER BY created_at DESC LIMIT 500`),
        pool.query(`SELECT * FROM trainings ORDER BY created_at DESC LIMIT 500`),
        pool.query(`SELECT * FROM job_adverts ORDER BY created_at DESC LIMIT 500`)
      ]);
      result.applications = applications.rows;
      result.interviews   = interviews.rows;
      result.trainings    = trainings.rows;
      result.jobAdverts   = jobAdverts.rows;
    }

    if (role === 'admin') {
      const [bookings, classReports, pipelines, courses, tutors, sales] = await Promise.all([
        pool.query(`SELECT b.*, u_s.name AS student_name, u_s.email AS student_email,
                           u_t.name AS tutor_name, u_sp.name AS sales_name
                    FROM bookings b
                    LEFT JOIN users u_s  ON u_s.id  = b.student_id
                    LEFT JOIN users u_t  ON u_t.id  = b.tutor_id
                    LEFT JOIN users u_sp ON u_sp.id = b.sales_id
                    ORDER BY b.date DESC LIMIT 1000`),
        pool.query(`SELECT cr.*, u.name AS tutor_name, b.date, b.time, b.subject
                    FROM class_reports cr
                    LEFT JOIN users u ON u.id = cr.tutor_id
                    LEFT JOIN bookings b ON b.id = cr.booking_id
                    ORDER BY cr.created_at DESC LIMIT 500`),
        pool.query(`SELECT p.*, b.date, b.time, b.subject,
                           u_s.name AS student_name
                    FROM pipeline p
                    LEFT JOIN bookings b ON b.id = p.booking_id
                    LEFT JOIN users u_s ON u_s.id = b.student_id
                    ORDER BY p.updated_at DESC LIMIT 500`),
        pool.query(`SELECT * FROM courses ORDER BY name ASC`),
        pool.query(`SELECT u.id, u.staff_id, u.name, u.email, u.phone, u.whatsapp, u.is_active,
                           tp.subject, tp.courses, tp.grade_groups, tp.availability
                    FROM users u
                    LEFT JOIN tutor_profiles tp ON tp.user_id = u.id
                    WHERE u.role = 'tutor' ORDER BY u.name ASC`),
        pool.query(`SELECT id, name, email, phone, whatsapp, is_active FROM users WHERE role = 'sales' ORDER BY name ASC`)
      ]);
      result.bookings     = bookings.rows;
      result.classReports = classReports.rows;
      result.pipelines    = pipelines.rows;
      result.courses      = courses.rows;
      result.materials    = []; // companion_materials table may not exist yet
      result.tutors       = tutors.rows;
      result.sales        = sales.rows;
    }

    if (role === 'student') {
      /* Upcoming and past bookings are fetched separately so a long
         history can never push upcoming classes out of the result. */
      const studentBookingsSql = (dateFilter, order, limit) => `SELECT b.*,
                           u_t.name AS tutor_name, u_t.photo_url AS tutor_photo,
                           pl.title AS pathway_lesson_title,
                           pl.unit_id AS unit_id,
                           pl.task1_link, pl.task2_link,
                           pl.homework1, pl.homework2,
                           pl.learning_objectives, pl.concept_discovery,
                           pl.task1_description, pl.task2_description,
                           pl.debrief, pl.what_comes_next,
                           pl.lesson_number AS pathway_lesson_number,
                           pl.session_type,
                           /* Which pathway the class belongs to (a student can take several) */
                           COALESCE(pw_e.name, pw_l.name, pw_b.name) AS pathway_name,
                           COALESCE(pw_e.emoji, pw_l.emoji, pw_b.emoji) AS pathway_emoji
                    FROM bookings b
                    LEFT JOIN users u_t ON u_t.id = b.tutor_id
                    LEFT JOIN pathway_lessons pl ON pl.id = b.pathway_lesson_id
                    LEFT JOIN enrolments en_b ON en_b.id = b.enrolment_id
                    LEFT JOIN pathways pw_e ON pw_e.id = en_b.pathway_id
                    LEFT JOIN pathway_grades pg_l ON pg_l.id = pl.grade_id
                    LEFT JOIN pathways pw_l ON pw_l.id = pg_l.pathway_id
                    LEFT JOIN batches bt_b ON bt_b.id = b.batch_id
                    LEFT JOIN pathways pw_b ON pw_b.id = bt_b.pathway_id
                    WHERE (b.student_id = $1
                       OR b.batch_id IN (
                         SELECT bm.batch_id FROM batch_members bm
                         LEFT JOIN student_profiles spb ON spb.user_id = bm.student_id
                         WHERE bm.student_id = $1 AND bm.status = 'active'
                           AND (COALESCE(spb.class_paused, FALSE) = FALSE OR b.date < CURRENT_DATE)
                       ))
                      AND ${dateFilter}
                    ORDER BY ${order} LIMIT ${limit}`;
      const [upcomingBookings, pastBookings, topups, courses, students, projects, enrolments, quizAttempts, certificates] = await Promise.all([
        pool.query(studentBookingsSql(`b.date >= CURRENT_DATE - 1`, 'b.date ASC, b.time ASC', 200), [userId]),
        pool.query(studentBookingsSql(`b.date <  CURRENT_DATE - 1`, 'b.date DESC, b.time DESC', 300), [userId]),
        pool.query(`SELECT * FROM payments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]),
        pool.query(`SELECT c.* FROM courses c
                    JOIN enrolments e ON e.course_id = c.id
                    WHERE e.student_id = $1`, [userId]),
        pool.query(`SELECT u.id, u.name, u.email, u.phone, u.whatsapp, u.staff_id,
                           sp.grade, sp.age, sp.credits, sp.credits_suspended, sp.class_paused, sp.enrolled_at, sp.parent_name, sp.parent_email
                    FROM users u
                    LEFT JOIN student_profiles sp ON sp.user_id = u.id
                    WHERE u.id = $1`, [userId]),
        pool.query(`SELECT p.id, p.title, p.brief, p.due_date, p.due_at, p.status, p.kind,
                           p.submission, p.submission_note, p.remarks, p.score, p.points, p.is_late,
                           p.submitted_at, p.reviewed_at, p.booking_id, p.lesson_id,
                           COALESCE(pw.name, c.name) AS course_name, pl.lesson_number, u_t.name AS tutor_name
                    FROM projects p
                    LEFT JOIN courses c ON c.id = p.course_id
                    LEFT JOIN pathway_lessons pl ON pl.id = p.lesson_id
                    LEFT JOIN pathway_grades pgx ON pgx.id = pl.grade_id
                    LEFT JOIN pathways pw ON pw.id = pgx.pathway_id
                    LEFT JOIN users u_t ON u_t.id = p.tutor_id
                    WHERE p.student_id = $1
                    ORDER BY p.created_at DESC LIMIT 100`, [userId]).catch(() => ({ rows: [] })),
        pool.query(`SELECT e.*,
                           p.name AS pathway_name, p.emoji AS pathway_emoji,
                           pg.grade_number AS current_grade_number,
                           pg.name AS current_grade_name,
                           pg.total_lessons,
                           u_te.name AS tutor_name
                    FROM enrolments e
                    LEFT JOIN users u_te ON u_te.id = e.tutor_id
                    LEFT JOIN pathways p ON p.id = e.pathway_id
                    LEFT JOIN pathway_grades pg ON pg.pathway_id = e.pathway_id
                                                AND pg.grade_number = e.current_grade
                    WHERE e.student_id = $1
                    ORDER BY e.created_at DESC`, [userId]).catch(() => ({ rows: [] })),
        /* Unit quizzes assigned to the student (3 attempts, best counts) with their latest attempt */
        pool.query(`SELECT qas.quiz_id, qas.assigned_at, qas.due_at, qas.attempts_used, qas.best_score,
                           qas.best_percentage, qas.points, qas.passed AS ever_passed, qas.last_attempt_at,
                           qa.score, qa.total, qa.percentage, qa.passed, qa.submitted_at,
                           uq.unit_name, uq.grade_number, uq.unit_number, uq.pass_score, uq.total_questions,
                           p.name AS pathway_name
                    FROM quiz_assignments qas
                    JOIN unit_quizzes uq ON uq.id = qas.quiz_id
                    LEFT JOIN quiz_attempts qa ON qa.quiz_id = qas.quiz_id AND qa.student_id = qas.student_id
                    LEFT JOIN pathways p ON p.id = uq.pathway_id
                    WHERE qas.student_id = $1
                    ORDER BY qas.assigned_at DESC`, [userId]).catch(() => ({ rows: [] })),
        /* Certificates earned */
        pool.query(`SELECT c.id, c.pathway_name, c.grade_number, c.grade_name,
                           c.issued_at, c.certificate_url
                    FROM certificates c
                    WHERE c.student_id = $1
                    ORDER BY c.issued_at DESC`, [userId]).catch(() => ({ rows: [] })),
      ]);
      result.bookings      = pastBookings.rows.reverse().concat(upcomingBookings.rows);
      result.payments      = topups.rows;
      result.topups        = topups.rows;
      result.courses       = courses.rows;
      result.students      = students.rows;
      result.projects      = projects.rows;
      result.enrolments    = enrolments.rows;
      result.quizAttempts  = quizAttempts.rows;
      result.certificates  = certificates.rows;
    }

    if (role === 'retention') {
      /* Return students assigned to this sales person with ≤ 2 credits */
      const retentionResult = await pool.query(
        `SELECT DISTINCT ON (u_s.id)
                u_s.id AS student_id,
                u_s.name AS student_name,
                sp.parent_email AS email,
                sp.parent_name,
                sp.credits,
                sp.credits_suspended AS suspended,
                b.subject,
                b.notes
         FROM bookings b
         JOIN users u_s ON u_s.id = b.student_id
         JOIN student_profiles sp ON sp.user_id = b.student_id
         WHERE b.sales_id = $1
           AND b.student_id IS NOT NULL
           AND sp.credits <= 2
           AND u_s.is_active = TRUE
         ORDER BY u_s.id, sp.credits ASC
         LIMIT 100`,
        [userId]
      );

      /* Add whatsapp from booking notes */
      const alerts = retentionResult.rows.map(r => {
        let whatsapp = '—';
        try {
          const notes = typeof r.notes === 'string' ? JSON.parse(r.notes || '{}') : (r.notes || {});
          whatsapp = notes.whatsapp || '—';
          if (!r.email) r.email = notes.email || '';
        } catch {}
        return { ...r, whatsapp };
      });

      result.retentionAlerts = alerts;
    }

    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

module.exports = router;
