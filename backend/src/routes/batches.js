/**
 * Batches routes — Group Classes (2–3 students, one tutor, one class link)
 *
 * POST   /api/batches                          — create a batch + its class bookings
 * GET    /api/batches                          — list all batches (admin/postsales)
 * GET    /api/batches/:id                      — batch detail + members + next classes
 * PUT    /api/batches/:id                      — edit class link / notes
 * PUT    /api/batches/:id/status               — pause / resume / close
 * PUT    /api/batches/:id/reschedule           — new schedule (optionally new tutor/link)
 * POST   /api/batches/:id/members              — add a student
 * DELETE /api/batches/:id/members/:studentId   — remove a student
 * POST   /api/batches/:id/transfer-member      — move a student to another / a new batch
 * DELETE /api/batches/:id                      — delete batch, cancel future classes
 *
 * Model: each class is ONE booking with batch_id set and student_id NULL.
 * Members are in batch_members; each member keeps their own credits, which
 * are charged per attending student when the tutor ends the class
 * (POST /api/bookings/:id/report with attendees).
 *
 * Booking date/time are WAT (see utils/timezone.js). Every route runs in a
 * single transaction — a failed check rolls back everything.
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger  = require('../utils/logger');
const rescheduleSvc = require('../services/rescheduleService');

const router = express.Router();
const MAX_MEMBERS = 3;
const STAFF = ['admin', 'super_admin', 'postsales'];

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

/** Run `fn(client, req)` in a transaction; it returns the JSON body. */
function tx(fn) {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const body = await fn(client, req);
      await client.query('COMMIT');
      res.status(body && body._status ? body._status : 200).json(body);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof HttpError) {
        return res.status(err.status).json({ success: false, error: err.message, ...(err.extra || {}) });
      }
      next(err);
    } finally {
      client.release();
    }
  };
}

function _addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function _weekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function _todayWAT() {
  return new Date(Date.now() + 60 * 60000).toISOString().slice(0, 10);
}

/** Validate + normalise [{weekday, time}] → [{weekday: 0-6, time: 'HH:MM'}] */
function normaliseSchedule(schedule) {
  if (!Array.isArray(schedule) || !schedule.length) throw new HttpError(400, 'Add at least one weekly day and time');
  const out = schedule.map(s => {
    const weekday = Number(s.weekday);
    const m = String(s.time || '').match(/^(\d{1,2}):(\d{2})/);
    if (!(weekday >= 0 && weekday <= 6) || !m) throw new HttpError(400, 'Each schedule row needs a day and a time');
    return { weekday, time: m[1].padStart(2, '0') + ':' + m[2] };
  });
  const keys = new Set(out.map(s => s.weekday + '|' + s.time));
  if (keys.size !== out.length) throw new HttpError(400, 'The schedule has the same day and time twice');
  return out;
}

/** `count` class slots on the weekly schedule, from startDate (inclusive). */
function generateDates(startDate, schedule, count) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) throw new HttpError(400, 'A valid start date is required');
  const slots = [...schedule].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
  const out = [];
  for (let day = 0; out.length < count && day < 366 * 6; day++) {
    const d  = _addDays(startDate, day);
    const wd = _weekday(d);
    for (const s of slots) {
      if (s.weekday === wd && out.length < count) out.push({ d, t: s.time });
    }
  }
  return out;
}

/** First clash between `slots` and the tutor's (or the students') other classes. */
async function findClash(client, { tutorId, slots, excludeBatchId = null, studentIds = [] }) {
  if (!slots.length) return null;
  const r = await client.query(
    `SELECT s.d::text AS d, s.t AS t,
            COALESCE(u.name, b.notes->>'batchRef', b.lesson_name, 'another class') AS who,
            (b.tutor_id = $1) AS tutor_clash
     FROM unnest($2::date[], $3::text[]) AS s(d, t)
     JOIN bookings b
       ON b.status = 'scheduled'
      AND (b.batch_id IS DISTINCT FROM $4::uuid)
      AND (b.tutor_id = $1 OR b.student_id = ANY($5::uuid[]))
      AND (b.date + b.time) < (s.d + s.t::time) + INTERVAL '60 minutes'
      AND (s.d + s.t::time) < (b.date + b.time) + make_interval(mins => COALESCE(b.duration_mins, 60))
     LEFT JOIN users u ON u.id = b.student_id
     ORDER BY s.d, s.t
     LIMIT 1`,
    [tutorId, slots.map(s => s.d), slots.map(s => s.t), excludeBatchId, studentIds]
  );
  return r.rows[0] || null;
}

function clashError(c) {
  const who = c.tutor_clash ? `the teacher already has a class with ${c.who}` : `${c.who} already has a class then`;
  return new HttpError(409, `Schedule clash on ${c.d} at ${c.t} — ${who}. Please choose a different day/time.`, { clash: c });
}

/** Pathway lessons for a grade, from lesson `fromLesson` onward. */
async function pathwayLessons(client, pathwayId, gradeNumber, fromLesson = 1) {
  if (!pathwayId || !gradeNumber) return [];
  const g = await client.query(
    `SELECT id FROM pathway_grades WHERE pathway_id = $1 AND grade_number = $2 AND is_active = TRUE LIMIT 1`,
    [pathwayId, parseInt(gradeNumber, 10)]
  );
  if (!g.rows.length) return [];
  const l = await client.query(
    `SELECT id AS pathway_lesson_id, lesson_number AS lesson_number_in_grade, title AS lesson_name
     FROM pathway_lessons WHERE grade_id = $1 AND is_active = TRUE AND lesson_number >= $2
     ORDER BY lesson_number ASC`,
    [g.rows[0].id, fromLesson]
  );
  return l.rows;
}

