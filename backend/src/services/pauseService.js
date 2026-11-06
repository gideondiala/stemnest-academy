/**
 * Pause / resume a student's classes.
 *
 * Used by Post-Sales (manual pause and resume) and automatically by credits:
 * when a student's balance reaches -2 their remaining classes are put on
 * hold, and when the parent tops up they come back on the same days, times,
 * teacher and link.
 *
 * A paused student has no class on any calendar. Every 1-on-1 class that
 * has not been ended goes on hold (cancelled and tagged cancelledByPause),
 * so nothing asks to be ended, reminded or moved while they are away. A
 * credit pause leaves classes that have already happened, so the tutor can
 * still end them and be paid. The details of each course (teacher, days and
 * times, pathway, lessons taught and next lesson) are saved with the pause
 * (student_profiles.pause_snapshot), and on resume each course comes back in
 * lesson order on its saved schedule, or with a new teacher, days and times.
 *
 * A "course" is the student's classes that belong together: the same
 * enrolment, or (for older classes without one) the same teacher and class
 * link. Batch classes are not paused: the batch carries on, and a paused
 * member is simply not charged or reminded.
 *
 * Booking date/time are WAT. pauseStudent/resumeStudent run inside the
 * caller's transaction; the auto* helpers and holdStrayClasses open their own.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');
const rescheduleSvc = require('./rescheduleService');

const CREDIT_PAUSE_AT = -2;   // balance at which classes go on hold (2-class grace)
const CLASS_MINS = 60;

function nowWAT() {
  const d = new Date(Date.now() + 60 * 60000).toISOString();
  return { d: d.slice(0, 10), t: d.slice(11, 16) };
}
function todayWAT() { return nowWAT().d; }
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function absMins(d, t) {
  const [y, m, dd] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number);
  return Date.UTC(y, m - 1, dd) / 60000 + h * 60 + mi;
}
function httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, extra });
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** [{weekday, time}] → validated, sorted, without repeats; null when empty. */
function normaliseSchedule(schedule) {
  if (!Array.isArray(schedule)) return null;
  const out = [], seen = new Set();
  for (const s of schedule) {
    const weekday = Number(s && s.weekday);
    const m = String((s && s.time) || '').match(/^(\d{1,2}):(\d{2})/);
    if (!(weekday >= 0 && weekday <= 6) || !m) throw httpError(400, 'Each class day needs a weekday and a time');
    const time = m[1].padStart(2, '0') + ':' + m[2];
    if (seen.has(weekday + '|' + time)) continue;
    seen.add(weekday + '|' + time);
    out.push({ weekday, time });
  }
  return out.length ? out.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)) : null;
}

/** The course a class belongs to. */
function courseKey(r) {
  return r.enrolment_id ? 'e:' + r.enrolment_id : 't:' + (r.tutor_id || '') + '|' + (r.class_link || '');
}

/** The weekly days and times a course runs on, read from its classes. */
function schedulePattern(rows) {
  const sample = rows.slice(0, 12);
  const count = {};
  for (const r of sample) { const k = weekdayOf(r.d) + '|' + r.t; count[k] = (count[k] || 0) + 1; }
  let keys = Object.keys(count).filter(k => count[k] >= 2);
  if (!keys.length) keys = Object.keys(count);     // too few classes to see a pattern: use each one
  return keys.map(k => ({ weekday: Number(k.split('|')[0]), time: k.split('|')[1] }))
    .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)).slice(0, 7);
}

/** `count` class slots on the weekly schedule, from startDate, all after now. */
function futureSlots(startDate, schedule, count) {
  const now = nowWAT(), out = [];
  for (let day = 0; out.length < count && day < 366 * 6; day++) {
    const d = addDays(startDate, day), wd = weekdayOf(d);
    for (const s of schedule) {
      if (s.weekday !== wd || out.length >= count) continue;
      if (d < now.d || (d === now.d && s.time <= now.t)) continue;
      out.push({ d, t: s.time });
    }
  }
  return out;
}

const CLASS_COLS = `b.id, to_char(b.date,'YYYY-MM-DD') AS d, to_char(b.time,'HH24:MI') AS t,
  b.tutor_id, b.class_link, b.enrolment_id, b.lesson_number_in_grade AS lesson_number, b.lesson_name, b.notes`;

