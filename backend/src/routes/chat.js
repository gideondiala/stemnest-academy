/**
 * Chat between a student (or their parent, via the family login) and a tutor.
 *
 * GET  /api/chat/threads                     — my conversations (with unread counts)
 * GET  /api/chat/messages?studentId=&tutorId= — one conversation (marks it read for me)
 * POST /api/chat/messages                    — { studentId | tutorId, body, link? }
 * GET  /api/chat/unread?since=               — unread count + new messages for pop-ups
 *
 * Students talk to their own tutors; tutors to the students they teach.
 * Admins can read every conversation (safeguarding) but reading does not mark
 * anything as read. A parent viewing a child's dashboard sends as "parent".
 * Tutors are emailed when a message has been unread for 6 hours.
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();
const ADMIN = ['admin', 'super_admin'];
const MAX_BODY = 2000;
const REMIND_AFTER_HOURS = 6;

function isLink(s) { return /^https?:\/\/\S+\.\S+/i.test(String(s || '').trim()); }
function viewerKind(user) {
  if (ADMIN.includes(user.role)) return 'admin';
  if (user.role === 'tutor') return 'tutor';
  if (user.role === 'student') return user.parentId ? 'parent' : 'student';
  return null;
}

/** Tutors a student has (recent/upcoming classes, batches, enrolments). */
async function tutorsOfStudent(studentId) {
  const r = await pool.query(
    `SELECT DISTINCT t.id, t.name, t.staff_id AS "staffId", t.photo_url AS photo
     FROM users t
     WHERE t.role = 'tutor' AND t.id IN (
       SELECT tutor_id FROM bookings WHERE student_id = $1 AND is_demo = FALSE AND date >= CURRENT_DATE - 60
       UNION SELECT b.tutor_id FROM batches b JOIN batch_members bm ON bm.batch_id = b.id
             WHERE bm.student_id = $1 AND bm.status = 'active' AND b.status IN ('active','paused')
       UNION SELECT tutor_id FROM enrolments WHERE student_id = $1 AND status IN ('active','paused') AND tutor_id IS NOT NULL
       UNION SELECT tutor_id FROM chat_messages WHERE student_id = $1
     )
     ORDER BY t.name`, [studentId]);
  return r.rows;
}

/** Students a tutor teaches (recent/upcoming classes, batches) or has chatted with. */
async function studentsOfTutor(tutorId) {
  const r = await pool.query(
    `SELECT DISTINCT s.id, s.name, s.staff_id AS "staffId"
     FROM users s
     WHERE s.role = 'student' AND s.is_active = TRUE AND s.id IN (
       SELECT student_id FROM bookings WHERE tutor_id = $1 AND student_id IS NOT NULL AND is_demo = FALSE AND date >= CURRENT_DATE - 60
       UNION SELECT bm.student_id FROM batch_members bm JOIN batches b ON b.id = bm.batch_id
             WHERE b.tutor_id = $1 AND bm.status = 'active' AND b.status IN ('active','paused')
       UNION SELECT student_id FROM chat_messages WHERE tutor_id = $1
     )
     ORDER BY s.name`, [tutorId]);
  return r.rows;
}

async function canAccess(user, studentId, tutorId) {
  const kind = viewerKind(user);
  if (kind === 'admin') return true;
  if (kind === 'tutor') return tutorId === user.id && (await studentsOfTutor(user.id)).some(s => s.id === studentId);
  if (kind === 'student' || kind === 'parent') return studentId === user.id && (await tutorsOfStudent(user.id)).some(t => t.id === tutorId);
  return false;
}

