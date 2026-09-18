/**
 * StemNest Academy — Email Service
 * Primary: Resend.com API (reliable delivery, no sandbox)
 * Fallback: AWS SES SDK v3
 * Dev fallback: console log
 */

const logger = require('../utils/logger');
const pool   = require('../config/db');

/* ─────────────────────────────────────────────
   SEND FUNCTION
───────────────────────────────────────────── */
async function sendEmail({ to, subject, html, text, template }) {
  const fromName    = process.env.EMAIL_FROM_NAME || 'StemNest Academy';
  const fromAddress = process.env.EMAIL_FROM      || 'noreply@stemnestacademy.co.uk';
  const from        = `${fromName} <${fromAddress}>`;

  /* ── PRIMARY: Resend.com ── */
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      const { data, error } = await resend.emails.send({
        from,
        to,
        subject,
        html: html || text || '',
      });

      if (error) {
        logger.error(`[EMAIL FAILED via Resend] To: ${to} | ${error.message}`);
        await _logEmail(to, subject, template, 'failed', null, error.message);
        throw new Error(error.message);
      }

      logger.info(`[EMAIL SENT via Resend] To: ${to} | Subject: ${subject} | ID: ${data.id}`);
      await _logEmail(to, subject, template, 'sent', data.id, null);
      return { messageId: data.id };
    } catch (err) {
      logger.error(`[EMAIL FAILED via Resend] To: ${to} | ${err.message}`);
      await _logEmail(to, subject, template, 'failed', null, err.message);
      throw err;
    }
  }

  /* ── Fallback: console log only ── */
  logger.info(`[EMAIL SIMULATED] To: ${to} | Subject: ${subject}`);
  await _logEmail(to, subject, template, 'simulated', null, null);
  return { simulated: true };
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
    .header h1 { color: #fff; font-size: 26px; margin: 0; font-weight: 900; }
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
      <p><a href="${process.env.APP_URL || 'https://stemnestacademy.co.uk'}">stemnestacademy.co.uk</a> · <a href="mailto:support@stemnestacademy.co.uk">support@stemnestacademy.co.uk</a></p>
    </div>
  </div>
</body>
</html>`;
}

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
    <a href="${loginUrl || (process.env.APP_URL + '/pages/login.html')}" class="btn">Log In Now →</a>
    <p style="font-size:13px;color:#718096;">If you did not expect this email, please contact us immediately.</p>
  `);
  return sendEmail({ to, subject: 'Welcome to StemNest Academy — Your Account is Ready', html, template: 'welcome' });
}

