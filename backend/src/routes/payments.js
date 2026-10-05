/**
 * Payments routes
 *
 * POST /api/payments/create-link          — payment link for a student (Fincra or Flutterwave)
 * POST /api/payments/fincra/webhook       — Fincra webhook (payment confirmed)
 * POST /api/payments/flutterwave/webhook  — Flutterwave webhook (payment confirmed)
 * POST /api/payments/manual-topup         — credits for a payment received outside the links, or a referral reward
 * GET  /api/payments/student-search       — find a student by ID, name, email or family
 * GET  /api/payments/credit-log/:id       — a student's credit activity
 * GET  /api/payments/my-top-up            — the latest open payment link for the logged-in student
 * GET  /api/payments/providers            — which payment providers are set up
 * POST /api/payments/enquiry              — course enrolment enquiry (public)
 * GET  /api/payments                      — list payments (admin/postsales)
 * GET  /api/payments/student/:id          — student payment history
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const notify  = require('../services/notificationService');
const logger  = require('../utils/logger');
const pauseSvc = require('../services/pauseService');
const { nextStudentId } = require('../utils/studentId');
const promoSvc = require('../services/promoterService');
const fincra  = require('../services/fincraService');
const flutterwave = require('../services/flutterwaveService');

const router = express.Router();

const PROVIDERS = ['fincra', 'flutterwave'];
const METHODS   = ['bank_transfer', 'card', 'cash', 'ussd', 'mobile_money', 'other'];
const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseNotes(n) {
  if (!n) return {};
  if (typeof n === 'object') return n;
  try { return JSON.parse(n); } catch { return {}; }
}

/* ════════════════════════════════════════════════════
   POST /api/payments/create-link
   Learning Advisor / Post-Sales generates a payment
   link for a student after agreeing a price. The
   provider is chosen per link: Fincra (lower fees in
   Nigeria) or Flutterwave (more countries).
════════════════════════════════════════════════════ */
router.post('/create-link', requireAuth, requireRole('admin','super_admin','postsales','sales','presales'), async (req, res, next) => {
  try {
    const {
      studentId,
      courseId,
      amount,
      currency,
      credits,
      notes,
      bookingId,
    } = req.body;
    let { studentName, studentEmail } = req.body;
    const provider = PROVIDERS.includes(String(req.body.provider || '').toLowerCase())
      ? String(req.body.provider).toLowerCase() : 'fincra';
    const sendEmail = req.body.sendEmail !== false;

    if (studentId && !UUID_RE.test(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid studentId' });
    }
    /* For an existing student, fill in the payer from their profile */
    let customerPhone = null;
    if (studentId) {
      const s = await pool.query(
        `SELECT u.name, u.email, u.phone, sp.parent_email, sp.parent_name
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1 AND u.role = 'student'`, [studentId]);
      if (!s.rows.length) return res.status(404).json({ success: false, error: 'Student not found' });
      studentName  = studentName  || s.rows[0].name;
      studentEmail = studentEmail || s.rows[0].parent_email || s.rows[0].email;
      customerPhone = s.rows[0].phone || null;
    }

    if (!studentEmail || !amount) {
      return res.status(400).json({ success: false, error: 'studentEmail and amount are required' });
    }

    /* A link made by email for an existing student is tied to them, so their
       dashboard's Top up button opens it (a new family has no account yet) */
    let linkedStudentId = studentId || null;
    if (!linkedStudentId) {
      const m = await pool.query(
        `SELECT u.id FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.role = 'student' AND u.is_active = TRUE
           AND (LOWER(u.email) = LOWER($1) OR LOWER(COALESCE(sp.parent_email, '')) = LOWER($1))`,
        [studentEmail]
      );
      if (m.rows.length === 1) linkedStudentId = m.rows[0].id;
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
    const usedCurrency = (currency || 'NGN').toUpperCase();
    const description  = notes || `${courseName}${credits ? ' · ' + credits + ' classes' : ''}`;
    const redirectUrl  = `${process.env.APP_URL || 'https://stemnestacademy.co.uk'}/pages/payment-success.html?ref=${reference}`;

    /* Create the checkout link with the chosen provider */
    let paymentUrl;
    try {
      const svc = provider === 'flutterwave' ? flutterwave : fincra;
      const result = await svc.createCheckout({
        amount:        parseFloat(amount),
        currency:      usedCurrency,
        customerName:  studentName || 'Parent',
        customerEmail: studentEmail,
        customerPhone,
        reference,
        description,
        redirectUrl,
      });
      paymentUrl = result.checkoutUrl;
    } catch (providerErr) {
      logger.error(`[PAYMENT] ${provider} link creation failed:`, providerErr.message);
      return res.status(502).json({ success: false, error: 'Could not generate payment link: ' + providerErr.message });
    }

    /* Save payment record to DB */
    const dbResult = await pool.query(
      `INSERT INTO payments
         (student_id, sales_id, amount, currency, credits_purchased,
          course_id, status, payment_link, notes, provider, reference, kind, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,'topup',NOW())
       RETURNING id`,
      [
        linkedStudentId,
        req.user.id,
        parseFloat(amount),
        usedCurrency,
        parseInt(credits) || 0,
        courseId    || null,
        paymentUrl,
        JSON.stringify({ notes, bookingId, reference, studentName, studentEmail }),
        provider,
        reference,
      ]
    );

    const paymentId = dbResult.rows[0].id;

    /* Send the payment link to the parent via email */
    if (sendEmail) {
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
    }

    logger.info(`[PAYMENT LINK CREATED] ${provider} ref=${reference} amount=${usedCurrency} ${amount} student=${studentEmail}`);
    res.json({ success: true, paymentUrl, paymentId, reference, provider });

  } catch (err) { next(err); }
});

/* ════════════════════════════════════════════════════
   GET /api/payments/providers
════════════════════════════════════════════════════ */
router.get('/providers', requireAuth, requireRole('admin','super_admin','postsales','sales','presales'), (req, res) => {
  res.json({
    success: true,
    providers: [
      { id: 'fincra',      name: 'Fincra',      ready: !!(process.env.FINCRA_SECRET_KEY && process.env.FINCRA_PUBLIC_KEY && process.env.FINCRA_BUSINESS_ID),
        note: 'Lower fees for Nigerian payments' },
      { id: 'flutterwave', name: 'Flutterwave', ready: flutterwave.isConfigured() && !!process.env.FLW_SECRET_HASH,
        note: 'Collects from more countries' },
    ],
  });
});

/* ════════════════════════════════════════════════════
   POST /api/payments/fincra/webhook
   Called by Fincra when a payment is confirmed.
   Raw body required for signature verification
   (mounted with express.raw in index.js).
════════════════════════════════════════════════════ */
router.post(
  '/fincra/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    /* Always respond 200 immediately — Fincra retries on non-200 */
    res.json({ received: true });

    const signature = req.headers['x-webhook-signature'] || req.headers['x-fincra-signature'] || '';
    const rawBody   = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

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
    const currency   = data.currency || data.settlementCurrency || 'NGN';
    const status     = (data.status || '').toLowerCase();

    if (status && status !== 'successful' && status !== 'success') {
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
        /* Only a signed webhook may be trusted without the API check */
        verified = !!process.env.FINCRA_WEBHOOK_SECRET;
        logger.warn(`[FINCRA WEBHOOK] Could not verify with Fincra API (${verifyErr.message}) — ${verified ? 'proceeding on signed webhook' : 'ignoring'}`);
      }

      if (!verified) {
        logger.warn(`[FINCRA WEBHOOK] Payment ref=${reference} not verified as successful — ignoring`);
        return;
      }

      const payment = await findPaymentByReference(reference);
      if (!payment) {
        logger.warn(`[FINCRA WEBHOOK] No payment record found for reference: ${reference}`);
        return;
      }

      await applyConfirmedPayment(payment, {
        reference, amountPaid, currency, provider: 'fincra',
        method: (data.paymentMethod || data.payment_method || data.type || '').toString().toLowerCase() || null,
      });
    } catch (processingErr) {
      logger.error('[FINCRA WEBHOOK] Processing error:', processingErr.message, processingErr.stack);
    }
  }
);

