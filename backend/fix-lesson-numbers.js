/**
 * fix-lesson-numbers.js — works directly from bookings, no enrolments required
 * For each student: count completed paid bookings, renumber scheduled paid bookings from completed+1
 * Run: node fix-lesson-numbers.js
 */
require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fixLessonNumbers() {
  const client = await pool.connect();
  try {
    console.log("Starting lesson number fix (booking-based)...\n");

    // Get all students who have paid scheduled bookings
    const studentsRes = await client.query(`
      SELECT DISTINCT b.student_id, u.name
      FROM bookings b
      JOIN users u ON u.id = b.student_id
      WHERE b.is_demo = FALSE
        AND b.student_id IS NOT NULL
        AND b.status IN ($1, $2)
      ORDER BY u.name
    `, ["scheduled", "completed"]);

    console.log("Students with paid bookings: " + studentsRes.rows.length + "\n");

    let totalFixed = 0;

    for (const student of studentsRes.rows) {
      // Count completed paid lessons for this student
      const doneRes = await client.query(
        "SELECT COUNT(*) AS cnt FROM bookings WHERE student_id=$1 AND is_demo=FALSE AND status=$2",
        [student.student_id, "completed"]
      );
      const completedCount = parseInt(doneRes.rows[0].cnt || 0);

      // Get all future scheduled bookings ordered by date
      const futureRes = await client.query(
        "SELECT id, lesson_number_in_grade FROM bookings WHERE student_id=$1 AND is_demo=FALSE AND status=$2 ORDER BY date ASC, time ASC",
        [student.student_id, "scheduled"]
      );

      if (!futureRes.rows.length) {
        console.log(student.name + ": completed=" + completedCount + " | no scheduled bookings");
        continue;
      }

      // Renumber starting from completedCount + 1
      let nextNum = completedCount + 1;
      let fixedCount = 0;

      for (const b of futureRes.rows) {
        if (b.lesson_number_in_grade !== nextNum) {
          await client.query(
            "UPDATE bookings SET lesson_number_in_grade=$1 WHERE id=$2",
            [nextNum, b.id]
          );
          fixedCount++;
        }
        nextNum++;
      }

      totalFixed += fixedCount;
      const tag = fixedCount > 0 ? "[FIXED]" : "[OK]   ";
      console.log(tag + " " + student.name + " | completed=" + completedCount + " | scheduled=" + futureRes.rows.length + " | fixed=" + fixedCount + " | next_lesson=" + (completedCount + 1));
    }

    console.log("\n=== DONE. Total bookings renumbered: " + totalFixed + " ===");
  } finally {
    client.release();
    await pool.end();
  }
}

fixLessonNumbers().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});