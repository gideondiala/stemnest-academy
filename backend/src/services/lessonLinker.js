/**
 * Automatic lesson linking.
 *
 * Projects, unit quizzes and unit reports all come from the lesson a class
 * taught (bookings.pathway_lesson_id). Classes created without one are
 * given the next lessons of their pathway, in date order:
 *
 *  - 1-on-1 classes of a pathway enrolment: the enrolment's grade, starting
 *    after the highest lesson already linked or completed;
 *  - batch classes: the batch's pathway and grade, the same way.
 *
 * Only classes after the last linked one are filled, so lessons stay in
 * order, and it stops at the end of the grade. Classes with no pathway at
 * all (no enrolment) are left for Post-Sales to link (Reschedule tool →
 * Link lessons, or 🧭 Pathways). Safe to run any number of times.
 */
const pool   = require('../config/db');
const logger = require('../utils/logger');

async function _gradeLessons(db, pathwayId, gradeNumber) {
  return (await db.query(
    `SELECT pl.id, pl.lesson_number, pl.title
     FROM pathway_lessons pl JOIN pathway_grades pg ON pg.id = pl.grade_id
     WHERE pg.pathway_id = $1 AND pg.grade_number = $2 AND pg.is_active = TRUE AND pl.is_active = TRUE
     ORDER BY pl.lesson_number`, [pathwayId, gradeNumber])).rows;
}

/**
 * Fill one series. series = { enrolmentId } or { batchId }.
 * Returns the number of classes linked.
 */
async function fillSeries(series) {
  const key = series.enrolmentId ? 'e:' + series.enrolmentId : 'b:' + series.batchId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['lesson-link:' + key]);

    let pathwayId, grade, done = 0, where, param;
    if (series.enrolmentId) {
      const e = (await client.query(
        `SELECT pathway_id, current_grade, lessons_completed, status FROM enrolments WHERE id = $1`, [series.enrolmentId])).rows[0];
      if (!e || !e.pathway_id || !e.current_grade || e.status === 'cancelled') { await client.query('ROLLBACK'); return 0; }
      pathwayId = e.pathway_id; grade = e.current_grade; done = Number(e.lessons_completed) || 0;
      where = 'b.enrolment_id = $1 AND b.batch_id IS NULL'; param = series.enrolmentId;
    } else {
      const bt = (await client.query(`SELECT pathway_id, grade_number, status FROM batches WHERE id = $1`, [series.batchId])).rows[0];
      if (!bt || !bt.pathway_id || !bt.grade_number) { await client.query('ROLLBACK'); return 0; }
      pathwayId = bt.pathway_id; grade = bt.grade_number;
      where = 'b.batch_id = $1'; param = series.batchId;
    }

    const lessons = await _gradeLessons(client, pathwayId, grade);
    if (!lessons.length) { await client.query('ROLLBACK'); return 0; }

    /* Highest lesson of this grade already on a class, and when that class is */
    const last = (await client.query(
      `SELECT MAX(pl.lesson_number) AS n, MAX(b.date + b.time) AS at,
              COUNT(*) FILTER (WHERE b.status IN ('completed','partially_completed')) AS done_linked
       FROM bookings b JOIN pathway_lessons pl ON pl.id = b.pathway_lesson_id
       JOIN pathway_grades pg ON pg.id = pl.grade_id
       WHERE ${where} AND b.status <> 'cancelled' AND pg.pathway_id = $2 AND pg.grade_number = $3`,
      [param, pathwayId, grade])).rows[0];
    if (series.batchId && last.n == null) {
      /* A batch with nothing linked yet: count the classes it has already had */
      done = Number((await client.query(
        `SELECT COUNT(*) AS n FROM bookings b WHERE ${where} AND b.status IN ('completed','partially_completed')`, [param])).rows[0].n) || 0;
    }
    const after = Math.max(Number(last.n) || 0, done);

    const todo = (await client.query(
      `SELECT b.id FROM bookings b
       WHERE ${where} AND b.status = 'scheduled' AND b.is_demo = FALSE AND b.pathway_lesson_id IS NULL
         AND ($2::timestamp IS NULL OR (b.date + b.time) > $2::timestamp)
       ORDER BY b.date, b.time
       FOR UPDATE`, [param, last.at])).rows;
    const next = lessons.filter(l => l.lesson_number > after);
    const n = Math.min(todo.length, next.length);
    for (let i = 0; i < n; i++) {
      await client.query(
        `UPDATE bookings SET pathway_lesson_id = $1, lesson_number_in_grade = $2, lesson_name = $3 WHERE id = $4`,
        [next[i].id, next[i].lesson_number, next[i].title, todo[i].id]);
    }
    await client.query('COMMIT');
    if (n) logger.info(`[LESSON LINK] ${key}: linked ${n} class(es) to Grade ${grade} lessons ${next[0].lesson_number}–${next[n - 1].lesson_number}` +
      (todo.length > n ? ` (${todo.length - n} left: end of grade)` : ''));
    return n;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    logger.warn(`[LESSON LINK] ${key} failed: ${e.message}`);
    return 0;
  } finally {
    client.release();
  }
}

/** Link the series a class belongs to (used when a class is ended). Never throws. */
async function fillForBooking(booking) {
  if (!booking || booking.pathway_lesson_id) return 0;
  if (booking.batch_id) return fillSeries({ batchId: booking.batch_id });
  if (booking.enrolment_id) return fillSeries({ enrolmentId: booking.enrolment_id });
  return 0;
}

/** Every series with unlinked classes. */
async function fillAll() {
  let total = 0;
  try {
    const r = await pool.query(
      `SELECT DISTINCT enrolment_id AS e, NULL::uuid AS b FROM bookings
       WHERE status = 'scheduled' AND is_demo = FALSE AND pathway_lesson_id IS NULL AND enrolment_id IS NOT NULL AND batch_id IS NULL
       UNION
       SELECT DISTINCT NULL::uuid, b.batch_id FROM bookings b JOIN batches bt ON bt.id = b.batch_id
       WHERE b.status = 'scheduled' AND b.is_demo = FALSE AND b.pathway_lesson_id IS NULL
         AND bt.pathway_id IS NOT NULL AND bt.grade_number IS NOT NULL`);
    for (const s of r.rows) total += await fillSeries(s.e ? { enrolmentId: s.e } : { batchId: s.b });
    if (total) logger.info(`[LESSON LINK] linked ${total} class(es) in total`);
  } catch (e) {
    logger.warn('[LESSON LINK] fillAll: ' + e.message);
  }
  return total;
}

let _timer = null;
function startLessonLinkJob() {
  if (_timer) return;
  setTimeout(fillAll, 2 * 60 * 1000);
  _timer = setInterval(fillAll, 6 * 60 * 60 * 1000);
}

module.exports = { fillSeries, fillForBooking, fillAll, startLessonLinkJob };
