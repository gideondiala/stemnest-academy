/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — POST-SALES DASHBOARD JS
   Receives converted (paid) students, schedules recurring
   paid classes, writes slots to teacher calendar.
═══════════════════════════════════════════════════════ */

const POS_TABS = ['students', 'scheduled', 'paylinks', 'converted'];
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
  if (tab === 'scheduled') renderScheduledPaid();
  if (tab === 'converted') renderPOSConverted();
}

/* ── STATS ── */
function updatePOSStats() {
  const pipeline  = getAllPipeline();
  const converted = pipeline.filter(p => p.status === 'converted');
  const rev       = converted.reduce((s, p) => s + (parseFloat(p.paymentAmount) || 0), 0);
  const bookings  = getBookings();
  setText('posStat1', bookings.filter(b => b.salesStatus === 'converted' && !b.paidScheduled).length);
  setText('posStat2', bookings.filter(b => b.paidScheduled).length);
  setText('posStat3', converted.length);
  setText('posStat4', '£' + rev.toFixed(0));
  setText('posBadge', bookings.filter(b => b.salesStatus === 'converted' && !b.paidScheduled).length);
}

/* ══════════════════════════════════════════════════════
   PAID STUDENTS TABLE
   Shows all converted students awaiting class scheduling
══════════════════════════════════════════════════════ */
function renderPaidStudents() {
  const el = document.getElementById('paidStudentsList');
  if (!el) return;

  // Converted pipeline entries + bookings marked converted
  const pipeline = getAllPipeline().filter(p => p.status === 'converted');
  const bookings = getBookings().filter(b => b.salesStatus === 'converted');

  // Merge — prefer booking record if exists
  const seen = new Set();
  const students = [];
  bookings.forEach(b => {
    seen.add(b.id);
    students.push({ ...b, _source: 'booking' });
  });
  pipeline.forEach(p => {
    if (!seen.has(p.bookingId)) {
      students.push({ ...p, id: p.bookingId, studentName: p.studentName, _source: 'pipeline' });
    }
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
            <th style="${thStyle()}">Subject / Course</th>
            <th style="${thStyle()}">Grade</th>
            <th style="${thStyle()}">Contact</th>
            <th style="${thStyle()}">Amount Paid</th>
            <th style="${thStyle()}">Credits</th>
            <th style="${thStyle()}">Status</th>
            <th style="${thStyle('center')}">Action</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((s, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i % 2 === 0 ? '' : 'background:#fafbff;'}">
              <td style="${tdStyle()}">
                <div style="font-weight:800;color:var(--dark);">${s.studentName || '—'}</div>
                <div style="font-size:11px;color:var(--light);font-weight:700;">${s.id || '—'}</div>
              </td>
              <td style="${tdStyle()}">
                <span style="font-weight:700;color:var(--mid);">${s.subject || '—'}</span>
                ${s.course ? `<div style="font-size:11px;color:var(--light);font-weight:700;">${s.course}</div>` : ''}
              </td>
              <td style="${tdStyle()};font-weight:700;color:var(--mid);">${s.grade || '—'}</td>
              <td style="${tdStyle()}">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${s.email || '—'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);margin-top:2px;">📱 ${s.whatsapp || '—'}</div>
              </td>
              <td style="${tdStyle()};font-weight:800;color:var(--green-dark);">
                ${s.paymentAmount ? `£${s.paymentAmount}` : '—'}
              </td>
              <td style="${tdStyle()};font-weight:800;color:var(--blue);">
                ${s.studentCredits || s.credits || '—'}
              </td>
              <td style="${tdStyle()}">
                ${s.paidScheduled
                  ? `<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Scheduled</span>`
                  : `<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">⏳ Pending</span>`}
              </td>
              <td style="${tdStyle('center')}">
                ${!s.paidScheduled ? `
                  <button onclick="openPOSScheduleModal('${s.id}')"
                    style="background:var(--green);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;white-space:nowrap;"
                    onmouseover="this.style.background='#065f46'" onmouseout="this.style.background='var(--green)'">
                    📅 Schedule Classes
                  </button>` : `
                  <button onclick="openPOSScheduleModal('${s.id}')"
                    style="background:var(--bg);color:var(--mid);border:1.5px solid #e8eaf0;border-radius:10px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                    ✏️ Edit Schedule
                  </button>`}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

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

function confirmPOSSchedule() {
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

  // Generate all weekly session dates
  const sessionDates = [];
  let current = new Date(startDate + 'T12:00:00');
  // Advance to the correct day of week
  while (current.getDay() !== dayOfWeek) {
    current.setDate(current.getDate() + 1);
  }
  for (let w = 0; w < weeks; w++) {
    sessionDates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7);
  }

  // Write each session to teacher's calendar
  sessionDates.forEach(dateKey => {
    writeTeacherCalendarSlot(teacherId, dateKey, time, posScheduleStudentId);
  });

  // Update booking record
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

function generatePaymentLink() {
  const student  = document.getElementById('pl-student')?.value.trim();
  const email    = document.getElementById('pl-email')?.value.trim();
  const course   = document.getElementById('pl-course')?.value;
  const amount   = document.getElementById('pl-amount')?.value;
  const currency = document.getElementById('pl-currency')?.value || 'GBP';
  const credits  = document.getElementById('pl-credits')?.value || '0';
  const notes    = document.getElementById('pl-notes')?.value.trim();
  if (!student || !email || !course || !amount) { showToast('Please fill in all required fields.', 'error'); return; }

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

  generatedLink = `https://pay.stemnest.co.uk/checkout?ref=${record.id}&student=${encodeURIComponent(student)}&course=${encodeURIComponent(course)}&amount=${amount}&currency=${currency}`;

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
  if (!wa || !generatedLink) { showToast('Please enter a WhatsApp number.', 'error'); return; }
  console.log(`💬 WHATSAPP TO: ${wa}\nHi ${student}! Here is your StemNest payment link:\n${generatedLink}`);
  showToast('💬 WhatsApp sent (simulated)!', 'info');
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
