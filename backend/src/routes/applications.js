/**
 * Tutor Applications routes
 * POST /api/applications        — submit application (public)
 * GET  /api/applications        — list all applications (HR/admin only)
 * PUT  /api/applications/:id    — update status (HR/admin only)
 * DELETE /api/applications/:id  — delete (HR/admin only)
 */

const express = require('express');
const { z }   = require('zod');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const emailSvc = require('../services/emailService');
const logger   = require('../utils/logger');

const router = express.Router();

const applicationSchema = z.object({
  name:      z.string().min(2),
  email:     z.string().email(),
  phone:     z.string().min(7),
  country:   z.string(),
  qual:      z.string(),
  exp:       z.string().optional(),
  subjects:  z.array(z.string()).min(1),
  topics:    z.string(),
  ageGroups: z.array(z.string()).optional(),
  hours:     z.string().optional(),
  times:     z.string().optional(),
  device:    z.string().optional(),
  bio:       z.string().min(10),
  linkedin:  z.string().optional(),
  source:    z.string().optional(),
});

/* ── POST /api/applications (public) ── */
router.post('/', async (req, res, next) => {
  try {
    const data = applicationSchema.parse(req.body);

    /* Check for duplicate (same email + same name in last 7 days only) */
    const dup = await pool.query(
      `SELECT id FROM applications WHERE LOWER(email) = LOWER($1) AND applied_at > NOW() - INTERVAL '7 days'`,
      [data.email]
    ).catch(() => ({ rows: [] }));

    if (dup.rows.length) {
      return res.status(409).json({
        success: false,
        error: 'An application from this email was already submitted recently. We will be in touch within 48 hours.',
      });
    }

    const result = await pool.query(
      `INSERT INTO applications
         (name, email, phone, country, qualification, experience_years,
          subjects, topics, age_groups, hours_per_week, preferred_times,
          device, bio, linkedin, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending')
       RETURNING id`,
      [data.name, data.email, data.phone, data.country, data.qual,
       data.exp || '0', data.subjects, data.topics,
       data.ageGroups || [], data.hours || '', data.times || '',
       data.device || '', data.bio, data.linkedin || '', data.source || '']
    );

    const appId = result.rows[0].id;

    /* Send confirmation email to applicant */
    await emailSvc.sendEmail({
      to:       data.email,
      subject:  'Application Received — StemNest Academy',
      template: 'application_received',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <h2 style="color:#1a56db;">Application Received! 🎉</h2>
          <p>Hi ${data.name},</p>
          <p>Thank you for applying to teach at StemNest Academy. We have received your application and will review it personally.</p>
          <p><strong>What happens next:</strong></p>
          <ul>
            <li>We review every application within 48 hours</li>
            <li>If shortlisted, we'll contact you to arrange an intro call</li>
            <li>You'll hear from us either way</li>
          </ul>
          <p><strong>Application ID:</strong> ${appId}</p>
          <p>Questions? Email us at <a href="mailto:tutors@stemnestacademy.co.uk">tutors@stemnestacademy.co.uk</a></p>
          <p>— The StemNest Academy Team</p>
        </div>`,
    }).catch(e => logger.error('Application confirmation email failed:', e.message));

    /* Notify HR team */
    await emailSvc.sendEmail({
      to:       'hr@stemnestacademy.co.uk',
      subject:  `New Tutor Application — ${data.name} (${data.subjects.join(', ')})`,
      template: 'new_application_hr',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <h2 style="color:#1a56db;">New Tutor Application</h2>
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Phone:</strong> ${data.phone}</p>
          <p><strong>Country:</strong> ${data.country}</p>
          <p><strong>Subjects:</strong> ${data.subjects.join(', ')}</p>
          <p><strong>Qualification:</strong> ${data.qual}</p>
          <p><strong>Experience:</strong> ${data.exp || '0'} years</p>
          <p><strong>Bio:</strong> ${data.bio}</p>
          <p><a href="https://stemnestacademy.co.uk/pages/hr-dashboard.html">View in HR Dashboard →</a></p>
        </div>`,
    }).catch(e => logger.error('HR notification email failed:', e.message));

    logger.info(`[APPLICATION] ${data.name} (${data.email}) — ${data.subjects.join(', ')}`);
    res.status(201).json({ success: true, applicationId: appId });

  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ── GET /api/applications (HR/admin only) ── */
router.get('/', requireAuth, requireRole('hr', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { status, dateFilter } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }

    if (dateFilter === 'today') {
      where += ` AND applied_at::date = CURRENT_DATE`;
    } else if (dateFilter === 'week') {
      where += ` AND applied_at > NOW() - INTERVAL '7 days'`;
    } else if (dateFilter === 'month') {
      where += ` AND applied_at > NOW() - INTERVAL '30 days'`;
    } else if (dateFilter === 'last_month') {
      where += ` AND DATE_TRUNC('month', applied_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')`;
    }

    const result = await pool.query(
      `SELECT * FROM applications ${where} ORDER BY applied_at DESC`,
      params
    );

    res.json({ success: true, applications: result.rows });
  } catch (err) { next(err); }
});

/* ── PUT /api/applications/:id (HR/admin only) ── */
router.put('/:id', requireAuth, requireRole('hr', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (status) { fields.push(`status = $${i++}`); values.push(status); }
    if (notes)  { fields.push(`notes = $${i++}`);  values.push(notes); }

    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    values.push(req.params.id);
    await pool.query(
      `UPDATE applications SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
      values
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── DELETE /api/applications/:id (HR/admin only) ── */
router.delete('/:id', requireAuth, requireRole('hr', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM applications WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
