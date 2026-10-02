/**
 * Reschedule tool — move a student's course from its current weekly
 * schedule onto a new one, from a chosen start date.
 *
 * A "course" (series) is the student's upcoming 1-on-1 classes that belong
 * together: the same enrolment, or (for older classes without one) the same
 * teacher and class link. Classes are moved in place, in lesson order, so
 * lesson numbers, reports and history are kept. Booking date/time are WAT.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');
const { isValidTimeZone, PLATFORM_TZ, formatForTimeZone } = require('../utils/timezone');
const { resolveUserTimeZone } = require('./timezoneService');

const CLASS_MINS = 60;
const FULL_GRADE_LESSONS = 72;
const DAY_START = 8 * 60, DAY_END = 21 * 60;      // suggestion window (WAT): 08:00 – 21:00 starts
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const REQUESTERS = ['student', 'parent', 'teacher', 'stemnest'];

function httpError(status, message, extra) { return Object.assign(new Error(message), { status, extra }); }

function nowWAT() {
  const d = new Date(Date.now() + 60 * 60000);
  return { date: d.toISOString().slice(0, 10), mins: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function weekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function toMins(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); }
function fromMins(n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
function dayNumber(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; }
/** Absolute minutes since epoch for a WAT date + time — for overlap maths. */
function absMins(dateStr, time) { return dayNumber(dateStr) * 1440 + toMins(time); }

function normaliseSchedule(schedule) {
  if (!Array.isArray(schedule) || !schedule.length) throw httpError(400, 'Add at least one day and time');
  const out = schedule.map(s => ({ weekday: Number(s.weekday), time: String(s.time || '').slice(0, 5) }));
  if (out.some(s => !(s.weekday >= 0 && s.weekday <= 6) || !/^\d{2}:\d{2}$/.test(s.time))) {
    throw httpError(400, 'Each time slot needs a day and a time');
  }
  const seen = new Set();
  for (const s of out) {
    const k = s.weekday + '|' + s.time;
    if (seen.has(k)) throw httpError(400, `${WEEKDAYS[s.weekday]} ${s.time} is listed twice`);
    seen.add(k);
  }
  /* two slots on the same day must not overlap each other */
  for (const a of out) for (const b of out) {
    if (a !== b && a.weekday === b.weekday && Math.abs(toMins(a.time) - toMins(b.time)) < CLASS_MINS) {
      throw httpError(400, `${WEEKDAYS[a.weekday]} ${a.time} and ${b.time} overlap — classes are ${CLASS_MINS} minutes`);
    }
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
}

/** The next `count` class slots on the weekly pattern from startDate (skipping times already past today). */
function generateSlots(startDate, pattern, count) {
  const now = nowWAT();
  const out = [];
  for (let day = 0; out.length < count && day < 366 * 8; day++) {
    const d = addDays(startDate, day), wd = weekday(d);
    for (const s of pattern) {
      if (out.length >= count) break;
      if (s.weekday !== wd) continue;
      if (d === now.date && toMins(s.time) <= now.mins) continue;
      out.push({ d, t: s.time });
    }
  }
  return out;
}

/* ══════════════ Finding the student ══════════════ */

async function searchStudents(q) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const r = await pool.query(
    `SELECT DISTINCT u.id, u.name, u.staff_id AS "staffId", u.email, u.is_active AS "isActive",
            sp.parent_email AS "parentEmail", sp.credits
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     LEFT JOIN parent_children pc ON pc.student_id = u.id
     LEFT JOIN users p ON p.id = pc.parent_id
     WHERE u.role = 'student' AND (
             UPPER(u.staff_id) = UPPER($1)
          OR u.name ILIKE '%' || $1 || '%'
          OR LOWER(u.email) = LOWER($1)
          OR LOWER(sp.parent_email) = LOWER($1)
          OR LOWER(p.email) = LOWER($1)
          OR (length(regexp_replace($1, '[^0-9]', '', 'g')) >= 7
              AND right(regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 9)
                  = right(regexp_replace($1, '[^0-9]', '', 'g'), 9)) )
     ORDER BY u.is_active DESC, u.name
     LIMIT 20`,
    [term]
  );
  return r.rows;
}