/* ════════════════════════════════════════════════════
   POST /api/payments/flutterwave/webhook
   Flutterwave sends our secret hash in `verif-hash`;
   the transaction is then re-checked with their API.
════════════════════════════════════════════════════ */
router.post('/flutterwave/webhook', async (req, res) => {
  if (!flutterwave.verifyWebhook(req.headers)) {
    logger.error('[FLUTTERWAVE WEBHOOK] Invalid verif-hash — ignoring');
    return res.status(401).json({ received: false });
  }
  res.json({ received: true });

  const event = req.body || {};
  const data  = event.data || {};
  const eventType = String(event.event || event['event.type'] || '').toLowerCase();
  logger.info(`[FLUTTERWAVE WEBHOOK] Event ${eventType || 'unknown'} | tx_ref=${data.tx_ref || '—'} | status=${data.status || '—'}`);
  if (!eventType.includes('charge.completed') && !eventType.includes('charge_completion')) return;
  if (!data.id || !data.tx_ref) return;

  try {
    const tx = await flutterwave.verifyTransaction(data.id);
    if (String(tx.status).toLowerCase() !== 'successful') {
      logger.info(`[FLUTTERWAVE WEBHOOK] tx ${data.id} status=${tx.status} — ignoring`);
      return;
    }
    const payment = await findPaymentByReference(tx.tx_ref);
    if (!payment) {
      logger.warn(`[FLUTTERWAVE WEBHOOK] No payment record for tx_ref ${tx.tx_ref}`);
      return;
    }
    /* The amount and currency paid must match the link */
    if (String(tx.currency).toUpperCase() !== String(payment.currency).toUpperCase()
        || parseFloat(tx.amount) + 0.001 < parseFloat(payment.amount)) {
      logger.error(`[FLUTTERWAVE WEBHOOK] Amount mismatch for ${tx.tx_ref}: paid ${tx.currency} ${tx.amount}, expected ${payment.currency} ${payment.amount} — not applied`);
      return;
    }
    await applyConfirmedPayment(payment, {
      reference: tx.tx_ref, amountPaid: parseFloat(tx.amount), currency: tx.currency,
      provider: 'flutterwave', method: tx.payment_type || null, providerTxId: String(tx.id),
    });
  } catch (err) {
    logger.error('[FLUTTERWAVE WEBHOOK] Processing error:', err.message);
  }
});