async function sendOnboardingEmail({ to, name, studentId, password, course, pathway, credits, loginUrl }) {
  const html = _wrap(`
    <h2>Welcome to StemNest Academy, ${name}! 🎉</h2>
    <p>Congratulations on your enrollment! Your student dashboard is now active and ready for you.</p>
    <div class="info-box">
      <strong>Student Name:</strong> ${name}<br>
      <strong>Student ID:</strong> ${studentId}<br>
      <strong>Course:</strong> ${course || 'Coding'}<br>
      ${pathway ? `<strong>Pathway:</strong> ${pathway} (Pathway chosen)<br>` : ''}
      <strong>Available Credits:</strong> ${credits} class${credits !== 1 ? 'es' : ''}<br>
      <br>
      <strong>Login Email:</strong> ${to}<br>
      <strong>Temporary Password:</strong> ${password}
    </div>
    <p>Please log in to your dashboard to view your schedule and join your upcoming classes. You can change your password at any time.</p>
    <a href="${loginUrl || (process.env.APP_URL + '/pages/login.html')}" class="btn">Access Dashboard →</a>
    <p style="font-size:13px;color:#718096;">If you have any questions, our support team is always here to help.</p>
  `);
  return sendEmail({ to, subject: 'Welcome to StemNest Academy! Your Dashboard is Ready 🚀', html, template: 'onboarding' });
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const html = _wrap(`
    <h2>Reset Your Password 🔐</h2>
    <p>Hi ${name},</p>
    <p>We received a request to reset your StemNest Academy password. Click the button below:</p>
    <a href="${resetUrl}" class="btn">Reset My Password →</a>
    <div class="info-box">
      ⏰ This link expires in <strong>30 minutes</strong>.<br>
      If you did not request this, you can safely ignore this email.
    </div>
  `);
  return sendEmail({ to, subject: 'Reset Your StemNest Academy Password', html, template: 'password_reset' });
}

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
  `);
  return sendEmail({ to, subject: `Demo Class Confirmed — ${studentName} · ${date}`, html, template: 'demo_confirmed' });
}

async function sendDemoScheduledParentEmail({ to, parentName, studentName, subject, date, timeLocal, timeWAT, tutorName, classLink }) {
  const joinGuide = `
    <div style="background:#f0f4ff;border-radius:12px;padding:18px 22px;margin:20px 0;">
      <strong style="color:#1a56db;font-size:15px;">📋 How to Join Your Class (Google Meet)</strong>
      <ol style="margin:12px 0 0;padding-left:20px;font-size:14px;line-height:1.8;">
        <li>Click the <strong>Join Class</strong> button above at your scheduled time</li>
        <li>Allow camera and microphone access when prompted</li>
        <li>Click <strong>"Join now"</strong> to enter the meeting</li>
        <li>If asked for a name, enter your child's name</li>
      </ol>
    </div>
    <div style="background:#fff3e0;border-radius:12px;padding:16px 22px;margin:16px 0;font-size:14px;">
      <strong style="color:#e65100;">⚠️ Important — Please Read</strong>
      <ul style="margin:10px 0 0;padding-left:20px;line-height:1.8;">
        <li>Use a <strong>laptop or desktop only</strong> — phones and tablets are not supported</li>
        <li>Find a <strong>quiet spot</strong> with good lighting and stable internet</li>
        <li>Test your <strong>camera and microphone</strong> before the class starts</li>
        <li>Join <strong>2–3 minutes early</strong> so we can get started on time</li>
      </ul>
    </div>`;

  const html = _wrap(`
    <h2>🎉 Your Demo Class is Confirmed!</h2>
    <p>Hi ${parentName || 'there'},</p>
    <p>Great news! <strong>${studentName}</strong>'s FREE demo class has been <strong>scheduled and a teacher has been assigned</strong>. We're looking forward to seeing you in class!</p>
    <div class="info-box">
      <strong>Subject:</strong> ${subject}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>Time:</strong> ${timeLocal}${timeWAT ? ' · <span style="color:#1a56db;">WAT: ' + timeWAT + '</span>' : ''}<br>
      <strong>Teacher:</strong> ${tutorName || 'Your assigned StemNest tutor'}<br>
      <strong>Student:</strong> ${studentName}
    </div>
    ${classLink
      ? `<a href="${classLink}" class="btn" style="background:#1a56db;">🔗 Join Class →</a>`
      : `<p style="color:#718096;font-size:13px;">Your class joining link will be shared closer to the session.</p>`
    }
    ${joinGuide}
    <p style="font-size:13px;color:#718096;margin-top:20px;">If you have any questions, simply reply to this email or reach us at <a href="mailto:support@stemnestacademy.co.uk">support@stemnestacademy.co.uk</a>.</p>
    <p style="font-size:13px;color:#718096;">We can't wait to see ${studentName} in class! 🚀</p>
  `);
  return sendEmail({ to, subject: `🎉 Demo Class Confirmed — ${studentName} · ${date}`, html, template: 'demo_scheduled_parent' });
}

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
    <a href="${process.env.APP_URL}/pages/tutor-dashboard.html" class="btn" style="background:#0e9f6e;">View Dashboard →</a>
  `);
  return sendEmail({ to, subject: `New Class Assigned — ${subject} with ${studentName}`, html, template: 'class_assigned' });
}

