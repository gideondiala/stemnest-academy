/**
 * Batches routes — Group Classes
 *
 * POST   /api/batches                          — create a batch
 * GET    /api/batches                          — list all batches (admin/postsales)
 * GET    /api/batches/:id                      — get batch detail + members
 * PUT    /api/batches/:id                      — edit batch (schedule/link/teacher)
 * PUT    /api/batches/:id/status               — pause or close a batch
 * POST   /api/batches/:id/members              — add a student to a batch
 * DELETE /api/batches/:id/members/:studentId   — remove a student from a batch
 *
 * NOTE: The end-class report for batch bookings is handled in bookings.js
 * (POST /api/bookings/:id/report) — it already accepts attendees/absentees arrays.
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();

/* ── Helper: generate next batch_ref e.g. BATCH-001 ── */
async function generateBatchRef() {
  /* Use MAX to find the highest existing batch number.
     This ensures numbering continues correctly even after deletions. */
  const result = await pool.query(
    `SELECT batch_ref FROM batches ORDER BY CAST(REPLACE(batch_ref, 'BATCH-', '') AS INTEGER) DESC LIMIT 1`
  );
  if (!result.rows.length) return 'BATCH-001';
  const last = result.rows[0].batch_ref; // e.g. BATCH-004
  const num  = parseInt(last.replace('BATCH-', '')) + 1;
  return 'BATCH-' + String(num).padStart(3, '0');
}