/** The student's 1-on-1 classes that have not been ended, oldest first. */
async function openClasses(db, studentId, { lock = false } = {}) {
  const r = await db.query(
    `SELECT ${CLASS_COLS} FROM bookings b
     WHERE b.student_id = $1 AND b.status = 'scheduled' AND b.is_demo = FALSE AND b.batch_id IS NULL
     ORDER BY b.date, b.time ${lock ? 'FOR UPDATE' : ''}`,
    [studentId]
  );
  return r.rows;
}

function isOverdue(r, now = nowWAT()) {
  return r.d < now.d || (r.d === now.d && r.t <= now.t);
}

/**
 * What a pause keeps for each course: teacher, link, days and times,
 * pathway and grade, lessons taught and the next lesson. `rows` are the
 * classes going on hold, oldest first.
 */
async function describeCourses(db, studentId, rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = courseKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const enrolIds = [...new Set(rows.map(r => r.enrolment_id).filter(Boolean))];
  const enrols = enrolIds.length ? (await db.query(
    `SELECT e.id, e.pathway_id, e.current_grade, e.lessons_completed, p.name AS pathway_name
     FROM enrolments e LEFT JOIN pathways p ON p.id = e.pathway_id WHERE e.id = ANY($1::uuid[])`, [enrolIds])).rows : [];
  const tutorIds = [...new Set(rows.map(r => r.tutor_id).filter(Boolean))];
  const tutors = tutorIds.length ? (await db.query(`SELECT id, name FROM users WHERE id = ANY($1::uuid[])`, [tutorIds])).rows : [];

  const out = [];
  for (const [key, list] of groups) {
    const first = list[0];
    const e = enrols.find(x => x.id === first.enrolment_id) || null;
    const notes = first.notes || {};
    const ordered = [...list].sort((a, b) => (a.lesson_number || 1e9) - (b.lesson_number || 1e9) || absMins(a.d, a.t) - absMins(b.d, b.t));
    const upcoming = list.filter(r => !isOverdue(r));
    let taught = e ? (e.lessons_completed || 0) : null;
    if (taught === null) {
      const c = await db.query(
        `SELECT COUNT(*)::int AS n FROM bookings
         WHERE student_id = $1 AND is_demo = FALSE AND batch_id IS NULL
           AND status IN ('completed','partially_completed')
           AND tutor_id IS NOT DISTINCT FROM $2 AND COALESCE(class_link,'') = $3`,
        [studentId, first.tutor_id, first.class_link || '']);
      taught = c.rows[0].n;
    }
    out.push({
      key,
      enrolmentId: first.enrolment_id || null,
      tutorId: first.tutor_id || null,
      tutorName: (tutors.find(t => t.id === first.tutor_id) || {}).name || notes.tutorName || null,
      classLink: first.class_link || '',
      pathwayId: (e && e.pathway_id) || notes.pathwayId || null,
      pathwayName: (e && e.pathway_name) || notes.course || null,
      grade: (e && e.current_grade) || null,
      schedule: schedulePattern(upcoming.length ? upcoming : list),
      classes: list.length,
      lessonsTaught: taught,
      nextLesson: ordered[0].lesson_number || null,
      nextLessonName: ordered[0].lesson_name || null,
    });
  }
  return out;
}

/**
 * The classes a pause put on hold, each course in lesson order. Pauses tag
 * them (notes.cancelledByPause); for pauses made before tagging existed, they
 * are the cancelled paid classes dated after the student's last live class.
 */
async function pausedClasses(client, studentId) {
  const order = `ORDER BY b.lesson_number_in_grade NULLS LAST, b.date, b.time FOR UPDATE`;
  const tagged = await client.query(
    `SELECT ${CLASS_COLS} FROM bookings b
     WHERE b.student_id = $1 AND b.status = 'cancelled' AND b.notes->>'cancelledByPause' IS NOT NULL ${order}`,
    [studentId]
  );
  if (tagged.rows.length) return tagged.rows;

  const legacy = await client.query(
    `SELECT ${CLASS_COLS} FROM bookings b
     WHERE b.student_id = $1 AND b.status = 'cancelled' AND b.is_demo = FALSE AND b.batch_id IS NULL
       AND b.date > COALESCE(
             (SELECT MAX(date) FROM bookings
               WHERE student_id = $1 AND is_demo = FALSE AND status <> 'cancelled'),
             '1900-01-01'::date)
     ${order}`,
    [studentId]
  );
  return legacy.rows;
}

