/**
 * Pause / resume a student's classes.
 *
 * Used by Post-Sales (manual pause and resume) and automatically by credits:
 * when a student's balance reaches -2 their remaining classes are put on
 * hold, and when the parent tops up they come back on the same days, times,
 * teacher and link.
 *
 * Booking date/time are WAT. pauseStudent/resumeStudent run inside the
 * caller's transaction; the auto* helpers open their own.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');
const rescheduleSvc = require('./rescheduleService');

const CREDIT_PAUSE_AT = -2;   // balance at which classes go on hold (2-class grace)

function todayWAT() {
  return new Date(Date.now() + 60 * 60000).toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, extra });
}

/**
 * The classes a pause cancelled, in order. New pauses tag them
 * (notes.cancelledByPause); for pauses made before tagging existed, they are
 * the cancelled paid classes dated after the student's last live class.
 */
async function pausedClasses(client, studentId) {
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

/**
 * Cancel the student's future 1-on-1 classes (tagged so resume can bring
 * back exactly those lessons) and record the pause. Batch classes are not
 * cancelled — a paused member is simply not charged or reminded.
 * kind: 'manual' (Post-Sales) or 'credits' (automatic).
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

  const pausedAt = new Date().toISOString();
  const cancelled = await client.query(
    `UPDATE bookings
     SET status = 'cancelled',
         notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('cancelledByPause', $2::text)
     WHERE student_id = $1 AND status = 'scheduled' AND is_demo = FALSE AND date >= $3::date
     RETURNING id`,
    [studentId, pausedAt, todayWAT()]
  );

  for (const e of enrols) {
    await client.query(
      `UPDATE enrolments SET status = 'paused', paused_at = NOW(), paused_reason = $2, paused_by = $3,
              last_lesson_at_pause = $4, updated_at = NOW()
       WHERE id = $1`,
      [e.id, reason, byUserId, e.lessons_completed || 0]
    );
  }
  await client.query(
    `INSERT INTO student_profiles (user_id, class_paused, paused_at, paused_reason, paused_by, pause_kind)
     VALUES ($1, TRUE, NOW(), $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET class_paused = TRUE, paused_at = NOW(), paused_reason = $2,
                                         paused_by = $3, pause_kind = $4`,
    [studentId, reason, byUserId, kind]
  );

  return {
    success: true,
    studentName: name,
    bookingsCancelled: cancelled.rows.length,
    lessonsPausedAt: enrol ? (enrol.lessons_completed || 0) : null,
  };
}

/**
 * Bring back the classes the pause cancelled, in lesson order.
 * - keepSchedule: same days, times, tutor and class link (per course),
 *   moved forward by whole weeks so the first class is on/after startDate
 * - otherwise: placed on the new weekly schedule from startDate with the
 *   chosen tutor (and class link, if given)
 * If nothing was cancelled and a teacher + schedule are given, new classes
 * are created from the next pathway lesson. If nothing was cancelled and no
 * schedule is given (e.g. a batch-only student), the student is just unpaused.
 */
async function resumeStudent(client, studentId, { startDate, keepSchedule = true, tutorId, schedule, classLink }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) throw httpError(400, 'A start date is required');

  const stu = await client.query(
    `SELECT u.id, u.name, u.email, sp.class_paused, sp.grade FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'student' FOR UPDATE OF u`,
    [studentId]
  );
  if (!stu.rows.length) throw httpError(404, 'Student not found');
  const student = stu.rows[0];
  if (!student.class_paused) throw httpError(400, 'Student is not currently paused');

  const enrol = (await client.query(
    `SELECT * FROM enrolments WHERE student_id = $1
     ORDER BY CASE WHEN status = 'paused' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
    [studentId]
  )).rows[0] || null;

  let tutor = null;
  if (tutorId) {
    tutor = (await client.query(`SELECT id, name FROM users WHERE id = $1 AND role = 'tutor'`, [tutorId])).rows[0];
    if (!tutor) throw httpError(404, 'Teacher not found');
  }

  const rows = await pausedClasses(client, studentId);
  let slots = [];
  let mode;

  /* Several pathways (different tutors / class links) can only come back on
     their own schedules — one new schedule would merge them */
  const tracks = new Set(rows.map(r => (r.tutor_id || '') + '|' + (r.class_link || '')));
  if (!keepSchedule && tracks.size > 1) {
    throw httpError(400, `${student.name} takes more than one pathway. Resume with the same schedule, then reschedule each pathway from Paid Students.`);
  }

  if (rows.length && keepSchedule) {
    mode = 'restored';
    const weeks = Math.max(0, Math.ceil(daysBetween(rows[0].d, startDate) / 7));
    slots = rows.map(r => ({ id: r.id, tutor_id: r.tutor_id, class_link: r.class_link, d: addDays(r.d, weeks * 7), t: r.t }));
  } else if (!rows.length && keepSchedule && !(schedule && schedule.length)) {
    mode = 'none';   // nothing was cancelled (batch-only, or no future classes) — just unpause
  } else {
    if (!tutor) throw httpError(400, 'Please select a teacher');
    if (!schedule || !schedule.length) throw httpError(400, 'Please add at least one day and time');
    const sorted = [...schedule].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
    const count = rows.length || Math.max(1, (72 - ((enrol && (enrol.last_lesson_at_pause || enrol.lessons_completed)) || 0)));
    const dates = [];
    for (let day = 0; dates.length < count && day < 366 * 6; day++) {
      const d  = addDays(startDate, day);
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
      await client.query(
        `INSERT INTO bookings
           (subject, grade, date, time, class_link, status, is_demo, tutor_id, student_id, enrolment_id,
            lesson_name, notes, booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade)
         VALUES ('Coding', $1, $2::date, $3::time, $4, 'scheduled', FALSE, $5, $6, $7, $8, $9, NOW(), NOW(), $10, $11)`,
        [student.grade || `Grade ${(enrol && enrol.current_grade) || 1}`, slots[i].d, slots[i].t, slots[i].class_link,
         tutor.id, studentId, enrol ? enrol.id : null, l ? l.title : student.name,
         JSON.stringify({ studentName: student.name, email: student.email || '', tutorName: tutor.name,
                          classLink: slots[i].class_link, isPaidClass: true, resumed: true, resumedAt: new Date().toISOString() }),
         l ? l.id : null, l ? l.lesson_number : fromLesson + i]
      );
    }
  } else if (mode !== 'none') {
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

  if (enrol && tutor) {
    await client.query(
      `UPDATE enrolments SET status = 'active', resumed_at = NOW(), updated_at = NOW(), tutor_id = $2 WHERE id = $1`,
      [enrol.id, tutor.id]
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
            paused_by = NULL, pause_kind = NULL
     WHERE user_id = $1`,
    [studentId]
  );

  /* Re-arm reminders for restored classes (after commit; never throws) */
  const ids = slots.map(s => s.id).filter(Boolean);
  setImmediate(() => rescheduleSvc.clearReminders(ids));

  return {
    success: true,
    studentName: student.name,
    mode,
    classes: slots.length,
    bookingsCreated: slots.length,
    firstClass: slots[0] ? { date: slots[0].d, time: slots[0].t } : null,
  };
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
      return { paused: true, bookingsCancelled: r.bookingsCancelled, studentName: r.studentName };
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
      return { resumed: true, classes: r.classes, firstClass: r.firstClass, studentName: r.studentName };
    });
    if (out.resumed) _emailResumed(studentId, out).catch(() => {});
    return out;
  } catch (e) {
    if (e.status === 409) {
      await pool.query(
        `UPDATE student_profiles SET paused_reason = $2 WHERE user_id = $1`,
        [studentId, `Topped up — classes could not come back automatically (${e.message}). Please resume with a new time.`]
      ).catch(() => {});
      logger.warn(`[CREDITS] Auto-resume clash for ${studentId}: ${e.message}`);
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

module.exports = {
  CREDIT_PAUSE_AT,
  todayWAT, addDays, httpError,
  pausedClasses, findClash,
  pauseStudent, resumeStudent,
  autoPauseForCredits, autoResumeAfterTopUp,
};