/* ══════════════════════════════════════════════
   POST /api/batches — create a batch
   Body: { tutorId, pathwayId, gradeNumber, classLink,
           schedule: [{weekday,time}], startDate,
           studentIds: [uuid, uuid, uuid], notes? }
══════════════════════════════════════════════ */
router.post('/', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { tutorId, pathwayId, gradeNumber, classLink, schedule, startDate, studentIds, notes } = req.body;

    if (!tutorId)                                   return res.status(400).json({ success: false, error: 'tutorId required' });
    if (!classLink)                                 return res.status(400).json({ success: false, error: 'classLink required' });
    if (!Array.isArray(schedule) || !schedule.length) return res.status(400).json({ success: false, error: 'schedule required' });
    if (!startDate)                                 return res.status(400).json({ success: false, error: 'startDate required' });
    if (!Array.isArray(studentIds) || studentIds.length < 2) return res.status(400).json({ success: false, error: 'At least 2 students required' });
    if (studentIds.length > 3)                      return res.status(400).json({ success: false, error: 'Maximum 3 students per batch' });

    /* Verify tutor */
    const tutorRes = await pool.query('SELECT id, name FROM users WHERE id = $1', [tutorId]);
    if (!tutorRes.rows.length) return res.status(404).json({ success: false, error: 'Tutor not found' });
    const tutorName = tutorRes.rows[0].name;

    /* Generate batch ref */
    const batchRef = await generateBatchRef();

    /* Create batch record */
    const batchResult = await pool.query(
      `INSERT INTO batches (batch_ref, tutor_id, pathway_id, grade_number, class_link, schedule, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [batchRef, tutorId, pathwayId||null, gradeNumber||null,
       classLink, JSON.stringify(schedule), notes||null, req.user.id]
    );
    const batchId = batchResult.rows[0].id;

    /* Add each student as a batch member */
    for (const studentId of studentIds) {
      await pool.query(
        `INSERT INTO batch_members (batch_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [batchId, studentId]
      );
    }

    /* Get pathway lessons if pathwayId + gradeNumber provided */
    let orderedLessons = [];
    if (pathwayId && gradeNumber) {
      const gradeRes = await pool.query(
        `SELECT id FROM pathway_grades WHERE pathway_id = $1 AND grade_number = $2 AND is_active = TRUE LIMIT 1`,
        [pathwayId, parseInt(gradeNumber)]
      );
      if (gradeRes.rows.length) {
        const lessonsRes = await pool.query(
          `SELECT id, lesson_number, title FROM pathway_lessons
           WHERE grade_id = $1 AND is_active = TRUE ORDER BY lesson_number ASC`,
          [gradeRes.rows[0].id]
        );
        orderedLessons = lessonsRes.rows;
      }
    }

    const totalLessons = orderedLessons.length || 72;

    /* Generate 72 booking dates from schedule */
    const newDates = [];
    const start    = new Date(startDate + 'T12:00:00Z');
    const slotStarts = schedule.map(slot => {
      const d = new Date(start);
      const dayDiff = (slot.weekday - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + dayDiff);
      return { ...slot, next: new Date(d) };
    });
    while (newDates.length < totalLessons) {
      slotStarts.sort((a, b) => a.next - b.next);
      const slot = slotStarts[0];
      newDates.push({ date: slot.next.toISOString().split('T')[0], time: slot.time });
      const nextOcc = new Date(slot.next);
      nextOcc.setDate(nextOcc.getDate() + 7);
      slotStarts[0].next = nextOcc;
    }

    /* Create one booking per lesson — student_id NULL (batch owns it) */
    const createdIds = [];
    for (let i = 0; i < newDates.length; i++) {
      const nd      = newDates[i];
      const lesson  = orderedLessons[i] || null;
      const lessonNum = lesson ? lesson.lesson_number : (i + 1);
      const r = await pool.query(
        `INSERT INTO bookings
           (subject, grade, date, time, class_link, status, is_demo,
            tutor_id, student_id, batch_id, lesson_name, notes,
            booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade)
         VALUES ($1,$2,$3::date,$4::time,$5,'scheduled',FALSE,
                 $6,NULL,$7,$8,$9,NOW(),NOW(),$10,$11)
         RETURNING id`,
        [
          'Coding',
          gradeNumber ? `Grade ${gradeNumber}` : 'Group',
          nd.date,
          nd.time.substring(0, 5),
          classLink,
          tutorId,
          batchId,
          lesson ? lesson.title : `Lesson ${lessonNum}`,
          JSON.stringify({ batchRef, tutorName, classLink, isBatchClass: true }),
          lesson ? lesson.id : null,
          lessonNum,
        ]
      );
      createdIds.push(r.rows[0].id);
    }

    logger.info(`[BATCH] Created ${batchRef} with ${studentIds.length} students, ${createdIds.length} bookings`);
    res.status(201).json({ success: true, batchId, batchRef, bookingsCreated: createdIds.length });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/batches — list all batches
══════════════════════════════════════════════ */
router.get('/', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id, b.batch_ref AS "batchRef", b.status, b.class_link AS "classLink",
        b.grade_number AS "gradeNumber", b.schedule, b.created_at AS "createdAt",
        u_t.name   AS "tutorName",   u_t.id AS "tutorId",
        p.name     AS "pathwayName",
        (SELECT COUNT(*) FROM batch_members WHERE batch_id = b.id AND status = 'active') AS "memberCount",
        (SELECT MIN(date) FROM bookings WHERE batch_id = b.id AND status = 'scheduled' AND date >= CURRENT_DATE) AS "nextClassDate"
      FROM batches b
      LEFT JOIN users u_t ON u_t.id = b.tutor_id
      LEFT JOIN pathways p ON p.id  = b.pathway_id
      ORDER BY b.created_at DESC
    `);
    res.json({ success: true, batches: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/batches/:id — batch detail + members
══════════════════════════════════════════════ */
router.get('/:id', requireAuth, requireRole('admin','super_admin','postsales','tutor'), async (req, res, next) => {
  try {
    const batchRes = await pool.query(`
      SELECT b.*, u_t.name AS "tutorName", p.name AS "pathwayName"
      FROM batches b
      LEFT JOIN users u_t ON u_t.id = b.tutor_id
      LEFT JOIN pathways p ON p.id = b.pathway_id
      WHERE b.id = $1`, [req.params.id]
    );
    if (!batchRes.rows.length) return res.status(404).json({ success: false, error: 'Batch not found' });

    const membersRes = await pool.query(`
      SELECT bm.id, bm.status, bm.joined_at AS "joinedAt", bm.removal_reason AS "removalReason",
             u.id AS "studentId", u.name AS "studentName", u.email,
             sp.credits, sp.credits_suspended AS "creditsSuspended", sp.grade
      FROM batch_members bm
      JOIN users u ON u.id = bm.student_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE bm.batch_id = $1
      ORDER BY bm.joined_at ASC`, [req.params.id]
    );

    const upcomingRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM bookings
       WHERE batch_id = $1 AND status = 'scheduled' AND date >= CURRENT_DATE`,
      [req.params.id]
    );

    res.json({
      success: true,
      batch:   batchRes.rows[0],
      members: membersRes.rows,
      remainingClasses: parseInt(upcomingRes.rows[0].cnt),
    });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   PUT /api/batches/:id — edit schedule/link/teacher
   Body: { classLink?, schedule?, tutorId? }
══════════════════════════════════════════════ */
router.put('/:id', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { classLink, schedule, tutorId } = req.body;
    const fields = [], values = [];
    let i = 1;
    if (classLink !== undefined) { fields.push(`class_link = $${i++}`);  values.push(classLink); }
    if (schedule  !== undefined) { fields.push(`schedule = $${i++}`);    values.push(JSON.stringify(schedule)); }
    if (tutorId   !== undefined) { fields.push(`tutor_id = $${i++}`);    values.push(tutorId); }
    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });
    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);
    await pool.query(`UPDATE batches SET ${fields.join(', ')} WHERE id = $${i}`, values);
    logger.info(`[BATCH] ${req.params.id} updated by ${req.user.email}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   PUT /api/batches/:id/status — pause or close
   Body: { status: 'paused'|'closed' }
══════════════════════════════════════════════ */
router.put('/:id/status', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active','paused','closed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    await pool.query(
      `UPDATE batches SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, req.params.id]
    );
    /* If closing, cancel all future batch bookings */
    if (status === 'closed') {
      const result = await pool.query(
        `UPDATE bookings SET status = 'cancelled'
         WHERE batch_id = $1 AND status = 'scheduled' AND date >= CURRENT_DATE
         RETURNING id`,
        [req.params.id]
      );
      logger.info(`[BATCH] ${req.params.id} closed. ${result.rows.length} future bookings cancelled.`);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   POST /api/batches/:id/members — add a student
   Body: { studentId }
══════════════════════════════════════════════ */
router.post('/:id/members', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ success: false, error: 'studentId required' });

    /* Check batch exists and is active */
    const batchRes = await pool.query('SELECT * FROM batches WHERE id = $1', [req.params.id]);
    if (!batchRes.rows.length) return res.status(404).json({ success: false, error: 'Batch not found' });
    if (batchRes.rows[0].status !== 'active') return res.status(400).json({ success: false, error: 'Batch is not active' });

    /* Check not already a member */
    const existing = await pool.query(
      `SELECT id FROM batch_members WHERE batch_id = $1 AND student_id = $2 AND status = 'active'`,
      [req.params.id, studentId]
    );
    if (existing.rows.length) return res.status(400).json({ success: false, error: 'Student is already in this batch' });

    /* Check max 3 members */
    const countRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM batch_members WHERE batch_id = $1 AND status = 'active'`,
      [req.params.id]
    );
    if (parseInt(countRes.rows[0].cnt) >= 3) {
      return res.status(400).json({ success: false, error: 'Batch already has 3 active members (maximum)' });
    }

    /* Add member */
    await pool.query(
      `INSERT INTO batch_members (batch_id, student_id)
       VALUES ($1, $2)
       ON CONFLICT (batch_id, student_id)
       DO UPDATE SET status = 'active', removed_at = NULL, removal_reason = NULL`,
      [req.params.id, studentId]
    );

    const stuRes = await pool.query('SELECT name FROM users WHERE id = $1', [studentId]);
    const studentName = stuRes.rows[0]?.name || studentId;

    logger.info(`[BATCH] Student ${studentName} added to batch ${batchRes.rows[0].batch_ref}`);
    res.json({ success: true, message: `${studentName} added to batch` });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   DELETE /api/batches/:id/members/:studentId
   Body: { reason }
══════════════════════════════════════════════ */
router.delete('/:id/members/:studentId', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'A removal reason is required' });
    }

    const result = await pool.query(
      `UPDATE batch_members
       SET status = 'removed', removed_at = NOW(), removal_reason = $3
       WHERE batch_id = $1 AND student_id = $2 AND status = 'active'
       RETURNING id`,
      [req.params.id, req.params.studentId, reason.trim()]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Member not found in this batch' });
    }

    const stuRes = await pool.query('SELECT name FROM users WHERE id = $1', [req.params.studentId]);
    const studentName = stuRes.rows[0]?.name || req.params.studentId;

    logger.info(`[BATCH] Student ${studentName} removed from batch ${req.params.id}. Reason: ${reason}`);
    res.json({ success: true, message: `${studentName} removed from batch` });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   PUT /api/batches/:id/reschedule
   Reschedules all future bookings for a batch.
   - Runs clash detection on new schedule
   - Cancels all future batch bookings from startDate
   - Regenerates bookings on new schedule preserving lesson sequence
   - Updates batch record with new schedule
   Body: { startDate, schedule: [{weekday,time}], classLink? }
══════════════════════════════════════════════ */
router.put('/:id/reschedule', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { startDate, schedule, classLink, newTutorId } = req.body;

    if (!startDate)                                     return res.status(400).json({ success: false, error: 'startDate required' });
    if (!Array.isArray(schedule) || !schedule.length)   return res.status(400).json({ success: false, error: 'schedule required (array of {weekday,time})' });

    /* Get batch */
    const batchRes = await pool.query(
      `SELECT b.*, u_t.name AS tutor_name FROM batches b LEFT JOIN users u_t ON u_t.id = b.tutor_id WHERE b.id = $1`,
      [req.params.id]
    );
    if (!batchRes.rows.length) return res.status(404).json({ success: false, error: 'Batch not found' });
    const batch = batchRes.rows[0];
    if (batch.status === 'closed')   return res.status(400).json({ success: false, error: 'Batch is closed and cannot be rescheduled' });

    /* If newTutorId provided, use the new tutor; otherwise keep existing */
    let tutorId   = batch.tutor_id;
    let tutorName = batch.tutor_name;
    if (newTutorId && newTutorId !== batch.tutor_id) {
      const newTutorRes = await pool.query('SELECT id, name FROM users WHERE id = $1 AND role = $2', [newTutorId, 'tutor']);
      if (!newTutorRes.rows.length) return res.status(404).json({ success: false, error: 'New tutor not found' });
      tutorId   = newTutorRes.rows[0].id;
      tutorName = newTutorRes.rows[0].name;
    }
    const resolvedLink = classLink || batch.class_link || '';

    /* ── Clash detection: check new schedule against tutor's other bookings ──
       Exclude this batch's own bookings from the check (they will be cancelled) */
    for (const slot of schedule) {
      const start = new Date(startDate + 'T12:00:00Z');
      const dayDiff = (slot.weekday - start.getDay() + 7) % 7;
      start.setDate(start.getDate() + dayDiff);

      /* Check first 4 occurrences of each slot */
      for (let w = 0; w < 4; w++) {
        const d = new Date(start);
        d.setDate(d.getDate() + w * 7);
        const dateStr  = d.toISOString().split('T')[0];
        const timeNorm = slot.time.substring(0, 5);

        const clash = await pool.query(
          `SELECT b.date, b.time, u_s.name AS student_name
           FROM bookings b
           LEFT JOIN users u_s ON u_s.id = b.student_id
           WHERE b.tutor_id = $1
             AND b.status = 'scheduled'
             AND b.date = $2::date
             AND b.time = $3::time
             AND (b.batch_id IS NULL OR b.batch_id != $4::uuid)
           LIMIT 1`,
          [tutorId, dateStr, timeNorm, req.params.id]
        );

        if (clash.rows.length) {
          const c = clash.rows[0];
          const fd = new Date(c.date).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
          return res.status(409).json({
            success: false,
            error: `Schedule clash: ${fd} at ${timeNorm} is already booked for ${c.student_name || 'another student'} with this tutor. Please choose a different time.`,
            clash: { date: dateStr, time: timeNorm, studentName: c.student_name },
          });
        }
      }
    }

    /* ── Get future batch bookings ordered by date to preserve lesson sequence ── */
    const existingRes = await pool.query(
      `SELECT id, pathway_lesson_id, lesson_number_in_grade, lesson_name, grade
       FROM bookings
       WHERE batch_id = $1 AND status = 'scheduled' AND date >= $2::date
       ORDER BY date ASC, time ASC`,
      [req.params.id, startDate]
    );
    const existingBookings = existingRes.rows;

    if (!existingBookings.length) {
      return res.status(404).json({ success: false, error: 'No future scheduled bookings found for this batch from the given start date' });
    }

    const totalToReschedule = existingBookings.length;

    /* ── Generate new dates from the new schedule ── */
    const newDates = [];
    const start    = new Date(startDate + 'T12:00:00Z');
    const slotStarts = schedule.map(slot => {
      const d = new Date(start);
      const dayDiff = (slot.weekday - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + dayDiff);
      return { ...slot, next: new Date(d) };
    });

    while (newDates.length < totalToReschedule) {
      slotStarts.sort((a, b) => a.next - b.next);
      const slot = slotStarts[0];
      newDates.push({ date: slot.next.toISOString().split('T')[0], time: slot.time });
      const nextOcc = new Date(slot.next);
      nextOcc.setDate(nextOcc.getDate() + 7);
      slotStarts[0].next = nextOcc;
    }

    /* ── Cancel existing future batch bookings ── */
    await pool.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE batch_id = $1 AND status = 'scheduled' AND date >= $2::date`,
      [req.params.id, startDate]
    );

    /* ── Create new bookings preserving lesson sequence ── */
    const createdIds = [];
    for (let i = 0; i < newDates.length; i++) {
      const nd  = newDates[i];
      const old = existingBookings[i];

      const r = await pool.query(
        `INSERT INTO bookings
           (subject, grade, date, time, class_link, status, is_demo,
            tutor_id, student_id, batch_id, lesson_name, notes,
            booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade)
         VALUES ($1,$2,$3::date,$4::time,$5,'scheduled',FALSE,
                 $6,NULL,$7,$8,$9,NOW(),NOW(),$10,$11)
         RETURNING id`,
        [
          'Coding',
          old.grade || (batch.grade_number ? `Grade ${batch.grade_number}` : 'Group'),
          nd.date,
          nd.time.substring(0, 5),
          resolvedLink,
          tutorId,
          req.params.id,
          old.lesson_name || `Lesson ${old.lesson_number_in_grade || (i + 1)}`,
          JSON.stringify({
            batchRef:   batch.batch_ref,
            tutorName,
            classLink:  resolvedLink,
            isBatchClass: true,
            rescheduled:  true,
            rescheduledAt: new Date().toISOString(),
          }),
          old.pathway_lesson_id || null,
          old.lesson_number_in_grade || (i + 1),
        ]
      );
      createdIds.push(r.rows[0].id);
    }

    /* ── Update batch record with new schedule and class link ── */
    await pool.query(
      `UPDATE batches SET schedule = $1, class_link = $2, tutor_id = $3, updated_at = NOW() WHERE id = $4`,
      [JSON.stringify(schedule), resolvedLink, tutorId, req.params.id]
    );

    logger.info(`[BATCH RESCHEDULE] ${batch.batch_ref}: cancelled ${totalToReschedule}, created ${createdIds.length} from ${startDate}`);

    res.json({
      success: true,
      batchRef: batch.batch_ref,
      cancelled: totalToReschedule,
      created: createdIds.length,
      newSchedule: schedule,
    });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   DELETE /api/batches/:id
   Deletes a batch and all its future scheduled bookings.
   Past/completed bookings are kept for records.
   Batch numbering continues from highest remaining number.
