/**
 * StemNest Academy — Class Reminder Job
 *
 * Runs every 2 minutes via setInterval.
 * Sends reminder emails to parents (demo, 1-on-1 and batch classes):
 *   - 24 hours before class
 *   - 30 minutes before class
 *   - 10 minutes before class
 *
 * Tracks sent reminders in a DB table to prevent duplicates. Rescheduling
 * a booking clears its rows so it is reminded again at the new time.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');
const { platformToInstant, formatForTimeZone, isValidTimeZone } = require('../utils/timezone');
const { resolveUserTimeZone } = require('../services/timezoneService');

/* ── Ensure the reminders_sent table exists ── */
async function ensureRemindersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders_sent (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id  UUID NOT NULL,
      type        VARCHAR(20) NOT NULL,  -- '24h' or '30min'
      sent_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(booking_id, type)
    )
  `).catch(e => logger.warn('[REMINDERS] Table create warning:', e.message));
}

/* Reminder windows (minutes before class). The job runs every
   CHECK_EVERY_MINS, so each window is wider than that interval and no
   class can slip between two checks. */
const CHECK_EVERY_MINS = 2;
const WINDOWS = [
  { type: '24h',   from: 23 * 60, to: 25 * 60 },
  { type: '30min', from: 25,      to: 35 },
  { type: '10min', from: 5,       to: 12 },
];

/* ── Main reminder check ── */
async function runReminderCheck() {
  try {
    const now = new Date();

    /* Upcoming scheduled classes (demo, 1-on-1 and batch) */
    const result = await pool.query(`
      SELECT b.id, b.date, b.time, b.subject, b.class_link, b.is_demo,
             b.notes, b.student_id, b.batch_id,
             u_t.name AS tutor_name,
             u_s.name AS student_name, u_s.email AS student_email,
             sp.parent_name, sp.parent_email,
             COALESCE(sp.class_paused, FALSE)      AS class_paused,
             COALESCE(sp.credits_suspended, FALSE) AS credits_suspended
      FROM bookings b
      LEFT JOIN users u_t            ON u_t.id = b.tutor_id
      LEFT JOIN users u_s            ON u_s.id = b.student_id
      LEFT JOIN student_profiles sp  ON sp.user_id = b.student_id
      WHERE b.status = 'scheduled'
        AND b.date >= CURRENT_DATE - 1
        AND b.date <= CURRENT_DATE + 2
      ORDER BY b.date ASC, b.time ASC
      LIMIT 2000
    `);

    for (const booking of result.rows) {
      /* Booking date/time are stored in WAT — convert to the real instant */
      const classDateTime = platformToInstant(booking.date, booking.time);
      if (!classDateTime) continue;
      const minsUntil = (classDateTime - now) / 60000;

      const win = WINDOWS.find(w => minsUntil >= w.from && minsUntil <= w.to);
      if (!win) continue;

      /* No reminders while classes are paused or credits are suspended */
      if (booking.class_paused || booking.credits_suspended) continue;

      const recipients = await _recipients(booking);
      if (!recipients.length) continue;

      /* Claim this reminder atomically so the cluster's other instance
         (and the next check) can never send it twice */
      if (!(await _claim(booking.id, win.type))) continue;

      let sentAny = false;
      for (const r of recipients) {
        try {
          await _sendReminder(win.type, booking, r);
          sentAny = true;
          logger.info(`[REMINDERS] ${win.type} reminder sent: booking=${booking.id} to=${r.email}`);
        } catch (e) {
          logger.warn(`[REMINDERS] ${win.type} email failed for ${booking.id} (${r.email}): ${e.message}`);
        }
      }
      /* Nothing went out — release the claim so the next check retries,
         but give up after a few tries so a mail outage never floods a parent */
      if (!sentAny) {
        const k = booking.id + '|' + win.type;
        const n = (_failedTries.get(k) || 0) + 1;
        _failedTries.set(k, n);
        if (n < MAX_SEND_TRIES) await _unclaim(booking.id, win.type);
        else logger.warn(`[REMINDERS] Giving up on ${win.type} for ${booking.id} after ${n} failed tries`);
      }
    }
  } catch (err) {
    logger.error('[REMINDERS] Job error:', err.message);
  }
}

/** Parent(s) to remind for a booking: 1-on-1 student, batch members, or demo contact. */
async function _recipients(booking) {
  let notes = {};
  try { notes = typeof booking.notes === 'string' ? JSON.parse(booking.notes || '{}') : (booking.notes || {}); } catch {}

  if (booking.student_id) {
    const email = booking.parent_email || booking.student_email || notes.email;
    if (!email) return [];
    return [{
      userId: booking.student_id, email,
      name: booking.parent_name || notes.parentName || '',
      studentName: booking.student_name || notes.studentName || 'your child',
      timezone: notes.timezone,
    }];
  }

  if (booking.batch_id) {
    const m = await pool.query(
      `SELECT u.id, u.name, u.email, sp.parent_name, sp.parent_email
       FROM batch_members bm
       JOIN users u ON u.id = bm.student_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE bm.batch_id = $1 AND bm.status = 'active'
         AND COALESCE(sp.class_paused, FALSE) = FALSE
         AND COALESCE(sp.credits_suspended, FALSE) = FALSE`,
      [booking.batch_id]
    ).catch(() => ({ rows: [] }));
    return m.rows
      .filter(s => s.parent_email || s.email)
      .map(s => ({ userId: s.id, email: s.parent_email || s.email, name: s.parent_name || '', studentName: s.name || 'your child' }));
  }

  /* Demo booking without a student account */
  if (!notes.email) return [];
  return [{ userId: null, email: notes.email, name: notes.parentName || '', studentName: notes.studentName || 'your child', timezone: notes.timezone }];
}

/** Send one reminder, with the time shown in the recipient's own timezone. */
async function _sendReminder(type, booking, r) {
  const emailSvc = require('../services/emailService');
  const tz = isValidTimeZone(r.timezone) ? r.timezone : await resolveUserTimeZone(r.userId, r.email);
  const local = formatForTimeZone(booking.date, booking.time, tz);
  const ctx = {
    parentName:    r.name,
    studentName:   r.studentName,
    subject:       booking.subject || 'class',
    classLink:     booking.class_link || '',
    tutorName:     booking.tutor_name || 'your StemNest tutor',
    formattedDate: local.date,
    formattedTime: `${local.time} ${local.abbr}`.trim(),
  };

  if (type === '24h') {
    return emailSvc.sendClassReminderEmail({
      to: r.email, name: ctx.parentName || 'there', studentName: ctx.studentName,
      subject: ctx.subject, time: `${ctx.formattedDate} at ${ctx.formattedTime}`, classLink: ctx.classLink,
    });
  }
  if (type === '30min') {
    return emailSvc.sendEmail({
      to: r.email, subject: `⏰ Class in 30 minutes — ${ctx.studentName}`,
      html: _build30MinEmail(ctx), template: 'reminder_30min',
    });
  }
  return emailSvc.sendEmail({
    to: r.email, subject: `🚨 Class starts in 10 minutes — ${ctx.studentName}`,
    html: _build10MinEmail(ctx), template: 'reminder_10min',
  });
}

function _build10MinEmail({ parentName, studentName, subject, formattedTime, formattedDate, classLink, tutorName }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f6fb;margin:0;padding:0;}
  .container{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);}
  .header{background:linear-gradient(135deg,#ff6b35,#e65100);padding:28px 40px;text-align:center;}
  .header h1{color:#fff;font-size:24px;margin:0;font-weight:900;}
  .body{padding:32px 40px;color:#1a202c;font-size:15px;line-height:1.7;}
  .btn{display:inline-block;background:#ff6b35;color:#fff!important;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:700;font-size:16px;margin:16px 0;}
  .footer{background:#f4f6fb;padding:20px 40px;text-align:center;font-size:12px;color:#718096;}
</style></head>
<body>
  <div class="container">
    <div class="header"><h1>StemNest Academy 🚨</h1></div>
    <div class="body">
      <h2 style="color:#e65100;">Class starts in 10 minutes! ⏱️</h2>
      <p>Hi ${parentName || 'there'},</p>
      <p><strong>${studentName}'s</strong> ${subject} class with <strong>${tutorName}</strong> starts in <strong>10 minutes</strong>. Please make sure they are ready!</p>
      <p><strong>Time:</strong> ${formattedTime} · ${formattedDate}</p>
      ${classLink ? `<a href="${classLink}" class="btn">🔗 Join Class Now →</a>` : ''}
      <p style="font-size:13px;color:#718096;margin-top:16px;">⚠️ Use a laptop or desktop — phones are not supported.</p>
    </div>
    <div class="footer">© ${new Date().getFullYear()} StemNest Academy Ltd · <a href="${process.env.APP_URL || 'https://stemnestacademy.co.uk'}" style="color:#1a56db;">stemnestacademy.co.uk</a></div>
  </div>
</body></html>`;
}

