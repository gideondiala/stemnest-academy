/**
 * Tell a tutor that their schedule changed (moved class, new schedule,
 * tutor change, pause/resume). Sends an email AND saves an in-app
 * notification (type 'schedule_change') shown on the tutor dashboard.
 * Never throws — a notification must not undo a completed change.
 */
const pool   = require('../config/db');
const logger = require('../utils/logger');
const { resolveUserTimeZone } = require('./timezoneService');
const { formatForTimeZone } = require('../utils/timezone');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** "Sat 10 Oct, 12:00 PM" in the tutor's time zone (falls back to WAT). */
async function whenFor(tutor, d, t) {
  const tz = await resolveUserTimeZone(tutor.id, tutor.email).catch(() => null);
  const f = formatForTimeZone(d, String(t).slice(0, 5), tz);
  return f ? f.full : `${d} ${String(t).slice(0, 5)} WAT`;
}

/** Who a class is with: the student's name, or "Batch B-007". */
async function classLabel(db, { studentId, batchId, fallback }) {
  if (batchId) {
    const b = await db.query('SELECT batch_ref FROM batches WHERE id = $1', [batchId]).catch(() => ({ rows: [] }));
    if (b.rows[0]) return 'Batch ' + b.rows[0].batch_ref;
  }
  if (studentId) {
    const s = await db.query('SELECT name FROM users WHERE id = $1', [studentId]);
    if (s.rows[0]) return s.rows[0].name;
  }
  return fallback || 'your student';
}

/**
 * @param {object} o
 * @param {string} o.tutorId
 * @param {string} o.title     short line for the dashboard / email subject
 * @param {string} o.body      plain-text detail for the dashboard
 * @param {string[]} [o.lines] HTML-safe detail lines for the email (escaped here)
 * @param {string} [o.template]
 */
