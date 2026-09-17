/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — POST-SALES DASHBOARD JS
   Receives converted (paid) students, schedules recurring
   paid classes, writes slots to teacher calendar.
═══════════════════════════════════════════════════════ */

const POS_TABS = ['students', 'topup', 'scheduled', 'paylinks', 'converted', 'website-enquiries', 'enrollment-requests', 'incoming-referrals', 'promotions', 'pause-resume', 'batches'];
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

  /* Restore any manually onboarded synthetic payment records from sessionStorage
     so they survive 60s auto-refresh cycles */
  try {
    const stored = sessionStorage.getItem('pos_manual_payments');
    if (stored) {
      window.POS_DATA.payments = JSON.parse(stored);
    }
  } catch (e) { /* silent */ }

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

    // Confirmed payments — for Paid Students tab
    try {
      const pRes = await fetch('https://api.stemnestacademy.co.uk/api/payments?status=confirmed', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (pRes.ok) {
        const pData = await pRes.json();
        const apiPayments = pData.payments || [];

        /* Preserve synthetic manual-onboard records — they have no real payment in DB.
           Merge: keep synthetics from memory AND sessionStorage that aren't in API response */
        let existingSynthetic = (window.POS_DATA.payments || []).filter(p => p._manualOnboard);
        try {
          const stored = sessionStorage.getItem('pos_manual_payments');
          if (stored) {
            const storedSynthetics = JSON.parse(stored);
            const inMemoryIds = new Set(existingSynthetic.map(p => p.id));
            storedSynthetics.forEach(p => {
              if (!inMemoryIds.has(p.id)) existingSynthetic.push(p);
            });
          }
        } catch (e) { /* silent */ }
        const apiStudentIds = new Set(apiPayments.map(p => p.student_id).filter(Boolean));
        const syntheticToKeep = existingSynthetic.filter(p => !apiStudentIds.has(p.student_id));
        window.POS_DATA.payments = [...apiPayments, ...syntheticToKeep];

        /* Mark manual students for display */
        const paidIds = new Set(window.POS_DATA.payments.map(p => p.student_id).filter(Boolean));
        if (window.POS_DATA.students) {
          window.POS_DATA.students = window.POS_DATA.students.map(s => ({
            ...s,
            isManualOnboard: !paidIds.has(s.id),
          }));
        }
      }
    } catch {}

    // Pathways for schedule dropdown
    try {
      const pwRes = await fetch('https://api.stemnestacademy.co.uk/api/pathways', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (pwRes.ok) {
        const pwData = await pwRes.json();
        window.POS_DATA.pathways = pwData.pathways || [];
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
  if (tab === 'pause-resume')       renderPauseResume();
  if (tab === 'batches')            renderBatchesTab();
  if (tab === 'converted')          renderPOSConverted();
  if (tab === 'website-enquiries')  renderWebsiteEnquiries();
  if (tab === 'enrollment-requests') renderEnrollmentRequests();
  if (tab === 'incoming-referrals') renderIncomingReferrals();
  if (tab === 'promotions')        renderPromotions();
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

  /* Try to find student in bookings, pipeline, then manual onboards */
  const booking  = getBookings().find(b => b.id === bookingId);
  const pipeline = getAllPipeline().find(p => p.bookingId === bookingId);

  /* For manually onboarded students: bookingId is the student's DB UUID */
  const manualStudent = (window.POS_DATA.students || []).find(s =>
    s.dbId === bookingId || s.id === bookingId
  );

  /* Also check confirmed payments for name/contact fallback */
  const paymentRecord = (window.POS_DATA.payments || []).find(p =>
    p.student_id === bookingId || p.id === bookingId
  );

  const s = booking || pipeline || (manualStudent ? {
    studentName:   manualStudent.name,
    grade:         manualStudent.grade || '—',
    subject:       manualStudent.subject || '—',
    course:        manualStudent.course  || '—',
    email:         manualStudent.email   || '—',
    whatsapp:      manualStudent.phone   || '—',
    dbId:          manualStudent.dbId,
    studentId:     manualStudent.dbId,
    paymentAmount: manualStudent.paymentAmount || 0,
  } : null) || (paymentRecord ? {
    studentName: paymentRecord.student_name  || '—',
    grade:       '—',
    subject:     paymentRecord.subject       || '—',
    course:      paymentRecord.course_name   || '—',
    email:       paymentRecord.student_email || '—',
    whatsapp:    paymentRecord.whatsapp      || '—',
    dbId:        paymentRecord.student_id,
    studentId:   paymentRecord.student_id,
  } : null) || {};

  const infoEl = document.getElementById('pos-sm-info');
  if (infoEl) infoEl.innerHTML = `
    <strong>${s.studentName || '—'}</strong> · ${s.grade || '—'}<br>
    📚 ${s.subject || s.course || '—'} &nbsp;·&nbsp; 📧 ${s.email || '—'} &nbsp;·&nbsp; 📱 ${s.whatsapp || '—'}`;

  loadCourseDropdownSchedule(s.subject);
  populatePOSTeacherDropdown(s.subject); /* async — fills dropdown from API */
  populatePOSPathwayDropdown();           /* async — fills pathway selector */

  /* Pre-select the course/pathway that the LA pitched */
  const pitchedCourse = pipeline?.course || pipeline?.course_pitched || s.course || '';
  if (pitchedCourse) {
    setTimeout(() => {
      const sel = document.getElementById('pos-sm-course');
      if (sel) {
        /* Try exact match first */
        const opt = Array.from(sel.options).find(o => o.value === pitchedCourse || o.text.includes(pitchedCourse));
        if (opt) sel.value = opt.value;
        else {
          /* Add it as an option if not found */
          const newOpt = document.createElement('option');
          newOpt.value = pitchedCourse;
          newOpt.textContent = pitchedCourse;
          newOpt.selected = true;
          sel.appendChild(newOpt);
        }
      }
    }, 100);
  }

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

async function populatePOSPathwayDropdown() {
  const sel = document.getElementById('pos-sm-pathway');
  if (!sel) return;

  sel.innerHTML = '<option value="">— Select pathway —</option>';

  try {
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/pathways/for-onboarding', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      const data = await res.json();
      const pathways = data.pathways || [];
      /* Cache grades for the onchange handler */
      window._posPathwayGrades = data.grades || [];
      pathways.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
    }
  } catch (e) { console.warn('[PostSales] Pathway dropdown failed:', e.message); }
}

async function onPOSPathwayChange() {
  const pathwaySel = document.getElementById('pos-sm-pathway');
  const gradeSel   = document.getElementById('pos-sm-grade');
  if (!pathwaySel || !gradeSel) return;

  const pathwayId = pathwaySel.value;
  gradeSel.innerHTML = '<option value="">— Select grade —</option>';
  if (!pathwayId) return;

  /* Use cached grades from for-onboarding (avoids extra API call) */
  const allGrades = window._posPathwayGrades || [];
  const grades    = allGrades
    .filter(function(g) { return g.pathway_id === pathwayId; })
    .sort(function(a, b) { return (a.grade_number || 0) - (b.grade_number || 0); });

  if (grades.length) {
    grades.forEach(function(g) {
      var opt = document.createElement('option');
      opt.value = g.grade_number;
      opt.textContent = 'Grade ' + g.grade_number + (g.name && g.name !== 'Grade ' + g.grade_number ? ' — ' + g.name : '');
      gradeSel.appendChild(opt);
    });
  } else {
    /* Fallback: fetch from API */
    try {
      const token = localStorage.getItem('sn_access_token');
      const r = await fetch('https://api.stemnestacademy.co.uk/api/pathways/' + pathwayId + '/grades', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (r.ok) {
        const d = await r.json();
        (d.grades || []).sort(function(a, b) { return (a.grade_number||0) - (b.grade_number||0); })
          .forEach(function(g) {
            var opt = document.createElement('option');
            opt.value = g.grade_number;
            opt.textContent = 'Grade ' + g.grade_number;
            gradeSel.appendChild(opt);
          });
      }
    } catch (e) { console.warn('[PostSales] Grade dropdown fallback failed:', e.message); }
  }
}

async function populatePOSTeacherDropdown(subject) {
  const sel = document.getElementById('pos-sm-teacher');
  if (!sel) return;

  sel.innerHTML = '<option value="">⏳ Loading teachers…</option>';

  /* Always fetch fresh from API to guarantee up-to-date list */
  try {
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      const data = await res.json();
      window.POS_DATA.teachers = (data.users || []).map(u => ({
        id:      u.id,
        staffId: u.staff_id,
        name:    u.name,
        subject: u.subject || 'Coding',
      }));
    }
  } catch (e) { console.warn('[PostSales] Teacher reload failed:', e.message); }

  let teachers = window.POS_DATA.teachers || [];
  if (subject && teachers.length > 0) {
    const filtered = teachers.filter(t => t.subject === subject);
    if (filtered.length > 0) teachers = filtered;
  }

  if (teachers.length === 0) {
    sel.innerHTML = '<option value="">⚠️ No teachers found — check admin</option>';
    return;
  }

  sel.innerHTML = '<option value="">— Select a teacher —</option>' +
    teachers.map(t =>
      `<option value="${t.id}">${t.name} (${t.staffId || t.id.slice(0,8)}) · ${t.subject}</option>`
    ).join('');
}

function loadCourseDropdownSchedule(subject) {
  const sel = document.getElementById('pos-sm-course');
  if (!sel) return;

  /* Combine pathways + courses */
  const pathways = (window.POS_DATA.pathways || []).map(p => ({ name: p.name, type: 'pathway' }));
  const courses  = (window.POS_DATA.courses  || []).map(c => ({ name: c.name, type: 'course' }));
  const all      = [...pathways, ...courses];

  let filtered = all;
  if (subject && all.length > 0) {
    const sub = subject.toLowerCase();
    const f   = all.filter(c => c.name && c.name.toLowerCase().includes(sub));
    if (f.length > 0) filtered = f;
  }

  sel.innerHTML = '<option value="">Select course / pathway</option>' +
    (filtered.length ? filtered : all)
      .map(c => `<option value="${c.name}">${c.name}${c.type === 'pathway' ? ' 📚' : ''}</option>`).join('');
}

async function confirmPOSSchedule() {
  const teacherId = document.getElementById('pos-sm-teacher')?.value;
  const course    = document.getElementById('pos-sm-course')?.value;
  const startDate = document.getElementById('pos-sm-start')?.value;
  const weeks     = parseInt(document.getElementById('pos-sm-weeks')?.value || '0');
  const link      = document.getElementById('pos-sm-link')?.value.trim();
  const schedule  = _getPOSSchedule();
  const pathwayId  = document.getElementById('pos-sm-pathway')?.value  || null;
  const gradeNumber = document.getElementById('pos-sm-grade')?.value    || null;

  if (!teacherId)         { showToast('Please select a teacher.', 'error'); return; }
  if (!startDate)         { showToast('Please select a start date.', 'error'); return; }
  if (!schedule.length)   { showToast('Please set at least one day and time.', 'error'); return; }
  if (!weeks || weeks < 1){ showToast('Please enter the number of weeks.', 'error'); return; }
  if (!link)              { showToast('Please enter a class link.', 'error'); return; }

  const btn = document.querySelector('#posScheduleModalOverlay .btn-green');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Scheduling…'; }

  const teacher = getTeachers().find(t => t.id === teacherId);

  /* For manually onboarded students, look them up in POS_DATA.students */
  const manualStudent = (window.POS_DATA.students || []).find(s =>
    (s.dbId || s.id) === posScheduleStudentId || s.id === posScheduleStudentId
  );

  const localBooking = getBookings().find(b => b.id === posScheduleStudentId) ||
                       getAllPipeline().find(p => p.bookingId === posScheduleStudentId) ||
                       (manualStudent ? {
                         id:          manualStudent.dbId || manualStudent.id,
                         dbId:        manualStudent.dbId,
                         studentName: manualStudent.name,
                         studentId:   manualStudent.dbId,
                         email:       manualStudent.email,
                         whatsapp:    manualStudent.phone,
                         grade:       manualStudent.grade,
                         age:         manualStudent.age,
                         subject:     manualStudent.subject,
                         course:      manualStudent.course,
                         paymentAmount: manualStudent.paymentAmount,
                       } : {});

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

  /* Create booking sessions in real DB using bulk-schedule endpoint
     (no per-session emails — ONE summary email sent at the end) */
  const token = localStorage.getItem('sn_access_token');

  /* Look up DB tutor UUID */
  let dbTutorId   = null;
  let dbTutorName = teacher?.name || '—';
  try {
    const uRes  = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const uData = await uRes.json();
    const dbTeacher = (uData.users || []).find(u => u.staff_id === teacherId || u.id === teacherId);
    dbTutorId   = dbTeacher?.id   || null;
    dbTutorName = dbTeacher?.name || dbTutorName;
  } catch (e) { console.warn('[PostSales] Tutor lookup failed:', e.message); }

  /* Call the dedicated bulk-schedule endpoint — creates sessions, assigns tutor, sends ONE email */
  let dbSessionsCreated = 0;
  let bulkScheduleError = null;
  try {
    if (!dbTutorId) {
      bulkScheduleError = 'Could not find the selected teacher in the database. Please try again.';
    } else {
      const bulkRes = await fetch('https://api.stemnestacademy.co.uk/api/bookings/bulk-schedule', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          studentId:    localBooking.dbId || localBooking.studentId || null,
          studentName:  localBooking.studentName || '—',
          studentEmail: localBooking.email || '',
          tutorId:      dbTutorId,
          tutorName:    dbTutorName,
          course:       course || localBooking.course || '—',
          classLink:    link,
          grade:        localBooking.grade || 'Grade 1',
          pathwayId:    pathwayId || null,
          gradeNumber:  gradeNumber ? parseInt(gradeNumber) : null,
          sessions:     allSessions.map(s => ({ date: s.date, time: s.time })),
        }),
      });
      const bulkData = await bulkRes.json();
      if (bulkData.success) {
        dbSessionsCreated = bulkData.count || 0;
      } else {
        bulkScheduleError = bulkData.error || 'Scheduling failed on the server';
      }
    }
  } catch (e) {
    bulkScheduleError = 'Network error: ' + e.message;
  }

  if (bulkScheduleError) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Schedule All Classes'; }
    showToast('❌ Scheduling failed: ' + bulkScheduleError, 'error');
    return;
  }

  /* Write in-memory records for immediate UI display */
  allSessions.forEach(session => {
    const bId = 'POS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5);
    writeTeacherCalendarSlot(teacherId, session.date, session.time, bId);
    const allBk = getBookings();
    allBk.unshift({
      id: bId, studentName: localBooking.studentName || '—',
      studentId: localBooking.studentId || '', email: localBooking.email || '',
      whatsapp: localBooking.whatsapp || '', grade: localBooking.grade || '',
      age: localBooking.age || '', subject: localBooking.subject || '',
      course: course || localBooking.course || '',
      assignedTutor: dbTutorName, assignedTutorId: teacherId,
      classLink: link, date: session.date, time: to12h(session.time),
      timeRaw: session.time, status: 'scheduled', isDemoClass: false,
      paymentAmount: localBooking.paymentAmount || 0,
      isRecurring: true, paidScheduled: true,
      bookedAt: new Date().toISOString(), scheduledAt: new Date().toISOString(),
    });
    saveBookings(allBk);
  });

  /* Mark the student as scheduled so they move out of the Schedule button view */
  const payIdx = (window.POS_DATA.payments || []).findIndex(p =>
    p.student_id === posScheduleStudentId || p.id === posScheduleStudentId
  );
  if (payIdx !== -1) {
    window.POS_DATA.payments[payIdx].paidScheduled   = true;
    window.POS_DATA.payments[payIdx].assignedTutor   = dbTutorName;
    window.POS_DATA.payments[payIdx].course          = course || localBooking.course;
    window.POS_DATA.payments[payIdx].classLink       = link;
    window.POS_DATA.payments[payIdx].totalWeeks      = weeks;
    window.POS_DATA.payments[payIdx].schedule        = schedule;
    window.POS_DATA.payments[payIdx].firstDate       = allSessions[0]?.date || '';
  }

  const stuIdx = (window.POS_DATA.students || []).findIndex(s =>
    s.dbId === posScheduleStudentId || s.id === posScheduleStudentId
  );
  if (stuIdx !== -1) {
    window.POS_DATA.students[stuIdx].paidScheduled   = true;
    window.POS_DATA.students[stuIdx].assignedTutor   = dbTutorName;
    window.POS_DATA.students[stuIdx].course          = course || window.POS_DATA.students[stuIdx].course;
    window.POS_DATA.students[stuIdx].classLink       = link;
    window.POS_DATA.students[stuIdx].totalWeeks      = weeks;
    window.POS_DATA.students[stuIdx].schedule        = schedule;
    window.POS_DATA.students[stuIdx].firstDate       = allSessions[0]?.date || '';
  }

  /* Persist scheduled flags to sessionStorage */
  try {
    const allSynthetics = window.POS_DATA.payments.filter(p => p._manualOnboard);
    sessionStorage.setItem('pos_manual_payments', JSON.stringify(allSynthetics));
  } catch (e) { /* silent */ }

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
async function renderScheduledPaid() {
  const el = document.getElementById('scheduledPaidList');
  if (!el) return;

  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading scheduled classes...</div>';

  try {
    /* Load directly from DB — all students with future scheduled paid bookings */
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/bookings/scheduled-students', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data  = await res.json();
    const scheduledStudents = data.students || [];

    if (!scheduledStudents.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No paid classes scheduled yet.</div>';
      return;
    }

    el.innerHTML =
      '<div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">' +
        '<th style="' + thStyle() + '">Student</th>' +
        '<th style="' + thStyle() + '">Course</th>' +
        '<th style="' + thStyle() + '">Teacher</th>' +
        '<th style="' + thStyle() + '">Next Class</th>' +
        '<th style="' + thStyle() + '">Remaining</th>' +
        '<th style="' + thStyle() + '">Class Link</th>' +
        '<th style="' + thStyle('center') + '">Actions</th>' +
      '</tr></thead>' +
      '<tbody>' +
      scheduledStudents.map(function(s, i) {
        return '<tr style="border-bottom:1px solid #f0f2f8;' + (i%2===0?'':'background:#fafbff;') + '">' +
          '<td style="' + tdStyle() + '">' +
            '<div style="font-weight:800;color:var(--dark);">' + (s.studentName || '—') + '</div>' +
            '<div style="font-size:11px;color:var(--light);">📧 ' + (s.email || '—') + '</div>' +
          '</td>' +
          '<td style="' + tdStyle() + ';font-weight:700;color:var(--mid);">' + (s.course || '—') + '</td>' +
          '<td style="' + tdStyle() + ';font-weight:700;color:var(--mid);">' + (s.tutorName || '—') + '</td>' +
          '<td style="' + tdStyle() + ';font-size:12px;font-weight:700;color:var(--mid);">' +
            (s.nextDate ? new Date(s.nextDate + 'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) + ' ' + s.nextTime : '—') +
          '</td>' +
          '<td style="' + tdStyle() + ';font-weight:800;color:var(--blue);">' + (s.remainingCount || 0) + ' classes</td>' +
          '<td style="' + tdStyle() + '">' +
            (s.classLink ? '<a href="' + s.classLink + '" target="_blank" style="color:var(--blue);font-weight:800;font-size:12px;">🔗 Open</a>' : '—') +
          '</td>' +
          '<td style="' + tdStyle('center') + '">' +
            '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">' +
              '<button onclick="openRescheduleStudentModal(\'' + s.studentId + '\',\'' + (s.studentName||'').replace(/'/g,'') + '\',\'' + (s.tutorId||'') + '\',\'' + (s.classLink||'').replace(/'/g,'&#39;') + '\')" ' +
                'style="background:#1a56db;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;">' +
                '🔄 Reschedule</button>' +
              '<button onclick="openChangeTutorModal(\'' + s.studentId + '\',\'' + (s.studentName||'').replace(/'/g,'') + '\')" ' +
                'style="background:#0e9f6e;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;">' +
                '👩‍🏫 Change Tutor</button>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';

  } catch(e) {
    el.innerHTML = '<div style="padding:24px;color:#c53030;font-weight:700;">Failed to load: ' + e.message + '</div>';
  }
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
   RESCHEDULE STUDENT CLASSES
══════════════════════════════════════════════════════ */
let _rescheduleStudentId = null;
let _rescheduleTutorId   = null;

function _buildRSRow(idx, prefillDay, prefillTime) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `<div class="enrol-schedule-row" id="rs-row-${idx}" style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
    <select id="rs-day-${idx}" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;outline:none;background:#fff;">
      <option value="">— Day —</option>
      ${days.map((d,i) => `<option value="${i}"${prefillDay !== undefined && prefillDay !== null && parseInt(prefillDay) === i ? ' selected' : ''}>${d}</option>`).join('')}
    </select>
    <input type="time" id="rs-time-${idx}" value="${prefillTime || ''}" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;outline:none;">
    ${idx > 0 ? `<button type="button" onclick="document.getElementById('rs-row-${idx}').remove()" style="background:#fde8e8;color:#c53030;border:none;border-radius:10px;padding:8px 12px;font-size:18px;cursor:pointer;font-weight:900;line-height:1;">×</button>` : '<div style="width:40px;"></div>'}
  </div>`;
}

function addRSScheduleRow() {
  const container = document.getElementById('rs-schedule-rows');
  if (!container) return;
  const existing = container.querySelectorAll('.enrol-schedule-row').length;
  if (existing >= 5) { showToast('Maximum 5 days per week.', 'error'); return; }
  const div = document.createElement('div');
  div.innerHTML = _buildRSRow(existing);
  container.appendChild(div.firstChild);
}

function _getRSSchedule() {
  const schedule = [];
  const container = document.getElementById('rs-schedule-rows');
  if (!container) return schedule;
  container.querySelectorAll('.enrol-schedule-row').forEach(row => {
    const dayEl  = row.querySelector('select[id^="rs-day-"]');
    const timeEl = row.querySelector('input[type="time"]');
    if (dayEl && timeEl && dayEl.value !== '' && timeEl.value) {
      schedule.push({ weekday: parseInt(dayEl.value), time: timeEl.value });
    }
  });
  return schedule;
}

async function openRescheduleStudentModal(studentId, studentName, tutorId, classLink) {
  _rescheduleStudentId = studentId;
  _rescheduleTutorId   = tutorId || null;

  const infoEl = document.getElementById('reschedule-student-info');
  if (infoEl) infoEl.textContent = `📋 Rescheduling classes for: ${studentName}`;

  /* Default start date = tomorrow */
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const startEl = document.getElementById('rs-start-date');
  if (startEl) {
    startEl.min   = tomorrow.toISOString().split('T')[0];
    startEl.value = tomorrow.toISOString().split('T')[0];
  }

  /* Pre-fill class link if known */
  const linkEl = document.getElementById('rs-class-link');
  if (linkEl) linkEl.value = classLink || '';

  /* Show spinner while loading current schedule */
  const container = document.getElementById('rs-schedule-rows');
  if (container) container.innerHTML = '<div style="text-align:center;padding:16px;color:#888;font-weight:700;">⏳ Loading current schedule…</div>';
  document.getElementById('rescheduleStudentOverlay').classList.add('open');

  try {
    const token = localStorage.getItem('sn_access_token');
    const resp  = await fetch(`https://api.stemnestacademy.co.uk/api/bookings/student-schedule/${studentId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await resp.json();

    if (data.success && data.schedule && data.schedule.length) {
      /* Store tutor from schedule if not passed in */
      if (!_rescheduleTutorId && data.schedule[0].tutor_id) {
        _rescheduleTutorId = data.schedule[0].tutor_id;
      }
      /* Pre-fill class link from schedule if not already set */
      if (linkEl && !linkEl.value && data.schedule[0].class_link) {
        linkEl.value = data.schedule[0].class_link;
      }
      /* Build rows from existing schedule (top slots by frequency) */
      const slots = data.schedule.slice(0, 5);
      container.innerHTML = slots.map((sl, i) => _buildRSRow(i, parseInt(sl.weekday), sl.time)).join('');
    } else {
      /* No existing schedule found — show 2 blank rows */
      container.innerHTML = _buildRSRow(0) + _buildRSRow(1);
    }
  } catch(e) {
    container.innerHTML = _buildRSRow(0) + _buildRSRow(1);
  }
}

function closeRescheduleStudentModal() {
  document.getElementById('rescheduleStudentOverlay')?.classList.remove('open');
  _rescheduleStudentId = null;
  _rescheduleTutorId   = null;
}

async function confirmRescheduleStudent() {
  const startDate = document.getElementById('rs-start-date')?.value;
  const schedule  = _getRSSchedule();
  const classLink = document.getElementById('rs-class-link')?.value.trim();

  if (!startDate)           { showToast('Please select a start date.', 'error'); return; }
  if (!schedule.length)     { showToast('Please set at least one day and time.', 'error'); return; }
  if (!_rescheduleStudentId){ showToast('No student selected.', 'error'); return; }

  const btn = document.querySelector('#rescheduleStudentOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Checking for clashes…'; }

  const token = localStorage.getItem('sn_access_token');

  /* ── Step 1: Clash detection ─────────────────────────────────────── */
  if (_rescheduleTutorId) {
    try {
      const clashRes = await fetch('https://api.stemnestacademy.co.uk/api/bookings/check-clashes', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorId:   _rescheduleTutorId,
          studentId: _rescheduleStudentId,
          startDate,
          schedule,
        }),
      });
      const clashData = await clashRes.json();
      if (clashData.success && clashData.clashes && clashData.clashes.length) {
        const c = clashData.clashes[0];
        showToast(
          `⛔ Schedule clash! ${c.dateFormatted} at ${c.time} is already taken by ${c.studentName} with this tutor. Please choose a different time.`,
          'error',
          8000
        );
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Apply New Schedule'; }
        return;
      }
    } catch(e) {
      console.warn('Clash check failed:', e.message);
    }
  }

  /* ── Step 2: Apply reschedule ────────────────────────────────────── */
  if (btn) btn.textContent = '⏳ Rescheduling…';
  try {
    const res  = await fetch('https://api.stemnestacademy.co.uk/api/bookings/reschedule-student', {
      method:  'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: _rescheduleStudentId,
        startDate,
        schedule,
        classLink: classLink || undefined,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Reschedule failed');

    showToast(`✅ Rescheduled! ${data.cancelled} old classes cancelled, ${data.created} new classes created.`, 'success');
    closeRescheduleStudentModal();
    renderScheduledPaid();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Apply New Schedule'; }
  }
}

/* ══════════════════════════════════════════════════════
   CHANGE TUTOR
══════════════════════════════════════════════════════ */
let _changeTutorStudentId = null;

async function openChangeTutorModal(studentId, studentName) {
  _changeTutorStudentId = studentId;

  const infoEl = document.getElementById('change-tutor-student-info');
  if (infoEl) infoEl.textContent = `📋 Changing tutor for: ${studentName}`;

  /* Default start date = today */
  const todayStr = new Date().toISOString().split('T')[0];
  const dateEl   = document.getElementById('ct-start-date');
  if (dateEl) { dateEl.min = todayStr; dateEl.value = todayStr; }

  /* Populate tutor dropdown */
  const sel = document.getElementById('ct-new-tutor');
  if (sel) {
    sel.innerHTML = '<option value="">⏳ Loading tutors…</option>';
    try {
      const token = localStorage.getItem('sn_access_token');
      const res   = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        const tutors = data.users || [];
        sel.innerHTML = '<option value="">— Select new tutor —</option>' +
          tutors.map(t => `<option value="${t.id}">${t.name} (${t.staff_id || t.id.slice(0,8)})</option>`).join('');
      }
    } catch(e) { sel.innerHTML = '<option value="">⚠️ Failed to load tutors</option>'; }
  }

  document.getElementById('changeTutorOverlay').classList.add('open');
}

function closeChangeTutorModal() {
  document.getElementById('changeTutorOverlay')?.classList.remove('open');
  _changeTutorStudentId = null;
}

async function confirmChangeTutor() {
  const newTutorId = document.getElementById('ct-new-tutor')?.value;
  const startDate  = document.getElementById('ct-start-date')?.value;

  if (!newTutorId) { showToast('Please select a new tutor.', 'error'); return; }
  if (!_changeTutorStudentId) { showToast('No student selected.', 'error'); return; }

  const btn = document.querySelector('#changeTutorOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Transferring…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/bookings/change-tutor', {
      method:  'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId:  _changeTutorStudentId,
        newTutorId,
        startDate:  startDate || new Date().toISOString().split('T')[0],
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Tutor change failed');

    showToast(`✅ Done! ${data.updated} classes transferred to ${data.newTutorName}.`, 'success');
    closeChangeTutorModal();
    renderScheduledPaid();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '👩‍🏫 Transfer Student'; }
  }
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
  const pathwayId    = document.getElementById('ob-pathway')?.value || '';
  const pathwayGrade = parseInt(document.getElementById('ob-pathway-grade')?.value || '1') || 1;

  if (!name || !email || !password) {
    showToast('Name, email and password are required.', 'error');
    return;
  }

  const token = localStorage.getItem('sn_access_token');
  if (!token) { showToast('Not logged in.', 'error'); return; }

  let studentId    = null;
  let studentDbId  = null;

  try {
    /* Step 1 — Create user account */
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
    if (!data.success) {
      showToast('Failed to create account: ' + (data.error || 'Unknown error'), 'error');
      return;
    }
    studentId   = data.user?.staff_id || data.user?.id;
    studentDbId = data.user?.dbId     || data.user?.id;

    /* Step 2 — Create enrolment record if a pathway was selected */
    if (pathwayId && studentDbId) {
      try {
        await fetch('https://api.stemnestacademy.co.uk/api/enrollments', {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            student_id:     studentDbId,
            pathway_id:     pathwayId,
            current_grade:  pathwayGrade,
            start_date:     new Date().toISOString().split('T')[0],
            status:         'active',
          }),
        });
      } catch (enrolErr) {
        console.warn('[Onboard] Enrolment record creation failed (non-fatal):', enrolErr.message);
      }
    }

    console.log('[Onboard] Student created in DB:', studentId);
  } catch (e) {
    showToast('Network error: ' + e.message, 'error');
    return;
  }

  /* Generate fallback student ID if API didn't return one */
  if (!studentId) {
    const existing = window.POS_DATA.students || [];
    studentId = 'S-' + String(existing.length + 1).padStart(4, '0');
  }

  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const student = {
    id: studentId, name, initials, email, phone, age, grade,
    subject, course, password, credits,
    enrolledAt:  new Date().toISOString(),
    bookingId:   onboardingStudentId,
    status:      'active',
  };

  /* Update in-memory students registry */
  const existing = window.POS_DATA.students || [];
  const existIdx = existing.findIndex(s => s.email === email);
  if (existIdx !== -1) existing[existIdx] = { ...existing[existIdx], ...student };
  else existing.push(student);
  window.POS_DATA.students = existing;

  const credText = typeof generateCredentialText === 'function' ? generateCredentialText(student) : '';
  if (credText && typeof downloadCredentialFile === 'function') {
    downloadCredentialFile(student, credText);
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

  /* PAID STUDENTS = students who have a confirmed Fincra payment
     NOT students whose classes are completed.
     Source 1: POS_DATA.payments with status='confirmed'
     Source 2: pipeline with status='converted'
     Source 3: POS_DATA.students (manually onboarded via the Manual Onboard button) */
  const confirmedPayments = (window.POS_DATA.payments || []).filter(p =>
    p.status === 'confirmed' || p.status === 'paid'
  );

  /* Also include pipeline converted records where the student has paid (via presales Enroll button) */
  const pipelineConverted = getAllPipeline().filter(p => p.status === 'converted');

  /* Also include students who were manually onboarded (no payment record) */
  const manualStudents = (window.POS_DATA.students || []).filter(s => s.isManualOnboard);

  const seen = new Set();
  const students = [];

  /* Confirmed payments first (most reliable source) */
  confirmedPayments.forEach(p => {
    const key = p.student_id || p.studentEmail || p.student_email || '';
    if (key && !seen.has(key)) {
      seen.add(key);
      students.push({
        id:             p.student_id || p.id,
        dbId:           p.student_id,
        studentName:    p.student_name || p.studentName || '—',
        email:          p.student_email || p.studentEmail || '—',
        whatsapp:       p.whatsapp || '—',
        subject:        p.course_name || p.subject || '—',
        course:         p.course_name || p.course || '—',
        paymentAmount:  p.amount,
        paymentCurrency: p.currency || 'GBP',
        studentCredits: p.credits_purchased || 0,
        confirmedAt:    p.confirmed_at,
        studentOnboarded: !!(p.student_id),  // if student_id is linked, they're onboarded
        paidScheduled:  false,
        _source:        'payment',
        _paymentId:     p.id,
      });
    }
  });

  /* Pipeline converted as fallback for students who paid manually */
  pipelineConverted.forEach(p => {
    const key = p.email || p.bookingId || '';
    if (key && !seen.has(key)) {
      seen.add(key);
      const booking = getBookings().find(b => b.id === p.bookingId) || {};
      students.push({
        id:             p.bookingId,
        studentName:    p.studentName || '—',
        email:          p.email || booking.email || '—',
        whatsapp:       p.whatsapp || booking.whatsapp || '—',
        subject:        p.subject || '—',
        course:         p.course || '—',
        paymentAmount:  p.paymentAmount,
        paymentCurrency: 'GBP',
        studentCredits: '—',
        studentOnboarded: booking.studentOnboarded || false,
        paidScheduled:  booking.paidScheduled || false,
        _source:        'pipeline',
      });
    }
  });

  /* Manually onboarded students (no Fincra payment, added via Manual Onboard button) */
  manualStudents.forEach(s => {
    const key = s.email || s.id || '';
    if (key && !seen.has(key)) {
      seen.add(key);
      students.push({
        id:              s.dbId || s.id,
        studentName:     s.name || '—',
        email:           s.email || '—',
        whatsapp:        s.phone || '—',
        subject:         s.subject || '—',
        course:          s.course || '—',
        paymentAmount:   s.paymentAmount || 0,
        paymentCurrency: 'GBP',
        studentCredits:  s.credits || 0,
        studentOnboarded: true,
        paidScheduled:   false,
        confirmedAt:     s.enrolledAt,
        _source:         'manual',
      });
    }
  });

  if (!students.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:48px;margin-bottom:12px;">💳</div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No paid students yet</div>
      <div style="font-size:14px;color:var(--light);margin-top:6px;">Students who pay via Fincra will appear here automatically.</div>
    </div>`;
    return;
  }

  el.innerHTML = `
    <div style="background:#f0fdf4;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13px;font-weight:700;color:#065f46;">
      💳 Showing only students who have <strong>confirmed their payment</strong> via Fincra. Completed demo classes are in the Presales dashboard.
    </div>
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thStyle()}">Student</th>
            <th style="${thStyle()}">Pathway / Course</th>
            <th style="${thStyle()}">Contact</th>
            <th style="${thStyle()}">Amount Paid</th>
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
                ${s.confirmedAt ? `<div style="font-size:10px;color:var(--light);">Paid: ${new Date(s.confirmedAt).toLocaleDateString('en-GB')}</div>` : ''}
              </td>
              <td style="${tdStyle()};font-weight:700;color:var(--mid);">${s.subject||'—'}${s.course && s.course !== '—' ? '<div style="font-size:11px;color:var(--light);">'+s.course+'</div>' : ''}</td>
              <td style="${tdStyle()}">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${s.email||'—'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📱 ${s.whatsapp||'—'}</div>
              </td>
              <td style="${tdStyle()};font-weight:800;color:var(--green-dark);">${s.paymentAmount ? (s.paymentCurrency === 'NGN' ? '₦' : s.paymentCurrency === 'USD' ? '$' : '£') + parseFloat(s.paymentAmount).toLocaleString() : '—'}</td>
              <td style="${tdStyle()};font-weight:800;color:var(--blue);">${s.studentCredits||'—'}</td>
              <td style="${tdStyle()}">
                ${s.studentOnboarded
                  ? `<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Done</span>`
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
  const currSel = document.getElementById('mob-currency');
  if (currSel) currSel.value = 'GBP';
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
  const currency = document.getElementById('mob-currency')?.value || 'GBP';
  const password = document.getElementById('mob-password')?.value.trim();

  /* Read pathway name — if a pathway is selected, use it as the course for the email */
  const pathwayId   = document.getElementById('mob-pathway')?.value || '';
  const pathwayGrade = parseInt(document.getElementById('mob-pathway-grade')?.value || '1') || 1;
  const pathwaySelect = document.getElementById('mob-pathway');
  const pathwayName  = pathwayId
    ? (pathwaySelect?.options[pathwaySelect.selectedIndex]?.text || course || 'STEMNest Programme')
    : (course || 'STEMNest Programme');

  /* The course field sent to the backend is the pathway name so it appears in the email */
  const courseForEmail = pathwayName || course || 'STEMNest Programme';

  if (!name || !email || !password) {
    showToast('Name, email and password are required.', 'error');
    return;
  }

  /* Disable submit button during API call */
  const submitBtn = document.querySelector('#manualOnboardOverlay .btn-primary');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ Creating account…'; }

  const token = localStorage.getItem('sn_access_token');
  if (!token) { showToast('Not logged in.', 'error'); return; }

  /* Create student account in DB — backend sends onboarding email automatically */
  let dbStudentId = null;
  let dbStaffId   = null;

  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/users', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name, email, password, role: 'student',
        phone, whatsapp: phone,
        grade, age, credits,
        course:   subject || 'Coding',       /* subject shown as Course in email */
        pathway:  pathwayId ? pathwayName : undefined,  /* pathway shown separately */
      }),
    });
    const data = await res.json();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🎓 Onboard Student'; }

    if (!data.success) {
      showToast('Could not create account: ' + (data.error || 'please try again'), 'error');
      return;
    }

    dbStudentId = data.user?.id;
    dbStaffId   = data.user?.staff_id || dbStudentId;
  } catch (e) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🎓 Onboard Student'; }
    showToast('Network error. Please check your connection and try again.', 'error');
    return;
  }

  /* Inject a synthetic "confirmed payment" record so this student appears
     in renderPaidStudents immediately without a real Fincra payment */
  const syntheticPayment = {
    id:               'MANUAL-' + Date.now().toString(36).toUpperCase(),
    student_id:       dbStudentId,
    student_name:     name,
    student_email:    email,
    whatsapp:         phone,
    course_name:      courseForEmail || subject || '—',
    subject:          subject || '—',
    amount:           parseFloat(amount) || 0,
    currency:         currency || 'GBP',
    credits_purchased: credits,
    status:           'confirmed',
    confirmed_at:     new Date().toISOString(),
    _manualOnboard:   true,
  };

  if (!window.POS_DATA.payments) window.POS_DATA.payments = [];
  window.POS_DATA.payments.unshift(syntheticPayment);

  /* Persist synthetic records to sessionStorage so 60s auto-refresh doesn't wipe them */
  try {
    const allSynthetics = window.POS_DATA.payments.filter(p => p._manualOnboard);
    sessionStorage.setItem('pos_manual_payments', JSON.stringify(allSynthetics));
  } catch (e) { /* silent */ }

  /* Also keep in POS_DATA.students for re-download */
  const existing = window.POS_DATA.students || [];
  existing.push({
    id:              dbStaffId,
    dbId:            dbStudentId,
    name, email, phone, age, grade, subject, course,
    password, credits,
    paymentAmount:   amount,
    enrolledAt:      new Date().toISOString(),
    status:          'active',
    isManualOnboard: true,
  });
  window.POS_DATA.students = existing;

  closeManualOnboardModal();
  updatePOSStats();
  renderPaidStudents();

  /* Show student immediately in Paid Students tab */
  showPOSTab('students');
  showToast('✅ ' + name + ' onboarded successfully! Login details sent to ' + email + '. They can now log in at stemnestacademy.co.uk');
}

// Bind manual onboard modal overlay close
document.addEventListener('DOMContentLoaded', function() {
  const overlay = document.getElementById('manualOnboardOverlay');
  overlay?.addEventListener('click', function(e) { if (e.target === overlay) closeManualOnboardModal(); });
});

/* ══════════════════════════════════════════════════════
   STUDENTS NEEDING TOP-UP
   Shows students with ≤ 2 credits. Post-Sales staff
   manually confirm payment and credits are added instantly to DB.
══════════════════════════════════════════════════════ */
function renderTopUpStudents() {
  const el = document.getElementById('topupStudentsList');
  if (!el) return;

  const students = window.POS_DATA.students || [];
  const bookings = getBookings();

  // Merge students from both sources, deduplicated by email
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
        id:      b.studentId || b.id,
        name:    b.studentName,
        email:   b.email,
        phone:   b.whatsapp,
        subject: b.subject,
        credits: parseInt(b.studentCredits) || 0,
        _source: 'booking',
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

  el.innerHTML =
    '<div style="background:#fff3e0;border-radius:12px;padding:14px 18px;margin-bottom:18px;border-left:4px solid #e65100;">' +
      '<strong style="color:#e65100;">How to top up:</strong> ' +
      '<span style="font-size:13px;color:#92400e;">When a parent confirms payment by any method (bank transfer, Grey Finance, cash, etc.), ' +
      'fill in the amount, currency and number of credits below, then click <strong>Confirm Payment Received</strong>. ' +
      'Credits are added to the student\'s account instantly.</span>' +
    '</div>' +
    '<div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    '<thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">' +
      '<th style="' + thS + '">Student</th>' +
      '<th style="' + thS + '">Credits Left</th>' +
      '<th style="' + thS + '">Contact</th>' +
      '<th style="' + thS + '">Confirm Payment</th>' +
    '</tr></thead>' +
    '<tbody>' +
    list.map(function(s, i) {
      var credits     = parseInt(s.credits) || 0;
      var creditColor = credits <= 0 ? '#c53030' : '#e65100';
      var creditBg    = credits <= 0 ? '#fde8e8' : '#fff3e0';
      var rowBg       = i % 2 === 0 ? '' : 'background:#fafbff;';

      return '<tr style="border-bottom:1px solid #f0f2f8;' + rowBg + '">' +
        '<td style="' + tdS + '">' +
          '<div style="font-weight:800;color:var(--dark);">' + (s.name || s.studentName || '—') + '</div>' +
          '<div style="font-size:11px;color:var(--light);">' + (s.id || '—') + '</div>' +
          '<div style="font-size:11px;color:var(--light);">' + (s.subject || '—') + '</div>' +
        '</td>' +
        '<td style="' + tdS + '">' +
          '<span style="background:' + creditBg + ';color:' + creditColor + ';font-family:\'Fredoka One\',cursive;font-size:22px;padding:4px 14px;border-radius:10px;">' + credits + '</span>' +
        '</td>' +
        '<td style="' + tdS + '">' +
          '<div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ' + (s.email || '—') + '</div>' +
          '<div style="font-size:12px;font-weight:700;color:var(--mid);">📱 ' + (s.phone || s.whatsapp || '—') + '</div>' +
        '</td>' +
        '<td style="' + tdS + '">' +
          '<div style="display:flex;flex-direction:column;gap:6px;min-width:260px;">' +
            '<div style="display:flex;gap:6px;">' +
              '<input type="number" id="tuAmount_' + s.id + '" placeholder="Amount" min="1" ' +
                'style="width:90px;padding:7px 10px;border:2px solid #e8eaf0;border-radius:8px;font-family:\'Nunito\',sans-serif;font-size:12px;outline:none;">' +
              '<select id="tuCurrency_' + s.id + '" ' +
                'style="padding:7px 8px;border:2px solid #e8eaf0;border-radius:8px;font-family:\'Nunito\',sans-serif;font-size:12px;outline:none;">' +
                '<option value="GBP">GBP £</option>' +
                '<option value="NGN">NGN ₦</option>' +
                '<option value="USD">USD $</option>' +
                '<option value="EUR">EUR €</option>' +
              '</select>' +
              '<input type="number" id="tuCredits_' + s.id + '" placeholder="Credits" min="1" ' +
                'style="width:70px;padding:7px 10px;border:2px solid #e8eaf0;border-radius:8px;font-family:\'Nunito\',sans-serif;font-size:12px;outline:none;">' +
            '</div>' +
            '<input type="text" id="tuNotes_' + s.id + '" placeholder="Notes (optional) e.g. Bank transfer 08/07" ' +
              'style="padding:7px 10px;border:2px solid #e8eaf0;border-radius:8px;font-family:\'Nunito\',sans-serif;font-size:12px;outline:none;">' +
            '<button id="tuBtn_' + s.id + '" onclick="confirmManualTopUp(\'' + s.id + '\')" ' +
              'style="background:#0e9f6e;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:12px;cursor:pointer;">' +
              '✅ Confirm Payment Received' +
            '</button>' +
            '<div id="tuResult_' + s.id + '" style="font-size:11px;font-weight:700;display:none;"></div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';
}

async function confirmManualTopUp(studentId) {
  var amountEl   = document.getElementById('tuAmount_' + studentId);
  var currencyEl = document.getElementById('tuCurrency_' + studentId);
  var creditsEl  = document.getElementById('tuCredits_' + studentId);
  var notesEl    = document.getElementById('tuNotes_' + studentId);
  var btn        = document.getElementById('tuBtn_' + studentId);
  var resultEl   = document.getElementById('tuResult_' + studentId);

  var amount   = amountEl  ? parseFloat(amountEl.value)  : 0;
  var currency = currencyEl ? currencyEl.value : 'GBP';
  var credits  = creditsEl ? parseInt(creditsEl.value)   : 0;
  var notes    = notesEl   ? notesEl.value.trim() : '';

  if (!amount || amount <= 0)  { showToast('Please enter the amount received.', 'error'); return; }
  if (!credits || credits <= 0){ showToast('Please enter the number of credits to add.', 'error'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Processing…'; }

  try {
    var token = localStorage.getItem('sn_access_token');
    if (!token) throw new Error('Not logged in');

    var res  = await fetch('https://api.stemnestacademy.co.uk/api/payments/manual-topup', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, credits, amount, currency, notes }),
    });

    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Top-up failed');

    /* Update POS_DATA in-memory so the badge count drops immediately */
    if (window.POS_DATA && window.POS_DATA.students) {
      var idx = window.POS_DATA.students.findIndex(function(s) { return s.id === studentId; });
      if (idx !== -1) window.POS_DATA.students[idx].credits = data.newCredits;
    }

    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.color   = '#065f46';
      resultEl.textContent   = '✅ Done! New balance: ' + data.newCredits + ' credit' + (data.newCredits !== 1 ? 's' : '') + '. Receipt emailed to parent.';
    }
    if (btn) { btn.textContent = '✅ Confirmed'; btn.style.background = '#d1fae5'; btn.style.color = '#065f46'; }

    updatePOSStats();
    showToast('✅ ' + credits + ' credit' + (credits !== 1 ? 's' : '') + ' added to student account.', 'success');

    /* Refresh the top-up list after 2 seconds so resolved students drop off */
    setTimeout(renderTopUpStudents, 2000);

  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirm Payment Received'; }
  }
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
                    <button onclick="openGreyPaymentModal('${r.id}', this.dataset.name, ${parseFloat(r.course_price||r.course_price_db||0).toFixed(2)}, 'USD')"
                      data-name="${(r.student_name||'Student').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}"
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
  if (!modal) { showToast('Payment modal not found. Please refresh the page.', 'error'); return; }

  /* Show loading state and open modal immediately */
  document.getElementById('greyPaymentBody').innerHTML =
    '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Generating payment reference...</div>';
  modal.classList.add('open');

  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) {
      document.getElementById('greyPaymentBody').innerHTML =
        '<div style="padding:24px;color:var(--orange);font-weight:700;">Not logged in. Please refresh and log in again.</div>';
      return;
    }

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
    const reference = (refData.success && refData.reference) ? refData.reference : ('SN-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2,7).toUpperCase());

    /* Load account details — use hardcoded fallback if API fails */
    let accounts = await loadGreyAccountDetails();

    /* Hardcoded fallback — always show USD details even if API fails */
    if (!accounts || !accounts.length) {
      accounts = [{
        currency:      'USD',
        flag:          '🇺🇸',
        label:         'US Dollar (USD)',
        accountName:   'StemNest Academy Ltd',
        accountNumber: '218292502181',
        routingNumber: '101019644',
        accountType:   'Checking',
        bankName:      'Lead Bank',
        bankAddress:   '1801 Main St., Kansas City, MO 64108',
        instructions:  'Use ACH or Wire transfer. Include your payment reference in the memo/description field.',
      }];
    }

    /* Store account for copy button */
    window._greyPaymentCopyData = { reference, account: accounts[0] };

    document.getElementById('greyPaymentBody').innerHTML = `
      <div style="background:var(--green-light);border-radius:12px;padding:14px 18px;margin-bottom:20px;font-size:13px;font-weight:700;color:var(--green-dark);">
        ✅ Payment reference generated for <strong>${studentName}</strong>
        ${amount && parseFloat(amount) > 0 ? ` — Amount: <strong>${currency || 'USD'} ${parseFloat(amount).toFixed(2)}</strong>` : ''}
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--mid);margin-bottom:16px;">
        Share these bank details with the parent. Ask them to include the <strong style="color:var(--blue);">Payment Reference</strong> in the transfer description.
      </div>
      ${accounts.map(a => buildGreyBankCard(a, reference)).join('')}
      <div style="background:#fff8e1;border:2px solid #f59e0b;border-radius:12px;padding:14px 18px;margin-bottom:16px;font-size:13px;font-weight:800;color:#92400e;">
        ⚠️ <strong>IMPORTANT:</strong> The parent MUST include the Payment Reference <strong style="color:#1a56db;">${reference}</strong> in the transfer description/memo field. This is how we match their payment automatically.
      </div>
      <button id="copyAllBtn" onclick="copyAllPaymentDetails()"
        style="width:100%;background:linear-gradient(135deg,#1a56db,#0e9f6e);color:#fff;border:none;border-radius:14px;padding:16px;font-family:'Fredoka One',cursive;font-size:18px;cursor:pointer;margin-bottom:8px;transition:.15s;"
        onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
        📋 Copy All Payment Details
      </button>
      <div style="text-align:center;font-size:12px;color:var(--light);font-weight:700;">Click once — paste directly into WhatsApp, email or any message</div>
      <div style="background:#f0f4ff;border-radius:12px;padding:14px 18px;margin-top:16px;font-size:13px;font-weight:700;color:#1e40af;">
        📡 Payment will be <strong>automatically confirmed</strong> once received. The student will be moved to Paid Students and receive a welcome email.
      </div>`;
  } catch(e) {
    console.error('[Grey Modal] Error:', e);
    document.getElementById('greyPaymentBody').innerHTML =
      `<div style="padding:24px;color:var(--orange);font-weight:700;">Error: ${e.message}. Please try again.</div>`;
  }
}

function copyAllPaymentDetails() {
  const data = window._greyPaymentCopyData;
  if (!data) { showToast('No payment data found. Please reopen the modal.', 'error'); return; }

  const ref = data.reference;
  const a   = data.account || {};

  const text = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '  STEMNEST ACADEMY — PAYMENT DETAILS',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '  Bank Name:       ' + (a.bankName      || 'Lead Bank'),
    '  Account Name:    ' + (a.accountName   || 'StemNest Academy Ltd'),
    '  Account Number:  ' + (a.accountNumber || '218292502181'),
    '  Routing Number:  ' + (a.routingNumber || '101019644'),
    '  Account Type:    ' + (a.accountType   || 'Checking'),
    '  Bank Address:    ' + (a.bankAddress   || '1801 Main St., Kansas City, MO 64108'),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '  PAYMENT REFERENCE: ' + ref,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '  IMPORTANT: You MUST include the',
    '  Payment Reference (' + ref + ')',
    '  in the Description / Memo field of',
    '  your bank transfer. This is how we',
    '  confirm your payment automatically.',
    '',
    '  Questions? Contact us:',
    '  support@stemnestacademy.co.uk',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');

  const btn = document.getElementById('copyAllBtn');

  const markCopied = () => {
    if (btn) {
      btn.textContent = '✅ Copied! Paste into WhatsApp or Email';
      btn.style.background = '#0e9f6e';
      setTimeout(() => {
        btn.textContent = '📋 Copy All Payment Details';
        btn.style.background = 'linear-gradient(135deg,#1a56db,#0e9f6e)';
      }, 3000);
    }
    showToast('✅ Payment details copied! Paste directly into WhatsApp or email.');
  };

  /* Try modern clipboard API first */
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(markCopied).catch(() => {
      /* Fallback if clipboard API is blocked */
      _fallbackCopy(text);
      markCopied();
    });
  } else {
    _fallbackCopy(text);
    markCopied();
  }
}

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch(e) { console.warn('Copy failed:', e); }
  document.body.removeChild(ta);
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

/* ══════════════════════════════════════════════════════
   GRADE PROMOTIONS
   Shows students who completed all 72 lessons in their grade
   Post-Sales clicks "Promote" to move them to next grade
══════════════════════════════════════════════════════ */
async function renderPromotions() {
  const el = document.getElementById('promotionsList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">⏳ Loading...</div>';
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/pathways/promotions/pending', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const promotions = data.promotions || [];

    /* Update badge */
    const badge = document.getElementById('promotionsBadge');
    if (badge) badge.textContent = promotions.length;

    if (!promotions.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:12px;">🎓</div>
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No promotions pending</div>
        <div style="font-size:14px;color:var(--light);margin-top:6px;">Students who complete all 72 lessons in their grade will appear here.</div>
      </div>`;
      return;
    }

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${promotions.map(p => `
          <div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
            <div>
              <div style="font-weight:900;color:var(--dark);font-size:16px;">${p.student_name || '—'}</div>
              <div style="font-size:13px;font-weight:700;color:var(--mid);margin-top:4px;">
                ${p.pathway_emoji || '🚀'} ${p.pathway_name || '—'}
              </div>
              <div style="font-size:13px;font-weight:700;color:var(--blue);margin-top:4px;">
                Grade ${p.current_grade_number || p.current_grade} → Grade ${(p.current_grade_number || p.current_grade) + 1}
              </div>
              <div style="font-size:12px;color:var(--light);margin-top:4px;">
                📧 ${p.student_email || '—'} · ✅ 72/72 lessons completed
              </div>
            </div>
            <button onclick="promoteStudent('${p.id}','${(p.student_name||'').replace(/'/g,'')}',${(p.current_grade_number||p.current_grade)+1})"
              style="background:var(--green);color:#fff;border:none;border-radius:12px;padding:12px 24px;font-family:'Nunito',sans-serif;font-weight:900;font-size:14px;cursor:pointer;white-space:nowrap;">
              🎓 Promote to Grade ${(p.current_grade_number || p.current_grade) + 1}
            </button>
          </div>`).join('')}
      </div>`;
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--orange);font-weight:700;">Failed to load promotions. Please refresh.</div>';
  }
}

async function promoteStudent(enrolmentId, studentName, nextGrade) {
  if (!confirm(`Promote ${studentName} to Grade ${nextGrade}? This will reset their lesson progress for the new grade.`)) return;
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch(`https://api.stemnestacademy.co.uk/api/pathways/promotions/${enrolmentId}/promote`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${studentName} promoted to Grade ${nextGrade}!`);
      renderPromotions();
    } else {
      showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   PAUSE & RESUME TAB
══════════════════════════════════════════════════════ */

async function renderPauseResume() {
  const token = localStorage.getItem('sn_access_token');

  /* Load active students */
  const activeEl = document.getElementById('activeStudentsList');
  const pausedEl = document.getElementById('pausedStudentsList');
  if (!activeEl || !pausedEl) return;

  activeEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">⏳ Loading...</div>';
  pausedEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">⏳ Loading...</div>';

  try {
    const [activeRes, pausedRes] = await Promise.all([
      fetch('https://api.stemnestacademy.co.uk/api/enrollments/students/active', { headers: { Authorization: 'Bearer ' + token } }),
      fetch('https://api.stemnestacademy.co.uk/api/enrollments/students/paused', { headers: { Authorization: 'Bearer ' + token } }),
    ]);
    const activeData = await activeRes.json();
    const pausedData = await pausedRes.json();

    const active = activeData.students || [];
    const paused = pausedData.students || [];

    /* Update badge */
    const badge = document.getElementById('pauseBadge');
    if (badge) badge.textContent = paused.length;

    /* Render active list */
    if (!active.length) {
      activeEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">No active enrolled students found.</div>';
    } else {
      activeEl.innerHTML = active.map(s => `
        <div style="background:#fff;border:1.5px solid #e8eaf0;border-radius:14px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div style="flex:1;">
              <div style="font-weight:900;font-size:14px;color:var(--dark);">${s.studentName}</div>
              <div style="font-size:12px;color:var(--light);margin-top:2px;">📧 ${s.email || '—'}</div>
              <div style="font-size:12px;color:var(--mid);margin-top:4px;font-weight:700;">
                📚 ${s.pathwayName || '—'} · Grade ${s.currentGrade || '—'}
                &nbsp;·&nbsp; 👩‍🏫 ${s.tutorName || '—'}
                &nbsp;·&nbsp; 💳 ${s.credits || 0} credits
              </div>
              <div style="font-size:11px;color:var(--light);margin-top:2px;">Lesson ${s.lessonsCompleted || 0} of 72 completed</div>
            </div>
            <button onclick="openPauseModal('${s.studentId}','${(s.studentName||'').replace(/'/g,'')}')"
              style="background:#f59e0b;color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;">
              ⏸️ Pause
            </button>
          </div>
        </div>`).join('');
    }

    /* Render paused list */
    if (!paused.length) {
      pausedEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">No paused students at the moment.</div>';
    } else {
      pausedEl.innerHTML = paused.map(s => {
        const pausedDate = s.pausedAt ? new Date(s.pausedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
        return `
        <div style="background:#fff8f0;border:1.5px solid #fed7aa;border-radius:14px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div style="flex:1;">
              <div style="font-weight:900;font-size:14px;color:var(--dark);">${s.studentName}</div>
              <div style="font-size:12px;color:var(--light);margin-top:2px;">📧 ${s.email || '—'}</div>
              <div style="font-size:12px;color:var(--mid);margin-top:4px;font-weight:700;">
                📚 ${s.pathwayName || '—'} · Grade ${s.currentGrade || '—'}
                &nbsp;·&nbsp; 💳 ${s.credits || 0} credits preserved
              </div>
              <div style="font-size:11px;color:var(--light);margin-top:2px;">Will resume from Lesson ${(s.lastLesson || 0) + 1} · Paused ${pausedDate}</div>
              <div style="font-size:11px;color:#92400e;margin-top:4px;font-style:italic;">Reason: ${s.pausedReason || '—'}</div>
            </div>
            <button onclick="openResumeModal('${s.studentId}','${(s.studentName||'').replace(/'/g,'')}','${s.lastTutorId||''}','${(s.lastTutorName||'').replace(/'/g,'')}','${(s.classLink||'').replace(/'/g,'&#39;')}')"
              style="background:#0e9f6e;color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;">
              ▶️ Resume
            </button>
          </div>
        </div>`;
      }).join('');
    }

  } catch(e) {
    activeEl.innerHTML = '<div style="padding:16px;color:#c53030;font-weight:700;">Failed to load. ' + e.message + '</div>';
    pausedEl.innerHTML = '';
  }
}

/* ── Pause Modal ── */
let _pauseStudentId = null;

function openPauseModal(studentId, studentName) {
  _pauseStudentId = studentId;
  document.getElementById('pauseStudentName').textContent = studentName;
  document.getElementById('pauseReason').value = '';
  document.getElementById('pauseConfirmBtn').disabled = false;
  document.getElementById('pauseConfirmBtn').textContent = '⏸️ Confirm Pause';
  document.getElementById('pauseModalOverlay').classList.add('open');
}

function closePauseModal() {
  document.getElementById('pauseModalOverlay')?.classList.remove('open');
  _pauseStudentId = null;
}

async function confirmPause() {
  const reason = document.getElementById('pauseReason')?.value.trim();
  if (!reason) { showToast('Please enter a reason for pausing.', 'error'); return; }
  if (!_pauseStudentId) { showToast('No student selected.', 'error'); return; }

  const btn = document.getElementById('pauseConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Pausing…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch(`https://api.stemnestacademy.co.uk/api/enrollments/students/${_pauseStudentId}/pause`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Pause failed');

    showToast(`⏸️ ${data.studentName}'s classes paused. ${data.bookingsCancelled} future classes cancelled. Credits preserved.`, 'success', 6000);
    closePauseModal();
    renderPauseResume();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '⏸️ Confirm Pause'; }
  }
}

/* ── Resume Modal ── */
let _resumeStudentId   = null;
let _resumeLastTutorId = null;

function openResumeModal(studentId, studentName, lastTutorId, lastTutorName, classLink) {
  _resumeStudentId   = studentId;
  _resumeLastTutorId = lastTutorId;

  document.getElementById('resumeStudentName').textContent = studentName;

  /* Default start date = tomorrow */
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const startEl = document.getElementById('resume-start-date');
  if (startEl) {
    startEl.min   = tomorrow.toISOString().split('T')[0];
    startEl.value = tomorrow.toISOString().split('T')[0];
  }

  /* Pre-fill class link */
  const linkEl = document.getElementById('resume-class-link');
  if (linkEl) linkEl.value = classLink || '';

  /* Pre-fill tutor selector hint */
  const tutorHint = document.getElementById('resumeTutorHint');
  if (tutorHint) tutorHint.textContent = lastTutorName ? `Previous tutor: ${lastTutorName}` : '';

  /* Load tutors into dropdown */
  _loadResumeTutors(lastTutorId);

  /* Reset schedule rows */
  const container = document.getElementById('resume-schedule-rows');
  if (container) container.innerHTML = _buildRSRow(0) + _buildRSRow(1);

  document.getElementById('resumeConfirmBtn').disabled = false;
  document.getElementById('resumeConfirmBtn').textContent = '▶️ Resume Classes';
  document.getElementById('resumeModalOverlay').classList.add('open');
}

async function _loadResumeTutors(preselectedId) {
  const sel = document.getElementById('resume-tutor-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">⏳ Loading tutors…</option>';
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor&limit=100', { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    const tutors = (data.users || []).filter(t => t.is_active !== false);
    sel.innerHTML = '<option value="">— Select tutor —</option>' +
      tutors.map(t => `<option value="${t.id}" ${t.id === preselectedId ? 'selected' : ''}>${t.name}</option>`).join('');
  } catch(e) {
    sel.innerHTML = '<option value="">Failed to load tutors</option>';
  }
}

function closeResumeModal() {
  document.getElementById('resumeModalOverlay')?.classList.remove('open');
  _resumeStudentId = null;
  _resumeLastTutorId = null;
}

async function confirmResume() {
  const startDate = document.getElementById('resume-start-date')?.value;
  const tutorId   = document.getElementById('resume-tutor-select')?.value;
  const classLink = document.getElementById('resume-class-link')?.value.trim();
  const schedule  = _getRSSchedule();

  if (!startDate)   { showToast('Please select a start date.', 'error'); return; }
  if (!tutorId)     { showToast('Please select a tutor.', 'error'); return; }
  if (!schedule.length) { showToast('Please set at least one day and time.', 'error'); return; }

  const btn = document.getElementById('resumeConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Checking for clashes…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch(`https://api.stemnestacademy.co.uk/api/enrollments/students/${_resumeStudentId}/resume`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tutorId, schedule, startDate, classLink: classLink || undefined }),
    });
    const data = await res.json();

    if (!data.success) {
      /* Show clash error clearly */
      if (res.status === 409) {
        showToast('⛔ ' + data.error, 'error', 8000);
      } else {
        showToast('Error: ' + (data.error || 'Resume failed'), 'error');
      }
      if (btn) { btn.disabled = false; btn.textContent = '▶️ Resume Classes'; }
      return;
    }

    showToast(`▶️ ${data.studentName}'s classes resumed! ${data.bookingsCreated} classes created from Lesson ${data.resumedFromLesson} with ${data.tutorName}.`, 'success', 7000);
    closeResumeModal();
    renderPauseResume();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '▶️ Resume Classes'; }
  }
}

/* ══════════════════════════════════════════════════════
   BATCHES TAB — Group Classes Management
   Students learn together in groups of 2–3.
   Credits remain individual per student.
══════════════════════════════════════════════════════ */

let _batchDetailId = null;

async function renderBatchesTab() {
  const el = document.getElementById('batchesList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading batches...</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/batches', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data  = await res.json();
    const batches = data.batches || [];

    const badge = document.getElementById('batchesBadge');
    if (badge) badge.textContent = batches.filter(b => b.status === 'active').length;

    if (!batches.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:12px;">👥</div>
        <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--dark);">No batches yet</div>
        <div style="font-size:14px;color:var(--light);margin-top:8px;">Create your first group batch to get students learning together.</div>
        <button onclick="openCreateBatchModal()" style="margin-top:20px;background:var(--blue);color:#fff;border:none;border-radius:14px;padding:13px 28px;font-family:'Nunito',sans-serif;font-weight:900;font-size:14px;cursor:pointer;">
          ➕ Create First Batch
        </button>
      </div>`;
      return;
    }

    const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
    const tdS = 'padding:14px 16px;vertical-align:middle;';

    el.innerHTML = `
      <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
              <th style="${thS}">Batch ID</th>
              <th style="${thS}">Teacher</th>
              <th style="${thS}">Pathway / Grade</th>
              <th style="${thS}">Schedule</th>
              <th style="${thS}">Students</th>
              <th style="${thS}">Next Class</th>
              <th style="${thS}">Status</th>
              <th style="${thS}">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${batches.map((b, i) => {
              const sched = Array.isArray(b.schedule) ? b.schedule : (JSON.parse(b.schedule || '[]'));
              const days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
              const schedStr = sched.map(s => days[s.weekday] + ' ' + s.time).join(' + ');
              const nextDate = b.nextClassDate ? new Date(b.nextClassDate).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) : '—';
              const statusColor = b.status === 'active' ? '#0e9f6e' : b.status === 'paused' ? '#f59e0b' : '#9ca3af';
              return `<tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
                <td style="${tdS}"><span style="font-family:'Fredoka One',cursive;font-size:14px;color:var(--blue);">${b.batchRef}</span></td>
                <td style="${tdS};font-weight:700;color:var(--dark);">${b.tutorName || '—'}</td>
                <td style="${tdS};font-size:12px;color:var(--mid);font-weight:700;">${b.pathwayName || '—'}${b.gradeNumber ? ' · Grade ' + b.gradeNumber : ''}</td>
                <td style="${tdS};font-size:12px;color:var(--mid);font-weight:700;">${schedStr || '—'}</td>
                <td style="${tdS};">
                  <span style="background:var(--blue-light);color:var(--blue);font-size:12px;font-weight:900;padding:4px 10px;border-radius:50px;">${b.memberCount || 0}/3 students</span>
                </td>
                <td style="${tdS};font-size:12px;color:var(--mid);font-weight:700;">${nextDate}</td>
                <td style="${tdS};">
                  <span style="background:${statusColor}20;color:${statusColor};font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;text-transform:uppercase;">${b.status}</span>
                </td>
                <td style="${tdS};">
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button onclick="openBatchDetail('${b.id}')"
                      style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">
                      👁️ View
                    </button>
                    ${b.status === 'active' ? `
                    <button onclick="closeBatch('${b.id}','${b.batchRef}')"
                      style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">
                      🔒 Close
                    </button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px;font-size:12px;font-weight:700;color:var(--light);text-align:right;">${batches.length} batch${batches.length!==1?'es':''}</div>`;
  } catch(e) {
    el.innerHTML = '<div style="padding:20px;color:#c53030;font-weight:700;">Failed to load batches: ' + e.message + '</div>';
  }
}

/* ── Open batch detail modal ── */
async function openBatchDetail(batchId) {
  _batchDetailId = batchId;
  const token = localStorage.getItem('sn_access_token');
  const overlay = document.getElementById('batchDetailOverlay');
  const body    = document.getElementById('batchDetailBody');
  if (!overlay || !body) return;

  body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading...</div>';
  overlay.classList.add('open');

  try {
    const res  = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + batchId, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const b       = data.batch;
    const members = data.members || [];
    const sched   = Array.isArray(b.schedule) ? b.schedule : (JSON.parse(b.schedule || '[]'));
    const days    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const schedStr = sched.map(s => days[s.weekday] + ' at ' + s.time).join(' · ');

    body.innerHTML = `
      <!-- Batch info banner -->
      <div style="background:var(--blue-light);border-radius:14px;padding:16px 18px;margin-bottom:20px;">
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--blue);">${b.batch_ref}</div>
        <div style="font-size:13px;color:var(--mid);font-weight:700;line-height:1.9;margin-top:4px;">
          👩‍🏫 Teacher: <strong>${b.tutorName || '—'}</strong><br>
          📚 ${b.pathwayName || '—'}${b.grade_number ? ' · Grade ' + b.grade_number : ''}<br>
          🗓️ ${schedStr || '—'}<br>
          🔗 <a href="${b.class_link}" target="_blank" style="color:var(--blue);">Class Link</a><br>
          📊 ${data.remainingClasses} classes remaining
        </div>
      </div>

      <!-- Members list -->
      <div style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Students in this batch</div>
      ${members.filter(m => m.status === 'active').map(m => `
        <div style="background:#fff;border:1.5px solid #e8eaf0;border-radius:12px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="flex:1;">
            <div style="font-weight:900;font-size:14px;color:var(--dark);">${m.studentName}</div>
            <div style="font-size:12px;color:var(--light);margin-top:2px;">
              📧 ${m.email || '—'} &nbsp;·&nbsp;
              💳 <strong style="color:${m.credits <= 3 ? '#c53030' : 'var(--green)'};">${m.credits || 0} credits</strong>
              ${m.creditsSuspended ? ' &nbsp;<span style="background:#fde8e8;color:#c53030;font-size:10px;font-weight:900;padding:2px 8px;border-radius:50px;">🔒 PAUSED</span>' : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button onclick="openStudentTransferModal('${batchId}','${m.studentId}','${m.studentName.replace(/'/g,'')}') "
              style="background:#e0f0ff;color:var(--blue);border:1.5px solid var(--blue);border-radius:8px;padding:7px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;">
              &#8596; Transfer
            </button>
            <button onclick="removeFromBatch('${batchId}','${m.studentId}','${m.studentName.replace(/'/g,'')}') "
              style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:7px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;">
              &#215; Remove
            </button>
          </div>
        </div>`).join('')}

      ${members.filter(m => m.status === 'active').length < 3 ? `
      <button onclick="openAddMemberModal('${batchId}')"
        style="width:100%;background:var(--bg);border:2px dashed var(--blue);border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;color:var(--blue);cursor:pointer;margin-top:8px;">
        ➕ Add Another Student
      </button>` : ''}

      <!-- Reschedule button -->
      <div style="border-top:1.5px solid #e8eaf0;margin-top:16px;padding-top:16px;">
        <button onclick="closeBatchDetailModal();openBatchRescheduleModal('${batchId}','${b.batch_ref}')"
          style="width:100%;background:#fff3e0;color:#e65100;border:1.5px solid #f59e0b;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;">
          🔄 Reschedule This Batch
        </button>
        <div style="font-size:11px;color:var(--light);font-weight:700;margin-top:6px;text-align:center;">Changes day/time from a chosen date. Lesson sequence is preserved.</div>
      </div>`;
  } catch(e) {
    body.innerHTML = '<div style="padding:20px;color:#c53030;font-weight:700;">Failed to load: ' + e.message + '</div>';
  }
}

function closeBatchDetailModal() {
  document.getElementById('batchDetailOverlay')?.classList.remove('open');
  _batchDetailId = null;
}

/* ── Remove a student from batch ── */
async function removeFromBatch(batchId, studentId, studentName) {
  const reason = prompt('Reason for removing ' + studentName + ' from this batch? (required)');
  if (!reason || !reason.trim()) { showToast('Removal reason is required.', 'error'); return; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + batchId + '/members/' + studentId, {
      method:  'DELETE',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast('✅ ' + studentName + ' removed from batch.', 'success');
    openBatchDetail(batchId);
    renderBatchesTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ── Add student to existing batch ── */
async function openAddMemberModal(batchId) {
  const token = localStorage.getItem('sn_access_token');
  const stuRes = await fetch('https://api.stemnestacademy.co.uk/api/users?role=student&limit=200', {
    headers: { Authorization: 'Bearer ' + token }
  }).then(r => r.json()).catch(() => ({ users: [] }));

  const students = stuRes.users || [];
  if (!students.length) { showToast('No students found.', 'error'); return; }

  document.getElementById('batchDetailOverlay')?.classList.remove('open');

  /* Simple select prompt */
  const names = students.map(s => s.name + ' (' + (s.staff_id || s.id.slice(0,8)) + ')');
  const sel = prompt('Select student to add:\n' + names.map((n, i) => (i+1) + '. ' + n).join('\n') + '\n\nEnter number:');
  if (!sel) { openBatchDetail(batchId); return; }
  const idx = parseInt(sel) - 1;
  if (idx < 0 || idx >= students.length) { showToast('Invalid selection.', 'error'); openBatchDetail(batchId); return; }

  const student = students[idx];
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + batchId + '/members', {
      method:  'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ studentId: student.id }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast('✅ ' + student.name + ' added to batch!', 'success');
    renderBatchesTab();
    openBatchDetail(batchId);
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    openBatchDetail(batchId);
  }
}

/* ── Close a batch ── */
async function closeBatch(batchId, batchRef) {
  if (!confirm('Close batch ' + batchRef + '? This will cancel all future classes for this batch.')) return;
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + batchId + '/status', {
      method:  'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'closed' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast('✅ Batch ' + batchRef + ' closed. Future classes cancelled.', 'success');
    renderBatchesTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ── Open Create Batch Modal ── */
async function openCreateBatchModal() {
  const overlay = document.getElementById('createBatchOverlay');
  if (!overlay) return;
  const token = localStorage.getItem('sn_access_token');

  /* Reset form */
  ['cb-class-link','cb-start-date','cb-grade','cb-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const dateEl = document.getElementById('cb-start-date');
  if (dateEl) { dateEl.min = tomorrow.toISOString().split('T')[0]; dateEl.value = tomorrow.toISOString().split('T')[0]; }

  const schedContainer = document.getElementById('cb-schedule-rows');
  if (schedContainer) schedContainer.innerHTML = _buildBatchSchedRow(0) + _buildBatchSchedRow(1);

  /* Load tutors */
  const tutorSel = document.getElementById('cb-tutor');
  if (tutorSel) {
    tutorSel.innerHTML = '<option value="">⏳ Loading tutors…</option>';
    const res = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor&limit=100', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()).catch(() => ({ users: [] }));
    tutorSel.innerHTML = '<option value="">— Select tutor —</option>' + (res.users || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  }

  /* Load pathways */
  const pathwaySel = document.getElementById('cb-pathway');
  if (pathwaySel) {
    pathwaySel.innerHTML = '<option value="">⏳ Loading pathways…</option>';
    const res = await fetch('https://api.stemnestacademy.co.uk/api/pathways', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()).catch(() => ({ pathways: [] }));
    pathwaySel.innerHTML = '<option value="">— Select pathway (optional) —</option>' + (res.pathways || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  /* Load students for checkboxes */
  await _loadBatchStudentCheckboxes();

  overlay.classList.add('open');
}

function closeCreateBatchModal() {
  document.getElementById('createBatchOverlay')?.classList.remove('open');
}

function _buildBatchSchedRow(idx) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `<div class="enrol-schedule-row" id="cb-row-${idx}" style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
    <select id="cb-day-${idx}" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;outline:none;background:#fff;">
      <option value="">— Day —</option>
      ${days.map((d,i) => `<option value="${i}">${d}</option>`).join('')}
    </select>
    <input type="time" id="cb-time-${idx}" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;outline:none;">
    ${idx > 0 ? `<button type="button" onclick="document.getElementById('cb-row-${idx}').remove()" style="background:#fde8e8;color:#c53030;border:none;border-radius:10px;padding:8px 12px;font-size:18px;cursor:pointer;font-weight:900;line-height:1;">×</button>` : '<div style="width:40px;"></div>'}
  </div>`;
}

function addBatchSchedRow() {
  const container = document.getElementById('cb-schedule-rows');
  if (!container) return;
  const existing = container.querySelectorAll('.enrol-schedule-row').length;
  if (existing >= 5) { showToast('Maximum 5 days per week.', 'error'); return; }
  const div = document.createElement('div');
  div.innerHTML = _buildBatchSchedRow(existing);
  container.appendChild(div.firstChild);
}

async function _loadBatchStudentCheckboxes() {
  const container = document.getElementById('cb-students-list');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--light);font-size:13px;font-weight:700;">⏳ Loading students…</div>';
  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/users?role=student&limit=200', { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    const students = data.users || [];
    if (!students.length) { container.innerHTML = '<div style="color:var(--light);font-size:13px;font-weight:700;">No students found.</div>'; return; }
    container.innerHTML = students.map(s => `
      <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1.5px solid #e8eaf0;border-radius:10px;cursor:pointer;margin-bottom:6px;font-size:13px;font-weight:700;color:var(--dark);">
        <input type="checkbox" name="cb-student" value="${s.id}" style="width:16px;height:16px;cursor:pointer;">
        <span>${s.name}</span>
        <span style="font-size:11px;color:var(--light);margin-left:auto;">${s.staff_id || ''}</span>
      </label>`).join('');
  } catch(e) {
    container.innerHTML = '<div style="color:#c53030;font-size:13px;font-weight:700;">Failed to load students.</div>';
  }
}

async function confirmCreateBatch() {
  const tutorId   = document.getElementById('cb-tutor')?.value;
  const pathwayId = document.getElementById('cb-pathway')?.value || null;
  const gradeNumber = document.getElementById('cb-grade')?.value || null;
  const classLink = document.getElementById('cb-class-link')?.value.trim();
  const startDate = document.getElementById('cb-start-date')?.value;
  const notes     = document.getElementById('cb-notes')?.value.trim() || null;

  /* Read schedule */
  const schedule = [];
  document.querySelectorAll('#cb-schedule-rows .enrol-schedule-row').forEach(row => {
    const dayEl  = row.querySelector('select[id^="cb-day-"]');
    const timeEl = row.querySelector('input[type="time"]');
    if (dayEl && timeEl && dayEl.value !== '' && timeEl.value) {
      schedule.push({ weekday: parseInt(dayEl.value), time: timeEl.value });
    }
  });

  /* Read selected students */
  const studentIds = Array.from(document.querySelectorAll('input[name="cb-student"]:checked')).map(c => c.value);

  if (!tutorId)          { showToast('Please select a teacher.', 'error'); return; }
  if (!classLink)        { showToast('Please enter the Google Meet class link.', 'error'); return; }
  if (!startDate)        { showToast('Please select a start date.', 'error'); return; }
  if (!schedule.length)  { showToast('Please set at least one class day and time.', 'error'); return; }
  if (studentIds.length < 2) { showToast('Please select at least 2 students.', 'error'); return; }
  if (studentIds.length > 3) { showToast('Maximum 3 students per batch.', 'error'); return; }

  const btn = document.querySelector('#createBatchOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Creating batch…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/batches', {
      method:  'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tutorId, pathwayId, gradeNumber: gradeNumber ? parseInt(gradeNumber) : null, classLink, schedule, startDate, studentIds, notes }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast('✅ Batch ' + data.batchRef + ' created! ' + data.bookingsCreated + ' classes scheduled.', 'success', 7000);
    closeCreateBatchModal();
    renderBatchesTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '👥 Create Batch'; }
  }
}

/* ══════════════════════════════════════════════════════
   BATCH RESCHEDULE MODAL
══════════════════════════════════════════════════════ */

let _batchRescheduleId  = null;
let _batchRescheduleRef = null;

function openBatchRescheduleModal(batchId, batchRef) {
  _batchRescheduleId  = batchId;
  _batchRescheduleRef = batchRef;

  const overlay = document.getElementById('batchRescheduleOverlay');
  if (!overlay) return;

  /* Set title */
  const titleEl = document.getElementById('batchRescheduleTitle');
  if (titleEl) titleEl.textContent = `🔄 Reschedule ${batchRef}`;

  /* Default start date = today (today is allowed) */
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dateEl = document.getElementById('br-start-date');
  if (dateEl) {
    dateEl.min   = todayStr;
    dateEl.value = todayStr;
  }

  /* Clear class link */
  const linkEl = document.getElementById('br-class-link');
  if (linkEl) linkEl.value = '';

  /* Build 2 schedule rows */
  const container = document.getElementById('br-schedule-rows');
  if (container) container.innerHTML = _buildBRRow(0) + _buildBRRow(1);

  /* Reset button */
  const btn = document.getElementById('brConfirmBtn');
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Apply New Schedule'; }

  overlay.classList.add('open');
}

function closeBatchRescheduleModal() {
  document.getElementById('batchRescheduleOverlay')?.classList.remove('open');
  _batchRescheduleId  = null;
  _batchRescheduleRef = null;
}

function _buildBRRow(idx) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `<div class="enrol-schedule-row" id="br-row-${idx}" style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
    <select id="br-day-${idx}" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;outline:none;background:#fff;">
      <option value="">— Day —</option>
      ${days.map((d,i) => `<option value="${i}">${d}</option>`).join('')}
    </select>
    <input type="time" id="br-time-${idx}" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;outline:none;">
    ${idx > 0
      ? `<button type="button" onclick="document.getElementById('br-row-${idx}').remove()" style="background:#fde8e8;color:#c53030;border:none;border-radius:10px;padding:8px 12px;font-size:18px;cursor:pointer;font-weight:900;line-height:1;">×</button>`
      : '<div style="width:40px;"></div>'}
  </div>`;
}

function addBRScheduleRow() {
  const container = document.getElementById('br-schedule-rows');
  if (!container) return;
  const existing = container.querySelectorAll('.enrol-schedule-row').length;
  if (existing >= 5) { showToast('Maximum 5 days per week.', 'error'); return; }
  const div = document.createElement('div');
  div.innerHTML = _buildBRRow(existing);
  container.appendChild(div.firstChild);
}

function _getBRSchedule() {
  const schedule = [];
  const container = document.getElementById('br-schedule-rows');
  if (!container) return schedule;
  container.querySelectorAll('.enrol-schedule-row').forEach(row => {
    const dayEl  = row.querySelector('select[id^="br-day-"]');
    const timeEl = row.querySelector('input[type="time"]');
    if (dayEl && timeEl && dayEl.value !== '' && timeEl.value) {
      schedule.push({ weekday: parseInt(dayEl.value), time: timeEl.value });
    }
  });
  return schedule;
}

async function confirmBatchReschedule() {
  if (!_batchRescheduleId) { showToast('No batch selected.', 'error'); return; }

  const startDate = document.getElementById('br-start-date')?.value;
  const classLink = document.getElementById('br-class-link')?.value.trim() || undefined;
  const schedule  = _getBRSchedule();

  if (!startDate)       { showToast('Please select a start date.', 'error'); return; }
  if (!schedule.length) { showToast('Please set at least one day and time.', 'error'); return; }

  const btn = document.getElementById('brConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Checking for clashes…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch(`https://api.stemnestacademy.co.uk/api/batches/${_batchRescheduleId}/reschedule`, {
      method:  'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ startDate, schedule, classLink }),
    });
    const data = await res.json();

    if (!data.success) {
      if (res.status === 409) {
        showToast('⛔ ' + data.error, 'error', 8000);
      } else {
        showToast('Error: ' + (data.error || 'Reschedule failed'), 'error');
      }
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Apply New Schedule'; }
      return;
    }

    showToast(
      `✅ ${data.batchRef} rescheduled! ${data.cancelled} old classes cancelled, ${data.created} new classes created.`,
      'success',
      7000
    );
    closeBatchRescheduleModal();
    renderBatchesTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Apply New Schedule'; }
  }
}

/* ══════════════════════════════════════════════════════
   BATCHES TAB — Load, display, and transfer batches
══════════════════════════════════════════════════════ */

var _activeBatchId = null;
var _batchScheduleRowCount = 0;

async function loadBatches() {
  const el = document.getElementById('batchesList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">Loading…</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/batches', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.success) { el.innerHTML = '<div style="color:#c53030;padding:20px;font-weight:700;">Failed to load batches</div>'; return; }

    const batches = data.batches || [];
    if (!batches.length) {
      el.innerHTML = '<div style="text-align:center;padding:48px 20px;"><div style="font-size:48px;margin-bottom:12px;">👥</div><div style="font-family:\'Fredoka One\',cursive;font-size:20px;color:var(--dark);">No batches yet</div></div>';
      return;
    }

    const statusColor = { active: '#065f46', paused: '#e65100', closed: '#c53030' };
    const statusBg    = { active: '#d1fae5', paused: '#fff3e0', closed: '#fde8e8' };

    el.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>Batch ID</th><th>Tutor</th><th>Pathway/Grade</th><th>Schedule</th>' +
      '<th>Members</th><th>Next Class</th><th>Status</th><th>Actions</th>' +
      '</tr></thead><tbody>' +
      batches.map(function(b) {
        var schedArr = [];
        try { schedArr = typeof b.schedule === 'string' ? JSON.parse(b.schedule) : (b.schedule || []); } catch(e) {}
        var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        var schedText = schedArr.map(function(s) { return days[s.weekday] + ' ' + s.time; }).join(', ');
        var nextDate = b.nextClassDate ? new Date(b.nextClassDate).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : '—';
        var statusLabel = (b.status || 'active').charAt(0).toUpperCase() + (b.status || 'active').slice(1);
        var st = b.status || 'active';
        return '<tr>' +
          '<td><strong style="color:var(--blue);font-family:\'Fredoka One\',cursive;">' + (b.batchRef || b.batch_ref || '—') + '</strong></td>' +
          '<td>' + (b.tutorName || '—') + '</td>' +
          '<td>' + (b.pathwayName || '—') + (b.gradeNumber ? ' · Grade ' + b.gradeNumber : '') + '</td>' +
          '<td style="font-size:12px;">' + (schedText || '—') + '</td>' +
          '<td style="text-align:center;">' + (b.memberCount || 0) + '</td>' +
          '<td style="font-size:12px;">' + nextDate + '</td>' +
          '<td><span style="background:' + (statusBg[st]||'#e8eaf0') + ';color:' + (statusColor[st]||'#4a5568') + ';font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">' + statusLabel + '</span></td>' +
          '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button class="ab-btn ab-btn-view" onclick="openBatchTransfer(\'' + b.id + '\')" style="white-space:nowrap;">🔄 Transfer</button>' +
            '<button class="ab-btn" style="background:#fde8e8;color:#c53030;white-space:nowrap;" onclick="deleteBatch(\'' + b.id + '\',\'' + (b.batchRef||b.batch_ref||'') + '\')">🗑 Delete</button>' +
          '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';

  } catch(e) {
    el.innerHTML = '<div style="color:#c53030;padding:20px;font-weight:700;">Error: ' + e.message + '</div>';
  }
}

async function openBatchTransfer(batchId) {
  _activeBatchId = batchId;
  _batchScheduleRowCount = 0;

  /* Reset form */
  const errEl = document.getElementById('batchTransferError');
  if (errEl) errEl.style.display = 'none';
  const linkEl = document.getElementById('batchTransferLink');
  if (linkEl) linkEl.value = '';

  /* Set min date to today */
  const dateEl = document.getElementById('batchTransferDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  /* Load batch details */
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + batchId, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.success) return;

    const batch   = data.batch;
    const members = data.members || [];

    /* Fill info box */
    const infoEl = document.getElementById('batchTransferInfo');
    if (infoEl) {
      var schedArr = [];
      try { schedArr = typeof batch.schedule === 'string' ? JSON.parse(batch.schedule) : (batch.schedule || []); } catch(e) {}
      var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      var schedText = schedArr.map(function(s) { return days[s.weekday] + ' ' + s.time; }).join(', ');
      var memberNames = members.filter(function(m) { return m.status === 'active'; }).map(function(m) { return m.studentName; }).join(', ');
      infoEl.innerHTML =
        '<strong>' + (batch.batch_ref || '—') + '</strong>' +
        ' &nbsp;·&nbsp; Current tutor: <strong>' + (batch.tutorName || '—') + '</strong>' +
        '<br>Students: ' + (memberNames || '—') +
        '<br>Current schedule: ' + (schedText || '—') +
        (batch.class_link ? '<br>Current link: <a href="' + batch.class_link + '" target="_blank" style="color:var(--blue);font-size:11px;">' + batch.class_link.substring(0, 50) + '…</a>' : '');
    }

    /* Populate tutor dropdown */
    const tutorSel = document.getElementById('batchTransferTutor');
    if (tutorSel) {
      tutorSel.innerHTML = '<option value="">— Keep current tutor (' + (batch.tutorName || '—') + ') —</option>';
      const tutorRes = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const tutorData = await tutorRes.json();
      (tutorData.users || []).forEach(function(t) {
        if (t.id !== batch.tutor_id) {
          tutorSel.innerHTML += '<option value="' + t.id + '">' + t.name + ' (' + (t.staff_id || t.id.substring(0,8)) + ')</option>';
        }
      });
    }

    /* Pre-fill schedule rows from current schedule */
    _batchScheduleRowCount = 0;
    const rowsEl = document.getElementById('batchTransferScheduleRows');
    if (rowsEl) {
      rowsEl.innerHTML = '';
      if (schedArr.length) {
        schedArr.forEach(function(s) { addBatchScheduleRow(s.weekday, s.time); });
      } else {
        addBatchScheduleRow();
      }
    }

  } catch(e) {
    console.error('openBatchTransfer error:', e);
  }

  const overlay = document.getElementById('batchTransferOverlay');
  if (overlay) overlay.classList.add('open');
}

function addBatchScheduleRow(weekday, time) {
  var rowsEl = document.getElementById('batchTransferScheduleRows');
  if (!rowsEl) return;
  var idx = _batchScheduleRowCount++;
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var row = document.createElement('div');
  row.id = 'batchSchedRow-' + idx;
  row.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:8px;';
  row.innerHTML =
    '<select id="batchSchedDay-' + idx + '" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:\'Nunito\',sans-serif;font-size:14px;outline:none;">' +
    days.map(function(d, i) { return '<option value="' + i + '"' + (weekday !== undefined && weekday === i ? ' selected' : '') + '>' + d + '</option>'; }).join('') +
    '</select>' +
    '<input type="time" id="batchSchedTime-' + idx + '" value="' + (time || '16:00') + '" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:\'Nunito\',sans-serif;font-size:14px;outline:none;">' +
    (idx > 0 ? '<button type="button" onclick="document.getElementById(\'batchSchedRow-' + idx + '\').remove()" style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:8px 10px;font-size:16px;cursor:pointer;font-weight:900;">×</button>' : '<div style="width:38px;"></div>');
  rowsEl.appendChild(row);
}

function closeBatchTransfer() {
  const overlay = document.getElementById('batchTransferOverlay');
  if (overlay) overlay.classList.remove('open');
  _activeBatchId = null;
}

async function confirmBatchTransfer() {
  if (!_activeBatchId) return;

  const startDate = document.getElementById('batchTransferDate')?.value;
  if (!startDate) { showBatchTransferError('Please select a start date.'); return; }

  /* Collect schedule */
  const schedule = [];
  var i = 0;
  while (document.getElementById('batchSchedDay-' + i) || document.getElementById('batchSchedRow-' + i)) {
    var dayEl  = document.getElementById('batchSchedDay-' + i);
    var timeEl = document.getElementById('batchSchedTime-' + i);
    if (dayEl && timeEl && timeEl.value) {
      schedule.push({ weekday: parseInt(dayEl.value), time: timeEl.value });
    }
    i++;
    if (i > 10) break;
  }
  if (!schedule.length) { showBatchTransferError('Please set at least one day and time.'); return; }

  const newTutorId = document.getElementById('batchTransferTutor')?.value || null;
  const classLink  = document.getElementById('batchTransferLink')?.value.trim() || null;

  const btn = document.getElementById('batchTransferBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Transferring…'; }

  const errEl = document.getElementById('batchTransferError');
  if (errEl) errEl.style.display = 'none';

  try {
    const token = localStorage.getItem('sn_access_token');
    const payload = { startDate, schedule };
    if (newTutorId) payload.newTutorId = newTutorId;
    if (classLink)  payload.classLink  = classLink;

    const res = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + _activeBatchId + '/reschedule', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Transfer ✦'; }

    if (!data.success) {
      showBatchTransferError(data.error || 'Transfer failed. Please try again.');
      return;
    }

    closeBatchTransfer();
    if (typeof showToast === 'function') {
      showToast('✅ ' + (data.batchRef || 'Batch') + ' transferred. ' + data.created + ' bookings created.', 'success');
    }
    loadBatches();

  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Transfer ✦'; }
    showBatchTransferError('Network error — please try again.');
  }
}

function showBatchTransferError(msg) {
  const el = document.getElementById('batchTransferError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

async function deleteBatch(batchId, batchRef) {
  if (!confirm('Delete ' + batchRef + '? This will cancel all future classes for this batch and cannot be undone.')) return;
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + batchId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.success) { showToast(data.error || 'Delete failed', 'error'); return; }
    showToast('✅ ' + batchRef + ' deleted. ' + (data.cancelledBookings || 0) + ' future bookings cancelled.', 'success');
    loadBatches();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* Hook into tab switch */
(function() {
  var _prevShowPOSTab = window.showPOSTab;
  if (typeof _prevShowPOSTab === 'function') {
    window.showPOSTab = function(tab) {
      _prevShowPOSTab(tab);
      if (tab === 'batches') loadBatches();
    };
  }
  /* Also bind modal close on overlay click */
  document.addEventListener('DOMContentLoaded', function() {
    var overlay = document.getElementById('batchTransferOverlay');
    if (overlay) overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeBatchTransfer();
    });
  });
})();


/* ══════════════════════════════════════════════════════
   STUDENT TRANSFER FEATURE
   Transfer a student from one batch to another
   (existing batch OR brand-new batch created inline)
══════════════════════════════════════════════════════ */

var _transferSourceBatchId = null;
var _transferStudentId     = null;
var _transferStudentName   = null;

/* Open transfer modal — called from student card in batch detail */
async function openStudentTransferModal(sourceBatchId, studentId, studentName) {
  _transferSourceBatchId = sourceBatchId;
  _transferStudentId     = studentId;
  _transferStudentName   = studentName;

  var titleEl = document.getElementById('studentTransferTitle');
  if (titleEl) titleEl.textContent = '\u2194 Transfer ' + studentName;

  var infoEl = document.getElementById('studentTransferInfo');
  if (infoEl) infoEl.innerHTML = '<strong>' + studentName + '</strong> will be moved out of the current batch. Choose a destination below.';

  /* Default to "existing batch" tab */
  switchTransferTab('existing');

  /* Set min date on new batch start date */
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var startEl = document.getElementById('st-new-start');
  if (startEl) {
    startEl.min   = tomorrow.toISOString().split('T')[0];
    startEl.value = tomorrow.toISOString().split('T')[0];
  }

  /* Reset new batch schedule rows */
  var container = document.getElementById('st-schedule-rows');
  if (container) container.innerHTML = _buildSTSchedRow(0) + _buildSTSchedRow(1);

  /* Load existing eligible batches */
  await _loadEligibleBatches(sourceBatchId, studentId);

  /* Load tutors for new batch tab */
  await _loadSTTutors();

  /* Close batch detail so transfer modal is clearly visible */
  closeBatchDetailModal();

  document.getElementById('studentTransferOverlay').classList.add('open');
}

function closeStudentTransferModal() {
  document.getElementById('studentTransferOverlay').classList.remove('open');
  _transferSourceBatchId = null;
  _transferStudentId     = null;
  _transferStudentName   = null;
}

function switchTransferTab(tab) {
  var isExisting = tab === 'existing';
  document.getElementById('stPanelExisting').style.display = isExisting ? 'block' : 'none';
  document.getElementById('stPanelNew').style.display      = isExisting ? 'none'  : 'block';
  document.getElementById('stTab1').style.background = isExisting ? 'var(--blue)' : 'var(--bg)';
  document.getElementById('stTab1').style.color      = isExisting ? '#fff' : 'var(--mid)';
  document.getElementById('stTab2').style.background = isExisting ? 'var(--bg)' : 'var(--blue)';
  document.getElementById('stTab2').style.color      = isExisting ? 'var(--mid)' : '#fff';
}

async function _loadEligibleBatches(sourceBatchId, studentId) {
  var sel = document.getElementById('st-target-batch');
  if (!sel) return;
  sel.innerHTML = '<option value="">\u23f3 Loading batches\u2026</option>';
  try {
    var token = localStorage.getItem('sn_access_token');
    var res   = await fetch('https://api.stemnestacademy.co.uk/api/batches', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var data  = await res.json();
    var batches = (data.batches || []).filter(function(b) {
      return b.id !== sourceBatchId &&
             b.status === 'active' &&
             (parseInt(b.memberCount) || 0) < 3;
    });

    if (!batches.length) {
      sel.innerHTML = '<option value="">No eligible batches found \u2014 use Create New Batch</option>';
      return;
    }
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    sel.innerHTML = '<option value="">\u2014 Select a batch \u2014</option>' +
      batches.map(function(b) {
        var sched = [];
        try { sched = typeof b.schedule === 'string' ? JSON.parse(b.schedule) : (b.schedule || []); } catch(e) {}
        var schedStr = sched.map(function(s) { return days[s.weekday] + ' ' + s.time; }).join(', ');
        return '<option value="' + b.id + '">' +
          (b.batchRef || b.batch_ref) + ' \u2014 ' + (b.tutorName || '\u2014') +
          ' (' + (parseInt(b.memberCount) || 0) + '/3 students)' +
          (schedStr ? ' \u00b7 ' + schedStr : '') +
          '</option>';
      }).join('');
  } catch(e) {
    sel.innerHTML = '<option value="">Failed to load batches</option>';
  }
}

async function _loadSTTutors() {
  var sel = document.getElementById('st-new-tutor');
  if (!sel) return;
  sel.innerHTML = '<option value="">\u23f3 Loading tutors\u2026</option>';
  try {
    var token = localStorage.getItem('sn_access_token');
    var res   = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor&limit=100', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var data  = await res.json();
    var tutors = data.users || [];
    sel.innerHTML = '<option value="">\u2014 Select teacher \u2014</option>' +
      tutors.map(function(t) {
        return '<option value="' + t.id + '">' + t.name + ' (' + (t.staff_id || t.id.slice(0,8)) + ')</option>';
      }).join('');
  } catch(e) {
    sel.innerHTML = '<option value="">Failed to load tutors</option>';
  }
}

/* Schedule row builder for new batch tab */
function _buildSTSchedRow(idx) {
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var removeBtn = idx > 0
    ? '<button type="button" onclick="document.getElementById(\'st-row-' + idx + '\').remove()" style="background:#fde8e8;color:#c53030;border:none;border-radius:10px;padding:8px 12px;font-size:18px;cursor:pointer;font-weight:900;line-height:1;">\u00d7</button>'
    : '<div style="width:40px;"></div>';
  return '<div id="st-row-' + idx + '" style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">' +
    '<select id="st-day-' + idx + '" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:\'Nunito\',sans-serif;font-size:14px;font-weight:700;outline:none;background:#fff;">' +
    '<option value="">\u2014 Day \u2014</option>' +
    days.map(function(d, i) { return '<option value="' + i + '">' + d + '</option>'; }).join('') +
    '</select>' +
    '<input type="time" id="st-time-' + idx + '" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:\'Nunito\',sans-serif;font-size:14px;font-weight:700;outline:none;">' +
    removeBtn +
    '</div>';
}

function addSTScheduleRow() {
  var container = document.getElementById('st-schedule-rows');
  if (!container) return;
  var existing = container.querySelectorAll('[id^="st-row-"]').length;
  if (existing >= 5) { showToast('Maximum 5 days per week.', 'error'); return; }
  var div = document.createElement('div');
  div.innerHTML = _buildSTSchedRow(existing);
  container.appendChild(div.firstChild);
}

function _getSTSchedule() {
  var schedule  = [];
  var container = document.getElementById('st-schedule-rows');
  if (!container) return schedule;
  container.querySelectorAll('[id^="st-row-"]').forEach(function(row) {
    var dayEl  = row.querySelector('select[id^="st-day-"]');
    var timeEl = row.querySelector('input[type="time"]');
    if (dayEl && timeEl && dayEl.value !== '' && timeEl.value) {
      schedule.push({ weekday: parseInt(dayEl.value), time: timeEl.value });
    }
  });
  return schedule;
}

/* ── Confirm: move to existing batch ── */
async function confirmTransferToExisting() {
  var targetBatchId = document.getElementById('st-target-batch').value;
  if (!targetBatchId) { showToast('Please select a destination batch.', 'error'); return; }
  if (!_transferStudentId || !_transferSourceBatchId) { showToast('No student selected.', 'error'); return; }

  var btn = document.getElementById('stConfirmExistingBtn');
  if (btn) { btn.disabled = true; btn.textContent = '\u23f3 Transferring\u2026'; }

  try {
    var token = localStorage.getItem('sn_access_token');
    var res   = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + _transferSourceBatchId + '/transfer-member', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ studentId: _transferStudentId, targetBatchId: targetBatchId }),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Transfer failed');

    showToast('\u2705 ' + data.studentName + ' transferred to ' + data.destBatch + '! ' + data.created + ' new classes created.', 'success', 7000);
    closeStudentTransferModal();
    renderBatchesTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '\u2194 Transfer Student'; }
  }
}

/* ── Confirm: create new batch and transfer ── */
async function confirmTransferToNew() {
  var tutorId   = document.getElementById('st-new-tutor').value;
  var classLink = document.getElementById('st-new-link').value.trim();
  var startDate = document.getElementById('st-new-start').value;
  var schedule  = _getSTSchedule();

  if (!tutorId)        { showToast('Please select a teacher.', 'error'); return; }
  if (!classLink)      { showToast('Please enter a Google Meet link.', 'error'); return; }
  if (!startDate)      { showToast('Please select a start date.', 'error'); return; }
  if (!schedule.length){ showToast('Please add at least one class day and time.', 'error'); return; }
  if (!_transferStudentId || !_transferSourceBatchId) { showToast('No student selected.', 'error'); return; }

  var btn = document.getElementById('stConfirmNewBtn');
  if (btn) { btn.disabled = true; btn.textContent = '\u23f3 Creating batch\u2026'; }

  try {
    var token = localStorage.getItem('sn_access_token');
    var res   = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + _transferSourceBatchId + '/transfer-member', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        studentId: _transferStudentId,
        newBatch: { tutorId: tutorId, classLink: classLink, schedule: schedule, startDate: startDate },
      }),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Transfer failed');

    showToast('\u2705 ' + data.destBatch + ' created! ' + data.studentName + ' transferred with ' + data.created + ' new classes.', 'success', 7000);
    closeStudentTransferModal();
    renderBatchesTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '\u2728 Create Batch & Transfer'; }
  }
}

/* Bind overlay close on backdrop click */
document.addEventListener('DOMContentLoaded', function() {
  var o = document.getElementById('studentTransferOverlay');
  if (o) o.addEventListener('click', function(e) { if (e.target === o) closeStudentTransferModal(); });
  var o2 = document.getElementById('addMemberOverlay');
  if (o2) o2.addEventListener('click', function(e) { if (e.target === o2) closeAddMemberModal(); });
});

/* ══════════════════════════════════════════════════════
   IMPROVED ADD MEMBER MODAL
   Replaces the old prompt()-based student picker
══════════════════════════════════════════════════════ */

var _addMemberBatchId  = null;
var _amAllStudents     = [];

async function openAddMemberModal(batchId) {
  _addMemberBatchId = batchId;
  _amAllStudents    = [];

  document.getElementById('addMemberOverlay').classList.add('open');
  document.getElementById('am-search').value = '';
  document.getElementById('am-student-list').innerHTML =
    '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">\u23f3 Loading students\u2026</div>';

  try {
    var token = localStorage.getItem('sn_access_token');
    var res   = await fetch('https://api.stemnestacademy.co.uk/api/users?role=student&limit=300', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var data  = await res.json();
    _amAllStudents = data.users || [];
    _renderAMStudents(_amAllStudents, batchId);
  } catch(e) {
    document.getElementById('am-student-list').innerHTML =
      '<div style="padding:16px;color:#c53030;font-weight:700;">Failed to load students: ' + e.message + '</div>';
  }
}

function closeAddMemberModal() {
  document.getElementById('addMemberOverlay').classList.remove('open');
  _addMemberBatchId = null;
  _amAllStudents    = [];
}

function filterAMStudents() {
  var q = (document.getElementById('am-search').value || '').toLowerCase();
  var filtered = q
    ? _amAllStudents.filter(function(s) {
        return (s.name || '').toLowerCase().includes(q) || (s.staff_id || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q);
      })
    : _amAllStudents;
  _renderAMStudents(filtered, _addMemberBatchId);
}

function _renderAMStudents(students, batchId) {
  var el = document.getElementById('am-student-list');
  if (!el) return;
  if (!students.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--light);font-weight:700;">No students found.</div>';
    return;
  }
  el.innerHTML = students.map(function(s) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border:1.5px solid #e8eaf0;border-radius:10px;gap:10px;">' +
      '<div>' +
        '<div style="font-weight:800;font-size:14px;color:var(--dark);">' + (s.name || '\u2014') + '</div>' +
        '<div style="font-size:11px;color:var(--light);">' + (s.staff_id || s.id.slice(0,8)) + ' \u00b7 ' + (s.email || '\u2014') + '</div>' +
      '</div>' +
      '<button onclick="addMemberToBatch(\'' + batchId + '\',\'' + s.id + '\',\'' + (s.name || '').replace(/'/g,'') + '\')" ' +
        'style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;">' +
        '+ Add' +
      '</button>' +
    '</div>';
  }).join('');
}

async function addMemberToBatch(batchId, studentId, studentName) {
  try {
    var token = localStorage.getItem('sn_access_token');
    var res   = await fetch('https://api.stemnestacademy.co.uk/api/batches/' + batchId + '/members', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ studentId: studentId }),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to add student');
    showToast('\u2705 ' + studentName + ' added to batch!', 'success');
    closeAddMemberModal();
    renderBatchesTab();
    openBatchDetail(batchId);
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}