/** Group a student's upcoming 1-on-1 classes into courses. */
async function loadSeries(db, studentId, { lock = false } = {}) {
  const now = nowWAT();
  const rows = (await db.query(
    `SELECT b.id, to_char(b.date,'YYYY-MM-DD') AS d, to_char(b.time,'HH24:MI') AS t, b.tutor_id,
            COALESCE(b.class_link, '') AS class_link, b.enrolment_id, b.lesson_number_in_grade,
            b.pathway_lesson_id, b.lesson_name, b.subject, b.grade, b.notes
     FROM bookings b
     WHERE b.student_id = $1 AND b.status = 'scheduled' AND b.is_demo = FALSE
       AND (b.date > $2::date OR (b.date = $2::date AND b.time > $3::time))
     ORDER BY b.date, b.time
     ${lock ? 'FOR UPDATE' : ''}`,
    [studentId, now.date, fromMins(now.mins)]
  )).rows;

  const groups = new Map();
  for (const r of rows) {
    const key = r.enrolment_id ? 'e:' + r.enrolment_id : 't:' + r.tutor_id + '|' + r.class_link;
    if (!groups.has(key)) groups.set(key, { key, enrolmentId: r.enrolment_id || null, tutorId: r.tutor_id, classLink: r.class_link, rows: [] });
    groups.get(key).rows.push(r);
  }
  return [...groups.values()];
}

/** Weekly pattern of a course: the enrolment's schedule, else what its upcoming classes use. */
function derivePattern(series, enrolment) {
  let sched = enrolment && enrolment.schedule;
  try { if (typeof sched === 'string') sched = JSON.parse(sched); } catch { sched = null; }
  const fromEnrol = (Array.isArray(sched) ? sched : [])
    .map(s => ({ weekday: Number(s.weekday), time: String(s.time || '').slice(0, 5) }))
    .filter(s => s.weekday >= 0 && s.weekday <= 6 && /^\d{2}:\d{2}$/.test(s.time));
  /* Trust the enrolment only if its slots actually appear in the upcoming classes */
  const used = new Map();
  for (const r of series.rows) {
    const k = weekday(r.d) + '|' + r.t;
    used.set(k, (used.get(k) || 0) + 1);
  }
  if (fromEnrol.length && fromEnrol.every(s => used.has(s.weekday + '|' + s.time))) return fromEnrol;
  const min = series.rows.length >= 4 ? 2 : 1;
  return [...used.entries()].filter(([, n]) => n >= min)
    .map(([k]) => { const [w, t] = k.split('|'); return { weekday: Number(w), time: t }; })
    .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
}

async function _enrolment(db, id) {
  if (!id) return null;
  return (await db.query(
    `SELECT e.*, p.name AS pathway_name FROM enrolments e LEFT JOIN pathways p ON p.id = e.pathway_id WHERE e.id = $1`, [id]
  )).rows[0] || null;
}

async function _gradeLessons(db, pathwayId, gradeNumber) {
  if (!pathwayId || !gradeNumber) return [];
  return (await db.query(
    `SELECT pl.id, pl.lesson_number, pl.title
     FROM pathway_lessons pl JOIN pathway_grades pg ON pg.id = pl.grade_id
     WHERE pg.pathway_id = $1 AND pg.grade_number = $2 AND pg.is_active = TRUE AND pl.is_active = TRUE
     ORDER BY pl.lesson_number`,
    [pathwayId, gradeNumber]
  )).rows;
}

async function _completedCount(db, studentId, series) {
  const r = series.enrolmentId
    ? await db.query(`SELECT COUNT(*)::int n FROM bookings WHERE enrolment_id = $1 AND status IN ('completed','partially_completed')`, [series.enrolmentId])
    : await db.query(
        `SELECT COUNT(*)::int n FROM bookings WHERE student_id = $1 AND tutor_id = $2 AND COALESCE(class_link,'') = $3
           AND is_demo = FALSE AND status IN ('completed','partially_completed')`,
        [studentId, series.tutorId, series.classLink]);
  return r.rows[0].n;
}