══════════════════════════════════════════════ */
router.delete('/:id', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    /* Verify batch exists */
    const batchRes = await pool.query('SELECT id, batch_ref FROM batches WHERE id = $1', [req.params.id]);
    if (!batchRes.rows.length) return res.status(404).json({ success: false, error: 'Batch not found' });
    const batch = batchRes.rows[0];

    /* Cancel all future scheduled bookings for this batch */
    const cancelRes = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE batch_id = $1 AND status = 'scheduled' AND date >= CURRENT_DATE
       RETURNING id`,
      [req.params.id]
    );

    /* Null out batch_id on past/completed bookings so the FK constraint
       does not block deleting the batch record */
    await pool.query(
      `UPDATE bookings SET batch_id = NULL
       WHERE batch_id = $1`,
      [req.params.id]
    );

    /* Remove batch members */
    await pool.query('DELETE FROM batch_members WHERE batch_id = $1', [req.params.id]);

    /* Delete the batch record */
    await pool.query('DELETE FROM batches WHERE id = $1', [req.params.id]);

    logger.info(`[BATCH DELETE] ${batch.batch_ref} deleted by ${req.user.email}. ${cancelRes.rows.length} future bookings cancelled.`);

    res.json({
      success: true,
      message: `Batch ${batch.batch_ref} deleted successfully`,
      cancelledBookings: cancelRes.rows.length,
    });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   POST /api/batches/:id/transfer-member
   Move a student from this batch to another batch.

   Mode 1 — move to existing batch:
     Body: { studentId, targetBatchId }
     The student inherits the target batch's tutor/schedule/link.

   Mode 2 — move to a NEW batch (created inline):
     Body: { studentId, newBatch: { tutorId, classLink, schedule,
             startDate, pathwayId?, gradeNumber?, notes? } }
     Creates the new batch (single student is allowed here), transfers student.

   In both modes:
   - Student is soft-removed from source batch (status='transferred')
   - Student is added to target batch
   - Remaining future bookings from source batch are cancelled
   - New bookings are generated on the target schedule
══════════════════════════════════════════════ */
router.post('/:id/transfer-member', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { studentId, targetBatchId, newBatch } = req.body;
    if (!studentId) return res.status(400).json({ success: false, error: 'studentId required' });
    if (!targetBatchId && !newBatch) return res.status(400).json({ success: false, error: 'targetBatchId or newBatch required' });

    /* ── Verify student is active member of source batch ── */
    const memberRes = await client.query(
      `SELECT bm.id FROM batch_members bm
       WHERE bm.batch_id = $1 AND bm.student_id = $2 AND bm.status = 'active'`,
      [req.params.id, studentId]
    );
    if (!memberRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Student is not an active member of this batch' });
    }

    const stuRes = await client.query('SELECT name FROM users WHERE id = $1', [studentId]);
    const studentName = stuRes.rows[0]?.name || studentId;

    /* ── Resolve target batch ── */
    let destBatchId, destBatchRef, destTutorId, destTutorName, destClassLink, destSchedule;

    if (targetBatchId) {
      /* Mode 1: existing batch */
      const destRes = await client.query(
        `SELECT b.id, b.batch_ref, b.tutor_id, b.class_link, b.schedule, b.status,
                u.name AS tutor_name
         FROM batches b LEFT JOIN users u ON u.id = b.tutor_id
         WHERE b.id = $1`,
        [targetBatchId]
      );
      if (!destRes.rows.length) return res.status(404).json({ success: false, error: 'Target batch not found' });
      const dest = destRes.rows[0];
      if (dest.status === 'closed') return res.status(400).json({ success: false, error: 'Target batch is closed' });

      /* Check target has room */
      const countRes = await client.query(
        `SELECT COUNT(*) AS cnt FROM batch_members WHERE batch_id = $1 AND status = 'active'`,
        [targetBatchId]
      );
      if (parseInt(countRes.rows[0].cnt) >= 3) {
        return res.status(400).json({ success: false, error: 'Target batch is full (max 3 students)' });
      }

      destBatchId   = dest.id;
      destBatchRef  = dest.batch_ref;
      destTutorId   = dest.tutor_id;
      destTutorName = dest.tutor_name;
      destClassLink = dest.class_link;
      destSchedule  = Array.isArray(dest.schedule) ? dest.schedule : JSON.parse(dest.schedule || '[]');
    } else {
      /* Mode 2: create a new batch inline */
      const { tutorId, classLink, schedule, startDate, pathwayId, gradeNumber, notes } = newBatch;
      if (!tutorId)                                      return res.status(400).json({ success: false, error: 'newBatch.tutorId required' });
      if (!classLink)                                    return res.status(400).json({ success: false, error: 'newBatch.classLink required' });
      if (!Array.isArray(schedule) || !schedule.length)  return res.status(400).json({ success: false, error: 'newBatch.schedule required' });
      if (!startDate)                                    return res.status(400).json({ success: false, error: 'newBatch.startDate required' });

      const newTutorRes = await client.query('SELECT id, name FROM users WHERE id = $1', [tutorId]);
      if (!newTutorRes.rows.length) return res.status(404).json({ success: false, error: 'New tutor not found' });

      const batchRef = await generateBatchRef();
      const batchResult = await client.query(
        `INSERT INTO batches (batch_ref, tutor_id, pathway_id, grade_number, class_link, schedule, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [batchRef, tutorId, pathwayId || null, gradeNumber || null,
         classLink, JSON.stringify(schedule), notes || null, req.user.id]
      );

      destBatchId   = batchResult.rows[0].id;
      destBatchRef  = batchRef;
      destTutorId   = tutorId;
      destTutorName = newTutorRes.rows[0].name;
      destClassLink = classLink;
      destSchedule  = schedule;
    }

    /* ── Get source batch info ── */
    const srcRes = await client.query(
      `SELECT batch_ref, grade_number, pathway_id FROM batches WHERE id = $1`,
      [req.params.id]
    );
    const srcBatch = srcRes.rows[0];

    /* ── Count completed classes for this student in source batch
          (to preserve lesson continuation) ── */
    const completedRes = await client.query(
      `SELECT COUNT(*) AS cnt FROM bookings
       WHERE batch_id = $1
         AND status IN ('completed','partially_completed')
         AND (
           student_id = $2
           OR id IN (
             SELECT booking_id FROM booking_attendance WHERE student_id = $2 AND present = true
           )
         )`,
      [req.params.id, studentId]
    );
    const lessonsCompleted = parseInt(completedRes.rows[0].cnt) || 0;

    /* ── Cancel remaining future bookings for this student in source batch ── */
    const cancelRes = await client.query(
      `UPDATE bookings
       SET status = 'cancelled'
       WHERE batch_id = $1
         AND status = 'scheduled'
         AND date >= CURRENT_DATE
       RETURNING id, lesson_name, lesson_number_in_grade, pathway_lesson_id, grade`,
      [req.params.id]
    );
    const cancelledBookings = cancelRes.rows;

    /* ── Soft-remove student from source batch ── */
    await client.query(
      `UPDATE batch_members SET status = 'transferred', removed_at = NOW(),
       removal_reason = $3
       WHERE batch_id = $1 AND student_id = $2 AND status = 'active'`,
      [req.params.id, studentId, `Transferred to ${destBatchRef} by ${req.user.email}`]
    );

    /* ── Add student to destination batch ── */
    await client.query(
      `INSERT INTO batch_members (batch_id, student_id)
       VALUES ($1, $2)
       ON CONFLICT (batch_id, student_id)
       DO UPDATE SET status = 'active', removed_at = NULL, removal_reason = NULL`,
      [destBatchId, studentId]
    );

    /* ── Generate new bookings for student on destination schedule ──
       Use the cancelled bookings' lesson data to preserve sequence.
       If no cancelled bookings exist (batch was already finished), generate fresh. */
    const lessonsToSchedule = cancelledBookings.length || 0;
    let createdCount = 0;

    if (lessonsToSchedule > 0) {
      /* Generate dates from destination schedule */
      const startDateStr = new Date().toISOString().split('T')[0]; // from today
      const newDates = [];
      const start = new Date(startDateStr + 'T12:00:00Z');
      const slotStarts = destSchedule.map(slot => {
        const d = new Date(start);
        const dayDiff = (slot.weekday - d.getDay() + 7) % 7 || 7; // always go to next occurrence
        d.setDate(d.getDate() + dayDiff);
        return { ...slot, next: new Date(d) };
      });

      while (newDates.length < lessonsToSchedule) {
        slotStarts.sort((a, b) => a.next - b.next);
        const slot = slotStarts[0];
        newDates.push({ date: slot.next.toISOString().split('T')[0], time: slot.time });
        const nextOcc = new Date(slot.next);
        nextOcc.setDate(nextOcc.getDate() + 7);
        slotStarts[0].next = nextOcc;
      }

      for (let i = 0; i < cancelledBookings.length; i++) {
        const nd  = newDates[i];
        const old = cancelledBookings[i];
        await client.query(
          `INSERT INTO bookings
             (subject, grade, date, time, class_link, status, is_demo,
              tutor_id, student_id, batch_id, lesson_name, notes,
              booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade)
           VALUES ($1,$2,$3::date,$4::time,$5,'scheduled',FALSE,
                   $6,$7,$8,$9,$10,NOW(),NOW(),$11,$12)`,
          [
            'Coding',
            old.grade || (srcBatch.grade_number ? `Grade ${srcBatch.grade_number}` : 'Group'),
            nd.date,
            nd.time.substring(0, 5),
            destClassLink,
            destTutorId,
            studentId,
            destBatchId,
            old.lesson_name || `Lesson ${old.lesson_number_in_grade || (lessonsCompleted + i + 1)}`,
            JSON.stringify({
              batchRef: destBatchRef, tutorName: destTutorName,
              classLink: destClassLink, isBatchClass: true,
              transferredFrom: srcBatch.batch_ref,
              transferredAt: new Date().toISOString(),
            }),
            old.pathway_lesson_id || null,
            old.lesson_number_in_grade || (lessonsCompleted + i + 1),
          ]
        );
        createdCount++;
      }
    }

    await client.query('COMMIT');
    logger.info(`[BATCH TRANSFER] ${studentName} transferred from ${srcBatch.batch_ref} to ${destBatchRef} by ${req.user.email}. ${cancelledBookings.length} cancelled, ${createdCount} created.`);

    res.json({
      success: true,
      message: `${studentName} transferred from ${srcBatch.batch_ref} to ${destBatchRef}`,
      studentName,
      sourceBatch:  srcBatch.batch_ref,
      destBatch:    destBatchRef,
      destBatchId,
      cancelled:    cancelledBookings.length,
      created:      createdCount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/* ══════════════════════════════════════════════
   POST /api/batches/:id/transfer-member
   Move a student from this batch to another batch.

   Mode 1 - move to existing batch:
     Body: { studentId, targetBatchId }

   Mode 2 - move to a NEW batch (created inline):
     Body: { studentId, newBatch: { tutorId, classLink, schedule, startDate,
             pathwayId?, gradeNumber?, notes? } }

   In both modes:
   - Student is soft-removed from source (status='transferred')
   - Student is added to destination batch
   - Future bookings on source are cancelled
   - New bookings generated on destination schedule
   All in a single DB transaction.
============================================== */
router.post('/:id/transfer-member', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { studentId, targetBatchId, newBatch } = req.body;
    if (!studentId) return res.status(400).json({ success: false, error: 'studentId required' });
    if (!targetBatchId && !newBatch) return res.status(400).json({ success: false, error: 'targetBatchId or newBatch required' });

    /* Verify student is active in source batch */
    const memberRes = await client.query(
      'SELECT id FROM batch_members WHERE batch_id = $1 AND student_id = $2 AND status = $$active$$',
      [req.params.id, studentId]
    );
    if (!memberRes.rows.length)
      return res.status(404).json({ success: false, error: 'Student is not an active member of this batch' });

    const stuRes = await client.query('SELECT name FROM users WHERE id = $1', [studentId]);
    const studentName = stuRes.rows[0] ? stuRes.rows[0].name : studentId;

    /* Resolve destination batch */
    var destBatchId, destBatchRef, destTutorId, destTutorName, destClassLink, destSchedule;

    if (targetBatchId) {
      const destRes = await client.query(
        'SELECT b.id, b.batch_ref, b.tutor_id, b.class_link, b.schedule, b.status, u.name AS tutor_name FROM batches b LEFT JOIN users u ON u.id = b.tutor_id WHERE b.id = $1',
        [targetBatchId]
      );
      if (!destRes.rows.length) return res.status(404).json({ success: false, error: 'Target batch not found' });
      const dest = destRes.rows[0];
      if (dest.status === 'closed') return res.status(400).json({ success: false, error: 'Target batch is closed' });

      const countRes = await client.query(
        'SELECT COUNT(*) AS cnt FROM batch_members WHERE batch_id = $1 AND status = $$active$$',
        [targetBatchId]
      );
      if (parseInt(countRes.rows[0].cnt) >= 3)
        return res.status(400).json({ success: false, error: 'Target batch is full (max 3 students)' });

      destBatchId   = dest.id;
      destBatchRef  = dest.batch_ref;
      destTutorId   = dest.tutor_id;
      destTutorName = dest.tutor_name;
      destClassLink = dest.class_link;
      destSchedule  = Array.isArray(dest.schedule) ? dest.schedule : JSON.parse(dest.schedule || '[]');
    } else {
      const nb = newBatch;
      if (!nb.tutorId)                                 return res.status(400).json({ success: false, error: 'newBatch.tutorId required' });
      if (!nb.classLink)                               return res.status(400).json({ success: false, error: 'newBatch.classLink required' });
      if (!Array.isArray(nb.schedule) || !nb.schedule.length) return res.status(400).json({ success: false, error: 'newBatch.schedule required' });
      if (!nb.startDate)                               return res.status(400).json({ success: false, error: 'newBatch.startDate required' });

      const newTutorRes = await client.query('SELECT id, name FROM users WHERE id = $1', [nb.tutorId]);
      if (!newTutorRes.rows.length) return res.status(404).json({ success: false, error: 'Tutor not found' });

      const batchRef = await generateBatchRef();
      const batchResult = await client.query(
        'INSERT INTO batches (batch_ref, tutor_id, pathway_id, grade_number, class_link, schedule, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [batchRef, nb.tutorId, nb.pathwayId || null, nb.gradeNumber || null, nb.classLink, JSON.stringify(nb.schedule), nb.notes || null, req.user.id]
      );

      destBatchId   = batchResult.rows[0].id;
      destBatchRef  = batchRef;
      destTutorId   = nb.tutorId;
      destTutorName = newTutorRes.rows[0].name;
      destClassLink = nb.classLink;
      destSchedule  = nb.schedule;
    }

    /* Source batch info */
    const srcRes = await client.query('SELECT batch_ref, grade_number FROM batches WHERE id = $1', [req.params.id]);
    const srcBatch = srcRes.rows[0];

    /* Cancel remaining future batch bookings */
    const cancelRes = await client.query(
      'UPDATE bookings SET status = $$cancelled$$ WHERE batch_id = $1 AND status = $$scheduled$$ AND date >= CURRENT_DATE RETURNING id, lesson_name, lesson_number_in_grade, pathway_lesson_id, grade',
      [req.params.id]
    );
    const cancelledBookings = cancelRes.rows;

    /* Soft-remove from source batch */
    await client.query(
      'UPDATE batch_members SET status = $$transferred$$, removed_at = NOW(), removal_reason = $3 WHERE batch_id = $1 AND student_id = $2 AND status = $$active$$',
      [req.params.id, studentId, 'Transferred to ' + destBatchRef + ' by ' + req.user.email]
    );

    /* Add to destination batch */
    await client.query(
      'INSERT INTO batch_members (batch_id, student_id) VALUES ($1, $2) ON CONFLICT (batch_id, student_id) DO UPDATE SET status = $$active$$, removed_at = NULL, removal_reason = NULL',
      [destBatchId, studentId]
    );

    /* Generate new bookings on destination schedule */
    var createdCount = 0;
    if (cancelledBookings.length > 0) {
      const startStr = new Date().toISOString().split('T')[0];
      const newDates = [];
      const startD = new Date(startStr + 'T12:00:00Z');
      const slots = destSchedule.map(function(slot) {
        const d = new Date(startD);
        var diff = (slot.weekday - d.getDay() + 7) % 7;
        if (diff === 0) diff = 7; /* always at least 1 day ahead */
        d.setDate(d.getDate() + diff);
        return Object.assign({}, slot, { next: new Date(d) });
      });
      while (newDates.length < cancelledBookings.length) {
        slots.sort(function(a, b) { return a.next - b.next; });
        newDates.push({ date: slots[0].next.toISOString().split('T')[0], time: slots[0].time });
        var n = new Date(slots[0].next);
        n.setDate(n.getDate() + 7);
        slots[0].next = n;
      }
      for (var i = 0; i < cancelledBookings.length; i++) {
        var nd  = newDates[i];
        var old = cancelledBookings[i];
        await client.query(
          'INSERT INTO bookings (subject, grade, date, time, class_link, status, is_demo, tutor_id, student_id, batch_id, lesson_name, notes, booked_at, scheduled_at, pathway_lesson_id, lesson_number_in_grade) VALUES ($1,$2,$3::date,$4::time,$5,$$scheduled$$,FALSE,$6,$7,$8,$9,$10,NOW(),NOW(),$11,$12)',
          [
            'Coding',
            old.grade || (srcBatch.grade_number ? 'Grade ' + srcBatch.grade_number : 'Group'),
            nd.date, nd.time.substring(0, 5), destClassLink,
            destTutorId, studentId, destBatchId,
            old.lesson_name || ('Lesson ' + (old.lesson_number_in_grade || (i + 1))),
            JSON.stringify({ batchRef: destBatchRef, tutorName: destTutorName, classLink: destClassLink, isBatchClass: true, transferredFrom: srcBatch.batch_ref }),
            old.pathway_lesson_id || null,
            old.lesson_number_in_grade || (i + 1),
          ]
        );
        createdCount++;
      }
    }

    await client.query('COMMIT');
    logger.info('[BATCH TRANSFER] ' + studentName + ' transferred from ' + srcBatch.batch_ref + ' to ' + destBatchRef + ' by ' + req.user.email + '. Cancelled: ' + cancelledBookings.length + ', Created: ' + createdCount);

    res.json({
      success: true,
      message: studentName + ' transferred to ' + destBatchRef,
      studentName, sourceBatch: srcBatch.batch_ref, destBatch: destBatchRef, destBatchId,
      cancelled: cancelledBookings.length, created: createdCount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});
module.exports = router;