async function findPaymentByReference(reference) {
  const r = await pool.query(
    `SELECT * FROM payments WHERE reference = $1 ORDER BY created_at DESC LIMIT 1`, [reference]);
  if (r.rows.length) return r.rows[0];
  /* Links created before the reference column existed */
  const old = await pool.query(
    `SELECT * FROM payments WHERE notes::text LIKE $1 OR payment_link LIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`%${reference}%`]
  );
  return old.rows[0] || null;
}

/**
 * A provider confirmed this payment: onboard the student if needed, add the
 * credits, log the credit activity, and send the receipt and team emails.
 * Safe to call twice — only the first call does anything.
 */
async function applyConfirmedPayment(payment, { reference, amountPaid, currency, provider, method, providerTxId }) {
  /* Claim the payment: only the first webhook delivery goes on */
  const claimed = await pool.query(
    `UPDATE payments SET status = 'confirmed', confirmed_at = NOW(),
            paid_at = COALESCE(paid_at, (NOW() AT TIME ZONE 'Africa/Lagos')::date),
            method = COALESCE($2, method), provider = COALESCE(provider, $3),
            fincra_payment_id = CASE WHEN $3 = 'fincra' THEN COALESCE(fincra_payment_id, $4) ELSE fincra_payment_id END
     WHERE id = $1 AND status <> 'confirmed' RETURNING id`,
    [payment.id, method || null, provider || null, providerTxId || null]
  );
  if (!claimed.rows.length) {
    logger.info(`[PAYMENT] Payment ${payment.id} already confirmed — skipping`);
    return false;
  }

  const credits     = parseInt(payment.credits_purchased) || 0;
  let   studentId   = payment.student_id;

  /* ── AUTO-ONBOARDING: if no student account exists, create one now ── */
  if (!studentId && credits > 0) {
    try {
      /* Pull student details from the payment notes */
      let payNotes = {};
      try { payNotes = typeof payment.notes === 'string' ? JSON.parse(payment.notes || '{}') : (payment.notes || {}); } catch {}

      const bookingId   = payNotes.bookingId || '';
      let studentName   = payNotes.studentName || 'Student';
      let studentEmail  = payNotes.studentEmail || '';
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
          'SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)', [studentEmail]
        );
        /* A family login's email: credit the child only when there is exactly one */
        if (existingUser.rows.length && existingUser.rows[0].role === 'parent') {
          const kids = await require('../services/familyService').childrenOf(pool, existingUser.rows[0].id);
          if (kids.length === 1) existingUser.rows[0] = { id: kids[0].id, role: 'student' };
          else {
            logger.warn(`[PAYMENT] Payment ${payment.id} is from family login ${studentEmail} with ${kids.length} children — assign the credits manually`);
            existingUser.rows = [];
            studentEmail = '';
          }
        } else if (existingUser.rows.length && existingUser.rows[0].role !== 'student') {
          logger.warn(`[PAYMENT] Payment ${payment.id} email belongs to a ${existingUser.rows[0].role} account — not applied`);
          existingUser.rows = [];
          studentEmail = '';
        }

        if (existingUser.rows.length) {
          /* Account exists — just link it */
          studentId = existingUser.rows[0].id;
          await pool.query(
            'UPDATE payments SET student_id = $1 WHERE id = $2',
            [studentId, payment.id]
          );
          logger.info(`[PAYMENT] Linked existing account ${studentId} to payment ${payment.id}`);
        } else if (studentEmail) {
          /* Create new student account */
          const bcrypt = require('bcrypt');
          const tempPassword = Math.random().toString(36).slice(-8) + '!S1';
          const passwordHash = await bcrypt.hash(tempPassword, 10);
          /* Account + profile together, with the next S-#### ID */
          let staffId;
          const tx = await pool.connect();
          try {
            await tx.query('BEGIN');
            staffId = await nextStudentId(tx);
            const newUser = await tx.query(
              `INSERT INTO users (name, email, role, password_hash, staff_id, is_active)
               VALUES ($1, $2, 'student', $3, $4, TRUE)
               RETURNING id`,
              [studentName, studentEmail, passwordHash, staffId]
            );
            studentId = newUser.rows[0].id;
            await tx.query(
              `INSERT INTO student_profiles (user_id, grade, credits, parent_name, parent_email, enrolled_at)
               VALUES ($1, $2, 0, $3, $4, NOW())`,
              [studentId, studentGrade, parentName || null, studentEmail]
            );
            /* The Pre-Sales handover for this demo is now onboarded; keep the promoter */
            if (bookingId) {
              await tx.query(
                `UPDATE users SET promoter_id = b.promoter_id FROM bookings b
                 WHERE b.id = $1 AND users.id = $2 AND b.promoter_id IS NOT NULL`, [bookingId, studentId]);
              await tx.query(
                `UPDATE enrollment_requests SET status = 'processed', processed_at = NOW(), student_id = $1,
                        payment_status = 'received'
                 WHERE booking_id = $2`,
                [studentId, bookingId]
              );
            }
            await tx.query('COMMIT');
          } catch (txErr) {
            await tx.query('ROLLBACK').catch(() => {});
            throw txErr;
          } finally {
            tx.release();
          }

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
          }).catch(e => logger.warn('[PAYMENT] Auto-onboarding email failed:', e.message));

          logger.info(`[PAYMENT] ✅ Auto-onboarded: student=${studentId} email=${studentEmail} staffId=${staffId}`);
        }
      }
    } catch (onboardErr) {
      logger.error('[PAYMENT] Auto-onboarding failed:', onboardErr.message);
      /* Non-fatal — payment is still confirmed, ops team will be notified */
    }
  }

  /* Add credits to student — handling negative balance (debt settlement) */
  if (studentId && credits > 0) {
    /* Add credits atomically (settles any negative balance) and lift suspension */
    const credResult = await pool.query(
      `INSERT INTO student_profiles (user_id, credits) VALUES ($2, $1)
       ON CONFLICT (user_id) DO UPDATE SET credits = COALESCE(student_profiles.credits, 0) + $1, credits_suspended = FALSE
       RETURNING credits`,
      [credits, studentId]
    );
    const newCredits     = parseInt(credResult.rows[0].credits, 10);
    const currentCredits = newCredits - credits;

    /* Log transaction — with what was paid, for the credit activity log */
    await pool.query(
      `INSERT INTO credit_transactions
         (student_id, type, amount, description, payment_id, amount_paid, currency, method, reference, paid_at, balance_after)
       VALUES ($1, 'topup', $2, $3, $4, $5, $6, $7, $8, (NOW() AT TIME ZONE 'Africa/Lagos')::date, $9)`,
      [
        studentId,
        credits,
        `Payment received${provider ? ' via ' + provider.charAt(0).toUpperCase() + provider.slice(1) : ''} — ${credits} credit${credits !== 1 ? 's' : ''} added`,
        payment.id,
        amountPaid || parseFloat(payment.amount) || null,
        (currency || payment.currency || null),
        method || null,
        reference || null,
        newCredits,
      ]
    );

    logger.info(`[PAYMENT] Credits updated: student=${studentId} prev=${currentCredits} added=${credits} new=${newCredits}`);

    /* Mark student as renewed in retention follow-up tracker */
    try {
      const { markStudentRenewed } = require('../jobs/retention');
      await markStudentRenewed(studentId);
    } catch (retErr) {
      logger.warn('[PAYMENT] markStudentRenewed failed:', retErr.message);
    }

    /* Classes on hold for credits come back automatically */
    await pauseSvc.autoResumeAfterTopUp(studentId);
    await promoSvc.rewardFirstPayment(studentId);

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
          }).catch(e => logger.warn('[PAYMENT] Receipt email failed:', e.message));
        }
      }
    } catch (emailErr) {
      logger.warn('[PAYMENT] Could not fetch student for receipt email:', emailErr.message);
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
      }).catch(e => logger.warn('[PAYMENT] LA email failed:', e.message));
      logger.info(`[PAYMENT] LA conversion email sent to ${laEmail}`);
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

  logger.info(`[PAYMENT] ✅ Payment confirmed: ref=${reference} payment=${payment.id} credits=${credits}`);
  return true;
}

/* ════════════════════════════════════════════════════
   POST /api/payments/manual-topup
   Post-Sales staff confirms a payment received outside
   the payment links (bank transfer, card, cash…), or
   adds credits as a referral reward. Adds credits
   instantly, logs them on the student's credit activity
   and (for payments) emails a receipt.
════════════════════════════════════════════════════ */
router.post('/manual-topup', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const { studentId, credits, amount, currency, notes, reference, paidAt } = req.body;
    const kind   = req.body.kind === 'referral_reward' ? 'referral_reward' : 'payment';
    const method = kind === 'referral_reward' ? 'referral_reward'
                 : (METHODS.includes(req.body.method) ? req.body.method : 'bank_transfer');

    if (!studentId || !UUID_RE.test(studentId)) return res.status(400).json({ success: false, error: 'studentId is required' });
    if (!credits || parseInt(credits) <= 0) return res.status(400).json({ success: false, error: 'credits must be a positive integer' });
    if (kind === 'payment' && (!amount || parseFloat(amount) <= 0)) return res.status(400).json({ success: false, error: 'amount must be a positive number' });
    if (paidAt && !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return res.status(400).json({ success: false, error: 'paidAt must be YYYY-MM-DD' });

    const creditsToAdd = parseInt(credits);
    const amountPaid   = kind === 'payment' ? parseFloat(amount) : 0;
    const usedCurrency = (currency || 'NGN').toUpperCase().slice(0, 5);
    const paidDate     = paidAt || new Date(Date.now() + 3600e3).toISOString().slice(0, 10);

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
    /* Add credits atomically and lift suspension */
    const upd = await pool.query(
      `INSERT INTO student_profiles (user_id, credits) VALUES ($2, $1)
       ON CONFLICT (user_id) DO UPDATE SET credits = COALESCE(student_profiles.credits, 0) + $1, credits_suspended = FALSE
       RETURNING credits`,
      [creditsToAdd, studentId]
    );
    const newCredits     = parseInt(upd.rows[0].credits, 10);
    const currentCredits = newCredits - creditsToAdd;

    /* Insert confirmed payment record */
    const payResult = await pool.query(
      `INSERT INTO payments
         (student_id, sales_id, amount, currency, credits_purchased, status, confirmed_at, notes, created_at,
          provider, reference, method, paid_at, kind)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW(), $6, NOW(), 'manual', $7, $8, $9, $10)
       RETURNING id`,
      [
        studentId,
        req.user.id,
        amountPaid,
        usedCurrency,
        creditsToAdd,
        JSON.stringify({
          method,
          confirmedBy:  req.user.email,
          notes:        notes || '',
          reference:    reference || null,
          previousCredits: currentCredits,
          newCredits,
        }),
        reference || null,
        method,
        paidDate,
        kind === 'referral_reward' ? 'referral_reward' : 'topup',
      ]
    );

    const paymentId = payResult.rows[0].id;

    /* Log credit transaction */
    await pool.query(
      `INSERT INTO credit_transactions
         (student_id, type, amount, description, payment_id, amount_paid, currency, method, reference, paid_at, balance_after, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        studentId,
        kind === 'referral_reward' ? 'referral_reward' : 'topup',
        creditsToAdd,
        kind === 'referral_reward'
          ? `Referral reward — ${creditsToAdd} free credit${creditsToAdd !== 1 ? 's' : ''}${notes ? ' (' + notes + ')' : ''}`
          : `Payment received — ${creditsToAdd} credit${creditsToAdd !== 1 ? 's' : ''} added${notes ? ' (' + notes + ')' : ''}`,
        paymentId,
        kind === 'payment' ? amountPaid : null,
        kind === 'payment' ? usedCurrency : null,
        method,
        reference || null,
        paidDate,
        newCredits,
        req.user.id,
      ]
    );

    /* Send receipt email to parent/student */
    const recipientEmail = student.parent_email || student.email;
    const recipientName  = student.parent_name  || student.name;

    if (recipientEmail && kind === 'payment') {
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
          reference:   reference || `MANUAL-${paymentId}`,
        }).catch(e => logger.warn('[MANUAL-TOPUP] Receipt email failed:', e.message));
      } catch (emailErr) {
        logger.warn('[MANUAL-TOPUP] Email error:', emailErr.message);
      }
    }
    await notify.saveNotification(studentId, 'credits_added',
      kind === 'referral_reward' ? '🎁 Referral reward' : '✅ Payment received',
      `${creditsToAdd} class credit${creditsToAdd !== 1 ? 's' : ''} added. Your balance is now ${newCredits}.`
    ).catch(() => {});

    /* Classes on hold for credits come back automatically */
    const resume = await pauseSvc.autoResumeAfterTopUp(studentId);
    /* A promoter earns their % of the student's first real payment */
    if (kind === 'payment') await promoSvc.rewardFirstPayment(studentId);

    logger.info(`[MANUAL-TOPUP] ${kind} student=${studentId} name=${student.name} added=${creditsToAdd} new=${newCredits} by=${req.user.email}`);

    res.json({ success: true, newCredits, paymentId, resume });

  } catch (err) { next(err); }
});

