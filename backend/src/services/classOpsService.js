/**
 * Class operations: tutor pay per class, late joins, incomplete classes
 * and the "please end your class" follow-up.
 *
 * Pay rates (settings table, Naira):
 *   payRateDemo   — completed demo class
 *   payRatePaid1  — completed paid class, 1 student attended
 *   payRatePaid2  — 2 students attended
 *   payRatePaid3  — 3 or more students attended
 * A partially completed class pays one third of its rate.
 *
 * Late joins: joining more than 4 minutes after the start is late. The first
 * two in a month are pardoned; from the third, a ₦1,000 penalty is logged (it is
 * never deducted from earnings).
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');
const rescheduleSvc = require('./rescheduleService');

const LATE_AFTER_MINS      = 4;
const PARDONED_PER_MONTH   = 2;
const LATE_PENALTY         = 1000;   /* Naira, logged only (never deducted) */
const LATE_PENALTY_CURRENCY = 'NGN';
const UNENDED_WARN_AFTER_MINS = 120;  /* after the class end time */
/* The end-your-class follow-up applies to classes from this date on */
const FOLLOW_UP_FROM = '2026-10-05';

const RATE_KEYS = { demo: 'payRateDemo', paid1: 'payRatePaid1', paid2: 'payRatePaid2', paid3: 'payRatePaid3' };

/* Class start as a timestamp: booking date + time are Nigeria time (WAT) */
const CLASS_START_SQL = `((b.date + b.time) AT TIME ZONE 'Africa/Lagos')`;

/* ════════════════════════════════════════════
   PAY RATES
════════════════════════════════════════════ */
async function getPayRates(db = pool) {
  const keys = Object.values(RATE_KEYS).concat(['paidPayRate', 'demoPayRate']);
  const r = await db.query('SELECT key, value FROM settings WHERE key = ANY($1)', [keys]);
  const m = {};
  r.rows.forEach(row => { const v = parseFloat(row.value); if (Number.isFinite(v)) m[row.key] = v; });
  /* Older single "paid" / "demo" rates are used until the new ones are saved */
  const paid1 = m.payRatePaid1 ?? m.paidPayRate ?? 0;
  const paid2 = m.payRatePaid2 ?? paid1;
  const paid3 = m.payRatePaid3 ?? paid2;
  return {
    demo: m.payRateDemo ?? m.demoPayRate ?? 0,
    paid1, paid2, paid3,
    currency: 'NGN',
    configured: m.payRatePaid1 !== undefined && m.payRateDemo !== undefined,
  };
}

async function setPayRates(rates) {
  for (const [k, key] of Object.entries(RATE_KEYS)) {
    if (rates[k] === undefined || rates[k] === null || rates[k] === '') continue;
    const v = Number(rates[k]);
    if (!Number.isFinite(v) || v < 0) throw Object.assign(new Error(`Invalid ${k} rate`), { status: 400 });
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, String(v)]
    );
  }
  return getPayRates();
}

/** Pay for one class: demo rate, or the paid rate for the number of students who attended. */
function payFor(rates, { isDemo, outcome, studentsCount }) {
  if (outcome !== 'completed' && outcome !== 'partially_completed') return 0;
  const n = Math.max(1, Math.min(3, studentsCount || 1));
  const full = isDemo ? rates.demo : rates['paid' + n];
  const amount = outcome === 'partially_completed' ? full / 3 : full;
  return Math.round(amount * 100) / 100;
}

/**
 * Save the tutor's pay for a class (one line per class; a resubmission
 * replaces the line). An incomplete class removes any line.
 * Keeps tutor_profiles.earnings in step with the log.
 */
