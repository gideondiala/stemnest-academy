/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — POST-SALES DASHBOARD JS
   Receives converted (paid) students, schedules recurring
   paid classes, writes slots to teacher calendar.
═══════════════════════════════════════════════════════ */

const POS_TABS = ['students', 'topup', 'scheduled', 'paylinks', 'converted', 'website-enquiries', 'enrollment-requests', 'incoming-referrals'];
let generatedLink       = null;
let posScheduleStudentId = null; // booking ID being scheduled

window.POS_DATA = {
  bookings: [],
  teachers: [],
  pipeline: [],
  students: [],
  tutorAvail: {},
  paymentLinks: [],
  courses: []
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  const dateEl = document.getElementById('posDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  
  _loadPOSFromAPI().then(() => {
    loadCourseDropdown();
    loadCourseDropdownSchedule();
    showPOSTab('students');
    bindPOSModals();
  });

  /* Auto-refresh every 60 seconds */
  setInterval(() => {
    _loadPOSFromAPI().then(() => {
      updatePOSStats();
      renderPaidStudents();
    });
  }, 60000);
});

async function _loadPOSFromAPI() {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;

    // Fetch bookings
    const bRes = await fetch('https://api.stemnestacademy.co.uk/api/bookings?limit=500', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const bData = await bRes.json();
    if (bData.bookings) {
      window.POS_DATA.bookings = bData.bookings.map(b => {
        let notes = {};
        try { notes = typeof b.notes === 'string' ? JSON.parse(b.notes) : (b.notes || {}); } catch {}
        return {
          id:              b.id,
          dbId:            b.id,
          studentName:     b.lesson_name || notes.studentName || '—',
          studentId:       b.student_id || '',
          age:             notes.age || b.grade || '—',
          grade:           b.grade || notes.grade || '—',
          email:           b.student_email || notes.email || '—',
          whatsapp:        notes.whatsapp || '—',
          subject:         b.subject || '—',
          date:            b.date ? b.date.split('T')[0] : '—',
          time:            notes.time || b.time || '—',
          status:          b.status,
          assignedTutor:   b.tutor_name || '—',
          assignedSalesId: b.sales_staff_id || b.sales_id || '',
          salesStatus:     b.salesStatus || (b.status==='completed'?'converted':''),
          classLink:       b.class_link || '',
          paidScheduled:   notes.paidScheduled || false,
          bookedAt:        b.booked_at || b.created_at,
          scheduledAt:     b.scheduled_at,
        };
      });
    }

    // Attempt to fetch dashboard data (pipeline, students, etc.)
    try {
      const dRes = await fetch('https://api.stemnestacademy.co.uk/api/sync/dashboard/postsales', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const dData = await dRes.json();
      if (dData.pipeline) window.POS_DATA.pipeline = dData.pipeline;
      if (dData.students) window.POS_DATA.students = dData.students;
      if (dData.teachers) window.POS_DATA.teachers = dData.teachers;
    } catch {}

    // If teachers still empty, fetch from API
    if (window.POS_DATA.teachers.length === 0) {
      try {
        const tRes = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (tRes.ok) {
          const tData = await tRes.json();
          window.POS_DATA.teachers = (tData.users || []).map(u => ({
            id: u.id, staffId: u.staff_id, name: u.name, subject: u.subject || 'Coding'
          }));
        }
      } catch {}
    }

    // Courses from API
    try {
      const cRes = await fetch('https://api.stemnestacademy.co.uk/api/courses', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (cRes.ok) {
        const cData = await cRes.json();
        window.POS_DATA.courses = cData.courses || [];
      }
    } catch {}

    window.POS_DATA.paymentLinks = JSON.parse(localStorage.getItem('sn_payment_links') || '[]');

  } catch (e) {
    console.warn('[PostSales Dashboard] API load failed:', e.message);
  }
}

/* ── HELPERS ── */
function getBookings()  { return window.POS_DATA.bookings || []; }
function getTeachers()  { return window.POS_DATA.teachers || []; }
function saveBookings(list) { 
  window.POS_DATA.bookings = list;
  // Push status updates to API for any modified bookings
  const token = localStorage.getItem('sn_access_token');
  if (token) {
    list.filter(b => b._dirty).forEach(b => {
      fetch('https://api.stemnestacademy.co.uk/api/bookings/' + b.id + '/status', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: b.status })
      }).catch(() => {});
    });
  }
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function getAllPipeline() {
  return window.POS_DATA.pipeline || [];
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
  if (tab === 'students')           renderPaidStudents();
  if (tab === 'topup')              renderTopUpStudents();
  if (tab === 'scheduled')          renderScheduledPaid();
  if (tab === 'converted')          renderPOSConverted();
  if (tab === 'website-enquiries')  renderWebsiteEnquiries();
  if (tab === 'enrollment-requests') renderEnrollmentRequests();
  if (tab === 'incoming-referrals') renderIncomingReferrals();
}