async function sendPostClassSummaryEmail({ to, parentName, studentName, subject, tutorName, date, homework, nextClassDate, creditsRemaining, topUpUrl }) {
  const lowCredits = typeof creditsRemaining === 'number' && creditsRemaining <= 3;
  const html = _wrap(`
    <h2>📚 Class Summary — ${studentName}</h2>
    <p>Hi ${parentName || 'there'},</p>
    <p><strong>${studentName}</strong> just completed their <strong>${subject}</strong> class with <strong>${tutorName || 'your StemNest tutor'}</strong>. Here's a quick summary:</p>
    <div class="info-box">
      <strong>Subject:</strong> ${subject}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>Teacher:</strong> ${tutorName || '—'}<br>
      <strong>Credits remaining:</strong> ${typeof creditsRemaining === 'number' ? creditsRemaining + ' class' + (creditsRemaining !== 1 ? 'es' : '') : '—'}
    </div>
    ${homework ? `
    <div style="background:#f0fdf4;border-radius:12px;padding:16px 20px;margin:16px 0;">
      <strong style="color:#065f46;">📝 Homework / Practice</strong>
      <p style="margin:8px 0 0;font-size:14px;">${homework}</p>
    </div>` : ''}
    ${nextClassDate ? `<p>📅 <strong>Next class:</strong> ${nextClassDate}</p>` : ''}
    ${lowCredits ? `
    <div style="background:#fff3e0;border-radius:12px;padding:14px 20px;margin:16px 0;font-size:14px;color:#e65100;">
      ⚠️ <strong>${studentName} has only ${creditsRemaining} class credit${creditsRemaining !== 1 ? 's' : ''} remaining.</strong>
      Top up now to keep the learning going without interruption.
      <br><br>
      <a href="${topUpUrl || (process.env.APP_URL + '/pages/student-dashboard.html?topup=1')}"
         style="display:inline-block;background:#e65100;color:#fff;text-decoration:none;padding:10px 24px;border-radius:50px;font-weight:700;font-size:13px;">Top Up Credits →</a>
    </div>` : ''}
    <p style="font-size:13px;color:#718096;margin-top:20px;">Keep up the great work! 🌟 — The StemNest Academy Team</p>
  `);
  return sendEmail({ to, subject: `📚 Class Summary — ${studentName} · ${subject}`, html, template: 'post_class_summary' });
}

async function sendClassReminderEmail({ to, name, studentName, subject, time, classLink }) {
  const html = _wrap(`
    <h2>⏰ Class in 24 Hours!</h2>
    <p>Hi ${name},</p>
    <p>Just a heads-up — <strong>${studentName}</strong>'s class is <strong>tomorrow</strong>. Make sure everything is ready!</p>
    <div class="info-box">
      <strong>Subject:</strong> ${subject}<br>
      <strong>When:</strong> ${time}
    </div>
    ${classLink ? `<a href="${classLink}" class="btn">🔗 Join Class →</a>` : ''}
    <div style="background:#fff3e0;border-radius:12px;padding:14px 20px;margin:16px 0;font-size:13px;color:#e65100;">
      ⚠️ <strong>Reminder:</strong> Please use a <strong>laptop or desktop</strong> — phones and tablets are not supported.
    </div>
    <p style="font-size:13px;color:#718096;">See you tomorrow! 🚀</p>
  `);
  return sendEmail({ to, subject: `⏰ Class tomorrow — ${studentName} · ${subject}`, html, template: 'class_reminder_24h' });
}

