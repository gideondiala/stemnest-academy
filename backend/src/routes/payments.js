/**
 * Payments routes
 * POST /api/payments/create-link    — generate Stripe payment link
 * POST /api/payments/webhook        — Stripe webhook (auto-confirm)
 * GET  /api/payments                — list payments (admin/postsales)
 * GET  /api/payments/student/:id    — student payment history
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const notify  = require('../services/notificationService');
const logger  = require('../utils/logger');

const router = express.Router();

/* ── POST /api/payments/create-link ── */
router.post('/create-link', requireAuth, requireRole('admin','super_admin','postsales','sales'), async (req, res, next) => {
  try {
    const { studentId, studentName, studentEmail, courseId, amount, currency, credits, notes } = req.body;

    if (!studentEmail || !amount) {
      return res.status(400).json({ success: false, error: 'studentEmail and amount required' });
    }

    let paymentUrl;
    let stripeSessionId = null;

    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      /* Real Stripe payment link */
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      const courseResult = courseId
        ? await pool.query('SELECT name FROM courses WHERE id = $1', [courseId])
        : { rows: [] };
      const courseName = courseResult.rows[0]?.name || 'StemNest Course';

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: studentEmail,
        line_items: [{
          price_data: {
            currency: (currency || 'gbp').toLowerCase(),
            product_data: {
              name: `StemNest Academy — ${courseName}`,
              description: notes || `${credits || ''} class credits`,
            },
            unit_amount: Math.round(parseFloat(amount) * 100),
          },
          quantity: 1,
        }],
        metadata: {
          studentId:  studentId || '',
          studentName: studentName || '',
          courseId:   courseId || '',
          credits:    String(credits || 0),
          salesId:    req.user.id,
        },
        success_url: `${process.env.APP_URL}/pages/student-dashboard.html?payment=success`,
        cancel_url:  `${process.env.APP_URL}/pages/student-dashboard.html?payment=cancelled`,
      });

      paymentUrl     = session.url;
      stripeSessionId = session.id;
    } else {
      /* Dev stub */
      paymentUrl = `${process.env.APP_URL}/pages/student-dashboard.html?payment=demo&ref=${Date.now()}`;
      logger.info('[PAYMENT LINK SIMULATED] Stripe not configured');
    }

    /* Save payment record */
    const result = await pool.query(
      `INSERT INTO payments (student_id, sales_id, amount, currency, credits_purchased,
                             course_id, stripe_session_id, status, payment_link, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)
       RETURNING id`,
      [studentId || null, req.user.id, amount, currency || 'GBP',
       credits || 0, courseId || null, stripeSessionId, paymentUrl, notes || null]
    );

    /* Send payment link to parent */
    if (studentEmail) {
      const courseResult2 = courseId
        ? await pool.query('SELECT name FROM courses WHERE id = $1', [courseId])
        : { rows: [] };
      await notify.notifyLowCredits; // placeholder — use sendPaymentLinkEmail directly
      const emailSvc = require('../services/emailService');
      await emailSvc.sendPaymentLinkEmail({
        to: studentEmail, studentName: studentName || 'Student',
        course: courseResult2.rows[0]?.name || 'Course',
        amount, currency: currency || 'GBP', paymentUrl,
      }).catch(e => logger.error('Payment link email failed:', e.message));
    }

    res.json({ success: true, paymentUrl, paymentId: result.rows[0].id });
  } catch (err) { next(err); }
});

/* ── POST /api/payments/webhook (Stripe) ── */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return res.json({ received: true }); // dev mode
  }

  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    logger.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const metadata = session.metadata || {};

    try {
      /* Mark payment confirmed */
      await pool.query(
        `UPDATE payments SET status = 'confirmed', confirmed_at = NOW()
         WHERE stripe_session_id = $1`,
        [session.id]
      );

      /* Add credits to student */
      const credits = parseInt(metadata.credits) || 0;
      if (metadata.studentId && credits > 0) {
        await pool.query(
          `UPDATE student_profiles SET credits = credits + $1 WHERE user_id = $2`,
          [credits, metadata.studentId]
        );
        await pool.query(
          `INSERT INTO credit_transactions (student_id, type, amount, description)
           VALUES ($1, 'topup', $2, 'Payment confirmed — credits added')`,
          [metadata.studentId, credits]
        );

        /* Notify student */
        await notify.saveNotification(metadata.studentId, 'payment_confirmed',
          '✅ Payment Confirmed', `${credits} class credit${credits !== 1 ? 's' : ''} added to your account.`);
      }

      logger.info(`[PAYMENT CONFIRMED] Session ${session.id} · ${credits} credits for student ${metadata.studentId}`);
    } catch (err) {
      logger.error('Webhook processing error:', err.message);
    }
  }

  res.json({ received: true });
});

/* ── GET /api/payments ── */
router.get('/', requireAuth, requireRole('admin','super_admin','postsales'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u_s.name AS student_name, u_s.email AS student_email,
              u_sp.name AS sales_name, c.name AS course_name
       FROM payments p
       LEFT JOIN users u_s  ON u_s.id  = p.student_id
       LEFT JOIN users u_sp ON u_sp.id = p.sales_id
       LEFT JOIN courses c  ON c.id    = p.course_id
       ORDER BY p.created_at DESC
       LIMIT 200`
    );
    res.json({ success: true, payments: result.rows });
  } catch (err) { next(err); }
});

/* ── GET /api/payments/student/:id ── */
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
