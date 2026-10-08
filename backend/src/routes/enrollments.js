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
const pauseSvc = require('../services/pauseService');

const router = express.Router();

/* ══════════════════════════════════════════════
   ENROLLMENT REQUESTS (from website Enrol Now)
══════════════════════════════════════════════ */

/* POST /api/enrollments/request — public */
router.post('/request', async (req, res, next) => {
  try {
    const { studentName, age, email, phone, timezone, courseId, courseName, coursePrice, notes,
            pathway_id, pathway_name, grade_number, has_device, expected_start, ref } = req.body;
    if (!studentName) return res.status(400).json({ success: false, error: 'studentName required' });
    if (!email && !phone) return res.status(400).json({ success: false, error: 'email or phone required' });
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const result = await pool.query(
      `INSERT INTO enrollment_requests
         (student_name, age, email, phone, timezone, course_id, course_name, course_price, notes, source,
          pathway_id, pathway_name, grade_number, has_device, expected_start, payment_status, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'website',$10,$11,$12,$13,$14,'pending','pending')
       RETURNING id`,
      [String(studentName).slice(0, 200), age||null, email||null, phone||null, timezone||null,
       courseId ? String(courseId).slice(0, 100) : null, courseName||null, parseFloat(coursePrice)||null, notes||null,
       uuidRe.test(pathway_id || '') ? pathway_id : null, pathway_name || null,
       parseInt(grade_number, 10) || null, typeof has_device === 'boolean' ? has_device : null,
       /^\d{4}-\d{2}-\d{2}$/.test(expected_start || '') ? expected_start : null]
    );

    const promoterId = await require('../services/promoterService').idForCode(pool, ref).catch(() => null);
    if (promoterId) await pool.query('UPDATE enrollment_requests SET promoter_id = $1 WHERE id = $2', [promoterId, result.rows[0].id]).catch(() => {});

    logger.info(`[ENROLLMENT REQUEST] ${studentName} → ${courseName}`);
    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) { next(err); }
});

/* POST /api/enrollments/handover — Pre-Sales hands a demo student to Post-Sales.
   Creates (once per demo booking) an enrollment request carrying everything
   captured at booking, so Post-Sales never retypes it. */
