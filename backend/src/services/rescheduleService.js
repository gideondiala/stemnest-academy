/**
 * StemNest Academy — Reschedule Service
 *
 * "Next learning day" reschedule = push the series back by one slot:
 *   the chosen lesson takes the next lesson's slot, every later lesson
 *   takes the slot after it, and the last lesson gets a new slot from
 *   the student's weekly pattern. Lesson order (and linked lesson
 *   content) is preserved and the student keeps the same number of
 *   lessons — only the final date moves out by one slot.
 *
 * A "series" is:
 *   - all bookings of the same batch (group class), else
 *   - all bookings of the same enrolment, else
 *   - all paid bookings for the same student + tutor.
 *
 * Booking date/time are WAT (see utils/timezone.js).
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');
const { formatForTimeZone, isValidTimeZone } = require('../utils/timezone');
const { resolveUserTimeZone } = require('./timezoneService');

const MAX_TAIL_ATTEMPTS = 8; // how many pattern slots to try if the new last slot clashes

/* ── date helpers on 'YYYY-MM-DD' strings (timezone-free) ── */
function _addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function _weekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function _normTime(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? m[1].padStart(2, '0') + ':' + m[2] : null;
}

/** Load a booking with date/time as plain strings. */
async function loadBooking(client, bookingId) {
  const r = await client.query(
    `SELECT b.*, to_char(b.date, 'YYYY-MM-DD') AS d, to_char(b.time, 'HH24:MI') AS t
     FROM bookings b WHERE b.id = $1`,
    [bookingId]
  );
  return r.rows[0] || null;
}

/** SQL condition + params identifying the booking's series. */
function _seriesScope(booking, startIdx) {
  if (booking.batch_id)     return { sql: `batch_id = $${startIdx}`,     params: [booking.batch_id] };
  if (booking.enrolment_id) return { sql: `enrolment_id = $${startIdx}`, params: [booking.enrolment_id] };
  return {
    sql: `student_id = $${startIdx} AND tutor_id = $${startIdx + 1} AND is_demo = FALSE`,
    params: [booking.student_id, booking.tutor_id],
  };
}

/**
 * The booking itself plus every later scheduled booking in its series,
 * in chronological order. Locks the rows when run inside a transaction.
 */
async function loadSeriesFrom(client, booking, { lock = false } = {}) {
  const scope = _seriesScope(booking, 4);
  const r = await client.query(
    `SELECT id, to_char(date, 'YYYY-MM-DD') AS d, to_char(time, 'HH24:MI') AS t,
            COALESCE(duration_mins, 60) AS duration_mins, notes
     FROM bookings
     WHERE id = $1
        OR (status = 'scheduled' AND ${scope.sql}
            AND (date > $2::date OR (date = $2::date AND time > $3::time)))
     ORDER BY date ASC, time ASC
     ${lock ? 'FOR UPDATE' : ''}`,
    [booking.id, booking.d, booking.t, ...scope.params]
  );
  return r.rows;
}

/**
 * Weekly pattern [{ weekday: 0-6, time: 'HH:MM' }] for the series:
 * the enrolment's schedule if set, otherwise the recurring slots seen in
 * the series (a slot must appear at least twice, which ignores one-off
 * custom reschedules), otherwise the booking's own weekday + time.
 */
async function weeklyPattern(client, booking, seriesRows) {
  if (booking.enrolment_id) {
    const e = await client.query('SELECT schedule FROM enrolments WHERE id = $1', [booking.enrolment_id]);
    let sched = e.rows[0]?.schedule;
    try { if (typeof sched === 'string') sched = JSON.parse(sched); } catch { sched = null; }
    const pattern = (Array.isArray(sched) ? sched : [])
      .map(s => ({ weekday: Number(s.weekday), time: _normTime(s.time) }))
      .filter(s => s.weekday >= 0 && s.weekday <= 6 && s.time);
    if (pattern.length) return pattern;
  }

  /* Recent history + upcoming series, so a short remaining series still has a pattern */
  const scope = _seriesScope(booking, 1);
  const hist = await client.query(
    `SELECT to_char(date, 'YYYY-MM-DD') AS d, to_char(time, 'HH24:MI') AS t
     FROM bookings
     WHERE ${scope.sql}
       AND status IN ('scheduled', 'completed')
       AND date >= CURRENT_DATE - INTERVAL '8 weeks'`,
    scope.params
  );
  const counts = {};
  hist.rows.concat(seriesRows).forEach(r => {
    const key = _weekday(r.d) + '|' + r.t;
    counts[key] = (counts[key] || 0) + 1;
  });
  let keys = Object.keys(counts).filter(k => counts[k] >= 2);
  if (!keys.length) keys = [_weekday(booking.d) + '|' + booking.t];
  return keys.map(k => { const [w, t] = k.split('|'); return { weekday: Number(w), time: t }; });
}