/* ── STATS ── */
function updatePOSStats() {
  const pipeline  = getAllPipeline();
  const converted = pipeline.filter(p => p.status === 'converted');
  const rev       = converted.reduce((s, p) => s + (parseFloat(p.paymentAmount) || 0), 0);
  const bookings  = getBookings();
  const students  = window.POS_DATA.students || [];

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
  _posScheduleRows = [];

  const booking = getBookings().find(b => b.id === bookingId);
  const pipeline = getAllPipeline().find(p => p.bookingId === bookingId);
  const s = booking || pipeline || {};

  const infoEl = document.getElementById('pos-sm-info');
  if (infoEl) infoEl.innerHTML = `
    <strong>${s.studentName || '—'}</strong> · ${s.grade || '—'}<br>
    📚 ${s.subject || s.course || '—'} &nbsp;·&nbsp; 📧 ${s.email || '—'} &nbsp;·&nbsp; 📱 ${s.whatsapp || '—'}`;

  loadCourseDropdownSchedule(s.subject);
  populatePOSTeacherDropdown(s.subject);

  const dateEl = document.getElementById('pos-sm-start');
  if (dateEl) dateEl.min = new Date().toISOString().split('T')[0];

  ['pos-sm-weeks','pos-sm-link'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  _renderPOSScheduleRows();
  document.getElementById('posScheduleModalOverlay').classList.add('open');
}

/* ── Schedule row helpers ── */
let _posScheduleRows = [];

function _buildPOSScheduleRow(idx) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `<div class="enrol-schedule-row" id="pos-row-${idx}" style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
    <select id="pos-day-${idx}" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;color:var(--dark,#1a202c);outline:none;background:#fff;">
      <option value="">— Day —</option>
      ${days.map((d,i) => `<option value="${i}">${d}</option>`).join('')}
    </select>
    <input type="time" id="pos-time-${idx}" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;color:var(--dark,#1a202c);outline:none;">
    ${idx > 0 ? `<button type="button" onclick="removePOSScheduleRow(${idx})" style="background:#fde8e8;color:#c53030;border:none;border-radius:10px;padding:8px 12px;font-size:18px;cursor:pointer;font-weight:900;line-height:1;">×</button>` : '<div style="width:40px;"></div>'}
  </div>`;
}

function _renderPOSScheduleRows() {
  const container = document.getElementById('pos-schedule-rows');
  if (!container) return;
  container.innerHTML = _buildPOSScheduleRow(0) + _buildPOSScheduleRow(1);
  _posScheduleRows = [0, 1];
}

function addPOSScheduleRow() {
  const container = document.getElementById('pos-schedule-rows');
  if (!container) return;
  const existing = container.querySelectorAll('.enrol-schedule-row').length;
  if (existing >= 5) { showToast('Maximum 5 days per week.', 'error'); return; }
  const div = document.createElement('div');
  div.innerHTML = _buildPOSScheduleRow(existing);
  container.appendChild(div.firstChild);
  _posScheduleRows.push(existing);
}

function removePOSScheduleRow(idx) {
  const row = document.getElementById('pos-row-' + idx);
  if (row) row.remove();
}

