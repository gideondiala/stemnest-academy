/**
 * Bookings routes
 * GET    /api/bookings              â€” list (filtered by role)
 * POST   /api/bookings              â€” create demo booking (public)
 * GET    /api/bookings/:id          â€” get single booking
 * PUT    /api/bookings/:id/assign   â€” assign tutor + sales (admin/presales)
 * PUT    /api/bookings/:id/status   â€” update status (tutor/admin)
 * POST   /api/bookings/:id/report   â€” submit end-of-class report (tutor)
 * POST   /api/bookings/:id/reschedule â€” reschedule lesson (presales/tutor)
 */

const express = require('express');
const { z }   = require('zod');

const pool     = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const notify   = require('../services/notificationService');
const logger   = require('../utils/logger');

const router = express.Router();

/* â”€â”€ Validation â”€â”€ */
const bookingSchema = z.object({
  studentName:  z.string().min(2),
  age:          z.string(),
  grade:        z.string(),
  gender:       z.string().optional().or(z.literal('')),
  email:        z.string().email().optional().or(z.literal('')),
  whatsapp:     z.string().optional().or(z.literal('')),
  parentName:   z.string().optional(),
  country:      z.string().optional().or(z.literal('')),
  subject:      z.enum(['Coding','Maths','Sciences']),
  device:       z.string(),
  timezone:     z.string(),
  date:         z.string(),
  time:         z.string(),
}).refine(data => data.email || data.whatsapp, {
  message: 'Either email or WhatsApp number is required',
});

const assignSchema = z.object({
  tutorId:    z.string().uuid(),
  salesId:    z.string().optional(),   // UUID or staff_id â€” resolved server-side
  classLink:  z.string().url(),
  date:       z.string().optional(),   // allow updating date
  time:       z.string().optional(),   // allow updating time
  notes:      z.string().optional(),
});

const reportSchema = z.object({
  outcome:          z.enum(['completed','incomplete','partially_completed']),
  classQuality:     z.string().optional(),
  studentInterest:  z.string().optional(),
  purchasingPower:  z.string().optional(),
  incompleteReason: z.string().optional(),
  notes:            z.string().optional(),
  recordingLink:    z.string().url().optional().or(z.literal('')),
});

const cancelSchema = z.object({
  reason: z.string().min(1)
});