/* ── Threads ── */
router.get('/threads', requireAuth, async (req, res, next) => {
  try {
    const kind = viewerKind(req.user);
    if (!kind) return res.status(403).json({ success: false, error: 'Chat is for students, parents, tutors and admins' });

    if (kind === 'admin') {
      const r = await pool.query(
        `SELECT m.student_id AS "studentId", m.tutor_id AS "tutorId", s.name AS "studentName", s.staff_id AS "studentStaffId",
                t.name AS "tutorName", MAX(m.created_at) AS "lastAt", COUNT(*)::int AS messages,
                COUNT(*) FILTER (WHERE m.sender_role IN ('student','parent') AND m.read_by_tutor_at IS NULL)::int AS "unreadByTutor",
                (ARRAY_AGG(COALESCE(m.body, m.link) ORDER BY m.created_at DESC))[1] AS "lastText"
         FROM chat_messages m JOIN users s ON s.id = m.student_id JOIN users t ON t.id = m.tutor_id
         GROUP BY 1,2,3,4,5 ORDER BY MAX(m.created_at) DESC LIMIT 300`);
      return res.json({ success: true, viewer: kind, threads: r.rows });
    }

    const mine = kind === 'tutor';
    const people = mine ? await studentsOfTutor(req.user.id) : await tutorsOfStudent(req.user.id);
    const stats = (await pool.query(
      mine
        ? `SELECT student_id AS other, MAX(created_at) AS "lastAt",
                  COUNT(*) FILTER (WHERE sender_role IN ('student','parent') AND read_by_tutor_at IS NULL)::int AS unread,
                  (ARRAY_AGG(COALESCE(body, link) ORDER BY created_at DESC))[1] AS "lastText"
           FROM chat_messages WHERE tutor_id = $1 GROUP BY student_id`
        : `SELECT tutor_id AS other, MAX(created_at) AS "lastAt",
                  COUNT(*) FILTER (WHERE sender_role = 'tutor' AND read_by_student_at IS NULL)::int AS unread,
                  (ARRAY_AGG(COALESCE(body, link) ORDER BY created_at DESC))[1] AS "lastText"
           FROM chat_messages WHERE student_id = $1 GROUP BY tutor_id`, [req.user.id])).rows;
    const threads = people.map(p => {
      const st = stats.find(x => x.other === p.id) || {};
      return { id: p.id, name: p.name, staffId: p.staffId, lastAt: st.lastAt || null, lastText: st.lastText || null, unread: st.unread || 0 };
    }).sort((a, b) => (b.unread - a.unread) || (new Date(b.lastAt || 0) - new Date(a.lastAt || 0)) || a.name.localeCompare(b.name));
    res.json({ success: true, viewer: kind, threads });
  } catch (err) { next(err); }
});

/* ── One conversation ── */
router.get('/messages', requireAuth, async (req, res, next) => {
  try {
    const kind = viewerKind(req.user);
    const studentId = kind === 'student' || kind === 'parent' ? req.user.id : req.query.studentId;
    const tutorId   = kind === 'tutor' ? req.user.id : req.query.tutorId;
    if (!studentId || !tutorId) return res.status(400).json({ success: false, error: 'Choose a conversation' });
    if (!(await canAccess(req.user, studentId, tutorId))) return res.status(403).json({ success: false, error: 'Not your conversation' });

    if (kind === 'tutor') {
      await pool.query(`UPDATE chat_messages SET read_by_tutor_at = NOW()
                        WHERE student_id = $1 AND tutor_id = $2 AND sender_role IN ('student','parent') AND read_by_tutor_at IS NULL`, [studentId, tutorId]);
    } else if (kind === 'student' || kind === 'parent') {
      await pool.query(`UPDATE chat_messages SET read_by_student_at = NOW()
                        WHERE student_id = $1 AND tutor_id = $2 AND sender_role = 'tutor' AND read_by_student_at IS NULL`, [studentId, tutorId]);
    }
    const r = await pool.query(
      `SELECT m.id, m.sender_role AS "senderRole", u.name AS "senderName", m.body, m.link, m.created_at AS "createdAt",
              m.read_by_tutor_at AS "readByTutorAt", m.read_by_student_at AS "readByStudentAt"
       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.student_id = $1 AND m.tutor_id = $2
       ORDER BY m.created_at DESC LIMIT 300`, [studentId, tutorId]);
    const names = (await pool.query(`SELECT id, name, staff_id FROM users WHERE id IN ($1, $2)`, [studentId, tutorId])).rows;
    res.json({
      success: true, viewer: kind,
      student: names.find(n => n.id === studentId), tutor: names.find(n => n.id === tutorId),
      messages: r.rows.reverse(),
    });
  } catch (err) { next(err); }
});

/* ── Send ── */
router.post('/messages', requireAuth, async (req, res, next) => {
  try {
    const kind = viewerKind(req.user);
    if (!kind || kind === 'admin') return res.status(403).json({ success: false, error: 'Admins can read conversations but not send in them' });
    const studentId = kind === 'tutor' ? req.body.studentId : req.user.id;
    const tutorId   = kind === 'tutor' ? req.user.id : req.body.tutorId;
    const body = String(req.body.body || '').trim().slice(0, MAX_BODY);
    const link = String(req.body.link || '').trim();
    if (!body && !link) return res.status(400).json({ success: false, error: 'Type a message' });
    if (link && !isLink(link)) return res.status(400).json({ success: false, error: 'Links must start with https://' });
    if (!(await canAccess(req.user, studentId, tutorId))) return res.status(403).json({ success: false, error: 'You can only message your own tutor or students' });

    const senderId = kind === 'parent' ? req.user.parentId : req.user.id;
    const r = await pool.query(
      `INSERT INTO chat_messages (student_id, tutor_id, sender_id, sender_role, body, link)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, sender_role AS "senderRole", body, link, created_at AS "createdAt"`,
      [studentId, tutorId, senderId, kind, body || null, link || null]);
    const nm = (await pool.query(`SELECT name FROM users WHERE id = $1`, [senderId])).rows[0];
    res.status(201).json({ success: true, message: { ...r.rows[0], senderName: nm ? nm.name : '' } });
  } catch (err) { next(err); }
});

