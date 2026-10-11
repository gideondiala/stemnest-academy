/**
 * Student reports.
 *
 * - Unit report: created when the last lesson of a unit is taught.
 * - Grade report: created when the student finishes the grade.
 * - The tutor adds 1–5 skill ratings, remarks and a recommendation.
 *   Reminder after 3 days; published automatically after 5 days
 *   (without tutor comments) so parents always get it.
 * - The numbers (projects, quiz, punctuality, attendance, study time)
 *   are worked out when the report is viewed, so work handed in after
 *   publishing still shows. Anything not set up yet (no quiz for the
 *   unit, lessons without homework) is reported as such, never as zero.
 */
const pool   = require('../config/db');
const logger = require('../utils/logger');

const SKILLS = [
  { key: 'understanding',   label: 'Understanding of the topics' },
  { key: 'problem_solving', label: 'Problem solving' },
  { key: 'creativity',      label: 'Creativity' },
  { key: 'focus',           label: 'Focus and participation' },
  { key: 'communication',   label: 'Communication' },
];
const PUBLISH_AFTER_DAYS = 5;
const REMIND_AFTER_DAYS  = 3;
const ON_TIME_MINS       = 5;    // joined up to 5 minutes after the start = on time
const JOIN_WINDOW_BEFORE = 120;  // a Join click counts from 2 hours before the class …
const JOIN_WINDOW_AFTER  = 120;  // … until 2 hours after it started
const TRACKING_FROM      = '2026-10-11';  // join times / study time recorded from this day

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const appUrl = () => process.env.APP_URL || 'https://stemnestacademy.co.uk';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ══════════════ Tracking ══════════════ */

/** Student clicked "Join class". First click per class counts. */
async function recordJoin(studentId, bookingId) {
  const b = (await pool.query(
    `SELECT b.id, b.student_id, b.batch_id, b.status,
            EXTRACT(EPOCH FROM (NOW() - ((b.date + b.time) AT TIME ZONE 'Africa/Lagos')))::int / 60 AS mins
     FROM bookings b WHERE b.id = $1`, [bookingId])).rows[0];
  if (!b) throw httpError(404, 'Class not found');
  const mine = b.student_id === studentId || (b.batch_id && (await pool.query(
    `SELECT 1 FROM batch_members WHERE batch_id = $1 AND student_id = $2`, [b.batch_id, studentId])).rows.length);
  if (!mine) throw httpError(403, 'This is not one of your classes');
  if (b.mins < -JOIN_WINDOW_BEFORE || b.mins > JOIN_WINDOW_AFTER || b.status === 'cancelled') return { recorded: false };
  const r = await pool.query(
    `INSERT INTO student_class_joins (booking_id, student_id, mins_after_start) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING RETURNING mins_after_start`, [bookingId, studentId, b.mins]);
  return { recorded: r.rows.length > 0, minsAfterStart: b.mins };
}

/** Time on learning resources. Called every minute or so by the page while it is visible. */
async function recordStudy(studentId, source, seconds) {
  const s = Math.max(0, Math.min(120, Math.round(Number(seconds) || 0)));
  const src = ['nest', 'blog', 'materials'].includes(source) ? source : 'nest';
  if (!s) return;
  await pool.query(
    `INSERT INTO study_time (student_id, day, source, seconds)
     VALUES ($1, (NOW() AT TIME ZONE 'Africa/Lagos')::date, $2, $3)
     ON CONFLICT (student_id, day, source) DO UPDATE SET seconds = LEAST(study_time.seconds + EXCLUDED.seconds, 86400)`,
    [studentId, src, s]);
}

/* ══════════════ Creating reports ══════════════ */

/**
 * Called after a class is completed and the lesson recorded for this
 * student. Creates the unit report when this was the unit's last lesson,
 * and the grade report when the grade is finished. Never throws.
 */
