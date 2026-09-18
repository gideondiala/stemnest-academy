/**
 * StemNest Academy — Fincra Payment Service
 * Wraps the Fincra Checkout & Webhook API
 *
 * Docs: https://docs.fincra.com/reference/initiate-checkout
 * Live base URL: https://api.fincra.com
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const FINCRA_BASE_URL = 'https://api.fincra.com';

/**
 * Create a Fincra checkout payment link.
 *
 * @param {object} opts
 * @param {number}  opts.amount        - Amount in major currency units (e.g. 150 for £150)
 * @param {string}  opts.currency      - ISO currency code: GBP, NGN, USD, GHS, KES, etc.
 * @param {string}  opts.customerName  - Parent / payer name
 * @param {string}  opts.customerEmail - Parent email
 * @param {string}  opts.reference     - Unique reference for this payment (our internal ID)
 * @param {string}  opts.description   - What the payment is for (shown on checkout page)
 * @param {string}  opts.redirectUrl   - Where to send parent after payment
 * @returns {object} { checkoutUrl, reference, data }
 */
async function createCheckout({ amount, currency, customerName, customerEmail, reference, description, redirectUrl }) {
  const secretKey   = process.env.FINCRA_SECRET_KEY;
  const publicKey   = process.env.FINCRA_PUBLIC_KEY;
  const businessId  = process.env.FINCRA_BUSINESS_ID;

  if (!secretKey || !publicKey || !businessId) {
    throw new Error('Fincra credentials not configured. Check FINCRA_SECRET_KEY, FINCRA_PUBLIC_KEY, FINCRA_BUSINESS_ID in .env');
  }

  const payload = {
    amount:   Math.round(parseFloat(amount)), // Fincra expects integer
    currency: (currency || 'GBP').toUpperCase(),
    customer: {
      name:  customerName  || 'StemNest Parent',
      email: customerEmail || '',
    },
    reference:    reference || `SN-${Date.now()}`,
    redirectUrl:  redirectUrl || `${process.env.APP_URL || 'https://stemnestacademy.co.uk'}/pages/payment-success.html`,
    paymentMethods: ['card', 'bank_transfer'],
    feeBearer: 'business', // StemNest absorbs transaction fees
  };

  logger.info(`[FINCRA] Creating checkout: ${payload.currency} ${payload.amount} for ${customerEmail} ref=${payload.reference}`);

  const response = await fetch(`${FINCRA_BASE_URL}/checkout/payments`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'api-key':       secretKey,
      'x-pub-key':     publicKey,
      'x-business-id': businessId,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    logger.error(`[FINCRA] Checkout creation failed: ${JSON.stringify(data)}`);
    throw new Error(data.message || data.error || 'Fincra checkout creation failed');
  }

  /* Fincra returns the checkout link in data.data.link or data.link */
  const checkoutUrl = data?.data?.link || data?.link || data?.data?.paymentLink;

  if (!checkoutUrl) {
    logger.error(`[FINCRA] No checkout URL in response: ${JSON.stringify(data)}`);
    throw new Error('Fincra did not return a checkout link. Check API credentials.');
  }

  logger.info(`[FINCRA] Checkout created: ${checkoutUrl}`);
  return { checkoutUrl, reference: payload.reference, data };
}

/**
 * Verify a Fincra webhook signature.
 * Fincra signs the raw request body with HMAC-SHA512 using your webhook secret.
 *
 * @param {string|Buffer} rawBody  - The raw request body (Buffer)
 * @param {string}        signature - Value of 'x-webhook-signature' header
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature) {
  const webhookSecret = process.env.FINCRA_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.warn('[FINCRA] FINCRA_WEBHOOK_SECRET not set — skipping signature verification');
    return true; // Allow in dev if not configured
  }
  if (!signature) {
    logger.warn('[FINCRA] No webhook signature header received');
    return false;
  }

  try {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const computed = crypto
      .createHmac('sha512', webhookSecret)
      .update(body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch (err) {
    logger.error('[FINCRA] Signature verification error:', err.message);
    return false;
  }
}

/**
 * Verify a payment status directly with Fincra by reference.
 * Used as a safety check after webhook receipt.
 *
 * @param {string} reference - The payment reference
 * @returns {object} Fincra payment status object
 */
async function verifyPayment(reference) {
  const secretKey  = process.env.FINCRA_SECRET_KEY;
  const businessId = process.env.FINCRA_BUSINESS_ID;

  const response = await fetch(
    `${FINCRA_BASE_URL}/checkout/payments/merchant-reference/${reference}`,
    {
      headers: {
        'api-key':       secretKey,
        'x-business-id': businessId,
        'Accept':        'application/json',
      },
    }
  );

  const data = await response.json();
  return data?.data || data;
}

module.exports = { createCheckout, verifyWebhookSignature, verifyPayment };
