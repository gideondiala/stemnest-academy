/**
 * fix-lesson-numbers.js
 * 
 * One-time script to fix lesson_number_in_grade on scheduled bookings
 * so they reflect the correct next lesson based on completed count.
 * 
 * Logic:
 *   For each student with an active enrolment:
 *   1. Count completed bookings (status = 'completed')
 *   2. Get all future scheduled bookings ordered by date ASC
 *   3. Renumber them starting from completed_count + 1
 * 
 * Run: node fix-lesson-numbers.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixLessonNumbers() {
  const client = await pool.connect();
  try {
    console.log('Starting lesson number fix...\n');

    /* Get all students who have enrolments */
    const studentsRes = await client.query(`
      SELECT DISTINCT e.student_id, u.name, e.id AS enrolment_id
      FROM enrolments e
      JOIN users u ON u.id = e.student_id
      WHERE e.status = 'active'
      ORDER BY u.name
    `);

    console.log(`Found ${studentsRes.rows.length} students with active enrolments\n`);

    let totalFixed = 0;

    for (const student of studentsRes.rows) {
      /* Count completed lessons for this student */
      const completedRes = await client.query(`
        SELECT COUNT(*) AS completed_count
        FROM bookings
        WHERE student_id = $1
          AND status = 'completed'
          AND is_demo = FALSE
      `, [student.student_id]);

      const completedCount = parseInt(completedRes.rows[0].completed_count || 0);

      /* Get all future scheduled bookings in date order */
      const futureRes = await client.query(`
        SELECT id, date, time, lesson_number_in_grade
        FROM bookings
        WHERE student_id = $1
          AND status = 'scheduled'
          AND is_demo = FALSE
        ORDER BY date ASC, time ASC
      `, [student.student_id]);

      if (!futureRes.rows.length) continue;

      /* Renumber starting from completedCount + 1 */
      let nextLessonNum = completedCount + 1;
      let fixedCount = 0;

      for (const booking of futureRes.rows) {
        if (booking.lesson_number_in_grade !== nextLessonNum) {
          await client.query(
            `UPDATE bookings SET lesson_number_in_grade = $1 WHERE id = $2`,
            [nextLessonNum, booking.id]
          );
          fixedCount++;
        }
        nextLessonNum++;
      }

      if (fixedCount > 0) {
        console.log(`${student.name}: completed=${completedCount}, fixed ${fixedCount} booking numbers (next=${completedCount+1})`);
        totalFixed += fixedCount;
      } else {
        console.log(`${student.name}: completed=${completedCount} — already correct`);
      }

      /* Also update enrolments.lessons_completed to match actual completed count */
      await client.query(
        `UPDATE enrolments SET lessons_completed = $1 WHERE id = $2`,
        [completedCount, student.enrolment_id]
      );
    }

    console.log(`\nDone. Fixed ${totalFixed} booking lesson numbers.`);

  } finally {
    client.release();
    await pool.end();
  }
}

fixLessonNumbers().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
