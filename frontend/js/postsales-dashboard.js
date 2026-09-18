/**
 * postsales-dashboard.js
 * All logic for the Post-Sales dashboard.
 * Loaded by postsales-dashboard.html
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   GLOBALS
═══════════════════════════════════════════════════════════════ */
const API = 'https://api.stemnestacademy.co.uk';
let   POS_DATA      = {};           // full dashboard payload
let   _allPathways  = [];           // cached pathways list
let   _allTutors    = [];           // cached tutors list
let   _allStudents  = [];           // cached paid students (for batch selector)
let   _activeTab    = 'students';   // current sidebar tab

/* ─── schedule a modal rows state ─── */
let   _scheduleRows = [];   // pos-schedule modal
let   _rsRows       = [];   // reschedule modal
let   _batchSchedRows = [];  // create-batch modal
let   _batchTransferScheduleRows = [];
let   _resumeRows   = [];

/* ─── current modal context ─── */
let   _posScheduleStudentId   = null;
let   _posScheduleStudentName = '';
let   _posScheduleStudentEmail = '';
let   _posScheduleEnrolId     = null;
let   _posSchedulePathwayId   = null;
let   _posScheduleGradeNumber = null;

let   _rsStudentId    = null;
let   _rsStudentName  = '';
let   _pauseStudentId = null;
let   _resumeStudentId = null;
let   _ctStudentId    = null;
let   _ctStudentName  = '';

let   _batchTransferBatchId = null;

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Set today's date in topbar
  const el = document.getElementById('posDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Kick off the dashboard load
  await loadDashboard();

  // Auto-refresh every 60 seconds
  setInterval(loadDashboard, 60000);

  // Set default date inputs to today
  const today = new Date().toISOString().split('T')[0];
  ['pos-sm-start','rs-start-date','ct-start-date','resume-start-date','batchTransferDate','cb-start-date']
    .forEach(id => { const el = document.getElementById(id); if (el && !el.value) el.value = today; });
});

/* ═══════════════════════════════════════════════════════════════
   LOAD DASHBOARD DATA
═══════════════════════════════════════════════════════════════ */
async function loadDashboard() {
  const token = localStorage.getItem('sn_access_token');
  if (!token) return;

  try {
    const [dashRes, pathwayRes, tutorRes] = await Promise.all([
      fetch(`${API}/api/sync/dashboard/postsales`, { headers: { 'Authorization': 'Bearer ' + token } }),
      fetch(`${API}/api/pathways/for-onboarding`,  { headers: { 'Authorization': 'Bearer ' + token } }),
      fetch(`${API}/api/users?role=tutor`,          { headers: { 'Authorization': 'Bearer ' + token } }),
    ]);

    if (dashRes.ok) {
      POS_DATA = await dashRes.json();
    }
    if (pathwayRes.ok) {
      const pd = await pathwayRes.json();
      _allPathways = pd.pathways || pd || [];
    }
    if (tutorRes.ok) {
      const td = await tutorRes.json();
      _allTutors = td.users || td || [];
    }

    // cache students for batch selector
    _allStudents = POS_DATA.students || [];

    // update stat cards
    updateStats();

    // render current tab
    renderCurrentTab();

  } catch (err) {
    console.error('[POS] loadDashboard error:', err);
  }
}

function updateStats() {
  const students   = POS_DATA.students  || [];
  const scheduled  = POS_DATA.scheduledStudents || [];
  const converted  = POS_DATA.convertedStudents || [];
  const payments   = POS_DATA.payments  || [];

  // Stat 1: students awaiting schedule (have credits but no future bookings)
  const scheduledIds = new Set(scheduled.map(s => s.studentId));
  const awaiting = students.filter(s => !scheduledIds.has(s.studentId) && (s.credits || 0) > 0);
  setText('posStat1', awaiting.length);

  // Stat 2: scheduled
  setText('posStat2', scheduled.length);

  // Stat 3: converted
  setText('posStat3', converted.length);

  // Stat 4: revenue this month
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  const monthRevenue = payments
    .filter(p => {
      const d = new Date(p.created_at || p.confirmed_at);
      return d.getMonth() === month && d.getFullYear() === year && p.status === 'confirmed';
    })
    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  setText('posStat4', '£' + monthRevenue.toFixed(0));

  // Badges
  const lowCredit = students.filter(s => (s.credits || 0) <= 2 && !s.creditsSuspended);
  setText('posBadge',    students.length);
  setText('topupBadge',  lowCredit.length);
}

/* ═══════════════════════════════════════════════════════════════
   TAB NAVIGATION
═══════════════════════════════════════════════════════════════ */
function showPOSTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
  const el = document.getElementById('tab-' + tab);
  if (el) el.style.display = 'block';

  document.querySelectorAll('.sidebar-link').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });

  renderCurrentTab();
}