function _getPOSSchedule() {
  const schedule = [];
  const container = document.getElementById('pos-schedule-rows');
  if (!container) return schedule;
  container.querySelectorAll('.enrol-schedule-row').forEach(row => {
    const dayEl  = row.querySelector('select[id^="pos-day-"]');
    const timeEl = row.querySelector('input[type="time"]');
    if (dayEl && timeEl && dayEl.value !== '' && timeEl.value) {
      schedule.push({ weekday: parseInt(dayEl.value), time: timeEl.value });
    }
  });
  return schedule;
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
  const courses = window.POS_DATA.courses || [];
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
  const weeks     = parseInt(document.getElementById('pos-sm-weeks')?.value || '0');
  const link      = document.getElementById('pos-sm-link')?.value.trim();
  const schedule  = _getPOSSchedule();

  if (!teacherId)         { showToast('Please select a teacher.', 'error'); return; }
  if (!startDate)         { showToast('Please select a start date.', 'error'); return; }
  if (!schedule.length)   { showToast('Please set at least one day and time.', 'error'); return; }
  if (!weeks || weeks < 1){ showToast('Please enter the number of weeks.', 'error'); return; }
  if (!link)              { showToast('Please enter a class link.', 'error'); return; }

  const btn = document.querySelector('#posScheduleModalOverlay .btn-green');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Scheduling…'; }

  const teacher = getTeachers().find(t => t.id === teacherId);
  const localBooking = getBookings().find(b => b.id === posScheduleStudentId) ||
                       getAllPipeline().find(p => p.bookingId === posScheduleStudentId) || {};

  /* Generate all session dates for each day */
  const allSessions = [];
  schedule.forEach(slot => {
    let current = new Date(startDate + 'T12:00:00');
    while (current.getDay() !== slot.weekday) { current.setDate(current.getDate() + 1); }
    for (let w = 0; w < weeks; w++) {
      allSessions.push({ date: current.toISOString().split('T')[0], time: slot.time });
      current.setDate(current.getDate() + 7);
    }
  });
  allSessions.sort((a, b) => a.date.localeCompare(b.date));

  /* Write to teacher calendar + create booking entries */
  allSessions.forEach(session => {
    const bId = 'POS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5);
    writeTeacherCalendarSlot(teacherId, session.date, session.time, bId);

    const newBooking = {
      id:              bId,
      studentName:     localBooking.studentName || '—',
      studentId:       localBooking.studentId || '',
      email:           localBooking.email || '',
      whatsapp:        localBooking.whatsapp || '',
      grade:           localBooking.grade || '',
      age:             localBooking.age || '',
      subject:         localBooking.subject || '',
      course:          course || localBooking.course || '',
      assignedTutor:   teacher?.name || '—',
      assignedTutorId: teacherId,
      classLink:       link,
      date:            session.date,
      time:            to12h(session.time),
      timeRaw:         session.time,
      status:          'scheduled',
      isDemoClass:     false,
      paymentAmount:   localBooking.paymentAmount || 0,
      isRecurring:     true,
      paidScheduled:   true,
      bookedAt:        new Date().toISOString(),
      scheduledAt:     new Date().toISOString(),
    };
    const allBk = getBookings();
    allBk.unshift(newBooking);
    saveBookings(allBk);
  });

  /* Mark original booking as scheduled */
  const all = getBookings();
  const idx = all.findIndex(b => b.id === posScheduleStudentId);
  if (idx !== -1) {
    all[idx].paidScheduled   = true;
    all[idx].assignedTutor   = teacher?.name;
    all[idx].assignedTutorId = teacherId;
    all[idx].course          = course;
    all[idx].classLink       = link;
    all[idx].schedule        = schedule;
    all[idx].totalWeeks      = weeks;
    all[idx].scheduledAt     = new Date().toISOString();
    saveBookings(all);
  }

  /* Also assign in real DB */
  try {
    const token = localStorage.getItem('sn_access_token');
    if (token) {
      const uRes = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const uData = await uRes.json();
      const dbTeacher = (uData.users || []).find(u => u.staff_id === teacherId || u.id === teacherId);
      const dbBookingId = localBooking.dbId || posScheduleStudentId;
      if (dbTeacher && dbBookingId && dbBookingId.length > 20) {
        await fetch('https://api.stemnestacademy.co.uk/api/bookings/' + dbBookingId + '/assign', {
          method:  'PUT',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ tutorId: dbTeacher.id, classLink: link }),
        });
      }
    }
  } catch (e) { console.warn('[PostSales] DB assign error:', e.message); }

  if (btn) { btn.disabled = false; btn.textContent = '✅ Schedule All Classes'; }
  closePOSScheduleModal();
  updatePOSStats();
  renderPaidStudents();

  const daysText = schedule.map(s => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.weekday] + ' ' + to12h(s.time)).join(' + ');
  showToast(`✅ ${allSessions.length} sessions scheduled with ${teacher?.name} — ${daysText} for ${weeks} weeks!`);
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
  const courses = window.POS_DATA.courses || [];
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
  const all = window.POS_DATA.paymentLinks || [];
  all.unshift(record);
  window.POS_DATA.paymentLinks = all;
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