/* ════════════════════════════════════════════════════
   GET /api/payments/student-search?q=
   By student ID (S-0123), name, email, parent's name /
   email, or a family login (all the family's children).
════════════════════════════════════════════════════ */
router.get('/student-search', requireAuth, requireRole('admin','super_admin','postsales','sales','presales'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, students: [] });
    const like = '%' + q.toLowerCase() + '%';
    const r = await pool.query(
      `WITH fam AS (
         SELECT fl.student_id FROM parent_children fl JOIN users p ON p.id = fl.parent_id
         WHERE LOWER(p.name) LIKE $1 OR LOWER(p.email) LIKE $1
       )
       SELECT u.id, u.name, u.email, u.staff_id AS "staffId", u.is_active AS "isActive",
              sp.credits, sp.grade, sp.parent_name AS "parentName", sp.parent_email AS "parentEmail",
              COALESCE(sp.class_paused, FALSE) AS paused,
              (SELECT p.name FROM parent_children fl JOIN users p ON p.id = fl.parent_id
                WHERE fl.student_id = u.id LIMIT 1) AS "familyName",
              (SELECT json_build_object('id', pm.id, 'url', pm.payment_link, 'amount', pm.amount, 'currency', pm.currency,
                                        'credits', pm.credits_purchased, 'provider', pm.provider, 'createdAt', pm.created_at)
                 FROM payments pm WHERE pm.student_id = u.id AND pm.status = 'pending' AND pm.payment_link IS NOT NULL
                 ORDER BY pm.created_at DESC LIMIT 1) AS "openLink"
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'student' AND (
             LOWER(COALESCE(u.staff_id, '')) = LOWER($2)
          OR LOWER(u.name) LIKE $1 OR LOWER(u.email) LIKE $1
          OR LOWER(COALESCE(sp.parent_name, '')) LIKE $1 OR LOWER(COALESCE(sp.parent_email, '')) LIKE $1
          OR u.id IN (SELECT student_id FROM fam))
       ORDER BY (LOWER(COALESCE(u.staff_id, '')) = LOWER($2)) DESC, u.name
       LIMIT 25`,
      [like, q]
    );
    res.json({ success: true, students: r.rows });
  } catch (err) { next(err); }
});

