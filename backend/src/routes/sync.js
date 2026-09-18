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

    /* Update booking status and notes */
    const bResult = await pool.query('SELECT student_id, notes FROM bookings WHERE id = $1', [bookingId]);
    const booking = bResult.rows[0];
    
    let bNotesObj = {};
    if (booking && booking.notes) {
      try { bNotesObj = JSON.parse(booking.notes); } catch(e) {}
    }
    if (outcome === 'incomplete' && incompleteReason) {
      bNotesObj.incompleteReason = incompleteReason;
    }

    await pool.query(
      `UPDATE bookings SET status = $1, completed_at = NOW(), notes = $3 WHERE id = $2`,
      [outcome, bookingId, Object.keys(bNotesObj).length > 0 ? JSON.stringify(bNotesObj) : null]
    ).catch(() => {});

    /* Deduct student credit if completed */
    if (creditDeducted && (outcome === 'completed' || outcome === 'partially_completed')) {
      const studentId = booking?.student_id;
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
            e.current_grade                                                 AS "currentGrade",
            e.lessons_completed                                             AS "lessonsCompleted",
            e.status                                                        AS "enrolmentStatus",
            u_t.name                                                        AS "tutorName",
            (SELECT pm.amount   FROM payments pm WHERE pm.student_id = u.id ORDER BY pm.created_at DESC LIMIT 1) AS "amountPaid",
            (SELECT pm.currency FROM payments pm WHERE pm.student_id = u.id ORDER BY pm.created_at DESC LIMIT 1) AS "amountCurrency"
          FROM users u
          LEFT JOIN student_profiles sp ON sp.user_id  = u.id
          LEFT JOIN enrolments e        ON e.student_id = u.id
                                       AND e.status IN ('active','paused')
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
      const [bookings, topups, courses, students, projects, enrolments, quizAttempts, certificates] = await Promise.all([
        pool.query(`SELECT b.*,
                           u_t.name AS tutor_name, u_t.photo_url AS tutor_photo,
                           pl.title AS pathway_lesson_title,
                           pl.unit_id AS unit_id,
                           pl.task1_link, pl.task2_link,
                           pl.homework1, pl.homework2,
                           pl.learning_objectives, pl.concept_discovery,
                           pl.task1_description, pl.task2_description,
                           pl.debrief, pl.what_comes_next,
                           pl.lesson_number AS pathway_lesson_number,
                           pl.session_type
                    FROM bookings b
                    LEFT JOIN users u_t ON u_t.id = b.tutor_id
                    LEFT JOIN pathway_lessons pl ON pl.id = b.pathway_lesson_id
                    WHERE b.student_id = $1
                       OR b.batch_id IN (
                         SELECT bm.batch_id FROM batch_members bm
                         WHERE bm.student_id = $1 AND bm.status = 'active'
                       )
                    ORDER BY b.date ASC LIMIT 200`, [userId]),
        pool.query(`SELECT * FROM payments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]),
        pool.query(`SELECT c.* FROM courses c
                    JOIN enrolments e ON e.course_id = c.id
                    WHERE e.student_id = $1`, [userId]),
        pool.query(`SELECT u.id, u.name, u.email, u.phone, u.whatsapp, u.staff_id,
                           sp.grade, sp.age, sp.credits, sp.credits_suspended, sp.class_paused, sp.enrolled_at, sp.parent_name, sp.parent_email
                    FROM users u
                    LEFT JOIN student_profiles sp ON sp.user_id = u.id
                    WHERE u.id = $1`, [userId]),
        pool.query(`SELECT p.id, p.title, p.brief, p.due_date, p.status,
                           p.submission, p.remarks, p.score, p.submitted_at, p.reviewed_at,
                           c.name AS course_name
                    FROM projects p
                    LEFT JOIN courses c ON c.id = p.course_id
                    WHERE p.student_id = $1
                    ORDER BY p.created_at DESC LIMIT 100`, [userId]).catch(() => ({ rows: [] })),
        pool.query(`SELECT e.*,
                           p.name AS pathway_name, p.emoji AS pathway_emoji,
                           pg.grade_number AS current_grade_number,
                           pg.name AS current_grade_name,
                           pg.total_lessons
                    FROM enrolments e
                    LEFT JOIN pathways p ON p.id = e.pathway_id
                    LEFT JOIN pathway_grades pg ON pg.pathway_id = e.pathway_id
                                                AND pg.grade_number = e.current_grade
                    WHERE e.student_id = $1
                    ORDER BY e.created_at DESC`, [userId]).catch(() => ({ rows: [] })),
        /* Quiz attempts — for the student's quizzes tab */
        pool.query(`SELECT qa.id, qa.score, qa.total, qa.percentage, qa.passed,
                           qa.submitted_at, qa.quiz_id,
                           uq.unit_name, uq.grade_number, uq.unit_number, uq.pass_score,
                           p.name AS pathway_name
                    FROM quiz_attempts qa
                    JOIN unit_quizzes uq ON uq.id = qa.quiz_id
                    LEFT JOIN pathways p ON p.id = uq.pathway_id
                    WHERE qa.student_id = $1
                    ORDER BY qa.submitted_at DESC`, [userId]).catch(() => ({ rows: [] })),
        /* Certificates earned */
        pool.query(`SELECT c.id, c.pathway_name, c.grade_number, c.grade_name,
                           c.issued_at, c.certificate_url
                    FROM certificates c
                    WHERE c.student_id = $1
                    ORDER BY c.issued_at DESC`, [userId]).catch(() => ({ rows: [] })),
      ]);
      result.bookings      = bookings.rows;
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
