/**
 * Sessions / Enrolments routes
 * POST /api/sessions/enrol          — enrol student in course (presales/postsales)
 * GET  /api/sessions/enrolments     — list enrolments
 * GET  /api/sessions/availability/:tutorId — get tutor availability
 * POST /api/sessions/availability   — set availability slots (tutor)
 * GET  /api/sessions/upcoming       — get upcoming sessions for logged-in user
 */

const express = require('express');
const { z }   = require('zod');

const pool   = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/* ── GET /api/sessions/upcoming ── */
router.get('/upcoming', requireAuth, async (req, res, next) => {
  try {
    let where = "WHERE b.status = 'scheduled' AND b.date >= CURRENT_DATE";
    const params = [];

    if (req.user.role === 'tutor') {
      params.push(req.user.id);
      where += ` AND b.tutor_id = $${params.length}`;
    } else if (req.user.role === 'student') {
      params.push(req.user.id);
      where += ` AND b.student_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT b.id, b.date, b.time, b.subject, b.lesson_number, b.lesson_name,
              b.class_link, b.activity_link, b.slides_link, b.is_demo,
              b.duration_mins, b.course_id,
              u_s.name AS student_name, u_s.email AS student_email,
              u_t.name AS tutor_name,
              c.name   AS course_name,
              l.name   AS lesson_name_full, l.activity_link AS lesson_activity, l.slides_link AS lesson_slides
       FROM bookings b
       LEFT JOIN users u_s ON u_s.id = b.student_id
       LEFT JOIN users u_t ON u_t.id = b.tutor_id
       LEFT JOIN courses c ON c.id   = b.course_id
       LEFT JOIN lessons l ON l.id   = b.lesson_id
       ${where}
       ORDER BY b.date ASC, b.time ASC
       LIMIT 20`,
      params
    );

    res.json({ success: true, sessions: result.rows });
  } catch (err) { next(err); }
});

/* ── GET /api/sessions/availability/:tutorId ── */
router.get('/availability/:tutorId', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const params = [req.params.tutorId];
    let dateFilter = '';

    if (from) { params.push(from); dateFilter += ` AND date >= $${params.length}`; }
    if (to)   { params.push(to);   dateFilter += ` AND date <= $${params.length}`; }

    const result = await pool.query(
      `SELECT date, time_slot, is_booked, booking_id
       FROM tutor_availability
       WHERE tutor_id = $1 ${dateFilter}
       ORDER BY date, time_slot`,
      params
    );

    res.json({ success: true, slots: result.rows });
  } catch (err) { next(err); }
});

/* ── POST /api/sessions/availability (tutor sets own slots) ── */
router.post('/availability', requireAuth, requireRole('tutor'), async (req, res, next) => {
  try {
    const { slots } = req.body; // [{date:'2026-06-01', time:'18:00'}, ...]
    if (!Array.isArray(slots) || !slots.length) {
      return res.status(400).json({ success: false, error: 'slots array required' });
    }

    /* Upsert each slot */
    for (const slot of slots) {
      await pool.query(
        `INSERT INTO tutor_availability (tutor_id, date, time_slot)
         VALUES ($1, $2::date, $3::time)
         ON CONFLICT (tutor_id, date, time_slot) DO NOTHING`,
        [req.user.id, slot.date, slot.time]
      );
    }

    res.json({ success: true, message: `${slots.length} slots saved` });
  } catch (err) { next(err); }
});

/* ── DELETE /api/sessions/availability (tutor clears slots) ── */
router.delete('/availability', requireAuth, requireRole('tutor'), async (req, res, next) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ success: false, error: 'date required' });

    await pool.query(
      `DELETE FROM tutor_availability
       WHERE tutor_id = $1 AND date = $2::date AND is_booked = FALSE`,
      [req.user.id, date]
    );

    res.json({ success: true, message: 'Availability cleared for ' + date });
  } catch (err) { next(err); }
});

