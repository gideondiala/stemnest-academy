/**
 * Learning after class: lesson assignments (projects), unit quizzes,
 * points / leaderboard and due-date reminders.
 *
 * - When a class is completed, each charged student gets that lesson's
 *   assignment (if the lesson has homework), due 7 days later.
 * - When the last lesson of a unit is completed, the unit's quiz is
 *   assigned (if one exists), due 7 days later, 3 attempts, best counts.
 * - Late work earns half marks. Points = project points + quiz points.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');

const DUE_DAYS = 7;
const REMIND_BEFORE_HOURS = 48;
const QUIZ_ATTEMPTS = 3;
const DEFAULT_PASS = 60;

/** Late work earns half the marks. */
function penalised(score, late) {
  const s = Number(score) || 0;
  return late ? Math.round((s / 2) * 100) / 100 : s;
}

/**
 * Called after a student is charged for a completed class. Never throws.
 * Returns { project, quiz } for whatever was assigned.
 */
async function assignAfterClass(studentId, booking) {
  const out = { project: null, quiz: null };
  try {
    if (!booking || !booking.pathway_lesson_id) return out;
    const l = (await pool.query(
      `SELECT pl.id, pl.title, pl.lesson_number, pl.homework1, pl.homework2, pl.unit_id,
              pu.unit_number, pu.name AS unit_name, pg.grade_number, pg.pathway_id
       FROM pathway_lessons pl
       LEFT JOIN pathway_units  pu ON pu.id = pl.unit_id
       LEFT JOIN pathway_grades pg ON pg.id = pl.grade_id
       WHERE pl.id = $1`, [booking.pathway_lesson_id])).rows[0];
    if (!l) return out;

    const due = new Date(Date.now() + DUE_DAYS * 86400000);

    /* 1. The lesson's assignment */
    const brief = [l.homework1, l.homework2].map(x => String(x || '').trim()).filter(Boolean).join('\n\n');
    if (brief) {
      const r = await pool.query(
        `INSERT INTO projects (student_id, tutor_id, title, brief, due_date, due_at, kind, booking_id, lesson_id, status)
         VALUES ($1, $2, $3, $4, $5::date, $6, 'lesson', $7, $8, 'pending')
         ON CONFLICT (student_id, booking_id) WHERE booking_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [studentId, booking.tutor_id, `Lesson ${l.lesson_number}: ${l.title}`.slice(0, 250), brief,
         due.toISOString().slice(0, 10), due, booking.id, l.id]
      );
      if (r.rows.length) {
        out.project = r.rows[0].id;
        _notify(studentId, 'project_assigned', '📝 New assignment',
          `Lesson ${l.lesson_number}: ${l.title} — due ${_fmt(due)}. Submit your link on the Projects tab.`);
      }
    }

    /* 2. Last lesson of a unit → the unit quiz */
    if (l.unit_id && l.unit_number && l.pathway_id) {
      const last = (await pool.query(
        `SELECT MAX(lesson_number) AS n FROM pathway_lessons WHERE unit_id = $1 AND is_active = TRUE`, [l.unit_id])).rows[0].n;
      if (Number(last) === Number(l.lesson_number)) {
        const quiz = (await pool.query(
          `SELECT id, unit_name FROM unit_quizzes WHERE pathway_id = $1 AND grade_number = $2 AND unit_number = $3`,
          [l.pathway_id, l.grade_number, l.unit_number])).rows[0];
        if (quiz) {
          const q = await pool.query(
            `INSERT INTO quiz_assignments (student_id, quiz_id, booking_id, due_at)
             VALUES ($1, $2, $3, $4) ON CONFLICT (student_id, quiz_id) DO NOTHING RETURNING id`,
            [studentId, quiz.id, booking.id, due]);
          if (q.rows.length) {
            out.quiz = q.rows[0].id;
            _notify(studentId, 'quiz_assigned', '🧠 Unit quiz unlocked',
              `${quiz.unit_name || l.unit_name || 'Unit ' + l.unit_number} quiz — due ${_fmt(due)}. You have ${QUIZ_ATTEMPTS} attempts.`);
          }
        }
      }
    }
  } catch (e) {
    logger.warn(`[LEARNING] assignAfterClass failed for ${studentId}: ${e.message}`);
  }
  return out;
}

function _fmt(d) {
  return d.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' });
}
function _notify(userId, type, title, body) {
  try {
    require('./notificationService').saveNotification(userId, type, title, body).catch(() => {});
  } catch { /* optional */ }
}

/* ══════════════ Points & leaderboard ══════════════ */

const POINTS_SQL = `
  SELECT u.id, u.name, u.staff_id,
         COALESCE((SELECT SUM(p.points) FROM projects p WHERE p.student_id = u.id AND p.status = 'reviewed'), 0)
       + COALESCE((SELECT SUM(qa.points) FROM quiz_assignments qa WHERE qa.student_id = u.id), 0) AS points,
         (SELECT COUNT(*) FROM projects p WHERE p.student_id = u.id AND p.status = 'reviewed')::int AS projects_done,
         (SELECT COUNT(*) FROM quiz_assignments qa WHERE qa.student_id = u.id AND qa.attempts_used > 0)::int AS quizzes_done
  FROM users u
  WHERE u.role = 'student' AND u.is_active = TRUE`;

function _displayName(name) {
  const parts = String(name || 'Student').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

async function leaderboard(viewerId, limit = 20) {
  const r = await pool.query(`SELECT * FROM (${POINTS_SQL}) x ORDER BY points DESC, name ASC`);
  let rank = 0, prev = null;
  const ranked = r.rows.map((row, i) => {
    const pts = Number(row.points);
    if (pts !== prev) { rank = i + 1; prev = pts; }
    return { rank, studentId: row.id, name: _displayName(row.name), points: pts,
             projects: row.projects_done, quizzes: row.quizzes_done, isMe: row.id === viewerId };
  });
  const withPoints = ranked.filter(x => x.points > 0);
  const me = ranked.find(x => x.isMe) || null;
  return {
    top: withPoints.slice(0, limit).map(({ studentId, ...rest }) => rest),
    me: me ? { rank: me.points > 0 ? me.rank : null, points: me.points, projects: me.projects, quizzes: me.quizzes, of: withPoints.length } : null,
  };
}

/* ══════════════ Due reminders (2 days before) ══════════════ */

async function runDueReminders() {
  try {
    const soon = `NOW() + INTERVAL '${REMIND_BEFORE_HOURS} hours'`;
    const projects = (await pool.query(
      `SELECT p.id, p.student_id, p.title, p.due_at FROM projects p
       WHERE p.status = 'pending' AND p.due_at IS NOT NULL AND p.reminder_sent_at IS NULL
         AND p.due_at > NOW() AND p.due_at <= ${soon}`)).rows;
    const quizzes = (await pool.query(
      `SELECT qa.id, qa.student_id, qa.due_at, COALESCE(uq.unit_name, 'Unit ' || uq.unit_number) AS title
       FROM quiz_assignments qa JOIN unit_quizzes uq ON uq.id = qa.quiz_id
       WHERE qa.attempts_used = 0 AND qa.due_at IS NOT NULL AND qa.reminder_sent_at IS NULL
         AND qa.due_at > NOW() AND qa.due_at <= ${soon}`)).rows;
    if (!projects.length && !quizzes.length) return 0;

    const byStudent = new Map();
    for (const p of projects) (byStudent.get(p.student_id) || byStudent.set(p.student_id, { p: [], q: [] }).get(p.student_id)).p.push(p);
    for (const q of quizzes)  (byStudent.get(q.student_id) || byStudent.set(q.student_id, { p: [], q: [] }).get(q.student_id)).q.push(q);

    const emailSvc = require('./emailService');
    const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let sent = 0;
    for (const [studentId, items] of byStudent) {
      const s = (await pool.query(
        `SELECT u.name, u.email, sp.parent_email, sp.parent_name, COALESCE(sp.class_paused, FALSE) AS paused
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = $1 AND u.is_active = TRUE`, [studentId])).rows[0];
      if (!s) continue;
      const to = [...new Set([s.parent_email, s.email].filter(Boolean).map(e => e.toLowerCase()))];
      const list = items.p.map(p => `<li>📝 <strong>${esc(p.title)}</strong> — due ${esc(_fmt(new Date(p.due_at)))}</li>`)
        .concat(items.q.map(q => `<li>🧠 <strong>${esc(q.title)} quiz</strong> — due ${esc(_fmt(new Date(q.due_at)))}</li>`)).join('');
      const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;padding:24px;line-height:1.6;color:#1a202c;">
        <h2 style="color:#e65100;">⏰ Due in 2 days</h2>
        <p>Hi ${esc(s.parent_name || s.name)},</p>
        <p>${esc(s.name)} has work due soon:</p><ul>${list}</ul>
        <p>Work handed in after the due date only earns <strong>half marks</strong>, so please finish it in time.</p>
        <a href="${appUrl}/pages/student-dashboard.html" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 28px;border-radius:50px;font-weight:700;">Open the dashboard →</a>
      </div>`;
      let ok = false;
      for (const addr of to) {
        try { await emailSvc.sendEmail({ to: addr, subject: `⏰ ${s.name}: work due in 2 days`, html, template: 'work_due_reminder' }); ok = true; }
        catch (e) { logger.warn(`[LEARNING] Due reminder to ${addr} failed: ${e.message}`); }
      }
      if (ok) {
        if (items.p.length) await pool.query(`UPDATE projects SET reminder_sent_at = NOW() WHERE id = ANY($1::uuid[])`, [items.p.map(x => x.id)]);
        if (items.q.length) await pool.query(`UPDATE quiz_assignments SET reminder_sent_at = NOW() WHERE id = ANY($1::uuid[])`, [items.q.map(x => x.id)]);
        sent++;
      }
    }
    if (sent) logger.info(`[LEARNING] Due reminders sent to ${sent} student(s)`);
    return sent;
  } catch (e) {
    logger.warn('[LEARNING] Due reminders failed: ' + e.message);
    return 0;
  }
}

function startDueReminderJob() {
  setTimeout(runDueReminders, 60 * 1000);
  setInterval(runDueReminders, 60 * 60 * 1000);
  logger.info('[LEARNING] Due-date reminder job started (hourly)');
}

module.exports = {
  DUE_DAYS, QUIZ_ATTEMPTS, DEFAULT_PASS, penalised,
  assignAfterClass, leaderboard, runDueReminders, startDueReminderJob,
};