/** Everything the tool shows about a student. */
async function studentDetails(studentId) {
  const u = (await pool.query(
    `SELECT u.id, u.name, u.staff_id AS "staffId", u.email, u.phone, u.whatsapp, u.date_of_birth AS "dateOfBirth",
            u.timezone, u.is_active AS "isActive", u.created_at AS "createdAt",
            sp.grade, sp.age, sp.credits, sp.parent_name AS "parentName", sp.parent_email AS "parentEmail",
            COALESCE(sp.class_paused, FALSE) AS paused, sp.pause_kind AS "pauseKind", sp.paused_reason AS "pausedReason",
            COALESCE(sp.credits_suspended, FALSE) AS "creditsSuspended"
     FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'student'`, [studentId])).rows[0];
  if (!u) throw httpError(404, 'Student not found');

  const tz = await resolveUserTimeZone(u.id, u.email);
  const timezoneKnown = isValidTimeZone(u.timezone) || tz !== PLATFORM_TZ;

  /* Country: from the demo booking or the enquiry */
  const country = (await pool.query(
    `SELECT notes->>'country' AS c FROM bookings WHERE student_id = $1 AND notes->>'country' IS NOT NULL LIMIT 1`, [u.id]
  )).rows[0]?.c || (await pool.query(
    `SELECT country FROM enrollment_requests WHERE (student_id = $1 OR LOWER(email) = LOWER($2)) AND country IS NOT NULL LIMIT 1`, [u.id, u.email]
  ).catch(() => ({ rows: [] }))).rows[0]?.country || null;

  const family = (await pool.query(
    `SELECT p.id, p.name, p.email,
            (SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'staffId', c.staff_id) ORDER BY c.name)
             FROM parent_children pc2 JOIN users c ON c.id = pc2.student_id WHERE pc2.parent_id = p.id AND c.id <> $1) AS siblings
     FROM parent_children pc JOIN users p ON p.id = pc.parent_id WHERE pc.student_id = $1 LIMIT 1`, [u.id]
  ).catch(() => ({ rows: [] }))).rows[0] || null;

  const series = await loadSeries(pool, u.id);
  const courses = [];
  for (const s of series) {
    const enrol = await _enrolment(pool, s.enrolmentId);
    const tutor = (await pool.query(
      `SELECT id, name, staff_id AS "staffId", email, timezone FROM users WHERE id = $1`, [s.tutorId])).rows[0] || null;
    const notes0 = s.rows[0].notes || {};
    const completed = await _completedCount(pool, u.id, s);
    const pathwayId = (enrol && enrol.pathway_id) || notes0.pathwayId || null;
    const gradeNumber = (enrol && enrol.current_grade) || notes0.gradeNumber || null;
    const lessons = await _gradeLessons(pool, pathwayId, gradeNumber);
    const gradeTotal = lessons.length || (enrol && enrol.total_lessons) || FULL_GRADE_LESSONS;
    const done = enrol ? (enrol.lessons_completed || 0) : completed;
    courses.push({
      key: s.key,
      enrolmentId: s.enrolmentId,
      title: (enrol && enrol.pathway_name) || notes0.course || s.rows[0].subject || 'Course',
      pathwayId, gradeNumber,
      tutor, classLink: s.classLink,
      pattern: derivePattern(s, enrol),
      upcoming: s.rows.length,
      completed,
      lessonsCompleted: done,
      gradeTotal,
      notYetBooked: Math.max(0, gradeTotal - done - s.rows.length),
      nextClass: { date: s.rows[0].d, time: s.rows[0].t },
      lastClass: { date: s.rows[s.rows.length - 1].d, time: s.rows[s.rows.length - 1].t },
    });
  }

  const batches = (await pool.query(
    `SELECT b.id, b.batch_ref AS "batchRef", b.status, u_t.name AS "tutorName",
            (SELECT COUNT(*)::int FROM bookings x WHERE x.batch_id = b.id AND x.status = 'scheduled' AND x.date >= CURRENT_DATE) AS upcoming
     FROM batch_members bm JOIN batches b ON b.id = bm.batch_id LEFT JOIN users u_t ON u_t.id = b.tutor_id
     WHERE bm.student_id = $1 AND bm.status = 'active' AND b.status IN ('active','paused')`, [u.id]
  ).catch(() => ({ rows: [] }))).rows;

  const history = (await pool.query(
    `SELECT rl.created_at AS "createdAt", rl.requested_by AS "requestedBy", rl.reason, rl.old_schedule AS "oldSchedule",
            rl.new_schedule AS "newSchedule", rl.start_date AS "startDate", rl.classes_moved AS "classesMoved",
            rl.classes_added AS "classesAdded", ot.name AS "oldTutor", nt.name AS "newTutor", pb.name AS "performedBy"
     FROM reschedule_log rl
     LEFT JOIN users ot ON ot.id = rl.old_tutor_id LEFT JOIN users nt ON nt.id = rl.new_tutor_id
     LEFT JOIN users pb ON pb.id = rl.performed_by
     WHERE rl.student_id = $1 ORDER BY rl.created_at DESC LIMIT 20`, [u.id]
  ).catch(() => ({ rows: [] }))).rows;

  return { student: { ...u, timezone: tz, timezoneKnown, country }, family, courses, batches, history };
}

