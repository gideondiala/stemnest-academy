/**
 * Grey Finance Payment Routes
 *
 * GET  /api/grey/account-details   — returns USD (and GBP when available) bank details
 * POST /api/grey/payment-reference — generates a unique SN-REF-XXXX for a payment request
 * GET  /api/grey/payment-reference/:ref — check status of a payment reference
 * POST /api/grey/webhook           — receives Grey transaction webhooks (public, HMAC-verified)
 */

const express = require('express');
const crypto  = require('crypto');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const emailService = require('../services/emailService');
const logger  = require('../utils/logger');

const router = express.Router();

/* ══════════════════════════════════════════════
   GET /api/grey/account-details
   Returns bank details to show parents on payment screen
══════════════════════════════════════════════ */
router.get('/account-details', requireAuth, (req, res) => {
  const accounts = [];

  /* USD account — always available */
  if (process.env.GREY_USD_ACCOUNT_NUMBER) {
    accounts.push({
      currency:     'USD',
      flag:         '🇺🇸',
      label:        'US Dollar (USD)',
      accountName:  'StemNest Academy Ltd',
      accountNumber: process.env.GREY_USD_ACCOUNT_NUMBER,
      routingNumber: process.env.GREY_USD_ROUTING,
      accountType:  'Checking',
      bankName:     process.env.GREY_USD_BANK_NAME     || 'Lead Bank',
      bankAddress:  process.env.GREY_USD_BANK_ADDRESS  || '1801 Main St., Kansas City, MO 64108',
      instructions: 'Use ACH or Wire transfer. Include your payment reference in the memo/description field.',
    });
  }

  /* GBP account — added when available */
  if (process.env.GREY_GBP_ACCOUNT_NUMBER) {
    accounts.push({
      currency:     'GBP',
      flag:         '🇬🇧',
      label:        'British Pound (GBP)',
      accountName:  'StemNest Academy Ltd',
      accountNumber: process.env.GREY_GBP_ACCOUNT_NUMBER,
      sortCode:     process.env.GREY_GBP_SORT_CODE,
      accountType:  'Business',
      bankName:     process.env.GREY_GBP_BANK_NAME || 'Grey Finance',
      instructions: 'Use Faster Payments or BACS. Include your payment reference in the reference field.',
    });
  }

  res.json({ success: true, accounts });
});

