/**
 * StemNest Academy — Flutterwave Payment Service (Standard checkout, API v3)
 *
 * Env:
 *   FLW_SECRET_KEY  — secret key from the Flutterwave dashboard (Settings → API keys)
 *   FLW_SECRET_HASH — the "Secret hash" you set under Settings → Webhooks;
 *                     Flutterwave sends it back in the `verif-hash` header.
 *
 * Webhook URL to enter in the Flutterwave dashboard:
 *   https://api.stemnestacademy.co.uk/api/payments/flutterwave/webhook
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const FLW_BASE_URL = 'https://api.flutterwave.com/v3';

function isConfigured() { return !!process.env.FLW_SECRET_KEY; }

/**
 * Create a hosted checkout link.
 * @returns {object} { checkoutUrl, reference }
 */
async function createCheckout({ amount, currency, customerName, customerEmail, customerPhone, reference, description, redirectUrl }) {
  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) throw new Error('Flutterwave is not set up yet — FLW_SECRET_KEY is missing on the server');

  const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
  const payload = {
    tx_ref:       reference,
    amount:       String(Math.round(parseFloat(amount) * 100) / 100),
    currency:     (currency || 'NGN').toUpperCase(),
    redirect_url: redirectUrl || `${appUrl}/pages/payment-success.html?ref=${encodeURIComponent(reference)}`,
    customer: {
      email:       customerEmail || '',
      name:        customerName  || 'StemNest Parent',
      ...(customerPhone ? { phonenumber: customerPhone } : {}),
    },
    customizations: {
      title:       'StemNest Academy',
      description: description || 'Class credits',
      logo:        `${appUrl}/assets/icons/icon.png`,
    },
    meta: { source: 'stemnest' },
  };

  logger.info(`[FLUTTERWAVE] Creating checkout: ${payload.currency} ${payload.amount} for ${customerEmail} ref=${reference}`);
  const response = await fetch(`${FLW_BASE_URL}/payments`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status !== 'success' || !data.data || !data.data.link) {
    logger.error(`[FLUTTERWAVE] Checkout creation failed: ${JSON.stringify(data).slice(0, 500)}`);
    throw new Error(data.message || 'Flutterwave checkout creation failed');
  }
  return { checkoutUrl: data.data.link, reference };
}

/** The webhook is genuine when its verif-hash header equals our secret hash. */
function verifyWebhook(headers) {
  const secretHash = process.env.FLW_SECRET_HASH;
  if (!secretHash) {
    logger.warn('[FLUTTERWAVE] FLW_SECRET_HASH not set — webhook rejected');
    return false;
  }
  const got = String(headers['verif-hash'] || '');
  const a = Buffer.from(got), b = Buffer.from(secretHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Ask Flutterwave for the real state of a transaction (never trust the webhook body alone). */
async function verifyTransaction(transactionId) {
  const secretKey = process.env.FLW_SECRET_KEY;
  const response = await fetch(`${FLW_BASE_URL}/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status !== 'success') throw new Error(data.message || 'Flutterwave verification failed');
  return data.data;   /* { id, tx_ref, status, amount, currency, payment_type, ... } */
}

module.exports = { isConfigured, createCheckout, verifyWebhook, verifyTransaction };