/** Next BATCH-NNN, continuing after any ref ever used (incl. pre-migration classes). */
async function nextBatchRef(client) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('batch_ref'))`);
  const r = await client.query(`
    SELECT COALESCE(MAX(n), 0) AS n FROM (
      SELECT CAST(substring(batch_ref FROM '^BATCH-([0-9]+)$') AS INT) AS n FROM batches
      UNION ALL
      SELECT CAST(substring(notes->>'batchRef' FROM '^BATCH-([0-9]+)$') AS INT) FROM bookings
       WHERE notes->>'batchRef' IS NOT NULL
    ) x`);
  return 'BATCH-' + String(Number(r.rows[0].n) + 1).padStart(3, '0');
}

async function loadBatch(client, batchId, { lock = false } = {}) {
  const r = await client.query(
    `SELECT b.*, u.name AS tutor_name FROM batches b LEFT JOIN users u ON u.id = b.tutor_id
     WHERE b.id = $1 ${lock ? 'FOR UPDATE OF b' : ''}`,
    [batchId]
  );
  if (!r.rows.length) throw new HttpError(404, 'Batch not found');
  return r.rows[0];
}

async function loadTutor(client, tutorId) {
  const r = await client.query(`SELECT id, name FROM users WHERE id = $1 AND role = 'tutor' AND is_active = TRUE`, [tutorId]);
  if (!r.rows.length) throw new HttpError(404, 'Teacher not found');
  return r.rows[0];
}

async function activeMemberIds(client, batchId) {
  const r = await client.query(`SELECT student_id FROM batch_members WHERE batch_id = $1 AND status = 'active'`, [batchId]);
  return r.rows.map(x => x.student_id);
}

/** Students must exist, be students, and not already be in another live batch. */
async function checkStudentsAvailable(client, studentIds, exceptBatchId = null) {
  const s = await client.query(`SELECT id, name FROM users WHERE id = ANY($1::uuid[]) AND role = 'student'`, [studentIds]);
  if (s.rows.length !== new Set(studentIds).size) throw new HttpError(404, 'One or more students were not found');
  const busy = await client.query(
    `SELECT u.name, b.batch_ref FROM batch_members bm
     JOIN batches b ON b.id = bm.batch_id JOIN users u ON u.id = bm.student_id
     WHERE bm.student_id = ANY($1::uuid[]) AND bm.status = 'active'
       AND b.status IN ('active','paused') AND ($2::uuid IS NULL OR b.id <> $2::uuid)
     LIMIT 1`,
    [studentIds, exceptBatchId]
  );
  if (busy.rows.length) throw new HttpError(400, `${busy.rows[0].name} is already in ${busy.rows[0].batch_ref}. Remove or move them from that batch first.`);
  return s.rows;
}

/** Insert one shared booking per slot, carrying lesson rows in order. */
async function insertBatchBookings(client, { batch, tutorId, tutorName, classLink, dates, lessons, startNumber = 1 }) {
  const gradeLabel = batch.grade_number ? `Grade ${batch.grade_number}` : 'Group';
  for (let i = 0; i < dates.length; i++) {
    const l = lessons[i] || {};
    const lessonNum = l.lesson_number_in_grade || (startNumber + i);
    await client.query(
      `INSERT INTO bookings
         (subject, grade, date, time, class_link, status, is_demo,
          tutor_id, student_id, batch_id, lesson_name, notes,
          booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade)
       VALUES ('Coding', $1, $2::date, $3::time, $4, 'scheduled', FALSE,
               $5, NULL, $6, $7, $8, NOW(), NOW(), $9, $10)`,
      [l.grade || gradeLabel, dates[i].d, dates[i].t, classLink, tutorId, batch.id,
       l.lesson_name || `Lesson ${lessonNum}`,
       JSON.stringify({ batchRef: batch.batch_ref, tutorName, classLink, isBatchClass: true }),
       l.pathway_lesson_id || null, lessonNum]
    );
  }
}

function _nowWAT() {
  const d = new Date(Date.now() + 60 * 60000).toISOString();
  return { d: d.slice(0, 10), t: d.slice(11, 16) };
}
/** Slots still to come (later today or after), dropping any whose time has passed. */
function futureOnly(slots) {
  const now = _nowWAT();
  return slots.filter(s => s.d > now.d || (s.d === now.d && s.t > now.t));
}

/** Highest lesson number the batch has used: taught, booked, or on hold while paused. */
async function lastLessonNumber(client, batchId) {
  const r = await client.query(
    `SELECT COALESCE(MAX(lesson_number_in_grade), 0)::int AS n FROM bookings
     WHERE batch_id = $1 AND (status <> 'cancelled' OR notes->>'pausedBatch' = 'true')`,
    [batchId]
  );
  return r.rows[0].n;
}

/**
 * Book the batch's next lessons, from `fromLesson` to the end of its grade,
 * on `schedule` from startDate (only slots still to come). Without a pathway
 * there is no lesson list, so it books up to lesson 72 (a full grade).
 *   strict: a clash stops everything (staff actions)
 *   otherwise clashing slots are skipped and the next free slot is used (daily top-up)
 * Returns { created, skipped, fromLesson, lastLesson, firstClass }.
 */
async function bookNextLessons(client, batch, { fromLesson, startDate, schedule, tutorId, tutorName, classLink, strict = true }) {
  let lessons = await pathwayLessons(client, batch.pathway_id, batch.grade_number, fromLesson);
  const hasPathway = !!(batch.pathway_id && batch.grade_number);
  const count = hasPathway ? lessons.length : Math.max(0, 72 - fromLesson + 1);
  if (!count) return { created: 0, skipped: 0, fromLesson, lastLesson: fromLesson - 1, firstClass: null };
  const sched = normaliseSchedule(schedule);
  const studentIds = await activeMemberIds(client, batch.id);

  let dates;
  let skipped = 0;
  if (strict) {
    dates = futureOnly(generateDates(startDate, sched, count + sched.length * 2)).slice(0, count);
    const clash = await findClash(client, { tutorId, slots: dates, excludeBatchId: batch.id, studentIds });
    if (clash) throw clashError(clash);
  } else {
    dates = [];
    const candidates = futureOnly(generateDates(startDate, sched, count * 2 + 16));
    for (const s of candidates) {
      if (dates.length >= count) break;
      const c = await findClash(client, { tutorId, slots: [s], excludeBatchId: batch.id, studentIds });
      if (c) { skipped++; continue; }
      dates.push(s);
    }
  }
  if (!hasPathway) lessons = [];
  await insertBatchBookings(client, { batch, tutorId, tutorName, classLink, dates, lessons: lessons.slice(0, dates.length), startNumber: fromLesson });
  return {
    created: dates.length, skipped, fromLesson,
    lastLesson: fromLesson + dates.length - 1,
    firstClass: dates[0] || null,
  };
}

/** Remaining scheduled classes of a batch (lesson data in order), optionally locked. */
async function futureClasses(client, batchId, fromDate, { lock = false } = {}) {
  const r = await client.query(
    `SELECT id, to_char(date,'YYYY-MM-DD') AS d, to_char(time,'HH24:MI') AS t,
            pathway_lesson_id, lesson_number_in_grade, lesson_name, grade
     FROM bookings
     WHERE batch_id = $1 AND status = 'scheduled' AND date >= $2::date
     ORDER BY date, time ${lock ? 'FOR UPDATE' : ''}`,
    [batchId, fromDate]
  );
  return r.rows;
}

/* ══════════════════════════════════════════════
   POST /api/batches — create
   Body: { tutorId, pathwayId?, gradeNumber?, startingLesson?, classLink,
           schedule: [{weekday,time}], startDate, studentIds: [2–3], notes? }
══════════════════════════════════════════════ */
router.post('/', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const { tutorId, pathwayId, gradeNumber, startingLesson, classLink, startDate, studentIds, notes } = req.body;
  if (!tutorId)   throw new HttpError(400, 'Please select a teacher');
  if (!classLink) throw new HttpError(400, 'Please enter the class link');
  if (!Array.isArray(studentIds) || studentIds.length < 2) throw new HttpError(400, 'Select at least 2 students');
  if (studentIds.length > MAX_MEMBERS) throw new HttpError(400, `Maximum ${MAX_MEMBERS} students per batch`);
  const schedule = normaliseSchedule(req.body.schedule);

  const tutor = await loadTutor(client, tutorId);
  await checkStudentsAvailable(client, studentIds);

  const startNumber = Math.max(1, parseInt(startingLesson, 10) || 1);
  const lessons = await pathwayLessons(client, pathwayId, gradeNumber, startNumber);
  if (pathwayId && gradeNumber && !lessons.length) throw new HttpError(400, `This grade has no lessons from lesson ${startNumber} onwards`);
  const dates   = generateDates(startDate, schedule, lessons.length || Math.max(1, 72 - (startNumber - 1)));

  const clash = await findClash(client, { tutorId, slots: dates, studentIds });
  if (clash) throw clashError(clash);

  const batchRef = await nextBatchRef(client);
  const b = await client.query(
    `INSERT INTO batches (batch_ref, name, tutor_id, pathway_id, grade_number, class_link, schedule, start_date, notes, created_by)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [batchRef, tutorId, pathwayId || null, gradeNumber ? parseInt(gradeNumber, 10) : null,
     classLink, JSON.stringify(schedule), startDate, notes || null, req.user.id]
  );
  const batch = b.rows[0];

  for (const sid of studentIds) {
    await client.query(`INSERT INTO batch_members (batch_id, student_id) VALUES ($1, $2)`, [batch.id, sid]);
  }
  await insertBatchBookings(client, { batch, tutorId, tutorName: tutor.name, classLink, dates, lessons, startNumber });

  logger.info(`[BATCH] Created ${batchRef} (${studentIds.length} students, ${dates.length} classes) by ${req.user.email}`);
  return { _status: 201, success: true, batchId: batch.id, batchRef, bookingsCreated: dates.length, firstClass: dates[0] };
}));