function renderCurrentTab() {
  switch (_activeTab) {
    case 'students':            renderPaidStudents();          break;
    case 'topup':               renderTopUp();                 break;
    case 'scheduled':           renderScheduledClasses();      break;
    case 'converted':           renderConverted();             break;
    case 'website-enquiries':   renderWebsiteEnquiries();      break;
    case 'enrollment-requests': renderEnrollmentRequests();    break;
    case 'incoming-referrals':  renderIncomingReferrals();     break;
    case 'promotions':          renderPromotions();            break;
    case 'pause-resume':        renderPauseResume();           break;
    case 'batches':             loadBatches();                 break;
    case 'paylinks':            populatePayLinkCourses();      break;
  }
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtDate(d) {
  if (!d) return '—';
  const parsed = new Date(d);
  if (isNaN(parsed)) return '—';
  return parsed.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

function fmtDateShort(d) {
  if (!d) return '—';
  const parsed = new Date(d);
  if (isNaN(parsed)) return '—';
  return parsed.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function fmtTime(t) {
  if (!t) return '';
  // t could be "14:30:00" or "14:30"
  const parts = String(t).split(':');
  let h = parseInt(parts[0]), m = parseInt(parts[1] || 0);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`;
}

function fmtDatetime(date, time) {
  const d = fmtDate(date);
  const t = fmtTime(time);
  return t ? `${d} · ${t}` : d;
}

const tdS = 'padding:10px 14px;font-size:13px;font-weight:700;color:var(--dark);border-bottom:1.5px solid #f1f3f8;';
const thS = 'padding:10px 14px;font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;';

function tableWrap(headers, rows) {
  return `<div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
    <table style="width:100%;border-collapse:collapse;min-width:700px;">
      <thead style="background:var(--bg);">
        <tr>${headers.map(h=>`<th style="${thS}">${h}</th>`).join('')}</tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  </div>`;
}

function emptyState(icon, title, sub) {
  return `<div style="text-align:center;padding:48px 24px;">
    <div style="font-size:48px;margin-bottom:12px;">${icon}</div>
    <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">${title}</div>
    ${sub ? `<div style="font-size:14px;color:var(--light);margin-top:6px;">${sub}</div>` : ''}
  </div>`;
}

function showToast(msg, type='success', duration=4000) {
  let t = document.getElementById('posToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'posToast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:14px 22px;border-radius:14px;font-family:Nunito,sans-serif;font-weight:800;font-size:14px;max-width:380px;box-shadow:0 8px 30px rgba(0,0,0,.15);transition:opacity .3s;';
    document.body.appendChild(t);
  }
  t.style.background = type === 'error' ? '#fed7d7' : (type === 'warning' ? '#fff3e0' : '#d4f8e8');
  t.style.color      = type === 'error' ? '#c53030' : (type === 'warning' ? '#92400e' : '#065f46');
  t.style.opacity    = '1';
  t.textContent      = msg;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, duration);
}

/* ═══════════════════════════════════════════════════════════════
   1. PAID STUDENTS
═══════════════════════════════════════════════════════════════ */
function renderPaidStudents() {
  const el = document.getElementById('paidStudentsList');
  if (!el) return;

  const students = POS_DATA.students || [];
  if (!students.length) {
    el.innerHTML = emptyState('🎓','No paid students yet','Onboard a student using the Manual Onboard button above, or wait for a payment to come through.');
    return;
  }

  const rows = students.map(s => {
    const dob = s.dateOfBirth ? fmtDateShort(s.dateOfBirth) : (s.age ? s.age + ' yrs' : '—');
    const enrolled = fmtDateShort(s.enrolledAt || s.createdAt);
    const amount = s.amountPaid
      ? (s.amountCurrency || '£') + parseFloat(s.amountPaid).toFixed(2)
      : '—';
    const creditBadge = (s.credits || 0) <= 0
      ? `<span style="color:#c53030;background:#fed7d7;padding:2px 8px;border-radius:50px;font-size:11px;">${s.credits || 0}</span>`
      : `<span style="color:#065f46;background:#d4f8e8;padding:2px 8px;border-radius:50px;font-size:11px;">${s.credits || 0}</span>`;
    const pathway = s.pathwayName || '—';
    const grade   = s.gradeNumber ? `Grade ${s.gradeNumber}` : (s.grade || '—');

    return `<tr>
      <td style="${tdS};font-weight:900;color:var(--blue);">${s.staffId || '—'}</td>
      <td style="${tdS}">${s.studentName || '—'}</td>
      <td style="${tdS};max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.email || '—'}</td>
      <td style="${tdS}">${s.phone || s.whatsapp || '—'}</td>
      <td style="${tdS}">${dob}</td>
      <td style="${tdS}">${grade}</td>
      <td style="${tdS};color:var(--blue);font-weight:800;">${pathway}</td>
      <td style="${tdS}">${enrolled}</td>
      <td style="${tdS}">${amount}</td>
      <td style="${tdS};text-align:center;">${creditBadge}</td>
      <td style="${tdS};text-align:center;">
        <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
          <button onclick="openPOSScheduleModal('${s.studentId}','${(s.studentName||'').replace(/'/g,'')}','${s.email||''}')"
            style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;">
            📅 Schedule
          </button>
          <button onclick="openPauseModal('${s.studentId}','${(s.studentName||'').replace(/'/g,'')}')"
            style="background:#f59e0b;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">
            ⏸️
          </button>
        </div>
      </td>
    </tr>`;
  });

  el.innerHTML = tableWrap(
    ['ID','Name','Email','Phone','DOB / Age','Grade','Pathway','Enrolled','Amount Paid','Credits','Actions'],
    rows
  );
}

/* ═══════════════════════════════════════════════════════════════
   2. STUDENTS NEEDING TOP-UP
═══════════════════════════════════════════════════════════════ */
function renderTopUp() {
  const el = document.getElementById('topupStudentsList');
  if (!el) return;

  const students = (POS_DATA.students || []).filter(s => (s.credits || 0) <= 2);
  if (!students.length) {
    el.innerHTML = emptyState('✅','All good!','No students are running low on credits right now.');
    return;
  }

  const rows = students.map(s => {
    const creditColor = (s.credits || 0) <= 0 ? '#c53030' : '#e65100';
    return `<tr>
      <td style="${tdS};font-weight:900;">${s.staffId || '—'}</td>
      <td style="${tdS}">${s.studentName}</td>
      <td style="${tdS}">${s.email || '—'}</td>
      <td style="${tdS}">${s.phone || s.whatsapp || '—'}</td>
      <td style="${tdS};color:${creditColor};font-weight:900;">${s.credits || 0}</td>
      <td style="${tdS};text-align:center;">
        <button onclick="openManualTopUp('${s.studentId}','${(s.studentName||'').replace(/'/g,'')}','${s.email||''}')"
          style="background:var(--green);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
          💳 Confirm Payment
        </button>
      </td>
    </tr>`;
  });

  el.innerHTML = tableWrap(['ID','Name','Email','Phone','Credits Left','Action'], rows);
}

/* ═══════════════════════════════════════════════════════════════
   3. SCHEDULED CLASSES
═══════════════════════════════════════════════════════════════ */
function renderScheduledClasses() {
  const el = document.getElementById('scheduledPaidList');
  if (!el) return;

  const students = POS_DATA.scheduledStudents || [];
  if (!students.length) {
    el.innerHTML = emptyState('📅','No scheduled classes','Schedule a student\'s paid classes from the Paid Students tab.');
    return;
  }

  const rows = students.map(s => {
    // Fix "Invalid Date": nextDate comes as "YYYY-MM-DD" string — parse explicitly
    const nextDateStr  = s.nextDate  ? s.nextDate.substring(0,10)  : null;
    const firstDateStr = s.firstClassDate ? s.firstClassDate.substring(0,10) : null;

    // Format next class date+time
    let nextDisplay = '—';
    if (nextDateStr) {
      const [y,m,d] = nextDateStr.split('-').map(Number);
      const dateObj  = new Date(y, m-1, d);
      const dayName  = dateObj.toLocaleDateString('en-GB', { weekday:'long' });
      const dateFormatted = dateObj.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      const timeFormatted = fmtTime(s.nextTime);
      nextDisplay = `${dayName}<br><span style="font-weight:700;font-size:12px;color:var(--mid);">${dateFormatted}${timeFormatted ? ' · ' + timeFormatted : ''}</span>`;
    }

    // Format first class date
    let firstDisplay = '—';
    if (firstDateStr) {
      const [y,m,d] = firstDateStr.split('-').map(Number);
      const dateObj  = new Date(y, m-1, d);
      const dayName  = dateObj.toLocaleDateString('en-GB', { weekday:'long' });
      const dateFormatted = dateObj.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      const timeFormatted = fmtTime(s.firstClassTime);
      firstDisplay = `${dayName}<br><span style="font-weight:700;font-size:12px;color:var(--mid);">${dateFormatted}${timeFormatted ? ' · ' + timeFormatted : ''}</span>`;
    }

    const classLink = s.classLink
      ? `<a href="${s.classLink}" target="_blank" style="color:var(--blue);font-weight:800;font-size:12px;">🔗 Join</a>`
      : '<span style="color:var(--light);">—</span>';

    return `<tr>
      <td style="${tdS}">${s.studentName || '—'}</td>
      <td style="${tdS};color:var(--blue);font-weight:800;">${s.pathway || s.course || '—'}</td>
      <td style="${tdS}">${s.tutorName || '—'}</td>
      <td style="${tdS}">${firstDisplay}</td>
      <td style="${tdS}">${nextDisplay}</td>
      <td style="${tdS};text-align:center;font-weight:900;color:var(--green-dark);">${s.remainingCount || 0}</td>
      <td style="${tdS};text-align:center;">${classLink}</td>
      <td style="${tdS};text-align:center;">
        <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
          <button onclick="openRescheduleStudentModal('${s.studentId}','${(s.studentName||'').replace(/'/g,'')}','${s.email||''}')"
            style="background:var(--orange);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;">
            🔄 Reschedule
          </button>
          <button onclick="openChangeTutorModal('${s.studentId}','${(s.studentName||'').replace(/'/g,'')}')"
            style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;">
            👩‍🏫 Change Tutor
          </button>
        </div>
      </td>
    </tr>`;
  });

  el.innerHTML = tableWrap(
    ['Student','Pathway','Teacher','First Class Date','Next Class','Remaining','Class Link','Actions'],
    rows
  );
}

/* ═══════════════════════════════════════════════════════════════
   4. CONVERTED STUDENTS
═══════════════════════════════════════════════════════════════ */
function renderConverted() {
  const el = document.getElementById('posConvertedList');
  if (!el) return;

  const list = POS_DATA.convertedStudents || [];
  if (!list.length) {
    el.innerHTML = emptyState('✅','No converted students yet','Students marked as paid by the Learning Advisor will appear here.');
    return;
  }

  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const rows = list.map(s => {
    // Build learning schedule display
    let scheduleDisplay = '—';
    if (s.learningSchedule) {
      try {
        const sched = typeof s.learningSchedule === 'string'
          ? JSON.parse(s.learningSchedule) : s.learningSchedule;
        if (Array.isArray(sched) && sched.length) {
          scheduleDisplay = sched.map(sl => `${weekdays[sl.weekday] || sl.weekday} ${fmtTime(sl.time)}`).join(', ');
        }
      } catch {}
    }

    const dob = s.dateOfBirth ? fmtDateShort(s.dateOfBirth) : (s.age ? s.age + ' yrs' : '—');
    const staffId = s.staffId || '—';
    const countryCity = [s.country, s.city].filter(Boolean).join(', ') || '—';

    return `<tr>
      <td style="${tdS};font-weight:900;color:var(--blue);">${staffId}</td>
      <td style="${tdS};font-weight:800;">${s.studentName || '—'}</td>
      <td style="${tdS}">${dob}</td>
      <td style="${tdS}">${s.gender || '—'}</td>
      <td style="${tdS}">${countryCity}</td>
      <td style="${tdS}">${s.grade || '—'}</td>
      <td style="${tdS};color:var(--blue);font-weight:800;">${s.pathwayName || s.coursePitched || '—'}</td>
      <td style="${tdS}">${s.parentName || '—'}</td>
      <td style="${tdS};max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.studentEmail || '—'}</td>
      <td style="${tdS}">${s.studentPhone || '—'}</td>
      <td style="${tdS};text-align:center;">
        <span style="background:#dbeafe;color:#1e40af;padding:3px 10px;border-radius:50px;font-size:11px;font-weight:900;white-space:nowrap;">1-to-1</span>
      </td>
      <td style="${tdS};font-size:12px;">${scheduleDisplay}</td>
      <td style="${tdS}">${s.tutorName || '—'}</td>
      <td style="${tdS}">${fmtDateShort(s.convertedAt)}</td>
    </tr>`;
  });

  el.innerHTML = tableWrap(
    ['Student ID','Full Name','DOB / Age','Gender','Country / City','Grade','Pathway','Parent Name','Email','Phone','Service','Schedule','Teacher','Converted'],
    rows
  );
}

/* ═══════════════════════════════════════════════════════════════
   5. WEBSITE ENQUIRIES
   Only shows records from enrollment_requests where source = 'website'
   (i.e. parent clicked "Enrol Now" on the public site).
   Presales "Enroll" button now calls PUT /bookings/:id/status
   and does NOT create enrollment_requests records.
═══════════════════════════════════════════════════════════════ */
async function renderWebsiteEnquiries() {
  const el = document.getElementById('websiteEnquiriesList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading…</div>';

  const token = localStorage.getItem('sn_access_token');
  if (!token) return;

  try {
    const res  = await fetch(`${API}/api/enrollments/requests`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const requests = (data.requests || []).filter(r => r.source === 'website' || !r.source);

    if (!requests.length) {
      el.innerHTML = emptyState('🌐','No website enquiries yet','When a parent clicks "Enrol Now" on the website, their details will appear here.');
      return;
    }

    const rows = requests.map(r => {
      const statusBadge = r.payment_status === 'received'
        ? '<span style="background:#d4f8e8;color:#065f46;padding:3px 9px;border-radius:50px;font-size:11px;font-weight:900;">✅ Received</span>'
        : r.payment_link
          ? '<span style="background:#dbeafe;color:#1e40af;padding:3px 9px;border-radius:50px;font-size:11px;font-weight:900;">🔗 Link Sent</span>'
          : '<span style="background:#fff3e0;color:#e65100;padding:3px 9px;border-radius:50px;font-size:11px;font-weight:900;">⏳ Pending</span>';

      const proceed = r.status === 'processed'
        ? '<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Processed</span>'
        : `<button onclick="proceedEnrollmentRequest('${r.id}')"
            style="background:var(--green);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;"
            ${r.payment_status !== 'received' ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}>
            🎓 Proceed
          </button>`;

      return `<tr>
        <td style="${tdS};font-weight:800;">${r.student_name || '—'}</td>
        <td style="${tdS}">${r.age || '—'}</td>
        <td style="${tdS}">${r.email || '—'}</td>
        <td style="${tdS}">${r.phone || '—'}</td>
        <td style="${tdS};color:var(--blue);font-weight:800;">${r.course_name || r.course_name_db || '—'}</td>
        <td style="${tdS}">${r.course_price || r.course_price_db ? '£'+(r.course_price||r.course_price_db) : '—'}</td>
        <td style="${tdS}">${fmtDateShort(r.created_at)}</td>
        <td style="${tdS};text-align:center;">${statusBadge}</td>
        <td style="${tdS};text-align:center;">
          <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
            ${r.status !== 'processed' ? `
              <select onchange="saveEnqPaymentStatus('${r.id}',this.value)"
                style="padding:6px 10px;border:1.5px solid #e8eaf0;border-radius:8px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;outline:none;">
                <option value="pending"  ${(r.payment_status||'pending')==='pending'  ?'selected':''}>⏳ Pending</option>
                <option value="received" ${r.payment_status==='received'?'selected':''}>✅ Received</option>
              </select>
            ` : ''}
            ${proceed}
          </div>
        </td>
      </tr>`;
    });

    el.innerHTML = tableWrap(
      ['Student','Age','Email','Phone','Course','Price','Enquiry Date','Payment','Actions'],
      rows
    );
  } catch (err) {
    el.innerHTML = `<div style="padding:24px;color:var(--orange);font-weight:700;">⚠️ Error: ${err.message}</div>`;
  }
}

async function saveEnqPaymentStatus(id, status) {
  const token = localStorage.getItem('sn_access_token');
  await fetch(`${API}/api/enrollments/requests/${id}`, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentStatus: status }),
  });
  renderWebsiteEnquiries();
}

async function proceedEnrollmentRequest(id) {
  if (!confirm('Mark this enrollment request as processed and move to Paid Students?')) return;
  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/enrollments/requests/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proceed: true }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Moved to Paid Students for onboarding.');
      renderWebsiteEnquiries();
      await loadDashboard();
    } else {
      showToast('Error: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   6. ENROLLMENT REQUESTS
═══════════════════════════════════════════════════════════════ */
async function renderEnrollmentRequests() {
  const el = document.getElementById('enrollmentRequestsList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading…</div>';

  const token = localStorage.getItem('sn_access_token');
  if (!token) return;

  try {
    const res  = await fetch(`${API}/api/enrollments/requests`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    // Enrollment requests from presales come through as booking status='converted'
    // This tab shows walk-in / referral enrollment_requests that are NOT from the public website
    const requests = (data.requests || []).filter(r => r.source !== 'website');

    if (!requests.length) {
      el.innerHTML = emptyState('📋','No enrollment requests','Students sent here from Presales or referrals will appear here.');
      return;
    }

    const rows = requests.map(r => {
      const statusBadge = r.payment_status === 'received'
        ? '<span style="background:#d4f8e8;color:#065f46;padding:3px 9px;border-radius:50px;font-size:11px;font-weight:900;">✅ Received</span>'
        : '<span style="background:#fff3e0;color:#e65100;padding:3px 9px;border-radius:50px;font-size:11px;font-weight:900;">⏳ Pending</span>';

      const proceed = r.status === 'processed'
        ? '<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Processed</span>'
        : `<button onclick="proceedEnrollmentRequest('${r.id}')"
            style="background:var(--green);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;"
            ${r.payment_status !== 'received' ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}>
            🎓 Proceed
          </button>`;

      return `<tr>
        <td style="${tdS};font-weight:800;">${r.student_name}</td>
        <td style="${tdS}">${r.email || '—'}</td>
        <td style="${tdS}">${r.phone || '—'}</td>
        <td style="${tdS};color:var(--blue);">${r.course_name || r.course_name_db || '—'}</td>
        <td style="${tdS}">${fmtDateShort(r.created_at)}</td>
        <td style="${tdS};text-align:center;">${statusBadge}</td>
        <td style="${tdS};text-align:center;">
          <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
            ${r.status !== 'processed' ? `
              <select onchange="saveEnqPaymentStatus('${r.id}',this.value)"
                style="padding:6px 10px;border:1.5px solid #e8eaf0;border-radius:8px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;outline:none;">
                <option value="pending"  ${(r.payment_status||'pending')==='pending'  ?'selected':''}>⏳ Pending</option>
                <option value="received" ${r.payment_status==='received'?'selected':''}>✅ Received</option>
              </select>
            ` : ''}
            ${proceed}
          </div>
        </td>
      </tr>`;
    });

    el.innerHTML = tableWrap(['Student','Email','Phone','Course','Date','Payment','Actions'], rows);
  } catch (err) {
    el.innerHTML = `<div style="padding:24px;color:var(--orange);font-weight:700;">⚠️ Error: ${err.message}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   7. INCOMING REFERRALS
═══════════════════════════════════════════════════════════════ */
async function renderIncomingReferrals() {
  const el = document.getElementById('posIncomingReferralsList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading…</div>';

  const token = localStorage.getItem('sn_access_token');
  if (!token) return;

  try {
    const res  = await fetch(`${API}/api/enrollments/referrals?status=postsales`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const referrals = data.referrals || [];

    if (!referrals.length) {
      el.innerHTML = emptyState('🤝','No incoming referrals','When Pre-Sales moves a referral to Post-Sales, it will appear here.');
      return;
    }

    const rows = referrals.map(r => {
      const statusBadge = r.payment_status === 'received'
        ? '<span style="background:#d4f8e8;color:#065f46;padding:3px 9px;border-radius:50px;font-size:11px;font-weight:900;">✅ Received</span>'
        : '<span style="background:#fff3e0;color:#e65100;padding:3px 9px;border-radius:50px;font-size:11px;font-weight:900;">⏳ Pending</span>';

      const enrolled = r.status === 'enrolled'
        ? '<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Enrolled</span>'
        : `<button onclick="proceedReferral('${r.id}')"
            style="background:var(--green);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
            🎓 Proceed
          </button>`;

      return `<tr>
        <td style="${tdS};font-weight:800;">${r.student_name}</td>
        <td style="${tdS}">${r.grade || '—'}</td>
        <td style="${tdS}">${r.parent_email || '—'}</td>
        <td style="${tdS}">${r.parent_phone || '—'}</td>
        <td style="${tdS}">${r.referrer_name || '—'}</td>
        <td style="${tdS}">${fmtDateShort(r.created_at)}</td>
        <td style="${tdS};text-align:center;">${statusBadge}</td>
        <td style="${tdS};text-align:center;">
          <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
            <select onchange="saveReferralPaymentStatus('${r.id}',this.value)"
              style="padding:6px 10px;border:1.5px solid #e8eaf0;border-radius:8px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;outline:none;">
              <option value="pending"  ${(r.payment_status||'pending')==='pending'  ?'selected':''}>⏳ Pending</option>
              <option value="received" ${r.payment_status==='received'?'selected':''}>✅ Received</option>
            </select>
            ${enrolled}
          </div>
        </td>
      </tr>`;
    });

    el.innerHTML = tableWrap(['Student','Grade','Parent Email','Parent Phone','Referred By','Date','Payment','Actions'], rows);
    setText('posRefBadge', referrals.filter(r => r.status !== 'enrolled').length);
  } catch (err) {
    el.innerHTML = `<div style="padding:24px;color:var(--orange);font-weight:700;">⚠️ Error: ${err.message}</div>`;
  }
}

async function saveReferralPaymentStatus(id, status) {
  const token = localStorage.getItem('sn_access_token');
  await fetch(`${API}/api/enrollments/referrals/${id}`, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentStatus: status }),
  });
  renderIncomingReferrals();
}

async function proceedReferral(id) {
  if (!confirm('Proceed to enroll this referral?')) return;
  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/enrollments/referrals/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proceed: true }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Referral enrolled successfully.');
      renderIncomingReferrals();
      await loadDashboard();
    } else {
      showToast('Error: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   8. GRADE PROMOTIONS
═══════════════════════════════════════════════════════════════ */
async function renderPromotions() {
  const el = document.getElementById('promotionsList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading…</div>';

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/pathways/promotions/pending`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const students = data.students || [];
    setText('promotionsBadge', students.length);

    if (!students.length) {
      el.innerHTML = emptyState('🎓','No promotions pending','Students who complete all 72 lessons in their grade will appear here.');
      return;
    }

    const rows = students.map(s => `<tr>
      <td style="${tdS}">${s.studentName}</td>
      <td style="${tdS}">${s.pathwayName}</td>
      <td style="${tdS}">Grade ${s.currentGrade}</td>
      <td style="${tdS}">Grade ${s.currentGrade + 1}</td>
      <td style="${tdS}">${s.tutorName || '—'}</td>
      <td style="${tdS};text-align:center;">
        <button onclick="promoteStudent('${s.enrolmentId}',${s.currentGrade + 1},'${s.studentName.replace(/'/g,'')}')"
          style="background:var(--green);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
          🎓 Promote to Grade ${s.currentGrade + 1}
        </button>
      </td>
    </tr>`);

    el.innerHTML = tableWrap(['Student','Pathway','Current Grade','Next Grade','Teacher','Action'], rows);
  } catch (err) {
    el.innerHTML = `<div style="padding:24px;color:var(--orange);font-weight:700;">⚠️ ${err.message}</div>`;
  }
}

async function promoteStudent(enrolmentId, newGrade, name) {
  if (!confirm(`Promote ${name} to Grade ${newGrade}?`)) return;
  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/pathways/promotions/${enrolmentId}/promote`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newGrade }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${name} promoted to Grade ${newGrade}!`);
      renderPromotions();
    } else {
      showToast('Error: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   9. PAUSE & RESUME
═══════════════════════════════════════════════════════════════ */
async function renderPauseResume() {
  const token = localStorage.getItem('sn_access_token');

  try {
    const [activeRes, pausedRes] = await Promise.all([
      fetch(`${API}/api/enrollments/students/active`,  { headers: { 'Authorization': 'Bearer ' + token } }),
      fetch(`${API}/api/enrollments/students/paused`,  { headers: { 'Authorization': 'Bearer ' + token } }),
    ]);

    const [activeData, pausedData] = await Promise.all([activeRes.json(), pausedRes.json()]);
    const activeStudents = activeData.students || [];
    const pausedStudents = pausedData.students || [];

    setText('pauseBadge', pausedStudents.length);

    const activeEl = document.getElementById('activeStudentsList');
    const pausedEl = document.getElementById('pausedStudentsList');

    if (activeEl) {
      if (!activeStudents.length) {
        activeEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--light);font-weight:700;">No active students found.</div>';
      } else {
        activeEl.innerHTML = activeStudents.map(s => `
          <div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:14px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div>
              <div style="font-weight:900;font-size:14px;color:var(--dark);">${s.studentName}</div>
              <div style="font-size:12px;color:var(--mid);font-weight:700;margin-top:2px;">${s.pathwayName||'No pathway'} · Grade ${s.currentGrade||'—'} · ${s.credits||0} credits</div>
              <div style="font-size:11px;color:var(--light);margin-top:2px;">${s.tutorName||'No teacher assigned'}</div>
            </div>
            <button onclick="openPauseModal('${s.studentId}','${(s.studentName||'').replace(/'/g,'')}')"
              style="background:#f59e0b;color:#fff;border:none;border-radius:10px;padding:9px 18px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;flex-shrink:0;">
              ⏸️ Pause
            </button>
          </div>`).join('');
      }
    }

    if (pausedEl) {
      if (!pausedStudents.length) {
        pausedEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--light);font-weight:700;">No paused students.</div>';
      } else {
        pausedEl.innerHTML = pausedStudents.map(s => `
          <div style="background:var(--white);border:1.5px solid #fde8d8;border-radius:14px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div>
              <div style="font-weight:900;font-size:14px;color:var(--dark);">${s.studentName}</div>
              <div style="font-size:12px;color:var(--mid);font-weight:700;margin-top:2px;">${s.pathwayName||'No pathway'} · Grade ${s.currentGrade||'—'} · Lesson ${s.lastLesson||0} paused</div>
              <div style="font-size:11px;color:#c53030;margin-top:2px;">${s.pausedReason||'No reason given'}</div>
            </div>
            <button onclick="openResumeModal('${s.studentId}','${(s.studentName||'').replace(/'/g,'')}','${s.classLink||''}','${s.lastTutorId||''}')"
              style="background:var(--green);color:#fff;border:none;border-radius:10px;padding:9px 18px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;flex-shrink:0;">
              ▶️ Resume
            </button>
          </div>`).join('');
      }
    }
  } catch (err) {
    console.error('[POS] renderPauseResume error:', err);
  }
}

/* ─── PAUSE MODAL ─── */
function openPauseModal(studentId, studentName) {
  _pauseStudentId = studentId;
  document.getElementById('pauseStudentName').textContent = studentName;
  if (document.getElementById('pauseReason')) document.getElementById('pauseReason').value = '';
  document.getElementById('pauseModalOverlay').classList.add('open');
}

function closePauseModal() {
  document.getElementById('pauseModalOverlay').classList.remove('open');
}

async function confirmPause() {
  const reason = document.getElementById('pauseReason').value.trim();
  if (!reason) { showToast('Please provide a reason for the pause.','warning'); return; }

  const btn = document.getElementById('pauseConfirmBtn');
  btn.disabled = true; btn.textContent = '⏳ Pausing…';

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/enrollments/students/${_pauseStudentId}/pause`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${data.studentName}'s classes paused. ${data.bookingsCancelled} bookings cancelled.`);
      closePauseModal();
      await loadDashboard();
      renderPauseResume();
    } else {
      showToast('Error: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '⏸️ Confirm Pause';
  }
}

/* ─── RESUME MODAL ─── */
function openResumeModal(studentId, studentName, classLink, lastTutorId) {
  _resumeStudentId = studentId;
  document.getElementById('resumeStudentName').textContent = studentName;

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('resume-start-date').value = today;
  if (document.getElementById('resume-class-link')) document.getElementById('resume-class-link').value = classLink || '';

  // Populate tutors
  const sel = document.getElementById('resume-tutor-select');
  sel.innerHTML = `<option value="">— Select teacher —</option>`;
  _allTutors.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name + (t.staff_id ? ' (' + t.staff_id + ')' : '');
    if (t.id === lastTutorId) opt.selected = true;
    sel.appendChild(opt);
  });

  // Reset schedule rows
  _resumeRows = [];
  const rowsEl = document.getElementById('resume-schedule-rows');
  if (rowsEl) rowsEl.innerHTML = '';
  addRSScheduleRow('resume-schedule-rows', _resumeRows);

  document.getElementById('resumeModalOverlay').classList.add('open');
}

function closeResumeModal() {
  document.getElementById('resumeModalOverlay').classList.remove('open');
}

async function confirmResume() {
  const startDate = document.getElementById('resume-start-date').value;
  const tutorId   = document.getElementById('resume-tutor-select').value;
  const classLink = document.getElementById('resume-class-link')?.value || '';

  const schedule = collectScheduleRows('resume-schedule-rows');
  if (!startDate) { showToast('Please select a start date.','warning'); return; }
  if (!tutorId)   { showToast('Please select a teacher.','warning'); return; }
  if (!schedule.length) { showToast('Please add at least one schedule day.','warning'); return; }

  const btn = document.getElementById('resumeConfirmBtn');
  btn.disabled = true; btn.textContent = '⏳ Resuming…';

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/enrollments/students/${_resumeStudentId}/resume`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tutorId, schedule, startDate, classLink }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${data.studentName}'s classes resumed from Lesson ${data.resumedFromLesson}. ${data.bookingsCreated} classes created.`);
      closeResumeModal();
      await loadDashboard();
      renderPauseResume();
    } else {
      showToast('Error: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '▶️ Resume Classes';
  }
}

/* ═══════════════════════════════════════════════════════════════
   SCHEDULE MODAL (from Paid Students → Schedule button)
═══════════════════════════════════════════════════════════════ */
function openPOSScheduleModal(studentId, studentName, studentEmail, enrolId, pathwayId, gradeNumber) {
  _posScheduleStudentId    = studentId;
  _posScheduleStudentName  = studentName;
  _posScheduleStudentEmail = studentEmail;
  _posScheduleEnrolId      = enrolId  || null;
  _posSchedulePathwayId    = pathwayId || null;
  _posScheduleGradeNumber  = gradeNumber || null;

  // Find pathway info from student data
  const studentData = (POS_DATA.students || []).find(s => s.studentId === studentId);

  const infoEl = document.getElementById('pos-sm-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <strong>${studentName}</strong><br>
      📧 ${studentEmail || '—'} &nbsp;&nbsp;
      📚 ${studentData?.pathwayName || '—'} · Grade ${studentData?.currentGrade || '—'} &nbsp;&nbsp;
      🎟️ ${studentData?.credits || 0} credits`;
  }

  // Populate teacher dropdown
  const teacherSel = document.getElementById('pos-sm-teacher');
  if (teacherSel) {
    teacherSel.innerHTML = '<option value="">— Select a teacher —</option>';
    _allTutors.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name + (t.staff_id ? ' (' + t.staff_id + ')' : '');
      teacherSel.appendChild(opt);
    });
  }

  // Populate pathway dropdown
  const pathwaySel = document.getElementById('pos-sm-pathway');
  if (pathwaySel) {
    pathwaySel.innerHTML = '<option value="">— Select pathway —</option>';
    _allPathways.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = (p.emoji || '') + ' ' + p.name;
      if (p.id === (studentData?.pathwayId || pathwayId)) opt.selected = true;
      pathwaySel.appendChild(opt);
    });
    // Trigger grade load if pathway already selected
    if (pathwaySel.value) onPOSPathwayChange();
  }

  // Pre-fill grade
  if (gradeNumber || studentData?.currentGrade) {
    setTimeout(() => {
      const grSel = document.getElementById('pos-sm-grade');
      if (grSel) {
        const target = gradeNumber || studentData.currentGrade;
        [...grSel.options].forEach(o => { if (parseInt(o.value) === parseInt(target)) o.selected = true; });
      }
    }, 400);
  }

  // Reset schedule rows
  const rowsEl = document.getElementById('pos-schedule-rows');
  if (rowsEl) rowsEl.innerHTML = '';
  addPOSScheduleRow();

  // Default start date
  const startEl = document.getElementById('pos-sm-start');
  if (startEl && !startEl.value) startEl.value = new Date().toISOString().split('T')[0];

  document.getElementById('posScheduleModalOverlay').classList.add('open');
}

function closePOSScheduleModal() {
  document.getElementById('posScheduleModalOverlay').classList.remove('open');
}

async function onPOSPathwayChange() {
  const pathwayId = document.getElementById('pos-sm-pathway')?.value;
  const grSel     = document.getElementById('pos-sm-grade');
  if (!grSel) return;

  if (!pathwayId) {
    grSel.innerHTML = '<option value="">— Select grade —</option>';
    return;
  }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/pathways/${pathwayId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const grades = (data.pathway?.grades || data.grades || []).filter(g => g.is_active !== false);
    grSel.innerHTML = '<option value="">— Select grade —</option>' +
      grades.map(g => `<option value="${g.grade_number}">Grade ${g.grade_number}${g.name ? ' — ' + g.name : ''}</option>`).join('');
  } catch {}
}

function addPOSScheduleRow() {
  const rowsEl = document.getElementById('pos-schedule-rows');
  if (!rowsEl) return;
  const idx = rowsEl.children.length;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
  div.innerHTML = `
    <select style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;outline:none;background:#fff;">
      <option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option>
      <option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option>
    </select>
    <input type="time" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;outline:none;" value="16:00">
    <button type="button" onclick="this.parentElement.remove()" style="background:#fed7d7;color:#c53030;border:none;border-radius:8px;width:32px;height:36px;font-size:16px;cursor:pointer;flex-shrink:0;">×</button>`;
  rowsEl.appendChild(div);
}

function collectScheduleRows(containerId) {
  const rowsEl = document.getElementById(containerId || 'pos-schedule-rows');
  if (!rowsEl) return [];
  return Array.from(rowsEl.children).map(row => {
    const selects = row.querySelectorAll('select');
    const inputs  = row.querySelectorAll('input[type="time"]');
    const weekday = parseInt(selects[0]?.value || '1');
    const time    = inputs[0]?.value || '16:00';
    return { weekday, time };
  }).filter(r => !isNaN(r.weekday));
}

async function confirmPOSSchedule() {
  const teacherId  = document.getElementById('pos-sm-teacher')?.value;
  const pathwayId  = document.getElementById('pos-sm-pathway')?.value || null;
  const gradeNum   = parseInt(document.getElementById('pos-sm-grade')?.value) || null;
  const startDate  = document.getElementById('pos-sm-start')?.value;
  const weeks      = parseInt(document.getElementById('pos-sm-weeks')?.value) || 36;
  const classLink  = document.getElementById('pos-sm-link')?.value;
  const schedule   = collectScheduleRows('pos-schedule-rows');

  if (!teacherId)    { showToast('Please select a teacher.','warning'); return; }
  if (!startDate)    { showToast('Please select a start date.','warning'); return; }
  if (!classLink)    { showToast('Please enter a class link.','warning'); return; }
  if (!schedule.length) { showToast('Please add at least one schedule day.','warning'); return; }

  const btn = document.querySelector('#posScheduleModalOverlay .btn-green');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Scheduling…'; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/bookings/bulk-schedule`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId:   _posScheduleStudentId,
        tutorId:     teacherId,
        pathwayId:   pathwayId,
        gradeNumber: gradeNum,
        schedule,
        startDate,
        weeks,
        classLink,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${data.bookingsCreated || ''} classes scheduled for ${_posScheduleStudentName}!`);
      closePOSScheduleModal();
      await loadDashboard();
    } else {
      showToast('Error: ' + (data.error || 'Scheduling failed'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Schedule All Classes'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   RESCHEDULE MODAL
═══════════════════════════════════════════════════════════════ */
function openRescheduleStudentModal(studentId, studentName, studentEmail) {
  _rsStudentId   = studentId;
  _rsStudentName = studentName;

  const info = document.getElementById('reschedule-student-info');
  if (info) info.innerHTML = `Rescheduling classes for <strong>${studentName}</strong>`;

  const today = new Date().toISOString().split('T')[0];
  const startEl = document.getElementById('rs-start-date');
  if (startEl) startEl.value = today;

  const rowsEl = document.getElementById('rs-schedule-rows');
  if (rowsEl) rowsEl.innerHTML = '';
  addRSScheduleRow('rs-schedule-rows');

  document.getElementById('rescheduleStudentOverlay').classList.add('open');
}

function closeRescheduleStudentModal() {
  document.getElementById('rescheduleStudentOverlay').classList.remove('open');
}

function addRSScheduleRow(containerId) {
  const cid    = containerId || 'rs-schedule-rows';
  const rowsEl = document.getElementById(cid);
  if (!rowsEl) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
  div.innerHTML = `
    <select style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;outline:none;background:#fff;">
      <option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option>
      <option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option>
    </select>
    <input type="time" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;outline:none;" value="16:00">
    <button type="button" onclick="this.parentElement.remove()" style="background:#fed7d7;color:#c53030;border:none;border-radius:8px;width:32px;height:36px;font-size:16px;cursor:pointer;flex-shrink:0;">×</button>`;
  rowsEl.appendChild(div);
}

async function confirmRescheduleStudent() {
  const startDate = document.getElementById('rs-start-date')?.value;
  const classLink = document.getElementById('rs-class-link')?.value || null;
  const schedule  = collectScheduleRows('rs-schedule-rows');

  if (!startDate)       { showToast('Please select a start date.','warning'); return; }
  if (!schedule.length) { showToast('Please add at least one schedule day.','warning'); return; }

  const btn = document.querySelector('#rescheduleStudentOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Rescheduling…'; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/bookings/reschedule-student`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: _rsStudentId, startDate, classLink, schedule }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${_rsStudentName}'s schedule updated. ${data.created || ''} classes recreated.`);
      closeRescheduleStudentModal();
      await loadDashboard();
    } else {
      showToast('Error: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Apply New Schedule'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   CHANGE TUTOR MODAL
═══════════════════════════════════════════════════════════════ */
function openChangeTutorModal(studentId, studentName) {
  _ctStudentId   = studentId;
  _ctStudentName = studentName;

  const info = document.getElementById('change-tutor-student-info');
  if (info) info.innerHTML = `Changing tutor for <strong>${studentName}</strong>`;

  const sel = document.getElementById('ct-new-tutor');
  if (sel) {
    sel.innerHTML = '<option value="">— Select a teacher —</option>';
    _allTutors.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name + (t.staff_id ? ' (' + t.staff_id + ')' : '');
      sel.appendChild(opt);
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('ct-start-date');
  if (dateEl) dateEl.value = today;

  document.getElementById('changeTutorOverlay').classList.add('open');
}

function closeChangeTutorModal() {
  document.getElementById('changeTutorOverlay').classList.remove('open');
}

async function confirmChangeTutor() {
  const newTutorId = document.getElementById('ct-new-tutor')?.value;
  const startDate  = document.getElementById('ct-start-date')?.value;

  if (!newTutorId) { showToast('Please select a teacher.','warning'); return; }
  if (!startDate)  { showToast('Please select a transfer date.','warning'); return; }

  const btn = document.querySelector('#changeTutorOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Transferring…'; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/bookings/change-tutor`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: _ctStudentId, newTutorId, startDate }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${_ctStudentName}'s tutor changed. ${data.updated || ''} classes updated.`);
      closeChangeTutorModal();
      await loadDashboard();
    } else {
      showToast('Error: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '👩‍🏫 Transfer Student'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   MANUAL ONBOARD MODAL
═══════════════════════════════════════════════════════════════ */
function openManualOnboardModal() {
  // Populate pathways
  ['mob-pathway','ob-pathway'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Pathway (optional) —</option>';
    _allPathways.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = (p.emoji || '') + ' ' + p.name;
      sel.appendChild(opt);
    });
  });

  // Auto-generate password
  const pass = 'SN' + Math.random().toString(36).slice(2,8).toUpperCase();
  ['mob-password','ob-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = pass;
  });

  document.getElementById('manualOnboardOverlay').classList.add('open');
}

function closeManualOnboardModal() {
  document.getElementById('manualOnboardOverlay').classList.remove('open');
}

async function onPathwayChange(pathwaySelId, gradeSelId) {
  const pathwayId = document.getElementById(pathwaySelId)?.value;
  const grSel     = document.getElementById(gradeSelId);
  if (!grSel) return;
  if (!pathwayId) { grSel.innerHTML = '<option value="">— Select Grade —</option>'; return; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/pathways/${pathwayId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const grades = (data.pathway?.grades || data.grades || []).filter(g => g.is_active !== false);
    grSel.innerHTML = '<option value="">— Select Grade —</option>' +
      grades.map(g => `<option value="${g.grade_number}">Grade ${g.grade_number}${g.name ? ' — ' + g.name : ''}</option>`).join('');
  } catch {}
}

async function confirmManualOnboard() {
  const name     = document.getElementById('mob-name')?.value.trim();
  const email    = document.getElementById('mob-email')?.value.trim();
  const phone    = document.getElementById('mob-phone')?.value.trim();
  const age      = document.getElementById('mob-age')?.value.trim();
  const grade    = document.getElementById('mob-grade')?.value.trim();
  const subject  = document.getElementById('mob-subject')?.value;
  const course   = document.getElementById('mob-course')?.value.trim();
  const pathwayId = document.getElementById('mob-pathway')?.value;
  const gradeNum = parseInt(document.getElementById('mob-pathway-grade')?.value) || null;
  const credits  = parseInt(document.getElementById('mob-credits')?.value) || 0;
  const amount   = parseFloat(document.getElementById('mob-amount')?.value) || null;
  const currency = document.getElementById('mob-currency')?.value || 'GBP';
  const password = document.getElementById('mob-password')?.value.trim();

  if (!name)     { showToast('Full name is required.','warning'); return; }
  if (!email)    { showToast('Email is required.','warning'); return; }
  if (!password) { showToast('Password is required.','warning'); return; }

  const btn = document.querySelector('#manualOnboardOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Onboarding…'; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch(`${API}/api/users`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, password, phone: phone || null,
        role: 'student',
        studentProfile: {
          grade, age, credits,
          parentName: name,
          parentEmail: email,
          pathwayId:   pathwayId || null,
          gradeNumber: gradeNum,
          subject:     subject,
          course:      course,
          amount:      amount,
          currency:    currency,
        }
      }),
    });
    const data = await res.json();
    if (data.success || data.user || data.id) {
      showToast(`✅ ${name} onboarded successfully!`);
      closeManualOnboardModal();
      await loadDashboard();
    } else {
      showToast('Error: ' + (data.error || 'Onboarding failed'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🎓 Onboard Student'; }
  }
}

/* ─── Onboard Modal (from Paid Students enrol flow) ─── */
function closeOnboardModal() {
  const el = document.getElementById('onboardModalOverlay');
  if (el) el.classList.remove('open');
}

async function confirmOnboard() {
  const name     = document.getElementById('ob-name')?.value.trim();
  const email    = document.getElementById('ob-email')?.value.trim();
  const phone    = document.getElementById('ob-phone')?.value.trim();
  const age      = document.getElementById('ob-age')?.value.trim();
  const grade    = document.getElementById('ob-grade')?.value.trim();
  const subject  = document.getElementById('ob-subject')?.value.trim();
  const course   = document.getElementById('ob-course')?.value.trim();
  const pathwayId = document.getElementById('ob-pathway')?.value;
  const gradeNum = parseInt(document.getElementById('ob-pathway-grade')?.value) || null;
  const credits  = parseInt(document.getElementById('ob-credits')?.value) || 0;
  const amount   = document.getElementById('ob-amount')?.value.trim();
  const password = document.getElementById('ob-password')?.value.trim();

  if (!name)     { showToast('Name required.','warning'); return; }
  if (!email)    { showToast('Email required.','warning'); return; }
  if (!password) { showToast('Password required.','warning'); return; }

  const btn = document.querySelector('#onboardModalOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Onboarding…'; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch(`${API}/api/users`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, password, phone: phone || null,
        role: 'student',
        studentProfile: { grade, age, credits, subject, course, pathwayId, gradeNumber: gradeNum, amount }
      }),
    });
    const data = await res.json();
    if (data.success || data.user || data.id) {
      showToast(`✅ ${name} onboarded!`);
      closeOnboardModal();
      await loadDashboard();
    } else {
      showToast('Error: ' + (data.error || 'Onboarding failed'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🎓 Confirm & Onboard Student'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   MANUAL TOP-UP
═══════════════════════════════════════════════════════════════ */
let _topUpStudentId = null;

function openManualTopUp(studentId, studentName, studentEmail) {
  _topUpStudentId = studentId;
  const credits = prompt(`Confirm Payment for ${studentName}\n\nEnter number of credits to add:`);
  if (!credits || isNaN(parseInt(credits))) return;
  const amount = prompt('Enter amount received (numbers only, e.g. 99):');
  if (!amount) return;
  confirmManualTopUp(studentId, parseInt(credits), parseFloat(amount), studentName, studentEmail);
}

async function confirmManualTopUp(studentId, credits, amount, studentName, studentEmail) {
  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/payments/manual-topup`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, credits, amount, currency: 'GBP', notes: 'Manual confirmation by Post-Sales' }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${credits} credits added for ${studentName}. New balance: ${data.newCredits}`);
      await loadDashboard();
    } else {
      showToast('Error: ' + (data.error || 'Top-up failed'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   PAYMENT LINK TAB
═══════════════════════════════════════════════════════════════ */
function populatePayLinkCourses() {
  const sel = document.getElementById('pl-course');
  if (!sel || sel.options.length > 1) return;
  // Use pathways as course options
  _allPathways.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = (p.emoji || '') + ' ' + p.name;
    sel.appendChild(opt);
  });
}

async function generatePaymentLink() {
  const studentName  = document.getElementById('pl-student')?.value.trim();
  const studentEmail = document.getElementById('pl-email')?.value.trim();
  const amount       = document.getElementById('pl-amount')?.value;
  const currency     = document.getElementById('pl-currency')?.value || 'GBP';
  const credits      = document.getElementById('pl-credits')?.value;
  const notes        = document.getElementById('pl-notes')?.value.trim();

  if (!studentEmail) { showToast('Student email is required.','warning'); return; }
  if (!amount)       { showToast('Amount is required.','warning'); return; }

  const btn = document.querySelector('[onclick="generatePaymentLink()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/payments/create-link`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, studentEmail, amount, currency, credits, notes }),
    });
    const data = await res.json();
    if (data.success && data.paymentUrl) {
      document.getElementById('generatedLinkBox').style.display = 'block';
      document.getElementById('generatedLinkText').textContent  = data.paymentUrl;
      window._generatedPayUrl = data.paymentUrl;
      showToast('✅ Payment link generated and sent to parent!');
      if (btn) { btn.textContent = '✅ Done'; }
    } else {
      showToast('Error: ' + (data.error || 'Failed'), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🔗 Generate & Send Link'; }
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🔗 Generate & Send Link'; }
  }
}

function copyPayLink() {
  const url = window._generatedPayUrl || document.getElementById('generatedLinkText')?.textContent;
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => showToast('✅ Copied to clipboard!'));
}

function sendPayLinkEmail() { showToast('Email was sent automatically when the link was generated.','warning'); }

function sendPayLinkWhatsApp() {
  const url = window._generatedPayUrl || document.getElementById('generatedLinkText')?.textContent;
  if (url) window.open('https://wa.me/?text=' + encodeURIComponent('Your payment link: ' + url));
}

function clearPayLink() {
  ['pl-student','pl-email','pl-whatsapp','pl-amount','pl-credits','pl-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('generatedLinkBox').style.display = 'none';
  const btn = document.querySelector('[onclick="generatePaymentLink()"]');
  if (btn) { btn.disabled = false; btn.textContent = '🔗 Generate & Send Link'; }
}

/* ═══════════════════════════════════════════════════════════════
   GREY PAYMENT MODAL
═══════════════════════════════════════════════════════════════ */
function openGreyPaymentModal(enrollmentId) {
  document.getElementById('greyPaymentModalOverlay').classList.add('open');
  const body = document.getElementById('greyPaymentBody');
  const ref  = 'SN-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
  body.innerHTML = `
    <div style="background:#f0fdf4;border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;font-weight:700;color:#065f46;">
      💰 Share these bank details with the parent to complete payment via bank transfer.
    </div>
    <div style="font-size:14px;font-weight:700;line-height:2;color:var(--dark);">
      <strong>Bank:</strong> Lead Bank (via Grey Finance)<br>
      <strong>Account Number:</strong> 218292502181<br>
      <strong>Routing Number:</strong> 101019644<br>
      <strong>Payment Reference:</strong> <span style="color:var(--blue);font-weight:900;">${ref}</span><br>
      <strong>Currency:</strong> USD
    </div>
    <div style="margin-top:16px;">
      <button onclick="copyGreyDetails('${ref}')"
        style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:10px 20px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;cursor:pointer;">
        📋 Copy Payment Details
      </button>
    </div>`;
}

function closeGreyPaymentModal() {
  document.getElementById('greyPaymentModalOverlay').classList.remove('open');
}

function copyGreyDetails(ref) {
  const text = `Bank: Lead Bank (via Grey Finance)\nAccount Number: 218292502181\nRouting Number: 101019644\nPayment Reference: ${ref}\nCurrency: USD`;
  navigator.clipboard.writeText(text).then(() => showToast('✅ Payment details copied!'));
}

/* ═══════════════════════════════════════════════════════════════
   GROUP BATCHES
═══════════════════════════════════════════════════════════════ */
async function loadBatches() {
  const el = document.getElementById('batchesList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading batches…</div>';

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/batches`, { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const batches = data.batches || [];

    setText('batchesBadge', batches.filter(b => b.status === 'active').length);

    if (!batches.length) {
      el.innerHTML = emptyState('👥','No batches yet','Create a batch to group 2-3 students with one teacher.');
      return;
    }

    el.innerHTML = batches.map(b => {
      const statusColor = b.status === 'active' ? '#065f46' : (b.status === 'paused' ? '#92400e' : '#6b7280');
      const statusBg    = b.status === 'active' ? '#d4f8e8' : (b.status === 'paused' ? '#fff3e0' : '#f3f4f6');
      const schedStr    = formatBatchSchedule(b.schedule);
      const nextDate    = b.nextClassDate ? fmtDateShort(b.nextClassDate) : '—';

      return `<div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;padding:18px 20px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-family:'Fredoka One',cursive;font-size:17px;color:var(--dark);">
              👥 ${b.batchRef}
              <span style="background:${statusBg};color:${statusColor};font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;margin-left:8px;font-family:'Nunito',sans-serif;">${b.status}</span>
            </div>
            <div style="font-size:13px;font-weight:700;color:var(--mid);margin-top:4px;">
              👩‍🏫 ${b.tutorName || '—'} · ${b.pathwayName || 'No pathway'} · ${b.memberCount || 0} students
            </div>
            <div style="font-size:12px;color:var(--light);font-weight:700;margin-top:2px;">
              🗓️ ${schedStr} · Next: ${nextDate}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button onclick="openBatchDetail('${b.id}')"
              style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
              👁️ Details
            </button>
            <button onclick="openBatchRescheduleModal('${b.id}','${b.batchRef}')"
              style="background:var(--orange);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
              🔄 Reschedule
            </button>
            ${b.status === 'active' ? `
              <button onclick="pauseBatch('${b.id}','${b.batchRef}')"
                style="background:#f59e0b;color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                ⏸️ Pause
              </button>` : `
              <button onclick="resumeBatch('${b.id}','${b.batchRef}')"
                style="background:var(--green);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                ▶️ Resume
              </button>`}
            <button onclick="deleteBatch('${b.id}','${b.batchRef}')"
              style="background:#fed7d7;color:#c53030;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
              🗑️
            </button>
          </div>
        </div>
      </div>`;
    }).join('');

  } catch (err) {
    el.innerHTML = `<div style="padding:24px;color:var(--orange);font-weight:700;">⚠️ Error: ${err.message}</div>`;
  }
}

function formatBatchSchedule(schedule) {
  if (!schedule) return '—';
  try {
    const s = typeof schedule === 'string' ? JSON.parse(schedule) : schedule;
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return s.map(sl => `${days[sl.weekday]} ${fmtTime(sl.time)}`).join(', ');
  } catch { return '—'; }
}

async function openBatchDetail(batchId) {
  document.getElementById('batchDetailOverlay').classList.add('open');
  const body = document.getElementById('batchDetailBody');
  body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading…</div>';

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/batches/${batchId}`, { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const b    = data.batch || {};
    const members = data.members || [];

    body.innerHTML = `
      <div style="background:var(--bg);border-radius:12px;padding:14px;margin-bottom:20px;font-size:13px;font-weight:700;color:var(--dark);line-height:1.9;">
        <strong>Ref:</strong> ${b.batch_ref || b.batchRef} · <strong>Status:</strong> ${b.status}<br>
        <strong>Teacher:</strong> ${b.tutorName || '—'} · <strong>Pathway:</strong> ${b.pathwayName || '—'}<br>
        <strong>Schedule:</strong> ${formatBatchSchedule(b.schedule)}<br>
        <strong>Classes Remaining:</strong> ${data.remainingClasses || 0}<br>
        <strong>Class Link:</strong> ${b.class_link ? `<a href="${b.class_link}" target="_blank" style="color:var(--blue);">🔗 Open</a>` : '—'}
      </div>
      <div style="font-family:'Fredoka One',cursive;font-size:15px;color:var(--dark);margin-bottom:12px;">👩‍🎓 Members (${members.length})</div>
      ${members.map(m => `
        <div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:12px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <div style="font-weight:900;font-size:13px;">${m.studentName}</div>
            <div style="font-size:11px;color:var(--mid);font-weight:700;">${m.email || '—'} · ${m.credits || 0} credits</div>
          </div>
          <div style="display:flex;gap:8px;">
            <span style="background:${m.status==='active'?'#d4f8e8':'#fed7d7'};color:${m.status==='active'?'#065f46':'#c53030'};font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">${m.status}</span>
            ${m.status==='active' ? `<button onclick="removeBatchMember('${batchId}','${m.studentId}','${m.studentName.replace(/'/g,'')}')"
              style="background:#fed7d7;color:#c53030;border:none;border-radius:8px;padding:5px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">Remove</button>` : ''}
          </div>
        </div>`).join('')}
      <div style="margin-top:16px;">
        <button onclick="addStudentToBatch('${batchId}')"
          style="background:var(--green);color:#fff;border:none;border-radius:10px;padding:9px 18px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;cursor:pointer;">
          ➕ Add Student
        </button>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div style="padding:24px;color:var(--orange);font-weight:700;">⚠️ ${err.message}</div>`;
  }
}

function closeBatchDetailModal() {
  document.getElementById('batchDetailOverlay').classList.remove('open');
}

async function removeBatchMember(batchId, studentId, studentName) {
  const reason = prompt(`Remove ${studentName} from this batch?\n\nProvide a reason:`);
  if (!reason) return;
  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/batches/${batchId}/members/${studentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (data.success) { showToast(`✅ ${studentName} removed from batch.`); openBatchDetail(batchId); }
    else showToast('Error: ' + (data.error || 'Unknown'), 'error');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function addStudentToBatch(batchId) {
  const name = prompt('Enter student name or ID to search:');
  if (!name) return;
  const student = _allStudents.find(s => s.studentName.toLowerCase().includes(name.toLowerCase()) || s.staffId === name);
  if (!student) { showToast('Student not found. Check the name or ID.','warning'); return; }
  if (!confirm(`Add ${student.studentName} to this batch?`)) return;

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/batches/${batchId}/members`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.studentId }),
    });
    const data = await res.json();
    if (data.success) { showToast(`✅ ${student.studentName} added to batch.`); openBatchDetail(batchId); }
    else showToast('Error: ' + (data.error || 'Unknown'), 'error');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function pauseBatch(batchId, batchRef) {
  if (!confirm(`Pause batch ${batchRef}? No classes will run until resumed.`)) return;
  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch(`${API}/api/batches/${batchId}/status`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    });
    const data = await res.json();
    if (data.success) { showToast(`✅ Batch ${batchRef} paused.`); loadBatches(); }
    else showToast('Error: ' + data.error, 'error');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function resumeBatch(batchId, batchRef) {
  if (!confirm(`Resume batch ${batchRef}?`)) return;
  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch(`${API}/api/batches/${batchId}/status`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    const data = await res.json();
    if (data.success) { showToast(`✅ Batch ${batchRef} resumed.`); loadBatches(); }
    else showToast('Error: ' + data.error, 'error');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function deleteBatch(batchId, batchRef) {
  if (!confirm(`DELETE batch ${batchRef}?\n\nAll future bookings will be cancelled. This cannot be undone.`)) return;
  const token = localStorage.getItem('sn_access_token');
  try {
    const res = await fetch(`${API}/api/batches/${batchId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const data = await res.json();
    if (data.success) { showToast(`✅ Batch ${batchRef} deleted.`); loadBatches(); }
    else showToast('Error: ' + data.error, 'error');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

/* ─── Create Batch Modal ─── */
function openCreateBatchModal() {
  // Populate tutor dropdown
  const tutorSel = document.getElementById('cb-tutor');
  if (tutorSel) {
    tutorSel.innerHTML = '<option value="">— Select teacher —</option>';
    _allTutors.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name + (t.staff_id ? ' (' + t.staff_id + ')' : '');
      tutorSel.appendChild(opt);
    });
  }

  // Populate pathway dropdown
  const pathSel = document.getElementById('cb-pathway');
  if (pathSel) {
    pathSel.innerHTML = '<option value="">— Select pathway —</option>';
    _allPathways.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = (p.emoji || '') + ' ' + p.name;
      pathSel.appendChild(opt);
    });
  }

  // Populate students checklist
  const studentsEl = document.getElementById('cb-students-list');
  if (studentsEl) {
    if (!_allStudents.length) {
      studentsEl.innerHTML = '<div style="color:var(--light);font-size:13px;font-weight:700;">No students onboarded yet.</div>';
    } else {
      studentsEl.innerHTML = _allStudents.map(s => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;color:var(--dark);">
          <input type="checkbox" value="${s.studentId}" style="width:16px;height:16px;cursor:pointer;">
          ${s.studentName} <span style="color:var(--light);font-size:11px;">${s.staffId || ''} · ${s.credits || 0} credits</span>
        </label>`).join('');
    }
  }

  // Default start date
  const startEl = document.getElementById('cb-start-date');
  if (startEl) startEl.value = new Date().toISOString().split('T')[0];

  // Reset schedule rows
  const schedEl = document.getElementById('cb-schedule-rows');
  if (schedEl) schedEl.innerHTML = '';
  addBatchSchedRow();

  document.getElementById('createBatchOverlay').classList.add('open');
}

function closeCreateBatchModal() {
  document.getElementById('createBatchOverlay').classList.remove('open');
}

function addBatchSchedRow() {
  const rowsEl = document.getElementById('cb-schedule-rows');
  if (!rowsEl) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
  div.innerHTML = `
    <select style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;outline:none;background:#fff;">
      <option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option>
      <option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option>
    </select>
    <input type="time" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;outline:none;" value="16:00">
    <button type="button" onclick="this.parentElement.remove()" style="background:#fed7d7;color:#c53030;border:none;border-radius:8px;width:32px;height:36px;font-size:16px;cursor:pointer;flex-shrink:0;">×</button>`;
  rowsEl.appendChild(div);
}

async function confirmCreateBatch() {
  const tutorId   = document.getElementById('cb-tutor')?.value;
  const pathwayId = document.getElementById('cb-pathway')?.value || null;
  const gradeNum  = parseInt(document.getElementById('cb-grade')?.value) || null;
  const classLink = document.getElementById('cb-class-link')?.value;
  const startDate = document.getElementById('cb-start-date')?.value;
  const notes     = document.getElementById('cb-notes')?.value;
  const schedule  = collectScheduleRows('cb-schedule-rows');

  const studentIds = Array.from(
    document.querySelectorAll('#cb-students-list input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  if (!tutorId)    { showToast('Please select a teacher.','warning'); return; }
  if (!classLink)  { showToast('Please enter a Google Meet link.','warning'); return; }
  if (!startDate)  { showToast('Please select a start date.','warning'); return; }
  if (!schedule.length) { showToast('Please add at least one schedule day.','warning'); return; }
  if (studentIds.length < 2) { showToast('Please select at least 2 students.','warning'); return; }
  if (studentIds.length > 3) { showToast('Maximum 3 students per batch.','warning'); return; }

  const btn = document.querySelector('#createBatchOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Creating…'; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch(`${API}/api/batches`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tutorId, pathwayId, gradeNumber: gradeNum, classLink, schedule, startDate, studentIds, notes }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Batch ${data.batchRef} created with ${data.bookingsCreated} classes!`);
      closeCreateBatchModal();
      loadBatches();
    } else {
      showToast('Error: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '👥 Create Batch'; }
  }
}

/* ─── Batch Reschedule Modal ─── */
let _batchRescheduleId = null;

function openBatchRescheduleModal(batchId, batchRef) {
  _batchRescheduleId = batchId;
  const titleEl = document.getElementById('batchRescheduleTitle');
  if (titleEl) titleEl.textContent = `🔄 Reschedule Batch ${batchRef}`;

  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('br-start-date');
  if (dateEl) dateEl.value = today;

  // Reset schedule rows
  const rowsEl = document.getElementById('br-schedule-rows');
  if (rowsEl) rowsEl.innerHTML = '';
  addBRScheduleRow();

  document.getElementById('batchRescheduleOverlay').classList.add('open');
}

function closeBatchRescheduleModal() {
  document.getElementById('batchRescheduleOverlay').classList.remove('open');
}

function addBatchRescheduleRow() { addBRScheduleRow(); }
function addBRScheduleRow() { addRSScheduleRow('br-schedule-rows'); }

async function confirmBatchReschedule() {
  const startDate = document.getElementById('br-start-date')?.value;
  const classLink = document.getElementById('br-class-link')?.value || undefined;
  const schedule  = collectScheduleRows('br-schedule-rows');

  if (!startDate)       { showToast('Please select a start date.','warning'); return; }
  if (!schedule.length) { showToast('Please add at least one schedule day.','warning'); return; }

  const btn = document.getElementById('brConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Rescheduling…'; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const body = { startDate, schedule };
    if (classLink) body.classLink = classLink;

    const res  = await fetch(`${API}/api/batches/${_batchRescheduleId}/reschedule`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Batch rescheduled: ${data.cancelled} cancelled, ${data.created} recreated.`);
      closeBatchRescheduleModal();
      loadBatches();
    } else {
      showToast('Error: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Confirm Reschedule'; }
  }
}

/* ─── Batch Transfer Modal (stub — handled by batchTransferOverlay in HTML) ─── */
function openBatchTransfer(batchId, batchRef) {
  _batchTransferBatchId = batchId;
  const info = document.getElementById('batchTransferInfo');
  if (info) info.textContent = `Transferring batch: ${batchRef}`;

  const tutorSel = document.getElementById('batchTransferTutor');
  if (tutorSel) {
    tutorSel.innerHTML = '<option value="">— Keep current tutor —</option>';
    _allTutors.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name;
      tutorSel.appendChild(opt);
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('batchTransferDate');
  if (dateEl) dateEl.value = today;

  const rowsEl = document.getElementById('batchTransferScheduleRows');
  if (rowsEl) rowsEl.innerHTML = '';
  addBatchScheduleRow();

  document.getElementById('batchTransferOverlay').classList.add('open');
}

function closeBatchTransfer() {
  document.getElementById('batchTransferOverlay').classList.remove('open');
}

function addBatchScheduleRow() {
  addRSScheduleRow('batchTransferScheduleRows');
}

async function confirmBatchTransfer() {
  const newTutorId = document.getElementById('batchTransferTutor')?.value || undefined;
  const startDate  = document.getElementById('batchTransferDate')?.value;
  const classLink  = document.getElementById('batchTransferLink')?.value || undefined;
  const schedule   = collectScheduleRows('batchTransferScheduleRows');

  const errEl = document.getElementById('batchTransferError');
  if (errEl) errEl.style.display = 'none';

  if (!startDate)       { showToast('Please select a start date.','warning'); return; }
  if (!schedule.length) { showToast('Please add at least one schedule day.','warning'); return; }

  const btn = document.getElementById('batchTransferBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Transferring…'; }

  const token = localStorage.getItem('sn_access_token');
  try {
    const body = { startDate, schedule };
    if (newTutorId) body.newTutorId = newTutorId;
    if (classLink)  body.classLink  = classLink;

    const res  = await fetch(`${API}/api/batches/${_batchTransferBatchId}/reschedule`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Batch transferred: ${data.created} classes created.`);
      closeBatchTransfer();
      loadBatches();
    } else {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = data.error || 'Unknown error'; }
    }
  } catch (err) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = err.message; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Transfer ✦'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   UPDATE POS STATS (alias used by course-scheduler.js)
═══════════════════════════════════════════════════════════════ */
function updatePSStats() { updateStats(); }
function renderScheduled() { renderScheduledClasses(); }