async function recordEarning({ tutorId, booking, outcome, studentsCount, studentNames }) {
  const rates  = await getPayRates();
  const isDemo = booking.is_demo === true;
  const amount = payFor(rates, { isDemo, outcome, studentsCount });

  const prev = await pool.query(
    'SELECT amount FROM tutor_earnings_log WHERE tutor_id = $1 AND booking_id = $2', [tutorId, booking.id]);
  const prevAmount = prev.rows.length ? parseFloat(prev.rows[0].amount) : 0;

  if (outcome === 'incomplete') {
    if (prev.rows.length) {
      await pool.query('DELETE FROM tutor_earnings_log WHERE tutor_id = $1 AND booking_id = $2', [tutorId, booking.id]);
    }
  } else {
    await pool.query(
      `INSERT INTO tutor_earnings_log
         (tutor_id, booking_id, amount, type, outcome, students_count, student_names,
          class_date, class_time, subject, currency, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'NGN',NOW())
       ON CONFLICT (tutor_id, booking_id) DO UPDATE SET
         amount = EXCLUDED.amount, type = EXCLUDED.type, outcome = EXCLUDED.outcome,
         students_count = EXCLUDED.students_count, student_names = EXCLUDED.student_names,
         class_date = EXCLUDED.class_date, class_time = EXCLUDED.class_time,
         subject = EXCLUDED.subject, currency = 'NGN', updated_at = NOW()`,
      [tutorId, booking.id, amount, isDemo ? 'demo' : 'paid', outcome,
       studentsCount || 1, (studentNames || []).join(', ') || null,
       typeof booking.date === 'string' ? booking.date.slice(0, 10) : toYmd(booking.date),
       booking.time, booking.subject || null]
    );
  }

  const delta = (outcome === 'incomplete' ? 0 : amount) - prevAmount;
  if (delta !== 0) {
    await pool.query(
      `UPDATE tutor_profiles SET earnings = COALESCE(earnings, 0) + $1,
              classes_done = COALESCE(classes_done, 0) + $3
       WHERE user_id = $2`,
      [delta, tutorId, prev.rows.length ? 0 : 1]
    );
  }
  logger.info(`[EARNINGS] Tutor ${tutorId} booking ${booking.id}: ${outcome}, ${studentsCount || 1} student(s), ₦${amount}`);
  return { amount, currency: 'NGN', studentsCount: studentsCount || 1, rates };
}

/* ════════════════════════════════════════════
   MONTHLY PAY (tutor's My Payments)
════════════════════════════════════════════ */
const MONTH_SQL = `to_char(COALESCE(l.class_date, (l.created_at AT TIME ZONE 'Africa/Lagos')::date), 'YYYY-MM')`;

async function payMonths(tutorId) {
  const r = await pool.query(
    `SELECT ${MONTH_SQL} AS month,
            COALESCE(SUM(l.amount), 0)::float AS total,
            COUNT(*)::int AS classes,
            COUNT(*) FILTER (WHERE l.type = 'demo')::int AS demos,
            COUNT(*) FILTER (WHERE l.type <> 'demo')::int AS paid,
            COALESCE(SUM(l.students_count) FILTER (WHERE l.type <> 'demo'), 0)::int AS students
     FROM tutor_earnings_log l
     WHERE l.tutor_id = $1 AND l.currency = 'NGN'
     GROUP BY 1 ORDER BY 1 DESC`,
    [tutorId]
  );
  return r.rows;
}

async function payMonthDetail(tutorId, month) {
  const r = await pool.query(
    `SELECT l.booking_id AS "bookingId", l.type, l.outcome, l.amount::float AS amount,
            COALESCE(l.students_count, 1) AS "studentsCount", l.student_names AS "studentNames",
            to_char(COALESCE(l.class_date, b.date), 'YYYY-MM-DD') AS "classDate",
            to_char(COALESCE(l.class_time, b.time), 'HH24:MI') AS "classTime",
            COALESCE(l.subject, b.subject) AS subject,
            b.batch_id IS NOT NULL AS "isBatch", bt.batch_ref AS "batchRef",
            to_char(l.created_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD HH24:MI') AS "endedAt"
     FROM tutor_earnings_log l
     LEFT JOIN bookings b ON b.id = l.booking_id
     LEFT JOIN batches bt ON bt.id = b.batch_id
     WHERE l.tutor_id = $1 AND l.currency = 'NGN' AND ${MONTH_SQL} = $2
     ORDER BY "classDate", "classTime"`,
    [tutorId, month]
  );
  return r.rows;
}

/* ════════════════════════════════════════════
   INCOMPLETE CLASSES
════════════════════════════════════════════ */
/**
 * Mark a class incomplete. A paid class is redone in the next slot and the
 * rest of the series moves back one slot; the missed slot is kept in
 * notes.incompleteHistory so the calendar can still show it.
 */
