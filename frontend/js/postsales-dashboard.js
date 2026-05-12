/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — POST-SALES DASHBOARD JS
   Receives converted (paid) students, schedules recurring
   paid classes, writes slots to teacher calendar.
═══════════════════════════════════════════════════════ */

const POS_TABS = ['students', 'topup', 'scheduled', 'paylinks', 'converted'];
let generatedLink       = null;
let posScheduleStudentId = null; // booking ID being scheduled

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  const dateEl = document.getElementById('posDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  loadCourseDropdown();
  loadCourseDropdownSchedule();
  showPOSTab('students');
  bindPOSModals();
});

/* ── HELPERS ── */
function getBookings()  { try { return JSON.parse(localStorage.getItem('sn_bookings') || '[]'); } catch { return []; } }
function getTeachers()  { try { return JSON.parse(localStorage.getItem('sn_teachers') || '[]'); } catch { return []; } }
function saveBookings(list) { localStorage.setItem('sn_bookings', JSON.stringify(list)); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function getAllPipeline() {
  const persons = JSON.parse(localStorage.getItem('sn_sales_persons') || '[]');
  return persons.flatMap(sp =>
    JSON.parse(localStorage.getItem('sn_pipeline_' + sp.id) || '[]')
      .map(p => ({ ...p, salesPersonId: sp.id, salesPersonName: sp.name }))
  );
}

function to12h(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${period}`;
}

/* Add days to a date, return ISO string */
function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/* Write a single slot to teacher's calendar */
function writeTeacherCalendarSlot(teacherId, dateKey, timeKey, bookingId) {
  const allAvail = JSON.parse(localStorage.getItem('sn_all_tutor_avail') || '{}');
  const tutorEntry = allAvail[teacherId] || { tutor: getTeachers().find(t => t.id === teacherId) || {}, slots: {} };
  const slots = tutorEntry.slots || {};

  slots[dateKey + '|' + timeKey] = { booked: true, bookingId };
  const [h, m] = timeKey.split(':').map(Number);
  const nextKey = m === 0 ? `${h}:30` : `${h + 1}:00`;
  slots[dateKey + '|' + nextKey] = { booked: true, bookingId };

  tutorEntry.slots = slots;
  allAvail[teacherId] = tutorEntry;
  localStorage.setItem('sn_all_tutor_avail', JSON.stringify(allAvail));

  const personal = JSON.parse(localStorage.getItem('sn_tutor_avail_' + teacherId) || '{}');
  personal[dateKey + '|' + timeKey] = { booked: true, bookingId };
  personal[dateKey + '|' + nextKey] = { booked: true, bookingId };
  localStorage.setItem('sn_tutor_avail_' + teacherId, JSON.stringify(personal));
}

/* ── TAB SWITCHING ── */
function showPOSTab(tab) {
  POS_TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
  updatePOSStats();
  if (tab === 'students')  renderPaidStudents();
  if (tab === 'topup')     renderTopUpStudents();
  if (tab === 'scheduled') renderScheduledPaid();
  if (tab === 'converted') renderPOSConverted();
}

/* ── STATS ── */
function updatePOSStats() {
  const pipeline  = getAllPipeline();
  const converted = pipeline.filter(p => p.status === 'converted');
  const rev       = converted.reduce((s, p) => s + (parseFloat(p.paymentAmount) || 0), 0);
  const bookings  = getBookings();
  const students  = JSON.parse(localStorage.getItem('sn_students') || '[]');

  // Count students needing top-up (credits ≤ 2)
  const needingTopUp = students.filter(s => (parseInt(s.credits) || 0) <= 2).length;

  setText('posStat1', bookings.filter(b => b.salesStatus === 'converted' && !b.paidScheduled).length);
  setText('posStat2', bookings.filter(b => b.paidScheduled).length);
  setText('posStat3', converted.length);
  setText('posStat4', '£' + rev.toFixed(0));
  setText('posBadge',   bookings.filter(b => b.salesStatus === 'converted' && !b.paidScheduled).length);
  setText('topupBadge', needingTopUp);
}

/* ══════════════════════════════════════════════════════
/* ══════════════════════════════════════════════════════
   PAID STUDENTS TABLE — see full implementation below
══════════════════════════════════════════════════════ */

function thStyle(align) { return `padding:12px 16px;text-align:${align||'left'};font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;`; }
function tdStyle(align) { return `padding:14px 16px;text-align:${align||'left'};vertical-align:middle;`; }

/* ══════════════════════════════════════════════════════
   SCHEDULE PAID CLASSES MODAL
══════════════════════════════════════════════════════ */
function openPOSScheduleModal(bookingId) {
  posScheduleStudentId = bookingId;

  // Find student from bookings or pipeline
  const booking = getBookings().find(b => b.id === bookingId);
  const pipeline = getAllPipeline().find(p => p.bookingId === bookingId);
  const s = booking || pipeline || {};

  const infoEl = document.getElementById('pos-sm-info');
  if (infoEl) infoEl.innerHTML = `
    <strong>${s.studentName || '—'}</strong> · ${s.grade || '—'}<br>
    📚 ${s.subject || s.course || '—'} &nbsp;·&nbsp; 📧 ${s.email || '—'} &nbsp;·&nbsp; 📱 ${s.whatsapp || '—'}`;

  // Pre-fill subject in course dropdown
  loadCourseDropdownSchedule(s.subject);

  // Populate teacher dropdown filtered by subject
  populatePOSTeacherDropdown(s.subject);

  // Set start date min to today
  const dateEl = document.getElementById('pos-sm-start');
  if (dateEl) dateEl.min = new Date().toISOString().split('T')[0];

  // Clear fields
  ['pos-sm-time','pos-sm-weeks','pos-sm-link'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const dayEl = document.getElementById('pos-sm-day');
  if (dayEl) dayEl.value = '1'; // Monday default

  document.getElementById('posScheduleModalOverlay').classList.add('open');
}

function populatePOSTeacherDropdown(subject) {
  const sel = document.getElementById('pos-sm-teacher');
  if (!sel) return;
  let teachers = getTeachers();
  if (subject) teachers = teachers.filter(t => t.subject === subject);
  sel.innerHTML = '<option value="">— Select a teacher —</option>' +
    teachers.map(t => `<option value="${t.id}">${t.name} (${t.id}) · ${t.subject}</option>`).join('');
}

function loadCourseDropdownSchedule(subject) {
  const sel = document.getElementById('pos-sm-course');
  if (!sel) return;
  const courses = JSON.parse(localStorage.getItem('sn_courses') || '[]');
  let filtered = courses;
  if (subject) filtered = courses.filter(c =>
    c.category?.toLowerCase().includes(subject.toLowerCase()) ||
    c.name?.toLowerCase().includes(subject.toLowerCase())
  );
  sel.innerHTML = '<option value="">Select course</option>' +
    (filtered.length ? filtered : courses)
      .map(c => `<option value="${c.name}">${c.name}${c.price ? ' — £'+c.price : ''}</option>`).join('');
}

async function confirmPOSSchedule() {
  const teacherId = document.getElementById('pos-sm-teacher')?.value;
  const course    = document.getElementById('pos-sm-course')?.value;
  const startDate = document.getElementById('pos-sm-start')?.value;
  const dayOfWeek = parseInt(document.getElementById('pos-sm-day')?.value || '1');
  const time      = document.getElementById('pos-sm-time')?.value;
  const weeks     = parseInt(document.getElementById('pos-sm-weeks')?.value || '0');
  const link      = document.getElementById('pos-sm-link')?.value.trim();

  if (!teacherId) { showToast('Please select a teacher.', 'error'); return; }
  if (!startDate) { showToast('Please select a start date.', 'error'); return; }
  if (!time)      { showToast('Please select a class time.', 'error'); return; }
  if (!weeks || weeks < 1) { showToast('Please enter the number of weeks.', 'error'); return; }
  if (!link)      { showToast('Please enter a class link.', 'error'); return; }

  const teacher = getTeachers().find(t => t.id === teacherId);

  /* ── Get teacher's real DB user ID ── */
  let teacherDbId = null;
  try {
    const token = localStorage.getItem('sn_access_token');
    if (token) {
      const res = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await res.json();
      const dbTeacher = (data.users || []).find(u => u.staff_id === teacherId || u.id === teacherId);
      teacherDbId = dbTeacher?.id || null;
    }
  } catch (e) { /* silent */ }

  /* ── Get real DB booking ID ── */
  const localBooking = getBookings().find(b => b.id === posScheduleStudentId);
  const dbBookingId  = localBooking?.dbId || posScheduleStudentId;

  // Generate all weekly session dates
  const sessionDates = [];
  let current = new Date(startDate + 'T12:00:00');
  while (current.getDay() !== dayOfWeek) { current.setDate(current.getDate() + 1); }
  for (let w = 0; w < weeks; w++) {
    sessionDates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7);
  }

  // Write each session to teacher's calendar (localStorage)
  sessionDates.forEach(dateKey => {
    writeTeacherCalendarSlot(teacherId, dateKey, time, posScheduleStudentId);
  });

  // Update booking record in localStorage
  const all = getBookings();
  const idx = all.findIndex(b => b.id === posScheduleStudentId);
  if (idx !== -1) {
    all[idx] = {
      ...all[idx],
      paidScheduled:   true,
      assignedTutor:   teacher?.name,
      assignedTutorId: teacherId,
      course,
      classLink:       link,
      classTime:       to12h(time),
      classDayOfWeek:  dayOfWeek,
      totalWeeks:      weeks,
      sessionDates,
      scheduledAt:     new Date().toISOString(),
      tutorNotified:   false,
    };
    saveBookings(all);
  }

  /* ── Also assign in real DB ── */
  if (teacherDbId && dbBookingId) {
    try {
      const token = localStorage.getItem('sn_access_token');
      await fetch('https://api.stemnestacademy.co.uk/api/bookings/' + dbBookingId + '/assign', {
        method:  'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tutorId: teacherDbId, classLink: link }),
      });
    } catch (e) { console.warn('[PostSales] DB assign error:', e.message); }
  }

  closePOSScheduleModal();
  updatePOSStats();
  renderPaidStudents();
  showToast(`✅ ${weeks} sessions scheduled with ${teacher?.name} every ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]} at ${to12h(time)}!`);
}

function closePOSScheduleModal() {
  document.getElementById('posScheduleModalOverlay')?.classList.remove('open');
  posScheduleStudentId = null;
}

/* ══════════════════════════════════════════════════════
   SCHEDULED PAID CLASSES TABLE
══════════════════════════════════════════════════════ */
function renderScheduledPaid() {
  const el = document.getElementById('scheduledPaidList');
  if (!el) return;
  const bookings = getBookings().filter(b => b.paidScheduled);

  if (!bookings.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No paid classes scheduled yet.</div>';
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thStyle()}">Student</th>
            <th style="${thStyle()}">Course</th>
            <th style="${thStyle()}">Teacher</th>
            <th style="${thStyle()}">Schedule</th>
            <th style="${thStyle()}">Sessions</th>
            <th style="${thStyle()}">Class Link</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map((b, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i % 2 === 0 ? '' : 'background:#fafbff;'}">
              <td style="${tdStyle()}">
                <div style="font-weight:800;color:var(--dark);">${b.studentName}</div>
                <div style="font-size:11px;color:var(--light);">${b.id}</div>
              </td>
              <td style="${tdStyle()};font-weight:700;color:var(--mid);">${b.course || b.subject || '—'}</td>
              <td style="${tdStyle()};font-weight:700;color:var(--mid);">${b.assignedTutor || '—'}</td>
              <td style="${tdStyle()}">
                <div style="font-weight:700;color:var(--mid);">Every ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][b.classDayOfWeek] || '—'}</div>
                <div style="font-size:12px;color:var(--light);">${b.classTime || '—'}</div>
              </td>
              <td style="${tdStyle()};font-weight:800;color:var(--blue);">${b.totalWeeks || '—'} weeks</td>
              <td style="${tdStyle()}">
                ${b.classLink ? `<a href="${b.classLink}" target="_blank" style="color:var(--blue);font-weight:800;font-size:12px;">🔗 Open Link</a>` : '—'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   PAYMENT LINKS
══════════════════════════════════════════════════════ */
function loadCourseDropdown() {
  const sel = document.getElementById('pl-course');
  if (!sel) return;
  const courses = JSON.parse(localStorage.getItem('sn_courses') || '[]');
  sel.innerHTML = '<option value="">Select course</option>' +
    courses.map(c => `<option value="${c.name}">£${c.price || '—'} — ${c.name}</option>`).join('');
}

async function generatePaymentLink() {
  const student  = document.getElementById('pl-student')?.value.trim();
  const email    = document.getElementById('pl-email')?.value.trim();
  const course   = document.getElementById('pl-course')?.value;
  const amount   = document.getElementById('pl-amount')?.value;
  const currency = document.getElementById('pl-currency')?.value || 'GBP';
  const credits  = document.getElementById('pl-credits')?.value || '0';
  const notes    = document.getElementById('pl-notes')?.value.trim();
  if (!student || !email || !course || !amount) { showToast('Please fill in all required fields.', 'error'); return; }

  /* Try real API first */
  const online = typeof isApiAvailable === 'function' && await isApiAvailable();
  if (online && typeof Payments !== 'undefined') {
    try {
      const data = await Payments.createLink({
        studentName: student,
        studentEmail: email,
        courseId: null,
        amount: parseFloat(amount),
        currency,
        credits: parseInt(credits),
        notes,
      });
      generatedLink = data.paymentUrl;
      const box = document.getElementById('generatedLinkBox');
      const txt = document.getElementById('generatedLinkText');
      if (box) box.style.display = 'block';
      if (txt) txt.textContent = generatedLink;
      showToast('✅ Real payment link generated via Stripe!');
      return;
    } catch (e) {
      console.warn('[API] Payment link failed, using local fallback:', e.message);
    }
  }

  /* Fallback: local simulated link */
  const record = {
    id: 'PL-' + Date.now().toString(36).toUpperCase(),
    student, email,
    whatsapp: document.getElementById('pl-whatsapp')?.value.trim(),
    course, amount, currency, credits, notes,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  const all = JSON.parse(localStorage.getItem('sn_payment_links') || '[]');
  all.unshift(record);
  localStorage.setItem('sn_payment_links', JSON.stringify(all));

  generatedLink = `https://pay.stemnestacademy.co.uk/checkout?ref=${record.id}&student=${encodeURIComponent(student)}&course=${encodeURIComponent(course)}&amount=${amount}&currency=${currency}`;

  const box = document.getElementById('generatedLinkBox');
  const txt = document.getElementById('generatedLinkText');
  if (box) box.style.display = 'block';
  if (txt) txt.textContent = generatedLink;
  showToast('✅ Payment link generated!');
}