/* ════════════════════════════════════════════════════
   GET /api/payments/credit-log/:studentId
   The student's credit activity, newest first, with
   the balance after each line.
════════════════════════════════════════════════════ */
router.get('/credit-log/:studentId', requireAuth, async (req, res, next) => {
  try {
    const sid = req.params.studentId === 'me' ? req.user.id : req.params.studentId;
    if (!UUID_RE.test(sid)) return res.status(400).json({ success: false, error: 'Invalid student' });
    const staff = ['admin', 'super_admin', 'postsales', 'sales', 'presales', 'operations'].includes(req.user.role);
    if (!staff && req.user.id !== sid) return res.status(403).json({ success: false, error: 'Access denied' });

    const bal = await pool.query('SELECT credits FROM student_profiles WHERE user_id = $1', [sid]);
    const balance = bal.rows.length ? parseInt(bal.rows[0].credits || 0, 10) : 0;
    const r = await pool.query(
      `SELECT ct.id, ct.type, ct.amount, ct.description, ct.created_at AS "createdAt",
              ct.amount_paid::float AS "amountPaid", ct.currency, ct.method, ct.reference,
              to_char(ct.paid_at, 'YYYY-MM-DD') AS "paidAt", ct.balance_after AS "balanceAfter",
              to_char(b.date, 'YYYY-MM-DD') AS "classDate", to_char(b.time, 'HH24:MI') AS "classTime", b.subject,
              tu.name AS "tutorName",
              p.amount::float AS "paymentAmount", p.currency AS "paymentCurrency", p.provider,
              to_char(COALESCE(p.paid_at, (p.confirmed_at AT TIME ZONE 'Africa/Lagos')::date), 'YYYY-MM-DD') AS "paymentDate"
       FROM credit_transactions ct
       LEFT JOIN bookings b ON b.id = ct.booking_id
       LEFT JOIN users tu ON tu.id = b.tutor_id
       LEFT JOIN payments p ON p.id = ct.payment_id
       WHERE ct.student_id = $1
       ORDER BY ct.created_at DESC, ct.id DESC
       LIMIT 500`,
      [sid]
    );

    /* Fill in the balance after each line, working back from today's balance */
    let running = balance;
    const entries = r.rows.map(e => {
      const after = running;
      running -= parseInt(e.amount || 0, 10);
      return {
        ...e,
        balanceAfter: after,
        amountPaid: e.amountPaid ?? (e.paymentAmount || null),
        currency: e.currency || e.paymentCurrency || null,
        paidAt: e.paidAt || e.paymentDate || null,
      };
    });
    /* Credits that existed before the log started */
    if (running !== 0) {
      const first = r.rows.length ? r.rows[r.rows.length - 1].createdAt : null;
      entries.push({ id: 'opening', type: 'opening_balance', amount: running, balanceAfter: running,
                     description: 'Balance before the activity log started', createdAt: first });
    }

    /* Payments with no credit line (e.g. onboarding payments recorded separately) */
    const pays = await pool.query(
      `SELECT p.id, p.amount::float AS amount, p.currency, p.credits_purchased AS credits, p.provider, p.method,
              to_char(COALESCE(p.paid_at, (COALESCE(p.confirmed_at, p.created_at) AT TIME ZONE 'Africa/Lagos')::date), 'YYYY-MM-DD') AS "paidAt",
              COALESCE(p.kind, 'topup') AS kind
       FROM payments p
       WHERE p.student_id = $1 AND p.status = 'confirmed'
       ORDER BY COALESCE(p.confirmed_at, p.created_at) DESC`,
      [sid]
    );

    res.json({ success: true, balance, entries, payments: pays.rows });
  } catch (err) { next(err); }
});