async function applyIncomplete(booking, { reason, actorLabel, markedBy } = {}) {
  const entry = {
    date: typeof booking.date === 'string' ? booking.date.slice(0, 10) : toYmd(booking.date),
    time: String(booking.time).slice(0, 5),
    reason: reason || '',
    by: actorLabel || 'tutor',
    markedBy: markedBy || null,
    at: new Date().toISOString(),
  };
  await pool.query(
    `UPDATE bookings SET status = 'incomplete', completed_at = NOW(),
            notes = jsonb_set(
                      COALESCE(notes, '{}'::jsonb) || jsonb_build_object('incompleteReason', $2::text),
                      '{incompleteHistory}',
                      COALESCE(notes->'incompleteHistory', '[]'::jsonb) || $3::jsonb)
     WHERE id = $1`,
    [booking.id, reason || '', JSON.stringify([entry])]
  );

  let movedTo = null;
  if ((booking.student_id || booking.batch_id) && !booking.is_demo) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const b = await rescheduleSvc.loadBooking(client, booking.id);
      const { moves } = await rescheduleSvc.shiftSeriesForward(client, b, {
        reason: 'Class incomplete' + (reason ? ' — ' + reason : ''),
        actorLabel: actorLabel || 'tutor',
      });
      await client.query(`UPDATE bookings SET status = 'scheduled', completed_at = NULL,
                                 tutor_joined_at = NULL, unended_warned_at = NULL WHERE id = $1`, [booking.id]);
      await client.query('COMMIT');
      rescheduleSvc.clearReminders(moves.map(m => m.id));
      movedTo = moves[0].to;
      logger.info(`[INCOMPLETE-SHIFT] Booking ${booking.id} moved to ${movedTo.d} ${movedTo.t}; ${moves.length - 1} later lesson(s) shifted`);
    } catch (shiftErr) {
      await client.query('ROLLBACK').catch(() => {});
      logger.warn('[INCOMPLETE-SHIFT] Auto-shift failed (non-fatal):', shiftErr.message);
    } finally {
      client.release();
    }
  }
  return { movedTo };
}

