/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — FREE TRIAL LANDING PAGE JS
   Form validation, booking storage, success flow,
   simulated email/WhatsApp confirmation.
═══════════════════════════════════════════════════════ */

const TIME_SLOTS = []; // Legacy — replaced by dropdown

let selectedTime = '';

/* ── Generate 15-minute time slots (06:00 – 22:45) ── */
function _generateTimeSlots() {
  const slots = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 45) break;
      const hh = String(h).padStart(2,'0');
      const mm = String(m).padStart(2,'0');
      const period = h >= 12 ? 'PM' : 'AM';
      const h12    = h % 12 === 0 ? 12 : h % 12;
      const label  = `${h12}:${mm} ${period}`;
      slots.push({ value: `${hh}:${mm}`, label });
    }
  }
  return slots;
}

/* ── Build time dropdown and refresh available slots based on selected date ── */
function buildTimeGrid() {
  const container = document.getElementById('timeGrid');
  if (!container) return;

  /* Replace the old click-grid with a <select> dropdown */
  container.innerHTML = `
    <select id="f-time-select"
      onchange="selectTime(null, this.value)"
      style="width:100%;padding:14px 16px;border:2px solid #e8eaf0;border-radius:14px;
             font-family:'Nunito',sans-serif;font-size:15px;font-weight:700;color:#1a202c;
             outline:none;background:#fff;cursor:pointer;">
      <option value="">— Select a time —</option>
    </select>`;

  refreshTimeDropdown();

  /* When date changes, refresh available slots */
  const dateInput = document.getElementById('f-date');
  if (dateInput) {
    dateInput.addEventListener('change', refreshTimeDropdown);
  }
}

function refreshTimeDropdown() {
  const sel = document.getElementById('f-time-select');
  if (!sel) return;

  const dateInput = document.getElementById('f-date');
  const selectedDate = dateInput ? dateInput.value : '';
  const today = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === today;

  /* Current time in minutes from midnight */
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  /* Add 30-min buffer so parent has time to prepare */
  const minMins = currentMins + 30;

  const allSlots = _generateTimeSlots();
  const available = isToday
    ? allSlots.filter(s => {
        const [sh, sm] = s.value.split(':').map(Number);
        return (sh * 60 + sm) > minMins;
      })
    : allSlots;

  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select a time —</option>' +
    available.map(s =>
      `<option value="${s.value}" ${s.value === prev ? 'selected' : ''}>${s.label}</option>`
    ).join('');

  /* If previously selected time is no longer available, clear it */
  if (prev && !available.find(s => s.value === prev)) {
    selectedTime = '';
    sel.value = '';
  }
}

function selectTime(el, time) {
  selectedTime = time;
  /* Convert HH:MM value to 12-hour label for display consistency */
  if (time) {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12    = h % 12 === 0 ? 12 : h % 12;
    selectedTime = `${h12}:${String(m).padStart(2,'0')} ${period}`;
  }
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  setMinDate();
  buildTimeGrid();
  bindTimezoneChange();
  bindSubjectHighlight();
  bindScrollReveal();
});

/* ── Set minimum date to today, default to today ── */
function setMinDate() {
  const dateInput = document.getElementById('f-date');
  if (!dateInput) return;
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;
  dateInput.value = today;
}
function bindTimezoneChange() {
  const sel = document.getElementById('f-timezone');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const display = document.getElementById('tzDisplay');
    if (!display) return;
    const tz = sel.value;
    if (!tz) { display.textContent = ''; return; }
    try {
      const now = new Date();
      const label = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      display.textContent = `Your local time: ${label}`;
    } catch(e) {
      display.textContent = '';
    }
  });
}

/* ── Subject card visual highlight ── */
function bindSubjectHighlight() {
  document.querySelectorAll('.lp-subject-opt input').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.lp-subj-card').forEach(c => {
        c.style.borderColor = '';
        c.style.background  = '';
      });
    });
  });
}

/* ── Scroll reveal ── */
function bindScrollReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ══════════════════════════════════════════════════════
   FORM SUBMISSION