/* ══════════════════════════════════════════════════════
   WEBSITE ENQUIRIES — Direct course enrolment requests
   from the public courses page "Enrol Now" button
   Now reads from /api/enrollments/requests (source=website)
══════════════════════════════════════════════════════ */
async function renderWebsiteEnquiries() {
  const el = document.getElementById('websiteEnquiriesList');
  if (!el) return;

  el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">⏳ Loading enquiries...</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/requests?status=pending', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const enquiries = (data.requests || []).filter(r => r.source === 'website' || !r.source);

    if (!enquiries.length) {
      el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--light);font-weight:700;">No website enquiries yet.<br><span style="font-size:13px;">When parents click "Enrol Now" on the courses page, their details appear here.</span></div>';
      return;
    }

    el.innerHTML = `
      <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
              <th style="${thStyle()}">Student</th>
              <th style="${thStyle()}">Course</th>
              <th style="${thStyle()}">Contact</th>
              <th style="${thStyle()}">Timezone</th>
              <th style="${thStyle()}">Amount</th>
              <th style="${thStyle()}">Received</th>
              <th style="${thStyle('center')}">Action</th>
            </tr>
          </thead>
          <tbody>
            ${enquiries.map((r, i) => `
              <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
                <td style="${tdStyle()}">
                  <div style="font-weight:800;color:var(--dark);">${r.student_name || '—'}</div>
                  <div style="font-size:11px;color:var(--light);">Age: ${r.age || '—'}</div>
                </td>
                <td style="${tdStyle()};font-weight:700;color:var(--mid);">${r.course_name || r.course_name_db || '—'}</td>
                <td style="${tdStyle()}">
                  <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${r.email || '—'}</div>
                  <div style="font-size:12px;font-weight:700;color:var(--mid);">📱 ${r.phone || '—'}</div>
                </td>
                <td style="${tdStyle()};font-size:12px;color:var(--mid);">${r.timezone || '—'}</td>
                <td style="${tdStyle()};font-weight:800;color:var(--green-dark);">£${parseFloat(r.course_price || r.course_price_db || 0).toFixed(0)}</td>
                <td style="${tdStyle()};font-size:12px;color:var(--light);">${r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
                <td style="${tdStyle('center')}">
                  <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
                    ${r.phone ? `<a href="https://wa.me/${r.phone.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;text-decoration:none;white-space:nowrap;">💬 WhatsApp</a>` : ''}
                    ${r.email ? `<a href="mailto:${r.email}" style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;text-decoration:none;white-space:nowrap;">📧 Email</a>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px;font-size:12px;font-weight:700;color:var(--light);text-align:right;">${enquiries.length} enquir${enquiries.length!==1?'ies':'y'}</div>`;
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--orange);font-weight:700;">Failed to load enquiries. Please refresh.</div>';
  }
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

  if (online) {
    try {
      const token = localStorage.getItem('sn_access_token');
      if (!token) throw new Error('Not logged in');

      const res = await fetch('https://api.stemnestacademy.co.uk/api/users', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name, email, password, role: 'student',
          phone, whatsapp: phone,
          grade, age, credits, course
        }),
      });
      const data = await res.json();
      if (data.success) {
        studentId = data.user?.staff_id || data.user?.id;
        console.log('[Onboard] Student created in DB:', studentId);
      } else {
        console.warn('[Onboard] API create failed:', data.error);
      }
    } catch (e) {
      console.warn('[API] Create student failed:', e.message);
    }
  }

  /* Generate student ID in S-0001 format if not from API */
  const existing = window.POS_DATA.students || [];
  if (!studentId) {
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

  /* Save to in-memory students registry */
  const existIdx = existing.findIndex(s => s.email === email);
  if (existIdx !== -1) existing[existIdx] = { ...existing[existIdx], ...student };
  else existing.push(student);
  window.POS_DATA.students = existing;
  // Data is in the DB — no localStorage write needed

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
  const students = window.POS_DATA.students || [];
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

  /* Create student in real DB first */
  let dbStudentId = null;
  try {
    const token = localStorage.getItem('sn_access_token');
    if (token) {
      const res = await fetch('https://api.stemnestacademy.co.uk/api/users', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ 
          name, email, password, role: 'student', phone, whatsapp: phone,
          grade, age, credits, course
        }),
      });
      const data = await res.json();
      if (data.success) {
        dbStudentId = data.user?.id;
        console.log('[ManualOnboard] Student created in DB:', dbStudentId);
      } else {
        console.warn('[ManualOnboard] DB create failed:', data.error);
      }
    }
  } catch (e) { console.warn('[ManualOnboard] API error:', e.message); }

  // Generate student ID in S-0001 format
  const existing  = window.POS_DATA.students || [];
  const seqNum    = existing.length + 1;
  const studentId = dbStudentId || ('S-' + String(seqNum).padStart(4, '0'));
  const initials  = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const student = {
    id: studentId, name, initials, email, phone, age, grade,
    subject, course, password, credits, paymentAmount: amount,
    enrolledAt: new Date().toISOString(),
    status: 'active',
    isManualOnboard: true,
  };

  existing.push(student);
  window.POS_DATA.students = existing;
  // Data is in the DB — no localStorage write needed
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
  if (sIdx !== -1) { 
    existing[sIdx].bookingId = bookingId; 
    window.POS_DATA.students = existing;
    // Data is in the DB — no localStorage write needed
  }

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

  const students = window.POS_DATA.students || [];
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
            const allLinks = window.POS_DATA.paymentLinks || [];
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
  const all = window.POS_DATA.paymentLinks || [];

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

  window.POS_DATA.paymentLinks = all;
  localStorage.setItem('sn_payment_links', JSON.stringify(all));
  updatePOSStats();
  renderTopUpStudents();
  showToast('✅ Payment link saved! Student will see it on their dashboard.');
}