/* ══════════════════════════════════════════════
   GET /api/batches — list
══════════════════════════════════════════════ */
router.get('/', requireAuth, requireRole(...STAFF), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id, b.batch_ref AS "batchRef", b.status, b.class_link AS "classLink",
        b.grade_number AS "gradeNumber", b.schedule, b.created_at AS "createdAt",
        u_t.name AS "tutorName", u_t.id AS "tutorId",
        p.name   AS "pathwayName", b.pathway_id AS "pathwayId",
        (SELECT COUNT(*)::int FROM batch_members WHERE batch_id = b.id AND status = 'active') AS "memberCount",
        (SELECT string_agg(u.name, ', ' ORDER BY bm.joined_at) FROM batch_members bm
           JOIN users u ON u.id = bm.student_id WHERE bm.batch_id = b.id AND bm.status = 'active') AS "memberNames",
        (SELECT to_char(MIN(date), 'YYYY-MM-DD') FROM bookings
           WHERE batch_id = b.id AND status = 'scheduled' AND date >= CURRENT_DATE) AS "nextClassDate",
        (SELECT COUNT(*)::int FROM bookings
           WHERE batch_id = b.id AND status = 'scheduled' AND date >= CURRENT_DATE) AS "remainingClasses",
        /* Lessons of the grade not booked yet (classes can still be added for these) */
        (SELECT COUNT(*)::int FROM pathway_grades pg JOIN pathway_lessons pl ON pl.grade_id = pg.id AND pl.is_active = TRUE
           WHERE pg.pathway_id = b.pathway_id AND pg.grade_number = b.grade_number AND pg.is_active = TRUE
             AND pl.lesson_number > COALESCE((SELECT MAX(x.lesson_number_in_grade) FROM bookings x
                   WHERE x.batch_id = b.id AND (x.status <> 'cancelled' OR x.notes->>'pausedBatch' = 'true')), 0)
        ) AS "unbookedLessons"
      FROM batches b
      LEFT JOIN users u_t ON u_t.id = b.tutor_id
      LEFT JOIN pathways p ON p.id = b.pathway_id
      WHERE b.batch_ref IS NOT NULL
      ORDER BY b.created_at DESC
    `);
    res.json({ success: true, batches: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/batches/:id — detail
══════════════════════════════════════════════ */
router.get('/:id', requireAuth, requireRole(...STAFF, 'tutor'), async (req, res, next) => {
  try {
    const batchRes = await pool.query(`
      SELECT b.*, u_t.name AS "tutorName", p.name AS "pathwayName"
      FROM batches b
      LEFT JOIN users u_t ON u_t.id = b.tutor_id
      LEFT JOIN pathways p ON p.id = b.pathway_id
      WHERE b.id = $1`, [req.params.id]
    );
    if (!batchRes.rows.length) return res.status(404).json({ success: false, error: 'Batch not found' });
    const batch = batchRes.rows[0];
    if (req.user.role === 'tutor' && batch.tutor_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not your batch' });
    }

    const membersRes = await pool.query(`
      SELECT bm.id, bm.status, bm.joined_at AS "joinedAt", bm.removed_at AS "removedAt",
             bm.removal_reason AS "removalReason",
             u.id AS "studentId", u.name AS "studentName", u.email,
             u.phone, u.whatsapp, u.staff_id AS "staffId",
             sp.parent_name AS "parentName",
             COALESCE(sp.grade, '') AS grade,
             sp.credits, sp.credits_suspended AS "creditsSuspended", sp.class_paused AS "classPaused"
      FROM batch_members bm
      JOIN users u ON u.id = bm.student_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE bm.batch_id = $1
      ORDER BY (bm.status = 'active') DESC, bm.joined_at ASC`, [req.params.id]
    );

    const next5 = await pool.query(
      `SELECT id, to_char(date,'YYYY-MM-DD') AS date, to_char(time,'HH24:MI') AS time,
              lesson_name AS "lessonName", lesson_number_in_grade AS "lessonNumber"
       FROM bookings WHERE batch_id = $1 AND status = 'scheduled' AND date >= CURRENT_DATE
       ORDER BY date, time LIMIT 5`, [req.params.id]
    );
    const remaining = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM bookings WHERE batch_id = $1 AND status = 'scheduled' AND date >= CURRENT_DATE`,
      [req.params.id]
    );

    res.json({
      success: true,
      batch,
      members: membersRes.rows,
      nextClasses: next5.rows,
      remainingClasses: remaining.rows[0].cnt,
    });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   PUT /api/batches/:id — edit class link / notes
   (teacher and schedule changes go through /reschedule)