async function notifyTutor({ tutorId, title, body, lines, template }) {
  try {
    if (!tutorId) return;
    const t = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [tutorId]);
    const tutor = t.rows[0];
    if (!tutor) return;
    await require('./notificationService').saveNotification(tutor.id, 'schedule_change', title, body);
    if (!tutor.email) return;
    const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
    await require('./emailService').sendEmail({
      to: tutor.email,
      subject: '📅 ' + title,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;line-height:1.6;color:#1a202c;">
        <h2 style="color:#1a56db;margin-top:0;">📅 Schedule change</h2>
        <p>Hi ${esc((tutor.name || '').split(' ')[0] || 'there')},</p>
        <p><strong>${esc(title)}</strong></p>
        ${(lines && lines.length) ? `<div style="background:#f0f4ff;border-left:4px solid #1a56db;border-radius:10px;padding:14px 18px;margin:14px 0;">${lines.map(l => esc(l)).join('<br>')}</div>` : ''}
        <p>Your calendar on the tutor dashboard already shows the change.</p>
        <a href="${appUrl}/pages/tutor-dashboard.html" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 26px;border-radius:50px;font-weight:700;">Open my dashboard</a>
      </div>`,
      template: template || 'tutor_schedule_change',
    });
  } catch (e) {
    logger.warn(`[TUTOR NOTIFY] Failed for tutor ${tutorId}: ${e.message}`);
  }
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sat 12:00 PM WAT, Tue 5:00 PM WAT" — weekly slots in the tutor's time zone. */
async function slotsFor(tutor, schedule) {
  const tz = await resolveUserTimeZone(tutor.id, tutor.email).catch(() => null);
  const today = new Date();
  return (schedule || []).map(s => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12));
    d.setUTCDate(d.getUTCDate() + ((Number(s.weekday) - d.getUTCDay() + 7) % 7));
    const f = formatForTimeZone(d.toISOString().slice(0, 10), String(s.time).slice(0, 5), tz);
    return f ? `${f.date.split(',')[0]} ${f.time} ${f.abbr}` : `${WD[s.weekday]} ${String(s.time).slice(0, 5)} WAT`;
  }).join(', ');
}

async function _tutor(id) {
  if (!id) return null;
  return (await pool.query('SELECT id, name, email FROM users WHERE id = $1', [id])).rows[0] || null;
}

async function _pathwayName(enrolmentId) {
  if (!enrolmentId) return '';
  const r = await pool.query(
    `SELECT p.name FROM enrolments e JOIN pathways p ON p.id = e.pathway_id WHERE e.id = $1`, [enrolmentId]
  ).catch(() => ({ rows: [] }));
  return r.rows[0] ? r.rows[0].name : '';
}

/**
 * A student's weekly schedule was replaced (Post-Sales "Reschedule").
 * oldTutorIds: tutors who taught the old classes; newTutorId: who teaches now.
 */
async function notifyNewSchedule({ studentName, oldTutorIds, newTutorId, schedule, first, count, enrolmentId }) {
  try {
    const pw = await _pathwayName(enrolmentId);
    const forWhat = studentName + (pw ? ' (' + pw + ')' : '');
    for (const tid of [...new Set([...(oldTutorIds || []), newTutorId].filter(Boolean))]) {
      const t = await _tutor(tid);
      if (!t) continue;
      if (tid !== newTutorId) {
        const nt = await _tutor(newTutorId);
        await notifyTutor({
          tutorId: tid,
          title: `${forWhat} has moved to ${nt ? nt.name : 'another tutor'}`,
          body: 'Their old slots on your calendar are now free.',
          lines: [`From: ${await whenFor(t, first.date, first.time)}`, 'Their old slots on your calendar are now free.'],
        });
        continue;
      }
      const slots = await slotsFor(t, schedule);
      const firstWhen = await whenFor(t, first.date, first.time);
      await notifyTutor({
        tutorId: tid,
        title: `New schedule for ${forWhat}`,
        body: `Every ${slots} · first class ${firstWhen} · ${count} class${count === 1 ? '' : 'es'}`,
        lines: [`Student: ${forWhat}`, `New weekly time: ${slots}`, `First class: ${firstWhen}`, `Classes moved: ${count}`],
      });
    }
  } catch (e) { logger.warn('[TUTOR NOTIFY] new schedule: ' + e.message); }
}

/** A student (one pathway) was handed from one tutor to another. */
async function notifyTutorChange({ studentName, oldTutorIds, newTutorId, fromDate, classes, enrolmentId }) {
  try {
    const pw = await _pathwayName(enrolmentId);
    const forWhat = studentName + (pw ? ' (' + pw + ')' : '');
    const nt = await _tutor(newTutorId);
    const list = [];
    for (const c of (classes || []).slice(0, 4)) list.push(c);
    for (const tid of [...new Set((oldTutorIds || []).filter(id => id && id !== newTutorId))]) {
      await notifyTutor({
        tutorId: tid,
        title: `${forWhat} has moved to ${nt ? nt.name : 'another tutor'}`,
        body: `From ${fromDate}. Their classes are no longer on your calendar.`,
        lines: [`Student: ${forWhat}`, `New tutor: ${nt ? nt.name : '—'}`, `From: ${fromDate}`, 'Their old slots on your calendar are now free.'],
      });
    }
    if (nt) {
      const whens = [];
      for (const c of list) whens.push(await whenFor(nt, c.date, c.time));
      await notifyTutor({
        tutorId: nt.id,
        title: `New student: ${forWhat}`,
        body: `${(classes || []).length} class${(classes || []).length === 1 ? '' : 'es'} added to your calendar` + (whens[0] ? ` · first ${whens[0]}` : ''),
        lines: [`Student: ${forWhat}`, `Classes added: ${(classes || []).length}`, ...(whens.length ? ['Next classes:', ...whens.map(w => '• ' + w)] : [])],
      });
    }
  } catch (e) { logger.warn('[TUTOR NOTIFY] tutor change: ' + e.message); }
}

module.exports = { notifyTutor, whenFor, classLabel, slotsFor, notifyNewSchedule, notifyTutorChange };
