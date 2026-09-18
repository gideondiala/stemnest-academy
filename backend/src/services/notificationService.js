/**
 * StemNest Academy — Notification Service
 * Orchestrates email + WhatsApp together.
 * Routes call notify*() functions — never the email/WA services directly.
 */

const email = require('./emailService');
const wa    = require('./whatsappService');
const pool  = require('../config/db');
const logger = require('../utils/logger');

/**
 * Save an in-app notification to the DB.
 */
async function saveNotification(userId, type, title, body) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, channel)
       VALUES ($1, $2, $3, $4, 'in_app')`,
      [userId, type, title, body]
    );
  } catch (e) {
    logger.error('saveNotification error:', e.message);
  }
}

/**
 * Notify when a demo class is confirmed.
 * Sends email + WhatsApp to parent.
 */
async function notifyDemoConfirmed({ userId, parentEmail, parentPhone, parentName, studentName, subject, date, time, bookingId }) {
  const joinUrl = `${process.env.APP_URL}/pages/join-class.html`;

  const emailPromise = email.sendDemoConfirmationEmail({
    to: parentEmail, parentName, studentName, subject, date, time, bookingId, joinUrl,
  }).catch(e => logger.error('Demo email failed:', e.message));

  const waPromise = parentPhone
    ? wa.sendDemoConfirmationWA({ to: parentPhone, parentName, studentName, subject, date, time, bookingId, joinUrl })
        .catch(e => logger.error('Demo WA failed:', e.message))
    : Promise.resolve();

  await Promise.all([emailPromise, waPromise]);

  if (userId) {
    await saveNotification(userId, 'demo_confirmed', 'Demo Class Confirmed',
      `Your demo class for ${subject} on ${date} at ${time} is confirmed.`);
  }
}

/**
 * Notify teacher when a class is assigned.
 */
async function notifyClassAssigned({ tutorId, tutorEmail, tutorPhone, tutorName, studentName, subject, date, time, classLink }) {
  await email.sendClassAssignedEmail({
    to: tutorEmail, tutorName, studentName, subject, date, time, classLink,
  }).catch(e => logger.error('Assign email failed:', e.message));

  if (tutorPhone) {
    await wa.sendWhatsApp(tutorPhone,
      `📅 *New Class Assigned — StemNest Academy*\n\nHi ${tutorName}!\n\nYou have a new class:\n📚 ${subject} with ${studentName}\n📅 ${date} at ${time}\n\nLog in to your dashboard for details.`
    ).catch(e => logger.error('Assign WA failed:', e.message));
  }

  if (tutorId) {
    await saveNotification(tutorId, 'class_assigned', 'New Class Assigned',
      `${subject} with ${studentName} on ${date} at ${time}`);
  }
}

/**
 * Notify sales person when a demo is assigned to them.
 */
async function notifySalesAssigned({ salesId, salesEmail, salesPhone, salesName, studentName, subject, date, time }) {
  await email.sendSalesNotificationEmail({
    to: salesEmail, salesName, studentName, subject, date, time,
  }).catch(e => logger.error('Sales email failed:', e.message));

  if (salesPhone) {
    await wa.sendWhatsApp(salesPhone,
      `💼 *New Demo Assigned — StemNest Academy*\n\nHi ${salesName}!\n\nYou have a pitch opportunity:\n🎓 ${studentName} · ${subject}\n📅 ${date} at ${time}\n\nJoin at the END of the class to pitch courses.`
    ).catch(e => logger.error('Sales WA failed:', e.message));
  }

  if (salesId) {
    await saveNotification(salesId, 'demo_assigned', 'Demo Class Assigned',
      `${studentName} · ${subject} on ${date}`);
  }
}

/**
 * Send class reminder 15 minutes before class.
 * Called by a scheduled job (see scheduler.js).
 */
async function notifyClassReminder({ userId, userEmail, userPhone, userName, studentName, subject, time, classLink }) {
  await email.sendClassReminderEmail({
    to: userEmail, name: userName, studentName, subject, time, classLink,
  }).catch(e => logger.error('Reminder email failed:', e.message));

  if (userPhone) {
    await wa.sendClassReminderWA({ to: userPhone, name: userName, studentName, subject, time, classLink })
      .catch(e => logger.error('Reminder WA failed:', e.message));
  }

  if (userId) {
    await saveNotification(userId, 'class_reminder', '⏰ Class in 15 Minutes',
      `${subject} with ${studentName} at ${time}`);
  }
}

/**
 * Warn when student credits are low (≤ 2).
 */
async function notifyLowCredits({ studentId, parentEmail, parentPhone, studentName, creditsRemaining }) {
  await email.sendLowCreditsEmail({
    to: parentEmail, studentName, creditsRemaining,
  }).catch(e => logger.error('Low credits email failed:', e.message));

  if (parentPhone) {
    await wa.sendLowCreditsWA({ to: parentPhone, studentName, creditsRemaining })
      .catch(e => logger.error('Low credits WA failed:', e.message));
  }

  if (studentId) {
    await saveNotification(studentId, 'low_credits', '⚠️ Credits Running Low',
      `You have ${creditsRemaining} credit${creditsRemaining !== 1 ? 's' : ''} remaining.`);
  }
}

/**
 * Send birthday greeting.
 */
async function notifyBirthday({ userId, email: userEmail, phone, name, message }) {
  await email.sendBirthdayEmail({ to: userEmail, name, message })
    .catch(e => logger.error('Birthday email failed:', e.message));

  if (phone) {
    await wa.sendBirthdayWA({ to: phone, name, message })
      .catch(e => logger.error('Birthday WA failed:', e.message));
  }

  if (userId) {
    await saveNotification(userId, 'birthday', `🎂 Happy Birthday, ${name}!`,
      message || 'Wishing you a wonderful birthday from StemNest Academy!');
  }
}

module.exports = {
  saveNotification,
  notifyDemoConfirmed,
  notifyClassAssigned,
  notifySalesAssigned,
  notifyClassReminder,
  notifyLowCredits,
  notifyBirthday,
};
