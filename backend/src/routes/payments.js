/**
 * Payments routes
 *
 * POST /api/payments/create-link          — generate Fincra payment link (sales/postsales/admin)
 * POST /api/payments/fincra/webhook       — Fincra webhook (payment confirmed)
 * POST /api/payments/enquiry              — course enrolment enquiry (public)
 * GET  /api/payments                      — list payments (admin/postsales)
 * GET  /api/payments/student/:id          — student payment history
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const notify  = require('../services/notificationService');
const logger  = require('../utils/logger');
const fincra  = require('../services/fincraService');

const router = express.Router();

/* ════════════════════════════════════════════════════
   POST /api/payments/create-link
   Learning Advisor / Post-Sales generates a Fincra
   payment link for a student after agreeing a price.
════════════════════════════════════════════════════ */
router.post('/create-link', requireAuth, requireRole('admin','super_admin','postsales','sales','presales'), async (req, res, next) => {
  try {
    const {
      studentId,
      studentName,
      studentEmail,
      courseId,
      amount,
      currency,
      credits,
      notes,
      bookingId,
    } = req.body;

    if (!studentEmail || !amount) {
      return res.status(400).json({ success: false, error: 'studentEmail and amount are required' });
    }

    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be a positive number' });
    }

    /* Resolve course name for display */
    let courseName = 'StemNest Course';
    if (courseId) {
      const cRes = await pool.query('SELECT name FROM courses WHERE id = $1', [courseId]);
      if (cRes.rows.length) courseName = cRes.rows[0].name;
    }

    /* Build a unique reference for this payment */
    const reference = `SN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
    const usedCurrency = (currency || 'GBP').toUpperCase();
    const description  = notes || `${courseName}${credits ? ' · ' + credits + ' classes' : ''}`;

    /* Create the Fincra checkout link */
    let paymentUrl;
    try {
      const result = await fincra.createCheckout({
        amount:        parseFloat(amount),
        currency:      usedCurrency,
        customerName:  studentName || 'Parent',
        customerEmail: studentEmail,
        reference,
        description,
        redirectUrl:   `${process.env.APP_URL || 'https://stemnestacademy.co.uk'}/pages/payment-success.html?ref=${reference}`,
      });
      paymentUrl = result.checkoutUrl;
    } catch (fincraErr) {
      logger.error('[PAYMENT] Fincra link creation failed:', fincraErr.message);
      return res.status(502).json({ success: false, error: 'Could not generate payment link: ' + fincraErr.message });
    }

    /* Save payment record to DB */
    const dbResult = await pool.query(
      `INSERT INTO payments
         (student_id, sales_id, amount, currency, credits_purchased,
          course_id, status, payment_link, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,NOW())
       RETURNING id`,
      [
        studentId   || null,
        req.user.id,
        parseFloat(amount),
        usedCurrency,
        parseInt(credits) || 0,
        courseId    || null,
        paymentUrl,
        JSON.stringify({ notes, bookingId, reference }),
      ]
    );

    const paymentId = dbResult.rows[0].id;

    /* Store the reference → paymentId mapping for webhook lookup */
    await pool.query(
      `UPDATE payments SET notes = $1 WHERE id = $2`,
      [JSON.stringify({ notes, bookingId, reference, paymentId }), paymentId]
    ).catch(() => {});

    /* Send the payment link to the parent via email */
    try {
      const emailSvc = require('../services/emailService');
      await emailSvc.sendPaymentLinkEmail({
        to:          studentEmail,
        studentName: studentName || 'Student',
        course:      courseName,
        amount,
        currency:    usedCurrency,
        paymentUrl,
      });
      logger.info(`[PAYMENT] Link emailed to ${studentEmail}`);
    } catch (emailErr) {
      logger.warn('[PAYMENT] Email send failed:', emailErr.message);
      /* Non-fatal — the link is still returned to the LA */
    }

    logger.info(`[PAYMENT LINK CREATED] ref=${reference} amount=${usedCurrency} ${amount} student=${studentEmail}`);
    res.json({ success: true, paymentUrl, paymentId, reference });

  } catch (err) { next(err); }
});

/* ════════════════════════════════════════════════════
   POST /api/payments/fincra/webhook
   Called by Fincra when a payment is confirmed.
   Raw body required for signature verification.
════════════════════════════════════════════════════ */
router.post(
  '/fincra/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    /* Always respond 200 immediately — Fincra retries on non-200 */
    res.json({ received: true });

    const signature = req.headers['x-webhook-signature'] || req.headers['x-fincra-signature'] || '';
    const rawBody   = req.body;

    /* Verify signature */
    const isValid = fincra.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      logger.error('[FINCRA WEBHOOK] Invalid signature — ignoring');
      return;
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch (parseErr) {
      logger.error('[FINCRA WEBHOOK] Failed to parse body:', parseErr.message);
      return;
    }

    logger.info(`[FINCRA WEBHOOK] Event received: ${event.event || event.type || 'unknown'} | ref=${event?.data?.reference || '—'}`);

    /* Fincra sends event type as "charge.completed" or "checkout.completed" */
    const eventType = (event.event || event.type || '').toLowerCase();
    const isSuccess = eventType.includes('completed') || eventType.includes('success');

    if (!isSuccess) {
      logger.info(`[FINCRA WEBHOOK] Non-payment event (${eventType}) — ignoring`);
      return;
    }

    const data      = event.data || {};
    const reference = data.reference || data.merchantReference || '';
    const amountPaid = parseFloat(data.amount || data.settledAmount || 0);
    const currency   = data.currency || data.settlementCurrency || 'GBP';
    const status     = (data.status || '').toLowerCase();

    if (status !== 'successful' && status !== 'success' && !isSuccess) {
      logger.info(`[FINCRA WEBHOOK] Payment not successful (status=${status}) — ignoring`);
      return;
    }

    if (!reference) {
      logger.warn('[FINCRA WEBHOOK] No reference in payload');
      return;
    }

    try {
      /* Double-verify the payment with Fincra API */
      let verified = false;
      try {
        const verification = await fincra.verifyPayment(reference);
        verified = (verification?.status || '').toLowerCase() === 'successful'
                || (verification?.status || '').toLowerCase() === 'success';
        logger.info(`[FINCRA WEBHOOK] Verification result: ${verification?.status}`);
      } catch (verifyErr) {
        logger.warn('[FINCRA WEBHOOK] Could not verify with Fincra API — proceeding on webhook trust:', verifyErr.message);
        verified = true; // Proceed if verification API call fails
      }

      if (!verified) {
        logger.warn(`[FINCRA WEBHOOK] Payment ref=${reference} not verified as successful — ignoring`);
        return;
      }

      /* Find the payment record by reference */
      const payResult = await pool.query(
        `SELECT * FROM payments WHERE notes::text LIKE $1 OR payment_link LIKE $1 ORDER BY created_at DESC LIMIT 1`,
        [`%${reference}%`]
      );

      const payment = payResult.rows[0];

      if (!payment) {
        logger.warn(`[FINCRA WEBHOOK] No payment record found for reference: ${reference}`);
        return;
      }

      if (payment.status === 'confirmed') {
        logger.info(`[FINCRA WEBHOOK] Payment ${payment.id} already confirmed — skipping`);
        return;
      }

      /* Mark payment as confirmed */
      await pool.query(
        `UPDATE payments SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`,
        [payment.id]
      );

      const credits     = parseInt(payment.credits_purchased) || 0;
      let   studentId   = payment.student_id;

      /* ── AUTO-ONBOARDING: if no student account exists, create one now ── */
      if (!studentId && credits > 0) {
        try {
          /* Pull student details from the payment notes */
          let payNotes = {};
          try { payNotes = typeof payment.notes === 'string' ? JSON.parse(payment.notes || '{}') : (payment.notes || {}); } catch {}

          const bookingId   = payNotes.bookingId || '';
          let studentName   = 'Student';
          let studentEmail  = '';
          let parentName    = '';
          let studentGrade  = null;
          let courseName    = 'StemNest Programme';

          /* Try to get details from the booking if we have a bookingId */
          if (bookingId) {
            const bResult = await pool.query(
              `SELECT b.notes, b.subject, c.name AS course_name
               FROM bookings b
               LEFT JOIN courses c ON c.name = b.subject
               WHERE b.id = $1`,
              [bookingId]
            );
            if (bResult.rows.length) {
              let bNotes = {};
              try { bNotes = typeof bResult.rows[0].notes === 'string' ? JSON.parse(bResult.rows[0].notes || '{}') : {}; } catch {}
              studentName  = bNotes.studentName  || studentName;
              studentEmail = bNotes.email         || studentEmail;
              parentName   = bNotes.parentName    || '';
              studentGrade = bNotes.grade         || null;
              courseName   = bResult.rows[0].course_name || bResult.rows[0].subject || courseName;
            }
          }

          /* Check if a user account already exists for this email */
          if (studentEmail) {
            const existingUser = await pool.query(
              'SELECT id FROM users WHERE email = $1', [studentEmail]
            );

            if (existingUser.rows.length) {
              /* Account exists — just link it */
              studentId = existingUser.rows[0].id;
              await pool.query(
                'UPDATE payments SET student_id = $1 WHERE id = $2',
                [studentId, payment.id]
              );
              logger.info(`[FINCRA WEBHOOK] Linked existing account ${studentId} to payment ${payment.id}`);
            } else {
              /* Create new student account */
              const bcrypt = require('bcrypt');
              const tempPassword = Math.random().toString(36).slice(-8) + '!S1';
              const passwordHash = await bcrypt.hash(tempPassword, 10);
              const staffId = 'S-' + Date.now().toString(36).toUpperCase().slice(-5);

              const newUser = await pool.query(
                `INSERT INTO users (name, email, role, password_hash, staff_id, is_active)
                 VALUES ($1, $2, 'student', $3, $4, TRUE)
                 RETURNING id`,
                [studentName, studentEmail, passwordHash, staffId]
              );
              studentId = newUser.rows[0].id;

              /* Create student profile */
              await pool.query(
                `INSERT INTO student_profiles (user_id, grade, credits, parent_name, parent_email, enrolled_at)
                 VALUES ($1, $2, 0, $3, $4, NOW())`,
                [studentId, studentGrade, parentName || null, studentEmail]
              );

              /* Update payment record with the new student_id */
              await pool.query(
                'UPDATE payments SET student_id = $1 WHERE id = $2',
                [studentId, payment.id]
              );

              /* Send onboarding email */
              const emailSvc = require('../services/emailService');
              const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
              await emailSvc.sendEmail({
                to:      studentEmail,
                subject: `🎉 Welcome to StemNest Academy, ${studentName}!`,
                html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f6fb;margin:0;padding:0;}
.container{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);}
.header{background:linear-gradient(135deg,#1a56db,#0e9f6e);padding:36px 40px;text-align:center;}
.header h1{color:#fff;font-size:26px;margin:0;font-weight:900;}
.body{padding:36px 40px;color:#1a202c;font-size:15px;line-height:1.7;}
.info-box{background:#f0f4ff;border-radius:12px;padding:18px 22px;margin:20px 0;font-family:monospace;font-size:15px;border-left:4px solid #1a56db;}
.btn{display:inline-block;background:#1a56db;color:#fff!important;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:700;font-size:15px;margin:20px 0;}
.footer{background:#f4f6fb;padding:20px 40px;text-align:center;font-size:12px;color:#718096;}
</style></head>
<body><div class="container">
  <div class="header"><h1>Welcome to The Nest 🎉</h1></div>
  <div class="body">
    <h2>Hi ${parentName || studentName}!</h2>
    <p>Your payment has been confirmed and <strong>${studentName}'s</strong> account is ready. Welcome to StemNest Academy!</p>
    <p>Here are the login details for the student dashboard:</p>
    <div class="info-box">
      <strong>Email:</strong> ${studentEmail}<br>
      <strong>Password:</strong> ${tempPassword}<br>
      <strong>Student ID:</strong> ${staffId}
    </div>
    <p><strong>Credits:</strong> ${credits} class${credits !== 1 ? 'es' : ''} added to your account.</p>
    <a href="${appUrl}/pages/login.html" class="btn">🚀 Log In to Your Dashboard →</a>
    <p style="font-size:13px;color:#718096;margin-top:20px;">Please change your password after your first login. If you have any questions, reply to this email or contact us at <a href="mailto:support@stemnestacademy.co.uk">support@stemnestacademy.co.uk</a></p>
  </div>
  <div class="footer">© ${new Date().getFullYear()} StemNest Academy Ltd · <a href="${appUrl}" style="color:#1a56db;">stemnestacademy.co.uk</a></div>
</div></body></html>`,
                template: 'student_onboarding_auto',
              }).catch(e => logger.warn('[FINCRA WEBHOOK] Auto-onboarding email failed:', e.message));

              logger.info(`[FINCRA WEBHOOK] ✅ Auto-onboarded: student=${studentId} email=${studentEmail} staffId=${staffId}`);
            }
          }
        } catch (onboardErr) {
          logger.error('[FINCRA WEBHOOK] Auto-onboarding failed:', onboardErr.message);
          /* Non-fatal — payment is still confirmed, ops team will be notified */
        }
      }

      /* Add credits to student — handling negative balance (debt settlement) */
      if (studentId && credits > 0) {
        /* Get current credit balance */
        const credResult = await pool.query(
          `SELECT credits FROM student_profiles WHERE user_id = $1`,
          [studentId]
        );
        const currentCredits = parseInt(credResult.rows[0]?.credits || 0);
        const newCredits     = currentCredits + credits;

        /* Update credits */
        await pool.query(
          `UPDATE student_profiles SET credits = $1, credits_suspended = FALSE WHERE user_id = $2`,
          [newCredits, studentId]
        );

        /* Log transaction */
        await pool.query(
          `INSERT INTO credit_transactions (student_id, type, amount, description)
           VALUES ($1, 'topup', $2, $3)`,
          [
            studentId,
            credits,
            `Payment confirmed (ref: ${reference}) — ${credits} credit${credits !== 1 ? 's' : ''} added. Previous balance: ${currentCredits}. New balance: ${newCredits}.`,
          ]
        );

        logger.info(`[FINCRA WEBHOOK] Credits updated: student=${studentId} prev=${currentCredits} added=${credits} new=${newCredits}`);

        /* Mark student as renewed in retention follow-up tracker */
        try {
          const { markStudentRenewed } = require('../jobs/retention');
          await markStudentRenewed(studentId);
        } catch (retErr) {
          logger.warn('[FINCRA WEBHOOK] markStudentRenewed failed:', retErr.message);
        }

        /* Notify student in-app */
        await notify.saveNotification(
          studentId,
          'payment_confirmed',
          '✅ Payment Confirmed',
          `${credits} class credit${credits !== 1 ? 's' : ''} added. Your balance is now ${newCredits} credit${newCredits !== 1 ? 's' : ''}.`
        ).catch(() => {});

        /* Send receipt email to parent */
        try {
          const userResult = await pool.query(
            `SELECT u.name, u.email, sp.parent_email, sp.parent_name
             FROM users u
             LEFT JOIN student_profiles sp ON sp.user_id = u.id
             WHERE u.id = $1`,
            [studentId]
          );
          const student = userResult.rows[0];
          if (student) {
            const recipientEmail = student.parent_email || student.email;
            const recipientName  = student.parent_name  || student.name;

            if (recipientEmail) {
              const emailSvc = require('../services/emailService');
              await emailSvc.sendPaymentReceiptEmail({
                to:           recipientEmail,
                parentName:   recipientName,
                studentName:  student.name,
                amount:       amountPaid,
                currency,
                credits,
                newBalance:   newCredits,
                reference,
              }).catch(e => logger.warn('[FINCRA WEBHOOK] Receipt email failed:', e.message));
            }
          }
        } catch (emailErr) {
          logger.warn('[FINCRA WEBHOOK] Could not fetch student for receipt email:', emailErr.message);
        }
      }

      /* Notify operations and post-sales */
      try {
        const emailSvc = require('../services/emailService');

        /* Find the LA who generated this payment link */
        let laName = '—';
        let laEmail = '';
        if (payment.sales_id) {
          const laResult = await pool.query('SELECT name, email FROM users WHERE id = $1', [payment.sales_id]);
          if (laResult.rows.length) {
            laName  = laResult.rows[0].name;
            laEmail = laResult.rows[0].email;
          }
        }

        /* Also get student info for the email */
        let studentDisplayName = 'the student';
        let bookingId = '';
        try {
          const payNotes = typeof payment.notes === 'string' ? JSON.parse(payment.notes || '{}') : (payment.notes || {});
          bookingId = payNotes.bookingId || '';
        } catch {}

        if (studentId) {
          const sResult = await pool.query('SELECT name FROM users WHERE id = $1', [studentId]);
          if (sResult.rows.length) studentDisplayName = sResult.rows[0].name;
        }

        /* Notify LA — you got a conversion! */
        if (laEmail) {
          await emailSvc.sendEmail({
            to:      laEmail,
            subject: `🎉 Payment Confirmed — ${studentDisplayName} just paid!`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;">
                <h2 style="color:#0e9f6e;">🎉 You Got a Conversion, ${laName}!</h2>
                <p><strong>${studentDisplayName}</strong> has just confirmed their payment.</p>
                <div style="background:#f0fdf4;border-radius:10px;padding:16px;margin:16px 0;">
                  <p><strong>Amount:</strong> ${currency} ${amountPaid}</p>
                  <p><strong>Reference:</strong> ${reference}</p>
                </div>
                <p><strong>Next step:</strong> Please go to your Sales Dashboard, mark ${studentDisplayName} as <strong>Paid / Converted</strong> in your Pipeline so the Post-Sales team can onboard them.</p>
                <a href="https://stemnestacademy.co.uk/pages/sales-dashboard.html?tab=pipeline"
                   style="display:inline-block;margin-top:12px;background:#0e9f6e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">
                  Go to My Pipeline →
                </a>
              </div>
            `,
            template: 'la_conversion_alert',
          }).catch(e => logger.warn('[FINCRA WEBHOOK] LA email failed:', e.message));
          logger.info(`[FINCRA WEBHOOK] LA conversion email sent to ${laEmail}`);
        }

        await emailSvc.sendEmail({
          to:      'operations@stemnestacademy.co.uk',
          subject: `💳 Payment Confirmed — ref: ${reference}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;">
              <h2 style="color:#0e9f6e;">Payment Confirmed ✅</h2>
              <p><strong>Reference:</strong> ${reference}</p>
              <p><strong>Amount:</strong> ${currency} ${amountPaid}</p>
              <p><strong>Credits:</strong> ${credits}</p>
              <p><strong>Student:</strong> ${studentDisplayName} (${studentId || '—'})</p>
              <p><strong>Learning Advisor:</strong> ${laName}</p>
              <a href="https://stemnestacademy.co.uk/pages/postsales-dashboard.html"
                 style="display:inline-block;margin-top:12px;background:#0e9f6e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
                View Post-Sales Dashboard →
              </a>
            </div>
          `,
          template: 'payment_confirmed_ops',
        }).catch(() => {});
      } catch (e) { /* non-fatal */ }

      logger.info(`[FINCRA WEBHOOK] ✅ Payment confirmed: ref=${reference} payment=${payment.id} credits=${credits}`);

    } catch (processingErr) {
      logger.error('[FINCRA WEBHOOK] Processing error:', processingErr.message, processingErr.stack);
    }
  }
);

/* ════════════════════════════════════════════════════
   POST /api/payments/manual-topup
   Post-Sales staff manually confirms a payment received
   outside of Fincra (bank transfer, cash, Grey Finance, etc.)
   Adds credits instantly and sends receipt email to parent.
════════════════════════════════════════════════════ */
router.post('/manual-topup', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { studentId, credits, amount, currency, notes } = req.body;

    if (!studentId) return res.status(400).json({ success: false, error: 'studentId is required' });
    if (!credits || parseInt(credits) <= 0) return res.status(400).json({ success: false, error: 'credits must be a positive integer' });
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ success: false, error: 'amount must be a positive number' });

    const creditsToAdd = parseInt(credits);
    const amountPaid   = parseFloat(amount);
    const usedCurrency = (currency || 'GBP').toUpperCase();

    /* Verify the student exists */
    const stuResult = await pool.query(
      `SELECT u.id, u.name, u.email, sp.credits AS current_credits, sp.parent_email, sp.parent_name
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'student'`,
      [studentId]
    );

    if (!stuResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const student        = stuResult.rows[0];
    const currentCredits = parseInt(student.current_credits || 0);
    const newCredits     = currentCredits + creditsToAdd;

    /* Update credits and lift suspension */
    await pool.query(
      `UPDATE student_profiles SET credits = $1, credits_suspended = FALSE WHERE user_id = $2`,
      [newCredits, studentId]
    );

    /* Insert confirmed payment record */
    const payResult = await pool.query(
      `INSERT INTO payments
         (student_id, sales_id, amount, currency, credits_purchased, status, confirmed_at, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW(), $6, NOW())
       RETURNING id`,
      [
        studentId,
        req.user.id,
        amountPaid,
        usedCurrency,
        creditsToAdd,
        JSON.stringify({
          method:       'manual',
          confirmedBy:  req.user.email,
          notes:        notes || '',
          previousCredits: currentCredits,
          newCredits,
        }),
      ]
    );

    const paymentId = payResult.rows[0].id;

    /* Log credit transaction */
    await pool.query(
      `INSERT INTO credit_transactions (student_id, type, amount, description)
       VALUES ($1, 'topup', $2, $3)`,
      [
        studentId,
        creditsToAdd,
        `Manual top-up confirmed by ${req.user.email}${notes ? ' — ' + notes : ''}. Previous: ${currentCredits}, Added: ${creditsToAdd}, New: ${newCredits}.`,
      ]
    ).catch(() => {}); // non-fatal if credit_transactions table doesn't exist yet

    /* Send receipt email to parent/student */
    const recipientEmail = student.parent_email || student.email;
    const recipientName  = student.parent_name  || student.name;

    if (recipientEmail) {
      try {
        const emailSvc = require('../services/emailService');
        await emailSvc.sendPaymentReceiptEmail({
          to:          recipientEmail,
          parentName:  recipientName,
          studentName: student.name,
          amount:      amountPaid,
          currency:    usedCurrency,
          credits:     creditsToAdd,
          newBalance:  newCredits,
          reference:   `MANUAL-${paymentId}`,
        }).catch(e => logger.warn('[MANUAL-TOPUP] Receipt email failed:', e.message));
      } catch (emailErr) {
        logger.warn('[MANUAL-TOPUP] Email error:', emailErr.message);
      }
    }

    logger.info(`[MANUAL-TOPUP] student=${studentId} name=${student.name} added=${creditsToAdd} new=${newCredits} by=${req.user.email}`);

    res.json({ success: true, newCredits, paymentId });

  } catch (err) { next(err); }
});

/* ════════════════════════════════════════════════════
   POST /api/payments/enquiry  (public)
   Course enrolment enquiry from website
════════════════════════════════════════════════════ */
router.post('/enquiry', async (req, res, next) => {
  try {
    const { courseId, courseName, coursePrice, studentName, age, email, phone, timezone, notes, source } = req.body;

    if (!studentName) return res.status(400).json({ success: false, error: 'studentName required' });
    if (!email && !phone) return res.status(400).json({ success: false, error: 'email or phone required' });

    await pool.query(
      `INSERT INTO payments (amount, currency, status, notes, created_at)
       VALUES ($1, 'GBP', 'enquiry', $2, NOW())`,
      [
        parseFloat(coursePrice) || 0,
        JSON.stringify({
          courseId, courseName, coursePrice,
          studentName, age,
          email: email || '',
          phone: phone || '',
          timezone: timezone || '',
          notes: notes || '',
          source: source || 'direct_website',
        })
      ]
    ).catch(() => {});

    logger.info(`[ENQUIRY] ${studentName} → ${courseName} · ${email || phone}`);
    res.json({ success: true, message: 'Enquiry received' });
  } catch (err) { next(err); }
});

/* ════════════════════════════════════════════════════
   GET /api/payments  (admin/postsales)
════════════════════════════════════════════════════ */
router.get('/', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT p.*,
             u_s.name  AS student_name,  u_s.email AS student_email,
             u_sp.name AS sales_name,
             c.name    AS course_name
      FROM payments p
      LEFT JOIN users u_s  ON u_s.id  = p.student_id
      LEFT JOIN users u_sp ON u_sp.id = p.sales_id
      LEFT JOIN courses c  ON c.id    = p.course_id`;
    const params = [];
    if (status) { params.push(status); query += ` WHERE p.status = $1`; }
    query += ` ORDER BY p.created_at DESC LIMIT 500`;
    const result = await pool.query(query, params);
    res.json({ success: true, payments: result.rows });
  } catch (err) { next(err); }
});

/* ════════════════════════════════════════════════════
   GET /api/payments/student/:id
════════════════════════════════════════════════════ */
router.get('/student/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.id !== req.params.id && !['admin','super_admin','postsales'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const result = await pool.query(
      `SELECT p.id, p.amount, p.currency, p.credits_purchased, p.status,
              p.created_at, p.confirmed_at, c.name AS course_name
       FROM payments p
       LEFT JOIN courses c ON c.id = p.course_id
       WHERE p.student_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, payments: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