══════════════════════════════════════════════ */
router.put('/:id', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const { classLink, notes } = req.body;
  const batch = await loadBatch(client, req.params.id, { lock: true });
  if (classLink === undefined && notes === undefined) throw new HttpError(400, 'Nothing to update');

  if (classLink !== undefined) {
    if (!classLink) throw new HttpError(400, 'Class link cannot be empty');
    await client.query(`UPDATE batches SET class_link = $1, updated_at = NOW() WHERE id = $2`, [classLink, batch.id]);
    await client.query(
      `UPDATE bookings SET class_link = $1,
              notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('classLink', $1::text)
       WHERE batch_id = $2 AND status = 'scheduled' AND date >= CURRENT_DATE`,
      [classLink, batch.id]
    );
  }
  if (notes !== undefined) {
    await client.query(`UPDATE batches SET notes = $1, updated_at = NOW() WHERE id = $2`, [notes || null, batch.id]);
  }
  logger.info(`[BATCH] ${batch.batch_ref} edited by ${req.user.email}`);
  return { success: true };
}));

/* ══════════════════════════════════════════════
   PUT /api/batches/:id/starting-lesson — { lessonNumber }
   Renumbers the batch's upcoming classes so the next one is lesson N,
   each linked to its pathway lesson. Dates and times are unchanged.
══════════════════════════════════════════════ */
router.put('/:id/starting-lesson', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const n = parseInt(req.body && req.body.lessonNumber, 10);
  if (!(n >= 1)) throw new HttpError(400, 'Enter the lesson number the next class should teach');
  let batch = await loadBatch(client, req.params.id, { lock: true });
  /* Optionally set the pathway + grade at the same time (batches created without one) */
  const { pathwayId, gradeNumber } = req.body || {};
  if (pathwayId) {
    const g = parseInt(gradeNumber, 10);
    if (!(g >= 1)) throw new HttpError(400, 'Choose the grade for this pathway');
    await client.query(`UPDATE batches SET pathway_id = $1, grade_number = $2, updated_at = NOW() WHERE id = $3`, [pathwayId, g, batch.id]);
    await client.query(`UPDATE bookings SET grade = $1 WHERE batch_id = $2 AND status = 'scheduled' AND date >= $3::date`, [`Grade ${g}`, batch.id, _todayWAT()]);
    batch = await loadBatch(client, batch.id);
  }
  const classes = await futureClasses(client, batch.id, _todayWAT(), { lock: true });
  if (!classes.length) throw new HttpError(400, 'This batch has no upcoming classes');
  const lessons = await pathwayLessons(client, batch.pathway_id, batch.grade_number, n);
  if (batch.pathway_id && batch.grade_number && !lessons.length) throw new HttpError(400, `This grade has no lesson ${n}`);

  for (let i = 0; i < classes.length; i++) {
    const l = lessons[i] || null;
    const num = l ? l.lesson_number_in_grade : n + i;
    await client.query(
      `UPDATE bookings SET pathway_lesson_id = $1, lesson_number_in_grade = $2, lesson_name = $3 WHERE id = $4`,
      [l ? l.pathway_lesson_id : null, num, l ? l.lesson_name : `Lesson ${num}`, classes[i].id]
    );
  }
  const beyond = lessons.length && classes.length > lessons.length ? classes.length - lessons.length : 0;
  logger.info(`[BATCH] ${batch.batch_ref} renumbered from lesson ${n} (${classes.length} classes) by ${req.user.email}`);
  return {
    success: true, batchRef: batch.batch_ref, classes: classes.length, fromLesson: n,
    lastLesson: n + classes.length - 1, beyondGrade: beyond,
  };
}));