══════════════════════════════════════════════════════ */
function submitBooking() {
  // ── Collect values ──
  const studentName = document.getElementById('f-student-name').value.trim();
  const age         = document.getElementById('f-age').value;
  const grade       = document.getElementById('f-grade').value;
  const email       = document.getElementById('f-email').value.trim();
  const countryCode = document.getElementById('f-country-code').value;
  const whatsapp    = document.getElementById('f-whatsapp').value.trim();
  const parentName  = document.getElementById('f-parent-name').value.trim();
  const subject     = document.querySelector('input[name="subject"]:checked')?.value;
  const device      = document.querySelector('input[name="device"]:checked')?.value;
  const timezone    = document.getElementById('f-timezone').value;
  const date        = document.getElementById('f-date').value;

  // ── Validate ──
  if (!studentName) { shakeField('f-student-name'); showToast('Please enter the student\'s name.', 'error'); return; }
  if (!age)         { shakeField('f-age');           showToast('Please select the student\'s age.', 'error'); return; }
  if (!grade)       { shakeField('f-grade');         showToast('Please select the school year/grade.', 'error'); return; }
  // Email OR WhatsApp — at least one required
  if (!email && !whatsapp) {
    showToast('Please enter at least an email address or WhatsApp number so we can reach you.', 'error');
    return;
  }
  if (email && !email.includes('@')) { shakeField('f-email'); showToast('Please enter a valid email address.', 'error'); return; }
  if (!subject)     { showToast('Please select a subject (Coding, Maths or Sciences).', 'error'); return; }
  if (!device)      { showToast('Please select your device type.', 'error'); return; }
  if (!timezone)    { shakeField('f-timezone');      showToast('Please select your country/timezone.', 'error'); return; }
  if (!date)        { shakeField('f-date');          showToast('Please select a preferred date.', 'error'); return; }
  if (!selectedTime){ showToast('Please select a preferred time slot.', 'error'); return; }

  const fullPhone = whatsapp ? (countryCode + ' ' + whatsapp) : '';

  // ── Build booking object ──
  const booking = {
    id:          generateId(),
    studentName,
    age,
    grade,
    email:       email ? email.toLowerCase() : '',
    whatsapp:    fullPhone,
    parentName:  parentName || '—',
    subject,
    device,
    timezone,
    date,
    time:        selectedTime,
    bookedAt:    new Date().toISOString(),
    status:      'pending',
  };

  // ── Duplicate check ──
  // Same contact + same student name + pending = exact duplicate → block
  // Same contact + different student name = parent booking for multiple kids → allow with notice
  const existing = getBookings();
  const contactMatches = existing.filter(b =>
    (booking.email && b.email === booking.email) ||
    (fullPhone && b.whatsapp === fullPhone)
  );
  const exactDuplicate = contactMatches.some(b =>
    b.studentName.toLowerCase() === studentName.toLowerCase() && b.status === 'pending'
  );
  if (exactDuplicate) {
    showToast(`${studentName} already has a pending booking with this contact. Check your email or WhatsApp for details.`, 'error');
    return;
  }
  // Different student, same contact — allowed, just show a notice
  if (contactMatches.length > 0) {
    const otherNames = [...new Set(contactMatches.map(b => b.studentName))].join(', ');
    showToast(`Note: This contact already has bookings for ${otherNames}. Adding new booking for ${studentName}...`, 'info');
  }

  // ── Save to localStorage (admin reads from here) ──
  saveBooking(booking);

  // ── Also save to real API (fire and forget — don't block the UX) ──
  isApiAvailable().then(online => {
    if (online) {
      fetch('https://api.stemnestacademy.co.uk/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: booking.studentName,
          age:         booking.age,
          grade:       booking.grade,
          email:       booking.email,
          whatsapp:    booking.whatsapp,
          parentName:  booking.parentName,
          subject:     booking.subject,
          device:      booking.device,
          timezone:    booking.timezone,
          date:        booking.date,
          time:        booking.time,
        }),
      }).then(r => r.json()).then(data => {
        if (data.success && data.bookingId) {
          // Update localStorage booking with the real DB ID
          const all = getBookings();
          const idx = all.findIndex(b => b.id === booking.id);
          if (idx !== -1) { all[idx].dbId = data.bookingId; localStorage.setItem('sn_bookings', JSON.stringify(all)); }
        }
      }).catch(() => { /* silent — localStorage is the fallback */ });
    }
  });

  // ── Simulate email + WhatsApp confirmation ──
  simulateConfirmations(booking);

  // ── Loading state ──
  const btn = document.getElementById('submitBtn');
  const btnText = document.getElementById('submitBtnText');
  btn.disabled = true;
  btnText.textContent = '⏳ Confirming your class...';

  setTimeout(() => {
    showSuccessScreen(booking);
  }, 1400);
}