/* ══════════════════════════════════════════════
   POST /api/grey/payment-reference
   Generates a unique SN-REF-XXXX for a payment request
   Links it to an enrollment_request or referral record
══════════════════════════════════════════════ */
router.post('/payment-reference', requireAuth, requireRole('postsales', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { enrollmentRequestId, referralId, studentName, amount, currency, notes } = req.body;

    if (!studentName) return res.status(400).json({ success: false, error: 'studentName required' });
    if (!amount)      return res.status(400).json({ success: false, error: 'amount required' });

    /* Generate unique reference: SN-2026-XXXXX */
    const year = new Date().getFullYear();
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    const reference = `SN-${year}-${rand}`;

    /* Store in DB */
    await pool.query(
      `INSERT INTO grey_payment_references
         (reference, enrollment_request_id, referral_id, student_name,
          amount, currency, notes, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [reference, enrollmentRequestId || null, referralId || null,
       studentName, parseFloat(amount), currency || 'USD',
       notes || null, req.user.id]
    );

    logger.info(`[GREY] Payment reference created: ${reference} for ${studentName} — ${currency || 'USD'} ${amount}`);
    res.status(201).json({ success: true, reference });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GET /api/grey/payment-reference/:ref
   Check status of a payment reference
══════════════════════════════════════════════ */
router.get('/payment-reference/:ref', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM grey_payment_references WHERE reference = $1`,
      [req.params.ref]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Reference not found' });
    }
    res.json({ success: true, reference: result.rows[0] });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   POST /api/grey/webhook
   Receives Grey Finance transaction webhooks
   Verifies HMAC-SHA256 signature
   On transaction.success → auto-confirms payment
══════════════════════════════════════════════ */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    const signature = req.headers['x-webhook-signature'] || '';
    const secret    = process.env.GREY_WEBHOOK_SECRET || '';
    const body      = req.body; /* raw Buffer — express.raw() above */

    /* ── Verify HMAC-SHA256 signature ── */
    if (secret && signature) {
      const expected = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        logger.warn('[GREY WEBHOOK] Invalid signature — rejected');
        return res.status(401).json({ success: false, error: 'Invalid signature' });
      }
    }

    const payload = JSON.parse(body.toString());
    const eventType = payload.event_type || req.headers['x-webhook-event'];

    logger.info(`[GREY WEBHOOK] Event: ${eventType} | Ref: ${payload.transaction_reference} | Amount: ${payload.source_currency} ${payload.amount}`);

    /* ── Only act on successful transactions ── */
    if (eventType === 'transaction.success') {
      const ref = payload.transaction_reference;

      if (ref && ref.startsWith('SN-')) {
        /* Find the payment reference record */
        const refResult = await pool.query(
          `SELECT * FROM grey_payment_references WHERE reference = $1 AND status = 'pending'`,
          [ref]
        );

        if (refResult.rows.length) {
          const payRef = refResult.rows[0];

          /* Mark reference as paid */
          await pool.query(
            `UPDATE grey_payment_references
             SET status = 'paid', paid_at = NOW(),
                 grey_transaction_id = $1, paid_amount = $2
             WHERE reference = $3`,
            [payload.transaction_id, payload.amount, ref]
          );

          /* Auto-confirm the linked enrollment request */
          if (payRef.enrollment_request_id) {
            await pool.query(
              `UPDATE enrollment_requests
               SET payment_status = 'received', status = 'processed',
                   processed_at = NOW()
               WHERE id = $1`,
              [payRef.enrollment_request_id]
            );
            logger.info(`[GREY WEBHOOK] Enrollment request ${payRef.enrollment_request_id} auto-confirmed`);
          }

          /* Auto-confirm the linked referral */
          if (payRef.referral_id) {
            await pool.query(
              `UPDATE referrals
               SET payment_status = 'received', status = 'enrolled'
               WHERE id = $1`,
              [payRef.referral_id]
            );
            logger.info(`[GREY WEBHOOK] Referral ${payRef.referral_id} auto-confirmed`);
          }

          /* Send payment confirmation email if we have student email */
          try {
            const emailResult = await pool.query(
              `SELECT email FROM enrollment_requests WHERE id = $1
               UNION
               SELECT parent_email AS email FROM referrals WHERE id = $2`,
              [payRef.enrollment_request_id || 0, payRef.referral_id || 0]
            );
            const email = emailResult.rows[0]?.email;
            if (email) {
              await emailService.sendEmail({
                to: email,
                subject: `✅ Payment Confirmed — StemNest Academy`,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
                    <h2 style="color:#1a56db;">✅ Payment Received!</h2>
                    <p>Hi there,</p>
                    <p>We've received your payment of <strong>${payload.source_currency} ${payload.amount}</strong> for <strong>${payRef.student_name}</strong>'s enrollment at StemNest Academy.</p>
                    <p><strong>Reference:</strong> ${ref}</p>
                    <p>Our team will be in touch shortly to complete the onboarding and schedule the first class.</p>
                    <hr>
                    <p style="font-size:12px;color:#718096;">StemNest Academy Ltd · stemnestacademy.co.uk</p>
                  </div>
                `,
                template: 'payment_confirmed',
              });
            }
          } catch (emailErr) {
            logger.warn('[GREY WEBHOOK] Email send failed:', emailErr.message);
          }
        }
      }
    }

    /* Always respond 200 to Grey so they don't retry */
    res.status(200).json({ success: true, received: true });
  } catch (err) {
    logger.error('[GREY WEBHOOK] Error:', err.message);
    /* Still return 200 — don't let Grey keep retrying on our errors */
    res.status(200).json({ success: true, received: true });
  }
});

module.exports = router;