async function sendPaymentLinkEmail({ to, studentName, course, amount, currency, paymentUrl }) {
  const html = _wrap(`
    <h2>Your Payment Link 💳</h2>
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

async function sendLowCreditsEmail({ to, studentName, creditsRemaining }) {
  const html = _wrap(`
    <h2>⚠️ Credits Running Low</h2>
    <p><strong>${studentName}</strong> has only <strong>${creditsRemaining} class credit${creditsRemaining !== 1 ? 's' : ''}</strong> remaining.</p>
    <p>Top up now to ensure uninterrupted learning.</p>
    <a href="${process.env.APP_URL}/pages/student-dashboard.html" class="btn">Top Up Credits →</a>
  `);
  return sendEmail({ to, subject: `⚠️ ${studentName} has ${creditsRemaining} credit${creditsRemaining !== 1 ? 's' : ''} remaining`, html, template: 'low_credits' });
}

async function sendBirthdayEmail({ to, name, message }) {
  const html = _wrap(`
    <h2>🎂 Happy Birthday, ${name}!</h2>
    <p>${message || 'Wishing you a wonderful birthday from all of us at StemNest Academy! 🎉'}</p>
    <a href="${process.env.APP_URL}" class="btn">Visit Your Dashboard →</a>
  `);
  return sendEmail({ to, subject: `🎂 Happy Birthday from StemNest Academy, ${name}!`, html, template: 'birthday' });
}

/* ─────────────────────────────────────────────
   CREDIT NUDGE EMAIL BUILDER (shared helper)
   Called directly by bookings.js for each threshold
───────────────────────────────────────────── */
function _buildCreditNudgeEmail({ parentName, studentName, credits, urgency, topUpUrl, message }) {
  const configs = {
    soft:      { color: '#1a56db', bg: '#f0f4ff', icon: '📚', btnColor: '#1a56db', btnText: 'Top Up Credits' },
    urgent:    { color: '#e65100', bg: '#fff3e0', icon: '⚠️',  btnColor: '#e65100', btnText: 'Top Up Now' },
    critical:  { color: '#c53030', bg: '#fde8e8', icon: '🔴',  btnColor: '#c53030', btnText: 'Top Up Immediately' },
    suspended: { color: '#7c3aed', bg: '#f5f3ff', icon: '🔒',  btnColor: '#7c3aed', btnText: 'Restore Classes Now' },
  };
  const cfg = configs[urgency] || configs.soft;

  return _wrap(`
    <h2 style="color:${cfg.color};">${cfg.icon} ${
      urgency === 'suspended' ? `${studentName}'s Classes Paused`
      : urgency === 'critical' ? `Action Needed — ${studentName}`
      : urgency === 'urgent'   ? `Top Up Soon — ${studentName}`
      : `Credits Running Low — ${studentName}`
    }</h2>
    <p>Hi ${parentName || 'there'},</p>
    <p>${message}</p>
    <div style="background:${cfg.bg};border-radius:12px;padding:18px 22px;margin:20px 0;font-size:14px;border-left:4px solid ${cfg.color};">
      <strong>Current balance:</strong> ${credits} credit${credits === 1 ? '' : 's'}
      ${credits <= 0 ? `<br><strong style="color:${cfg.color};">Status: ${urgency === 'suspended' ? 'Live classes paused' : 'No credits remaining'}</strong>` : ''}
    </div>
    ${urgency === 'suspended' ? `
    <div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin:16px 0;font-size:14px;">
      <strong>While paused, ${studentName} can still:</strong>
      <ul style="margin:8px 0 0;padding-left:20px;line-height:1.8;">
        <li>View all previous lesson materials and slides</li>
        <li>Complete pending assignments and quizzes</li>
        <li>Review their class history and progress</li>
      </ul>
      <strong>Once you top up, live classes resume instantly.</strong>
    </div>` : ''}
    <a href="${topUpUrl}" style="display:inline-block;background:${cfg.btnColor};color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;margin:20px 0;">${cfg.btnText} →</a>
    <p style="font-size:13px;color:#718096;margin-top:16px;">
      Questions? Email us at <a href="mailto:support@stemnestacademy.co.uk">support@stemnestacademy.co.uk</a> and we'll help right away.
    </p>
  `);
}

async function sendClassFeedbackEmail({ to, parentName, studentName, subject, tutorName, bookingId }) {
  const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
  /* Each star rating is a simple link that records the rating via a GET endpoint */
  const stars = [1,2,3,4,5].map(n => {
    const filled = '★'.repeat(n) + '☆'.repeat(5 - n);
    return `<a href="${appUrl}/api/bookings/${bookingId}/rate?rating=${n}&token=${bookingId}"
              style="display:inline-block;margin:0 4px;padding:10px 16px;background:${n <= 3 ? '#fff3e0' : '#f0fdf4'};
                     color:${n <= 3 ? '#e65100' : '#065f46'};border-radius:12px;text-decoration:none;
                     font-size:18px;font-weight:900;border:2px solid ${n <= 3 ? '#fed7aa' : '#bbf7d0'};">
              ${filled}
            </a>`;
  }).join('');

  const html = _wrap(`
    <h2>How was ${studentName}'s class? 🌟</h2>
    <p>Hi ${parentName || 'there'},</p>
    <p><strong>${studentName}</strong>'s demo class with <strong>${tutorName || 'your StemNest tutor'}</strong> in <strong>${subject}</strong> has just finished.</p>
    <p>We'd love to hear how it went! Please click the rating below — it takes just one second:</p>

    <div style="text-align:center;margin:28px 0;">
      <div style="font-size:14px;font-weight:800;color:#718096;margin-bottom:14px;">Tap to rate the class:</div>
      <div style="display:flex;justify-content:center;gap:4px;flex-wrap:wrap;">
        ${stars}
      </div>
      <div style="display:flex;justify-content:space-between;max-width:320px;margin:10px auto 0;font-size:12px;color:#a0aec0;font-weight:700;">
        <span>😕 Not great</span>
        <span>🤩 Excellent!</span>
      </div>
    </div>

    <div style="background:#f0f4ff;border-radius:12px;padding:16px 20px;margin:20px 0;font-size:14px;color:#1e40af;">
      <strong>Want to leave a comment?</strong> Just reply to this email — we read every response.
    </div>

    <p style="font-size:13px;color:#718096;">
      Thank you for choosing StemNest Academy. Our team will be in touch to discuss ${studentName}'s learning journey.
    </p>
  `);

  return sendEmail({
    to,
    subject: `⭐ How was ${studentName}'s StemNest demo class?`,
    html,
    template: 'class_feedback',
  });
}