/** First clash between the proposed slots and other classes of their tutors or the student. */
async function findClash(client, studentId, slots) {
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

/** Two of the new slots overlap each other (the student cannot be in two classes). */
function selfClash(slots) {
  const sorted = [...slots].sort((a, b) => absMins(a.d, a.t) - absMins(b.d, b.t));
  for (let i = 1; i < sorted.length; i++) {
    if (absMins(sorted[i].d, sorted[i].t) - absMins(sorted[i - 1].d, sorted[i - 1].t) < CLASS_MINS) return sorted[i];
  }
  return null;
}

/**
 * What pausing would do, without changing anything: classes not ended whose
 * time has passed (so staff can have the tutor end any that were taught), the
 * upcoming classes, and the details that will be kept for each course.
 */
async function previewPause(db, studentId) {
  const stu = (await db.query(
    `SELECT u.id, u.name, COALESCE(sp.class_paused, FALSE) AS paused FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = $1 AND u.role = 'student'`, [studentId])).rows[0];
  if (!stu) throw httpError(404, 'Student not found');
  const rows = await openClasses(db, studentId);
  const now = nowWAT();
  const tutorIds = [...new Set(rows.map(r => r.tutor_id).filter(Boolean))];
  const tutors = tutorIds.length ? (await db.query(`SELECT id, name FROM users WHERE id = ANY($1::uuid[])`, [tutorIds])).rows : [];
  const nameOf = id => (tutors.find(t => t.id === id) || {}).name || '—';
  return {
    success: true,
    studentName: stu.name,
    alreadyPaused: stu.paused,
    overdue: rows.filter(r => isOverdue(r, now)).map(r => ({
      id: r.id, date: r.d, time: r.t, tutorName: nameOf(r.tutor_id), lessonNumber: r.lesson_number, lessonName: r.lesson_name,
    })),
    upcoming: rows.filter(r => !isOverdue(r, now)).length,
    courses: await describeCourses(db, studentId, rows),
  };
}

/**
 * Put the student's 1-on-1 classes on hold and record the pause.
 * kind: 'manual' (Post-Sales) holds every class not ended; 'credits'
 * (automatic) holds only classes still to come, so the tutor can end any
 * that already happened.
 */
async function pauseStudent(client, studentId, { reason, byUserId = null, kind = 'manual' }) {
  const stu = await client.query(
    `SELECT u.id, u.name, sp.class_paused FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'student' FOR UPDATE OF u`,
    [studentId]
  );
  if (!stu.rows.length) throw httpError(404, 'Student not found');
  if (stu.rows[0].class_paused) throw httpError(400, 'Student is already paused');
  const name = stu.rows[0].name;

  /* Every pathway the student is taking is paused together (one shared credit balance) */
  const enrols = (await client.query(
    `SELECT id, lessons_completed FROM enrolments
     WHERE student_id = $1 AND status = 'active' ORDER BY created_at DESC`,
    [studentId]
  )).rows;
  const enrol = enrols[0];

  const now = nowWAT();
  const open = await openClasses(client, studentId, { lock: true });
  const held = kind === 'credits' ? open.filter(r => !isOverdue(r, now)) : open;
  const overdue = held.filter(r => isOverdue(r, now));
  const courses = await describeCourses(client, studentId, held);

  const pausedAt = new Date().toISOString();
  if (held.length) {
    await client.query(
      `UPDATE bookings
       SET status = 'cancelled',
           notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('cancelledByPause', $2::text)
                   || CASE WHEN id = ANY($3::uuid[]) THEN '{"heldOverdue": true}'::jsonb ELSE '{}'::jsonb END
       WHERE id = ANY($1::uuid[])`,
      [held.map(r => r.id), pausedAt, overdue.map(r => r.id)]
    );
  }

  for (const e of enrols) {
    await client.query(
      `UPDATE enrolments SET status = 'paused', paused_at = NOW(), paused_reason = $2, paused_by = $3,
              last_lesson_at_pause = $4, updated_at = NOW()
       WHERE id = $1`,
      [e.id, reason, byUserId, e.lessons_completed || 0]
    );
  }
  const snapshot = { pausedAt, kind, courses };
  await client.query(
    `INSERT INTO student_profiles (user_id, class_paused, paused_at, paused_reason, paused_by, pause_kind, pause_snapshot)
     VALUES ($1, TRUE, NOW(), $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET class_paused = TRUE, paused_at = NOW(), paused_reason = $2,
                                         paused_by = $3, pause_kind = $4, pause_snapshot = $5`,
    [studentId, reason, byUserId, kind, JSON.stringify(snapshot)]
  );

  return {
    success: true,
    studentName: name,
    bookingsCancelled: held.length,
    overdueHeld: overdue.length,
    courses,
    lessonsPausedAt: enrol ? (enrol.lessons_completed || 0) : null,
    /* per tutor: how many of their classes came off the calendar (for notifyTutors) */
    tutorCounts: held.reduce((m, r) => { if (r.tutor_id) m[r.tutor_id] = (m[r.tutor_id] || 0) + 1; return m; }, {}),
  };
}

/**
 * Bring back the classes the pause put on hold, each course in lesson order,
 * from startDate.
 *   courses: { [courseKey]: { tutorId?, schedule?, classLink? } } changes a
 *   course's teacher, days and times or link; a course left out comes back
 *   with its saved teacher, days, times and link.
 *   (Older callers: keepSchedule = false with tutorId + schedule changes the
 *   only course.)
 * If nothing was put on hold and a teacher + schedule are given, new classes
 * are created from the next pathway lesson. If nothing was put on hold and no
 * schedule is given (e.g. a batch-only student), the student is just unpaused.
 */
async function resumeStudent(client, studentId, { startDate, keepSchedule = true, tutorId, schedule, classLink, courses: changes = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) throw httpError(400, 'A start date is required');
  if (startDate < todayWAT()) throw httpError(400, 'The start date cannot be in the past');

  const stu = await client.query(
    `SELECT u.id, u.name, u.email, sp.class_paused, sp.grade, sp.pause_snapshot FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'student' FOR UPDATE OF u`,
    [studentId]
  );
  if (!stu.rows.length) throw httpError(404, 'Student not found');
  const student = stu.rows[0];
  if (!student.class_paused) throw httpError(400, 'Student is not currently paused');
  const saved = (student.pause_snapshot && student.pause_snapshot.courses) || [];

  const enrol = (await client.query(
    `SELECT * FROM enrolments WHERE student_id = $1
     ORDER BY CASE WHEN status = 'paused' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
    [studentId]
  )).rows[0] || null;

  const loadTutor = async (id) => {
    if (!id) throw httpError(400, 'This course has no teacher yet. Choose a teacher for it.');
    const t = (await client.query(`SELECT id, name, is_active FROM users WHERE id = $1 AND role = 'tutor'`, [id])).rows[0];
    if (!t) throw httpError(404, 'Teacher not found');
    return t;
  };
  const legacySchedule = normaliseSchedule(schedule);

  const rows = await pausedClasses(client, studentId);
  let slots = [];
  let mode;
  const changed = [];     // courses resumed with a new teacher / schedule / link (enrolments to update)

  if (rows.length) {
    const groups = new Map();
    for (const r of rows) {
      const k = courseKey(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    if (!keepSchedule && !changes && groups.size > 1) {
      throw httpError(400, `${student.name} takes more than one course. Choose the teacher and schedule for each course.`);
    }
    for (const [key, list] of groups) {
      let change = changes && changes[key] ? changes[key] : null;
      if (!change && !keepSchedule && groups.size === 1) change = { tutorId, schedule, classLink };
      const keep = saved.find(c => c.key === key) || null;
      const wantSchedule = change ? normaliseSchedule(change.schedule) : null;
      const tutor = await loadTutor((change && change.tutorId) || (keep && keep.tutorId) || list[0].tutor_id);
      if (!tutor.is_active) throw httpError(400, `${tutor.name} is no longer an active teacher. Choose a new teacher for this course.`);
      const sched = wantSchedule || (keep && keep.schedule && keep.schedule.length ? keep.schedule : schedulePattern(list));
      if (!sched.length) throw httpError(400, 'Please add at least one day and time');
      const link = String((change && change.classLink) || (keep && keep.classLink) || list[0].class_link || '').trim();
      const dates = futureSlots(startDate, sched, list.length);
      list.forEach((r, i) => slots.push({ id: r.id, tutor_id: tutor.id, tutorName: tutor.name, class_link: link, d: dates[i].d, t: dates[i].t }));
      if (change) changed.push({ enrolmentId: list[0].enrolment_id, tutorId: tutor.id, classLink: link, schedule: sched });
    }
    mode = changed.length ? 'rescheduled' : 'restored';
  } else if (!(legacySchedule && legacySchedule.length)) {
    mode = 'none';   // nothing was on hold (batch-only, or no future classes): just unpause
  } else {
    if (!tutorId) throw httpError(400, 'Please select a teacher');
    const tutor = await loadTutor(tutorId);
    const count = Math.max(1, (72 - ((enrol && (enrol.last_lesson_at_pause || enrol.lessons_completed)) || 0)));
    mode = 'created';
    slots = futureSlots(startDate, legacySchedule, count).map(dt => ({
      id: null, tutor_id: tutor.id, tutorName: tutor.name,
      class_link: classLink || (enrol && enrol.class_link) || '', d: dt.d, t: dt.t,
    }));
    changed.push({ enrolmentId: enrol ? enrol.id : null, tutorId: tutor.id, classLink: slots[0] ? slots[0].class_link : '', schedule: legacySchedule });
  }

  const own = selfClash(slots);
  if (own) throw httpError(409, `Two of ${student.name}'s classes would overlap on ${own.d} at ${own.t}. Choose different days or times.`);
  const clash = await findClash(client, studentId, slots.map(s => ({ ...s, id: s.id || '00000000-0000-0000-0000-000000000000' })));
  if (clash) throw httpError(409, `Schedule clash on ${clash.d} at ${clash.t} with ${clash.who}. Choose a different start date or time.`, { clash });

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
      const ins = await client.query(
        `INSERT INTO bookings
           (subject, grade, date, time, class_link, status, is_demo, tutor_id, student_id, enrolment_id,
            lesson_name, notes, booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade)
         VALUES ('Coding', $1, $2::date, $3::time, $4, 'scheduled', FALSE, $5, $6, $7, $8, $9, NOW(), NOW(), $10, $11)
         RETURNING id`,
        [student.grade || `Grade ${(enrol && enrol.current_grade) || 1}`, slots[i].d, slots[i].t, slots[i].class_link,
         slots[i].tutor_id, studentId, enrol ? enrol.id : null, l ? l.title : student.name,
         JSON.stringify({ studentName: student.name, email: student.email || '', tutorName: slots[i].tutorName,
                          classLink: slots[i].class_link, isPaidClass: true, resumed: true, resumedAt: new Date().toISOString() }),
         l ? l.id : null, l ? l.lesson_number : fromLesson + i]
      );
      slots[i].id = ins.rows[0].id;
    }
  } else if (mode !== 'none') {
    const at = new Date().toISOString();
    for (const s of slots) {
      await client.query(
        `UPDATE bookings
         SET status = 'scheduled', date = $1::date, time = $2::time, tutor_id = $3, class_link = $4,
             tutor_joined_at = NULL, unended_warned_at = NULL,
             notes = (COALESCE(notes, '{}'::jsonb) - 'cancelledByPause' - 'heldOverdue')
                     || jsonb_build_object('resumedAt', $5::text, 'classLink', $4::text, 'tutorName', $6::text)
         WHERE id = $7`,
        [s.d, s.t, s.tutor_id, s.class_link, at, s.tutorName, s.id]
      );
    }
  }

  /* A course resumed with a new teacher, schedule or link keeps it from now on */
  for (const c of changed) {
    if (!c.enrolmentId) continue;
    await client.query(
      `UPDATE enrolments SET tutor_id = $2, class_link = COALESCE(NULLIF($3, ''), class_link), schedule = $4::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [c.enrolmentId, c.tutorId, c.classLink || '', JSON.stringify(c.schedule)]
    );
  }
  /* Every paused pathway is active again */
  await client.query(
    `UPDATE enrolments SET status = 'active', resumed_at = NOW(), updated_at = NOW()
     WHERE student_id = $1 AND status = 'paused'`,
    [studentId]
  );
  await client.query(
    `UPDATE student_profiles SET class_paused = FALSE, paused_at = NULL, paused_reason = NULL,
            paused_by = NULL, pause_kind = NULL, pause_snapshot = NULL
     WHERE user_id = $1`,
    [studentId]
  );

  /* Re-arm reminders for restored classes (after commit; never throws) */
  const ids = slots.map(s => s.id).filter(Boolean);
  setImmediate(() => rescheduleSvc.clearReminders(ids));

  const first = [...slots].sort((a, b) => absMins(a.d, a.t) - absMins(b.d, b.t))[0];
  return {
    success: true,
    studentName: student.name,
    mode,
    classes: slots.length,
    bookingsCreated: slots.length,
    firstClass: first ? { date: first.d, time: first.t } : null,
    tutorFirst: [...slots].sort((a, b) => absMins(a.d, a.t) - absMins(b.d, b.t)).reduce((m, x) => {
      if (x.tutor_id && !m[x.tutor_id]) m[x.tutor_id] = { date: x.d, time: x.t, count: 0 };
      if (x.tutor_id) m[x.tutor_id].count++;
      return m;
    }, {}),
  };
}

/**
 * The saved details of a paused student's courses, for the Resume screen:
 * from the pause record, or (for pauses made before it existed) read from
 * the classes on hold.
 */
async function pausedCourses(db, studentId) {
  const p = (await db.query(`SELECT pause_snapshot FROM student_profiles WHERE user_id = $1`, [studentId])).rows[0];
  const r = await db.query(
    `SELECT ${CLASS_COLS} FROM bookings b
     WHERE b.student_id = $1 AND b.status = 'cancelled' AND b.notes->>'cancelledByPause' IS NOT NULL
     ORDER BY b.date, b.time`, [studentId]);
  const live = await describeCourses(db, studentId, r.rows);
  const saved = (p && p.pause_snapshot && p.pause_snapshot.courses) || [];
  /* The classes on hold decide what comes back; the pause record supplies the schedule it had */
  return live.map(c => {
    const s = saved.find(x => x.key === c.key);
    return s ? { ...c, schedule: s.schedule && s.schedule.length ? s.schedule : c.schedule } : c;
  });
}

/**
 * Safety net, run daily and on start: a paused student must have no class
 * on a calendar. Anything that is still scheduled (a class added or moved
 * after the pause, or not ended when it began) goes on hold with the rest.
 * Credit pauses keep classes whose time has passed, so they can be ended.
 * Never throws.
 */
async function holdStrayClasses() {
  const client = await pool.connect();
  const notices = [];
  let total = 0;
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT b.id, b.tutor_id, b.student_id, u.name AS student_name, sp.pause_kind, sp.paused_at, sp.paused_reason,
              to_char(b.date,'YYYY-MM-DD') AS d, to_char(b.time,'HH24:MI') AS t
       FROM bookings b
       JOIN student_profiles sp ON sp.user_id = b.student_id AND sp.class_paused = TRUE
       JOIN users u ON u.id = b.student_id
       WHERE b.status = 'scheduled' AND b.is_demo = FALSE AND b.batch_id IS NULL
       FOR UPDATE OF b`
    );
    const now = nowWAT();
    const hold = r.rows.filter(x => x.pause_kind !== 'credits' || !isOverdue(x, now));
    const byStudent = new Map();
    for (const x of hold) {
      if (!byStudent.has(x.student_id)) byStudent.set(x.student_id, []);
      byStudent.get(x.student_id).push(x);
    }
    for (const [, list] of byStudent) {
      const tag = list[0].paused_at ? new Date(list[0].paused_at).toISOString() : new Date().toISOString();
      await client.query(
        `UPDATE bookings
         SET status = 'cancelled',
             notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('cancelledByPause', $2::text, 'heldAfterPause', NOW()::text)
         WHERE id = ANY($1::uuid[])`,
        [list.map(x => x.id), tag]
      );
      total += list.length;
      notices.push({
        studentName: list[0].student_name, reason: list[0].paused_reason,
        tutorCounts: list.reduce((m, x) => { if (x.tutor_id) m[x.tutor_id] = (m[x.tutor_id] || 0) + 1; return m; }, {}),
      });
      logger.info(`[PAUSE] Held ${list.length} class(es) still on the calendar for paused student ${list[0].student_name}`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    logger.warn('[PAUSE] Holding stray classes failed: ' + e.message);
    return { held: 0, error: e.message };
  } finally {
    client.release();
  }
  for (const n of notices) await notifyTutors('pause', n, n.reason);
  return { held: total, students: notices.length };
}

/**
 * Tell each tutor their classes with this student were paused / are back.
 * Call after the transaction commits. Never throws.
 */
async function notifyTutors(kind, out, reason) {
  const tn = require('./tutorNotify');
  try {
    if (kind === 'pause') {
      const why = /credit/i.test(reason || '') ? 'Waiting for the parent to top up.' : (reason ? 'Reason: ' + reason : '');
      for (const [tid, n] of Object.entries(out.tutorCounts || {})) {
        await tn.notifyTutor({
          tutorId: tid,
          title: `Classes paused — ${out.studentName}`,
          body: `${n} class${n === 1 ? '' : 'es'} removed from your calendar. ${why}`.trim(),
          lines: [`Student: ${out.studentName}`, `Classes removed: ${n}`, why, 'You will be told when they come back.'].filter(Boolean),
        });
      }
    } else {
      for (const [tid, f] of Object.entries(out.tutorFirst || {})) {
        const t = (await pool.query('SELECT id, name, email FROM users WHERE id = $1', [tid])).rows[0];
        if (!t) continue;
        const when = await tn.whenFor(t, f.date, f.time);
        await tn.notifyTutor({
          tutorId: tid,
          title: `Classes back on — ${out.studentName}`,
          body: `${f.count} class${f.count === 1 ? '' : 'es'} back on your calendar · first ${when}`,
          lines: [`Student: ${out.studentName}`, `Classes added: ${f.count}`, `First class: ${when}`],
        });
      }
    }
  } catch (e) { logger.warn('[TUTOR NOTIFY] pause/resume: ' + e.message); }
}

async function _inTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Called after a class is charged. Puts the student's remaining classes on
 * hold once the balance is at or below CREDIT_PAUSE_AT. Never throws.
 * Returns { paused: true, bookingsCancelled } when it paused them now.
 */
async function autoPauseForCredits(studentId) {
  try {
    return await _inTx(async (client) => {
      const p = await client.query(
        `SELECT credits, class_paused FROM student_profiles WHERE user_id = $1 FOR UPDATE`, [studentId]);
      const prof = p.rows[0];
      if (!prof || prof.class_paused || prof.credits > CREDIT_PAUSE_AT) return { paused: false };
      const r = await pauseStudent(client, studentId, {
        reason: `Out of credits (balance ${prof.credits}) — classes on hold until the parent tops up`,
        kind: 'credits',
      });
      logger.info(`[CREDITS] Auto-paused ${r.studentName} (${studentId}) at ${prof.credits} credits: ${r.bookingsCancelled} classes on hold`);
      return { paused: true, bookingsCancelled: r.bookingsCancelled, studentName: r.studentName, _r: r };
    }).then(out => {
      if (out._r) { const r = out._r; delete out._r; notifyTutors('pause', r, 'credits').catch(() => {}); }
      return out;
    });
  } catch (e) {
    logger.warn(`[CREDITS] Auto-pause failed for ${studentId}: ${e.message}`);
    return { paused: false, error: e.message };
  }
}

/**
 * Called after a top-up. If the student was put on hold for credits and now
 * has at least one credit, their classes come back from tomorrow on the same
 * days, times, teacher and link. A clash (the slot was given away) leaves
 * them paused with a note for Post-Sales. Never throws.
 */
async function autoResumeAfterTopUp(studentId) {
  try {
    const out = await _inTx(async (client) => {
      const p = await client.query(
        `SELECT credits, class_paused, pause_kind FROM student_profiles WHERE user_id = $1 FOR UPDATE`, [studentId]);
      const prof = p.rows[0];
      if (!prof || !prof.class_paused || prof.pause_kind !== 'credits') return { resumed: false, reason: 'not on credit hold' };
      if (prof.credits < 1) return { resumed: false, reason: 'balance still below 1 credit' };
      const r = await resumeStudent(client, studentId, { startDate: addDays(todayWAT(), 1), keepSchedule: true });
      logger.info(`[CREDITS] Auto-resumed ${r.studentName} (${studentId}) after top-up: ${r.classes} classes back`);
      return { resumed: true, classes: r.classes, firstClass: r.firstClass, studentName: r.studentName, _r: r };
    });
    if (out._r) { notifyTutors('resume', out._r).catch(() => {}); delete out._r; }
    if (out.resumed) _emailResumed(studentId, out).catch(() => {});
    return out;
  } catch (e) {
    if (e.status === 409 || e.status === 400) {
      await pool.query(
        `UPDATE student_profiles SET paused_reason = $2 WHERE user_id = $1`,
        [studentId, `Topped up — classes could not come back automatically (${e.message}). Please resume with a new time.`]
      ).catch(() => {});
      logger.warn(`[CREDITS] Auto-resume could not run for ${studentId}: ${e.message}`);
      return { resumed: false, reason: 'clash', error: e.message };
    }
    logger.warn(`[CREDITS] Auto-resume failed for ${studentId}: ${e.message}`);
    return { resumed: false, reason: 'error', error: e.message };
  }
}

async function _emailResumed(studentId, out) {
  const emailSvc = require('./emailService');
  const { formatForTimeZone } = require('../utils/timezone');
  const { resolveUserTimeZone } = require('./timezoneService');
  const r = await pool.query(
    `SELECT u.name, u.email, sp.parent_email, sp.parent_name FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = $1`, [studentId]);
  const s = r.rows[0];
  const to = s && (s.parent_email || s.email);
  if (!to) return;
  let when = '';
  if (out.firstClass) {
    const tz = await resolveUserTimeZone(studentId, s.email).catch(() => null);
    const f = formatForTimeZone(out.firstClass.date, out.firstClass.time, tz);
    when = f ? f.full : '';
  }
  const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
  await emailSvc.sendEmail({
    to,
    subject: `✅ ${s.name}'s classes are back on`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;line-height:1.6;color:#1a202c;">
      <h2 style="color:#0e9f6e;">Classes are back on ✅</h2>
      <p>Hi ${s.parent_name || s.name},</p>
      <p>Thank you for topping up. ${s.name}'s classes have been put back on the calendar on the same days, times and teacher.</p>
      ${when ? `<p><strong>Next class:</strong> ${when}</p>` : ''}
      <a href="${appUrl}/pages/student-dashboard.html" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 28px;border-radius:50px;font-weight:700;">Go to the dashboard →</a>
    </div>`,
    template: 'classes_resumed',
  });
}

/** True when the student is paused (their classes must stay on hold). */
async function isPaused(db, studentId) {
  if (!studentId) return false;
  const r = await db.query(`SELECT COALESCE(class_paused, FALSE) AS p FROM student_profiles WHERE user_id = $1`, [studentId]);
  return !!(r.rows[0] && r.rows[0].p);
}

module.exports = {
  CREDIT_PAUSE_AT, WEEKDAYS,
  todayWAT, addDays, httpError,
  courseKey, schedulePattern, futureSlots,
  pausedClasses, pausedCourses, findClash, previewPause,
  pauseStudent, resumeStudent, holdStrayClasses, isPaused,
  autoPauseForCredits, autoResumeAfterTopUp,
  notifyTutors,
};