/** First pattern slot strictly after { d, t }. */
function nextPatternSlot(after, pattern) {
  for (let offset = 0; offset <= 14; offset++) {
    const date  = _addDays(after.d, offset);
    const wd    = _weekday(date);
    const times = pattern.filter(p => p.weekday === wd).map(p => p.time).sort();
    const time  = offset === 0 ? times.find(t => t > after.t) : times[0];
    if (time) return { d: date, t: time };
  }
  return { d: _addDays(after.d, 7), t: after.t };
}

/**
 * Tutor's other scheduled bookings overlapping [date+time, +duration).
 * Returns the first clashing booking or null.
 */
async function findTutorClash(client, tutorId, excludeIds, slot, durationMins) {
  if (!tutorId) return null;
  const r = await client.query(
    `SELECT b.id, b.is_demo, to_char(b.date, 'YYYY-MM-DD') AS d, to_char(b.time, 'HH24:MI') AS t,
            COALESCE(u.name, b.lesson_name, 'another student') AS student_name
     FROM bookings b
     LEFT JOIN users u ON u.id = b.student_id
     WHERE b.tutor_id = $1
       AND b.status = 'scheduled'
       AND NOT (b.id = ANY($2::uuid[]))
       AND (b.date + b.time) < ($3::date + $4::time) + make_interval(mins => $5::int)
       AND ($3::date + $4::time) < (b.date + b.time) + make_interval(mins => COALESCE(b.duration_mins, 60))
     ORDER BY b.date, b.time
     LIMIT 1`,
    [tutorId, excludeIds, slot.d, slot.t, durationMins || 60]
  );
  return r.rows[0] || null;
}

/**
 * Where "next learning day" would move this booking — without changing anything.
 * Returns { date, time, shifted: <number of later lessons that would move> }.
 */
async function previewNextSlot(bookingId) {
  const booking = await loadBooking(pool, bookingId);
  if (!booking) return null;
  const series = await loadSeriesFrom(pool, booking);
  if (series.length > 1) return { date: series[1].d, time: series[1].t, shifted: series.length - 1 };
  const pattern = await weeklyPattern(pool, booking, series);
  const slot = nextPatternSlot({ d: booking.d, t: booking.t }, pattern);
  return { date: slot.d, time: slot.t, shifted: 0 };
}

/**
 * Push the series back by one slot, starting at `booking`.
 * Must be called with a client inside a transaction.
 * Returns { moves: [{ id, from: {d,t}, to: {d,t} }] } — moves[0] is `booking`.
 * Throws an Error with .status = 409 if no free slot can be found for the last lesson.
 */
async function shiftSeriesForward(client, booking, { reason, actorLabel } = {}) {
  const series  = await loadSeriesFrom(client, booking, { lock: true });
  const pattern = await weeklyPattern(client, booking, series);
  const ids     = series.map(s => s.id);
  const last    = series[series.length - 1];

  /* Find a free slot for the (new) last lesson, skipping clashes */
  let tail = nextPatternSlot(last, pattern);
  let clash = null;
  for (let i = 0; i < MAX_TAIL_ATTEMPTS; i++) {
    clash = await findTutorClash(client, booking.tutor_id, ids, tail, last.duration_mins);
    if (!clash) break;
    tail = nextPatternSlot(tail, pattern);
  }
  if (clash) {
    const err = new Error(`Could not find a free slot to add at the end of the series — the tutor is booked at every upcoming ${last.t} slot. Please use a custom date & time instead.`);
    err.status = 409;
    throw err;
  }

  const moves = series.map((s, i) => ({
    id:   s.id,
    from: { d: s.d, t: s.t },
    to:   i < series.length - 1 ? { d: series[i + 1].d, t: series[i + 1].t } : tail,
    notes: s.notes,
  }));

  /* Apply from the last lesson backwards so no two lessons ever share a slot mid-update */
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i];
    let notesJson = null;
    if (i === 0) {
      let notesObj = {};
      try { notesObj = typeof m.notes === 'string' ? JSON.parse(m.notes || '{}') : (m.notes || {}); } catch { notesObj = {}; }
      Object.assign(notesObj, {
        rescheduleReason: reason || ('Moved by ' + (actorLabel || 'staff')),
        movedFrom: m.from.d + ' ' + m.from.t,
        movedAt: new Date().toISOString(),
      });
      notesJson = JSON.stringify(notesObj);
    }
    await client.query(
      `UPDATE bookings
       SET date = $1::date, time = $2::time,
           rescheduled_from = $3::date, rescheduled_at = NOW()
           ${notesJson ? ', notes = $5' : ''}
       WHERE id = $4`,
      notesJson ? [m.to.d, m.to.t, m.from.d, m.id, notesJson] : [m.to.d, m.to.t, m.from.d, m.id]
    );
  }

  return { moves: moves.map(({ id, from, to }) => ({ id, from, to })) };
}