async function sendPaymentReceiptEmail({ to, parentName, studentName, amount, currency, credits, newBalance, reference }) {
  const html = _wrap(`
    <h2>✅ Payment Confirmed — Thank You!</h2>
    <p>Hi ${parentName || 'there'},</p>
    <p>We have received your payment for <strong>${studentName}</strong>'s classes. Here are your payment details:</p>
    <div class="info-box">
      <strong>Amount Paid:</strong> ${currency} ${parseFloat(amount).toFixed(2)}<br>
      <strong>Classes Added:</strong> ${credits} class${credits !== 1 ? 'es' : ''}<br>
      <strong>New Credit Balance:</strong> ${newBalance} class${newBalance !== 1 ? 'es' : ''}<br>
      <strong>Reference:</strong> <span style="font-family:monospace;">${reference}</span>
    </div>
    <p>${studentName}'s classes are now active. We look forward to seeing them in their next session!</p>
    <a href="${process.env.APP_URL || 'https://stemnestacademy.co.uk'}/pages/student-dashboard.html" class="btn">View Dashboard →</a>
    <p style="font-size:13px;color:#718096;margin-top:20px;">
      Please keep this email as your payment receipt.<br>
      Questions? Contact us at <a href="mailto:support@stemnestacademy.co.uk">support@stemnestacademy.co.uk</a>
    </p>
  `);
  return sendEmail({ to, subject: `✅ Payment Confirmed — ${credits} class${credits !== 1 ? 'es' : ''} added for ${studentName}`, html, template: 'payment_receipt' });
}

async function sendSalesNotificationEmail({ to, salesName, studentName, subject, date, time }) {
  const html = _wrap(`
    <h2>💼 New Demo Class — Pitch Opportunity</h2>
    <p>Hi ${salesName},</p>
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
  _buildCreditNudgeEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendDemoConfirmationEmail,
  sendDemoScheduledParentEmail,
  sendClassAssignedEmail,
  sendClassReminderEmail,
  sendPostClassSummaryEmail,
  sendClassFeedbackEmail,
  sendPaymentLinkEmail,
  sendPaymentReceiptEmail,
  sendLowCreditsEmail,
  sendBirthdayEmail,
  sendSalesNotificationEmail,
  sendOnboardingEmail,
};
