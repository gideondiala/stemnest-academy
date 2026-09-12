/**
 * StemNest Academy — Class Reminder Job
 *
 * Runs every 15 minutes via setInterval.
 * Sends reminder emails to parents before upcoming classes:
 *   - 24 hours before class → email to parent
 *   - 30 minutes before class → email to parent
 *
 * Tracks sent reminders in a DB table to prevent duplicates.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');

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

/* ── Main reminder check ── */
async function runReminderCheck() {
  try {
    const emailSvc = require('../services/emailService');
    const now      = new Date();

    /* Fetch all upcoming scheduled bookings with parent contact */
    const result = await pool.query(`
      SELECT b.id, b.date, b.time, b.subject, b.class_link, b.is_demo,
             b.notes,
             u_t.name AS tutor_name
      FROM bookings b
      LEFT JOIN users u_t ON u_t.id = b.tutor_id
      WHERE b.status = 'scheduled'
        AND b.date >= CURRENT_DATE
        AND b.date <= CURRENT_DATE + INTERVAL '2 days'
        /* Skip paused students — no reminders while classes are on hold */
        AND b.student_id NOT IN (
          SELECT user_id FROM student_profiles WHERE class_paused = TRUE
        )
      ORDER BY b.date ASC, b.time ASC
      LIMIT 200
    `);

    for (const booking of result.rows) {
      /* Parse booking datetime */
      const dateStr = booking.date instanceof Date
        ? booking.date.toISOString().split('T')[0]
        : String(booking.date).split('T')[0];

      const rawTime = String(booking.time || '00:00').replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
      const classDateTime = new Date(`${dateStr}T${rawTime.padStart(5,'0')}:00`);

      if (isNaN(classDateTime)) continue;

      const msUntilClass = classDateTime - now;
      const minsUntil    = msUntilClass / 60000;

      /* Parse parent contact from booking notes */
      let notes = {};
      try { notes = typeof booking.notes === 'string' ? JSON.parse(booking.notes || '{}') : (booking.notes || {}); } catch {}

      const parentEmail = notes.email || '';
      const parentName  = notes.parentName || '';
      const studentName = notes.studentName || 'your child';
      const classLink   = booking.class_link || '';
      const tutorName   = booking.tutor_name || 'your StemNest tutor';
      const subject     = booking.subject || 'class';

      const formattedDate = classDateTime.toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      const formattedTime = classDateTime.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit'
      });

      if (!parentEmail) continue;

      /* ── 24-hour reminder: 23h to 25h before class ── */
      if (minsUntil >= 23 * 60 && minsUntil <= 25 * 60) {
        const alreadySent = await _checkSent(booking.id, '24h');
        if (!alreadySent) {
          await emailSvc.sendClassReminderEmail({
            to:          parentEmail,
            name:        parentName || 'there',
            studentName,
            subject,
            time:        `${formattedDate} at ${formattedTime}`,
            classLink,
          }).catch(e => logger.warn(`[REMINDERS] 24h email failed for ${booking.id}:`, e.message));

          await _markSent(booking.id, '24h');
          logger.info(`[REMINDERS] 24h reminder sent: booking=${booking.id} parent=${parentEmail}`);
        }
      }

      /* ── 30-minute reminder: 28 to 32 mins before class ── */
      if (minsUntil >= 28 && minsUntil <= 32) {
        const alreadySent = await _checkSent(booking.id, '30min');
        if (!alreadySent) {
          await emailSvc.sendEmail({
            to:      parentEmail,
            subject: `⏰ Class in 30 minutes — ${studentName}`,
            html:    _build30MinEmail({ parentName, studentName, subject, formattedTime, formattedDate, classLink, tutorName }),
            template: 'reminder_30min',
          }).catch(e => logger.warn(`[REMINDERS] 30min email failed for ${booking.id}:`, e.message));

          await _markSent(booking.id, '30min');
          logger.info(`[REMINDERS] 30min reminder sent: booking=${booking.id} parent=${parentEmail}`);
        }
      }

      /* ── 10-minute reminder: 8 to 12 mins before class ── */
      if (minsUntil >= 8 && minsUntil <= 12) {
        const alreadySent = await _checkSent(booking.id, '10min');
        if (!alreadySent) {
          const urgentSubject = `🚨 Class starts in 10 minutes — ${studentName}`;
          const urgentHtml = `<!DOCTYPE html>
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

          await emailSvc.sendEmail({
            to:      parentEmail,
            subject: urgentSubject,
            html:    urgentHtml,
            template: 'reminder_10min',
          }).catch(e => logger.warn(`[REMINDERS] 10min email failed for ${booking.id}:`, e.message));

          await _markSent(booking.id, '10min');
          logger.info(`[REMINDERS] 10min reminder sent: booking=${booking.id} parent=${parentEmail}`);
        }
      }
    }
  } catch (err) {
    logger.error('[REMINDERS] Job error:', err.message);
  }
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

async function _checkSent(bookingId, type) {
  try {
    const r = await pool.query(
      'SELECT id FROM reminders_sent WHERE booking_id = $1 AND type = $2',
      [bookingId, type]
    );
    return r.rows.length > 0;
  } catch { return false; }
}

async function _markSent(bookingId, type) {
  await pool.query(
    'INSERT INTO reminders_sent (booking_id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [bookingId, type]
  ).catch(() => {});
}

/* ── Start the job ── */
function startReminderJob() {
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  ensureRemindersTable().then(() => {
    logger.info('[REMINDERS] Job started — checking every 15 minutes');

    /* Run immediately on startup, then every 15 mins */
    runReminderCheck();
    setInterval(runReminderCheck, INTERVAL_MS);
  }).catch(e => logger.error('[REMINDERS] Failed to start:', e.message));
}

module.exports = { startReminderJob };
