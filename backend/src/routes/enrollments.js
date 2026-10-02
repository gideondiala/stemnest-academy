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
const rescheduleSvc = require('../services/rescheduleService');

const router = express.Router();

/* ══════════════════════════════════════════════
   ENROLLMENT REQUESTS (from website Enrol Now)
══════════════════════════════════════════════ */

/* POST /api/enrollments/request — public */
router.post('/request', async (req, res, next) => {
  try {
    const { studentName, age, email, phone, timezone, courseId, courseName, coursePrice, notes,
            pathway_id, pathway_name, grade_number, has_device, expected_start } = req.body;
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
      `SELECT id, subject, grade, notes, lesson_name, is_demo FROM bookings WHERE id = $1`, [bookingId]);
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

function _todayWAT() {
  return new Date(Date.now() + 60 * 60000).toISOString().slice(0, 10);
}
function _addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function _daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

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
function _httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, extra });
}

/**
 * The classes a pause cancelled, in order. New pauses tag them
 * (notes.cancelledByPause); for pauses made before tagging existed, they are
 * the cancelled paid classes dated after the student's last live class.
 */
async function _pausedClasses(client, studentId) {
  const tagged = await client.query(
    `SELECT id, to_char(date,'YYYY-MM-DD') AS d, to_char(time,'HH24:MI') AS t, tutor_id, class_link
     FROM bookings
     WHERE student_id = $1 AND status = 'cancelled' AND notes->>'cancelledByPause' IS NOT NULL
     ORDER BY date, time FOR UPDATE`,
    [studentId]
  );
  if (tagged.rows.length) return tagged.rows;

  const legacy = await client.query(
    `SELECT id, to_char(date,'YYYY-MM-DD') AS d, to_char(time,'HH24:MI') AS t, tutor_id, class_link
     FROM bookings
     WHERE student_id = $1 AND status = 'cancelled' AND is_demo = FALSE
       AND date > COALESCE(
             (SELECT MAX(date) FROM bookings
               WHERE student_id = $1 AND is_demo = FALSE AND status <> 'cancelled'),
             '1900-01-01'::date)
     ORDER BY date, time FOR UPDATE`,
    [studentId]
  );
  return legacy.rows;
}

/** First clash between the proposed slots and other classes of their tutors or the student. */
async function _findClash(client, studentId, slots) {
  if (!slots.length) return null;
  const r = await client.query(
    `SELECT s.d::text AS d, s.t AS t, COALESCE(u.name, b.notes->>'batchRef', b.lesson_name, 'another class') AS who
     FROM unnest($1::uuid[], $2::date[], $3::text[], $4::uuid[]) AS s(tutor_id, d, t, own_id)
     JOIN bookings b
       ON b.status = 'scheduled'
      AND b.id <> ALL($4::uuid[])
      AND (b.tutor_id = s.tutor_id OR b.student_id = $5::uuid)
      AND (b.date + b.time) < (s.d + s.t::time) + INTERVAL '60 minutes'
      AND (s.d + s.t::time) < (b.date + b.time) + make_interval(mins => COALESCE(b.duration_mins, 60))
     LEFT JOIN users u ON u.id = b.student_id
     ORDER BY s.d, s.t LIMIT 1`,
    [slots.map(s => s.tutor_id), slots.map(s => s.d), slots.map(s => s.t), slots.map(s => s.id), studentId]
  );
  return r.rows[0] || null;
}

/* ══════════════════════════════════════════════
   PUT /api/enrollments/students/:studentId/pause   { reason }
   - Cancels the student's future 1-on-1 classes and tags them so resume
     can bring back exactly those lessons
   - Records the pause on the profile (and enrolment, if there is one)
   - Credits are left exactly as they are
   ══════════════════════════════════════════════ */
