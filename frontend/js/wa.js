/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — WhatsApp Click-to-Send (wa.js)
   Generates wa.me links with pre-filled messages.
   Staff click the button → WhatsApp opens on their phone
   with the message ready to send. Zero API cost.
═══════════════════════════════════════════════════════ */

const APP_URL = 'https://stemnestacademy.co.uk';

/**
 * Open WhatsApp with a pre-filled message.
 * @param {string} phone  - e.g. "+447700123456" or "447700123456"
 * @param {string} message - plain text message
 */
function waOpen(phone, message) {
  if (!phone || phone === '—') {
    showToast('No WhatsApp number available for this contact.', 'error');
    return;
  }
  // Normalise: remove spaces, dashes, brackets; ensure starts with country code
  const clean = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');
  const url   = 'https://wa.me/' + clean + '?text=' + encodeURIComponent(message);
  window.open(url, '_blank');
}

/* ── Pre-built message templates ── */

/** Demo class confirmed — sent to parent */
function waDemoConfirmed(booking) {
  const msg =
    `🎉 *Demo Class Confirmed — StemNest Academy*\n\n` +
    `Hi${booking.parentName && booking.parentName !== '—' ? ' ' + booking.parentName : ''}! ` +
    `*${booking.studentName}*'s FREE demo class is booked ✅\n\n` +
    `📚 *Subject:* ${booking.subject}\n` +
    `📅 *Date:* ${booking.date}\n` +
    `🕐 *Time:* ${booking.time}\n` +
    `🆔 *Booking ID:* ${booking.id}\n\n` +
    `*To join the class:*\n` +
    `👉 ${APP_URL}/pages/join-class.html\n` +
    `Enter: ${booking.email}\n\n` +
    `You'll get reminder calls 30 & 10 mins before class 📞\n\n` +
    `See you soon! 🚀 — StemNest Academy`;
  waOpen(booking.whatsapp, msg);
}

/** Class reminder — sent to parent/student */
function waClassReminder(booking) {
  const msg =
    `⏰ *Class Reminder — StemNest Academy*\n\n` +
    `Hi! *${booking.studentName}*'s *${booking.subject}* class starts soon.\n\n` +
    `📅 *Date:* ${booking.date}\n` +
    `🕐 *Time:* ${booking.time}\n\n` +
    `*To join:*\n` +
    `👉 ${APP_URL}/pages/join-class.html\n\n` +
    `Good luck! 🚀 — StemNest Academy`;
  waOpen(booking.whatsapp, msg);
}

/** Class assigned — sent to teacher */
function waClassAssigned(booking, teacher) {
  const msg =
    `📅 *New Class Assigned — StemNest Academy*\n\n` +
    `Hi ${teacher.name.split(' ')[0]}!\n\n` +
    `You have a new class:\n` +
    `🎓 *Student:* ${booking.studentName} (${booking.grade || '—'})\n` +
    `📚 *Subject:* ${booking.subject}\n` +
    `📅 *Date:* ${booking.date}\n` +
    `🕐 *Time:* ${booking.time}\n\n` +
    `Log in to your dashboard for full details:\n` +
    `👉 ${APP_URL}/pages/tutor-dashboard.html\n\n` +
    `StemNest Academy`;
  waOpen(teacher.phone || teacher.whatsapp, msg);
}

/** Sales pitch opportunity — sent to sales person */
function waSalesAssigned(booking, salesPerson) {
  const msg =
    `💼 *New Demo Assigned — StemNest Academy*\n\n` +
    `Hi ${salesPerson.name.split(' ')[0]}!\n\n` +
    `You have a pitch opportunity:\n` +
    `🎓 *Student:* ${booking.studentName}\n` +
    `📚 *Subject:* ${booking.subject}\n` +
    `📅 *Date:* ${booking.date}\n` +
    `🕐 *Time:* ${booking.time}\n\n` +
    `Join at the *END of the class* to pitch courses to the parent.\n\n` +
    `👉 ${APP_URL}/pages/sales-dashboard.html\n\n` +
    `StemNest Academy`;
  waOpen(salesPerson.phone || salesPerson.whatsapp, msg);
}

/** Payment link — sent to parent */
function waPaymentLink(phone, studentName, course, amount, currency, paymentUrl) {
  const msg =
    `💳 *Payment Link — StemNest Academy*\n\n` +
    `Hi! Here is the payment link for *${studentName}*'s enrolment in *${course}*:\n\n` +
    `💰 *Amount:* ${currency} ${amount}\n\n` +
    `👉 *Pay here:* ${paymentUrl}\n\n` +
    `This link is secure. Contact us if you have any questions.\n\n` +
    `StemNest Academy`;
  waOpen(phone, msg);
}

/** Low credits warning — sent to parent */
function waLowCredits(phone, studentName, creditsRemaining) {
  const msg =
    `⚠️ *Credits Running Low — StemNest Academy*\n\n` +
    `Hi! *${studentName}* has only *${creditsRemaining} class credit${creditsRemaining !== 1 ? 's' : ''}* remaining.\n\n` +
    `Top up now to keep learning without interruption:\n` +
    `👉 ${APP_URL}/pages/student-dashboard.html\n\n` +
    `StemNest Academy`;
  waOpen(phone, msg);
}

/** Password reset — sent to user */
function waPasswordReset(phone, name, resetUrl) {
  const msg =
    `🔐 *Password Reset — StemNest Academy*\n\n` +
    `Hi ${name}! Click the link below to reset your password (expires in 30 mins):\n\n` +
    `👉 ${resetUrl}\n\n` +
    `If you didn't request this, ignore this message.\n\n` +
    `StemNest Academy`;
  waOpen(phone, msg);
}

/** Generic custom message */
function waCustom(phone, message) {
  waOpen(phone, message);
}

/**
 * Build a WhatsApp button HTML string.
 * @param {string} phone
 * @param {string} fnCall - JS function call string e.g. "waDemoConfirmed(booking)"
 * @param {string} label  - button label
 * @param {string} style  - optional extra CSS
 */
function waBtn(phone, fnCall, label, style) {
  if (!phone || phone === '—') return '';
  return `<button onclick="${fnCall}"
    style="background:#25D366;color:#fff;border:none;border-radius:8px;
    padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;
    font-size:12px;cursor:pointer;display:inline-flex;align-items:center;
    gap:5px;white-space:nowrap;${style || ''}"
    title="Send WhatsApp to ${phone}">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
    ${label || 'WhatsApp'}
  </button>`;
}
