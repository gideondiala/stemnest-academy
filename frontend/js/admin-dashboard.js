
/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — ADMIN DASHBOARD JS
   Teacher registry, smart assign (subject + availability),
   add teacher form, bookings table, CSV export.
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   TEACHER REGISTRY (localStorage: sn_teachers)
══════════════════════════════════════════════════════ */
const SUBJECT_PREFIX = { Coding: 'CT', Maths: 'MT', Sciences: 'ST' };

const ALL_COURSES = {
  Coding:   ['Python for Beginners','Scratch & Game Design','Web Dev: HTML/CSS/JS','A-Level Computer Science','AI Literacy'],
  Maths:    ['Primary Maths Boost','GCSE Maths Prep','A-Level Maths Mastery'],
  Sciences: ['GCSE Biology','GCSE Chemistry','A-Level Physics'],
};

const ALL_GRADES = [
  'Year 2–3','Year 4–6','Year 7–9','Year 10–11','Year 12–13',
  'Grade 1–3','Grade 4–6','Grade 7–9','Grade 10–12',
];

const TUTOR_COLORS = [
  'linear-gradient(135deg,var(--blue),#4f87f5)',
  'linear-gradient(135deg,var(--green),#3dd9a4)',
  'linear-gradient(135deg,var(--orange),#ffaa80)',
  'linear-gradient(135deg,var(--purple),#a78bfa)',
  'linear-gradient(135deg,#0694a2,#67e8f9)',
  'linear-gradient(135deg,#e63387,#f9a8d4)',
];

function getTeachers() {
  try {
    const stored = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
    // Seed default teachers if empty
    if (stored.length === 0) {
      const defaults = [
        { id:'CT001', name:'Sarah Rahman',  initials:'SR', subject:'Coding',   email:'sarah.rahman@stemnest.co.uk',  phone:'+44 7700 111001', password:'StemNest2024!', courses:['Python for Beginners','Scratch & Game Design','Web Dev: HTML/CSS/JS'], gradeGroups:['Year 7–9','Year 10–11'], bio:'Former software engineer turned educator. 6+ years helping young people fall in love with coding.', availability:'Mon–Fri, 9am–6pm', dbs:'yes', color:TUTOR_COLORS[0], photo:null },
        { id:'MT001', name:'James Okafor',  initials:'JO', subject:'Maths',    email:'james.okafor@stemnest.co.uk',  phone:'+44 7700 111002', password:'StemNest2024!', courses:['Primary Maths Boost','GCSE Maths Prep','A-Level Maths Mastery'],         gradeGroups:['Year 7–9','Year 10–11','Year 12–13'], bio:'PGCE-qualified Maths specialist. Helped 150+ students achieve their target GCSE and A-Level grades.', availability:'Mon–Sat, 10am–7pm', dbs:'yes', color:TUTOR_COLORS[1], photo:null },
        { id:'ST001', name:'Lisa Patel',    initials:'LP', subject:'Sciences', email:'lisa.patel@stemnest.co.uk',    phone:'+44 7700 111003', password:'StemNest2024!', courses:['GCSE Biology','GCSE Chemistry','A-Level Physics'],                         gradeGroups:['Year 10–11','Year 12–13'], bio:'Biology & Chemistry graduate from UCL with a talent for making complex science click.', availability:'Tue–Sat, 11am–6pm', dbs:'yes', color:TUTOR_COLORS[2], photo:null },
        { id:'CT002', name:'Marcus King',   initials:'MK', subject:'Coding',   email:'marcus.king@stemnest.co.uk',   phone:'+44 7700 111004', password:'StemNest2024!', courses:['Python for Beginners','AI Literacy','A-Level Computer Science'],           gradeGroups:['Year 10–11','Year 12–13'], bio:'Tech innovator passionate about preparing the next generation for an AI-first world.', availability:'Mon–Fri, 2pm–9pm', dbs:'yes', color:TUTOR_COLORS[3], photo:null },
      ];
      localStorage.setItem('sn_teachers', JSON.stringify(defaults));
      return defaults;
    }
    return stored;
  } catch { return []; }
}

