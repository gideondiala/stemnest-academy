/**
 * StemNest Academy — Retention Follow-Up Job
 *
 * Runs every 4 hours via setInterval.
 * Sends automated follow-up emails to parents who haven't renewed:
 *   - Day 3  after trigger → personalised follow-up email
 *   - Day 7  after trigger → second follow-up with wa.me link for LA
 *   - Day 14 after trigger → final follow-up + flags LA for direct call
 *
 * Marks as renewed automatically when credits are topped up (webhook handles this).
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');

async function runRetentionCheck() {
  try {
    const emailSvc = require('../services/emailService');
    const appUrl   = process.env.APP_URL || 'https://stemnestacademy.co.uk';
    const topUpUrl = `${appUrl}/pages/student-dashboard.html?topup=1`;
    const now      = new Date();

    /* Fetch all active (not renewed) follow-up records */
    const result = await pool.query(`
      SELECT rf.*,
             u.email, u.name AS student_db_name,
             sp.parent_email, sp.parent_name, sp.credits
      FROM renewal_followups rf
      JOIN users u ON u.id = rf.student_id
      LEFT JOIN student_profiles sp ON sp.user_id = rf.student_id
      WHERE rf.renewed = FALSE
        /* Skip paused students — no retention emails while classes are on hold */
        AND rf.student_id NOT IN (
          SELECT user_id FROM student_profiles WHERE class_paused = TRUE
        )
      ORDER BY rf.triggered_at ASC
      LIMIT 200
    `);

    for (const rec of result.rows) {
      const triggeredAt    = new Date(rec.triggered_at);
      const daysSinceTrigger = (now - triggeredAt) / (1000 * 60 * 60 * 24);

      /* If they've already topped up (credits > 2), mark as renewed */
      const currentCredits = parseInt(rec.credits || 0);
      if (currentCredits > 2) {
        await pool.query(
          `UPDATE renewal_followups SET renewed = TRUE, renewed_at = NOW() WHERE id = $1`,
          [rec.id]
        ).catch(() => {});
        logger.info(`[RETENTION] ${rec.student_name} marked as renewed (credits: ${currentCredits})`);
        continue;
      }

      const recipientEmail = rec.parent_email || rec.email;
      const recipientName  = rec.parent_name  || '';
      const studentName    = rec.student_name || rec.student_db_name || 'your child';

      if (!recipientEmail) continue;

      /* ── Day 3 follow-up ── */
      if (daysSinceTrigger >= 3 && !rec.day3_sent) {
        await emailSvc.sendEmail({
          to:      recipientEmail,
          subject: `📚 Keeping ${studentName}'s learning on track`,
          html:    _buildFollowUpEmail({
            parentName: recipientName, studentName, topUpUrl,
            dayNum: 3,
            message: `We noticed ${studentName} is running low on class credits. We'd love to help them continue their learning journey — it only takes a moment to top up and keep the momentum going!`,
            cta: 'Continue Learning →',
          }),
          template: 'renewal_day3',
        }).catch(e => logger.warn(`[RETENTION] Day 3 email failed (${rec.student_id}):`, e.message));

        await pool.query(
          `UPDATE renewal_followups SET day3_sent = TRUE WHERE id = $1`,
          [rec.id]
        ).catch(() => {});
        logger.info(`[RETENTION] Day 3 follow-up sent to ${recipientEmail} for ${studentName}`);
      }

      /* ── Day 7 follow-up ── */
      if (daysSinceTrigger >= 7 && !rec.day7_sent) {
        await emailSvc.sendEmail({
          to:      recipientEmail,
          subject: `⏰ ${studentName}'s classes — quick update`,
          html:    _buildFollowUpEmail({
            parentName: recipientName, studentName, topUpUrl,
            dayNum: 7,
            message: `We haven't heard from you yet! ${studentName} has been making great progress, and we'd love to help them keep going. Top up their credits today and they can continue right where they left off — no re-registration needed.`,
            cta: 'Top Up & Resume →',
          }),
          template: 'renewal_day7',
        }).catch(e => logger.warn(`[RETENTION] Day 7 email failed (${rec.student_id}):`, e.message));

        await pool.query(
          `UPDATE renewal_followups SET day7_sent = TRUE WHERE id = $1`,
          [rec.id]
        ).catch(() => {});
        logger.info(`[RETENTION] Day 7 follow-up sent to ${recipientEmail} for ${studentName}`);
      }

      /* ── Day 14 follow-up — final + flag LA for direct call ── */
      if (daysSinceTrigger >= 14 && !rec.day14_sent) {
        await emailSvc.sendEmail({
          to:      recipientEmail,
          subject: `🌟 We're holding ${studentName}'s spot for you`,
          html:    _buildFollowUpEmail({
            parentName: recipientName, studentName, topUpUrl,
            dayNum: 14,
            message: `This is our final reminder — ${studentName}'s account and all their learning materials are still here, waiting for them. When you're ready to continue, it takes just seconds to top up and resume. We'd love to have them back in class.`,
            cta: 'Resume ${studentName}\'s Classes →',
            isFinal: true,
          }),
          template: 'renewal_day14',
        }).catch(e => logger.warn(`[RETENTION] Day 14 email failed (${rec.student_id}):`, e.message));

        await pool.query(
          `UPDATE renewal_followups SET day14_sent = TRUE WHERE id = $1`,
          [rec.id]
        ).catch(() => {});

        /* Flag LA for a direct call */
        await _flagLAForCall(rec.student_id, studentName, 14);

        logger.info(`[RETENTION] Day 14 follow-up sent to ${recipientEmail} for ${studentName}`);
      }
    }
  } catch (err) {
    logger.error('[RETENTION] Job error:', err.message);
  }
}