function shakeField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake .4s ease';
  el.style.borderColor = 'var(--orange)';
  setTimeout(() => { el.style.borderColor = ''; el.style.animation = ''; }, 1000);
}

/* ── localStorage helpers ── */
function getBookings() {
  try { return JSON.parse(localStorage.getItem('sn_bookings') || '[]'); } catch { return []; }
}
function saveBooking(booking) {
  const all = getBookings();
  all.unshift(booking); // newest first
  localStorage.setItem('sn_bookings', JSON.stringify(all));
}
function generateId() {
  return 'SN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5).toUpperCase();
}

/* ── Simulate email + WhatsApp (console log — replace with real API) ── */
function simulateConfirmations(b) {
  const joinUrl = `${window.location.origin}/frontend/pages/join-class.html`;
  const emailBody = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STEMNEST ACADEMY — Demo Class Confirmed ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hi ${b.parentName !== '—' ? b.parentName : 'there'},

Great news! ${b.studentName}'s FREE demo class has been confirmed.

📚 Subject:  ${b.subject}
📅 Date:     ${formatDate(b.date)}
🕐 Time:     ${b.time} (${b.timezone})
🎓 Student:  ${b.studentName} (${b.grade}, Age ${b.age})
🖥️ Device:   ${b.device}
🆔 Booking:  ${b.id}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  HOW TO JOIN YOUR CLASS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Visit: ${joinUrl}
2. Enter your Gmail (${b.email}) or WhatsApp number
3. Click "Find My Class" to see your Join button
4. Click "Join Class" at your scheduled time

TIPS FOR A GREAT CLASS:
✅ Use a laptop or desktop (not a phone)
✅ Find a quiet spot with good lighting
✅ Test your camera and microphone beforehand
✅ Have a pen and notebook ready
✅ Join 2–3 minutes early

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REMINDER CALLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You will receive an automated reminder call:
📞 30 minutes before your class
📞 10 minutes before your class

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Questions? Reply to this email or WhatsApp us.
Website: https://stemnestacademy.co.uk

StemNest Academy Ltd · Registered in England & Wales
  `;

  const whatsappMsg = `
🎉 *Demo Class Confirmed — StemNest Academy!*

Hi${b.parentName !== '—' ? ' ' + b.parentName : ''}! ${b.studentName}'s FREE demo class is booked ✅

📚 *Subject:* ${b.subject}
📅 *Date:* ${formatDate(b.date)}
🕐 *Time:* ${b.time}
🆔 *Booking ID:* ${b.id}

*To join the class:*
👉 ${joinUrl}
Enter: ${b.email}

You'll get reminder calls 30 mins & 10 mins before class 📞

See you soon! 🚀 — StemNest Academy
  `;

  // In production: POST to /api/notifications/send with { email, whatsapp, emailBody, whatsappMsg }
  console.log('📧 EMAIL TO:', b.email);
  console.log(emailBody);
  console.log('💬 WHATSAPP TO:', b.whatsapp);
  console.log(whatsappMsg);
}

/* ── Success screen ── */
function showSuccessScreen(b) {
  /* Fire Meta Pixel Lead event */
  if (typeof fbq === 'function') {
    fbq('track', 'Lead', { content_name: 'Free Demo Booking', content_category: b.subject || 'Demo' });
  }

  const overlay = document.getElementById('successOverlay');
  const details = document.getElementById('successDetails');

  details.innerHTML = `
    📚 <strong>${b.subject}</strong> &nbsp;·&nbsp;
    📅 <strong>${formatDate(b.date)}</strong> &nbsp;·&nbsp;
    🕐 <strong>${b.time}</strong> (${b.timezone})<br>
    🎓 <strong>${b.studentName}</strong> (${b.grade}) &nbsp;·&nbsp;
    🆔 Booking: <strong>${b.id}</strong>
  `;

  overlay.classList.add('show');

  // Countdown and redirect
  let count = 5;
  const countEl = document.getElementById('countdownNum');
  const timer = setInterval(() => {
    count--;
    if (countEl) countEl.textContent = count;
    if (count <= 0) {
      clearInterval(timer);
      window.location.href = '../index.html';
    }
  }, 1000);
}

/* ── Helpers ── */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