function saveTeachers(list) {
  localStorage.setItem('sn_teachers', JSON.stringify(list));
}

function nextTeacherId(subject) {
  const prefix  = SUBJECT_PREFIX[subject] || 'TT';
  const teachers = getTeachers();
  const existing = teachers.filter(t => t.id.startsWith(prefix)).map(t => parseInt(t.id.slice(2)) || 0);
  const next     = existing.length ? Math.max(...existing) + 1 : 1;
  return prefix + String(next).padStart(3, '0');
}

/* ══════════════════════════════════════════════════════
   AVAILABILITY HELPERS
══════════════════════════════════════════════════════ */
function getTeacherAvailability(teacherId) {
  try {
    const shared = JSON.parse(localStorage.getItem('sn_all_tutor_avail') || '{}');
    return shared[teacherId]?.slots || {};
  } catch { return {}; }
}

function getAvailableSlotsForDate(teacherId, dateStr) {
  const avail = getTeacherAvailability(teacherId);
  return Object.keys(avail).filter(k => k.startsWith(dateStr + '|')).map(k => k.split('|')[1]);
}

function isTeacherAvailableAt(teacherId, dateStr, timeStr) {
  const avail = getTeacherAvailability(teacherId);
  return !!avail[dateStr + '|' + timeStr];
}

/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
let allBookings      = [];
let filteredBookings = [];
let activeAssignId   = null;
const ADMIN_TABS     = ['bookings','scheduled','completed','tutors','add-teacher'];

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  setAdminDate();
  loadBookings();
  renderTutors();
  buildAddTeacherForm();
  bindModalCloses();
  showAdminTab('bookings');
});

function setAdminDate() {
  const el = document.getElementById('adminDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

/* ── TAB SWITCHING ── */
function showAdminTab(tab) {
  ADMIN_TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tab);
  });
  if (tab === 'scheduled')   renderScheduledTab();
  if (tab === 'completed')   renderCompletedTab();
  if (tab === 'tutors')      renderTutors();
  if (tab === 'add-teacher') resetAddTeacherForm();
}

/* ══════════════════════════════════════════════════════
   BOOKINGS
══════════════════════════════════════════════════════ */
function loadBookings() {
  try { allBookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]'); }
  catch { allBookings = []; }
  filteredBookings = [...allBookings];
  updateStats();
  renderBookingsTable(filteredBookings);
}

function refreshBookings() { loadBookings(); showToast('✅ Bookings refreshed!'); }