async function onLessonCompleted(studentId, booking, enrolment, { gradeFinished = false } = {}) {
  try {
    if (!booking || !enrolment) return;
    if (booking.pathway_lesson_id) {
      const l = (await pool.query(
        `SELECT pl.lesson_number, pl.unit_id, pu.unit_number, pg.grade_number, pg.pathway_id,
                (SELECT MAX(lesson_number) FROM pathway_lessons x WHERE x.unit_id = pl.unit_id AND x.is_active = TRUE) AS last_in_unit
         FROM pathway_lessons pl
         JOIN pathway_grades pg ON pg.id = pl.grade_id
         LEFT JOIN pathway_units pu ON pu.id = pl.unit_id
         WHERE pl.id = $1`, [booking.pathway_lesson_id])).rows[0];
      if (l && l.unit_id && Number(l.last_in_unit) === Number(l.lesson_number)) {
        await createReport({ studentId, enrolmentId: enrolment.id, pathwayId: l.pathway_id, gradeNumber: l.grade_number,
                             unitNumber: l.unit_number, kind: 'unit', tutorId: booking.tutor_id });
      }
    }
    if (gradeFinished && enrolment.pathway_id) {
      await createReport({ studentId, enrolmentId: enrolment.id, pathwayId: enrolment.pathway_id, gradeNumber: enrolment.current_grade,
                           unitNumber: 0, kind: 'grade', tutorId: booking.tutor_id });
    }
  } catch (e) {
    logger.warn(`[REPORTS] onLessonCompleted failed for ${studentId}: ${e.message}`);
  }
}

async function createReport({ studentId, enrolmentId, pathwayId, gradeNumber, unitNumber, kind, tutorId }) {
  const lessonIds = await _lessonIds(pathwayId, gradeNumber, kind === 'unit' ? unitNumber : null);
  /* Period = first to last class of these lessons (dates as stored, in WAT) */
  const span = (await pool.query(
    `SELECT MIN(b.date)::text AS a, MAX(b.date)::text AS z FROM lesson_completions lc JOIN bookings b ON b.id = lc.booking_id
     WHERE lc.student_id = $1 AND b.pathway_lesson_id = ANY($2::uuid[])`, [studentId, lessonIds])).rows[0];
  const today = (await pool.query(`SELECT (NOW() AT TIME ZONE 'Africa/Lagos')::date::text AS d`)).rows[0].d;
  const start = span.a, end = span.z || today;
  const r = await pool.query(
    `INSERT INTO student_reports (student_id, enrolment_id, pathway_id, grade_number, unit_number, kind, tutor_id,
                                  period_start, period_end, publish_due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date, NOW() + ($10 || ' days')::interval)
     ON CONFLICT (student_id, pathway_id, grade_number, kind, unit_number) DO NOTHING
     RETURNING id`,
    [studentId, enrolmentId, pathwayId, gradeNumber, unitNumber || 0, kind, tutorId, start || end, end, String(PUBLISH_AFTER_DAYS)]);
  if (!r.rows.length) return null;
  const id = r.rows[0].id;
  logger.info(`[REPORTS] ${kind} report ${id} created for ${studentId} (grade ${gradeNumber}${kind === 'unit' ? ' unit ' + unitNumber : ''})`);
  _askTutor(id).catch(e => logger.warn('[REPORTS] ask tutor: ' + e.message));
  return id;
}

/* ══════════════ Reading ══════════════ */

async function _lessonIds(pathwayId, gradeNumber, unitNumber) {
  const r = await pool.query(
    `SELECT pl.id FROM pathway_lessons pl
     JOIN pathway_grades pg ON pg.id = pl.grade_id
     LEFT JOIN pathway_units pu ON pu.id = pl.unit_id
     WHERE pg.pathway_id = $1 AND pg.grade_number = $2 AND ($3::int IS NULL OR pu.unit_number = $3)
       AND pl.is_active = TRUE`, [pathwayId, gradeNumber, unitNumber]);
  return r.rows.map(x => x.id);
}

async function _header(id) {
  return (await pool.query(
    `SELECT r.*, u.name AS student_name, u.staff_id AS student_ref, t.name AS tutor_name,
            p.name AS pathway_name, pg.name AS grade_name, pu.name AS unit_name,
            sp.parent_email, sp.parent_name, u.email AS student_email
     FROM student_reports r
     JOIN users u ON u.id = r.student_id
     LEFT JOIN users t ON t.id = r.tutor_id
     LEFT JOIN pathways p ON p.id = r.pathway_id
     LEFT JOIN pathway_grades pg ON pg.pathway_id = r.pathway_id AND pg.grade_number = r.grade_number
     LEFT JOIN pathway_units pu ON pu.grade_id = pg.id AND pu.unit_number = r.unit_number
     LEFT JOIN student_profiles sp ON sp.user_id = r.student_id
     WHERE r.id = $1`, [id])).rows[0];
}