function copyPayLink() {
  if (!generatedLink) return;
  navigator.clipboard.writeText(generatedLink)
    .then(() => showToast('✅ Link copied!'))
    .catch(() => showToast('Copy failed — please copy manually.', 'error'));
}

function sendPayLinkEmail() {
  const email   = document.getElementById('pl-email')?.value.trim();
  const student = document.getElementById('pl-student')?.value.trim();
  if (!email || !generatedLink) return;
  console.log(`📧 EMAIL TO: ${email}\nSubject: Your StemNest Payment Link\n\nHi ${student},\n\nHere is your payment link:\n${generatedLink}\n\nStemNest Academy`);
  showToast('📧 Email sent (simulated)!', 'info');
}

function sendPayLinkWhatsApp() {
  const wa      = document.getElementById('pl-whatsapp')?.value.trim();
  const student = document.getElementById('pl-student')?.value.trim();
  const course  = document.getElementById('pl-course')?.value || 'Course';
  const amount  = document.getElementById('pl-amount')?.value || '';
  const currency = document.getElementById('pl-currency')?.value || 'GBP';
  if (!wa || !generatedLink) { showToast('Please enter a WhatsApp number.', 'error'); return; }
  if (typeof waPaymentLink === 'function') {
    waPaymentLink(wa, student, course, amount, currency, generatedLink);
  } else {
    window.open('https://wa.me/' + wa.replace(/[\s\-\(\)\+]/g,'') + '?text=' + encodeURIComponent('Hi ' + student + '! Here is your StemNest payment link:\n' + generatedLink), '_blank');
  }
  showToast('💬 WhatsApp opened with payment link!', 'info');
}