/* ══════════════════════════════════════════════════════
   ENROLLMENT REQUESTS
   From website "Enrol Now" button → POST /api/enrollments/request
   Post-Sales generates payment link, marks received, proceeds
══════════════════════════════════════════════════════ */
async function renderEnrollmentRequests() {
  const el = document.getElementById('enrollmentRequestsList');
  if (!el) return;

  el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">⏳ Loading enrollment requests...</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) { el.innerHTML = '<div style="padding:24px;color:var(--orange);font-weight:700;">Not logged in.</div>'; return; }

    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/requests', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const requests = (data.requests || []).filter(r => r.status !== 'processed');

    if (!requests.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:12px;">📋</div>
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No enrollment requests yet</div>
        <div style="font-size:14px;color:var(--light);margin-top:6px;">When parents click "Enrol Now" on the courses page, their details appear here.</div>
      </div>`;
      return;
    }

    el.innerHTML = `
      <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
              <th style="${thStyle()}">Student</th>
              <th style="${thStyle()}">Course</th>
              <th style="${thStyle()}">Contact</th>
              <th style="${thStyle()}">Amount</th>
              <th style="${thStyle()}">Payment Link</th>
              <th style="${thStyle()}">Payment Status</th>
              <th style="${thStyle('center')}">Action</th>
            </tr>
          </thead>
          <tbody>
            ${requests.map((r, i) => `
              <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
                <td style="${tdStyle()}">
                  <div style="font-weight:800;color:var(--dark);">${r.student_name || '—'}</div>
                  <div style="font-size:11px;color:var(--light);">Age: ${r.age || '—'} · #${r.id}</div>
                </td>
                <td style="${tdStyle()}">
                  <div style="font-weight:800;color:var(--dark);">${r.course_name || r.course_name_db || '—'}</div>
                  ${r.course_price || r.course_price_db ? `<div style="font-size:11px;color:var(--green-dark);font-weight:800;">£${parseFloat(r.course_price || r.course_price_db).toFixed(0)}</div>` : ''}
                </td>
                <td style="${tdStyle()}">
                  <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${r.email || '—'}</div>
                  <div style="font-size:12px;font-weight:700;color:var(--mid);">
                    ${r.phone ? `<a href="https://wa.me/${r.phone.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="color:#25D366;font-weight:800;text-decoration:none;">📱 ${r.phone}</a>` : '📱 —'}
                  </div>
                </td>
                <td style="${tdStyle()};font-weight:800;color:var(--green-dark);">
                  ${r.course_price || r.course_price_db ? '£' + parseFloat(r.course_price || r.course_price_db).toFixed(0) : '—'}
                </td>
                <td style="${tdStyle()}">
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    <input type="url" id="enrLink_${r.id}" placeholder="Paste payment link..."
                      value="${r.payment_link || ''}"
                      style="padding:8px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:12px;outline:none;width:200px;">
                    <button onclick="saveEnrollmentPaymentLink(${r.id})"
                      style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">
                      💾 Save Link
                    </button>
                  </div>
                </td>
                <td style="${tdStyle()}">
                  <select id="enrStatus_${r.id}" onchange="updateEnrollmentStatus(${r.id})"
                    style="padding:8px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;outline:none;background:#fff;">
                    <option value="pending" ${(r.payment_status||'pending')==='pending'?'selected':''}>⏳ Pending</option>
                    <option value="received" ${r.payment_status==='received'?'selected':''}>✅ Received</option>
                  </select>
                </td>
                <td style="${tdStyle('center')}">
                  <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
                    <button onclick="openGreyPaymentModal(${r.id}, ${JSON.stringify(r.student_name||'Student')}, ${parseFloat(r.course_price||r.course_price_db||0).toFixed(2)}, 'USD')"
                      style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;white-space:nowrap;">
                      💳 Get Payment Details
                    </button>
                    <button onclick="proceedEnrollmentRequest(${r.id})"
                      id="enrProceed_${r.id}"
                      ${r.payment_status !== 'received' ? 'disabled' : ''}
                      style="background:${r.payment_status==='received'?'var(--green)':'#e8eaf0'};color:${r.payment_status==='received'?'#fff':'var(--light)'};border:none;border-radius:10px;padding:8px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:${r.payment_status==='received'?'pointer':'not-allowed'};white-space:nowrap;transition:.15s;">
                      🚀 Proceed
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px;font-size:12px;font-weight:700;color:var(--light);text-align:right;">${requests.length} request${requests.length!==1?'s':''}</div>`;
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--orange);font-weight:700;">Failed to load enrollment requests. Please refresh.</div>';
    console.error('[PostSales] Enrollment requests error:', e);
  }
}

async function saveEnrollmentPaymentLink(requestId) {
  const linkEl = document.getElementById('enrLink_' + requestId);
  const link = linkEl ? linkEl.value.trim() : '';
  if (!link) { showToast('Please enter a payment link first.', 'error'); return; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/requests/' + requestId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentLink: link })
    });
    const data = await res.json();
    if (data.success) showToast('✅ Payment link saved!');
    else showToast('Failed: ' + (data.error || 'Unknown'), 'error');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function updateEnrollmentStatus(requestId) {
  const sel = document.getElementById('enrStatus_' + requestId);
  const status = sel ? sel.value : 'pending';
  const token = localStorage.getItem('sn_access_token');

  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/requests/' + requestId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentStatus: status })
    });
    const data = await res.json();
    if (data.success) {
      /* Enable/disable Proceed button */
      const btn = document.getElementById('enrProceed_' + requestId);
      if (btn) {
        btn.disabled = status !== 'received';
        btn.style.background = status === 'received' ? 'var(--green)' : '#e8eaf0';
        btn.style.color = status === 'received' ? '#fff' : 'var(--light)';
        btn.style.cursor = status === 'received' ? 'pointer' : 'not-allowed';
      }
      showToast(status === 'received' ? '✅ Payment marked as received! You can now Proceed.' : '⏳ Status updated to Pending.');
    } else {
      showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function proceedEnrollmentRequest(requestId) {
  const sel = document.getElementById('enrStatus_' + requestId);
  if (!sel || sel.value !== 'received') {
    showToast('Payment must be marked as Received before proceeding.', 'error');
    return;
  }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/requests/' + requestId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proceed: true })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Student moved to Paid Students section!');
      /* Reload the tab */
      renderEnrollmentRequests();
      /* Also refresh paid students */
      await _loadPOSFromAPI();
      renderPaidStudents();
    } else {
      showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   INCOMING REFERRALS (postsales)
   Referrals sent from presales with status='postsales'
   Post-Sales generates payment link, sends via email/WA,
   marks received, proceeds to paid students
══════════════════════════════════════════════════════ */
async function renderIncomingReferrals() {
  const el = document.getElementById('posIncomingReferralsList');
  if (!el) return;

  el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">⏳ Loading referrals...</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) { el.innerHTML = '<div style="padding:24px;color:var(--orange);font-weight:700;">Not logged in.</div>'; return; }

    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/referrals?status=postsales', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const referrals = (data.referrals || []).filter(r => r.status !== 'enrolled');

    if (!referrals.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:12px;">🤝</div>
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No referrals for enrollment yet</div>
        <div style="font-size:14px;color:var(--light);margin-top:6px;">Referrals sent from Pre-Sales for enrollment will appear here.</div>
      </div>`;
      return;
    }

    el.innerHTML = `
      <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
              <th style="${thStyle()}">Referred Student</th>
              <th style="${thStyle()}">Grade / Age</th>
              <th style="${thStyle()}">Parent Contact</th>
              <th style="${thStyle()}">Referred By</th>
              <th style="${thStyle()}">Payment Link</th>
              <th style="${thStyle()}">Payment Status</th>
              <th style="${thStyle('center')}">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${referrals.map((r, i) => `
              <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
                <td style="${tdStyle()}">
                  <div style="font-weight:800;color:var(--dark);">${r.student_name || '—'}</div>
                  <div style="font-size:11px;color:var(--light);">Ref #${r.id}</div>
                </td>
                <td style="${tdStyle()};font-weight:700;color:var(--mid);">${r.grade || '—'} · Age ${r.age || '—'}</td>
                <td style="${tdStyle()}">
                  <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${r.parent_email || '—'}</div>
                  <div style="font-size:12px;font-weight:700;color:var(--mid);">
                    ${r.parent_phone
                      ? `<a href="https://wa.me/${r.parent_phone.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="color:#25D366;font-weight:800;text-decoration:none;">📱 ${r.parent_phone}</a>`
                      : '📱 —'}
                  </div>
                </td>
                <td style="${tdStyle()}">
                  <div style="font-weight:800;color:var(--blue);">${r.referrer_name || '—'}</div>
                  <div style="font-size:11px;color:var(--light);">${r.referrer_staff_id || ''}</div>
                </td>
                <td style="${tdStyle()}">
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    <input type="url" id="refLink_${r.id}" placeholder="Paste payment link..."
                      value="${r.payment_link || ''}"
                      style="padding:8px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:12px;outline:none;width:200px;">
                    <div style="display:flex;gap:6px;">
                      <button onclick="saveReferralPaymentLink(${r.id})"
                        style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">
                        💾 Save
                      </button>
                      <button onclick="sendReferralPaymentLink(${r.id},'${(r.parent_email||'').replace(/'/g,'')}')"
                        style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:6px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">
                        📤 Send
                      </button>
                    </div>
                  </div>
                </td>
                <td style="${tdStyle()}">
                  <select id="refStatus_${r.id}" onchange="updateReferralStatus(${r.id})"
                    style="padding:8px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;outline:none;background:#fff;">
                    <option value="pending" ${(r.payment_status||'pending')==='pending'?'selected':''}>⏳ Pending</option>
                    <option value="received" ${r.payment_status==='received'?'selected':''}>✅ Received</option>
                  </select>
                </td>
                <td style="${tdStyle('center')}">
                  <button onclick="proceedReferralEnrollment(${r.id})"
                    id="refProceed_${r.id}"
                    ${r.payment_status !== 'received' ? 'disabled' : ''}
                    style="background:${r.payment_status==='received'?'var(--green)':'#e8eaf0'};color:${r.payment_status==='received'?'#fff':'var(--light)'};border:none;border-radius:10px;padding:9px 16px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:${r.payment_status==='received'?'pointer':'not-allowed'};white-space:nowrap;transition:.15s;">
                    🚀 Proceed
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px;font-size:12px;font-weight:700;color:var(--light);text-align:right;">${referrals.length} referral${referrals.length!==1?'s':''}</div>`;
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--orange);font-weight:700;">Failed to load referrals. Please refresh.</div>';
    console.error('[PostSales] Referrals error:', e);
  }
}

async function saveReferralPaymentLink(referralId) {
  const linkEl = document.getElementById('refLink_' + referralId);
  const link = linkEl ? linkEl.value.trim() : '';
  if (!link) { showToast('Please enter a payment link first.', 'error'); return; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/referrals/' + referralId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentLink: link })
    });
    const data = await res.json();
    if (data.success) showToast('✅ Payment link saved!');
    else showToast('Failed: ' + (data.error || 'Unknown'), 'error');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

function sendReferralPaymentLink(referralId, parentEmail) {
  const linkEl = document.getElementById('refLink_' + referralId);
  const link = linkEl ? linkEl.value.trim() : '';
  if (!link) { showToast('Please save a payment link first.', 'error'); return; }

  /* Open WhatsApp with the link */
  const row = document.querySelector(`#refLink_${referralId}`)?.closest('tr');
  const waLink = row ? row.querySelector('a[href^="https://wa.me"]')?.href : null;
  if (waLink) {
    const msg = encodeURIComponent('Hello! Here is your StemNest Academy payment link to complete enrollment:\n' + link + '\n\nPlease complete payment to confirm your child\'s place. Thank you!');
    window.open(waLink.split('?')[0] + '?text=' + msg, '_blank');
  }

  /* Also log email */
  if (parentEmail) {
    console.log('[EMAIL] To:', parentEmail, '\nPayment link:', link);
    showToast('📤 Payment link sent via WhatsApp! Email logged.');
  } else {
    showToast('📤 WhatsApp opened with payment link!');
  }
}

async function updateReferralStatus(referralId) {
  const sel = document.getElementById('refStatus_' + referralId);
  const status = sel ? sel.value : 'pending';
  const token = localStorage.getItem('sn_access_token');

  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/referrals/' + referralId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentStatus: status })
    });
    const data = await res.json();
    if (data.success) {
      const btn = document.getElementById('refProceed_' + referralId);
      if (btn) {
        btn.disabled = status !== 'received';
        btn.style.background = status === 'received' ? 'var(--green)' : '#e8eaf0';
        btn.style.color = status === 'received' ? '#fff' : 'var(--light)';
        btn.style.cursor = status === 'received' ? 'pointer' : 'not-allowed';
      }
      showToast(status === 'received' ? '✅ Payment received! You can now Proceed.' : '⏳ Status updated.');
    } else {
      showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function proceedReferralEnrollment(referralId) {
  const sel = document.getElementById('refStatus_' + referralId);
  if (!sel || sel.value !== 'received') {
    showToast('Payment must be marked as Received before proceeding.', 'error');
    return;
  }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/referrals/' + referralId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proceed: true })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Referral student moved to Paid Students!');
      renderIncomingReferrals();
      await _loadPOSFromAPI();
      renderPaidStudents();
    } else {
      showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   GREY FINANCE PAYMENT INTEGRATION
   Shows USD bank details, generates SN-REF-XXXX references,
   auto-confirms when Grey webhook fires
══════════════════════════════════════════════════════ */

/* Cache account details so we don't fetch every time */
let _greyAccounts = null;

async function loadGreyAccountDetails() {
  if (_greyAccounts) return _greyAccounts;
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/grey/account-details', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.success) { _greyAccounts = data.accounts; return data.accounts; }
  } catch(e) { console.warn('[Grey] Failed to load account details:', e.message); }
  return [];
}