/** Every number on the report, for one unit (or the whole grade). */
async function computeMetrics(rep) {
  const S = rep.student_id;
  const unit = rep.kind === 'unit' ? rep.unit_number : null;
  const lessonIds = await _lessonIds(rep.pathway_id, rep.grade_number, unit);

  /* Classes taken for these lessons */
  const classes = (await pool.query(
    `SELECT DISTINCT ON (b.id) b.id, b.date::text AS date, b.pathway_lesson_id, pu.unit_number,
            j.mins_after_start
     FROM lesson_completions lc
     JOIN bookings b ON b.id = lc.booking_id
     LEFT JOIN pathway_lessons pl ON pl.id = b.pathway_lesson_id
     LEFT JOIN pathway_units pu ON pu.id = pl.unit_id
     LEFT JOIN student_class_joins j ON j.booking_id = b.id AND j.student_id = $1
     WHERE lc.student_id = $1 AND b.pathway_lesson_id = ANY($2::uuid[])`, [S, lessonIds])).rows;
  const tracked = classes.filter(c => c.mins_after_start != null);
  const punctuality = {
    classes: classes.length,
    early:  tracked.filter(c => c.mins_after_start < 0).length,
    onTime: tracked.filter(c => c.mins_after_start >= 0 && c.mins_after_start <= ON_TIME_MINS).length,
    late:   tracked.filter(c => c.mins_after_start > ON_TIME_MINS).length,
    notRecorded: classes.length - tracked.length,
    trackingFrom: TRACKING_FROM,
  };

  /* Projects (lesson assignments) */
  const projects = (await pool.query(
    `SELECT p.id, p.title, p.status, p.score, p.is_late, p.submitted_at, p.due_at, pu.unit_number
     FROM projects p
     LEFT JOIN pathway_lessons pl ON pl.id = p.lesson_id
     LEFT JOIN pathway_units pu ON pu.id = pl.unit_id
     WHERE p.student_id = $1 AND p.lesson_id = ANY($2::uuid[])
     ORDER BY pl.lesson_number`, [S, lessonIds])).rows;
  const now = Date.now();
  const projState = p => p.status === 'reviewed' ? 'marked'
    : p.submitted_at ? 'awaiting_marking'
    : (p.due_at && new Date(p.due_at).getTime() < now) ? 'missing' : 'not_due';
  const scored = projects.filter(p => p.status === 'reviewed' && p.score != null);
  const handedIn = projects.filter(p => p.submitted_at);
  const proj = {
    total: projects.length,
    marked: scored.length,
    averageScore: scored.length ? Math.round(scored.reduce((a, p) => a + Number(p.score), 0) / scored.length) : null,
    onTime: handedIn.filter(p => !p.is_late).length,
    late: handedIn.filter(p => p.is_late).length,
    missing: projects.filter(p => projState(p) === 'missing').length,
    notDue: projects.filter(p => projState(p) === 'not_due').length,
    awaitingMarking: projects.filter(p => projState(p) === 'awaiting_marking').length,
    list: projects.map(p => ({ title: p.title, score: p.status === 'reviewed' ? p.score : null, state: projState(p), late: !!p.is_late, unit: p.unit_number })),
  };

  /* Unit quizzes */
  const quizzes = (await pool.query(
    `SELECT uq.unit_number, uq.unit_name, uq.pass_score, qa.best_percentage, qa.passed, qa.attempts_used,
            qa.due_at, qa.last_attempt_at, qa.id IS NOT NULL AS assigned
     FROM unit_quizzes uq
     LEFT JOIN quiz_assignments qa ON qa.quiz_id = uq.id AND qa.student_id = $1
     WHERE uq.pathway_id = $2 AND uq.grade_number = $3 AND ($4::int IS NULL OR uq.unit_number = $4)
     ORDER BY uq.unit_number`, [S, rep.pathway_id, rep.grade_number, unit])).rows;
  const quizList = quizzes.map(q => {
    const attempted = q.best_percentage != null && Number(q.attempts_used) > 0;
    const overdue = q.due_at && new Date(q.due_at).getTime() < now;
    return {
      unit: q.unit_number, name: q.unit_name, passMark: q.pass_score,
      score: attempted ? Math.round(Number(q.best_percentage)) : null,
      passed: attempted ? !!q.passed : null,
      attempts: Number(q.attempts_used) || 0,
      onTime: attempted ? !(q.due_at && q.last_attempt_at && new Date(q.last_attempt_at) > new Date(q.due_at)) : null,
      state: !q.assigned ? 'not_assigned' : attempted ? 'done' : overdue ? 'missed' : 'open',
      dueAt: q.due_at,
    };
  });
  const quizDone = quizList.filter(q => q.state === 'done');
  const quiz = {
    exists: quizList.length > 0,
    list: quizList,
    averageScore: quizDone.length ? Math.round(quizDone.reduce((a, q) => a + q.score, 0) / quizDone.length) : null,
    onTime: quizDone.filter(q => q.onTime).length,
    late: quizDone.filter(q => !q.onTime).length,
    missed: quizList.filter(q => q.state === 'missed').length,
  };

  /* Extra study time in the report period (plus a week after the last class) */
  const st = (await pool.query(
    `SELECT source, SUM(seconds)::int AS s FROM study_time
     WHERE student_id = $1 AND day BETWEEN $2::date AND ($3::date + 7)
     GROUP BY source`, [S, rep.period_start || rep.period_end, rep.period_end])).rows;
  const study = {
    minutes: Math.round(st.reduce((a, x) => a + x.s, 0) / 60),
    bySource: Object.fromEntries(st.map(x => [x.source, Math.round(x.s / 60)])),
    trackingFrom: TRACKING_FROM,
  };

  const out = { lessonsInScope: lessonIds.length, classesTaken: classes.length, punctuality, projects: proj, quiz, study };

  /* Grade report: unit-by-unit trend + the unit reports' skill ratings */
  if (rep.kind === 'grade') {
    const unitReps = (await pool.query(
      `SELECT unit_number, ratings FROM student_reports
       WHERE student_id = $1 AND pathway_id = $2 AND grade_number = $3 AND kind = 'unit' AND status = 'published'`,
      [S, rep.pathway_id, rep.grade_number])).rows;
    const units = [];
    for (let u = 1; u <= 12; u++) {
      const cls = classes.filter(c => c.unit_number === u);
      const pj = scored.filter(p => p.unit_number === u);
      const qz = quizList.find(q => q.unit === u);
      const ur = unitReps.find(x => x.unit_number === u);
      if (!cls.length && !pj.length && !qz && !ur) continue;
      const tr = cls.filter(c => c.mins_after_start != null);
      units.push({
        unit: u,
        classes: cls.length,
        projectAverage: pj.length ? Math.round(pj.reduce((a, p) => a + Number(p.score), 0) / pj.length) : null,
        quizScore: qz ? qz.score : null,
        onTimeRate: tr.length ? Math.round(100 * tr.filter(c => c.mins_after_start <= ON_TIME_MINS).length / tr.length) : null,
        ratingAverage: ur && ur.ratings ? Math.round(10 * _avg(Object.values(ur.ratings))) / 10 : null,
      });
    }
    out.units = units;
  }
  return out;
}

