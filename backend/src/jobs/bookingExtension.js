/**
 * StemNest Academy — Booking Extension Job
 *
 * Runs once per day (via setInterval at 24h).
 *
 * Ensures every active paid student always has at least MINIMUM_WEEKS_AHEAD
 * of scheduled sessions booked.  If any student drops below this threshold,
 * the job auto-generates new bookings by repeating their proven weekly pattern
 * (derived from their last LOOKBACK_WEEKS of bookings) until they have at least
 * TARGET_WEEKS_AHEAD of future sessions.
 *
 * This prevents calendar gaps whenever postsales staff manually schedule
 * only a fixed batch of sessions.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');

/* ── Configuration ── */
const MINIMUM_WEEKS_AHEAD = 8;   // trigger extension when remaining weeks < this
const TARGET_WEEKS_AHEAD  = 20;  // extend forward to this many weeks
const LOOKBACK_WEEKS      = 8;   // how far back to look for schedule pattern
const INTERVAL_MS         = 24 * 60 * 60 * 1000; // run daily

/**
 * Detect the weekly schedule pattern for a student from their booking history.
 * Returns an array of { weekday (0–6), time ('HH:MM') } objects.
 */
async function detectSchedule(studentId) {
  const result = await pool.query(`
    SELECT 
      EXTRACT(DOW FROM date)::int AS weekday,
      TO_CHAR(time, 'HH24:MI') AS time,
      COUNT(*) AS cnt
    FROM bookings
    WHERE student_id = $1
      AND is_demo = FALSE
      AND status IN ('scheduled', 'completed')
      AND date >= CURRENT_DATE - INTERVAL '${LOOKBACK_WEEKS} weeks'
    GROUP BY EXTRACT(DOW FROM date), TO_CHAR(time, 'HH24:MI')
    HAVING COUNT(*) >= 2
    ORDER BY EXTRACT(DOW FROM date), TO_CHAR(time, 'HH24:MI')
  `, [studentId]);

  return result.rows.map(r => ({ weekday: r.weekday, time: r.time }));
}

/**
 * Generate new session dates for a student starting after lastDate,
 * repeating the given weekday/time schedule until TARGET_WEEKS_AHEAD
 * worth of slots are created.
 */
function generateSessions(lastDate, schedule) {
  if (!schedule.length) return [];

  const sessions = [];
  // Start the day after their last booking
  const startFrom = new Date(lastDate + 'T12:00:00Z');
  startFrom.setUTCDate(startFrom.getUTCDate() + 1);

  const endDate = new Date(lastDate + 'T12:00:00Z');
  endDate.setUTCDate(endDate.getUTCDate() + TARGET_WEEKS_AHEAD * 7);

  schedule.forEach(slot => {
    const d = new Date(startFrom);
    const currentDay = d.getUTCDay();
    const dayDiff = (slot.weekday - currentDay + 7) % 7;
    d.setUTCDate(d.getUTCDate() + dayDiff);

    while (d <= endDate) {
      sessions.push({
        date: d.toISOString().split('T')[0],
        time: slot.time,
      });
      d.setUTCDate(d.getUTCDate() + 7);
    }
  });

  // Sort chronologically
  sessions.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });

  return sessions;
}

/**
 * Main extension check — runs once per day.
 */