/* ════════════════════════════════════════════════════
   GET /api/payments/my-top-up
   The most recent open payment link for this student
   (the dashboard's Top up button opens it).
════════════════════════════════════════════════════ */
router.get('/my-top-up', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success: false, error: 'Students only' });
    const r = await pool.query(
      `SELECT id, payment_link AS url, amount::float AS amount, currency, credits_purchased AS credits,
              provider, created_at AS "createdAt"
       FROM payments
       WHERE student_id = $1 AND status = 'pending' AND payment_link IS NOT NULL
         AND created_at > NOW() - INTERVAL '60 days'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json({ success: true, link: r.rows[0] || null });
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
             u_s.name         AS student_name,
             u_s.email        AS student_email,
             u_s.phone        AS student_phone,
             u_s.whatsapp     AS student_whatsapp,
             u_s.staff_id     AS student_staff_id,
             u_s.date_of_birth AS student_dob,
             u_sp.name        AS sales_name,
             sp.grade         AS student_grade,
             sp.age           AS student_age,
             sp.parent_name   AS student_parent_name,
             sp.enrolled_at   AS student_enrolled_at,
             COALESCE(
               c.name,
               (SELECT b.subject FROM bookings b
                WHERE b.student_id = p.student_id
                  AND b.is_demo = FALSE
                  AND b.subject IS NOT NULL
                  AND b.subject <> ''
                ORDER BY b.booked_at DESC LIMIT 1)
             ) AS course_name
      FROM payments p
      LEFT JOIN users u_s         ON u_s.id   = p.student_id
      LEFT JOIN users u_sp        ON u_sp.id  = p.sales_id
      LEFT JOIN courses c         ON c.id     = p.course_id
      LEFT JOIN student_profiles sp ON sp.user_id = p.student_id`;
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
module.exports.applyConfirmedPayment = applyConfirmedPayment;
