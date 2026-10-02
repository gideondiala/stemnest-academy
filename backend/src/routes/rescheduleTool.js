/**
 * Reschedule tool (Post-Sales / admin)
 *
 * GET  /api/reschedule-tool/students?q=      — find a student by ID, name, email, parent email or phone
 * GET  /api/reschedule-tool/students/:id     — details, courses with their current schedule, history
 * POST /api/reschedule-tool/preview          — the new classes and any clashes (nothing is changed)
 * POST /api/reschedule-tool/apply            — move the course onto the new schedule
 *
 * Body for preview/apply: { studentId, courseKey, startDate, schedule: [{weekday, time}],
 *   tutorId?, classLink?, topUp?, requestedBy, reason }  — times are WAT.
 */

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/rescheduleToolService');

const router = express.Router();
router.use(requireAuth, requireRole('postsales', 'admin', 'super_admin'));

function fail(res, next, err) {
  if (err.status) return res.status(err.status).json({ success: false, error: err.message, ...(err.extra || {}) });
  next(err);
}

router.get('/students', async (req, res, next) => {
  try { res.json({ success: true, students: await svc.searchStudents(req.query.q) }); }
  catch (err) { fail(res, next, err); }
});

router.get('/students/:id', async (req, res, next) => {
  try { res.json({ success: true, ...(await svc.studentDetails(req.params.id)) }); }
  catch (err) { fail(res, next, err); }
});

router.post('/preview', async (req, res, next) => {
  try {
    const plan = await svc.buildPlan(require('../config/db'), req.body || {});
    res.json(svc.planForClient(plan));
  } catch (err) { fail(res, next, err); }
});

router.post('/apply', async (req, res, next) => {
  try { res.json(await svc.applyReschedule(req.body || {}, req.user)); }
  catch (err) { fail(res, next, err); }
});

module.exports = router;
