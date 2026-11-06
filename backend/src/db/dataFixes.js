/**
 * One-off data repairs, applied on server start after ensureSchema and
 * before the background jobs. Each fix runs once, in its own transaction,
 * and is recorded in data_fixes with what it did; a fix that fails is rolled
 * back and tried again on the next start. A fix checks the data is still in
 * the state it was written for, and records "skipped" when it is not.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');

const FIXES = [
  {
    /* BATCH-007 was created on 2 Oct 2026, when its grade had only 9 lessons
       loaded, so only 9 classes were booked and the last was 1 Nov. The
       teacher took lesson 18 on Tue 3 Nov at 22:30 WAT outside the calendar
       and continues from lesson 19 on Sundays 07:00 and Tuesdays 22:00 WAT. */
    id: '2026-11-06-batch-007-continue-from-lesson-19',
    async run(client) {
      const batches = require('../routes/batches');
      const b = (await client.query(`SELECT id FROM batches WHERE batch_ref = 'BATCH-007'`)).rows[0];
      if (!b) return { skipped: 'BATCH-007 not found' };
      const batch = await batches.loadBatch(client, b.id, { lock: true });
      if (batch.status !== 'active') return { skipped: `batch is ${batch.status}` };
      const upcoming = (await client.query(
        `SELECT COUNT(*)::int AS n FROM bookings WHERE batch_id = $1 AND status = 'scheduled' AND date >= CURRENT_DATE`, [batch.id])).rows[0].n;
      if (upcoming) return { skipped: `batch already has ${upcoming} upcoming classes` };
      if (await batches.lastLessonNumber(client, batch.id) >= 18) return { skipped: 'lesson 18 or later is already recorded' };

      const schedule = [{ weekday: 0, time: '07:00' }, { weekday: 2, time: '22:00' }];
      await client.query(`UPDATE batches SET schedule = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(schedule), batch.id]);

      let recorded = null;
      try {
        recorded = await batches.recordClass(client, batch.id, { date: '2026-11-03', time: '22:30', lessonNumber: 18 });
      } catch (e) {
        recorded = { notRecorded: e.message };
      }
      const today = new Date(Date.now() + 60 * 60000).toISOString().slice(0, 10);
      const made = await batches.bookNextLessons(client, { ...batch, schedule }, {
        fromLesson: 19, startDate: today, schedule, tutorId: batch.tutor_id, tutorName: batch.tutor_name,
        classLink: batch.class_link || '', strict: false,
      });
      return { recordedClass: recorded, created: made.created, skipped: made.skipped,
               lessons: `${made.fromLesson}-${made.lastLesson}`, firstClass: made.firstClass };
    },
  },
];

async function runDataFixes() {
  const done = new Set((await pool.query('SELECT id FROM data_fixes')).rows.map(r => r.id));
  for (const fix of FIXES) {
    if (done.has(fix.id)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('data_fixes'))`);
      const again = await client.query('SELECT 1 FROM data_fixes WHERE id = $1', [fix.id]);
      if (again.rows.length) { await client.query('ROLLBACK'); continue; }
      const result = await fix.run(client);
      await client.query('INSERT INTO data_fixes (id, result) VALUES ($1, $2)', [fix.id, JSON.stringify(result || {})]);
      await client.query('COMMIT');
      logger.info(`[DATA-FIX] ${fix.id}: ${JSON.stringify(result || {})}`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      logger.warn(`[DATA-FIX] ${fix.id} failed, will retry on next start: ${e.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { runDataFixes, FIXES };