/* ── Unread count + new messages since a time (for badges and pop-ups) ── */
router.get('/unread', requireAuth, async (req, res, next) => {
  try {
    const kind = viewerKind(req.user);
    if (!kind || kind === 'admin') return res.json({ success: true, unread: 0, recent: [] });
    const since = req.query.since && !isNaN(Date.parse(req.query.since)) ? new Date(req.query.since) : new Date(Date.now() - 60000);
    const tutorSide = kind === 'tutor';
    const where = tutorSide
      ? `m.tutor_id = $1 AND m.sender_role IN ('student','parent') AND m.read_by_tutor_at IS NULL`
      : `m.student_id = $1 AND m.sender_role = 'tutor' AND m.read_by_student_at IS NULL`;
    const count = (await pool.query(`SELECT COUNT(*)::int n FROM chat_messages m WHERE ${where}`, [req.user.id])).rows[0].n;
    const recent = (await pool.query(
      `SELECT m.id, m.student_id AS "studentId", m.tutor_id AS "tutorId", m.sender_role AS "senderRole",
              s.name AS "studentName", s.staff_id AS "studentStaffId", t.name AS "tutorName", u.name AS "senderName",
              LEFT(COALESCE(m.body, m.link), 120) AS preview, m.created_at AS "createdAt"
       FROM chat_messages m JOIN users s ON s.id = m.student_id JOIN users t ON t.id = m.tutor_id
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE ${where} AND m.created_at > $2
       ORDER BY m.created_at ASC LIMIT 10`, [req.user.id, since])).rows;
    res.json({ success: true, unread: count, recent, now: new Date().toISOString() });
  } catch (err) { next(err); }
});

/* ── Email tutors about messages unread for 6 hours (hourly) ── */
async function runChatReminders() {
  try {
    const rows = (await pool.query(
      `SELECT m.id, m.tutor_id, t.name AS tutor_name, t.email AS tutor_email, s.name AS student_name, s.staff_id
       FROM chat_messages m JOIN users t ON t.id = m.tutor_id JOIN users s ON s.id = m.student_id
       WHERE m.sender_role IN ('student','parent') AND m.read_by_tutor_at IS NULL AND m.reminder_sent_at IS NULL
         AND m.created_at < NOW() - INTERVAL '${REMIND_AFTER_HOURS} hours'`)).rows;
    if (!rows.length) return 0;
    const byTutor = new Map();
    for (const r of rows) (byTutor.get(r.tutor_id) || byTutor.set(r.tutor_id, []).get(r.tutor_id)).push(r);
    const emailSvc = require('../services/emailService');
    const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let sent = 0;
    for (const [, list] of byTutor) {
      const t = list[0];
      if (!t.tutor_email) continue;
      const people = {};
      list.forEach(r => { const k = r.student_name + (r.staff_id ? ' (' + r.staff_id + ')' : ''); people[k] = (people[k] || 0) + 1; });
      try {
        await emailSvc.sendEmail({
          to: t.tutor_email,
          subject: `💬 You have ${list.length} unread message${list.length === 1 ? '' : 's'} on StemNest`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;line-height:1.6;color:#1a202c;">
            <h2 style="color:#1a56db;">Unread messages</h2>
            <p>Hi ${esc(t.tutor_name)},</p>
            <p>These messages have been waiting more than ${REMIND_AFTER_HOURS} hours:</p>
            <ul>${Object.entries(people).map(([k, n]) => `<li><strong>${esc(k)}</strong> — ${n} message${n === 1 ? '' : 's'}</li>`).join('')}</ul>
            <a href="${appUrl}/pages/tutor-dashboard.html#messages" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">Open Messages →</a>
          </div>`,
          template: 'chat_unread_reminder',
        });
        await pool.query(`UPDATE chat_messages SET reminder_sent_at = NOW() WHERE id = ANY($1::uuid[])`, [list.map(r => r.id)]);
        sent++;
      } catch (e) { logger.warn(`[CHAT] Reminder to ${t.tutor_email} failed: ${e.message}`); }
    }
    if (sent) logger.info(`[CHAT] Unread-message reminders sent to ${sent} tutor(s)`);
    return sent;
  } catch (e) { logger.warn('[CHAT] Reminder job failed: ' + e.message); return 0; }
}

function startChatReminderJob() {
  setTimeout(runChatReminders, 2 * 60 * 1000);
  setInterval(runChatReminders, 60 * 60 * 1000);
}

router.runChatReminders = runChatReminders;
router.startChatReminderJob = startChatReminderJob;
module.exports = router;