async function runBookingExtensionCheck() {
  logger.info('[BOOKING-EXT] Starting booking extension check...');

  try {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + MINIMUM_WEEKS_AHEAD * 7);
    const thresholdStr = thresholdDate.toISOString().split('T')[0];

    // Find all students whose last scheduled paid booking is within MINIMUM_WEEKS_AHEAD
    const atRiskResult = await pool.query(`
      SELECT 
        b.student_id,
        u.name AS student_name,
        u.email AS student_email,
        MAX(b.date) AS last_date,
        COUNT(*) AS remaining_count,
        MAX(b.tutor_id) AS tutor_id,
        MAX(b.class_link) AS class_link,
        MAX(b.grade) AS grade,
        MAX(b.notes::text) AS sample_notes
      FROM bookings b
      JOIN users u ON u.id = b.student_id
      WHERE b.status = 'scheduled'
        AND b.is_demo = FALSE
        AND b.date >= CURRENT_DATE
        AND b.student_id IS NOT NULL
        /* Skip paused students — do not auto-extend schedules for students on a break */
        AND b.student_id NOT IN (
          SELECT user_id FROM student_profiles WHERE class_paused = TRUE
        )
      GROUP BY b.student_id, u.name, u.email
      HAVING MAX(b.date) < $1
    `, [thresholdStr]);

    if (!atRiskResult.rows.length) {
      logger.info('[BOOKING-EXT] All students have sufficient bookings. Nothing to extend.');
      return;
    }

    logger.info(`[BOOKING-EXT] Found ${atRiskResult.rows.length} student(s) needing extension`);

    let totalCreated = 0;

    for (const student of atRiskResult.rows) {
      try {
        const lastDateStr = student.last_date.toISOString().split('T')[0];
        logger.info(`[BOOKING-EXT] Extending ${student.student_name} (last: ${lastDateStr})`);

        // Detect weekly schedule pattern
        const schedule = await detectSchedule(student.student_id);

        if (!schedule.length) {
          logger.warn(`[BOOKING-EXT] No schedule pattern found for ${student.student_name} — skipping`);
          continue;
        }

        logger.info(`[BOOKING-EXT]   Schedule: ${schedule.map(s => `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.weekday]} ${s.time}`).join(', ')}`);

        // Generate new sessions
        const sessions = generateSessions(lastDateStr, schedule);

        if (!sessions.length) {
          logger.warn(`[BOOKING-EXT] No sessions generated for ${student.student_name}`);
          continue;
        }

        // Parse notes from sample booking to preserve metadata
        let notes = {};
        try { notes = JSON.parse(student.sample_notes || '{}'); } catch {}

        // Get last lesson number for sequence continuity
        const lastLessonResult = await pool.query(`
          SELECT lesson_number_in_grade, pathway_lesson_id
          FROM bookings
          WHERE student_id = $1 AND is_demo = FALSE
          ORDER BY date DESC, time DESC
          LIMIT 1
        `, [student.student_id]);
        const lastLesson = lastLessonResult.rows[0] || {};
        let nextLessonNum = (lastLesson.lesson_number_in_grade || 0) + 1;

        // Get tutor name
        const tutorRes = await pool.query('SELECT name FROM users WHERE id = $1', [student.tutor_id]);
        const tutorName = tutorRes.rows[0]?.name || notes.tutorName || '';

        const createdIds = [];

        for (const session of sessions) {
          const result = await pool.query(`
            INSERT INTO bookings
              (subject, grade, date, time, class_link, status, is_demo,
               tutor_id, student_id, lesson_name, notes, booked_at, scheduled_at,
               lesson_number_in_grade)
            VALUES ($1, $2, $3::date, $4::time, $5, 'scheduled', FALSE,
                    $6, $7, $8, $9, NOW(), NOW(), $10)
            RETURNING id
          `, [
            notes.subject || 'Coding',
            student.grade || 'Grade 1',
            session.date,
            session.time,
            student.class_link || '',
            student.tutor_id,
            student.student_id,
            student.student_name,
            JSON.stringify({
              studentName:    student.student_name,
              email:          student.student_email,
              course:         notes.course || '',
              tutorName:      tutorName,
              classLink:      student.class_link || '',
              isPaidClass:    true,
              autoExtended:   true,
              autoExtendedAt: new Date().toISOString(),
            }),
            nextLessonNum++,
          ]);
          createdIds.push(result.rows[0].id);
        }

        totalCreated += createdIds.length;
        logger.info(`[BOOKING-EXT] ✅ Extended ${student.student_name}: +${createdIds.length} sessions → now until ${sessions[sessions.length - 1].date}`);
      } catch (studentErr) {
        logger.error(`[BOOKING-EXT] Error extending ${student.student_name}:`, studentErr.message);
      }
    }

    logger.info(`[BOOKING-EXT] Done. Created ${totalCreated} new bookings across ${atRiskResult.rows.length} student(s).`);
  } catch (err) {
    logger.error('[BOOKING-EXT] Job error:', err.message);
  }
}

/**
 * Start the booking extension job.
 * Runs immediately on startup, then every 24 hours.
 */
function startBookingExtensionJob() {
  logger.info('[BOOKING-EXT] Job registered — runs daily');

  // Run after a 1-minute delay on startup (give server time to fully boot)
  setTimeout(() => {
    runBookingExtensionCheck();
    setInterval(runBookingExtensionCheck, INTERVAL_MS);
  }, 60 * 1000);
}

module.exports = { startBookingExtensionJob, runBookingExtensionCheck };