/* Flag the assigned Learning Advisor for a direct call */
async function _flagLAForCall(studentId, studentName, dayNum) {
  try {
    const emailSvc = require('../services/emailService');
    const appUrl   = process.env.APP_URL || 'https://stemnestacademy.co.uk';

    const result = await pool.query(
      `SELECT u.id, u.name, u.email FROM users u
       JOIN bookings b ON b.sales_id = u.id
       WHERE b.student_id = $1
       ORDER BY b.scheduled_at DESC LIMIT 1`,
      [studentId]
    );
    const la = result.rows[0];
    if (!la || !la.email) return;

    await emailSvc.sendEmail({
      to:      la.email,
      subject: `📞 Direct call needed — ${studentName} (Day ${dayNum} no renewal)`,
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;">
        <h2 style="color:#c53030;">Action Required: Direct Call 📞</h2>
        <p>Hi ${la.name},</p>
        <p><strong>${studentName}</strong> has not renewed after ${dayNum} days of automated follow-up emails. It's time for a direct personal call to the parent.</p>
        <p><strong>Next steps:</strong></p>
        <ol>
          <li>Call or WhatsApp the parent directly</li>
          <li>Understand any concerns they might have</li>
          <li>Generate a renewal payment link from your dashboard and share it</li>
        </ol>
        <a href="${appUrl}/pages/sales-dashboard.html?tab=followup"
           style="display:inline-block;margin-top:12px;background:#c53030;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">
          View in Dashboard →
        </a>
      </div>`,
      template: 'la_call_flag',
    }).catch(e => logger.warn('[RETENTION] LA call flag email failed:', e.message));
  } catch (e) {
    logger.warn('[RETENTION] LA call flag failed:', e.message);
  }
}

function _buildFollowUpEmail({ parentName, studentName, topUpUrl, dayNum, message, cta, isFinal }) {
  const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
  const btnColor = isFinal ? '#1a56db' : dayNum >= 7 ? '#e65100' : '#0e9f6e';
  const icon     = isFinal ? '🌟' : dayNum >= 7 ? '⏰' : '📚';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f4f6fb; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .header { background: linear-gradient(135deg, #1a56db, #0e9f6e); padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 24px; margin: 0; font-weight: 900; }
    .body { padding: 36px 40px; color: #1a202c; font-size: 15px; line-height: 1.7; }
    .btn { display: inline-block; background: ${btnColor}; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 50px; font-weight: 700; font-size: 15px; margin: 20px 0; }
    .footer { background: #f4f6fb; padding: 20px 40px; text-align: center; font-size: 12px; color: #718096; }
    .footer a { color: #1a56db; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>StemNest Academy ${icon}</h1>
    </div>
    <div class="body">
      <p>Hi ${parentName || 'there'},</p>
      <p>${message}</p>
      <p>All of <strong>${studentName}</strong>'s lesson materials, progress and history are safely stored and ready. When you top up, classes resume instantly — no re-registration needed.</p>
      <a href="${topUpUrl}" class="btn">${cta.replace("${studentName}", studentName)}</a>
      ${isFinal ? `<p style="font-size:13px;color:#718096;margin-top:20px;">Questions? We're here to help — reply to this email or contact us at <a href="mailto:support@stemnestacademy.co.uk">support@stemnestacademy.co.uk</a></p>` : ''}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} StemNest Academy Ltd · <a href="${appUrl}">stemnestacademy.co.uk</a></p>
    </div>
  </div>
</body>
</html>`;
}

/* ── Start the job ── */
function startRetentionJob() {
  const INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours

  logger.info('[RETENTION] Follow-up job started — checking every 4 hours');

  /* Run immediately on startup, then every 4 hours */
  runRetentionCheck();
  setInterval(runRetentionCheck, INTERVAL_MS);
}

/* ── Mark a student as renewed (called from payment webhook) ── */
async function markStudentRenewed(studentId) {
  await pool.query(
    `UPDATE renewal_followups SET renewed = TRUE, renewed_at = NOW() WHERE student_id = $1`,
    [studentId]
  ).catch(() => {});
  logger.info(`[RETENTION] Student ${studentId} marked as renewed`);
}

module.exports = { startRetentionJob, markStudentRenewed };