function clearPayLink() {
  ['pl-student','pl-email','pl-whatsapp','pl-amount','pl-credits','pl-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const sel = document.getElementById('pl-course'); if (sel) sel.value = '';
  const box = document.getElementById('generatedLinkBox'); if (box) box.style.display = 'none';
  generatedLink = null;
}

/* ══════════════════════════════════════════════════════
   CONVERTED
══════════════════════════════════════════════════════ */
function renderPOSConverted() {
  const el = document.getElementById('posConvertedList');
  if (!el) return;
  const pipeline = getAllPipeline().filter(p => p.status === 'converted');
  if (!pipeline.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No conversions yet.</div>';
    return;
  }
  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thStyle()}">Student</th>
            <th style="${thStyle()}">Subject</th>
            <th style="${thStyle()}">Course</th>
            <th style="${thStyle()}">Amount</th>
            <th style="${thStyle()}">Sales Person</th>
            <th style="${thStyle()}">Status</th>
          </tr>
        </thead>
        <tbody>
          ${pipeline.map((p, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i % 2 === 0 ? '' : 'background:#fafbff;'}">
              <td style="${tdStyle()};font-weight:800;color:var(--dark);">${p.studentName}</td>
              <td style="${tdStyle()};font-weight:700;color:var(--mid);">${p.subject || '—'}</td>
              <td style="${tdStyle()};font-weight:700;color:var(--mid);">${p.course || '—'}</td>
              <td style="${tdStyle()};font-weight:800;color:var(--green-dark);">£${p.paymentAmount || 0}</td>
              <td style="${tdStyle()};font-weight:700;color:var(--mid);">${p.salesPersonName || '—'}</td>
              <td style="${tdStyle()}"><span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Converted</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ── BIND MODALS ── */
function bindPOSModals() {
  const overlay = document.getElementById('posScheduleModalOverlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closePOSScheduleModal(); });
}

/* ══════════════════════════════════════════════════════
   PHASE 6 — BIRTHDAY CHECK
══════════════════════════════════════════════════════ */
function checkBirthdayForUser(userId, firstName) {
  const dob = localStorage.getItem('sn_dob_' + userId);
  if (!dob) return;
  const today = new Date();
  const birth = new Date(dob);
  if (today.getDate() !== birth.getDate() || today.getMonth() !== birth.getMonth()) return;
  const settings = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
  const template = settings.birthdayMsg || 'Happy Birthday {name}! 🎉 Wishing you a wonderful day from all of us at StemNest Academy!';
  const msg = template.replace('{name}', firstName || 'there');
  setTimeout(() => {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    popup.innerHTML = `<div style="background:var(--white);border-radius:28px;padding:48px 40px;max-width:440px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.35);">
      <div style="font-size:72px;margin-bottom:16px;">🎂</div>
      <div style="font-family:'Fredoka One',cursive;font-size:28px;color:var(--dark);margin-bottom:12px;">Happy Birthday, ${firstName}!</div>
      <div style="font-size:16px;color:var(--mid);line-height:1.7;margin-bottom:24px;">${msg}</div>
      <button onclick="this.closest('div[style]').remove()" style="background:var(--blue);color:#fff;border:none;padding:12px 32px;border-radius:50px;font-family:'Nunito',sans-serif;font-weight:900;font-size:16px;cursor:pointer;">Thank you! 🎉</button>
    </div>`;
    document.body.appendChild(popup);
  }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
  const staff = JSON.parse(localStorage.getItem('sn_staff') || '[]');
  const pos = staff.find(s => s.role === 'postsales');
  if (pos) setTimeout(() => checkBirthdayForUser(pos.id, pos.name.split(' ')[0]), 1500);
});

/* ══════════════════════════════════════════════════════
   PRIORITY 5 — STUDENT ONBOARDING
   One-click onboard from paid students list.
   Creates student account, generates credential file,
   simulates email to parent.
══════════════════════════════════════════════════════ */

let onboardingStudentId = null;

function openOnboardModal(bookingId) {
  onboardingStudentId = bookingId;
  const booking  = getBookings().find(b => b.id === bookingId);
  const pipeline = getAllPipeline().find(p => p.bookingId === bookingId);
  const s = booking || pipeline || {};

  // Pre-fill fields
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('ob-name',     s.studentName || '');
  set('ob-email',    s.email || '');
  set('ob-phone',    s.whatsapp || '');
  set('ob-age',      s.age || '');
  set('ob-grade',    s.grade || '');
  set('ob-subject',  s.subject || '');
  set('ob-course',   s.course || '');
  set('ob-credits',  s.studentCredits || s.credits || '');
  set('ob-amount',   s.paymentAmount || '');

  // Generate a suggested password
  const suggestedPw = 'SN' + Math.random().toString(36).slice(2, 8).toUpperCase() + '!';
  set('ob-password', suggestedPw);

  document.getElementById('onboardModalOverlay').classList.add('open');
}

function closeOnboardModal() {
  document.getElementById('onboardModalOverlay')?.classList.remove('open');
  onboardingStudentId = null;
}

async function confirmOnboard() {
  const name     = document.getElementById('ob-name')?.value.trim();
  const email    = document.getElementById('ob-email')?.value.trim();
  const phone    = document.getElementById('ob-phone')?.value.trim();
  const age      = document.getElementById('ob-age')?.value.trim();
  const grade    = document.getElementById('ob-grade')?.value.trim();
  const subject  = document.getElementById('ob-subject')?.value.trim();
  const course   = document.getElementById('ob-course')?.value.trim();
  const credits  = parseInt(document.getElementById('ob-credits')?.value || '0');
  const password = document.getElementById('ob-password')?.value.trim();

  if (!name || !email || !password) {
    showToast('Name, email and password are required.', 'error');
    return;
  }

  /* Try real API first — creates user in PostgreSQL */
  const online = typeof isApiAvailable === 'function' && await isApiAvailable();
  let studentId = null;

  if (online && typeof Users !== 'undefined') {
    try {
      const data = await apiCall('/api/users', {
        method: 'POST',
        body: {
          name, email, password, role: 'student',
          phone, whatsapp: phone,
        },
      });
      studentId = data.user?.staff_id || data.user?.id;
      showToast(`✅ ${name} created in database! ID: ${studentId}`);
    } catch (e) {
      console.warn('[API] Create student failed:', e.message);
      /* Fall through to localStorage */
    }
  }

  /* Generate student ID in S-0001 format if not from API */
  if (!studentId) {
    const existing = JSON.parse(localStorage.getItem('sn_students') || '[]');
    const seqNum   = existing.length + 1;
    studentId = 'S-' + String(seqNum).padStart(4, '0');
  }

  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const student = {
    id: studentId, name, initials, email, phone, age, grade,
    subject, course, password, credits,
    enrolledAt:  new Date().toISOString(),
    bookingId:   onboardingStudentId,
    status:      'active',
  };

  /* Save to localStorage students registry */
  const existing = JSON.parse(localStorage.getItem('sn_students') || '[]');
  const existIdx = existing.findIndex(s => s.email === email);
  if (existIdx !== -1) existing[existIdx] = { ...existing[existIdx], ...student };
  else existing.push(student);
  localStorage.setItem('sn_students', JSON.stringify(existing));

  /* Mark booking as onboarded */
  const all = getBookings();
  const idx = all.findIndex(b => b.id === onboardingStudentId);
  if (idx !== -1) {
    all[idx].studentOnboarded = true;
    all[idx].studentId        = studentId;
    all[idx].studentCredits   = credits;
    saveBookings(all);
  }

  if (typeof updatePasswordRegistry === 'function') {
    updatePasswordRegistry({ id: studentId, name, email, role: 'student', password });
  }

  const credText = typeof generateCredentialText === 'function' ? generateCredentialText(student) : '';
  if (credText && typeof downloadCredentialFile === 'function') {
    downloadCredentialFile(student, credText);
  }
  if (credText && typeof logEmail === 'function') {
    logEmail(email, 'Welcome to StemNest Academy — Your Child\'s Login Details', credText);
  }

  closeOnboardModal();
  updatePOSStats();
  renderPaidStudents();
  showToast(`✅ ${name} onboarded! Student ID: ${studentId}. Credentials sent.`);
}

function generateCredentialText(student) {
  return [
    '═══════════════════════════════════════════════',
    '  STEMNEST ACADEMY — STUDENT LOGIN DETAILS',
    '═══════════════════════════════════════════════',
    '',
    `  Student Name:  ${student.name}`,
    `  Student ID:    ${student.id}`,
    `  Email:         ${student.email}`,
    `  Password:      ${student.password}`,
    `  Phone:         ${student.phone || '—'}`,
    `  Course:        ${student.course || student.subject || '—'}`,
    `  Credits:       ${student.credits} classes`,
    '',
    '───────────────────────────────────────────────',
    '  HOW TO LOG IN',
    '───────────────────────────────────────────────',
    '',
    '  1. Go to: https://stemnestacademy.co.uk/pages/login.html',
    '  2. Click "I\'m a Student"',
    '  3. Enter the email and password above',
    '  4. Click "Log In & Join Class"',
    '',
    '  Your dashboard will show your upcoming classes,',
    '  projects, quizzes, and certificates.',
    '',
    '───────────────────────────────────────────────',
    '  NEED HELP?',
    '───────────────────────────────────────────────',
    '',
    '  Email:    support@stemnestacademy.co.uk',
    '  WhatsApp: Available on your dashboard',
    '',
    '  We recommend changing your password after',
    '  your first login.',
    '',
    '═══════════════════════════════════════════════',
    '  StemNest Academy Ltd · UK-Based · Globally Trusted',
    '═══════════════════════════════════════════════',
  ].join('\n');
}

function downloadCredentialFile(student, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `StemNest-Login-${student.name.replace(/\s+/g, '-')}-${student.id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function logEmail(to, subject, body) {
  const log = JSON.parse(localStorage.getItem('sn_email_log') || '[]');
  log.unshift({ to, subject, body, sentAt: new Date().toISOString(), status: 'simulated' });
  localStorage.setItem('sn_email_log', JSON.stringify(log));
  console.log('📧 EMAIL TO:', to, '\nSUBJECT:', subject, '\n\n', body);
}

/* renderPaidStudents is defined below — the override above is removed */

// Override renderPaidStudents to include onboard button
function renderPaidStudents() {
  const el = document.getElementById('paidStudentsList');
  if (!el) return;

  const pipeline = getAllPipeline().filter(p => p.status === 'converted');
  const bookings = getBookings().filter(b => b.salesStatus === 'converted');

  const seen = new Set();
  const students = [];
  bookings.forEach(b => { seen.add(b.id); students.push({ ...b, _source: 'booking' }); });
  pipeline.forEach(p => {
    if (!seen.has(p.bookingId)) students.push({ ...p, id: p.bookingId, _source: 'pipeline' });
  });

  if (!students.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:48px;margin-bottom:12px;">💼</div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No paid students yet</div>
      <div style="font-size:14px;color:var(--light);margin-top:6px;">Converted students from the sales pipeline will appear here.</div>
    </div>`;
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thStyle()}">Student</th>
            <th style="${thStyle()}">Subject</th>
            <th style="${thStyle()}">Contact</th>
            <th style="${thStyle()}">Amount</th>
            <th style="${thStyle()}">Credits</th>
            <th style="${thStyle()}">Onboarded</th>
            <th style="${thStyle('center')}">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((s, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdStyle()}">
                <div style="font-weight:800;color:var(--dark);">${s.studentName||'—'}</div>
                <div style="font-size:11px;color:var(--light);">${s.id||'—'}</div>
              </td>
              <td style="${tdStyle()};font-weight:700;color:var(--mid);">${s.subject||'—'}${s.course?'<div style="font-size:11px;color:var(--light);">'+s.course+'</div>':''}</td>
              <td style="${tdStyle()}">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${s.email||'—'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📱 ${s.whatsapp||'—'}</div>
              </td>
              <td style="${tdStyle()};font-weight:800;color:var(--green-dark);">${s.paymentAmount?'£'+s.paymentAmount:'—'}</td>
              <td style="${tdStyle()};font-weight:800;color:var(--blue);">${s.studentCredits||s.credits||'—'}</td>
              <td style="${tdStyle()}">
                ${s.studentOnboarded
                  ? `<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Done · ${s.studentId||''}</span>`
                  : `<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">⏳ Pending</span>`}
              </td>
              <td style="${tdStyle('center')}">
                <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                  ${!s.studentOnboarded ? `
                    <button onclick="openOnboardModal('${s.id}')"
                      style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;white-space:nowrap;">
                      🎓 Onboard
                    </button>` : `
                    <button onclick="redownloadCredentials('${s.id}')"
                      style="background:var(--bg);color:var(--mid);border:1.5px solid #e8eaf0;border-radius:10px;padding:7px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                      📄 Re-download
                    </button>`}
                  ${!s.paidScheduled ? `
                    <button onclick="openPOSScheduleModal('${s.id}')"
                      style="background:var(--green);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;white-space:nowrap;">
                      📅 Schedule
                    </button>` : ''}
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function redownloadCredentials(bookingId) {
  const students = JSON.parse(localStorage.getItem('sn_students') || '[]');
  const student  = students.find(s => s.bookingId === bookingId);
  if (!student) { showToast('Student record not found.', 'error'); return; }
  const text = generateCredentialText(student);
  downloadCredentialFile(student, text);
  showToast('📄 Credentials file downloaded!');
}

/* Bind onboard modal */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('onboardModalOverlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeOnboardModal(); });
});

/* ══════════════════════════════════════════════════════
   MANUAL ONBOARD — walk-in / referral students
   No demo booking required
══════════════════════════════════════════════════════ */
function openManualOnboardModal() {
  // Generate suggested password
  const pw = 'SN' + Math.random().toString(36).slice(2, 8).toUpperCase() + '!';
  const el = document.getElementById('mob-password');
  if (el) el.value = pw;
  // Clear other fields
  ['mob-name','mob-email','mob-phone','mob-age','mob-grade','mob-course','mob-credits','mob-amount'].forEach(id => {
    const f = document.getElementById(id); if (f) f.value = '';
  });
  document.getElementById('manualOnboardOverlay').classList.add('open');
}

function closeManualOnboardModal() {
  document.getElementById('manualOnboardOverlay')?.classList.remove('open');
}

async function confirmManualOnboard() {
  const name     = document.getElementById('mob-name')?.value.trim();
  const email    = document.getElementById('mob-email')?.value.trim();
  const phone    = document.getElementById('mob-phone')?.value.trim();
  const age      = document.getElementById('mob-age')?.value.trim();
  const grade    = document.getElementById('mob-grade')?.value.trim();
  const subject  = document.getElementById('mob-subject')?.value;
  const course   = document.getElementById('mob-course')?.value.trim();
  const credits  = parseInt(document.getElementById('mob-credits')?.value || '0');
  const amount   = document.getElementById('mob-amount')?.value.trim();
  const password = document.getElementById('mob-password')?.value.trim();

  if (!name || !email || !password) {
    showToast('Name, email and password are required.', 'error');
    return;
  }

  // Generate student ID in S-0001 format
  const existing  = JSON.parse(localStorage.getItem('sn_students') || '[]');
  const seqNum    = existing.length + 1;
  const studentId = 'S-' + String(seqNum).padStart(4, '0');
  const initials  = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const student = {
    id: studentId, name, initials, email, phone, age, grade,
    subject, course, password, credits, paymentAmount: amount,
    enrolledAt: new Date().toISOString(),
    status: 'active',
    isManualOnboard: true,
  };

  existing.push(student);
  localStorage.setItem('sn_students', JSON.stringify(existing));

  // Create a booking record so it appears on teacher dashboard
  // (Pre-Sales style — status 'converted', salesStatus 'converted')
  const bookingId = 'MOB-' + Date.now().toString(36).toUpperCase();
  const booking = {
    id:               bookingId,
    studentName:      name,
    studentId:        studentId,
    email,
    whatsapp:         phone,
    age,
    grade,
    subject,
    course,
    paymentAmount:    amount,
    studentCredits:   credits,
    status:           'scheduled',
    salesStatus:      'converted',
    studentOnboarded: true,
    isManualOnboard:  true,
    isDemoClass:      false,
    bookedAt:         new Date().toISOString(),
    scheduledAt:      new Date().toISOString(),
  };
  const allBookings = getBookings();
  allBookings.unshift(booking);
  saveBookings(allBookings);

  /* Also create in real DB so it syncs to teacher dashboard */
  try {
    const token = localStorage.getItem('sn_access_token');
    if (token) {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await fetch('https://api.stemnestacademy.co.uk/api/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          studentName: name, age: age || '—', grade: grade || '—',
          email, whatsapp: phone || '+000000000',
          subject: subject || 'Coding',
          device: 'laptop', timezone: 'Europe/London',
          date: futureDate, time: '10:00 AM',
        }),
      });
    }
  } catch (e) { /* silent */ }

  // Update student record with bookingId
  const sIdx = existing.findIndex(s => s.id === studentId);
  if (sIdx !== -1) { existing[sIdx].bookingId = bookingId; localStorage.setItem('sn_students', JSON.stringify(existing)); }

  // Update password registry
  if (typeof updatePasswordRegistry === 'function') {
    updatePasswordRegistry({ id: studentId, name, email, role: 'student', password });
  }

  // Generate and download credential file
  if (typeof generateCredentialText === 'function' && typeof downloadCredentialFile === 'function') {
    const text = generateCredentialText(student);
    downloadCredentialFile(student, text);
    if (typeof logEmail === 'function') {
      logEmail(email, 'Welcome to StemNest Academy — Your Login Details', text);
    }
  }

  closeManualOnboardModal();
  updatePOSStats();
  renderPaidStudents();
  showToast('✅ ' + name + ' onboarded! ID: ' + studentId + '. Booking created & credentials downloaded.');
}

// Bind manual onboard modal overlay close
document.addEventListener('DOMContentLoaded', function() {
  const overlay = document.getElementById('manualOnboardOverlay');
  overlay?.addEventListener('click', function(e) { if (e.target === overlay) closeManualOnboardModal(); });
});

/* ══════════════════════════════════════════════════════
   STUDENTS NEEDING TOP-UP
   Shows students with ≤ 2 credits. Post-Sales can
   generate and paste a payment link per student.
══════════════════════════════════════════════════════ */
function renderTopUpStudents() {
  const el = document.getElementById('topupStudentsList');
  if (!el) return;

  const students = JSON.parse(localStorage.getItem('sn_students') || '[]');
  const bookings = getBookings();

  // Merge students from both sources
  const seen = new Set();
  const list = [];

  students.forEach(s => {
    if ((parseInt(s.credits) || 0) <= 2) {
      seen.add(s.email);
      list.push({ ...s, _source: 'students' });
    }
  });

  bookings.forEach(b => {
    if (!seen.has(b.email) && (parseInt(b.studentCredits) || 0) <= 2 && b.studentOnboarded) {
      list.push({
        id:       b.studentId || b.id,
        name:     b.studentName,
        email:    b.email,
        phone:    b.whatsapp,
        subject:  b.subject,
        credits:  parseInt(b.studentCredits) || 0,
        _source:  'booking',
      });
    }
  });

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;background:var(--white);border-radius:16px;border:1.5px solid #e8eaf0;">' +
      '<div style="font-size:48px;margin-bottom:12px;">🎉</div>' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:20px;color:var(--dark);">All students have sufficient credits</div>' +
      '<div style="font-size:14px;color:var(--light);margin-top:6px;">Students with 2 or fewer credits will appear here.</div>' +
      '</div>';
    return;
  }

  const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:14px 16px;vertical-align:middle;';

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thS}">Student</th>
            <th style="${thS}">Subject</th>
            <th style="${thS}">Credits Left</th>
            <th style="${thS}">Contact</th>
            <th style="${thS}">Payment Link</th>
            <th style="${thS}">Status</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((s, i) => {
            const credits = parseInt(s.credits) || 0;
            const creditColor = credits <= 0 ? '#c53030' : '#e65100';
            const creditBg    = credits <= 0 ? '#fde8e8' : '#fff3e0';

            // Check if a payment link already exists for this student
            const allLinks = JSON.parse(localStorage.getItem('sn_payment_links') || '[]');
            const existingLink = allLinks.find(l =>
              (l.email === s.email || l.student === s.name) && l.status === 'pending'
            );

            const linkStatus = existingLink && existingLink.url
              ? `<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Link Sent</span>`
              : existingLink
                ? `<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">⏳ Link Pending</span>`
                : `<span style="background:#fde8e8;color:#c53030;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">❌ No Link Yet</span>`;

            return `<tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${s.name || s.studentName || '—'}</div>
                <div style="font-size:11px;color:var(--light);">${s.id || '—'}</div>
              </td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${s.subject || '—'}</td>
              <td style="${tdS}">
                <span style="background:${creditBg};color:${creditColor};font-family:'Fredoka One',cursive;font-size:20px;padding:4px 14px;border-radius:10px;">${credits}</span>
              </td>
              <td style="${tdS}">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${s.email || '—'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📱 ${s.phone || s.whatsapp || '—'}</div>
              </td>
              <td style="${tdS}">
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <input type="url" id="topupLink_${s.id}" placeholder="Paste payment link here..."
                    value="${existingLink && existingLink.url ? existingLink.url : ''}"
                    style="padding:8px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:12px;outline:none;width:220px;">
                  <button onclick="saveTopUpLink('${s.id}','${s.email}','${s.name || s.studentName || ''}','${s.subject || ''}')"
                    style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                    💾 Save & Send
                  </button>
                </div>
              </td>
              <td style="${tdS}">${linkStatus}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function saveTopUpLink(studentId, email, name, subject) {
  const input = document.getElementById('topupLink_' + studentId);
  const url   = input ? input.value.trim() : '';
  if (!url) { showToast('Please paste a payment link first.', 'error'); return; }

  // Save to sn_payment_links
  const all = JSON.parse(localStorage.getItem('sn_payment_links') || '[]');

  // Update existing or add new
  const existing = all.findIndex(l => (l.email === email || l.student === name) && l.status === 'pending');
  const record = {
    id:        existing !== -1 ? all[existing].id : 'PL-' + Date.now().toString(36).toUpperCase(),
    student:   name,
    email,
    subject,
    url,
    amount:    '',
    currency:  'GBP',
    credits:   '',
    status:    'pending',
    type:      'topup',
    createdAt: existing !== -1 ? all[existing].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existing !== -1) {
    all[existing] = record;
  } else {
    all.unshift(record);
  }

  localStorage.setItem('sn_payment_links', JSON.stringify(all));
  updatePOSStats();
  renderTopUpStudents();
  showToast('✅ Payment link saved! Student will see it on their dashboard.');
}