const rescheduleSchema = z.object({
  date: z.string(),
  time: z.string(),
  reason: z.string().optional()
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   POST /api/bookings/partial  (public â€” Step 1 quick save)
   Saves minimal booking data immediately when parent clicks Next
   Creates a pending_partial booking visible in presales
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.post('/partial', async (req, res, next) => {
  try {
    const { studentName, grade, whatsapp, countryCode, country, countryName, timezone } = req.body;

    if (!studentName || studentName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Student name is required' });
    }
    if (!whatsapp) {
      return res.status(400).json({ success: false, error: 'WhatsApp number is required' });
    }

    const fullPhone = whatsapp.startsWith(countryCode || '') ? whatsapp : `${countryCode || ''} ${whatsapp}`.trim();
    const bookingId_result = await pool.query(
      `INSERT INTO bookings
         (subject, grade, date, time, class_link, status, is_demo, notes, booked_at)
       VALUES ($1, $2, $3::date, $4::time, '', 'pending', TRUE, $5, NOW())
       RETURNING id`,
      [
        'Coding',
        grade || '',
        new Date().toISOString().split('T')[0], // placeholder date
        '09:00',                                 // placeholder time
        JSON.stringify({
          studentName:  studentName.trim(),
          grade:        grade || '',
          whatsapp:     fullPhone,
          country:      countryName || '',
          countryCode:  countryCode || '',
          timezone:     timezone || '',
          partial:      true,   // flag â€” Step 2 not yet completed
        })
      ]
    );

    const bookingId = bookingId_result.rows[0].id;

    /* Set lesson_name for presales display */
    await pool.query(
      'UPDATE bookings SET lesson_name = $1 WHERE id = $2',
      [studentName.trim(), bookingId]
    ).catch(() => {});

    logger.info(`[PARTIAL BOOKING] ${studentName} Â· ${fullPhone} Â· ${bookingId}`);
    res.status(201).json({ success: true, bookingId });
  } catch (err) {
    next(err);
  }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PUT /api/bookings/:id/complete  (public â€” Step 2 completion)
   Appends email, date, time, device, parentName to existing partial booking
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.put('/:id/complete', async (req, res, next) => {
  try {
    const { email, date, time, device, parentName, age } = req.body;

    if (!email || !date || !time || !device) {
      return res.status(400).json({ success: false, error: 'Email, date, time and device are required' });
    }

    /* Fetch existing booking */
    const bResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!bResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bResult.rows[0];

    /* Merge notes */
    let notes = {};
    try { notes = typeof booking.notes === 'string' ? JSON.parse(booking.notes || '{}') : (booking.notes || {}); } catch {}
    notes.email      = email.toLowerCase().trim();
    notes.parentName = parentName || 'â€”';
    notes.device     = device;
    notes.partial    = false; // Step 2 complete
    if (age) notes.age = age;

    /* Run WAT conversion using verified noon-reference method */
    let watTime = time;
    let tzAbbr  = '';
    try {
      if (notes.timezone && date && time) {
        /* Normalise time format */
        let normalizedTime = time;
        const ampmMatch = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (ampmMatch) {
          let nh = parseInt(ampmMatch[1]);
          const nm = parseInt(ampmMatch[2]);
          if (ampmMatch[3].toUpperCase() === 'PM' && nh !== 12) nh += 12;
          if (ampmMatch[3].toUpperCase() === 'AM' && nh === 12) nh = 0;
          normalizedTime = `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
        }
        const [h, m] = normalizedTime.split(':').map(Number);
        const noonUTC = new Date(`${date}T12:00:00Z`);
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: notes.timezone,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        });
        const parts = {};
        fmt.formatToParts(noonUTC).forEach(p => { parts[p.type] = p.value; });
        const tzHourAtNoonUTC = parseInt(parts.hour === '24' ? '0' : parts.hour);
        const tzMinAtNoonUTC  = parseInt(parts.minute);
        const offsetMins = (tzHourAtNoonUTC * 60 + tzMinAtNoonUTC) - (12 * 60);
        const studentMins = h * 60 + (m || 0);
        const utcMins     = studentMins - offsetMins;
        const watMins     = ((utcMins + 60) % 1440 + 1440) % 1440;
        const watH        = Math.floor(watMins / 60);
        const watM        = watMins % 60;
        const watPeriod   = watH >= 12 ? 'PM' : 'AM';
        const watH12      = watH % 12 === 0 ? 12 : watH % 12;
        watTime = `${watH12}:${String(watM).padStart(2,'0')} ${watPeriod} WAT`;
        try {
          const abbrPart = new Intl.DateTimeFormat('en-US', { timeZone: notes.timezone, timeZoneName: 'short' })
            .formatToParts(noonUTC).find(p => p.type === 'timeZoneName');
          tzAbbr = abbrPart ? abbrPart.value : '';
        } catch {}
        notes.timeLocal = normalizedTime;
        notes.timeWAT   = watTime;
        notes.tzAbbr    = tzAbbr;
      }
    } catch(e) {
      logger.warn('[COMPLETE] WAT conversion failed:', e.message);
    }

    /* Update booking with full details */
    await pool.query(
      `UPDATE bookings
       SET date = $1::date, time = $2::time, notes = $3, status = 'pending'
       WHERE id = $4`,
      [date, time.substring(0, 5), JSON.stringify(notes), req.params.id]
    );

    /* Notify operations team */
    try {
      const emailService = require('../services/emailService');
      await emailService.sendEmail({
        to:      'operations@stemnestacademy.co.uk',
        subject: `ðŸŽ“ Demo Booking Completed â€” ${notes.studentName} (Coding)`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;">
            <h2 style="color:#1a56db;">New Demo Class Booking âœ…</h2>
            <p><strong>Student:</strong> ${notes.studentName}</p>
            <p><strong>Grade:</strong> ${notes.grade || 'â€”'}</p>
            <p><strong>WhatsApp:</strong> ${notes.whatsapp}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time} (${notes.timezone || 'â€”'})</p>
            <p><strong>WAT:</strong> ${watTime}</p>
            <p><strong>Device:</strong> ${device}</p>
            <p><strong>Country:</strong> ${notes.country || 'â€”'}</p>
            <a href="https://stemnestacademy.co.uk/pages/presales-dashboard.html"
               style="display:inline-block;margin-top:12px;background:#1a56db;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
              Open Pre-Sales Dashboard â†’
            </a>
          </div>`,
        template: 'booking_completed',
      }).catch(e => logger.warn('[COMPLETE] Ops email failed:', e.message));
    } catch {}

    /* Notify parent */
    try {
      const notify = require('../services/notificationService');
      await notify.notifyDemoConfirmed({
        userId:      null,
        parentEmail: email,
        parentPhone: notes.whatsapp,
        parentName:  parentName || '',
        studentName: notes.studentName,
        subject:     'Coding',
        date,
        time,
        bookingId:   req.params.id,
      });
    } catch {}

    logger.info(`[BOOKING COMPLETED] ${notes.studentName} Â· Coding Â· ${date}`);
    res.json({ success: true, bookingId: req.params.id });
  } catch (err) { next(err); }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PUT /api/bookings/:id/edit-fields  (presales â€” edit any field)
   Allows presales to manually update any booking field
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.put('/:id/edit-fields', requireAuth, requireRole('admin','super_admin','presales'), async (req, res, next) => {
  try {
    const bResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!bResult.rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
    const booking = bResult.rows[0];

    let notes = {};
    try { notes = typeof booking.notes === 'string' ? JSON.parse(booking.notes || '{}') : (booking.notes || {}); } catch {}

    /* Merge any provided fields into notes */
    const allowed = ['email','parentName','whatsapp','age','grade','device','country','timezone','studentName'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined && req.body[field] !== '') {
        notes[field] = req.body[field];
      }
    });

    /* If date/time provided, update booking columns too */
    const updateFields = ['notes = $1'];
    const updateParams = [JSON.stringify(notes)];

    if (req.body.date) {
      updateFields.push(`date = $${updateParams.length + 1}::date`);
      updateParams.push(req.body.date);
    }
    if (req.body.time) {
      updateFields.push(`time = $${updateParams.length + 1}::time`);
      updateParams.push(req.body.time.substring(0,5));
    }
    if (notes.studentName) {
      updateFields.push(`lesson_name = $${updateParams.length + 1}`);
      updateParams.push(notes.studentName);
    }

    updateParams.push(req.params.id);
    await pool.query(
      `UPDATE bookings SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
      updateParams
    );

    logger.info(`[EDIT-FIELDS] Booking ${req.params.id} updated by ${req.user.email}`);
    res.json({ success: true, message: 'Booking updated' });
  } catch (err) { next(err); }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GET /api/bookings/lookup  (public â€” by email or whatsapp)
   Used by the join-class page so students can find their booking
   without needing to log in.
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.get('/lookup', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Query too short' });
    }

    const search = q.trim().toLowerCase();
    /* Normalise phone: strip spaces, dashes, brackets, leading + */
    const phoneNorm = search.replace(/[\s\-\(\)\+]/g, '');

    /* Search inside the notes JSON column for email or whatsapp */
    const result = await pool.query(
      `SELECT b.id, b.subject, b.grade, b.date, b.time, b.status,
              b.class_link, b.notes, b.booked_at, b.lesson_name,
              u_t.name AS tutor_name
       FROM bookings b
       LEFT JOIN users u_t ON u_t.id = b.tutor_id
       WHERE b.is_demo = TRUE
         AND (
           LOWER(b.notes::text) LIKE $1
           OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b.notes::text,' ',''),'-',''),'(',''),')',''),'+','') LIKE $2
         )
       ORDER BY b.booked_at DESC
       LIMIT 20`,
      ['%' + search + '%', '%' + phoneNorm + '%']
    );

    res.json({ success: true, bookings: result.rows });
  } catch (err) { next(err); }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GET /api/bookings  (authenticated)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, subject, limit = 100, offset = 0, from, to } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    /* Role-based filtering */
    if (req.user.role === 'tutor') {
      params.push(req.user.id);
      where += ` AND b.tutor_id = $${params.length}`;
      /* Tutors always get future bookings ordered ASC — this prevents the 500-row limit
         from cutting off near-future classes when total bookings exceed the limit.
         Without this, ORDER BY date DESC means the furthest-future bookings are returned
         first and the current week's classes are dropped off the bottom. */
      /* Default: 90 days back so past completed classes show on calendar history,
         but still orders ASC so near-future classes are always within the 500 limit */
      const _90daysAgo = new Date(); _90daysAgo.setDate(_90daysAgo.getDate() - 90);
      const fromDate = from || _90daysAgo.toISOString().split('T')[0];
      params.push(fromDate);
      where += ` AND b.date >= $${params.length}::date`;
    } else if (req.user.role === 'student') {
      params.push(req.user.id);
      where += ` AND b.student_id = $${params.length}`;
    } else if (req.user.role === 'sales') {
      params.push(req.user.id);
      where += ` AND b.sales_id = $${params.length}`;
    }
    if (status) { params.push(status); where += ` AND b.status = $${params.length}`; }
    if (subject) { params.push(subject); where += ` AND b.subject = $${params.length}`; }
    if (from && req.user.role !== 'tutor') { params.push(from); where += ` AND b.date >= $${params.length}::date`; }
    if (to) { params.push(to); where += ` AND b.date <= $${params.length}::date`; }
    params.push(parseInt(limit), parseInt(offset));
    const result = await pool.query(
      `SELECT b.*,
              u_s.name  AS student_name,  u_s.email AS student_email,
              u_t.name  AS tutor_name,    u_t.staff_id AS tutor_staff_id,
              u_sp.name AS sales_name,    u_sp.staff_id AS sales_staff_id,
              c.name    AS course_name,
              l.name    AS lesson_name_full, l.activity_link, l.slides_link,
              pl.title  AS lesson_title_full,
              pl.lesson_number AS lesson_number,
              pl.id     AS pathway_lesson_id_joined,
              sp.credits            AS student_credits,
              sp.credits_suspended  AS student_credits_suspended
       FROM bookings b
       LEFT JOIN users u_s  ON u_s.id  = b.student_id
       LEFT JOIN users u_t  ON u_t.id  = b.tutor_id
       LEFT JOIN users u_sp ON u_sp.id = b.sales_id
       LEFT JOIN courses c  ON c.id    = b.course_id
       LEFT JOIN lessons l  ON l.id    = b.lesson_id
       LEFT JOIN pathway_lessons pl ON pl.id = b.pathway_lesson_id
       LEFT JOIN student_profiles sp ON sp.user_id = b.student_id
       ${where}
       ORDER BY b.date ASC, b.time ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, bookings: result.rows });
  } catch (err) { next(err); }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   POST /api/bookings/bulk-schedule  (postsales/admin)
   Creates multiple paid sessions for a student without
   sending demo emails. Sends ONE summary email only.
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.post('/bulk-schedule', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const {
      studentId,      // DB UUID of the student
      studentName,
      studentEmail,
      tutorId,        // DB UUID of the tutor
      tutorName,
      course,         // pathway or course name
      classLink,
      sessions,       // [{ date: 'YYYY-MM-DD', time: 'HH:MM' }, ...]
      pathwayId,      // UUID of the pathway (optional â€” enables lesson linking)
      gradeNumber,    // integer grade number e.g. 4 (optional)
      startingLesson, // which lesson number to start from (default: 1)
    } = req.body;

    if (!studentName)              return res.status(400).json({ success: false, error: 'studentName required' });
    if (!tutorId)                  return res.status(400).json({ success: false, error: 'tutorId required' });
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ success: false, error: 'sessions array required' });
    }

    const createdIds = [];

    /* If studentId is not provided, look it up by email */
    let resolvedStudentId = studentId || null;
    if (!resolvedStudentId && studentEmail) {
      try {
        const stuResult = await pool.query(
          `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role = 'student' LIMIT 1`,
          [studentEmail]
        );
        if (stuResult.rows.length) {
          resolvedStudentId = stuResult.rows[0].id;
          logger.info(`[BULK-SCHEDULE] Resolved student_id from email: ${studentEmail} â†’ ${resolvedStudentId}`);
        } else {
          logger.warn(`[BULK-SCHEDULE] No student found for email: ${studentEmail}`);
        }
      } catch (e) {
        logger.warn(`[BULK-SCHEDULE] Student lookup failed: ${e.message}`);
      }
    }

    /* â”€â”€ Look up ordered pathway lessons if pathwayId + gradeNumber provided â”€â”€ */
    let orderedLessons   = [];   // [{id, lesson_number, title}, ...]
    let totalLessons     = 0;
    let resolvedGradeNum = parseInt(gradeNumber) || 1;

    if (pathwayId && gradeNumber) {
      try {
        /* Find the grade record */
        const gradeResult = await pool.query(
          `SELECT id, grade_number FROM pathway_grades
           WHERE pathway_id = $1 AND grade_number = $2 AND is_active = TRUE
           LIMIT 1`,
          [pathwayId, parseInt(gradeNumber)]
        );

        if (gradeResult.rows.length) {
          const gradeId = gradeResult.rows[0].id;

          /* Fetch all active lessons for this grade, ordered by lesson_number */
          const lessonsResult = await pool.query(
            `SELECT id, lesson_number, title, unit_id
             FROM pathway_lessons
             WHERE grade_id = $1 AND is_active = TRUE
             ORDER BY lesson_number ASC`,
            [gradeId]
          );

          orderedLessons = lessonsResult.rows;
          totalLessons   = orderedLessons.length;
          logger.info(`[BULK-SCHEDULE] Loaded ${totalLessons} lessons for pathway=${pathwayId} grade=${gradeNumber}`);
        } else {
          logger.warn(`[BULK-SCHEDULE] No grade found for pathway=${pathwayId} grade=${gradeNumber}`);
        }
      } catch (e) {
        logger.warn(`[BULK-SCHEDULE] Lesson lookup failed: ${e.message}`);
        /* Non-fatal â€” bookings still created without lesson links */
      }
    }

    /* â”€â”€ If student has prior completed lessons, check enrolments â”€â”€ */
    let lessonOffset = (parseInt(startingLesson) || 1) - 1; // 0-based index into orderedLessons

    if (resolvedStudentId && orderedLessons.length > 0 && !startingLesson) {
      try {
        const enrolResult = await pool.query(
          `SELECT lessons_completed FROM enrolments
           WHERE student_id = $1 AND pathway_id = $2
           ORDER BY created_at DESC LIMIT 1`,
          [resolvedStudentId, pathwayId]
        );
        if (enrolResult.rows.length) {
          lessonOffset = parseInt(enrolResult.rows[0].lessons_completed) || 0;
          logger.info(`[BULK-SCHEDULE] Student has ${lessonOffset} lessons completed â€” starting from lesson ${lessonOffset + 1}`);
        }
      } catch (e) {
        logger.warn(`[BULK-SCHEDULE] Enrolment lookup failed: ${e.message}`);
      }
    }

    const gradeDisplay = `Grade ${resolvedGradeNum}`;

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      if (!session.date || !session.time) continue;

      /* Find the lesson for this session slot */
      const lessonIdx  = lessonOffset + i;
      const lesson     = orderedLessons[lessonIdx] || null;
      const lessonNum  = lesson ? lesson.lesson_number : null;
      const lessonName = lesson ? lesson.title : (course || '');

      /* Insert paid booking â€” is_demo = FALSE, status = scheduled, tutor linked */
      const result = await pool.query(
        `INSERT INTO bookings
           (subject, grade, date, time, class_link, status, is_demo,
            tutor_id, student_id, lesson_name, notes, booked_at, scheduled_at,
            pathway_lesson_id, lesson_number_in_grade)
         VALUES ($1, $2, $3::date, $4::time, $5, 'scheduled', FALSE,
                 $6, $7, $8, $9, NOW(), NOW(), $10, $11)
         RETURNING id`,
        [
          'Coding',
          gradeDisplay,
          session.date,
          session.time.substring(0, 5),
          classLink || '',
          tutorId,
          resolvedStudentId,
          lessonName || studentName,
          JSON.stringify({
            studentName,
            email:       studentEmail || '',
            course:      course || '',
            tutorName:   tutorName || '',
            classLink:   classLink || '',
            isPaidClass: true,
            lessonTitle: lessonName || '',
            lessonNumber: lessonNum,
            totalLessons,
            pathwayId:   pathwayId || null,
            gradeNumber: resolvedGradeNum,
          }),
          lesson ? lesson.id : null,
          lessonNum,
        ]
      );
      createdIds.push(result.rows[0].id);
    }

    /* Send ONE summary email to parent/student */
    if (studentEmail && createdIds.length > 0) {
      try {
        const emailSvc = require('../services/emailService');
        const appUrl   = process.env.APP_URL || 'https://stemnestacademy.co.uk';
        const firstSession = sessions[0];
        const firstDate    = firstSession
          ? new Date(firstSession.date).toLocaleDateString('en-GB', {
              weekday:'long', day:'numeric', month:'long', year:'numeric'
            })
          : 'â€”';

        await emailSvc.sendEmail({
          to:      studentEmail,
          subject: `ðŸŽ‰ Your classes are scheduled â€” ${course || 'STEMNest Programme'}`,
          html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f6fb;margin:0;padding:0;}
.container{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);}
.header{background:linear-gradient(135deg,#1a56db,#0e9f6e);padding:36px 40px;text-align:center;}
.header h1{color:#fff;font-size:24px;margin:0;font-weight:900;}
.body{padding:36px 40px;color:#1a202c;font-size:15px;line-height:1.7;}
.info-box{background:#f0fdf4;border-radius:12px;padding:20px 24px;margin:20px 0;border-left:4px solid #0e9f6e;}
.btn{display:inline-block;background:#1a56db;color:#fff!important;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:700;font-size:15px;margin-top:16px;}
.footer{background:#f4f6fb;padding:20px 40px;text-align:center;font-size:12px;color:#718096;}
</style></head>
<body><div class="container">
  <div class="header"><h1>ðŸŽ‰ Your Classes Are Scheduled!</h1></div>
  <div class="body">
    <p>Hi <strong>${studentName}</strong>,</p>
    <p>Excellent news! Your classes have been scheduled and are ready to begin.</p>
    <div class="info-box">
      <strong>Programme:</strong> ${course || 'STEMNest Programme'}<br>
      <strong>Teacher:</strong> ${tutorName || 'Your STEMNest Tutor'}<br>
      <strong>First Class:</strong> ${firstDate}<br>
      <strong>Total Sessions:</strong> ${createdIds.length} class${createdIds.length !== 1 ? 'es' : ''}<br>
      ${classLink ? `<strong>Class Link:</strong> <a href="${classLink}" style="color:#1a56db;">${classLink}</a>` : ''}
    </div>
    <p>Log in to your student dashboard to see your full schedule, join upcoming classes and track your progress.</p>
    <a href="${appUrl}/pages/student-dashboard.html" class="btn">Go to My Dashboard â†’</a>
    <p style="font-size:13px;color:#718096;margin-top:20px;">If you have any questions, contact us at <a href="mailto:support@stemnestacademy.co.uk" style="color:#1a56db;">support@stemnestacademy.co.uk</a></p>
  </div>
  <div class="footer">Â© ${new Date().getFullYear()} StemNest Academy Ltd Â· <a href="${appUrl}" style="color:#1a56db;">stemnestacademy.co.uk</a></div>
</div></body></html>`,
          template: 'paid_classes_scheduled',
        }).catch(e => logger.warn('[BULK-SCHEDULE] Student email failed:', e.message));

        /* ONE email to tutor */
        const tutorResult = await pool.query('SELECT email, name FROM users WHERE id = $1', [tutorId]);
        const tutor = tutorResult.rows[0];
        if (tutor && tutor.email) {
          await emailSvc.sendEmail({
            to:      tutor.email,
            subject: `ðŸ“… New student assigned â€” ${studentName}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;">
              <h2 style="color:#1a56db;">New Student Assigned ðŸ“…</h2>
              <p>Hi ${tutor.name},</p>
              <p>A student has been assigned to you for ongoing classes.</p>
              <div style="background:#f0f4ff;border-radius:10px;padding:16px;margin:16px 0;">
                <p><strong>Student:</strong> ${studentName}</p>
                <p><strong>Programme:</strong> ${course || 'â€”'}</p>
                <p><strong>First Class:</strong> ${firstDate}</p>
                <p><strong>Total Sessions:</strong> ${createdIds.length}</p>
                ${classLink ? `<p><strong>Class Link:</strong> <a href="${classLink}">${classLink}</a></p>` : ''}
              </div>
              <a href="${appUrl}/pages/tutor-dashboard.html"
                 style="display:inline-block;margin-top:12px;background:#1a56db;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">
                View Dashboard â†’
              </a>
            </div>`,
            template: 'tutor_assignment',
          }).catch(e => logger.warn('[BULK-SCHEDULE] Tutor email failed:', e.message));
        }
      } catch (emailErr) {
        logger.warn('[BULK-SCHEDULE] Email notifications failed:', emailErr.message);
      }
    }

    logger.info(`[BULK-SCHEDULE] ${createdIds.length} sessions created for ${studentName} with tutor ${tutorId}`);
    res.json({ success: true, count: createdIds.length, bookingIds: createdIds });
  } catch (err) { next(err); }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   POST /api/bookings  (public â€” demo booking)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.post('/', async (req, res, next) => {
  try {
    const data = bookingSchema.parse(req.body);

    /* Convert student's local time to WAT (Africa/Lagos).
       TESTED AND VERIFIED approach â€” passes all timezone tests including
       Australia (UTC+10), India (UTC+5:30), Nigeria (UTC+1), UK BST, USA EDT, etc.
       
       Method: Use noon UTC as a reference to find the timezone offset,
       then apply that offset to convert the student's time to UTC, then to WAT.
    */
    let watTime = data.time;
    let tzAbbr  = '';
    try {
      if (data.timezone && data.date && data.time) {
        /* Normalise time to 24-hour HH:MM format â€” handles both "20:00" and "8:00 PM" */
        let normalizedTime = data.time;
        const ampmMatch = data.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (ampmMatch) {
          let nh = parseInt(ampmMatch[1]);
          const nm = parseInt(ampmMatch[2]);
          const period = ampmMatch[3].toUpperCase();
          if (period === 'PM' && nh !== 12) nh += 12;
          if (period === 'AM' && nh === 12) nh = 0;
          normalizedTime = `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
        }

        const [h, m] = normalizedTime.split(':').map(Number);
        const hh = String(h).padStart(2, '0');
        const mm = String(m || 0).padStart(2, '0');

        /* Step 1: Find the UTC offset for this timezone on the booking date.
           Use noon UTC as reference (avoids DST edges at midnight). */
        const noonUTC = new Date(`${data.date}T12:00:00Z`);

        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: data.timezone,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        });

        const parts = {};
        fmt.formatToParts(noonUTC).forEach(p => { parts[p.type] = p.value; });

        /* What time does the student's timezone show at noon UTC? */
        const tzHourAtNoonUTC = parseInt(parts.hour === '24' ? '0' : parts.hour);
        const tzMinAtNoonUTC  = parseInt(parts.minute);

        /* Offset in minutes = (what TZ shows at noon UTC) - 12:00 */
        const offsetMins = (tzHourAtNoonUTC * 60 + tzMinAtNoonUTC) - (12 * 60);

        /* Step 2: Convert student local time to UTC */
        const studentMins = h * 60 + (m || 0);
        const utcMins     = studentMins - offsetMins;

        /* Step 3: Convert UTC to WAT (Africa/Lagos = UTC+1 = +60 mins) */
        const watMins   = ((utcMins + 60) % 1440 + 1440) % 1440;
        const watH      = Math.floor(watMins / 60);
        const watM      = watMins % 60;
        const watPeriod = watH >= 12 ? 'PM' : 'AM';
        const watH12    = watH % 12 === 0 ? 12 : watH % 12;
        watTime = `${watH12}:${String(watM).padStart(2, '0')} ${watPeriod} WAT`;

        /* Step 4: Get timezone abbreviation */
        try {
          const abbrFmt   = new Intl.DateTimeFormat('en-US', {
            timeZone: data.timezone,
            timeZoneName: 'short',
          });
          const abbrPart  = abbrFmt.formatToParts(noonUTC).find(p => p.type === 'timeZoneName');
          tzAbbr = abbrPart ? abbrPart.value : '';
        } catch { /* silent */ }

        logger.info(`[TZ] ${data.timezone} ${hh}:${mm} | offset=${offsetMins}min | UTC=${Math.floor(((utcMins%1440)+1440)%1440/60)}:${String(((utcMins%1440)+1440)%1440%60).padStart(2,'0')} | WAT=${watTime} | abbr=${tzAbbr}`);
      }
    } catch(e) {
      logger.warn('[BOOKING] WAT conversion failed:', e.message);
      watTime = data.time;
    }

    /* Insert booking */
    const result = await pool.query(
      `INSERT INTO bookings
         (subject, grade, date, time, class_link, status, is_demo, notes, booked_at)
       VALUES ($1, $2, $3::date, $4::time, '', 'pending', TRUE, $5, NOW())
       RETURNING id`,
      [data.subject, data.grade, data.date, data.time,
       JSON.stringify({
         studentName: data.studentName,
         age:         data.age,
         gender:      data.gender || '',
         email:       data.email || '',
         whatsapp:    data.whatsapp || '',
         parentName:  data.parentName,
         country:     data.country || '',
         device:      data.device,
         timezone:    data.timezone,
         tzAbbr:      tzAbbr,
         timeLocal:   data.time,       // student's local time (HH:MM)
         timeWAT:     watTime,         // WAT equivalent
       })]
    );

    const bookingId = result.rows[0].id;

    await pool.query(
      `UPDATE bookings SET lesson_name = $1 WHERE id = $2`,
      [data.studentName, bookingId]
    ).catch(() => {});

    /* Notify parent */
    await notify.notifyDemoConfirmed({
      userId:      null,
      parentEmail: data.email,
      parentPhone: data.whatsapp,
      parentName:  data.parentName,
      studentName: data.studentName,
      subject:     data.subject,
      date:        data.date,
      time:        data.time,
      bookingId,
    });

    /* Notify operations team */
    const emailService = require('../services/emailService');
    emailService.sendEmail({
      to: 'operations@stemnestacademy.co.uk',
      subject: `ðŸŽ“ New Demo Booked â€” ${data.studentName} (${data.subject})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
          <h2 style="color:#1a56db;">New Demo Class Booking ðŸŽ“</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;font-weight:700;color:#718096;width:140px;">Student</td><td style="padding:8px 0;font-weight:800;">${data.studentName}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;color:#718096;">Subject</td><td style="padding:8px 0;">${data.subject}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;color:#718096;">Grade/Age</td><td style="padding:8px 0;">${data.grade} Â· Age ${data.age}</td></tr>
            ${data.gender ? `<tr><td style="padding:8px 0;font-weight:700;color:#718096;">Gender</td><td style="padding:8px 0;">${data.gender}</td></tr>` : ''}
            ${data.country ? `<tr><td style="padding:8px 0;font-weight:700;color:#718096;">Country</td><td style="padding:8px 0;">${data.country}</td></tr>` : ''}
            <tr><td style="padding:8px 0;font-weight:700;color:#718096;">Date</td><td style="padding:8px 0;">${data.date}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;color:#718096;">Time (Local)</td><td style="padding:8px 0;">${data.time} (${data.timezone})</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;color:#718096;">Time (WAT)</td><td style="padding:8px 0;color:#1a56db;font-weight:800;">${watTime}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;color:#718096;">Email</td><td style="padding:8px 0;">${data.email || 'â€”'}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;color:#718096;">WhatsApp</td><td style="padding:8px 0;">${data.whatsapp || 'â€”'}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;color:#718096;">Booking ID</td><td style="padding:8px 0;font-family:monospace;">${bookingId}</td></tr>
          </table>
          <div style="margin-top:20px;background:#f0f4ff;border-radius:10px;padding:14px;font-size:13px;color:#1e40af;font-weight:700;">
            âš¡ Action needed: Assign a teacher and schedule this demo class in the Pre-Sales dashboard.
          </div>
          <a href="https://stemnestacademy.co.uk/pages/presales-dashboard.html" 
             style="display:inline-block;margin-top:16px;background:#1a56db;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">
            Open Pre-Sales Dashboard â†’
          </a>
        </div>
      `,
      template: 'booking_notification',
    }).catch(e => logger.warn('[BOOKING NOTIFICATION] Email failed:', e.message));

    logger.info(`[BOOKING CREATED] ${data.studentName} Â· ${data.subject} Â· ${data.date}`);
    res.status(201).json({ success: true, bookingId });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GET /api/bookings/scheduled-students  (postsales/admin)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.get('/scheduled-students', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        b.student_id                           AS "studentId",
        u_s.name                               AS "studentName",
        u_s.email                              AS email,
        b.subject                              AS course,
        u_t.name                               AS "tutorName",
        MIN(b.date)                            AS "nextDate",
        (SELECT time FROM bookings WHERE student_id = b.student_id
           AND status = 'scheduled' AND is_demo = FALSE
           AND date = MIN(b.date) LIMIT 1)     AS "nextTime",
        COUNT(*)                               AS "remainingCount",
        MAX(b.class_link)                      AS "classLink"
      FROM bookings b
      LEFT JOIN users u_s ON u_s.id = b.student_id
      LEFT JOIN users u_t ON u_t.id = b.tutor_id
      WHERE b.status = 'scheduled'
        AND b.is_demo = FALSE
        AND b.student_id IS NOT NULL
        AND b.date >= CURRENT_DATE
      GROUP BY b.student_id, u_s.name, u_s.email, b.subject, u_t.name
      ORDER BY MIN(b.date) ASC
    `);

    res.json({ success: true, students: result.rows });
  } catch (err) { next(err); }
});


router.put('/reschedule-student', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const {
      studentId,      // UUID of the student user
      startDate,      // YYYY-MM-DD â€” reschedule takes effect from this date
      classLink,      // optional â€” keep existing if not provided
      schedule,       // [{ weekday: 1, time: '11:30' }, ...]
      tutorId,        // keep existing if not provided
    } = req.body;

    if (!studentId)   return res.status(400).json({ success: false, error: 'studentId required' });
    if (!startDate)   return res.status(400).json({ success: false, error: 'startDate required' });
    if (!Array.isArray(schedule) || !schedule.length) return res.status(400).json({ success: false, error: 'schedule required' });

    /* Get existing future bookings for this student, ordered by date */
    const existing = await pool.query(`
      SELECT id, date, time, tutor_id, class_link, lesson_name, pathway_lesson_id,
             lesson_number_in_grade, notes
      FROM bookings
      WHERE student_id = $1
        AND status = 'scheduled'
        AND date >= $2::date
      ORDER BY date ASC, time ASC
    `, [studentId, startDate]);

    if (!existing.rows.length) {
      return res.status(404).json({ success: false, error: 'No future scheduled bookings found for this student' });
    }

    const totalToReschedule = existing.rows.length;
    const resolvedTutorId   = tutorId || existing.rows[0].tutor_id;
    const resolvedClassLink = classLink || existing.rows[0].class_link || '';

    /* Get student details for notes */
    const stuRes = await pool.query(
      'SELECT u.name, u.email, sp.grade FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = $1',
      [studentId]
    );
    const student = stuRes.rows[0] || {};

    /* Get tutor name */
    const tutorRes = await pool.query('SELECT name FROM users WHERE id = $1', [resolvedTutorId]);
    const tutorName = tutorRes.rows[0]?.name || 'â€”';

    /* Build new schedule dates â€” same number of sessions as existing */
    const newDates = [];
    const start = new Date(startDate + 'T12:00:00Z');

    /* For each weekday slot in schedule, find first occurrence >= startDate */
    const slotStarts = schedule.map(slot => {
      const d = new Date(start);
      const dayDiff = (slot.weekday - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + dayDiff);
      return { ...slot, next: new Date(d) };
    });

    /* Generate dates in order until we have enough */
    while (newDates.length < totalToReschedule) {
      /* Find the slot with the earliest next date */
      slotStarts.sort((a, b) => a.next - b.next);
      const slot = slotStarts[0];
      newDates.push({ date: slot.next.toISOString().split('T')[0], time: slot.time });
      const nextOccurrence = new Date(slot.next);
      nextOccurrence.setDate(nextOccurrence.getDate() + 7);
      slotStarts[0].next = nextOccurrence;
    }

    /* Cancel old bookings */
    await pool.query(`
      UPDATE bookings SET status = 'cancelled'
      WHERE student_id = $1 AND status = 'scheduled' AND date >= $2::date
    `, [studentId, startDate]);

    /* Create new bookings preserving lesson sequence */
    const createdIds = [];
    for (let i = 0; i < newDates.length; i++) {
      const old = existing.rows[i];
      const nd  = newDates[i];
      const result = await pool.query(`
        INSERT INTO bookings
          (subject, grade, date, time, class_link, status, is_demo,
           tutor_id, student_id, lesson_name, notes, booked_at, scheduled_at,
           pathway_lesson_id, lesson_number_in_grade)
        VALUES ($1,$2,$3::date,$4::time,$5,'scheduled',FALSE,
                $6,$7,$8,$9,NOW(),NOW(),$10,$11)
        RETURNING id
      `, [
        'Coding',
        student.grade || 'Grade 1',
        nd.date,
        nd.time.substring(0,5),
        resolvedClassLink,
        resolvedTutorId,
        studentId,
        student.name || old.lesson_name,
        JSON.stringify({
          studentName: student.name || '',
          email:       student.email || '',
          tutorName,
          classLink:   resolvedClassLink,
          isPaidClass: true,
          rescheduled: true,
        }),
        old.pathway_lesson_id || null,
        old.lesson_number_in_grade || null,
      ]);
      createdIds.push(result.rows[0].id);
    }

    logger.info(`[RESCHEDULE] Student ${studentId}: cancelled ${totalToReschedule}, created ${createdIds.length}`);
    res.json({ success: true, cancelled: totalToReschedule, created: createdIds.length });

  } catch (err) { next(err); }
});


router.put('/change-tutor', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { studentId, newTutorId, startDate } = req.body;

    if (!studentId)  return res.status(400).json({ success: false, error: 'studentId required' });
    if (!newTutorId) return res.status(400).json({ success: false, error: 'newTutorId required' });

    const effectiveDate = startDate || new Date().toISOString().split('T')[0];

    /* Get new tutor name for notes update */
    const tutorRes = await pool.query('SELECT name FROM users WHERE id = $1', [newTutorId]);
    if (!tutorRes.rows.length) return res.status(404).json({ success: false, error: 'New tutor not found' });
    const newTutorName = tutorRes.rows[0].name;

    /* Get affected bookings */
    const affected = await pool.query(`
      SELECT id, notes FROM bookings
      WHERE student_id = $1 AND status = 'scheduled' AND date >= $2::date
    `, [studentId, effectiveDate]);

    if (!affected.rows.length) {
      return res.status(404).json({ success: false, error: 'No future bookings found for this student' });
    }

    /* Update tutor and notes on all future bookings */
    for (const b of affected.rows) {
      let notes = {};
      try { notes = typeof b.notes === 'string' ? JSON.parse(b.notes || '{}') : (b.notes || {}); } catch {}
      notes.tutorName = newTutorName;
      await pool.query(
        'UPDATE bookings SET tutor_id = $1, notes = $2 WHERE id = $3',
        [newTutorId, JSON.stringify(notes), b.id]
      );
    }

    logger.info(`[CHANGE-TUTOR] Student ${studentId}: ${affected.rows.length} bookings â†’ tutor ${newTutorId} (${newTutorName})`);
    res.json({ success: true, updated: affected.rows.length, newTutorName });

  } catch (err) { next(err); }
});



/* ╔═════════════════════════════════════════════
   GET /api/bookings/:id
═════════════════════════════════════════════ */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.*,
              u_s.name  AS student_name,  u_s.email AS student_email, u_s.phone AS student_phone,
              u_t.name  AS tutor_name,    u_t.staff_id AS tutor_staff_id,
              u_sp.name AS sales_name,    u_sp.staff_id AS sales_staff_id,
              c.name    AS course_name,
              l.name    AS lesson_name_full, l.activity_link, l.slides_link
       FROM bookings b
       LEFT JOIN users u_s  ON u_s.id  = b.student_id
       LEFT JOIN users u_t  ON u_t.id  = b.tutor_id
       LEFT JOIN users u_sp ON u_sp.id = b.sales_id
       LEFT JOIN courses c  ON c.id    = b.course_id
       LEFT JOIN lessons l  ON l.id    = b.lesson_id
       WHERE b.id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    res.json({ success: true, booking: result.rows[0] });
  } catch (err) { next(err); }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PUT /api/bookings/:id/assign
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.put('/:id/assign', requireAuth, requireRole('admin','super_admin','presales','postsales'), async (req, res, next) => {
  try {
    const { tutorId, salesId, classLink, notes, date, time } = assignSchema.parse(req.body);

    /* Support both UUID and staff_id for tutorId */
    let tutorResult = await pool.query('SELECT * FROM users WHERE id = $1', [tutorId]);
    if (!tutorResult.rows.length) {
      /* Try by staff_id */
      tutorResult = await pool.query('SELECT * FROM users WHERE staff_id = $1', [tutorId]);
    }
    const tutor = tutorResult.rows[0];
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found: ' + tutorId });

    /* Support both UUID and staff_id for salesId */
    let salesDbId = salesId || null;
    if (salesId) {
      const salesResult = await pool.query(
        'SELECT id FROM users WHERE id::text = $1 OR staff_id = $1', [salesId]
      );
      if (salesResult.rows.length) salesDbId = salesResult.rows[0].id;
    }

    /* Get booking */
    const bResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    const booking = bResult.rows[0];
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    /* Update booking â€” always set tutor, sales, link, status; optionally update date/time */
    const updateFields = [
      'tutor_id = $1',
      'sales_id = $2',
      'class_link = $3',
      "status = 'scheduled'",
      'scheduled_at = NOW()',
    ];
    const updateParams = [tutor.id, salesDbId, classLink];

    if (date) {
      updateFields.push(`date = $${updateParams.length + 1}::date`);
      updateParams.push(date);
    }
    if (time) {
      updateFields.push(`time = $${updateParams.length + 1}::time`);
      updateParams.push(time);
    }

    // bookingId is always last param
    updateParams.push(req.params.id);
    await pool.query(
      `UPDATE bookings SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
      updateParams
    );

    /* Notify tutor */
    const bookingNotes = typeof booking.notes === 'string' ? JSON.parse(booking.notes || '{}') : (booking.notes || {});
    await notify.notifyClassAssigned({
      tutorId:     tutor.id,
      tutorEmail:  tutor.email,
      tutorPhone:  tutor.phone,
      tutorName:   tutor.name,
      studentName: bookingNotes.studentName || 'Student',
      subject:     booking.subject,
      date:        booking.date,
      time:        booking.time,
      classLink,
    });

    /* Notify parent â€” congratulatory email with join link and Google Meet guide */
    const parentEmail = bookingNotes.email || '';
    if (parentEmail) {
      try {
        const emailService = require('../services/emailService');
        const bookingDate = date || (booking.date ? new Date(booking.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'â€”');
        const bookingTime = time || booking.time || 'â€”';
        await emailService.sendDemoScheduledParentEmail({
          to:         parentEmail,
          parentName: bookingNotes.parentName || '',
          studentName: bookingNotes.studentName || 'your child',
          subject:    booking.subject,
          date:       bookingDate,
          timeLocal:  bookingTime + (bookingNotes.timezone ? ' (' + bookingNotes.timezone + ')' : ''),
          timeWAT:    bookingNotes.timeWAT || '',
          tutorName:  tutor.name,
          classLink,
        });
        logger.info(`[ASSIGN] Parent congratulatory email sent to ${parentEmail}`);
      } catch (emailErr) {
        logger.warn('[ASSIGN] Parent email failed:', emailErr.message);
      }
    }

    /* Notify sales person */
    if (salesId) {
      const salesResult = await pool.query('SELECT * FROM users WHERE id = $1', [salesId]);
      const sales = salesResult.rows[0];
      if (sales) {
        await notify.notifySalesAssigned({
          salesId:     sales.id,
          salesEmail:  sales.email,
          salesPhone:  sales.phone,
          salesName:   sales.name,
          studentName: bookingNotes.studentName || 'Student',
          subject:     booking.subject,
          date:        booking.date,
          time:        booking.time,
        });
      }
    }

    logger.info(`[ASSIGN] Booking ${req.params.id} â†’ tutor ${tutorId}`);
    res.json({ success: true, message: 'Class assigned and notifications sent' });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PUT /api/bookings/:id/status  (admin/tutor)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.put('/:id/status', requireAuth, requireRole('admin','super_admin','tutor','presales','postsales'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['pending','scheduled','completed','incomplete','cancelled','teacher_absent'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status: ' + status });
    }

    const bResult = await pool.query('SELECT id FROM bookings WHERE id = $1', [req.params.id]);
    if (!bResult.rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });

    await pool.query(
      `UPDATE bookings SET status = $1${status === 'completed' ? ', completed_at = NOW()' : ''} WHERE id = $2`,
      [status, req.params.id]
    );

    logger.info(`[STATUS] Booking ${req.params.id} â†’ ${status} by ${req.user.email}`);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) { next(err); }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   POST /api/bookings/:id/report  (tutor)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.post('/:id/report', requireAuth, requireRole('tutor'), async (req, res, next) => {
  try {
    const data = reportSchema.parse(req.body);

    /* Verify this booking belongs to this tutor */
    const bResult = await pool.query(
      'SELECT * FROM bookings WHERE id = $1 AND tutor_id = $2',
      [req.params.id, req.user.id]
    );
    if (!bResult.rows.length) {
      return res.status(403).json({ success: false, error: 'Booking not found or not yours' });
    }

    /* Save report — ON CONFLICT handles the case where teacher retries after a partial failure */
    await pool.query(
      `INSERT INTO class_reports
         (booking_id, tutor_id, outcome, class_quality, student_interest,
          purchasing_power, incomplete_reason, notes, recording_link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (booking_id) DO UPDATE SET
         outcome           = EXCLUDED.outcome,
         class_quality     = EXCLUDED.class_quality,
         student_interest  = EXCLUDED.student_interest,
         purchasing_power  = EXCLUDED.purchasing_power,
         incomplete_reason = EXCLUDED.incomplete_reason,
         notes             = EXCLUDED.notes,
         recording_link    = EXCLUDED.recording_link`,
      [req.params.id, req.user.id, data.outcome, data.classQuality || null,
       data.studentInterest || null, data.purchasingPower || null,
       data.incompleteReason || null, data.notes || null,
       data.recordingLink || null]
    );

    /* Update booking status and notes */
    const booking = bResult.rows[0];
    let bNotesObj = {};
    if (booking.notes) {
      try { bNotesObj = JSON.parse(booking.notes); } catch(e) {}
    }
    /* bookingNotes is used by post-class emails below */
    const bookingNotes = bNotesObj;

    if (data.outcome === 'incomplete' && data.incompleteReason) {
      bNotesObj.incompleteReason = data.incompleteReason;
    }

    await pool.query(
      'UPDATE bookings SET status = $1, completed_at = NOW(), notes = $3 WHERE id = $2',
      [data.outcome, req.params.id, Object.keys(bNotesObj).length > 0 ? JSON.stringify(bNotesObj) : null]
    );

    /* ── Auto-shift on incomplete: move this booking to next learning day
       and shift all subsequent bookings forward by one slot ── */
    if (data.outcome === 'incomplete' && booking.student_id && !booking.is_demo) {
      try {
        /* Find the student's next learning day after this booking */
        const nextDayRes = await pool.query(
          `SELECT id, date, time FROM bookings
           WHERE student_id = $1
             AND id != $2
             AND status = 'scheduled'
             AND is_demo = FALSE
             AND (date > $3 OR (date = $3 AND time > $4))
           ORDER BY date ASC, time ASC
           LIMIT 1`,
          [booking.student_id, booking.id, booking.date, booking.time]
        );

        if (nextDayRes.rows.length) {
          const nextSlot = nextDayRes.rows[0];
          const nextDate = nextSlot.date instanceof Date ? nextSlot.date.toISOString().split('T')[0] : String(nextSlot.date).split('T')[0];
          const nextTime = String(nextSlot.time).replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');

          /* Get the weekly pattern from the student's enrolment */
          const enrolRes = await pool.query(
            `SELECT schedule FROM enrolments
             WHERE student_id = $1 AND status = 'active'
             ORDER BY created_at DESC LIMIT 1`,
            [booking.student_id]
          );
          const schedule = enrolRes.rows[0]?.schedule || null;

          /* Move the incomplete booking to the next learning day */
          await pool.query(
            `UPDATE bookings
             SET date = $1::date, time = $2::time,
                 status = 'scheduled',
                 rescheduled_from = $4::date,
                 rescheduled_at = NOW()
             WHERE id = $3`,
            [nextDate, nextTime, booking.id, booking.date instanceof Date ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0]]
          );

          /* Shift all subsequent scheduled bookings for this student forward
             by finding each one and moving it to the next occurrence after itself */
          if (schedule) {
            const futureRes = await pool.query(
              `SELECT id, date, time FROM bookings
               WHERE student_id = $1
                 AND id != $2
                 AND status = 'scheduled'
                 AND is_demo = FALSE
                 AND date >= $3
               ORDER BY date ASC, time ASC`,
              [booking.student_id, booking.id, nextDate]
            );

            /* Build schedule weekday/time pairs */
            const scheduleSlots = Array.isArray(schedule) ? schedule : JSON.parse(schedule);

            /* Shift each booking one slot forward using the schedule pattern */
            for (const fb of futureRes.rows) {
              const fbDate = fb.date instanceof Date ? fb.date.toISOString().split('T')[0] : String(fb.date).split('T')[0];
              const fbTime = String(fb.time).replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');
              const fbDt   = new Date(fbDate + 'T12:00:00');

              /* Find next occurrence in schedule after this booking's date */
              let cursor = new Date(fbDt);
              cursor.setDate(cursor.getDate() + 1);
              let found = null;
              for (let d = 0; d < 14; d++) {
                const dow = cursor.getDay();
                const slot = scheduleSlots.find(s => Number(s.weekday) === dow);
                if (slot) { found = { date: cursor.toISOString().split('T')[0], time: slot.time }; break; }
                cursor.setDate(cursor.getDate() + 1);
              }

              if (found) {
                await pool.query(
                  `UPDATE bookings SET date = $1::date, time = $2::time,
                   rescheduled_from = $4::date, rescheduled_at = NOW()
                   WHERE id = $3`,
                  [found.date, found.time, fb.id, fbDate]
                );
              }
            }
          }

          logger.info(`[INCOMPLETE-SHIFT] Booking ${booking.id} and ${nextDayRes.rows.length} subsequent bookings shifted forward for student ${booking.student_id}`);
        }
      } catch (shiftErr) {
        logger.warn('[INCOMPLETE-SHIFT] Auto-shift failed (non-fatal):', shiftErr.message);
      }
    }

    /* Deduct student credit if completed */
    if (data.outcome === 'completed' || data.outcome === 'partially_completed') {
      if (booking.student_id) {
        /* â”€â”€ Track lesson completion â”€â”€ */
        try {
          /* Find the student's active enrolment for this pathway */
          const enrolResult = await pool.query(
            `SELECT e.id, e.pathway_id, e.current_grade, e.lessons_completed,
                    pg.total_lessons
             FROM enrolments e
             LEFT JOIN pathway_grades pg ON pg.pathway_id = e.pathway_id
                                        AND pg.grade_number = e.current_grade
             WHERE e.student_id = $1 AND e.status = 'active'
             ORDER BY e.created_at DESC LIMIT 1`,
            [booking.student_id]
          );
          const enrolment = enrolResult.rows[0];

          if (enrolment) {
            /* Insert lesson completion record (ignore if already exists) */
            await pool.query(
              `INSERT INTO lesson_completions
                 (student_id, enrolment_id, booking_id, pathway_id, grade_number, lesson_number)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (student_id, booking_id) DO NOTHING`,
              [booking.student_id, enrolment.id, booking.id,
               enrolment.pathway_id, enrolment.current_grade,
               (booking.lesson_number_in_grade || null)]
            );

            /* Increment lessons_completed on enrolment */
            await pool.query(
              `UPDATE enrolments SET lessons_completed = COALESCE(lessons_completed, 0) + 1
               WHERE id = $1`,
              [enrolment.id]
            );

            const newLessonsCompleted = (enrolment.lessons_completed || 0) + 1;
            const totalLessons = enrolment.total_lessons || 72;

            logger.info(`[PROGRESS] Student ${booking.student_id} lesson ${newLessonsCompleted}/${totalLessons}`);

            /* Auto-award certificate when grade is fully completed */
            if (newLessonsCompleted >= totalLessons) {
              try {
                const pathwayResult = await pool.query(
                  `SELECT p.name, pg.name AS grade_name
                   FROM pathways p
                   LEFT JOIN pathway_grades pg ON pg.pathway_id = p.id
                                              AND pg.grade_number = $2
                   WHERE p.id = $1`,
                  [enrolment.pathway_id, enrolment.current_grade]
                );
                const pathway = pathwayResult.rows[0];

                /* Upsert certificate */
                const certResult = await pool.query(
                  `INSERT INTO certificates
                     (student_id, enrolment_id, pathway_id, pathway_name,
                      grade_number, grade_name)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (student_id, pathway_id, grade_number) DO NOTHING
                   RETURNING id`,
                  [booking.student_id, enrolment.id, enrolment.pathway_id,
                   pathway?.name || 'STEMNest Pathway',
                   enrolment.current_grade,
                   pathway?.grade_name || `Grade ${enrolment.current_grade}`]
                );

                if (certResult.rows.length > 0) {
                  logger.info(`[CERT] Auto-awarded to ${booking.student_id} for ${pathway?.name} Grade ${enrolment.current_grade}`);

                  /* Send certificate email */
                  const emailSvc = require('../services/emailService');
                  const sResult = await pool.query(
                    `SELECT u.name, u.email, sp.parent_email, sp.parent_name
                     FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
                     WHERE u.id = $1`,
                    [booking.student_id]
                  );
                  const sData = sResult.rows[0];
                  if (sData) {
                    const recipientEmail = sData.parent_email || sData.email;
                    const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
                    emailSvc.sendEmail({
                      to:      recipientEmail,
                      subject: `ðŸŽ“ ${sData.name} has earned a StemNest Certificate!`,
                      html: `<div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;text-align:center;">
                        <h1 style="color:#0e9f6e;">ðŸ† Certificate of Completion</h1>
                        <p><strong>${sData.name}</strong> has successfully completed<br>
                        <strong>${pathway?.name || 'STEMNest Pathway'} â€” Grade ${enrolment.current_grade}</strong></p>
                        <a href="${appUrl}/pages/student-dashboard.html"
                           style="display:inline-block;margin-top:16px;background:#1a56db;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;">
                          View Certificate â†’
                        </a>
                      </div>`,
                      template: 'certificate_awarded',
                    }).catch(() => {});
                  }
                }
              } catch (certErr) {
                logger.warn('[CERT] Auto-award failed:', certErr.message);
              }
            }
          }
        } catch (progressErr) {
          logger.warn('[PROGRESS] Lesson tracking failed (non-fatal):', progressErr.message);
        }

        /* Fetch current credits before deduction */
        const credBefore = await pool.query(
          `SELECT sp.credits, sp.credits_suspended, u.email, u.phone, u.name,
                  sp.parent_email, sp.parent_name
           FROM student_profiles sp JOIN users u ON u.id = sp.user_id
           WHERE sp.user_id = $1`,
          [booking.student_id]
        );
        const student = credBefore.rows[0];
        const currentCredits = student ? parseInt(student.credits || 0) : 0;
        const newCredits     = currentCredits - 1;

        /* Deduct credit (allow going negative) */
        await pool.query(
          `UPDATE student_profiles SET credits = credits - 1 WHERE user_id = $1`,
          [booking.student_id]
        );
        await pool.query(
          `INSERT INTO credit_transactions (student_id, type, amount, description, booking_id)
           VALUES ($1, 'class_deduction', -1, 'Class completed â€” 1 credit used', $2)`,
          [booking.student_id, req.params.id]
        );

        /* Apply suspension at -2 */
        if (newCredits <= -2) {
          await pool.query(
            `UPDATE student_profiles SET credits_suspended = TRUE WHERE user_id = $1`,
            [booking.student_id]
          );
        }

        logger.info(`[CREDITS] Student ${booking.student_id}: ${currentCredits} â†’ ${newCredits}`);

        /* â”€â”€ Credit threshold notifications â”€â”€ */
        if (student) {
          const emailSvc   = require('../services/emailService');
          const recipientEmail = student.parent_email || student.email;
          const recipientName  = student.parent_name  || student.name;
          const studentName    = student.name;
          const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
          const topUpUrl = `${appUrl}/pages/student-dashboard.html?topup=1`;

          /* 3 credits remaining â€” soft nudge */
          if (newCredits === 3) {
            emailSvc.sendEmail({
              to:      recipientEmail,
              subject: `ðŸ“š ${studentName} has 3 classes left â€” top up soon`,
              html: emailSvc._buildCreditNudgeEmail({
                parentName: recipientName, studentName, credits: 3,
                urgency: 'soft', topUpUrl,
                message: `${studentName} has <strong>3 class credits remaining</strong>. Top up now to keep the learning momentum going!`
              }),
              template: 'credit_nudge_3',
            }).catch(e => logger.warn('[CREDITS] Email (3) failed:', e.message));

            /* â”€â”€ Alert the assigned Learning Advisor at 2 credits (triggers at 3 to give them time) â”€â”€ */
            try {
              const assignedSalesResult = await pool.query(
                `SELECT u.id, u.name, u.email FROM users u
                 JOIN bookings b ON b.sales_id = u.id
                 WHERE b.student_id = $1 AND b.status IN ('scheduled','completed')
                 ORDER BY b.scheduled_at DESC LIMIT 1`,
                [booking.student_id]
              );
              const la = assignedSalesResult.rows[0];
              if (la && la.email) {
                const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
                emailSvc.sendEmail({
                  to:      la.email,
                  subject: `ðŸ”” ${studentName} has 3 credits left â€” time to discuss renewal`,
                  html: `<div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;">
                    <h2 style="color:#1a56db;">Retention Alert ðŸ””</h2>
                    <p>Hi ${la.name},</p>
                    <p><strong>${studentName}</strong> now has <strong>3 class credits remaining</strong>. This is your signal to reach out and discuss renewal before classes run out.</p>
                    <p><strong>Action:</strong> Contact the parent now and generate a renewal payment link from your dashboard.</p>
                    <a href="${appUrl}/pages/sales-dashboard.html" style="display:inline-block;margin-top:12px;background:#1a56db;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">Open Sales Dashboard â†’</a>
                  </div>`,
                  template: 'la_retention_alert',
                }).catch(e => logger.warn('[CREDITS] LA alert email failed:', e.message));
              }
            } catch (laErr) {
              logger.warn('[CREDITS] LA alert lookup failed:', laErr.message);
            }

            /* â”€â”€ Save renewal follow-up record for automated sequence â”€â”€ */
            await pool.query(
              `INSERT INTO renewal_followups (student_id, student_name, credits_at_trigger, triggered_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (student_id) DO UPDATE SET
                 credits_at_trigger = $3,
                 triggered_at = NOW(),
                 day3_sent = FALSE,
                 day7_sent = FALSE,
                 day14_sent = FALSE,
                 renewed = FALSE`,
              [booking.student_id, bookingNotes.studentName || student.name, 3]
            ).catch(e => logger.warn('[CREDITS] Renewal followup record failed:', e.message));
          }

          /* 1 credit remaining â€” urgent nudge */
          if (newCredits === 1) {
            emailSvc.sendEmail({
              to:      recipientEmail,
              subject: `âš ï¸ Only 1 class left for ${studentName} â€” top up now`,
              html: emailSvc._buildCreditNudgeEmail({
                parentName: recipientName, studentName, credits: 1,
                urgency: 'urgent', topUpUrl,
                message: `${studentName} has only <strong>1 class credit left</strong>. Please top up to avoid any interruption to their learning.`
              }),
              template: 'credit_nudge_1',
            }).catch(e => logger.warn('[CREDITS] Email (1) failed:', e.message));
          }

          /* 0 credits â€” warning, existing classes still honoured */
          if (newCredits === 0) {
            emailSvc.sendEmail({
              to:      recipientEmail,
              subject: `ðŸ”´ ${studentName}'s credits have run out â€” action needed`,
              html: emailSvc._buildCreditNudgeEmail({
                parentName: recipientName, studentName, credits: 0,
                urgency: 'critical', topUpUrl,
                message: `${studentName}'s class credits have run out. <strong>Existing scheduled classes will still take place</strong>, but no new sessions can be booked until you top up.`
              }),
              template: 'credit_nudge_0',
            }).catch(e => logger.warn('[CREDITS] Email (0) failed:', e.message));
          }

          /* -1 credits â€” discontinuation warning */
          if (newCredits === -1) {
            emailSvc.sendEmail({
              to:      recipientEmail,
              subject: `ðŸš¨ ${studentName}'s classes will be discontinued soon`,
              html: emailSvc._buildCreditNudgeEmail({
                parentName: recipientName, studentName, credits: -1,
                urgency: 'critical', topUpUrl,
                message: `${studentName}'s account is now in negative credit. <strong>Classes will be paused</strong> if not topped up urgently. Please top up to keep their sessions active.`
              }),
              template: 'credit_nudge_negative',
            }).catch(e => logger.warn('[CREDITS] Email (-1) failed:', e.message));
          }

          /* -2 credits â€” suspended notification */
          if (newCredits <= -2) {
            emailSvc.sendEmail({
              to:      recipientEmail,
              subject: `ðŸ”’ ${studentName}'s classes have been paused`,
              html: emailSvc._buildCreditNudgeEmail({
                parentName: recipientName, studentName, credits: newCredits,
                urgency: 'suspended', topUpUrl,
                message: `${studentName}'s live class access has been <strong>temporarily paused</strong> due to insufficient credits. ${studentName} can still access all previous lesson materials and complete assignments, but cannot join new live sessions until credits are topped up.`
              }),
              template: 'credit_suspended',
            }).catch(e => logger.warn('[CREDITS] Email (suspended) failed:', e.message));
          }
        }
      }
    }

    logger.info(`[REPORT] Booking ${req.params.id} â†’ ${data.outcome}`);

    /* â”€â”€ Tutor earnings â€” add when class is completed â”€â”€ */
    if (data.outcome === 'completed' && req.user.id) {
      try {
        /* Fetch pay rates from settings table */
        const settingsResult = await pool.query(
          `SELECT key, value FROM settings WHERE key IN ('paidPayRate','demoPayRate')`
        ).catch(() => ({ rows: [] }));

        const settingsMap = {};
        (settingsResult.rows || []).forEach(r => { settingsMap[r.key] = parseFloat(r.value) || 0; });

        const isDemo = booking.is_demo === true;
        const payRate = isDemo
          ? (settingsMap['demoPayRate'] || 5)    // fallback Â£5 for demo
          : (settingsMap['paidPayRate'] || 20);  // fallback Â£20 for paid

        /* Update tutor earnings */
        await pool.query(
          `UPDATE tutor_profiles SET earnings = COALESCE(earnings, 0) + $1 WHERE user_id = $2`,
          [payRate, req.user.id]
        );

        /* Log to tutor_earnings_log for paysheet accuracy */
        await pool.query(
          `INSERT INTO tutor_earnings_log (tutor_id, booking_id, amount, type, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT DO NOTHING`,
          [req.user.id, req.params.id, payRate, isDemo ? 'demo' : 'paid']
        ).catch(e => logger.warn('[EARNINGS] Log insert failed (non-fatal):', e.message));

        logger.info(`[EARNINGS] Tutor ${req.user.id} earned Â£${payRate} for ${isDemo ? 'demo' : 'paid'} class`);
      } catch (earningsErr) {
        logger.warn('[EARNINGS] Tutor pay update failed (non-fatal):', earningsErr.message);
      }
    }

    res.json({ success: true, message: 'Report submitted' });

    /* â”€â”€ Fire "How was the class?" feedback email for completed demos â”€â”€ */
    if (data.outcome === 'completed' && booking.is_demo) {
      try {
        const emailService = require('../services/emailService');
        const parentEmail = bookingNotes.email || '';
        if (parentEmail) {
          await emailService.sendClassFeedbackEmail({
            to:          parentEmail,
            parentName:  bookingNotes.parentName  || '',
            studentName: bookingNotes.studentName || 'your child',
            subject:     booking.subject,
            tutorName:   req.user.name || 'your StemNest tutor',
            bookingId:   req.params.id,
          });
          logger.info(`[REPORT] Feedback email sent to ${parentEmail} for booking ${req.params.id}`);
        }
      } catch (fbErr) {
        logger.warn('[REPORT] Feedback email failed:', fbErr.message);
      }
    }

    /* â”€â”€ Fire post-class summary email for all completed classes (paid + demo) â”€â”€ */
    if (data.outcome === 'completed') {
      try {
        const emailService = require('../services/emailService');
        const parentEmail = bookingNotes.email || '';
        if (parentEmail) {
          const credResult = await pool.query(
            `SELECT sp.credits, sp.parent_email, sp.parent_name
             FROM student_profiles sp WHERE sp.user_id = $1`,
            [booking.student_id]
          );
          const sp = credResult.rows[0];
          const creditsRemaining = sp ? parseInt(sp.credits || 0) : null;
          const recipientEmail   = sp?.parent_email || parentEmail;
          const recipientName    = sp?.parent_name  || bookingNotes.parentName || '';
          const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';

          /* For paid classes: find next scheduled class */
          let nextClassDate = null;
          if (!booking.is_demo && booking.student_id) {
            const nextResult = await pool.query(
              `SELECT date, time FROM bookings
               WHERE student_id = $1 AND status = 'scheduled' AND date >= CURRENT_DATE
               ORDER BY date ASC, time ASC LIMIT 1`,
              [booking.student_id]
            );
            const nextClass = nextResult.rows[0];
            if (nextClass) {
              nextClassDate = new Date(nextClass.date).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'long' }) +
                ' at ' + String(nextClass.time).replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
            }
          }

          await emailService.sendPostClassSummaryEmail({
            to:               recipientEmail,
            parentName:       recipientName,
            studentName:      bookingNotes.studentName || 'your child',
            subject:          booking.subject,
            tutorName:        req.user.name || '',
            date:             new Date(booking.date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' }),
            homework:         data.notes || '',
            nextClassDate,
            creditsRemaining: booking.is_demo ? null : creditsRemaining,
            topUpUrl:         `${appUrl}/pages/student-dashboard.html?topup=1`,
            isDemo:           !!booking.is_demo,
          });
          logger.info(`[REPORT] Post-class summary sent to ${recipientEmail} (${booking.is_demo ? 'demo' : 'paid'})`);
        }
      } catch (sumErr) {
        logger.warn('[REPORT] Post-class summary email failed:', sumErr.message);
      }
    }
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PUT /api/bookings/:id/cancel
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.put('/:id/cancel', async (req, res, next) => {
  try {
    const data = cancelSchema.parse(req.body);

    const bResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!bResult.rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
    const booking = bResult.rows[0];

    // Note: We are allowing cancellation without auth because booking ID is a UUID.
    // In a stricter system, we would verify an email or require auth.

    let bNotesObj = {};
    if (booking.notes) { try { bNotesObj = JSON.parse(booking.notes); } catch(e) {} }
    bNotesObj.cancelReason = data.reason;

    await pool.query(
      `UPDATE bookings SET status = 'cancelled', notes = $1 WHERE id = $2`,
      [JSON.stringify(bNotesObj), req.params.id]
    );

    logger.info(`[CANCEL] Booking ${req.params.id} cancelled. Reason: ${data.reason}`);
    res.json({ success: true, message: 'Class cancelled successfully' });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: err.errors[0].message });
    next(err);
  }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   POST /api/bookings/:id/reschedule
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.post('/:id/reschedule', async (req, res, next) => {
  try {
    const data = rescheduleSchema.parse(req.body);

    const bResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!bResult.rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
    const booking = bResult.rows[0];

    // Note: Allowing without auth as booking ID is a UUID.

    let bNotesObj = {};
    if (booking.notes) { try { bNotesObj = JSON.parse(booking.notes); } catch(e) {} }
    
    bNotesObj.rescheduleNote = {
      date: data.date,
      time: data.time,
      reason: data.reason || 'Reschedule requested by user',
      actioned: false
    };

    await pool.query(
      `UPDATE bookings SET notes = $1 WHERE id = $2`,
      [JSON.stringify(bNotesObj), req.params.id]
    );

    logger.info(`[RESCHEDULE] Booking ${req.params.id} reschedule requested for ${data.date} ${data.time}`);
    res.json({ success: true, message: 'Reschedule request submitted successfully' });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: err.errors[0].message });
    next(err);
  }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GET /api/bookings/scheduled-students  (postsales/admin)
   Returns one row per student who has future scheduled paid bookings.
   Used by the Post-Sales Scheduled tab.
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PUT /api/bookings/reschedule-student  (postsales/admin)
   Cancels all future bookings for a student and creates new ones
   following the new schedule, preserving lesson sequence.
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PUT /api/bookings/change-tutor  (postsales/admin)
   Reassigns all future bookings for a student to a new tutor.
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GET /api/bookings/:id/rate  (public â€” from email link)
   Parent clicks a star rating in the feedback email.
   Records the rating and shows a thank-you page.
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.get('/:id/rate', async (req, res, next) => {
  try {
    const rating = parseInt(req.query.rating);
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).send('<h2>Invalid rating. Please use the link in your email.</h2>');
    }

    const bResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!bResult.rows.length) {
      return res.status(404).send('<h2>Booking not found.</h2>');
    }

    const booking = bResult.rows[0];

    /* Save rating in booking notes */
    let notes = {};
    try { notes = typeof booking.notes === 'string' ? JSON.parse(booking.notes || '{}') : (booking.notes || {}); } catch {}
    notes.parentRating = rating;
    notes.parentRatedAt = new Date().toISOString();

    await pool.query(
      'UPDATE bookings SET notes = $1 WHERE id = $2',
      [JSON.stringify(notes), req.params.id]
    );

    /* Also save in class_reports if it exists */
    await pool.query(
      `UPDATE class_reports SET notes = COALESCE(notes, '') || $1 WHERE booking_id = $2`,
      [`\n[Parent rating: ${rating}/5 stars]`, req.params.id]
    ).catch(() => {});

    logger.info(`[RATING] Booking ${req.params.id} rated ${rating}/5 by parent`);

    /* Return a friendly thank-you page */
    const stars = 'â˜…'.repeat(rating) + 'â˜†'.repeat(5 - rating);
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You â€” StemNest Academy</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;900&family=Fredoka+One&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Nunito', sans-serif; background: #f4f6fb; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #fff; border-radius: 24px; padding: 48px 40px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,.1); }
    .emoji { font-size: 64px; margin-bottom: 16px; }
    h1 { font-family: 'Fredoka One', cursive; font-size: 28px; color: #1a202c; margin: 0 0 12px; }
    .stars { font-size: 36px; color: #f59e0b; margin: 16px 0; }
    p { font-size: 16px; color: #4a5568; line-height: 1.7; margin: 0 0 24px; }
    a { display: inline-block; background: #1a56db; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 50px; font-weight: 900; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${rating >= 4 ? 'ðŸŒŸ' : rating >= 3 ? 'ðŸ˜Š' : 'ðŸ™'}</div>
    <h1>Thank you${rating >= 4 ? ', amazing!' : '!'}</h1>
    <div class="stars">${stars}</div>
    <p>Your ${rating}/5 star rating has been recorded. We really appreciate your feedback â€” it helps us improve every class.</p>
    ${rating >= 4
      ? '<p>We\'re delighted your child enjoyed the class! Our team will be in touch to discuss continuing their learning journey. ðŸš€</p>'
      : '<p>We\'re sorry the class didn\'t fully meet your expectations. Our team will reach out to understand how we can do better.</p>'
    }
    <a href="https://stemnestacademy.co.uk">Visit StemNest Academy â†’</a>
  </div>
</body>
</html>`);
  } catch (err) { next(err); }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   POST /api/bookings/:id/reschedule-actioned
   Marks the rescheduleNote as actioned after presales schedules it
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.post('/:id/reschedule-actioned', requireAuth, requireRole('admin','super_admin','presales'), async (req, res, next) => {
  try {
    const bResult = await pool.query('SELECT notes FROM bookings WHERE id = $1', [req.params.id]);
    if (!bResult.rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });

    let notes = {};
    try { notes = typeof bResult.rows[0].notes === 'string' ? JSON.parse(bResult.rows[0].notes || '{}') : (bResult.rows[0].notes || {}); } catch {}

    if (notes.rescheduleNote) {
      notes.rescheduleNote.actioned = true;
    }

    await pool.query('UPDATE bookings SET notes = $1 WHERE id = $2', [JSON.stringify(notes), req.params.id]);
    logger.info(`[RESCHEDULE ACTIONED] Booking ${req.params.id}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DELETE /api/bookings/:id  (admin/presales)
   Hard-delete a booking record â€” used to remove test data
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
router.delete('/:id', requireAuth, requireRole('admin','super_admin','presales'), async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM bookings WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
    logger.info(`[DELETE] Booking ${req.params.id} deleted by ${req.user.email}`);
    res.json({ success: true, message: 'Booking deleted' });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   PUT /api/bookings/:id/move
   Move a single booking to a new date/time.
   Supports two modes via body.mode:
     "next"   — shift to the student's next learning day
     "custom" — shift to a specific date/time
   
   Validation:
   - Clash check: reject if tutor has another booking at target time
   - Boundary check (custom only): reject if target time is after
     the student's next scheduled booking beyond this one
══════════════════════════════════════════════════════ */
router.put('/:id/move', requireAuth, requireRole('admin','super_admin','tutor','presales','postsales'), async (req, res, next) => {
  try {
    const { mode, date: newDate, time: newTime, reason } = req.body;
    if (!mode || !['next', 'custom'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'mode must be "next" or "custom"' });
    }
    if (mode === 'custom' && (!newDate || !newTime)) {
      return res.status(400).json({ success: false, error: 'date and time required for custom mode' });
    }

    /* Load the booking */
    const bRes = await pool.query(
      `SELECT b.*, e.schedule AS enrolment_schedule
       FROM bookings b
       LEFT JOIN enrolments e ON e.id = b.enrolment_id
       WHERE b.id = $1`,
      [req.params.id]
    );
    if (!bRes.rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
    const booking = bRes.rows[0];

    if (!['scheduled'].includes(booking.status)) {
      return res.status(400).json({ success: false, error: 'Only scheduled bookings can be moved' });
    }

    let targetDate, targetTime, nextBookingId = null;

    if (mode === 'next') {
      /* Find the student's next scheduled booking after this one */
      const nextRes = await pool.query(
        `SELECT date, time FROM bookings
         WHERE student_id = $1
           AND id != $2
           AND status = 'scheduled'
           AND is_demo = FALSE
           AND (date > $3 OR (date = $3 AND time > $4))
         ORDER BY date ASC, time ASC
         LIMIT 1`,
        [booking.student_id, booking.id, booking.date, booking.time]
      );
      if (!nextRes.rows.length) {
        return res.status(400).json({ success: false, error: 'No next learning day found for this student' });
      }
      const next = nextRes.rows[0];
      targetDate = next.date instanceof Date ? next.date.toISOString().split('T')[0] : String(next.date).split('T')[0];
      targetTime = String(next.time).replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');
      nextBookingId = next.id;
    } else {
      /* Custom mode */
      targetDate = newDate;
      targetTime = newTime;

      /* Boundary check: custom target must not be after the student's next booking */
      const nextRes = await pool.query(
        `SELECT date, time FROM bookings
         WHERE student_id = $1
           AND id != $2
           AND status = 'scheduled'
           AND is_demo = FALSE
           AND (date > $3 OR (date = $3 AND time > $4))
         ORDER BY date ASC, time ASC
         LIMIT 1`,
        [booking.student_id, booking.id, booking.date, booking.time]
      );
      if (nextRes.rows.length) {
        const nextBooking = nextRes.rows[0];
        const nextDateStr = nextBooking.date instanceof Date ? nextBooking.date.toISOString().split('T')[0] : String(nextBooking.date).split('T')[0];
        const nextTimeStr = String(nextBooking.time).replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');
        const targetDT = new Date(targetDate + 'T' + targetTime + ':00');
        const nextDT   = new Date(nextDateStr  + 'T' + nextTimeStr  + ':00');
        if (targetDT >= nextDT) {
          return res.status(400).json({
            success: false,
            error: `Custom time cannot be at or after the student's next scheduled class (${nextDateStr} at ${nextTimeStr}). Choose an earlier time.`
          });
        }
      }
    }

    /* Clash check: does the tutor have another booking at this exact date+time? */
    const clashRes = await pool.query(
      `SELECT b.id, u.name AS student_name, b.is_demo
       FROM bookings b
       JOIN users u ON u.id = b.student_id
       WHERE b.tutor_id = $1
         AND b.id != $2
         AND ($5 IS NULL OR b.id != $5)
         AND b.status = 'scheduled'
         AND b.date::text = $3
         AND b.time::text LIKE $4`,
      [booking.tutor_id, booking.id, targetDate, targetTime + '%', nextBookingId]
    );
    if (clashRes.rows.length) {
      const clash = clashRes.rows[0];
      const type  = clash.is_demo ? 'Demo' : 'Paid';
      return res.status(409).json({
        success: false,
        error: `Time clash — you already have a ${type} class with ${clash.student_name} at ${targetTime} on ${targetDate}. Please choose a different time.`,
        clash: { date: targetDate, time: targetTime, studentName: clash.student_name, classType: type }
      });
    }

    /* Apply the move */
    const oldDate = booking.date instanceof Date ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
    const oldTime = String(booking.time).replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');
    let notesObj = {};
    try { notesObj = typeof booking.notes === "string" ? JSON.parse(booking.notes || "{}") : (booking.notes || {}); } catch(e) { notesObj = {}; }
    Object.assign(notesObj, { rescheduleReason: reason || ("Moved by " + req.user.role), movedFrom: oldDate + " " + oldTime, movedAt: new Date().toISOString() });

    await pool.query(
      `UPDATE bookings
       SET date = $1::date,
           time = $2::time,
           rescheduled_from = $3::date,
           rescheduled_at = NOW(),
           notes = $5
       WHERE id = $4`,
      [
        targetDate,
        targetTime,
        oldDate,
        booking.id,
        JSON.stringify(notesObj)
      ]
    );

    logger.info(`[MOVE] Booking ${booking.id} moved from ${oldDate} ${oldTime} to ${targetDate} ${targetTime} by ${req.user.email}`);
    res.json({ success: true, booking: { id: booking.id, date: targetDate, time: targetTime } });

  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   GET /api/bookings/:id/next-learning-day
   Returns the next learning day for the student in this booking.
══════════════════════════════════════════════════════ */
router.get('/:id/next-learning-day', requireAuth, requireRole('admin','super_admin','tutor','presales','postsales'), async (req, res, next) => {
  try {
    const bRes = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!bRes.rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
    const booking = bRes.rows[0];

    if (!booking.student_id) {
      return res.status(400).json({ success: false, error: 'Booking has no student' });
    }

    const nextRes = await pool.query(
      `SELECT id, date, time FROM bookings
       WHERE student_id = $1
         AND id != $2
         AND status = 'scheduled'
         AND is_demo = FALSE
         AND (date > $3 OR (date = $3 AND time > $4))
       ORDER BY date ASC, time ASC
       LIMIT 1`,
      [booking.student_id, booking.id, booking.date, booking.time]
    );

    if (!nextRes.rows.length) {
      return res.json({ success: true, nextLearningDay: null, message: 'No next learning day found' });
    }

    const next = nextRes.rows[0];
    const dateStr = next.date instanceof Date ? next.date.toISOString().split('T')[0] : String(next.date).split('T')[0];
    const timeStr = String(next.time).replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');

    res.json({ success: true, nextLearningDay: { date: dateStr, time: timeStr, bookingId: next.id } });
  } catch (err) { next(err); }
});

module.exports = router;