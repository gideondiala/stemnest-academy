/**
 * Student reports — see services/reportService.js
 * POST /api/reports/joined/:bookingId   — student clicked "Join class" (punctuality)
 * POST /api/reports/study               — time on learning resources { source, seconds }
 * GET  /api/reports/mine                — my published reports (student; parent: ?studentId=)
 * GET  /api/reports/student/:studentId  — a student's reports (staff, parent)
 * GET  /api/reports/tutor/pending       — reports waiting for my comments (tutor)
 * GET  /api/reports/:id                 — one report with all its numbers
 * PUT  /api/reports/:id/comments        — tutor ratings, remarks, recommendation
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole } = require('../middleware/auth');
const reports = require('../services/reportService');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pingLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user.id });  // runs after requireAuth

function send(res, next, p) {
  p.then(body => res.json(body)).catch(e => e.status ? res.status(e.status).json({ success: false, error: e.message }) : next(e));
}
function checkId(req, res, name = 'id') {
  if (UUID_RE.test(req.params[name])) return true;
  res.status(404).json({ success: false, error: 'Not found' });
  return false;
}

router.post('/joined/:bookingId', requireAuth, requireRole('student'), (req, res, next) => {
  if (!checkId(req, res, 'bookingId')) return;
  send(res, next, reports.recordJoin(req.user.id, req.params.bookingId).then(r => ({ success: true, ...r })));
});

router.post('/study', requireAuth, requireRole('student'), pingLimiter, (req, res, next) => {
  const { source, seconds } = req.body || {};
  send(res, next, reports.recordStudy(req.user.id, source, seconds).then(() => ({ success: true })));
});

router.get('/mine', requireAuth, requireRole('student', 'parent'), (req, res, next) => {
  const sid = req.user.role === 'student' ? req.user.id : String(req.query.studentId || '');
  if (!UUID_RE.test(sid)) return res.status(400).json({ success: false, error: 'studentId required' });
  send(res, next, reports.listForStudent(req.user, sid).then(list => ({ success: true, reports: list })));
});

router.get('/student/:studentId', requireAuth, requireRole('admin', 'super_admin', 'postsales', 'operations', 'parent'), (req, res, next) => {
  if (!checkId(req, res, 'studentId')) return;
  send(res, next, reports.listForStudent(req.user, req.params.studentId).then(list => ({ success: true, reports: list })));
});

router.get('/tutor/pending', requireAuth, requireRole('tutor'), (req, res, next) => {
  send(res, next, reports.listForTutor(req.user.id).then(list => ({ success: true, reports: list, skills: reports.SKILLS })));
});

router.get('/:id', requireAuth, (req, res, next) => {
  if (!checkId(req, res)) return;
  send(res, next, reports.getReport(req.user, req.params.id).then(report => ({ success: true, report })));
});

router.put('/:id/comments', requireAuth, requireRole('tutor'), (req, res, next) => {
  if (!checkId(req, res)) return;
  send(res, next, reports.submitByTutor(req.user.id, req.params.id, req.body || {}));
});

module.exports = router;