/* ══════════════ Preview ══════════════ */

/**
 * Work out the new classes and any clashes.
 * Returns { slots, clashes, suggestions, ... } — used by preview and,
 * inside the apply transaction, as the final check.
 */
async function buildPlan(db, input, { lock = false } = {}) {
  const { studentId, courseKey, startDate } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) throw httpError(400, 'Choose the start date');
  if (startDate < nowWAT().date) throw httpError(400, 'The start date cannot be in the past');
  const pattern = normaliseSchedule(input.schedule);

  const stu = (await db.query(
    `SELECT u.id, u.name, u.email, COALESCE(sp.class_paused, FALSE) AS paused
     FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = $1 AND u.role = 'student'`, [studentId])).rows[0];
  if (!stu) throw httpError(404, 'Student not found');
  if (stu.paused) throw httpError(400, `${stu.name} is paused or on hold — resume them from Pause & Resume instead`);

  const series = (await loadSeries(db, studentId, { lock })).find(s => s.key === courseKey);
  if (!series) throw httpError(404, 'That course has no upcoming classes to reschedule');
  const enrol = await _enrolment(db, series.enrolmentId);

  const tutorId = input.tutorId || series.tutorId;
  const tutor = (await db.query(`SELECT id, name, email FROM users WHERE id = $1 AND role = 'tutor'`, [tutorId])).rows[0];
  if (!tutor) throw httpError(404, 'Teacher not found');
  const classLink = String(input.classLink || series.classLink || '').trim();

  /* Classes to place: the upcoming ones (in lesson order), plus unbooked grade lessons if asked */
  const moving = series.rows;
  let extra = [];
  if (input.topUp) {
    const notes0 = moving[0].notes || {};
    const pathwayId = (enrol && enrol.pathway_id) || notes0.pathwayId || null;
    const gradeNumber = (enrol && enrol.current_grade) || notes0.gradeNumber || null;
    const lessons = await _gradeLessons(db, pathwayId, gradeNumber);
    const gradeTotal = lessons.length || (enrol && enrol.total_lessons) || FULL_GRADE_LESSONS;
    const done = enrol ? (enrol.lessons_completed || 0) : await _completedCount(db, studentId, series);
    const lastNum = Math.max(done, ...moving.map(r => r.lesson_number_in_grade || 0));
    const missing = Math.max(0, gradeTotal - done - moving.length);
    for (let i = 0; i < missing; i++) {
      const n = lastNum + 1 + i;
      const l = lessons.find(x => x.lesson_number === n) || null;
      extra.push({ lessonNumber: n, lessonId: l ? l.id : null, title: l ? l.title : null });
    }
  }

  const total = moving.length + extra.length;
  const slots = generateSlots(startDate, pattern, total).map((s, i) => {
    const m = moving[i];
    return m
      ? { ...s, bookingId: m.id, lessonNumber: m.lesson_number_in_grade, title: m.lesson_name, isNew: false }
      : { ...s, bookingId: null, lessonNumber: extra[i - moving.length].lessonNumber, title: extra[i - moving.length].title, isNew: true,
          lessonId: extra[i - moving.length].lessonId };
  });
  if (!slots.length) throw httpError(400, 'Nothing to schedule');

  /* Busy times: the teacher's other classes and the student's other classes (incl. batches) */
  const movingIds = moving.map(r => r.id);
  const first = slots[0].d, last = slots[slots.length - 1].d;
  const busy = (await db.query(
    `SELECT b.id, to_char(b.date,'YYYY-MM-DD') AS d, to_char(b.time,'HH24:MI') AS t,
            COALESCE(b.duration_mins, ${CLASS_MINS}) AS mins, (b.tutor_id = $1) AS tutor_clash,
            COALESCE(u.name, b.notes->>'batchRef', b.lesson_name, 'another class') AS who
     FROM bookings b LEFT JOIN users u ON u.id = b.student_id
     WHERE b.status = 'scheduled' AND b.date BETWEEN $2::date - 1 AND $3::date + 1
       AND b.id <> ALL($4::uuid[])
       AND (b.tutor_id = $1 OR b.student_id = $5
            OR b.batch_id IN (SELECT batch_id FROM batch_members WHERE student_id = $5 AND status = 'active'))`,
    [tutor.id, first, last, movingIds, studentId]
  )).rows.map(b => ({ ...b, start: absMins(b.d, b.t), end: absMins(b.d, b.t) + Number(b.mins) }));

  const clashAt = (d, t) => {
    const s = absMins(d, t), e = s + CLASS_MINS;
    return busy.find(b => b.start < e && s < b.end) || null;
  };

  let clashes = 0;
  for (const s of slots) {
    const c = clashAt(s.d, s.t);
    if (c) {
      clashes++;
      s.clash = { who: c.who, withTeacher: c.tutor_clash, time: c.t };
    }
  }

  /* Suggestions: for each weekly slot that clashes, the nearest times free on every one of its dates */
  const suggestions = {};
  for (const p of pattern) {
    const mine = slots.filter(s => weekday(s.d) === p.weekday && s.t === p.time);
    if (!mine.some(s => s.clash)) continue;
    const others = pattern.filter(o => o !== p && o.weekday === p.weekday).map(o => toMins(o.time));
    const base = toMins(p.time);
    const cands = [];
    for (let m = DAY_START; m <= DAY_END; m += 30) cands.push(m);
    cands.sort((a, b) => Math.abs(a - base) - Math.abs(b - base));
    const free = [];
    for (const m of cands) {
      if (m === base) continue;
      if (others.some(o => Math.abs(o - m) < CLASS_MINS)) continue;
      const t = fromMins(m);
      if (mine.every(s => !clashAt(s.d, t))) free.push(t);
      if (free.length >= 4) break;
    }
    suggestions[p.weekday + '|' + p.time] = free.sort();
  }

  return {
    student: stu, tutor, classLink, enrol, series, pattern,
    oldPattern: derivePattern(series, enrol),
    slots, clashes, suggestions,
    moved: moving.length, added: extra.length,
    firstClass: { date: slots[0].d, time: slots[0].t },
    lastClass: { date: last, time: slots[slots.length - 1].t },
  };
}