function updateStats() {
  const teachers  = getTeachers();
  const today     = new Date().toISOString().split('T')[0];
  setText('statTotal',     allBookings.length);
  setText('statPending',   allBookings.filter(b => b.status === 'pending').length);
  setText('statScheduled', allBookings.filter(b => b.status === 'scheduled').length);
  setText('statTeachers',  teachers.length);
  setText('statNew',       allBookings.filter(b => b.bookedAt?.startsWith(today)).length + ' new today');
  setText('newBadge',      allBookings.filter(b => b.status === 'pending').length);
  setText('teacherBadge',  teachers.length);
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function renderBookingsTable(bookings) {
  const tbody = document.getElementById('bookingsBody');
  const empty = document.getElementById('adminEmpty');
  if (!tbody) return;
  if (bookings.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  tbody.innerHTML = bookings.map(b => `
    <tr>
      <td><span style="font-family:'Fredoka One',cursive;font-size:12px;color:var(--blue);">${b.id}</span></td>
      <td><strong>${b.studentName}</strong></td>
      <td>${b.age} yrs · ${b.grade}</td>
      <td><span class="ab-subject ab-${(b.subject||'').toLowerCase()}">${b.subject}</span></td>
      <td>${formatDate(b.date)}<br><span style="color:var(--light);font-size:12px;">${b.time}</span></td>
      <td style="font-size:12px;">${b.email}</td>
      <td style="font-size:12px;">${b.whatsapp}</td>
      <td>${b.device||'—'}</td>
      <td style="font-size:12px;">${formatDateTime(b.bookedAt)}</td>
      <td><span class="ab-status ab-${b.status}">${capitalise(b.status)}</span></td>
      <td>
        <button class="ab-btn ab-btn-view" onclick="viewBooking('${b.id}')">👁 View</button>
        ${b.status==='pending'   ? `<button class="ab-btn ab-btn-assign"   onclick="openAssignModal('${b.id}')">👩‍🏫 Assign</button>` : ''}
        ${b.status==='scheduled' ? `<button class="ab-btn ab-btn-complete" onclick="markComplete('${b.id}')">✅ Done</button>` : ''}
      </td>
    </tr>`).join('');
}

function filterBookings() {
  const q       = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const subject = document.getElementById('filterSubject')?.value || '';
  const status  = document.getElementById('filterStatus')?.value  || '';
  filteredBookings = allBookings.filter(b => {
    const matchQ = !q || b.studentName?.toLowerCase().includes(q) || b.email?.toLowerCase().includes(q) || b.whatsapp?.includes(q) || b.id?.toLowerCase().includes(q);
    return matchQ && (!subject || b.subject===subject) && (!status || b.status===status);
  });
  renderBookingsTable(filteredBookings);
}

function renderScheduledTab() {
  const tbody = document.getElementById('scheduledBody');
  if (!tbody) return;
  const list = allBookings.filter(b => b.status==='scheduled');
  if (!list.length) { tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--light);">No scheduled classes yet.</td></tr>'; return; }
  tbody.innerHTML = list.map(b => `
    <tr>
      <td><strong>${b.studentName}</strong></td>
      <td><span class="ab-subject ab-${(b.subject||'').toLowerCase()}">${b.subject}</span></td>
      <td>${formatDate(b.date)} · ${b.time}</td>
      <td>${b.assignedTutor||'—'}</td>
      <td style="font-size:12px;">${b.email}</td>
      <td style="font-size:12px;">${b.whatsapp}</td>
      <td>${b.classLink ? `<a href="${b.classLink}" target="_blank" style="color:var(--blue);font-weight:700;font-size:12px;">Join →</a>` : '—'}</td>
      <td><button class="ab-btn ab-btn-complete" onclick="markComplete('${b.id}')">✅ Done</button></td>
    </tr>`).join('');
}

function renderCompletedTab() {
  const tbody = document.getElementById('completedBody');
  if (!tbody) return;
  const list = allBookings.filter(b => b.status==='completed');
  if (!list.length) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--light);">No completed classes yet.</td></tr>'; return; }
  tbody.innerHTML = list.map(b => `
    <tr>
      <td><strong>${b.studentName}</strong></td>
      <td><span class="ab-subject ab-${(b.subject||'').toLowerCase()}">${b.subject}</span></td>
      <td>${formatDate(b.date)} · ${b.time}</td>
      <td>${b.assignedTutor||'—'}</td>
      <td style="font-size:12px;">${b.email}</td>
      <td style="font-size:12px;">${b.whatsapp}</td>
    </tr>`).join('');
}

/* ── VIEW BOOKING ── */
function viewBooking(id) {
  const b = allBookings.find(x => x.id===id);
  if (!b) return;
  document.getElementById('detailModalBody').innerHTML = [
    ['Booking ID',b.id],['Student',b.studentName],['Age',b.age+' yrs'],['Grade',b.grade],
    ['Subject',b.subject],['Date',formatDate(b.date)],['Time',b.time],['Timezone',b.timezone],
    ['Parent Email',b.email],['WhatsApp',b.whatsapp],['Parent Name',b.parentName||'—'],
    ['Device',b.device||'—'],['Status',capitalise(b.status)],
    ['Tutor Assigned',b.assignedTutor||'Not yet assigned'],
    ['Class Link',b.classLink?`<a href="${b.classLink}" target="_blank">${b.classLink}</a>`:'Not set'],
    ['Booked At',formatDateTime(b.bookedAt)],
  ].map(([l,v])=>`<div class="detail-row"><div class="detail-label">${l}</div><div class="detail-val">${v}</div></div>`).join('');
  document.getElementById('detailModalOverlay').classList.add('open');
}
function closeDetailModal() { document.getElementById('detailModalOverlay').classList.remove('open'); }

/* ── MARK COMPLETE ── */
function markComplete(id) {
  updateBooking(id, { status:'completed' });
  loadBookings();
  showToast('✅ Class marked as completed!');
}

function updateBooking(id, changes) {
  const all = JSON.parse(localStorage.getItem('sn_bookings')||'[]');
  const idx = all.findIndex(b=>b.id===id);
  if (idx!==-1) { all[idx]={...all[idx],...changes}; localStorage.setItem('sn_bookings',JSON.stringify(all)); }
}

/* ══════════════════════════════════════════════════════
   SMART ASSIGN MODAL
   Filters teachers by subject + checks availability slots
══════════════════════════════════════════════════════ */
function openAssignModal(id) {
  activeAssignId = id;
  const b = allBookings.find(x => x.id===id);
  if (!b) return;

  document.getElementById('assignBookingInfo').innerHTML = `
    🎓 <strong>${b.studentName}</strong> (${b.grade}, Age ${b.age})<br>
    📚 <strong>${b.subject}</strong> &nbsp;·&nbsp; 📅 ${formatDate(b.date)} at ${b.time}<br>
    📧 ${b.email} &nbsp;·&nbsp; 📱 ${b.whatsapp}`;

  // Filter teachers by subject
  const teachers = getTeachers().filter(t => t.subject === b.subject);

  // Build availability-aware teacher cards
  const cardsEl = document.getElementById('availTeacherCards');
  if (cardsEl) {
    if (teachers.length === 0) {
      cardsEl.innerHTML = `<div style="color:var(--light);font-size:13px;font-weight:700;padding:12px;">No ${b.subject} teachers found. <a onclick="showAdminTab('add-teacher')" style="color:var(--blue);cursor:pointer;">Add one →</a></div>`;
    } else {
      cardsEl.innerHTML = teachers.map(t => {
        const slots    = getAvailableSlotsForDate(t.id, b.date);
        const isAvail  = isTeacherAvailableAt(t.id, b.date, b.time);
        const slotText = slots.length ? slots.slice(0,4).join(', ') + (slots.length>4?'…':'') : 'No slots set';
        return `
          <div class="assign-teacher-card ${isAvail ? 'atc-available' : ''}" onclick="selectAssignTeacher('${t.id}')">
            <div class="atc-av" style="background:${t.color||TUTOR_COLORS[0]}">${t.photo ? `<img src="${t.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : t.initials}</div>
            <div class="atc-info">
              <div class="atc-name">${t.name} <span class="atc-id">${t.id}</span></div>
              <div class="atc-subject">${t.subject} · ${t.availability||'—'}</div>
              <div class="atc-slots ${isAvail?'atc-slots-avail':''}">
                ${isAvail ? '✅ Available at ' + b.time : '⚠️ Available: ' + slotText}
              </div>
            </div>
            ${isAvail ? '<div class="atc-badge">Available</div>' : ''}
          </div>`;
      }).join('');
    }
  }

  // Populate select — sort available first
  const sel = document.getElementById('assignTutorSelect');
  const sorted = [...teachers].sort((a,b_) => {
    const aAvail = isTeacherAvailableAt(a.id, b.date, b.time) ? 0 : 1;
    const bAvail = isTeacherAvailableAt(b_.id, b.date, b.time) ? 0 : 1;
    return aAvail - bAvail;
  });
  sel.innerHTML = sorted.map(t => {
    const avail = isTeacherAvailableAt(t.id, b.date, b.time);
    return `<option value="${t.id}">${avail ? '✅ ' : '⚠️ '} ${t.name} (${t.id}) — ${t.subject}</option>`;
  }).join('');

  document.getElementById('assignClassLink').value = '';
  document.getElementById('assignNotes').value = '';
  document.getElementById('assignModalOverlay').classList.add('open');
}

function selectAssignTeacher(id) {
  const sel = document.getElementById('assignTutorSelect');
  if (sel) sel.value = id;
  // Highlight selected card
  document.querySelectorAll('.assign-teacher-card').forEach(c => {
    c.classList.toggle('atc-selected', c.getAttribute('onclick')?.includes(id));
  });
}

function closeAssignModal() {
  document.getElementById('assignModalOverlay').classList.remove('open');
  activeAssignId = null;
}

function confirmAssign() {
  const tutorId   = document.getElementById('assignTutorSelect').value;
  const classLink = document.getElementById('assignClassLink').value.trim();
  const notes     = document.getElementById('assignNotes').value.trim();
  if (!tutorId)   { showToast('Please select a teacher.', 'error'); return; }
  if (!classLink) { showToast('Please enter the class link (Google Meet / Zoom).', 'error'); return; }

  const teacher = getTeachers().find(t => t.id===tutorId);
  const booking = allBookings.find(b => b.id===activeAssignId);

  updateBooking(activeAssignId, {
    status:          'scheduled',
    assignedTutor:   teacher?.name || '—',
    assignedTutorId: tutorId,
    classLink,
    notes,
    tutorNotified:   false, // teacher dashboard will pick this up
  });

  // Simulate email notification to teacher
  simulateTeacherNotification(teacher, booking, classLink);

  closeAssignModal();
  loadBookings();
  showToast(`✅ ${teacher?.name} assigned and notified!`);
}

function simulateTeacherNotification(teacher, booking, classLink) {
  if (!teacher || !booking) return;
  const msg = `
📧 EMAIL TO: ${teacher.email}
Subject: New Class Assigned — ${booking.subject} with ${booking.studentName}

Hi ${teacher.name.split(' ')[0]},

You have been assigned a new demo class:

🎓 Student:  ${booking.studentName} (${booking.grade}, Age ${booking.age})
📚 Subject:  ${booking.subject}
📅 Date:     ${formatDate(booking.date)}
🕐 Time:     ${booking.time}
🔗 Class Link: ${classLink}

Please log in to your dashboard to view full details.
Dashboard: ${window.location.origin}/frontend/pages/tutor-dashboard.html

StemNest Academy
  `;
  console.log(msg);
}

/* ══════════════════════════════════════════════════════
   TEACHERS TAB
══════════════════════════════════════════════════════ */
function renderTutors() {
  const grid = document.getElementById('tutorGrid');
  if (!grid) return;
  const teachers = getTeachers();
  if (teachers.length === 0) {
    grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No teachers yet. <a onclick="showAdminTab('add-teacher')" style="color:var(--blue);cursor:pointer;">Add the first one →</a></div>`;
    return;
  }
  grid.innerHTML = teachers.map(t => {
    const avail  = getTeacherAvailability(t.id);
    const slotCount = Object.keys(avail).length;
    return `
      <div class="tutor-card">
        <div class="tutor-card-av" style="background:${t.color||TUTOR_COLORS[0]}">
          ${t.photo ? `<img src="${t.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="${t.name}">` : t.initials}
        </div>
        <div class="tutor-card-id">${t.id}</div>
        <div class="tutor-card-name">${t.name}</div>
        <div class="tutor-card-subject">${t.subject}</div>
        <div class="tutor-card-avail">🕐 ${t.availability||'—'}</div>
        <div class="tutor-card-avail" style="color:${slotCount>0?'var(--green)':'var(--light)'}">
          📅 ${slotCount} availability slot${slotCount!==1?'s':''} set
        </div>
        <div class="tutor-card-tags">${(t.courses||[]).slice(0,3).map(c=>`<span class="tutor-card-tag">${c}</span>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">
          <button class="ab-btn ab-btn-view" onclick="viewTeacher('${t.id}')">👁 View</button>
          <button class="ab-btn" style="background:var(--orange-light);color:var(--orange-dark);" onclick="deleteTeacher('${t.id}')">🗑 Remove</button>
        </div>
      </div>`;
  }).join('');
}

function viewTeacher(id) {
  const t = getTeachers().find(x => x.id===id);
  if (!t) return;
  const avail = getTeacherAvailability(id);
  document.getElementById('teacherDetailBody').innerHTML = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="width:80px;height:80px;border-radius:50%;background:${t.color||TUTOR_COLORS[0]};display:flex;align-items:center;justify-content:center;font-family:'Fredoka One',cursive;font-size:28px;color:#fff;margin:0 auto 12px;overflow:hidden;">
        ${t.photo ? `<img src="${t.photo}" style="width:100%;height:100%;object-fit:cover;">` : t.initials}
      </div>
      <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--dark);">${t.name}</div>
      <div style="font-size:12px;font-weight:900;color:var(--blue);margin-top:4px;">${t.id}</div>
    </div>
    ${[
      ['Subject',    t.subject],
      ['Email',      t.email],
      ['Phone',      t.phone||'—'],
      ['Availability',t.availability||'—'],
      ['DBS',        t.dbs==='yes'?'✅ Verified':t.dbs==='pending'?'⏳ Pending':'❌ Not yet'],
      ['Courses',    (t.courses||[]).join(', ')||'—'],
      ['Grade Groups',(t.gradeGroups||[]).join(', ')||'—'],
      ['Bio',        t.bio||'—'],
      ['Avail Slots', Object.keys(avail).length + ' slots set'],
    ].map(([l,v])=>`<div class="detail-row"><div class="detail-label">${l}</div><div class="detail-val">${v}</div></div>`).join('')}`;
  document.getElementById('teacherDetailOverlay').classList.add('open');
}
function closeTeacherDetail() { document.getElementById('teacherDetailOverlay').classList.remove('open'); }

function deleteTeacher(id) {
  const t = getTeachers().find(x => x.id===id);
  if (!t) return;
  if (!confirm(`Remove ${t.name} (${t.id}) from the platform? This cannot be undone.`)) return;
  const updated = getTeachers().filter(x => x.id!==id);
  saveTeachers(updated);
  renderTutors();
  updateStats();
  showToast(`${t.name} removed.`);
}

/* ══════════════════════════════════════════════════════
   ADD TEACHER FORM
══════════════════════════════════════════════════════ */
function buildAddTeacherForm() {
  // Courses checkboxes
  const cg = document.getElementById('atCoursesGrid');
  if (cg) {
    cg.innerHTML = Object.entries(ALL_COURSES).map(([subj, courses]) =>
      courses.map(c => `
        <label class="atf-check-opt">
          <input type="checkbox" name="at-course" value="${c}" data-subject="${subj}">
          <span>${c}</span>
        </label>`).join('')
    ).join('');
  }
  // Grade checkboxes
  const gg = document.getElementById('atGradesGrid');
  if (gg) {
    gg.innerHTML = ALL_GRADES.map(g => `
      <label class="atf-check-opt">
        <input type="checkbox" name="at-grade" value="${g}">
        <span>${g}</span>
      </label>`).join('');
  }
}

function updateTeacherId() {
  const subject = document.getElementById('at-subject')?.value;
  const idEl    = document.getElementById('at-id');
  if (idEl && subject) idEl.value = nextTeacherId(subject);
  else if (idEl) idEl.value = '';
}

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  const pw    = 'SN' + Array.from({length:8}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  const el    = document.getElementById('at-password');
  if (el) el.value = pw;
}

function resetAddTeacherForm() {
  ['at-name','at-email','at-phone','at-password','at-bio','at-id'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const subj = document.getElementById('at-subject'); if (subj) subj.value = '';
  document.querySelectorAll('input[name="at-course"], input[name="at-grade"]').forEach(cb => cb.checked = false);
}

function saveNewTeacher() {
  const name     = document.getElementById('at-name')?.value.trim();
  const email    = document.getElementById('at-email')?.value.trim();
  const password = document.getElementById('at-password')?.value.trim();
  const subject  = document.getElementById('at-subject')?.value;
  const phone    = document.getElementById('at-phone')?.value.trim();
  const bio      = document.getElementById('at-bio')?.value.trim();
  const avail    = document.getElementById('at-availability')?.value;
  const dbs      = document.getElementById('at-dbs')?.value;

  if (!name)     { showToast('Please enter the teacher\'s name.', 'error'); return; }
  if (!email)    { showToast('Please enter the teacher\'s email.', 'error'); return; }
  if (!password) { showToast('Please set a default password.', 'error'); return; }
  if (!subject)  { showToast('Please select a primary subject.', 'error'); return; }

  const courses     = [...document.querySelectorAll('input[name="at-course"]:checked')].map(c => c.value);
  const gradeGroups = [...document.querySelectorAll('input[name="at-grade"]:checked')].map(c => c.value);

  if (courses.length === 0)     { showToast('Please select at least one course.', 'error'); return; }
  if (gradeGroups.length === 0) { showToast('Please select at least one grade group.', 'error'); return; }

  // Check duplicate email
  const existing = getTeachers();
  if (existing.some(t => t.email.toLowerCase() === email.toLowerCase())) {
    showToast('A teacher with this email already exists.', 'error'); return;
  }

  const id       = nextTeacherId(subject);
  const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const colorIdx = existing.length % TUTOR_COLORS.length;

  const newTeacher = {
    id, name, initials, email, password, phone, subject, bio,
    courses, gradeGroups,
    availability: avail,
    dbs,
    color: TUTOR_COLORS[colorIdx],
    photo: null,
    createdAt: new Date().toISOString(),
  };

  existing.push(newTeacher);
  saveTeachers(existing);
  updateStats();

  // Simulate welcome email
  console.log(`📧 WELCOME EMAIL TO: ${email}
Subject: Welcome to StemNest Academy — Your Account is Ready!

Hi ${name.split(' ')[0]},

Your StemNest Academy teacher account has been created.

🆔 Teacher ID: ${id}
📧 Email: ${email}
🔑 Temporary Password: ${password}

Please log in and change your password on first login.
Dashboard: ${window.location.origin}/frontend/pages/tutor-dashboard.html

Welcome to the team!
StemNest Academy`);

  showToast(`✅ ${name} (${id}) added successfully! Welcome email sent.`);
  resetAddTeacherForm();
  showAdminTab('tutors');
}

/* ══════════════════════════════════════════════════════
   EXPORT CSV
══════════════════════════════════════════════════════ */
function exportCSV() {
  if (!allBookings.length) { showToast('No bookings to export.', 'error'); return; }
  const headers = ['ID','Student','Age','Grade','Subject','Date','Time','Timezone','Email','WhatsApp','Parent Name','Device','Status','Tutor','Booked At'];
  const rows = allBookings.map(b => [
    b.id,b.studentName,b.age,b.grade,b.subject,b.date,b.time,b.timezone,
    b.email,b.whatsapp,b.parentName,b.device,b.status,b.assignedTutor||'',formatDateTime(b.bookedAt),
  ].map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(','));
  const csv  = [headers.join(','),...rows].join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`stemnest-bookings-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✅ CSV exported!');
}

/* ══════════════════════════════════════════════════════
   MODAL BINDINGS & HELPERS
══════════════════════════════════════════════════════ */
function bindModalCloses() {
  ['assignModalOverlay','detailModalOverlay','teacherDetailOverlay'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('click', e => {
      if (e.target !== el) return;
      if (id==='assignModalOverlay') closeAssignModal();
      else if (id==='detailModalOverlay') closeDetailModal();
      else closeTeacherDetail();
    });
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}); }
  catch { return dateStr; }
}
function formatDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  catch { return iso; }
}
function capitalise(str) { return str ? str.charAt(0).toUpperCase()+str.slice(1) : '—'; }