function _avg(a) { const n = a.map(Number).filter(x => x >= 1 && x <= 5); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : null; }

function _shape(h, metrics) {
  return {
    id: h.id,
    kind: h.kind,
    status: h.status,
    title: h.kind === 'unit' ? `Unit ${h.unit_number} Report` : `${h.grade_name || 'Grade ' + h.grade_number} Report`,
    student: { id: h.student_id, name: h.student_name, ref: h.student_ref },
    tutorName: h.tutor_name,
    pathway: h.pathway_name,
    grade: h.grade_number,
    gradeName: h.grade_name || 'Grade ' + h.grade_number,
    unit: h.kind === 'unit' ? { number: h.unit_number, name: h.unit_name } : null,
    periodStart: h.period_start, periodEnd: h.period_end,
    createdAt: h.created_at, publishDueAt: h.publish_due_at,
    publishedAt: h.published_at, publishedBy: h.published_by,
    skills: SKILLS,
    ratings: h.ratings || null,
    remarks: h.remarks || null,
    recommendation: h.recommendation || null,
    metrics,
  };
}

/** Can this user see this report? Students/parents only once published. */
async function _canView(user, h) {
  if (['admin', 'super_admin', 'postsales', 'operations'].includes(user.role)) return true;
  if (user.role === 'tutor') return h.tutor_id === user.id;
  if (h.status !== 'published') return false;
  if (user.id === h.student_id) return true;
  if (user.role === 'parent') {
    return (await pool.query(`SELECT 1 FROM parent_children WHERE parent_id = $1 AND student_id = $2`, [user.id, h.student_id])).rows.length > 0;
  }
  return false;
}