/* ══════════════════════════════════════════════
   PUT /api/batches/:id/status — { status: 'paused' | 'active' | 'closed' }
   paused  → future classes are cancelled and tagged so they can be restored
   active  → paused classes come back, moved forward by whole weeks so the
             first one is today or later (same weekdays and times)
   closed  → future classes are cancelled
══════════════════════════════════════════════ */
router.put('/:id/status', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const { status } = req.body;
  if (!['active', 'paused', 'closed'].includes(status)) throw new HttpError(400, 'Invalid status');
  const batch = await loadBatch(client, req.params.id, { lock: true });
  const today = _todayWAT();
  let affected = 0;

  if (status === 'paused') {
    if (batch.status !== 'active') throw new HttpError(400, 'Only an active batch can be paused');
    const r = await client.query(
      `UPDATE bookings SET status = 'cancelled',
              notes = COALESCE(notes, '{}'::jsonb) || '{"pausedBatch": true}'::jsonb
       WHERE batch_id = $1 AND status = 'scheduled' AND date >= $2::date RETURNING id`,
      [batch.id, today]
    );
    affected = r.rows.length;
  }

  if (status === 'active') {
    if (batch.status === 'active') throw new HttpError(400, 'Batch is already active');
    if (batch.status === 'closed') throw new HttpError(400, 'A closed batch cannot be resumed');
    const paused = await client.query(
      `SELECT id, to_char(date,'YYYY-MM-DD') AS d, to_char(time,'HH24:MI') AS t FROM bookings
       WHERE batch_id = $1 AND status = 'cancelled' AND notes->>'pausedBatch' = 'true'
       ORDER BY date, time FOR UPDATE`,
      [batch.id]
    );
    const rows = paused.rows;
    let weeks = 0;
    if (rows.length && rows[0].d < today) {
      const [y1, m1, d1] = rows[0].d.split('-').map(Number), [y2, m2, d2] = today.split('-').map(Number);
      weeks = Math.ceil((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (7 * 86400000));
    }
    const slots = rows.map(r => ({ id: r.id, d: _addDays(r.d, weeks * 7), t: r.t }));
    const clash = await findClash(client, { tutorId: batch.tutor_id, slots, excludeBatchId: batch.id, studentIds: await activeMemberIds(client, batch.id) });
    if (clash) throw clashError(clash);
    for (const s of slots) {
      await client.query(
        `UPDATE bookings SET status = 'scheduled', date = $1::date, notes = notes - 'pausedBatch' WHERE id = $2`,
        [s.d, s.id]
      );
    }
    affected = slots.length;
    await rescheduleSvc.clearReminders(slots.map(s => s.id));
  }

  if (status === 'closed') {
    const r = await client.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE batch_id = $1 AND status = 'scheduled' AND date >= $2::date RETURNING id`,
      [batch.id, today]
    );
    affected = r.rows.length;
  }

  await client.query(`UPDATE batches SET status = $1, updated_at = NOW() WHERE id = $2`, [status, batch.id]);
  logger.info(`[BATCH] ${batch.batch_ref} → ${status} (${affected} classes) by ${req.user.email}`);
  return { success: true, status, classesAffected: affected };
}));

/* ══════════════════════════════════════════════
   PUT /api/batches/:id/reschedule
   Body: { startDate, schedule: [{weekday,time}], classLink?, newTutorId?, fromLesson? }
   Moves the remaining classes (lesson order kept) onto the new schedule from
   startDate. A paused batch is resumed onto the new schedule. A batch with
   no classes left gets its next lessons booked (from `fromLesson`, or the
   lesson after the last one it used) to the end of its grade.
══════════════════════════════════════════════ */
router.put('/:id/reschedule', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const { startDate, classLink, newTutorId } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) throw new HttpError(400, 'A valid start date is required');
  if (startDate < _todayWAT()) throw new HttpError(400, 'The start date cannot be in the past');
  const schedule = normaliseSchedule(req.body.schedule);
  const batch = await loadBatch(client, req.params.id, { lock: true });
  if (batch.status === 'closed') throw new HttpError(400, 'A closed batch cannot be rescheduled');

  let tutorId = batch.tutor_id, tutorName = batch.tutor_name;
  if (newTutorId && newTutorId !== batch.tutor_id) {
    const t = await loadTutor(client, newTutorId);
    tutorId = t.id; tutorName = t.name;
  }
  const link = classLink || batch.class_link || '';

  /* Remaining classes: scheduled from today on, or the paused ones */
  const today = _todayWAT();
  const rows = batch.status === 'paused'
    ? (await client.query(
        `SELECT id FROM bookings WHERE batch_id = $1 AND status = 'cancelled' AND notes->>'pausedBatch' = 'true'
         ORDER BY date, time FOR UPDATE`, [batch.id])).rows
    : await futureClasses(client, batch.id, today, { lock: true });

  if (!rows.length) {
    /* Nothing left to move: book the next lessons on the new schedule */
    const last = await lastLessonNumber(client, batch.id);
    const fromLesson = parseInt(req.body.fromLesson, 10) >= 1 ? parseInt(req.body.fromLesson, 10) : last + 1;
    const made = await bookNextLessons(client, batch, { fromLesson, startDate, schedule, tutorId, tutorName, classLink: link, strict: true });
    if (!made.created) {
      throw new HttpError(400, batch.pathway_id
        ? `Grade ${batch.grade_number} has no lessons after lesson ${fromLesson - 1}. If the students are moving up a grade, set the pathway and grade with "Set starting lesson" first.`
        : `This batch has already reached lesson ${fromLesson - 1} of 72. Give it a pathway and grade to book more classes.`);
    }
    await client.query(
      `UPDATE batches SET schedule = $1, class_link = $2, tutor_id = $3, status = 'active', updated_at = NOW() WHERE id = $4`,
      [JSON.stringify(schedule), link, tutorId, batch.id]
    );
    logger.info(`[BATCH] ${batch.batch_ref}: ${made.created} new classes (lessons ${made.fromLesson}–${made.lastLesson}) from ${startDate} by ${req.user.email}`);
    return { success: true, batchRef: batch.batch_ref, moved: 0, created: made.created, fromLesson: made.fromLesson,
             lastLesson: made.lastLesson, firstClass: made.firstClass, tutorName };
  }

  const dates = futureOnly(generateDates(startDate, schedule, rows.length + schedule.length * 2)).slice(0, rows.length);
  const clash = await findClash(client, { tutorId, slots: dates, excludeBatchId: batch.id, studentIds: await activeMemberIds(client, batch.id) });
  if (clash) throw clashError(clash);

  for (let i = 0; i < rows.length; i++) {
    await client.query(
      `UPDATE bookings SET date = $1::date, time = $2::time, status = 'scheduled',
              tutor_id = $3, class_link = $4, rescheduled_at = NOW(),
              notes = (COALESCE(notes, '{}'::jsonb) - 'pausedBatch')
                      || jsonb_build_object('tutorName', $5::text, 'classLink', $4::text)
       WHERE id = $6`,
      [dates[i].d, dates[i].t, tutorId, link, tutorName, rows[i].id]
    );
  }
  await client.query(
    `UPDATE batches SET schedule = $1, class_link = $2, tutor_id = $3, status = 'active', updated_at = NOW() WHERE id = $4`,
    [JSON.stringify(schedule), link, tutorId, batch.id]
  );
  await rescheduleSvc.clearReminders(rows.map(r => r.id));

  logger.info(`[BATCH] ${batch.batch_ref} rescheduled: ${rows.length} classes from ${startDate} by ${req.user.email}`);
  return { success: true, batchRef: batch.batch_ref, moved: rows.length, firstClass: dates[0], tutorName };
}));

/* ══════════════════════════════════════════════
   POST /api/batches/:id/record-class — { date, time, lessonNumber }
   A class the teacher took outside the calendar (for example after the
   batch ran out of booked classes). It is added for the batch's teacher on
   that date and time, so they can end it in the usual way: attendance,
   credits and pay are then settled exactly as for any other class.
══════════════════════════════════════════════ */
router.post('/:id/record-class', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const out = await recordClass(client, req.params.id, req.body || {});
  logger.info(`[BATCH] ${out.batchRef}: class on ${out.date} ${out.time} (lesson ${out.lessonNumber}) recorded by ${req.user.email}`);
  return { _status: 201, ...out };
}));

async function recordClass(client, batchId, { date, time, lessonNumber }) {
  const batch = await loadBatch(client, batchId, { lock: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new HttpError(400, 'Choose the date of the class');
  const tm = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!tm) throw new HttpError(400, 'Enter the time the class started');
  const t = tm[1].padStart(2, '0') + ':' + tm[2];
  const now = _nowWAT();
  if (date > now.d || (date === now.d && t > now.t)) throw new HttpError(400, 'Only a class that has already taken place can be recorded. Book future classes with Reschedule.');
  if (date < _addDays(now.d, -31)) throw new HttpError(400, 'Classes more than 31 days ago cannot be recorded here');
  const n = parseInt(lessonNumber, 10);
  if (!(n >= 1)) throw new HttpError(400, 'Enter the lesson number that was taught');
  if (!batch.tutor_id) throw new HttpError(400, 'This batch has no teacher');

  const dup = await client.query(
    `SELECT 1 FROM bookings WHERE batch_id = $1 AND date = $2::date AND time = $3::time AND status <> 'cancelled' LIMIT 1`,
    [batch.id, date, t]);
  if (dup.rows.length) throw new HttpError(400, 'This batch already has a class at that date and time');
  const clash = await findClash(client, { tutorId: batch.tutor_id, slots: [{ d: date, t }], excludeBatchId: batch.id, studentIds: [] });
  if (clash && clash.tutor_clash) throw clashError(clash);

  const lesson = (await pathwayLessons(client, batch.pathway_id, batch.grade_number, n)).find(l => l.lesson_number_in_grade === n) || null;
  const tutorName = (await client.query('SELECT name FROM users WHERE id = $1', [batch.tutor_id])).rows[0]?.name || '';
  const ins = await client.query(
    `INSERT INTO bookings
       (subject, grade, date, time, class_link, status, is_demo, tutor_id, student_id, batch_id, lesson_name, notes,
        booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade)
     VALUES ('Coding', $1, $2::date, $3::time, $4, 'scheduled', FALSE, $5, NULL, $6, $7, $8, NOW(), NOW(), $9, $10)
     RETURNING id`,
    [batch.grade_number ? `Grade ${batch.grade_number}` : 'Group', date, t, batch.class_link || '', batch.tutor_id, batch.id,
     lesson ? lesson.lesson_name : `Lesson ${n}`,
     JSON.stringify({ batchRef: batch.batch_ref, tutorName, classLink: batch.class_link || '', isBatchClass: true, recordedAfter: true }),
     lesson ? lesson.pathway_lesson_id : null, n]
  );
  return { success: true, bookingId: ins.rows[0].id, batchRef: batch.batch_ref, date, time: t, lessonNumber: n,
           lessonName: lesson ? lesson.lesson_name : `Lesson ${n}`, tutorName };
}

/**
 * Daily: an active batch with a pathway always has its grade booked. When
 * lessons are added to the curriculum later, or a batch was created before
 * its grade was complete, the missing lessons are booked after its last
 * class on its weekly schedule. Slots that clash are skipped. Never throws.
 */
async function topUpBatches() {
  const ids = (await pool.query(
    `SELECT id FROM batches WHERE status = 'active' AND batch_ref IS NOT NULL AND tutor_id IS NOT NULL
       AND pathway_id IS NOT NULL AND grade_number IS NOT NULL`)).rows.map(r => r.id);
  const added = [];
  for (const id of ids) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const batch = await loadBatch(client, id, { lock: true });
      const last = await lastLessonNumber(client, batch.id);
      const lastSlot = (await client.query(
        `SELECT to_char(MAX(date),'YYYY-MM-DD') AS d FROM bookings WHERE batch_id = $1 AND status = 'scheduled'`, [batch.id])).rows[0].d;
      const startDate = lastSlot && lastSlot >= _todayWAT() ? _addDays(lastSlot, 1) : _todayWAT();
      const schedule = typeof batch.schedule === 'string' ? JSON.parse(batch.schedule) : batch.schedule;
      if (!Array.isArray(schedule) || !schedule.length) { await client.query('ROLLBACK'); continue; }
      const made = await bookNextLessons(client, batch, {
        fromLesson: last + 1, startDate, schedule, tutorId: batch.tutor_id, tutorName: batch.tutor_name,
        classLink: batch.class_link || '', strict: false,
      });
      await client.query('COMMIT');
      if (made.created) {
        added.push({ batch, made });
        logger.info(`[BATCH-TOPUP] ${batch.batch_ref}: +${made.created} classes (lessons ${made.fromLesson}–${made.lastLesson})${made.skipped ? `, ${made.skipped} clashing slot(s) skipped` : ''}`);
      }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      logger.warn(`[BATCH-TOPUP] ${id}: ${e.message}`);
    } finally {
      client.release();
    }
  }
  for (const { batch, made } of added) {
    try {
      await require('../services/tutorNotify').notifyTutor({
        tutorId: batch.tutor_id,
        title: `Classes added — ${batch.batch_ref}`,
        body: `${made.created} more class${made.created === 1 ? '' : 'es'} on your calendar (lessons ${made.fromLesson} to ${made.lastLesson})`,
        lines: [`Batch: ${batch.batch_ref}`, `Lessons ${made.fromLesson} to ${made.lastLesson}`, `First new class: ${made.firstClass.d} at ${made.firstClass.t} WAT`],
      });
    } catch (e) { logger.warn('[BATCH-TOPUP] notify: ' + e.message); }
  }
  return added.length;
}

/* ══════════════════════════════════════════════
   POST /api/batches/:id/members — add a student { studentId }
══════════════════════════════════════════════ */
router.post('/:id/members', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const { studentId } = req.body;
  if (!studentId) throw new HttpError(400, 'studentId required');
  const batch = await loadBatch(client, req.params.id, { lock: true });
  if (batch.status === 'closed') throw new HttpError(400, 'Batch is closed');

  const members = await activeMemberIds(client, batch.id);
  if (members.includes(studentId)) throw new HttpError(400, 'Student is already in this batch');
  if (members.length >= MAX_MEMBERS) throw new HttpError(400, `Batch already has ${MAX_MEMBERS} students (maximum)`);
  const [student] = await checkStudentsAvailable(client, [studentId], batch.id);

  /* The student's own 1-on-1 classes must not overlap the batch's */
  const slots = (await futureClasses(client, batch.id, _todayWAT())).map(r => ({ d: r.d, t: r.t }));
  const clash = await findClash(client, { tutorId: null, slots, excludeBatchId: batch.id, studentIds: [studentId] });
  if (clash) throw clashError(clash);

  await client.query(
    `INSERT INTO batch_members (batch_id, student_id) VALUES ($1, $2)
     ON CONFLICT (batch_id, student_id)
     DO UPDATE SET status = 'active', joined_at = NOW(), removed_at = NULL, removal_reason = NULL, transferred_at = NULL`,
    [batch.id, studentId]
  );
  logger.info(`[BATCH] ${student.name} added to ${batch.batch_ref} by ${req.user.email}`);
  return { success: true, message: `${student.name} added to ${batch.batch_ref}` };
}));

/* ══════════════════════════════════════════════
   DELETE /api/batches/:id/members/:studentId — remove { reason }
══════════════════════════════════════════════ */
router.delete('/:id/members/:studentId', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!reason) throw new HttpError(400, 'A removal reason is required');
  const batch = await loadBatch(client, req.params.id, { lock: true });

  const r = await client.query(
    `UPDATE batch_members SET status = 'removed', removed_at = NOW(), removal_reason = $3
     WHERE batch_id = $1 AND student_id = $2 AND status = 'active' RETURNING id`,
    [batch.id, req.params.studentId, reason]
  );
  if (!r.rows.length) throw new HttpError(404, 'Student is not an active member of this batch');

  const name = (await client.query('SELECT name FROM users WHERE id = $1', [req.params.studentId])).rows[0]?.name || 'Student';
  const remaining = (await activeMemberIds(client, batch.id)).length;
  logger.info(`[BATCH] ${name} removed from ${batch.batch_ref} by ${req.user.email}. Reason: ${reason}`);
  return {
    success: true,
    message: `${name} removed from ${batch.batch_ref}`,
    remainingMembers: remaining,
    warning: remaining === 0 ? 'This batch has no students left — its classes are still on the teacher\'s calendar. Add students, pause or delete it.' : null,
  };
}));

/* ══════════════════════════════════════════════
   POST /api/batches/:id/transfer-member
   Move a student out of this batch.
     { studentId, targetBatchId }             → join an existing batch (its classes)
     { studentId, newBatch: { tutorId, classLink, schedule, startDate } }
                                              → split: a new batch continuing from
                                                this batch's next lesson
   The students who stay keep their classes unchanged.
══════════════════════════════════════════════ */
router.post('/:id/transfer-member', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const { studentId, targetBatchId, newBatch } = req.body;
  if (!studentId) throw new HttpError(400, 'studentId required');
  if (!targetBatchId && !newBatch) throw new HttpError(400, 'Choose a batch to move to, or set up a new one');

  const src = await loadBatch(client, req.params.id, { lock: true });
  if (!(await activeMemberIds(client, src.id)).includes(studentId)) {
    throw new HttpError(404, 'Student is not an active member of this batch');
  }
  const name = (await client.query('SELECT name FROM users WHERE id = $1', [studentId])).rows[0]?.name || 'Student';

  let dest;
  if (targetBatchId) {
    if (targetBatchId === src.id) throw new HttpError(400, 'Student is already in this batch');
    dest = await loadBatch(client, targetBatchId, { lock: true });
    if (dest.status === 'closed') throw new HttpError(400, 'Target batch is closed');
    if ((await activeMemberIds(client, dest.id)).length >= MAX_MEMBERS) throw new HttpError(400, `${dest.batch_ref} is full (${MAX_MEMBERS} students)`);

    const slots = (await futureClasses(client, dest.id, _todayWAT())).map(r => ({ d: r.d, t: r.t }));
    const clash = await findClash(client, { tutorId: null, slots, excludeBatchId: dest.id, studentIds: [studentId] });
    if (clash) throw clashError(clash);
  } else {
    const { tutorId, classLink, startDate } = newBatch;
    if (!tutorId)   throw new HttpError(400, 'Please select a teacher for the new batch');
    if (!classLink) throw new HttpError(400, 'Please enter the class link for the new batch');
    const schedule = normaliseSchedule(newBatch.schedule);
    const tutor = await loadTutor(client, tutorId);

    /* Continue the lesson sequence from this batch's next class */
    let lessons = (await futureClasses(client, src.id, _todayWAT()));
    if (!lessons.length) lessons = await pathwayLessons(client, src.pathway_id, src.grade_number);
    const dates = generateDates(startDate, schedule, lessons.length || 72);

    const clash = await findClash(client, { tutorId, slots: dates, studentIds: [studentId] });
    if (clash) throw clashError(clash);

    const ref = await nextBatchRef(client);
    dest = (await client.query(
      `INSERT INTO batches (batch_ref, name, tutor_id, pathway_id, grade_number, class_link, schedule, start_date, notes, created_by)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [ref, tutorId, src.pathway_id, src.grade_number, classLink, JSON.stringify(schedule), startDate,
       `Split from ${src.batch_ref}`, req.user.id]
    )).rows[0];
    await insertBatchBookings(client, { batch: dest, tutorId, tutorName: tutor.name, classLink, dates, lessons });
  }

  await client.query(
    `UPDATE batch_members SET status = 'transferred', transferred_at = NOW(), removed_at = NOW(), removal_reason = $3
     WHERE batch_id = $1 AND student_id = $2 AND status = 'active'`,
    [src.id, studentId, `Moved to ${dest.batch_ref} by ${req.user.email}`]
  );
  await client.query(
    `INSERT INTO batch_members (batch_id, student_id) VALUES ($1, $2)
     ON CONFLICT (batch_id, student_id)
     DO UPDATE SET status = 'active', joined_at = NOW(), removed_at = NULL, removal_reason = NULL, transferred_at = NULL`,
    [dest.id, studentId]
  );

  const remaining = (await activeMemberIds(client, src.id)).length;
  logger.info(`[BATCH] ${name} moved ${src.batch_ref} → ${dest.batch_ref} by ${req.user.email}`);
  return {
    success: true,
    message: `${name} moved to ${dest.batch_ref}`,
    destBatchId: dest.id, destBatch: dest.batch_ref, sourceBatch: src.batch_ref,
    sourceRemainingMembers: remaining,
    warning: remaining === 0 ? `${src.batch_ref} has no students left — pause or delete it.` : null,
  };
}));