router.post('/handover', requireAuth, requireRole('presales','admin','super_admin'), async (req, res, next) => {
  try {
    const { bookingId } = req.body || {};
    if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId required' });

    const b = await pool.query(
      `SELECT id, subject, grade, notes, lesson_name, is_demo, promoter_id FROM bookings WHERE id = $1`, [bookingId]);
    if (!b.rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
    const booking = b.rows[0];
    let n = {};
    try { n = typeof booking.notes === 'string' ? JSON.parse(booking.notes || '{}') : (booking.notes || {}); } catch {}

    /* Already paid through a payment link for this demo? */
    const paid = await pool.query(
      `SELECT 1 FROM payments WHERE status = 'confirmed' AND notes LIKE $1 LIMIT 1`, ['%' + bookingId + '%']);

    const ins = await pool.query(
      `INSERT INTO enrollment_requests
         (student_name, parent_name, email, whatsapp, phone, age, grade, gender, country, subject,
          device, timezone, notes, source, status, payment_status, booking_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'presales','pending',$14,$15)
       ON CONFLICT (booking_id) WHERE booking_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [n.studentName || booking.lesson_name || 'Student', n.parentName || null,
       n.email || null, n.whatsapp || null, n.phone || n.whatsapp || null,
       n.age != null ? String(n.age) : null, booking.grade || n.grade || null,
       n.gender || null, n.country || null, booking.subject || null, n.device || null,
       n.timezone || null, (req.body.note || n.psNote || null),
       paid.rows.length ? 'received' : 'pending', bookingId]
    );

    if (booking.promoter_id) {
      await pool.query('UPDATE enrollment_requests SET promoter_id = $1 WHERE booking_id = $2 AND promoter_id IS NULL', [booking.promoter_id, bookingId]).catch(() => {});
    }
    n.handedOverAt = new Date().toISOString();
    n.handedOverBy = req.user.email;
    await pool.query('UPDATE bookings SET notes = $1 WHERE id = $2', [JSON.stringify(n), bookingId]);

    logger.info(`[HANDOVER] Demo ${bookingId} → Post-Sales by ${req.user.email}`);
    res.json({ success: true, alreadyHandedOver: !ins.rows.length, requestId: ins.rows[0]?.id || null });
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
   PAUSE & RESUME
   Booking date/time are WAT. Both routes run in a single transaction.
   ══════════════════════════════════════════════ */

/** Run fn(client) in a transaction; a thrown {status, message} becomes that HTTP error. */
async function _withTx(res, next, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const body = await fn(client);
    await client.query('COMMIT');
    res.json(body);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.status) return res.status(err.status).json({ success: false, error: err.message, ...(err.extra || {}) });
    next(err);
  } finally {
    client.release();
  }
}

/* ══════════════════════════════════════════════
   PUT /api/enrollments/students/:studentId/pause   { reason }
   Cancels the student's future 1-on-1 classes (tagged so resume can bring
   back exactly those lessons) and records the pause. Credits are untouched.
   ══════════════════════════════════════════════ */
router.put('/students/:studentId/pause', requireAuth, requireRole('admin','super_admin','postsales'), (req, res, next) => {
  const { studentId } = req.params;
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!reason) return res.status(400).json({ success: false, error: 'A pause reason is required' });

  _withTx(res, next, async (client) => {
    const out = await pauseSvc.pauseStudent(client, studentId, { reason, byUserId: req.user.id, kind: 'manual' });
    logger.info(`[PAUSE] ${out.studentName} (${studentId}) paused by ${req.user.email}. ${out.bookingsCancelled} classes cancelled. Reason: ${reason}`);
    return out;
  });
});

/* ══════════════════════════════════════════════
   PUT /api/enrollments/students/:studentId/resume
   Body: { startDate, keepSchedule = true, tutorId?, schedule?, classLink? }
   See pauseService.resumeStudent.
   ══════════════════════════════════════════════ */
router.put('/students/:studentId/resume', requireAuth, requireRole('admin','super_admin','postsales'), (req, res, next) => {
  const { studentId } = req.params;
  const { startDate, tutorId, classLink } = req.body || {};
  const keepSchedule = req.body && req.body.keepSchedule !== false;

  let schedule = null;
  if (!keepSchedule || Array.isArray(req.body.schedule)) {
    schedule = (req.body.schedule || []).map(s => ({
      weekday: Number(s.weekday),
      time: String(s.time || '').slice(0, 5),
    })).filter(s => s.weekday >= 0 && s.weekday <= 6 && /^\d{2}:\d{2}$/.test(s.time));
  }

  _withTx(res, next, async (client) => {
    const out = await pauseSvc.resumeStudent(client, studentId, { startDate, keepSchedule, tutorId, schedule, classLink });
    logger.info(`[RESUME] ${out.studentName} (${studentId}) resumed by ${req.user.email}: ${out.classes} classes ${out.mode} from ${out.firstClass && out.firstClass.date}`);
    return out;
  });
});

/* ══════════════════════════════════════════════
   GET /api/enrollments/students/paused
   Every paused student — for the Post-Sales Pause & Resume tab.
   ══════════════════════════════════════════════ */
router.get('/students/paused', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (u.id)
        u.id            AS "studentId",
        u.name          AS "studentName",
        u.email,
        sp.credits,
        sp.grade,
        e.id            AS "enrolmentId",
        COALESCE(sp.paused_at, e.paused_at)         AS "pausedAt",
        COALESCE(sp.paused_reason, e.paused_reason) AS "pausedReason",
        sp.pause_kind   AS "pauseKind",
        e.last_lesson_at_pause AS "lastLesson",
        e.current_grade AS "currentGrade",
        e.pathway_id    AS "pathwayId",
        p.name          AS "pathwayName",
        COALESCE(u_t.name, u_lt.name) AS "lastTutorName",
        COALESCE(u_t.id,   u_lt.id)   AS "lastTutorId",
        COALESCE(e.class_link, lb.class_link) AS "classLink",
        e.schedule,
        (SELECT COUNT(*)::int FROM bookings bx
          WHERE bx.student_id = u.id AND bx.status = 'cancelled'
            AND bx.notes->>'cancelledByPause' IS NOT NULL) AS "pausedClasses"
      FROM student_profiles sp
      JOIN users u ON u.id = sp.user_id
      LEFT JOIN enrolments e ON e.student_id = u.id AND e.status IN ('paused','active')
      LEFT JOIN users u_t ON u_t.id = e.tutor_id
      LEFT JOIN pathways p ON p.id = e.pathway_id
      LEFT JOIN LATERAL (
        SELECT tutor_id, class_link FROM bookings
        WHERE student_id = u.id AND is_demo = FALSE ORDER BY date DESC, time DESC LIMIT 1
      ) lb ON TRUE
      LEFT JOIN users u_lt ON u_lt.id = lb.tutor_id
      WHERE sp.class_paused = TRUE
      ORDER BY u.id, (e.status = 'paused') DESC
    `);
    result.rows.sort((a, b) => new Date(b.pausedAt || 0) - new Date(a.pausedAt || 0));
    res.json({ success: true, students: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/enrollments/students/active
   Every student who is not paused — for the Post-Sales
   Pause & Resume tab (to find who to pause).
   ══════════════════════════════════════════════ */
router.get('/students/active', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (u.id)
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
        AND COALESCE(sp.class_paused, FALSE) = FALSE
      ORDER BY u.id, e.created_at DESC
    `);
    result.rows.sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)));
    res.json({ success: true, students: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/enrollments/board — Post-Sales stage board
   Leads waiting to be onboarded, and every student's stage:
   awaiting_schedule → active → on_hold_credits / paused.
   ══════════════════════════════════════════════ */
router.get('/board', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const [requests, referrals, students] = await Promise.all([
      pool.query(
        `SELECT id, student_name AS "studentName", email, phone, whatsapp, source, payment_status AS "paymentStatus",
                pathway_name AS "pathwayName", created_at AS "createdAt"
         FROM enrollment_requests WHERE COALESCE(status, 'pending') NOT IN ('processed', 'closed')
         ORDER BY created_at DESC LIMIT 300`),
      pool.query(
        `SELECT id, student_name AS "studentName", parent_email AS email, parent_phone AS phone,
                referrer_name AS "referrerName", created_at AS "createdAt"
         FROM referrals WHERE status = 'postsales' ORDER BY created_at DESC LIMIT 300`).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT u.id AS "studentId", u.staff_id AS "staffId", u.name AS "studentName", u.email,
                sp.credits, COALESCE(sp.class_paused, FALSE) AS paused, sp.pause_kind AS "pauseKind",
                sp.paused_reason AS "pausedReason", sp.paused_at AS "pausedAt", u.created_at AS "createdAt",
                e.pathway_name AS "pathwayName", e.current_grade AS "currentGrade",
                nx.next_date AS "nextDate", nx.next_time AS "nextTime", nx.upcoming,
                (SELECT MAX(b2.date) FROM bookings b2 WHERE b2.student_id = u.id AND b2.is_demo = FALSE
                   AND b2.status IN ('completed','partially_completed')) AS "lastClassDate"
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN LATERAL (
           /* All the student's pathways, e.g. "Data Science + AI & Automation" */
           SELECT string_agg(p.name, ' + ' ORDER BY en.created_at) AS pathway_name,
                  (array_agg(en.current_grade ORDER BY en.created_at DESC))[1] AS current_grade
           FROM enrolments en
           LEFT JOIN pathways p ON p.id = en.pathway_id
           WHERE en.student_id = u.id AND en.status IN ('active','paused')
         ) e ON TRUE
         LEFT JOIN LATERAL (
           SELECT to_char(MIN(b.date + b.time), 'YYYY-MM-DD') AS next_date,
                  to_char(MIN(b.date + b.time), 'HH24:MI')    AS next_time,
                  COUNT(*)::int AS upcoming
           FROM bookings b
           WHERE b.status = 'scheduled' AND b.date >= CURRENT_DATE AND b.is_demo = FALSE
             AND (b.student_id = u.id OR b.batch_id IN (
                   SELECT bm.batch_id FROM batch_members bm WHERE bm.student_id = u.id AND bm.status = 'active'))
         ) nx ON TRUE
         WHERE u.role = 'student' AND u.is_active = TRUE
         ORDER BY u.created_at DESC`),
    ]);

    const rows = students.rows.map(s => {
      let stage;
      if (s.paused) stage = s.pauseKind === 'credits' ? 'on_hold_credits' : 'paused';
      else if (s.upcoming > 0) stage = 'active';
      else stage = 'awaiting_schedule';
      return { ...s, stage, lowCredit: !s.paused && (s.credits || 0) <= 2 };
    });
    const count = st => rows.filter(r => r.stage === st).length;

    res.json({
      success: true,
      leads: {
        handovers: requests.rows.filter(r => r.source === 'presales'),
        website:   requests.rows.filter(r => r.source === 'website' || !r.source),
        other:     requests.rows.filter(r => r.source && !['presales', 'website'].includes(r.source)),
        referrals: referrals.rows,
      },
      students: rows,
      counts: {
        leads: requests.rows.length + referrals.rows.length,
        awaitingSchedule: count('awaiting_schedule'),
        active: count('active'),
        onHoldCredits: count('on_hold_credits'),
        paused: count('paused'),
        lowCredit: rows.filter(r => r.lowCredit && r.stage === 'active').length,
      },
    });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   A student's pathways (tracks)
   GET  /students/:studentId/tracks       — each pathway with tutor, link and class counts,
                                            plus classes not yet linked to a pathway
   POST /students/:studentId/link-track   — link unlinked classes to a pathway
══════════════════════════════════════════════ */
const tracksSvc = require('../services/studentTracks');

router.get('/students/:studentId/tracks', requireAuth, requireRole('admin', 'super_admin', 'postsales'), async (req, res, next) => {
  try {
    if (!tracksSvc.UUID_RE.test(req.params.studentId)) return res.status(400).json({ success: false, error: 'Invalid student' });
    res.json({ success: true, tracks: await tracksSvc.studentTracks(pool, req.params.studentId) });
  } catch (err) { next(err); }
});

router.post('/students/:studentId/link-track', requireAuth, requireRole('admin', 'super_admin', 'postsales'), async (req, res, next) => {
  const studentId = req.params.studentId;
  const { track, pathwayId } = req.body || {};
  const gradeNumber = req.body && req.body.gradeNumber ? parseInt(req.body.gradeNumber, 10) : null;
  const lessonsCompleted = req.body && req.body.lessonsCompleted !== undefined && req.body.lessonsCompleted !== ''
    ? Math.max(0, parseInt(req.body.lessonsCompleted, 10) || 0) : null;
  if (!tracksSvc.UUID_RE.test(studentId)) return res.status(400).json({ success: false, error: 'Invalid student' });
  if (!String(track || '').startsWith('t:')) return res.status(400).json({ success: false, error: 'Choose classes that are not linked to a pathway yet' });
  if (!tracksSvc.UUID_RE.test(String(pathwayId || ''))) return res.status(400).json({ success: false, error: 'Choose the pathway' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pw = await client.query('SELECT id, name FROM pathways WHERE id = $1', [pathwayId]);
    if (!pw.rows.length) throw Object.assign(new Error('Pathway not found'), { status: 404 });
    const tf = tracksSvc.trackFilter(track, 2);
    const classes = await client.query(
      `SELECT b.id, b.tutor_id, b.class_link, b.status, b.date FROM bookings b
       WHERE b.student_id = $1 AND ${tf.sql} ORDER BY b.date DESC FOR UPDATE`,
      [studentId, ...tf.params]
    );
    if (!classes.rows.length) throw Object.assign(new Error('No classes found for that selection'), { status: 404 });
    const latest = classes.rows[0];
    const done = classes.rows.filter(c => c.status === 'completed' || c.status === 'partially_completed').length;

    let enr = (await client.query(
      `SELECT id FROM enrolments WHERE student_id = $1 AND pathway_id = $2 AND status IN ('active', 'paused')
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [studentId, pathwayId]
    )).rows[0];
    if (!enr) {
      const paused = (await client.query('SELECT class_paused FROM student_profiles WHERE user_id = $1', [studentId])).rows[0];
      enr = (await client.query(
        `INSERT INTO enrolments (student_id, pathway_id, tutor_id, class_link, current_grade, lessons_completed, total_lessons, status, start_date)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, (SELECT MIN(date) FROM bookings WHERE id = ANY($8::uuid[])))
         RETURNING id`,
        [studentId, pathwayId, latest.tutor_id, latest.class_link || null, gradeNumber || 1,
         lessonsCompleted !== null ? lessonsCompleted : done,
         paused && paused.class_paused ? 'paused' : 'active', classes.rows.map(c => c.id)]
      )).rows[0];
    } else if (gradeNumber || lessonsCompleted !== null) {
      await client.query(
        `UPDATE enrolments SET current_grade = COALESCE($2, current_grade),
                lessons_completed = COALESCE($3, lessons_completed), updated_at = NOW()
         WHERE id = $1`,
        [enr.id, gradeNumber, lessonsCompleted]
      );
    }
    const upd = await client.query(
      `UPDATE bookings SET enrolment_id = $1 WHERE id = ANY($2::uuid[])`,
      [enr.id, classes.rows.map(c => c.id)]
    );
    await client.query('COMMIT');
    logger.info(`[TRACKS] ${req.user.email} linked ${upd.rowCount} classes of student ${studentId} to ${pw.rows[0].name} (enrolment ${enr.id})`);
    res.json({ success: true, enrolmentId: enr.id, linked: upd.rowCount, pathwayName: pw.rows[0].name });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