async function getReport(user, id) {
  const h = await _header(id);
  if (!h || !(await _canView(user, h))) throw httpError(404, 'Report not found');
  return _shape(h, await computeMetrics(h));
}

/** Published reports for a student (student, parent or staff). */
async function listForStudent(user, studentId) {
  const fake = { student_id: studentId, status: 'published', tutor_id: null };
  if (!(await _canView(user, fake))) throw httpError(403, 'Not allowed');
  const staff = ['admin', 'super_admin', 'postsales', 'operations'].includes(user.role);
  const r = await pool.query(
    `SELECT r.id, r.kind, r.status, r.unit_number, r.grade_number, r.published_at, r.created_at, r.publish_due_at,
            r.period_start, r.period_end, p.name AS pathway_name, pu.name AS unit_name, t.name AS tutor_name
     FROM student_reports r
     LEFT JOIN pathways p ON p.id = r.pathway_id
     LEFT JOIN pathway_grades pg ON pg.pathway_id = r.pathway_id AND pg.grade_number = r.grade_number
     LEFT JOIN pathway_units pu ON pu.grade_id = pg.id AND pu.unit_number = r.unit_number
     LEFT JOIN users t ON t.id = r.tutor_id
     WHERE r.student_id = $1 ${staff ? '' : "AND r.status = 'published'"}
     ORDER BY COALESCE(r.published_at, r.created_at) DESC`, [studentId]);
  return r.rows.map(x => ({
    id: x.id, kind: x.kind, status: x.status, pathway: x.pathway_name, grade: x.grade_number,
    unit: x.kind === 'unit' ? { number: x.unit_number, name: x.unit_name } : null,
    title: x.kind === 'unit' ? `Unit ${x.unit_number} Report` : `Grade ${x.grade_number} Report`,
    tutorName: x.tutor_name, publishedAt: x.published_at, createdAt: x.created_at, publishDueAt: x.publish_due_at,
    periodStart: x.period_start, periodEnd: x.period_end,
  }));
}

/** Reports waiting for this tutor's comments. */
async function listForTutor(tutorId) {
  const r = await pool.query(
    `SELECT r.id, r.kind, r.unit_number, r.grade_number, r.created_at, r.publish_due_at,
            u.name AS student_name, p.name AS pathway_name, pu.name AS unit_name
     FROM student_reports r
     JOIN users u ON u.id = r.student_id
     LEFT JOIN pathways p ON p.id = r.pathway_id
     LEFT JOIN pathway_grades pg ON pg.pathway_id = r.pathway_id AND pg.grade_number = r.grade_number
     LEFT JOIN pathway_units pu ON pu.grade_id = pg.id AND pu.unit_number = r.unit_number
     WHERE r.tutor_id = $1 AND r.status = 'awaiting_tutor'
     ORDER BY r.publish_due_at`, [tutorId]);
  return r.rows.map(x => ({
    id: x.id, kind: x.kind, studentName: x.student_name, pathway: x.pathway_name, grade: x.grade_number,
    unit: x.kind === 'unit' ? { number: x.unit_number, name: x.unit_name } : null,
    title: x.kind === 'unit' ? `Unit ${x.unit_number} Report` : `Grade ${x.grade_number} Report`,
    createdAt: x.created_at, publishDueAt: x.publish_due_at,
  }));
}