/* ── POST /api/sessions/enrol ── */
router.post('/enrol', requireAuth, requireRole('admin','super_admin','presales','postsales'), async (req, res, next) => {
  try {
    const { studentId, courseId, tutorId, schedule, startDate, classLink, salesId } = req.body;

    if (!studentId || !courseId || !tutorId || !schedule || !startDate) {
      return res.status(400).json({ success: false, error: 'studentId, courseId, tutorId, schedule, startDate required' });
    }

    /* Get course + lessons */
    const courseResult = await pool.query('SELECT * FROM courses WHERE id = $1', [courseId]);
    if (!courseResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    const course = courseResult.rows[0];

    const lessonsResult = await pool.query(
      'SELECT * FROM lessons WHERE course_id = $1 ORDER BY lesson_number',
      [courseId]
    );
    const lessons = lessonsResult.rows;
    const total   = lessons.length || course.num_classes;

    /* Create enrolment */
    const enrolResult = await pool.query(
      `INSERT INTO enrolments (student_id, course_id, tutor_id, schedule, start_date, class_link, total_lessons)
       VALUES ($1, $2, $3, $4, $5::date, $6, $7)
       RETURNING id`,
      [studentId, courseId, tutorId, JSON.stringify(schedule), startDate, classLink || '', total]
    );
    const enrolmentId = enrolResult.rows[0].id;

    /* Generate all lesson booking dates */
    const weekdays = schedule.map(s => s.weekday);
    const dates    = _generateLessonDates(new Date(startDate), weekdays, total);

    /* Insert all bookings */
    for (let idx = 0; idx < dates.length; idx++) {
      const { date, slot } = dates[idx];
      const lesson = lessons[idx] || { lesson_number: idx + 1, name: `Lesson ${idx + 1}` };

      const bResult = await pool.query(
        `INSERT INTO bookings
           (enrolment_id, student_id, tutor_id, sales_id, course_id, lesson_id,
            lesson_number, lesson_name, subject, date, time, class_link,
            activity_link, slides_link, status, is_demo, is_recurring, payment_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::time,$12,$13,$14,$15,'scheduled',FALSE,TRUE,$16)
         RETURNING id`,
        [enrolmentId, studentId, tutorId, salesId || null, courseId,
         lesson.id || null, lesson.lesson_number, lesson.name,
         course.subject, _fmtDate(date), slot.time, classLink || '',
         lesson.activity_link || null, lesson.slides_link || null,
         'scheduled', course.price]
      );

      /* Mark availability slot as booked */
      await pool.query(
        `UPDATE tutor_availability SET is_booked = TRUE, booking_id = $1
         WHERE tutor_id = $2 AND date = $3::date AND time_slot = $4::time`,
        [bResult.rows[0].id, tutorId, _fmtDate(date), slot.time]
      );
    }

    logger.info(`[ENROL] Student ${studentId} → Course ${courseId} · ${total} lessons`);
    res.status(201).json({ success: true, enrolmentId, lessonsCreated: dates.length });
  } catch (err) { next(err); }
});

/* ── GET /api/sessions/enrolments ── */
router.get('/enrolments', requireAuth, async (req, res, next) => {
  try {
    let where = 'WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      params.push(req.user.id); where += ` AND e.student_id = $${params.length}`;
    } else if (req.user.role === 'tutor') {
      params.push(req.user.id); where += ` AND e.tutor_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT e.*, u_s.name AS student_name, u_t.name AS tutor_name, c.name AS course_name,
              COUNT(b.id) FILTER (WHERE b.status = 'completed') AS lessons_done
       FROM enrolments e
       LEFT JOIN users u_s ON u_s.id = e.student_id
       LEFT JOIN users u_t ON u_t.id = e.tutor_id
       LEFT JOIN courses c ON c.id   = e.course_id
       LEFT JOIN bookings b ON b.enrolment_id = e.id
       ${where}
       GROUP BY e.id, u_s.name, u_t.name, c.name
       ORDER BY e.created_at DESC`,
      params
    );

    res.json({ success: true, enrolments: result.rows });
  } catch (err) { next(err); }
});

/* ── Helpers ── */
function _fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function _generateLessonDates(startDate, weekdays, count) {
  const sorted  = [...weekdays].sort((a, b) => a - b);
  const results = [];
  const cursor  = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  while (results.length < count) {
    const dow = cursor.getDay();
    const matchIdx = sorted.indexOf(dow);
    if (matchIdx !== -1) {
      results.push({ date: new Date(cursor), slot: { weekday: dow, time: '00:00' } });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

module.exports = router;
