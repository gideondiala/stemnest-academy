/**
 * StemNest Academy — Email Service
 * Uses AWS SES in production, Nodemailer SMTP in development.
 * All outbound emails go through sendEmail() — never call the
 * provider SDK directly from routes.
 */

const nodemailer = require('nodemailer');
const logger     = require('../utils/logger');
const pool       = require('../config/db');

/* ─────────────────────────────────────────────
   TRANSPORTER
───────────────────────────────────────────── */
function createTransporter() {
  if (process.env.NODE_ENV === 'production') {
    // AWS SES via SMTP (simpler than SDK, same deliverability)
    return nodemailer.createTransport({
      host:   'email-smtp.' + (process.env.AWS_REGION || 'eu-west-2') + '.amazonaws.com',
      port:   587,
      secure: false,
      auth: {
        user: process.env.AWS_SES_SMTP_USER,   // from AWS SES SMTP credentials
        pass: process.env.AWS_SES_SMTP_PASS,
      },
    });
  }
  // Development: log to console (no real sending)
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/* ─────────────────────────────────────────────
   CORE SEND FUNCTION
───────────────────────────────────────────── */
async function sendEmail({ to, subject, html, text, template }) {
  const from = `"${process.env.EMAIL_FROM_NAME || 'StemNest Academy'}" <${process.env.EMAIL_FROM || 'no-reply@stemnestacademy.co.uk'}>`;

  // In dev with no SMTP configured, just log
  if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_USER) {
    logger.info(`[EMAIL SIMULATED] To: ${to} | Subject: ${subject}`);
    await _logEmail(to, subject, template, 'simulated', null, null);
    return { simulated: true };
  }

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({ from, to, subject, html, text });
    logger.info(`[EMAIL SENT] To: ${to} | Subject: ${subject} | ID: ${info.messageId}`);
    await _logEmail(to, subject, template, 'sent', info.messageId, null);
    return info;
  } catch (err) {
    logger.error(`[EMAIL FAILED] To: ${to} | Error: ${err.message}`);
    await _logEmail(to, subject, template, 'failed', null, err.message);
    throw err;
  }
}