/* ══════════════ Tutor comments + publishing ══════════════ */

function validateComments(body) {
  const ratings = {};
  for (const s of SKILLS) {
    const v = Number(body && body.ratings && body.ratings[s.key]);
    if (!Number.isInteger(v) || v < 1 || v > 5) throw httpError(400, `Please rate "${s.label}" from 1 to 5`);
    ratings[s.key] = v;
  }
  const remarks = String((body && body.remarks) || '').trim();
  const recommendation = String((body && body.recommendation) || '').trim();
  if (remarks.length < 20) throw httpError(400, 'Please write a few sentences of remarks (at least 20 characters)');
  if (recommendation.length < 10) throw httpError(400, 'Please add a recommendation for the parent');
  return { ratings, remarks: remarks.slice(0, 3000), recommendation: recommendation.slice(0, 2000) };
}

/** Tutor adds (or later edits) ratings, remarks and recommendation. First submit publishes and emails the parent. */
async function submitByTutor(tutorId, id, body) {
  const c = validateComments(body);
  const prev = (await pool.query(`SELECT status FROM student_reports WHERE id = $1 AND tutor_id = $2`, [id, tutorId])).rows[0];
  if (!prev) throw httpError(404, 'Report not found');
  await pool.query(
    `UPDATE student_reports SET ratings = $2, remarks = $3, recommendation = $4, status = 'published',
            published_at = COALESCE(published_at, NOW()),
            published_by = CASE WHEN status = 'awaiting_tutor' THEN 'tutor' ELSE published_by END
     WHERE id = $1`,
    [id, JSON.stringify(c.ratings), c.remarks, c.recommendation]);
  await pool.query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND type = 'report_due' AND body LIKE $2`,
    [tutorId, '%' + id + '%']).catch(() => {});
  const firstPublish = prev.status === 'awaiting_tutor';
  if (firstPublish) _emailParent(id).catch(e => logger.warn('[REPORTS] parent email: ' + e.message));
  return { success: true, published: firstPublish };
}

async function _publishDue() {
  const due = (await pool.query(
    `UPDATE student_reports SET status = 'published', published_at = NOW(), published_by = 'auto'
     WHERE status = 'awaiting_tutor' AND publish_due_at <= NOW()
     RETURNING id`)).rows;
  for (const r of due) {
    logger.info(`[REPORTS] ${r.id} published automatically (no tutor comments after ${PUBLISH_AFTER_DAYS} days)`);
    await _emailParent(r.id).catch(e => logger.warn('[REPORTS] parent email: ' + e.message));
  }
  return due.length;
}

async function _remindDue() {
  const due = (await pool.query(
    `UPDATE student_reports SET reminder_sent_at = NOW()
     WHERE status = 'awaiting_tutor' AND reminder_sent_at IS NULL
       AND created_at <= NOW() - ($1 || ' days')::interval
     RETURNING id`, [String(REMIND_AFTER_DAYS)])).rows;
  for (const r of due) await _askTutor(r.id, true).catch(e => logger.warn('[REPORTS] reminder: ' + e.message));
  return due.length;
}

async function _askTutor(id, reminder = false) {
  const h = await _header(id);
  if (!h || !h.tutor_id || h.status !== 'awaiting_tutor') return;
  const t = (await pool.query(`SELECT id, name, email FROM users WHERE id = $1`, [h.tutor_id])).rows[0];
  if (!t) return;
  const what = h.kind === 'unit' ? `Unit ${h.unit_number}${h.unit_name ? ' (' + h.unit_name + ')' : ''}` : (h.grade_name || 'Grade ' + h.grade_number);
  const dueStr = new Date(h.publish_due_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' });
  const title = `${reminder ? 'Reminder: ' : ''}Write ${h.student_name}'s ${h.kind === 'unit' ? 'unit' : 'grade'} report`;
  await require('./notificationService').saveNotification(t.id, 'report_due', title,
    `${what} · ${h.pathway_name || ''}. It is sent to the parent on ${dueStr} even without your comments. [${id}]`);
  if (!t.email) return;
  await require('./emailService').sendEmail({
    to: t.email,
    subject: `📊 ${title}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;line-height:1.6;color:#1a202c;">
      <h2 style="color:#1a56db;margin-top:0;">📊 ${reminder ? 'Report reminder' : 'A report is ready for your comments'}</h2>
      <p>Hi ${esc((t.name || '').split(' ')[0] || 'there')},</p>
      <p><strong>${esc(h.student_name)}</strong> has finished <strong>${esc(what)}</strong> of ${esc(h.pathway_name || 'their pathway')}.</p>
      <p>Please add your skill ratings, remarks and a recommendation for the parent. It takes about 3 minutes.</p>
      <p style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:8px;">The report is sent to the parent on <strong>${esc(dueStr)}</strong> — without your comments if they are not added by then.</p>
      <a href="${appUrl()}/pages/tutor-dashboard.html" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 26px;border-radius:50px;font-weight:700;">Write the report</a>
    </div>`,
    template: reminder ? 'report_tutor_reminder' : 'report_tutor_request',
  });
}