function _build30MinEmail({ parentName, studentName, subject, formattedTime, formattedDate, classLink, tutorName }) {
  const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f4f6fb; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .header { background: linear-gradient(135deg, #0e9f6e, #1a56db); padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 26px; margin: 0; font-weight: 900; }
    .body { padding: 36px 40px; color: #1a202c; font-size: 15px; line-height: 1.7; }
    .info-box { background: #f0fdf4; border-radius: 12px; padding: 18px 22px; margin: 20px 0; font-size: 14px; border-left: 4px solid #0e9f6e; }
    .btn { display: inline-block; background: #0e9f6e; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 50px; font-weight: 700; font-size: 15px; margin: 20px 0; }
    .warn-box { background: #fff3e0; border-radius: 12px; padding: 14px 20px; margin: 16px 0; font-size: 13px; color: #e65100; }
    .footer { background: #f4f6fb; padding: 20px 40px; text-align: center; font-size: 12px; color: #718096; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>StemNest Academy ⏰</h1>
    </div>
    <div class="body">
      <h2>Class starts in 30 minutes! 🚀</h2>
      <p>Hi ${parentName || 'there'},</p>
      <p>Just a reminder — <strong>${studentName}</strong>'s class is starting in <strong>30 minutes</strong>. Time to get ready!</p>
      <div class="info-box">
        <strong>Subject:</strong> ${subject}<br>
        <strong>Date:</strong> ${formattedDate}<br>
        <strong>Time:</strong> ${formattedTime}<br>
        <strong>Teacher:</strong> ${tutorName}
      </div>
      ${classLink
        ? `<a href="${classLink}" class="btn">🔗 Join Class Now →</a>`
        : `<p style="color:#718096;font-size:13px;">Your class joining link is in your confirmation email.</p>`
      }
      <div class="warn-box">
        ⚠️ <strong>Reminder:</strong> Please use a <strong>laptop or desktop</strong> — phones and tablets are not supported for classes.
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} StemNest Academy Ltd · <a href="${appUrl}" style="color:#1a56db;">stemnestacademy.co.uk</a></p>
    </div>
  </div>
</body>
</html>`;
}

/** Atomically record a reminder; true only for the caller that inserted it. */
/* Failed sends per reminder (this process); cleared daily */
const MAX_SEND_TRIES = 3;
const _failedTries = new Map();
setInterval(() => _failedTries.clear(), 24 * 60 * 60 * 1000).unref();

async function _claim(bookingId, type) {
  try {
    const r = await pool.query(
      'INSERT INTO reminders_sent (booking_id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
      [bookingId, type]
    );
    return r.rows.length > 0;
  } catch { return false; }
}

async function _unclaim(bookingId, type) {
  await pool.query('DELETE FROM reminders_sent WHERE booking_id = $1 AND type = $2', [bookingId, type]).catch(() => {});
}

/* ── Start the job ── */
function startReminderJob() {
  const INTERVAL_MS = CHECK_EVERY_MINS * 60 * 1000;

  ensureRemindersTable().then(() => {
    logger.info(`[REMINDERS] Job started — checking every ${CHECK_EVERY_MINS} minutes`);

    /* Run immediately on startup, then every CHECK_EVERY_MINS */
    runReminderCheck();
    setInterval(runReminderCheck, INTERVAL_MS);
  }).catch(e => logger.error('[REMINDERS] Failed to start:', e.message));
}

module.exports = { startReminderJob, runReminderCheck };