function toYmd(d) {
  if (!d) return null;
  const x = new Date(d);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

/* ════════════════════════════════════════════
   LATE JOINS
════════════════════════════════════════════ */
/**
 * The tutor clicked Join. The first join of each class is timed against the
 * class start; more than 4 minutes after is a late join.
 */
async function recordTutorJoin(bookingId, tutorId) {
  const r = await pool.query(
    `UPDATE bookings b SET tutor_joined_at = NOW()
     WHERE b.id = $1 AND b.tutor_id = $2 AND b.tutor_joined_at IS NULL
     RETURNING b.tutor_joined_at AS joined, ${CLASS_START_SQL} AS start`,
    [bookingId, tutorId]
  );
  if (!r.rows.length) {
    const own = await pool.query('SELECT tutor_joined_at FROM bookings WHERE id = $1 AND tutor_id = $2', [bookingId, tutorId]);
    if (!own.rows.length) return { notFound: true };
    const lj = await pool.query('SELECT mins_late, pardoned, penalty, nth_in_month FROM late_joins WHERE booking_id = $1', [bookingId]);
    return { alreadyJoined: true, late: lj.rows.length > 0, ...(lj.rows[0] ? lateInfo(lj.rows[0]) : {}) };
  }
  const { joined, start } = r.rows[0];
  const minsLate = Math.floor((new Date(joined) - new Date(start)) / 60000);
  if (minsLate <= LATE_AFTER_MINS) return { late: false, minsLate };

  const prior = await pool.query(
    `SELECT COUNT(*)::int AS n FROM late_joins
     WHERE tutor_id = $1
       AND date_trunc('month', COALESCE(class_start, join_time) AT TIME ZONE 'Africa/Lagos')
         = date_trunc('month', $2::timestamptz AT TIME ZONE 'Africa/Lagos')`,
    [tutorId, start]
  );
  const nth = prior.rows[0].n + 1;
  const pardoned = nth <= PARDONED_PER_MONTH;
  const penalty  = pardoned ? 0 : LATE_PENALTY;
  await pool.query(
    `INSERT INTO late_joins (booking_id, tutor_id, join_time, mins_late, penalty, pardoned, class_start, nth_in_month)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (booking_id) DO NOTHING`,
    [bookingId, tutorId, joined, minsLate, penalty, pardoned, start, nth]
  );
  logger.info(`[LATE-JOIN] Tutor ${tutorId} joined ${minsLate} min late (booking ${bookingId}) — #${nth} this month${pardoned ? ', pardoned' : ', $' + penalty + ' penalty logged'}`);
  return { late: true, ...lateInfo({ mins_late: minsLate, pardoned, penalty, nth_in_month: nth }) };
}

function lateInfo(row) {
  return {
    minsLate: row.mins_late, pardoned: row.pardoned, penalty: parseFloat(row.penalty || 0),
    penaltyCurrency: LATE_PENALTY_CURRENCY, nthInMonth: row.nth_in_month, pardonedPerMonth: PARDONED_PER_MONTH,
  };
}

/** Late joins for a month ('YYYY-MM'), optionally for one tutor. */
async function lateJoins({ month, tutorId } = {}) {
  const params = [];
  let where = 'TRUE';
  if (month) { params.push(month); where += ` AND to_char(COALESCE(lj.class_start, lj.join_time) AT TIME ZONE 'Africa/Lagos', 'YYYY-MM') = $${params.length}`; }
  if (tutorId) { params.push(tutorId); where += ` AND lj.tutor_id = $${params.length}`; }
  const r = await pool.query(
    `SELECT lj.id, lj.booking_id AS "bookingId", lj.tutor_id AS "tutorId",
            u.name AS "tutorName", u.staff_id AS "tutorStaffId",
            to_char(b.date, 'YYYY-MM-DD') AS "classDate", to_char(b.time, 'HH24:MI') AS "classTime",
            to_char(lj.join_time AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD HH24:MI:SS') AS "joinTime",
            lj.mins_late AS "minsLate", lj.pardoned, lj.penalty::float AS penalty, lj.nth_in_month AS "nthInMonth",
            b.subject, b.is_demo AS "isDemo",
            COALESCE(s.name, b.student_name, b.notes->>'studentName', bt.batch_ref) AS "studentName"
     FROM late_joins lj
     JOIN users u ON u.id = lj.tutor_id
     LEFT JOIN bookings b ON b.id = lj.booking_id
     LEFT JOIN users s ON s.id = b.student_id
     LEFT JOIN batches bt ON bt.id = b.batch_id
     WHERE ${where}
     ORDER BY lj.join_time DESC`,
    params
  );
  return r.rows;
}

/* ════════════════════════════════════════════
   CLASSES NOT ENDED
════════════════════════════════════════════ */
const OVERDUE_WHERE = `
  b.status = 'scheduled' AND b.tutor_id IS NOT NULL AND b.date >= DATE '${FOLLOW_UP_FROM}'
  AND ${CLASS_START_SQL} + make_interval(mins => COALESCE(b.duration_mins, 60)) <= NOW()`;

/** Classes whose time has passed and that the tutor has not ended yet. */
async function unendedClasses({ tutorId, overdueOnly } = {}) {
  const params = [];
  let where = OVERDUE_WHERE;
  if (tutorId) { params.push(tutorId); where += ` AND b.tutor_id = $${params.length}`; }
  if (overdueOnly) where += ` AND ${CLASS_START_SQL} + make_interval(mins => COALESCE(b.duration_mins, 60) + ${UNENDED_WARN_AFTER_MINS}) <= NOW()`;
  const r = await pool.query(
    `SELECT b.id, to_char(b.date, 'YYYY-MM-DD') AS date, to_char(b.time, 'HH24:MI') AS time,
            b.subject, b.is_demo AS "isDemo", b.batch_id AS "batchId", bt.batch_ref AS "batchRef",
            COALESCE(s.name, b.student_name, b.notes->>'studentName') AS "studentName",
            u.id AS "tutorId", u.name AS "tutorName", u.staff_id AS "tutorStaffId",
            b.tutor_joined_at AS "tutorJoinedAt", b.unended_warned_at AS "warnedAt",
            FLOOR(EXTRACT(EPOCH FROM (NOW() - (${CLASS_START_SQL} + make_interval(mins => COALESCE(b.duration_mins, 60))))) / 60)::int AS "minsSinceEnd"
     FROM bookings b
     JOIN users u ON u.id = b.tutor_id
     LEFT JOIN users s ON s.id = b.student_id
     LEFT JOIN batches bt ON bt.id = b.batch_id
     WHERE ${where}
     ORDER BY b.date, b.time`,
    params
  );
  return r.rows;
}

/** Email each tutor (once per class) whose class ended over 2 hours ago and is still not ended. */
async function sendUnendedWarnings() {
  /* Claim the classes first so two server instances never email twice */
  const claimed = await pool.query(
    `UPDATE bookings SET unended_warned_at = NOW()
     WHERE id IN (
       SELECT b.id FROM bookings b
       WHERE ${OVERDUE_WHERE}
         AND b.unended_warned_at IS NULL
         AND ${CLASS_START_SQL} + make_interval(mins => COALESCE(b.duration_mins, 60) + ${UNENDED_WARN_AFTER_MINS}) <= NOW()
         AND ${CLASS_START_SQL} > NOW() - INTERVAL '3 days'
       FOR UPDATE SKIP LOCKED)
     RETURNING id`
  );
  if (!claimed.rows.length) return 0;
  const ids = claimed.rows.map(r => r.id);
  const rows = (await pool.query(
    `SELECT b.id, to_char(b.date, 'Dy DD Mon YYYY') AS day, to_char(b.time, 'HH24:MI') AS time, b.subject, b.is_demo,
            bt.batch_ref, COALESCE(s.name, b.student_name, b.notes->>'studentName') AS student_name,
            u.name AS tutor_name, u.email AS tutor_email
     FROM bookings b JOIN users u ON u.id = b.tutor_id
     LEFT JOIN users s ON s.id = b.student_id LEFT JOIN batches bt ON bt.id = b.batch_id
     WHERE b.id = ANY($1::uuid[]) ORDER BY b.date, b.time`, [ids])).rows;

  const byTutor = {};
  rows.forEach(r => { (byTutor[r.tutor_email] = byTutor[r.tutor_email] || []).push(r); });
  const emailSvc = require('./emailService');
  const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
  for (const [email, list] of Object.entries(byTutor)) {
    if (!email) continue;
    const first = (list[0].tutor_name || '').split(' ')[0] || 'there';
    const items = list.map(c =>
      `<li style="margin-bottom:6px;"><strong>${esc(c.day)} at ${esc(c.time)} (WAT)</strong> — ${esc(c.batch_ref ? 'Batch ' + c.batch_ref : (c.student_name || 'Student'))}` +
      `${c.subject ? ' · ' + esc(c.subject) : ''}${c.is_demo ? ' · Demo' : ''}</li>`).join('');
    const many = list.length > 1;
    await emailSvc.sendEmail({
      to: email,
      subject: many ? `Friendly reminder: ${list.length} classes still need to be ended` : 'Friendly reminder: a class still needs to be ended',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;padding:24px;color:#1a202c;line-height:1.6;">
        <h2 style="color:#1a56db;margin-top:0;">Hi ${esc(first)},</h2>
        <p>We hope your class went well! Our records show ${many ? 'these classes have' : 'this class has'} not been ended yet:</p>
        <ul style="padding-left:20px;">${items}</ul>
        <p>Please open your dashboard and click <strong>End Class</strong> to mark ${many ? 'each one' : 'it'} as completed, partially completed or incomplete. This is how we update your pay, the student's credits and the parent's class summary, so we really need every class marked.</p>
        <p>If ${many ? 'a class is' : 'the class is'} not ended, the Admin team will mark ${many ? 'it' : 'it'} as <strong>incomplete</strong>, and no pay is added for an incomplete class.</p>
        <a href="${appUrl}/pages/tutor-dashboard.html" style="display:inline-block;margin:8px 0 16px;background:#1a56db;color:#fff;text-decoration:none;padding:12px 26px;border-radius:50px;font-weight:700;">Open my dashboard</a>
        <p style="font-size:13px;color:#718096;">Thank you for all you do for our students. 💙<br>— StemNest Academy</p>
      </div>`,
      template: 'tutor_unended_class',
    }).catch(e => logger.warn('[UNENDED] Email failed for ' + email + ': ' + e.message));
  }
  logger.info(`[UNENDED] Reminded ${Object.keys(byTutor).length} tutor(s) about ${rows.length} class(es)`);
  return rows.length;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function startUnendedClassJob() {
  const run = () => sendUnendedWarnings().catch(e => logger.warn('[UNENDED] Job failed: ' + e.message));
  setTimeout(run, 60 * 1000);
  setInterval(run, 10 * 60 * 1000);
  logger.info('[UNENDED] End-your-class reminder job started (every 10 min)');
}

module.exports = {
  LATE_AFTER_MINS, PARDONED_PER_MONTH, LATE_PENALTY, FOLLOW_UP_FROM, CLASS_START_SQL,
  getPayRates, setPayRates, payFor, recordEarning, payMonths, payMonthDetail,
  applyIncomplete, recordTutorJoin, lateJoins, unendedClasses, sendUnendedWarnings, startUnendedClassJob,
};