router.put('/students/:studentId/pause', requireAuth, requireRole('admin','super_admin','postsales'), (req, res, next) => {
  const { studentId } = req.params;
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!reason) return res.status(400).json({ success: false, error: 'A pause reason is required' });

  _withTx(res, next, async (client) => {
    const stu = await client.query(
      `SELECT u.id, u.name, sp.class_paused FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'student' FOR UPDATE OF u`,
      [studentId]
    );
    if (!stu.rows.length) throw _httpError(404, 'Student not found');
    if (stu.rows[0].class_paused) throw _httpError(400, 'Student is already paused');
    const name = stu.rows[0].name;

    const enrol = (await client.query(
      `SELECT id, lessons_completed FROM enrolments
       WHERE student_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [studentId]
    )).rows[0];

    const pausedAt = new Date().toISOString();
    const cancelled = await client.query(
      `UPDATE bookings
       SET status = 'cancelled',
           notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('cancelledByPause', $2::text)
       WHERE student_id = $1 AND status = 'scheduled' AND is_demo = FALSE AND date >= $3::date
       RETURNING id`,
      [studentId, pausedAt, _todayWAT()]
    );

    if (enrol) {
      await client.query(
        `UPDATE enrolments SET status = 'paused', paused_at = NOW(), paused_reason = $2, paused_by = $3,
                last_lesson_at_pause = $4, updated_at = NOW()
         WHERE id = $1`,
        [enrol.id, reason, req.user.id, enrol.lessons_completed || 0]
      );
    }
    await client.query(
      `INSERT INTO student_profiles (user_id, class_paused, paused_at, paused_reason, paused_by)
       VALUES ($1, TRUE, NOW(), $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET class_paused = TRUE, paused_at = NOW(), paused_reason = $2, paused_by = $3`,
      [studentId, reason, req.user.id]
    );

    logger.info(`[PAUSE] ${name} (${studentId}) paused by ${req.user.email}. ${cancelled.rows.length} classes cancelled. Reason: ${reason}`);
    return {
      success: true,
      studentName: name,
      bookingsCancelled: cancelled.rows.length,
      lessonsPausedAt: enrol ? (enrol.lessons_completed || 0) : null,
    };
  });
});

/* ══════════════════════════════════════════════
   PUT /api/enrollments/students/:studentId/resume
   Body: { startDate, keepSchedule = true, tutorId?, schedule?, classLink? }

   Brings back the classes the pause cancelled, in lesson order:
   - keepSchedule: same days, times, tutor and class link (per course),
     moved forward by whole weeks so the first class is on/after startDate
   - otherwise: placed on the new weekly schedule from startDate with the
     chosen tutor (and class link, if given)
   If nothing was cancelled by the pause, new classes are created on the
   given schedule from the student's next pathway lesson.
   ══════════════════════════════════════════════ */
router.put('/students/:studentId/resume', requireAuth, requireRole('admin','super_admin','postsales'), (req, res, next) => {
  const { studentId } = req.params;
  const { startDate, tutorId, classLink } = req.body || {};
  const keepSchedule = req.body && req.body.keepSchedule !== false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) {
    return res.status(400).json({ success: false, error: 'A start date is required' });
  }

  let schedule = null;
  if (!keepSchedule || Array.isArray(req.body.schedule)) {
    schedule = (req.body.schedule || []).map(s => ({
      weekday: Number(s.weekday),
      time: String(s.time || '').slice(0, 5),
    })).filter(s => s.weekday >= 0 && s.weekday <= 6 && /^\d{2}:\d{2}$/.test(s.time));
  }

  _withTx(res, next, async (client) => {
    const stu = await client.query(
      `SELECT u.id, u.name, u.email, sp.class_paused, sp.grade FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'student' FOR UPDATE OF u`,
      [studentId]
    );
    if (!stu.rows.length) throw _httpError(404, 'Student not found');
    const student = stu.rows[0];
    if (!student.class_paused) throw _httpError(400, 'Student is not currently paused');

    const enrol = (await client.query(
      `SELECT * FROM enrolments WHERE student_id = $1
       ORDER BY CASE WHEN status = 'paused' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
      [studentId]
    )).rows[0] || null;

    let tutor = null;
    if (tutorId) {
      tutor = (await client.query(`SELECT id, name FROM users WHERE id = $1 AND role = 'tutor'`, [tutorId])).rows[0];
      if (!tutor) throw _httpError(404, 'Teacher not found');
    }

    const rows = await _pausedClasses(client, studentId);
    let slots;
    let mode;

    if (rows.length && keepSchedule) {
      mode = 'restored';
      const weeks = Math.max(0, Math.ceil(_daysBetween(rows[0].d, startDate) / 7));
      slots = rows.map(r => ({ id: r.id, tutor_id: r.tutor_id, class_link: r.class_link, d: _addDays(r.d, weeks * 7), t: r.t }));
    } else {
      if (!tutor) throw _httpError(400, 'Please select a teacher');
      if (!schedule || !schedule.length) throw _httpError(400, 'Please add at least one day and time');
      const sorted = [...schedule].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
      const count = rows.length || Math.max(1, (72 - ((enrol && (enrol.last_lesson_at_pause || enrol.lessons_completed)) || 0)));
      const dates = [];
      for (let day = 0; dates.length < count && day < 366 * 6; day++) {
        const d  = _addDays(startDate, day);
        const [y, m, dd] = d.split('-').map(Number);
        const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
        for (const s of sorted) if (s.weekday === wd && dates.length < count) dates.push({ d, t: s.time });
      }
      mode = rows.length ? 'rescheduled' : 'created';
      slots = dates.map((dt, i) => ({
        id: rows[i] ? rows[i].id : null,
        tutor_id: tutor.id,
        class_link: classLink || (rows[i] && rows[i].class_link) || (enrol && enrol.class_link) || '',
        d: dt.d, t: dt.t,
      }));
    }

    const clash = await _findClash(client, studentId, slots.map(s => ({ ...s, id: s.id || '00000000-0000-0000-0000-000000000000' })));
    if (clash) throw _httpError(409, `Schedule clash on ${clash.d} at ${clash.t} with ${clash.who}. Choose a different start date or time.`, { clash });

    if (mode === 'created') {
      /* Nothing to restore — create classes from the next pathway lesson */
      const fromLesson = ((enrol && (enrol.last_lesson_at_pause || enrol.lessons_completed)) || 0) + 1;
      let lessons = [];
      if (enrol && enrol.pathway_id && enrol.current_grade) {
        const g = await client.query(
          `SELECT id FROM pathway_grades WHERE pathway_id = $1 AND grade_number = $2 AND is_active = TRUE LIMIT 1`,
          [enrol.pathway_id, enrol.current_grade]
        );
        if (g.rows.length) {
          lessons = (await client.query(
            `SELECT id, lesson_number, title FROM pathway_lessons
             WHERE grade_id = $1 AND is_active = TRUE AND lesson_number >= $2 ORDER BY lesson_number`,
            [g.rows[0].id, fromLesson]
          )).rows;
        }
      }
      for (let i = 0; i < slots.length; i++) {
        const l = lessons[i] || null;
        await client.query(
          `INSERT INTO bookings
             (subject, grade, date, time, class_link, status, is_demo, tutor_id, student_id,
              lesson_name, notes, booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade)
           VALUES ('Coding', $1, $2::date, $3::time, $4, 'scheduled', FALSE, $5, $6, $7, $8, NOW(), NOW(), $9, $10)`,
          [student.grade || `Grade ${(enrol && enrol.current_grade) || 1}`, slots[i].d, slots[i].t, slots[i].class_link,
           tutor.id, studentId, l ? l.title : student.name,
           JSON.stringify({ studentName: student.name, email: student.email || '', tutorName: tutor.name,
                            classLink: slots[i].class_link, isPaidClass: true, resumed: true, resumedAt: new Date().toISOString() }),
           l ? l.id : null, l ? l.lesson_number : fromLesson + i]
        );
      }
    } else {
      for (const s of slots) {
        await client.query(
          `UPDATE bookings
           SET status = 'scheduled', date = $1::date, time = $2::time, tutor_id = $3, class_link = $4,
               notes = (COALESCE(notes, '{}'::jsonb) - 'cancelledByPause')
                       || jsonb_build_object('resumedAt', $5::text, 'classLink', $4::text)
           WHERE id = $6`,
          [s.d, s.t, s.tutor_id, s.class_link, new Date().toISOString(), s.id]
        );
      }
    }

    if (enrol) {
      await client.query(
        `UPDATE enrolments SET status = 'active', resumed_at = NOW(), updated_at = NOW()
                ${tutor ? ', tutor_id = $2' : ''}
         WHERE id = $1`,
        tutor ? [enrol.id, tutor.id] : [enrol.id]
      );
    }
    await client.query(
      `UPDATE student_profiles SET class_paused = FALSE, paused_at = NULL, paused_reason = NULL, paused_by = NULL
       WHERE user_id = $1`,
      [studentId]
    );

    /* Re-arm reminders for restored classes (after commit; never throws) */
    const ids = slots.map(s => s.id).filter(Boolean);
    setImmediate(() => rescheduleSvc.clearReminders(ids));

    logger.info(`[RESUME] ${student.name} (${studentId}) resumed by ${req.user.email}: ${slots.length} classes ${mode} from ${slots[0] && slots[0].d}`);
    return {
      success: true,
      studentName: student.name,
      mode,
      classes: slots.length,
      bookingsCreated: slots.length,
      firstClass: slots[0] ? { date: slots[0].d, time: slots[0].t } : null,
    };
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

module.exports = router;
