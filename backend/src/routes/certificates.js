/**
 * StemNest Academy — Certificates Routes
 *
 * GET  /api/certificates/mine         — student gets their own certificates
 * GET  /api/certificates/:id          — get certificate by ID
 * POST /api/certificates/award        — admin/postsales awards a certificate
 * GET  /api/certificates              — admin lists all certificates
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();

/* ══════════════════════════════════════════════════════
   GET /api/certificates/mine
   Student gets their own certificates
══════════════════════════════════════════════════════ */
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS student_name
       FROM certificates c
       JOIN users u ON u.id = c.student_id
       WHERE c.student_id = $1
       ORDER BY c.issued_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, certificates: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   GET /api/certificates
   Admin lists all certificates
══════════════════════════════════════════════════════ */
router.get('/', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS student_name, u.email AS student_email, u.staff_id
       FROM certificates c
       JOIN users u ON u.id = c.student_id
       ORDER BY c.issued_at DESC
       LIMIT 500`
    );
    res.json({ success: true, certificates: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   GET /api/certificates/:id
   Get a single certificate (public — for sharing/printing)
══════════════════════════════════════════════════════ */
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS student_name, u.staff_id
       FROM certificates c
       JOIN users u ON u.id = c.student_id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Certificate not found' });
    }
    res.json({ success: true, certificate: result.rows[0] });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   POST /api/certificates/award
   Admin or postsales awards a certificate manually,
   or system calls this automatically on grade completion.
══════════════════════════════════════════════════════ */
router.post('/award', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { student_id, enrolment_id, pathway_id, pathway_name, grade_number, grade_name } = req.body;

    if (!student_id || !pathway_id || grade_number === undefined) {
      return res.status(400).json({ success: false, error: 'student_id, pathway_id and grade_number required' });
    }

    /* Check it doesn't already exist */
    const existing = await pool.query(
      'SELECT id FROM certificates WHERE student_id = $1 AND pathway_id = $2 AND grade_number = $3',
      [student_id, pathway_id, grade_number]
    );
    if (existing.rows.length) {
      return res.json({ success: true, certificate: existing.rows[0], alreadyExists: true });
    }

    const result = await pool.query(
      `INSERT INTO certificates
         (student_id, enrolment_id, pathway_id, pathway_name, grade_number, grade_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [student_id, enrolment_id || null, pathway_id, pathway_name || null,
       grade_number, grade_name || `Grade ${grade_number}`]
    );

    const cert = result.rows[0];

    /* Send certificate email notification */
    try {
      const emailSvc = require('../services/emailService');
      const userResult = await pool.query(
        `SELECT u.name, u.email, sp.parent_email, sp.parent_name
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1`,
        [student_id]
      );
      const student = userResult.rows[0];
      if (student) {
        const recipientEmail = student.parent_email || student.email;
        const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
        await emailSvc.sendEmail({
          to:      recipientEmail,
          subject: `🎓 ${student.name} has earned a StemNest Certificate!`,
          html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f6fb;margin:0;padding:0;}
.container{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);}
.header{background:linear-gradient(135deg,#1a56db,#0e9f6e);padding:36px 40px;text-align:center;}
.header h1{color:#fff;font-size:26px;margin:0;font-weight:900;}
.body{padding:36px 40px;color:#1a202c;font-size:15px;line-height:1.7;}
.cert-box{background:linear-gradient(135deg,#f0f4ff,#f0fdf4);border:2px solid #0e9f6e;border-radius:16px;padding:24px;text-align:center;margin:20px 0;}
.btn{display:inline-block;background:#1a56db;color:#fff!important;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:700;font-size:15px;margin:20px 0;}
.footer{background:#f4f6fb;padding:20px 40px;text-align:center;font-size:12px;color:#718096;}
</style></head>
<body><div class="container">
  <div class="header"><h1>🎓 Certificate of Completion</h1></div>
  <div class="body">
    <p>Congratulations to <strong>${student.name}</strong>!</p>
    <div class="cert-box">
      <div style="font-size:48px;margin-bottom:12px;">🏆</div>
      <div style="font-family:Georgia,serif;font-size:20px;color:#1a56db;font-weight:700;">${student.name}</div>
      <div style="font-size:14px;color:#4a5568;margin-top:8px;">has successfully completed</div>
      <div style="font-family:Georgia,serif;font-size:18px;color:#065f46;font-weight:700;margin-top:8px;">${pathway_name} — Grade ${grade_number}</div>
      <div style="font-size:12px;color:#718096;margin-top:12px;">Issued by StemNest Academy · ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
    </div>
    <p>Log in to the Student Dashboard to view and download the certificate.</p>
    <a href="${appUrl}/pages/student-dashboard.html" class="btn">View Certificate →</a>
  </div>
  <div class="footer">© ${new Date().getFullYear()} StemNest Academy Ltd · <a href="${appUrl}" style="color:#1a56db;">stemnestacademy.co.uk</a></div>
</div></body></html>`,
          template: 'certificate_awarded',
        }).catch(e => logger.warn('[CERT] Email failed:', e.message));
      }
    } catch (emailErr) {
      logger.warn('[CERT] Email notification failed:', emailErr.message);
    }

    logger.info(`[CERT] Awarded to student=${student_id} pathway=${pathway_name} grade=${grade_number}`);
    res.json({ success: true, certificate: cert });
  } catch (err) { next(err); }
});

module.exports = router;