/* ══════════════════════════════════════════════════════
   EMAIL NOTIFICATIONS
══════════════════════════════════════════════════════ */

/** People to tell about a change to `booking`: the tutor plus each parent. */
async function _recipients(booking) {
  const out = [];

  if (booking.tutor_id) {
    const t = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [booking.tutor_id]);
    if (t.rows[0]?.email) out.push({ audience: 'tutor', userId: t.rows[0].id, name: t.rows[0].name, email: t.rows[0].email });
  }

  const studentRows = [];
  if (booking.batch_id) {
    const m = await pool.query(
      `SELECT u.id, u.name, u.email, sp.parent_name, sp.parent_email
       FROM batch_members bm
       JOIN users u ON u.id = bm.student_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE bm.batch_id = $1 AND bm.status = 'active'`,
      [booking.batch_id]
    ).catch(() => ({ rows: [] }));
    studentRows.push(...m.rows);
  } else if (booking.student_id) {
    const s = await pool.query(
      `SELECT u.id, u.name, u.email, sp.parent_name, sp.parent_email
       FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1`,
      [booking.student_id]
    );
    studentRows.push(...s.rows);
  }

  for (const s of studentRows) {
    const email = s.parent_email || s.email;
    if (email) out.push({ audience: 'parent', userId: s.id, name: s.parent_name || s.name, email, studentName: s.name });
  }

  /* Demo booking without a student account — contact details live in notes */
  if (!studentRows.length) {
    let notes = {};
    try { notes = typeof booking.notes === 'string' ? JSON.parse(booking.notes || '{}') : (booking.notes || {}); } catch {}
    if (notes.email) {
      out.push({
        audience: 'parent', userId: null, name: notes.parentName || '', email: notes.email,
        studentName: notes.studentName || booking.lesson_name, timezone: notes.timezone,
      });
    }
  }
  return out;
}

/**
 * Email the tutor and parent(s) about a reschedule. Never throws —
 * a failed email must not undo or fail a completed reschedule.
 *   moves — [{ id, from:{d,t}, to:{d,t} }], moves[0] is the rescheduled lesson
 */
async function notifyReschedule({ bookingId, moves, reason, actorName }) {
  try {
    const booking = await loadBooking(pool, bookingId);
    if (!booking || !moves || !moves.length) return;

    const recipients = await _recipients(booking);
    const emailSvc   = require('./emailService');
    const main       = moves[0];
    const later      = moves.slice(1);

    for (const r of recipients) {
      try {
        const tz = isValidTimeZone(r.timezone) ? r.timezone : await resolveUserTimeZone(r.userId, r.email);
        const fmt = slot => {
          const f = formatForTimeZone(slot.d, slot.t, tz);
          return f ? f.full : `${slot.d} ${slot.t} WAT`;
        };
        await emailSvc.sendClassRescheduledEmail({
          to:            r.email,
          recipientName: r.name,
          audience:      r.audience,
          studentName:   r.studentName || booking.lesson_name || 'Student',
          subject:       booking.subject,
          lessonName:    booking.lesson_name,
          oldWhen:       fmt(main.from),
          newWhen:       fmt(main.to),
          reason,
          rescheduledBy: actorName,
          upcoming:      later.slice(0, 5).map(m => fmt(m.to)),
          finalWhen:     later.length > 5 ? fmt(later[later.length - 1].to) : null,
          classLink:     booking.class_link,
        });
      } catch (e) {
        logger.warn(`[RESCHEDULE EMAIL] Failed for ${r.email}: ${e.message}`);
      }
    }
  } catch (e) {
    logger.warn(`[RESCHEDULE EMAIL] Notification failed for booking ${bookingId}: ${e.message}`);
  }
}

module.exports = {
  loadBooking,
  loadSeriesFrom,
  weeklyPattern,
  nextPatternSlot,
  findTutorClash,
  previewNextSlot,
  shiftSeriesForward,
  notifyReschedule,
};