async function _logEmail(to, subject, template, status, messageId, error) {
  try {
    await pool.query(
      `INSERT INTO email_log (to_email, subject, template, status, provider, message_id, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [to, subject, template || null, status,
       process.env.NODE_ENV === 'production' ? 'aws_ses' : 'smtp',
       messageId || null, error || null]
    );
  } catch (e) { /* don't crash if logging fails */ }
}

/* ─────────────────────────────────────────────
   EMAIL TEMPLATES
───────────────────────────────────────────── */

// Shared header/footer wrapper
function _wrap(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f4f6fb; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .header { background: linear-gradient(135deg, #1a56db, #0e9f6e); padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 26px; margin: 0; font-weight: 900; letter-spacing: -0.5px; }
    .header p  { color: rgba(255,255,255,.8); margin: 6px 0 0; font-size: 14px; }
    .body { padding: 36px 40px; color: #1a202c; font-size: 15px; line-height: 1.7; }
    .body h2 { font-size: 20px; color: #1a202c; margin-top: 0; }
    .btn { display: inline-block; background: #1a56db; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 50px; font-weight: 700; font-size: 15px; margin: 20px 0; }
    .info-box { background: #f0f4ff; border-radius: 12px; padding: 18px 22px; margin: 20px 0; font-size: 14px; }
    .info-box strong { color: #1a56db; }
    .footer { background: #f4f6fb; padding: 20px 40px; text-align: center; font-size: 12px; color: #718096; }
    .footer a { color: #1a56db; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>StemNest Academy</h1>
      <p>Expert 1-on-1 Tutoring · UK-Based · Globally Trusted</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} StemNest Academy Ltd · Registered in England & Wales</p>
      <p><a href="${process.env.APP_URL}">stemnestacademy.co.uk</a> · <a href="mailto:support@stemnestacademy.co.uk">support@stemnestacademy.co.uk</a></p>
    </div>
  </div>
</body>
</html>`;
}

/* ── 1. Welcome / Onboarding ── */
async function sendWelcomeEmail({ to, name, role, loginUrl, password }) {
  const html = _wrap(`
    <h2>Welcome to StemNest Academy, ${name}! 🎉</h2>
    <p>Your account has been created. Here are your login details:</p>
    <div class="info-box">
      <strong>Email:</strong> ${to}<br>
      <strong>Temporary Password:</strong> ${password}<br>
      <strong>Role:</strong> ${role}
    </div>
    <p>Please log in and change your password on first login.</p>
    <a href="${loginUrl || process.env.APP_URL + '/pages/login.html'}" class="btn">Log In Now →</a>
    <p style="font-size:13px;color:#718096;">If you did not expect this email, please contact us immediately.</p>
  `);
  return sendEmail({ to, subject: 'Welcome to StemNest Academy — Your Account is Ready', html, template: 'welcome' });
}

/* ── 2. Forgot Password ── */
async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const html = _wrap(`
    <h2>Reset Your Password 🔐</h2>
    <p>Hi ${name},</p>
    <p>We received a request to reset your StemNest Academy password. Click the button below to set a new password:</p>
    <a href="${resetUrl}" class="btn">Reset My Password →</a>
    <div class="info-box">
      ⏰ This link expires in <strong>30 minutes</strong>.<br>
      If you did not request a password reset, you can safely ignore this email.
    </div>
    <p style="font-size:13px;color:#718096;">For security, this link can only be used once.</p>
  `);
  return sendEmail({ to, subject: 'Reset Your StemNest Academy Password', html, template: 'password_reset' });
}

/* ── 3. Demo Class Confirmed (to parent) ── */
async function sendDemoConfirmationEmail({ to, parentName, studentName, subject, date, time, bookingId, joinUrl }) {
  const html = _wrap(`
    <h2>Demo Class Confirmed ✅</h2>
    <p>Hi ${parentName || 'there'},</p>
    <p>Great news! <strong>${studentName}</strong>'s FREE demo class has been confirmed.</p>
    <div class="info-box">
      <strong>Subject:</strong> ${subject}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>Time:</strong> ${time}<br>
      <strong>Booking ID:</strong> ${bookingId}
    </div>
    <a href="${joinUrl}" class="btn">Join My Class →</a>
    <p><strong>Tips for a great class:</strong></p>
    <ul>
      <li>Use a laptop or desktop (not a phone)</li>
      <li>Find a quiet spot with good lighting</li>
      <li>Test your camera and microphone beforehand</li>
      <li>Join 2–3 minutes early</li>
    </ul>
    <p>You will receive reminder calls 30 and 10 minutes before class.</p>
  `);
  return sendEmail({ to, subject: `Demo Class Confirmed — ${studentName} · ${date}`, html, template: 'demo_confirmed' });
}

/* ── 4. Class Assigned (to teacher) ── */
async function sendClassAssignedEmail({ to, tutorName, studentName, subject, date, time, classLink }) {
  const html = _wrap(`
    <h2>New Class Assigned 📅</h2>
    <p>Hi ${tutorName},</p>
    <p>A new class has been assigned to you:</p>
    <div class="info-box">
      <strong>Student:</strong> ${studentName}<br>
      <strong>Subject:</strong> ${subject}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>Time:</strong> ${time}
    </div>
    ${classLink ? `<a href="${classLink}" class="btn">Join Class →</a>` : ''}
    <p>Please log in to your dashboard to view full details.</p>
    <a href="${process.env.APP_URL}/pages/tutor-dashboard.html" class="btn" style="background:#0e9f6e;">View Dashboard →</a>
  `);
  return sendEmail({ to, subject: `New Class Assigned — ${subject} with ${studentName}`, html, template: 'class_assigned' });
}

/* ── 5. Class Reminder (15 mins before) ── */
async function sendClassReminderEmail({ to, name, studentName, subject, time, classLink }) {
  const html = _wrap(`
    <h2>⏰ Class in 15 Minutes!</h2>
    <p>Hi ${name},</p>
    <p>Your class starts in <strong>15 minutes</strong>:</p>
    <div class="info-box">
      <strong>Student:</strong> ${studentName}<br>
      <strong>Subject:</strong> ${subject}<br>
      <strong>Time:</strong> ${time}
    </div>
    ${classLink ? `<a href="${classLink}" class="btn">Join Class Now →</a>` : ''}
  `);
  return sendEmail({ to, subject: `⏰ Class Reminder — ${subject} starts in 15 minutes`, html, template: 'class_reminder' });
}

/* ── 6. Payment Link ── */
async function sendPaymentLinkEmail({ to, studentName, course, amount, currency, paymentUrl }) {
  const html = _wrap(`
    <h2>Your Payment Link 💳</h2>
    <p>Hi,</p>
    <p>Here is the payment link for <strong>${studentName}</strong>'s enrolment:</p>
    <div class="info-box">
      <strong>Course:</strong> ${course}<br>
      <strong>Amount:</strong> ${currency} ${amount}
    </div>
    <a href="${paymentUrl}" class="btn">Pay Now →</a>
    <p style="font-size:13px;color:#718096;">This link is secure and expires in 48 hours.</p>
  `);
  return sendEmail({ to, subject: `StemNest Academy — Payment Link for ${course}`, html, template: 'payment_link' });
}

/* ── 7. Credits Low Warning ── */
async function sendLowCreditsEmail({ to, studentName, creditsRemaining }) {
  const html = _wrap(`
    <h2>⚠️ Credits Running Low</h2>
    <p>Hi,</p>
    <p><strong>${studentName}</strong> has only <strong>${creditsRemaining} class credit${creditsRemaining !== 1 ? 's' : ''}</strong> remaining.</p>
    <p>Top up now to ensure uninterrupted learning.</p>
    <a href="${process.env.APP_URL}/pages/student-dashboard.html" class="btn">Top Up Credits →</a>
  `);
  return sendEmail({ to, subject: `⚠️ ${studentName} has ${creditsRemaining} credit${creditsRemaining !== 1 ? 's' : ''} remaining`, html, template: 'low_credits' });
}

/* ── 8. Birthday Greeting ── */
async function sendBirthdayEmail({ to, name, message }) {
  const html = _wrap(`
    <h2>🎂 Happy Birthday, ${name}!</h2>
    <p>${message || `Wishing you a wonderful birthday from all of us at StemNest Academy! 🎉`}</p>
    <p>Keep up the amazing work — you're doing brilliantly!</p>
    <a href="${process.env.APP_URL}" class="btn">Visit Your Dashboard →</a>
  `);
  return sendEmail({ to, subject: `🎂 Happy Birthday from StemNest Academy, ${name}!`, html, template: 'birthday' });
}

/* ── 9. Sales Notification ── */
async function sendSalesNotificationEmail({ to, salesName, studentName, subject, date, time }) {
  const html = _wrap(`
    <h2>💼 New Demo Class — Pitch Opportunity</h2>
    <p>Hi ${salesName},</p>
    <p>A demo class has been assigned to you for counseling:</p>
    <div class="info-box">
      <strong>Student:</strong> ${studentName}<br>
      <strong>Subject:</strong> ${subject}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>Time:</strong> ${time}
    </div>
    <p>You will join at the <strong>end of the class</strong> to pitch courses to the parent.</p>
    <a href="${process.env.APP_URL}/pages/sales-dashboard.html" class="btn">View Dashboard →</a>
  `);
  return sendEmail({ to, subject: `💼 New Demo Assigned — ${studentName} · ${date}`, html, template: 'sales_notification' });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendDemoConfirmationEmail,
  sendClassAssignedEmail,
  sendClassReminderEmail,
  sendPaymentLinkEmail,
  sendLowCreditsEmail,
  sendBirthdayEmail,
  sendSalesNotificationEmail,
};
