/**
 * StemNest Academy — WhatsApp Service (Twilio)
 * All WhatsApp messages go through sendWhatsApp().
 * In development (no Twilio creds), messages are logged to console.
 */

const logger = require('../utils/logger');

let twilioClient = null;

function getClient() {
  if (twilioClient) return twilioClient;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return twilioClient;
}

/**
 * Send a WhatsApp message via Twilio.
 * @param {string} to   - recipient number e.g. "+447700000000"
 * @param {string} body - message text
 */
async function sendWhatsApp(to, body) {
  const client = getClient();
  const from   = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  // Normalise number
  const toFormatted = to.startsWith('whatsapp:') ? to : 'whatsapp:' + to.replace(/\s/g, '');

  if (!client) {
    logger.info(`[WHATSAPP SIMULATED] To: ${to}\n${body}`);
    return { simulated: true };
  }

  try {
    const msg = await client.messages.create({ from, to: toFormatted, body });
    logger.info(`[WHATSAPP SENT] To: ${to} | SID: ${msg.sid}`);
    return msg;
  } catch (err) {
    logger.error(`[WHATSAPP FAILED] To: ${to} | ${err.message}`);
    throw err;
  }
}

/* ── Templates ── */

async function sendDemoConfirmationWA({ to, parentName, studentName, subject, date, time, bookingId, joinUrl }) {
  const body = `🎉 *Demo Class Confirmed — StemNest Academy!*

Hi${parentName ? ' ' + parentName : ''}! *${studentName}*'s FREE demo class is booked ✅

📚 *Subject:* ${subject}
📅 *Date:* ${date}
🕐 *Time:* ${time}
🆔 *Booking ID:* ${bookingId}

*To join the class:*
👉 ${joinUrl}

You'll get reminder calls 30 & 10 mins before class 📞

See you soon! 🚀 — StemNest Academy`;
  return sendWhatsApp(to, body);
}

async function sendClassReminderWA({ to, name, studentName, subject, time, classLink }) {
  const body = `⏰ *Class in 15 Minutes!*

Hi ${name}! Your *${subject}* class with ${studentName} starts at *${time}*.

${classLink ? '🔗 Join here: ' + classLink : ''}

Good luck! 🚀 — StemNest Academy`;
  return sendWhatsApp(to, body);
}

async function sendPasswordResetWA({ to, name, resetUrl }) {
  const body = `🔐 *StemNest Academy — Password Reset*

Hi ${name}, we received a request to reset your password.

Click here to reset (expires in 30 mins):
${resetUrl}

If you didn't request this, ignore this message.`;
  return sendWhatsApp(to, body);
}

async function sendLowCreditsWA({ to, studentName, creditsRemaining }) {
  const body = `⚠️ *Credits Running Low — StemNest Academy*

Hi! *${studentName}* has only *${creditsRemaining} credit${creditsRemaining !== 1 ? 's' : ''}* remaining.

Top up now to keep learning without interruption 👇
${process.env.APP_URL}/pages/student-dashboard.html`;
  return sendWhatsApp(to, body);
}

async function sendPaymentLinkWA({ to, studentName, course, amount, currency, paymentUrl }) {
  const body = `💳 *Payment Link — StemNest Academy*

Hi! Here is the payment link for *${studentName}*'s enrolment in *${course}*:

💰 Amount: ${currency} ${amount}

👉 Pay here: ${paymentUrl}

This link is secure and expires in 48 hours.`;
  return sendWhatsApp(to, body);
}

async function sendBirthdayWA({ to, name, message }) {
  const body = `🎂 *Happy Birthday, ${name}!*

${message || 'Wishing you a wonderful birthday from all of us at StemNest Academy! 🎉'}

Keep up the amazing work! — StemNest Academy`;
  return sendWhatsApp(to, body);
}

module.exports = {
  sendWhatsApp,
  sendDemoConfirmationWA,
  sendClassReminderWA,
  sendPasswordResetWA,
  sendLowCreditsWA,
  sendPaymentLinkWA,
  sendBirthdayWA,
};