async function _emailParent(id) {
  const h = await _header(id);
  if (!h || h.status !== 'published') return;
  const to = h.parent_email || h.student_email;
  if (!to || /@login\.stemnest\.invalid$/i.test(to)) return;
  const what = h.kind === 'unit' ? `Unit ${h.unit_number} report` : `${h.grade_name || 'Grade ' + h.grade_number} report`;
  const m = await computeMetrics(h);
  const bits = [];
  bits.push(`${m.classesTaken} class${m.classesTaken === 1 ? '' : 'es'} completed`);
  if (m.projects.averageScore != null) bits.push(`projects average ${m.projects.averageScore}%`);
  if (m.quiz.averageScore != null) bits.push(`quiz score ${m.quiz.averageScore}%`);
  await require('./emailService').sendEmail({
    to,
    subject: `📊 ${h.student_name}'s ${what} is ready`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;line-height:1.6;color:#1a202c;">
      <h2 style="color:#1a56db;margin-top:0;">📊 ${esc(h.student_name)}'s ${esc(what)}</h2>
      <p>Hi ${esc(h.parent_name || 'there')},</p>
      <p>${esc(h.student_name)} has finished ${h.kind === 'unit' ? `Unit ${h.unit_number}${h.unit_name ? ' — <strong>' + esc(h.unit_name) + '</strong>' : ''}` : `<strong>${esc(h.grade_name || 'Grade ' + h.grade_number)}</strong>`} of ${esc(h.pathway_name || 'their pathway')}. 🎉</p>
      <p style="background:#f0f4ff;border-left:4px solid #1a56db;padding:12px 16px;border-radius:8px;">${esc(bits.join(' · '))}</p>
      <p>The full report shows how ${esc(h.student_name.split(' ')[0])} is doing in projects, quizzes and joining classes on time${h.remarks ? ', with comments and advice from the teacher' : ''}. You can download it as a PDF.</p>
      <a href="${appUrl()}/pages/report.html?id=${h.id}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 26px;border-radius:50px;font-weight:700;">See the report</a>
      <p style="font-size:12px;color:#718096;margin-top:18px;">Log in to your StemNest account to open it. Reports are also on the dashboard under 📊 My Reports.</p>
    </div>`,
    template: 'report_parent',
  });
}

let _timer = null;
function startReportJob() {
  if (_timer) return;
  const tick = async () => {
    try { await _remindDue(); await _publishDue(); }
    catch (e) { logger.warn('[REPORTS] job: ' + e.message); }
  };
  _timer = setInterval(tick, 60 * 60 * 1000);
  setTimeout(tick, 90 * 1000);
}

module.exports = {
  SKILLS, PUBLISH_AFTER_DAYS, REMIND_AFTER_DAYS, ON_TIME_MINS,
  recordJoin, recordStudy,
  onLessonCompleted, createReport,
  computeMetrics, getReport, listForStudent, listForTutor,
  submitByTutor,
  startReportJob,
  _internals: { publishDue: _publishDue, remindDue: _remindDue, validateComments },
};