function planForClient(plan) {
  return {
    success: true,
    pattern: plan.pattern,
    oldPattern: plan.oldPattern,
    tutor: { id: plan.tutor.id, name: plan.tutor.name },
    classLink: plan.classLink,
    moved: plan.moved, added: plan.added, total: plan.slots.length,
    clashes: plan.clashes,
    suggestions: plan.suggestions,
    firstClass: plan.firstClass, lastClass: plan.lastClass,
    slots: plan.slots.map(s => ({ date: s.d, time: s.t, lessonNumber: s.lessonNumber, title: s.title, isNew: s.isNew, clash: s.clash || null })),
  };
}

/* ══════════════ Apply ══════════════ */

async function applyReschedule(input, performedBy) {
  if (!REQUESTERS.includes(input.requestedBy)) throw httpError(400, 'Choose who requested the reschedule');
  const reason = String(input.reason || '').trim();
  if (reason.length < 30) throw httpError(400, 'Please explain the reason in at least 30 characters');

  const client = await pool.connect();
  let plan;
  try {
    await client.query('BEGIN');
    /* One reschedule per teacher at a time, so two people cannot take the same slot */
    const tutorForLock = input.tutorId || null;
    if (tutorForLock) await client.query(`SELECT pg_advisory_xact_lock(hashtext('tutor-schedule:' || $1))`, [tutorForLock]);
    plan = await buildPlan(client, input, { lock: true });
    if (!tutorForLock) await client.query(`SELECT pg_advisory_xact_lock(hashtext('tutor-schedule:' || $1))`, [plan.tutor.id]);
    if (plan.clashes) throw httpError(409, `${plan.clashes} of the new classes clash with other classes — nothing was changed`, { plan: planForClient(plan) });

    const stamp = new Date().toISOString();
    const log = await client.query(
      `INSERT INTO reschedule_log (student_id, enrolment_id, requested_by, reason, old_schedule, new_schedule,
                                   old_tutor_id, new_tutor_id, start_date, classes_moved, classes_added, performed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12) RETURNING id`,
      [plan.student.id, plan.series.enrolmentId, input.requestedBy, reason,
       JSON.stringify(plan.oldPattern), JSON.stringify(plan.pattern),
       plan.series.tutorId, plan.tutor.id, input.startDate, plan.moved, plan.added, performedBy.id]
    );
    const rescheduleId = log.rows[0].id;
    const tutorName = plan.tutor.name;

    const movedIds = [];
    for (const s of plan.slots) {
      if (!s.isNew) {
        await client.query(
          `UPDATE bookings
           SET date = $1::date, time = $2::time, tutor_id = $3, class_link = $4,
               notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object(
                 'rescheduledAt', $5::text, 'rescheduleId', $6::text, 'tutorName', $7::text, 'classLink', $4::text)
           WHERE id = $8`,
          [s.d, s.t, plan.tutor.id, plan.classLink, stamp, rescheduleId, tutorName, s.bookingId]
        );
        movedIds.push(s.bookingId);
      }
    }
    if (plan.added) {
      const tmpl = plan.series.rows[plan.series.rows.length - 1];
      const n0 = tmpl.notes || {};
      for (const s of plan.slots.filter(x => x.isNew)) {
        await client.query(
          `INSERT INTO bookings
             (subject, grade, date, time, class_link, status, is_demo, tutor_id, student_id, enrolment_id,
              lesson_name, notes, booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade)
           VALUES ($1, $2, $3::date, $4::time, $5, 'scheduled', FALSE, $6, $7, $8, $9, $10, NOW(), NOW(), $11, $12)`,
          [tmpl.subject || 'Coding', tmpl.grade, s.d, s.t, plan.classLink, plan.tutor.id, plan.student.id,
           plan.series.enrolmentId, s.title || `${n0.course || 'Lesson'} ${s.lessonNumber}`,
           JSON.stringify({ ...n0, lessonTitle: s.title || '', lessonNumber: s.lessonNumber, tutorName, classLink: plan.classLink,
                            isPaidClass: true, rescheduledAt: stamp, rescheduleId, addedByReschedule: true }),
           s.lessonId || null, s.lessonNumber]
        );
      }
    }
    if (plan.series.enrolmentId) {
      await client.query(
        `UPDATE enrolments SET schedule = $1, tutor_id = $2, class_link = $3, updated_at = NOW() WHERE id = $4`,
        [JSON.stringify(plan.pattern), plan.tutor.id, plan.classLink, plan.series.enrolmentId]
      );
    }
    await client.query('COMMIT');

    /* After commit: reminders re-arm for the new times; emails */
    require('./rescheduleService').clearReminders(movedIds).catch(() => {});
    _notify(plan, input, reason).catch(e => logger.warn('[RESCHEDULE-TOOL] Email failed: ' + e.message));
    logger.info(`[RESCHEDULE-TOOL] ${plan.student.name}: ${plan.moved} moved + ${plan.added} added from ${input.startDate} with ${tutorName} by ${performedBy.email} (${input.requestedBy})`);
    return { ...planForClient(plan), rescheduleId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function _patternText(pattern, tz) {
  /* Each weekly slot in the recipient's own timezone (using its first real date) */
  return pattern.map(p => {
    let d = nowWAT().date;
    while (weekday(d) !== p.weekday) d = addDays(d, 1);
    const f = formatForTimeZone(d, p.time, tz);
    return f ? `${f.date.split(',')[0]} ${f.time} ${f.abbr}` : `${WEEKDAYS[p.weekday]} ${p.time} WAT`;
  }).join(', ');
}

async function _notify(plan, input, reason) {
  const emailSvc = require('./emailService');
  const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const who = { student: 'the student', parent: 'the parent', teacher: 'the teacher', stemnest: 'StemNest' }[input.requestedBy];

  const prof = (await pool.query(
    `SELECT sp.parent_email, sp.parent_name FROM student_profiles sp WHERE sp.user_id = $1`, [plan.student.id])).rows[0] || {};
  const parentTo = prof.parent_email || plan.student.email;
  const tz = await resolveUserTimeZone(plan.student.id, plan.student.email);
  const first = formatForTimeZone(plan.firstClass.date, plan.firstClass.time, tz);
  const box = (lines) => `<div style="background:#f0f4ff;border-left:4px solid #1a56db;border-radius:10px;padding:16px 20px;margin:16px 0;">${lines}</div>`;

  if (parentTo) {
    await emailSvc.sendEmail({
      to: parentTo,
      subject: `📅 ${plan.student.name}'s class schedule has changed`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;line-height:1.6;color:#1a202c;">
        <h2 style="color:#1a56db;">New class schedule</h2>
        <p>Hi ${esc(prof.parent_name || plan.student.name)},</p>
        <p>${esc(plan.student.name)}'s classes have been moved to a new weekly schedule.</p>
        ${box(`<strong>New schedule:</strong> ${esc(_patternText(plan.pattern, tz))}<br>
               <strong>First class:</strong> ${esc(first ? first.full : plan.firstClass.date)}<br>
               <strong>Teacher:</strong> ${esc(plan.tutor.name)}<br>
               <strong>Classes booked:</strong> ${plan.slots.length}<br>
               ${plan.classLink ? `<strong>Class link:</strong> <a href="${esc(plan.classLink)}">${esc(plan.classLink)}</a>` : ''}`)}
        <a href="${appUrl}/pages/student-dashboard.html" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 28px;border-radius:50px;font-weight:700;">See the schedule →</a>
      </div>`,
      template: 'schedule_changed',
    });
  }

  const tutors = [...new Set([plan.series.tutorId, plan.tutor.id])];
  for (const tid of tutors) {
    const t = (await pool.query(`SELECT id, name, email FROM users WHERE id = $1`, [tid])).rows[0];
    if (!t || !t.email) continue;
    const ttz = await resolveUserTimeZone(t.id, t.email);
    const leaving = tid !== plan.tutor.id;
    const tf = formatForTimeZone(plan.firstClass.date, plan.firstClass.time, ttz);
    await emailSvc.sendEmail({
      to: t.email,
      subject: leaving ? `📅 ${plan.student.name} has moved to another teacher` : `📅 New schedule for ${plan.student.name}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;line-height:1.6;">
        <h2 style="color:#1a56db;">${leaving ? 'Student reassigned' : 'Schedule changed'}</h2>
        <p>Hi ${esc(t.name)},</p>
        <p>${leaving
          ? `${esc(plan.student.name)}'s classes have moved to ${esc(plan.tutor.name)}. Their old slots on your calendar are now free.`
          : `${esc(plan.student.name)}'s classes have been rescheduled (requested by ${who}).`}</p>
        ${leaving ? '' : box(`<strong>New schedule:</strong> ${esc(_patternText(plan.pattern, ttz))}<br>
               <strong>First class:</strong> ${esc(tf ? tf.full : plan.firstClass.date)}<br>
               <strong>Reason:</strong> ${esc(reason)}`)}
        <a href="${appUrl}/pages/tutor-dashboard.html" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">View calendar →</a>
      </div>`,
      template: 'schedule_changed_tutor',
    });
  }
}

module.exports = {
  REQUESTERS, searchStudents, studentDetails, buildPlan, planForClient, applyReschedule,
  _internals: { generateSlots, normaliseSchedule, derivePattern },
};