/* ══════════════════════════════════════════════
   DELETE /api/batches/:id — cancel future classes and delete the batch.
   Past classes stay in the booking history.
══════════════════════════════════════════════ */
router.delete('/:id', requireAuth, requireRole(...STAFF), tx(async (client, req) => {
  const batch = await loadBatch(client, req.params.id, { lock: true });
  const cancelled = await client.query(
    `UPDATE bookings SET status = 'cancelled'
     WHERE batch_id = $1 AND status = 'scheduled' AND date >= $2::date RETURNING id`,
    [batch.id, _todayWAT()]
  );
  /* bookings.batch_id is ON DELETE SET NULL; members cascade */
  await client.query('DELETE FROM batches WHERE id = $1', [batch.id]);
  logger.info(`[BATCH] ${batch.batch_ref} deleted by ${req.user.email}. ${cancelled.rows.length} future classes cancelled.`);
  return { success: true, message: `Batch ${batch.batch_ref} deleted`, cancelledBookings: cancelled.rows.length };
}));

module.exports = router;
module.exports.topUpBatches = topUpBatches;
module.exports.recordClass = recordClass;
module.exports.bookNextLessons = bookNextLessons;
module.exports.lastLessonNumber = lastLessonNumber;
module.exports.loadBatch = loadBatch;
module.exports._test = { normaliseSchedule, generateDates, futureOnly };