/* Build the bank details card HTML for a given currency */
function buildGreyBankCard(account, reference) {
  const fields = account.currency === 'USD' ? [
    { label: 'Account Name',    value: account.accountName },
    { label: 'Account Number',  value: account.accountNumber },
    { label: 'Routing Number',  value: account.routingNumber },
    { label: 'Account Type',    value: account.accountType },
    { label: 'Bank Name',       value: account.bankName },
    { label: 'Bank Address',    value: account.bankAddress },
    { label: 'Payment Reference', value: reference, highlight: true },
  ] : [
    { label: 'Account Name',    value: account.accountName },
    { label: 'Account Number',  value: account.accountNumber },
    { label: 'Sort Code',       value: account.sortCode },
    { label: 'Bank Name',       value: account.bankName },
    { label: 'Payment Reference', value: reference, highlight: true },
  ];

  return `
    <div style="background:var(--white);border:2px solid #e8eaf0;border-radius:16px;padding:20px 24px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <span style="font-size:24px;">${account.flag}</span>
        <div>
          <div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);">${account.label}</div>
          <div style="font-size:12px;color:var(--light);font-weight:700;">Bank Transfer</div>
        </div>
      </div>
      ${fields.map(f => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f2f8;">
          <span style="font-size:12px;font-weight:700;color:var(--light);text-transform:uppercase;letter-spacing:.3px;">${f.label}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;font-weight:${f.highlight?'900':'800'};color:${f.highlight?'var(--blue)':'var(--dark)'};">${f.value || '—'}</span>
            <button onclick="copyToClipboard('${(f.value||'').replace(/'/g,"\\'")}','${f.label}')"
              style="background:var(--bg);border:1px solid #e8eaf0;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:800;color:var(--mid);cursor:pointer;">
              📋
            </button>
          </div>
        </div>`).join('')}
      <div style="margin-top:12px;background:#fff8e1;border-radius:8px;padding:10px 14px;font-size:12px;font-weight:700;color:#e65100;">
        ⚠️ ${account.instructions}
      </div>
    </div>`;
}

function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text)
    .then(() => showToast('✅ ' + label + ' copied!'))
    .catch(() => {
      /* Fallback for older browsers */
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('✅ ' + label + ' copied!');
    });
}

/* Open the Grey payment modal for an enrollment request */
async function openGreyPaymentModal(enrollmentRequestId, studentName, amount, currency) {
  const modal = document.getElementById('greyPaymentModalOverlay');
  if (!modal) return;

  /* Show loading state */
  document.getElementById('greyPaymentBody').innerHTML =
    '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading bank details...</div>';
  modal.classList.add('open');

  try {
    const token = localStorage.getItem('sn_access_token');

    /* Generate a unique payment reference */
    const refRes = await fetch('https://api.stemnestacademy.co.uk/api/grey/payment-reference', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentRequestId,
        studentName,
        amount: amount || 0,
        currency: currency || 'USD',
      })
    });
    const refData = await refRes.json();
    const reference = refData.reference || 'SN-REF-ERROR';

    /* Load account details */
    const accounts = await loadGreyAccountDetails();

    if (!accounts.length) {
      document.getElementById('greyPaymentBody').innerHTML =
        '<div style="padding:24px;color:var(--orange);font-weight:700;">Bank details not configured. Contact admin.</div>';
      return;
    }

    document.getElementById('greyPaymentBody').innerHTML = `
      <div style="background:var(--green-light);border-radius:12px;padding:14px 18px;margin-bottom:20px;font-size:13px;font-weight:700;color:var(--green-dark);">
        ✅ Payment reference generated for <strong>${studentName}</strong>
        ${amount ? ` — Amount: <strong>${currency || 'USD'} ${parseFloat(amount).toFixed(2)}</strong>` : ''}
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--mid);margin-bottom:16px;">
        Share these bank details with the parent. Ask them to include the <strong style="color:var(--blue);">Payment Reference</strong> in the transfer description.
      </div>
      ${accounts.map(a => buildGreyBankCard(a, reference)).join('')}
      <div style="background:#f0f4ff;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:700;color:#1e40af;">
        📡 Payment will be <strong>automatically confirmed</strong> once received. The student will be moved to Paid Students and receive a welcome email.
      </div>`;
  } catch(e) {
    document.getElementById('greyPaymentBody').innerHTML =
      '<div style="padding:24px;color:var(--orange);font-weight:700;">Failed to load payment details. Please try again.</div>';
  }
}

function closeGreyPaymentModal() {
  document.getElementById('greyPaymentModalOverlay')?.classList.remove('open');
}

/* Bind modal close on overlay click */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('greyPaymentModalOverlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeGreyPaymentModal(); });
});

/* ══════════════════════════════════════════════════════
   PATHWAY SELECTOR FOR ONBOARDING
   Loads pathways + grades into onboard modal dropdowns
══════════════════════════════════════════════════════ */

let _posPathways = [];
let _posGrades   = {};  // keyed by pathwayId → array of grades

async function loadPathwaysForOnboarding() {
  if (_posPathways.length) return; // already loaded
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/pathways/for-onboarding', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.success) {
      _posPathways = data.pathways || [];
      /* Group grades by pathway_id */
      (data.grades || []).forEach(g => {
        if (!_posGrades[g.pathway_id]) _posGrades[g.pathway_id] = [];
        _posGrades[g.pathway_id].push(g);
      });
    }
  } catch(e) { console.warn('[PostSales] Pathways load failed:', e.message); }
}

function populatePathwayDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select Pathway (optional) —</option>' +
    _posPathways.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function onPathwayChange(pathwaySelectId, gradeSelectId) {
  const pathwayId = document.getElementById(pathwaySelectId)?.value;
  const gradeSel  = document.getElementById(gradeSelectId);
  if (!gradeSel) return;
  if (!pathwayId) {
    gradeSel.innerHTML = '<option value="">— Select Grade —</option>';
    return;
  }
  const grades = _posGrades[pathwayId] || [];
  gradeSel.innerHTML = '<option value="">— Select Grade —</option>' +
    grades.map(g => `<option value="${g.grade_number}">Grade ${g.grade_number}${g.name ? ' — ' + g.name : ''} (${g.lesson_count || 0} lessons)</option>`).join('');
}

/* Override openOnboardModal to also load pathways */
const _origOpenOnboardModal = window.openOnboardModal;
window.openOnboardModal = async function(bookingId) {
  await loadPathwaysForOnboarding();
  _origOpenOnboardModal(bookingId);
  populatePathwayDropdown('ob-pathway');
  /* Pre-select pathway if enrollment request had one */
  const booking = (window.POS_DATA.bookings || []).find(b => b.id === bookingId);
  if (booking && booking.pathway_id) {
    const sel = document.getElementById('ob-pathway');
    if (sel) { sel.value = booking.pathway_id; onPathwayChange('ob-pathway','ob-pathway-grade'); }
    if (booking.grade_number) {
      const gradeSel = document.getElementById('ob-pathway-grade');
      if (gradeSel) gradeSel.value = booking.grade_number;
    }
  }
};

/* Override openManualOnboardModal to also load pathways */
const _origOpenManualOnboardModal = window.openManualOnboardModal;
window.openManualOnboardModal = async function() {
  await loadPathwaysForOnboarding();
  _origOpenManualOnboardModal();
  populatePathwayDropdown('mob-pathway');
};
