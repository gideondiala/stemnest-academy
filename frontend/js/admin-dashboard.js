
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
const ADMIN_TABS     = ['bookings','scheduled','completed','tutors','add-teacher','courses','add-course'];

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  setAdminDate();
  loadBookings();
  renderTutors();
  buildAddTeacherForm();
  bindModalCloses();
  // Seed courses if needed
  getAdminCourses();
  showAdminTab('bookings');
  // Sync bookings from API in background
  _syncBookingsFromAPI();
});

/* ── Sync bookings from real API into localStorage ── */
async function _syncBookingsFromAPI() {
  try {
    const online = await isApiAvailable();
    if (!online) return;
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;
    const data = await Bookings.list({ limit: 200 });
    if (!data.success || !data.bookings) return;

    // Merge API bookings into localStorage
    const local = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    const localIds = new Set(local.map(b => b.id));

    data.bookings.forEach(b => {
      // Normalise API booking to match localStorage shape
      const normalised = {
        id:              b.id,
        studentName:     b.student_name || b.notes?.studentName || '—',
        age:             b.notes?.age || '—',
        grade:           b.grade || b.notes?.grade || '—',
        email:           b.student_email || b.notes?.email || '—',
        whatsapp:        b.student_phone || b.notes?.whatsapp || '—',
        subject:         b.subject,
        status:          b.status,
        date:            b.date,
        time:            b.time,
        assignedTutor:   b.tutor_name || '',
        assignedTutorId: b.tutor_id || '',
        classLink:       b.class_link || '',
        bookedAt:        b.booked_at || b.scheduled_at,
        scheduledAt:     b.scheduled_at,
        _fromAPI:        true,
      };

      if (!localIds.has(b.id)) {
        local.unshift(normalised);
      } else {
        // Update existing
        const idx = local.findIndex(x => x.id === b.id);
        if (idx !== -1) local[idx] = { ...local[idx], ...normalised };
      }
    });

    localStorage.setItem('sn_bookings', JSON.stringify(local));
    loadBookings(); // refresh the table
  } catch (e) { /* silent */ }
}
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
  if (tab === 'courses')     renderCoursesTable();
  if (tab === 'add-course')  buildCourseForm();
}

/* ══════════════════════════════════════════════════════
   BOOKINGS
══════════════════════════════════════════════════════ */
async function loadBookings() {
  try {
    /* Try real API first */
    if (typeof isApiAvailable === 'function' && await isApiAvailable()) {
      const data = await Bookings.list({ limit: 500 });
      /* Merge API bookings with localStorage (keep both in sync) */
      const apiBookings = (data.bookings || []).map(b => ({
        id:              b.id,
        studentName:     b.student_name || b.notes?.studentName || '—',
        age:             b.notes?.age   || b.grade || '—',
        grade:           b.grade        || b.notes?.grade || '—',
        email:           b.student_email || b.notes?.email || '—',
        whatsapp:        b.notes?.whatsapp || '—',
        subject:         b.subject,
        date:            b.date,
        time:            b.time,
        status:          b.status,
        assignedTutor:   b.tutor_name   || '—',
        assignedTutorId: b.tutor_id,
        classLink:       b.class_link   || '',
        bookedAt:        b.booked_at    || b.created_at,
        isDemoClass:     b.is_demo,
        _fromApi:        true,
      }));
      /* Also keep any localStorage-only bookings not yet in DB */
      const localBookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
      const apiIds = new Set(apiBookings.map(b => b.id));
      const localOnly = localBookings.filter(b => !apiIds.has(b.id) && !b._fromApi);
      allBookings = [...apiBookings, ...localOnly];
    } else {
      allBookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    }
  } catch {
    allBookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  }
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
  setText('statCourses',   getAdminCourses().length);
  setText('statNew',       allBookings.filter(b => b.bookedAt?.startsWith(today)).length + ' new today');
  setText('newBadge',      allBookings.filter(b => b.status === 'pending').length);
  setText('teacherBadge',  teachers.length);
  setText('courseBadge',   getAdminCourses().length);
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
      <td style="font-size:12px;">
        ${b.whatsapp && b.whatsapp !== '—'
          ? `<a href="https://wa.me/${b.whatsapp.replace(/[\s\-\(\)\+]/g,'')}" target="_blank"
              style="color:#25D366;font-weight:800;font-size:12px;text-decoration:none;">
              📱 ${b.whatsapp}
            </a>`
          : b.whatsapp || '—'}
      </td>
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
  ['at-name','at-email','at-phone','at-password','at-bio','at-id','at-dob'].forEach(id => {
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

  // Save DOB if provided (Phase 6)
  const dob = document.getElementById('at-dob')?.value;
  if (dob) localStorage.setItem('sn_dob_' + id, dob);

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

/* ══════════════════════════════════════════════════════
   COURSE MANAGEMENT (Admin only)
══════════════════════════════════════════════════════ */

const COURSE_EMOJIS = ['💻','📐','🔬','⚗️','🧬','🧪','🤖','🧠','📊','📡','🎮','🌍','🏗️','✏️','📱','🛰️','🔭','🧲','💡','🖥️'];
const COURSE_COLORS = [
  { id:'blue',   hex:'#1a56db', label:'Blue'   },
  { id:'green',  hex:'#0e9f6e', label:'Green'  },
  { id:'orange', hex:'#ff6b35', label:'Orange' },
  { id:'purple', hex:'#7c3aed', label:'Purple' },
  { id:'teal',   hex:'#0694a2', label:'Teal'   },
  { id:'pink',   hex:'#e63387', label:'Pink'   },
];

let acSelectedEmoji = '💻';
let acSelectedColor = 'blue';
let editingCourseId = null; // null = adding new, string = editing existing

/* ── Helpers ── */
function getAdminCourses() {
  try {
    const stored = JSON.parse(localStorage.getItem('sn_courses') || '[]');
    if (stored.length === 0) {
      // Seed defaults from courses.js DEFAULT_COURSES equivalent
      const defaults = [
        { id:'CRS001', name:'Python for Beginners',    desc:'Learn to code from scratch with Python — variables, loops, functions and your first real programs.',                subject:'coding',   age:'Ages 10–14', price:99,  classes:24, rating:4.9, students:312, emoji:'💻', color:'blue',   badge:'popular', level:'Beginner',     duration:'6 months' },
        { id:'CRS002', name:'Scratch & Game Design',   desc:'Build fun interactive games using Scratch. Perfect intro to computational thinking.',                              subject:'coding',   age:'Ages 7–10',  price:79,  classes:16, rating:4.8, students:245, emoji:'🎮', color:'purple', badge:'',        level:'Beginner',     duration:'4 months' },
        { id:'CRS003', name:'Web Dev: HTML, CSS & JS', desc:'Design and build real websites from zero. HTML structure, CSS styling and JavaScript interactivity.',               subject:'coding',   age:'Ages 13–19', price:129, classes:32, rating:4.9, students:178, emoji:'📱', color:'blue',   badge:'new',     level:'Intermediate', duration:'8 months' },
        { id:'CRS004', name:'GCSE Maths Prep',         desc:'Targeted support aligned to the GCSE syllabus. Master number, algebra, geometry and statistics.',                  subject:'maths',    age:'Ages 14–16', price:109, classes:28, rating:4.9, students:401, emoji:'📐', color:'green',  badge:'popular', level:'Intermediate', duration:'7 months' },
        { id:'CRS005', name:'Primary Maths Boost',     desc:'Build strong foundations in numbers, fractions, times tables and problem solving for KS2 learners.',               subject:'maths',    age:'Ages 7–11',  price:79,  classes:20, rating:4.8, students:293, emoji:'📊', color:'teal',   badge:'',        level:'Beginner',     duration:'5 months' },
        { id:'CRS006', name:'A-Level Maths Mastery',   desc:'Deep-dive into pure maths, statistics and mechanics for A-Level students aiming for top grades.',                  subject:'maths',    age:'Ages 16–19', price:149, classes:40, rating:4.9, students:134, emoji:'🧠', color:'green',  badge:'',        level:'Advanced',     duration:'10 months' },
        { id:'CRS007', name:'GCSE Biology',            desc:'Cells, genetics, ecosystems and the human body — expert-led sessions covering the full GCSE spec.',                subject:'sciences', age:'Ages 14–16', price:109, classes:28, rating:4.7, students:221, emoji:'🧬', color:'orange', badge:'',        level:'Intermediate', duration:'7 months' },
        { id:'CRS008', name:'GCSE Chemistry',          desc:'From atomic structure to organic chemistry — build exam confidence with a specialist chemistry tutor.',             subject:'sciences', age:'Ages 14–16', price:109, classes:28, rating:4.8, students:198, emoji:'⚗️', color:'orange', badge:'',        level:'Intermediate', duration:'7 months' },
        { id:'CRS009', name:'A-Level Physics',         desc:'Mechanics, waves, electricity and modern physics — for students pushing for top university offers.',                subject:'sciences', age:'Ages 16–19', price:149, classes:40, rating:4.9, students:97,  emoji:'🛰️', color:'teal',   badge:'new',     level:'Advanced',     duration:'10 months' },
      ];
      localStorage.setItem('sn_courses', JSON.stringify(defaults));
      return defaults;
    }
    return stored;
  } catch { return []; }
}

function saveAdminCourses(list) {
  localStorage.setItem('sn_courses', JSON.stringify(list));
}

function nextCourseId() {
  const courses = getAdminCourses();
  const nums    = courses.map(c => parseInt(c.id.replace('CRS','')) || 0);
  const next    = nums.length ? Math.max(...nums) + 1 : 1;
  return 'CRS' + String(next).padStart(3, '0');
}

/* ── Render courses table ── */
function renderCoursesTable() {
  const tbody = document.getElementById('coursesTableBody');
  if (!tbody) return;
  const courses = getAdminCourses();
  setText('statCourses', courses.length);
  setText('courseBadge', courses.length);

  if (courses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--light);">No courses yet. Add the first one!</td></tr>';
    return;
  }

  const subjectLabel = { coding:'💻 Coding', maths:'📐 Maths', sciences:'🔬 Sciences' };
  const badgeLabel   = { popular:'🔥 Popular', new:'✨ New', '':'—' };
  const levelColor   = { Beginner:'var(--green)', Intermediate:'var(--orange)', Advanced:'var(--blue)' };

  tbody.innerHTML = courses.map(c => `
    <tr>
      <td><span style="font-family:'Fredoka One',cursive;font-size:12px;color:var(--blue);">${c.id}</span></td>
      <td><strong>${c.emoji} ${c.name}</strong></td>
      <td><span class="ab-subject ab-${c.subject}">${subjectLabel[c.subject] || c.subject}</span></td>
      <td><span style="font-size:12px;font-weight:800;color:${levelColor[c.level]||'var(--mid)'};">${c.level||'—'}</span></td>
      <td style="font-size:12px;">${c.age}</td>
      <td><strong>£${c.price}</strong></td>
      <td>${c.classes}</td>
      <td>${(c.students||0).toLocaleString()}</td>
      <td>
        <span style="color:#f59e0b;">★</span>
        <strong>${c.rating}</strong>
      </td>
      <td style="font-size:12px;">${c.duration||'—'}</td>
      <td>${badgeLabel[c.badge||'']}</td>
      <td>
        <button class="ab-btn ab-btn-assign" onclick="editCourse('${c.id}')">✏️ Edit</button>
        <button class="ab-btn" style="background:var(--orange-light);color:var(--orange-dark);" onclick="deleteCourse('${c.id}')">🗑 Delete</button>
      </td>
    </tr>`).join('');
}

/* ── Build emoji + colour pickers ── */
function buildCourseForm() {
  const eg = document.getElementById('acEmojiGrid');
  if (eg) {
    eg.innerHTML = COURSE_EMOJIS.map(em => `
      <button type="button" class="ac-emoji-btn ${em === acSelectedEmoji ? 'selected' : ''}"
              onclick="selectCourseEmoji(this,'${em}')">${em}</button>`).join('');
  }
  const cg = document.getElementById('acColorGrid');
  if (cg) {
    cg.innerHTML = COURSE_COLORS.map(co => `
      <div class="ac-color-swatch ${co.id === acSelectedColor ? 'selected' : ''}"
           style="background:${co.hex};" title="${co.label}"
           onclick="selectCourseColor(this,'${co.id}')"></div>`).join('');
  }
  // Set auto-generated ID
  if (!editingCourseId) {
    const idEl = document.getElementById('ac-id');
    if (idEl) idEl.value = nextCourseId();
  }
  // Build lesson rows
  renderLessonRows();
}

function selectCourseEmoji(btn, emoji) {
  acSelectedEmoji = emoji;
  document.querySelectorAll('.ac-emoji-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}
function selectCourseColor(swatch, colorId) {
  acSelectedColor = colorId;
  document.querySelectorAll('.ac-color-swatch').forEach(s => s.classList.remove('selected'));
  swatch.classList.add('selected');
}

/* ── Lesson rows state ── */
let _lessonRows = []; // [{number, name, activityLink, slidesLink}]

function renderLessonRows() {
  const container = document.getElementById('lessonLinksContainer');
  if (!container) return;
  if (_lessonRows.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--light);font-size:13px;font-weight:700;">No lessons added yet. Click "+ Add Lesson" to start.</div>';
    return;
  }
  container.innerHTML = _lessonRows.map((row, idx) => `
    <div style="background:var(--bg);border-radius:14px;padding:16px;margin-bottom:12px;border:1.5px solid #e8eaf0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-family:'Fredoka One',cursive;font-size:15px;color:var(--blue);">Lesson ${row.number}</div>
        <button type="button" onclick="removeLessonRow(${idx})" style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:900;cursor:pointer;">✕ Remove</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Lesson Title</label>
          <input type="text" value="${row.name || ''}" placeholder="e.g. Variables & Data Types"
            oninput="_lessonRows[${idx}].name = this.value"
            style="width:100%;padding:9px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:13px;outline:none;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">🔗 Activity Link</label>
          <input type="url" value="${row.activityLink || ''}" placeholder="https://replit.com/... or Google Classroom"
            oninput="_lessonRows[${idx}].activityLink = this.value"
            style="width:100%;padding:9px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:13px;outline:none;">
        </div>
        <div style="grid-column:1/-1;">
          <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">📊 Slides / Explanation Link</label>
          <input type="url" value="${row.slidesLink || ''}" placeholder="https://docs.google.com/presentation/... or Canva link"
            oninput="_lessonRows[${idx}].slidesLink = this.value"
            style="width:100%;padding:9px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:13px;outline:none;">
        </div>
      </div>
    </div>`).join('');
}

function addLessonRow() {
  const nextNum = _lessonRows.length > 0 ? Math.max(..._lessonRows.map(r => r.number)) + 1 : 1;
  _lessonRows.push({ number: nextNum, name: '', activityLink: '', slidesLink: '' });
  renderLessonRows();
}

function removeLessonRow(idx) {
  _lessonRows.splice(idx, 1);
  // Re-number
  _lessonRows.forEach((r, i) => { r.number = i + 1; });
  renderLessonRows();
}

/* ── Edit existing course ── */
function editCourse(id) {
  const c = getAdminCourses().find(x => x.id === id);
  if (!c) return;
  editingCourseId = id;

  // Set title
  const titleEl = document.getElementById('addCourseTabTitle');
  if (titleEl) titleEl.textContent = '✏️ Edit Course';
  const btnEl = document.getElementById('saveCourseBtn');
  if (btnEl) btnEl.textContent = '✦ Update Course';

  showAdminTab('add-course');

  // Populate fields
  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
  set('ac-id',       c.id);
  set('ac-name',     c.name);
  set('ac-desc',     c.desc);
  set('ac-subject',  c.subject);
  set('ac-level',    c.level || '');
  set('ac-age',      c.age);
  set('ac-badge',    c.badge || '');
  set('ac-price',    c.price);
  set('ac-classes',  c.classes);
  set('ac-duration', c.duration || '');
  set('ac-students', c.students || 0);
  set('ac-rating',   c.rating);

  acSelectedEmoji = c.emoji || '💻';
  acSelectedColor = c.color || 'blue';

  // Load lesson rows from saved lessons array
  _lessonRows = (c.lessons || []).map(l => ({
    number:       l.number || 1,
    name:         l.name || '',
    activityLink: l.activityLink || '',
    slidesLink:   l.slidesLink || '',
  }));

  buildCourseForm();
}

/* ── Delete course ── */
function deleteCourse(id) {
  const c = getAdminCourses().find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Delete "${c.name}" (${c.id})? This will remove it from the public catalogue.`)) return;
  const updated = getAdminCourses().filter(x => x.id !== id);
  saveAdminCourses(updated);
  renderCoursesTable();
  showToast(`"${c.name}" deleted.`);
}

/* ── Save / update course ── */
function saveCourse() {
  const name    = document.getElementById('ac-name')?.value.trim();
  const desc    = document.getElementById('ac-desc')?.value.trim();
  const subject = document.getElementById('ac-subject')?.value;
  const level   = document.getElementById('ac-level')?.value;
  const age     = document.getElementById('ac-age')?.value.trim();
  const price   = parseFloat(document.getElementById('ac-price')?.value);
  const classes = parseInt(document.getElementById('ac-classes')?.value);

  if (!name)              { showToast('Please enter a course title.', 'error'); return; }
  if (!desc)              { showToast('Please enter a description.', 'error'); return; }
  if (!subject)           { showToast('Please select a subject category.', 'error'); return; }
  if (!level)             { showToast('Please select a level.', 'error'); return; }
  if (!age)               { showToast('Please enter an age range.', 'error'); return; }
  if (!price || isNaN(price)) { showToast('Please enter a valid price.', 'error'); return; }
  if (!classes || isNaN(classes)) { showToast('Please enter the number of classes.', 'error'); return; }

  const courseData = {
    id:       editingCourseId || nextCourseId(),
    name,
    desc,
    subject,
    level,
    age,
    price,
    classes,
    duration: document.getElementById('ac-duration')?.value.trim() || '',
    students: parseInt(document.getElementById('ac-students')?.value) || 0,
    rating:   parseFloat(document.getElementById('ac-rating')?.value) || 5.0,
    badge:    document.getElementById('ac-badge')?.value || '',
    emoji:    acSelectedEmoji,
    color:    acSelectedColor,
    lessons:  _lessonRows.filter(r => r.name).map(r => ({
      number:       r.number,
      name:         r.name.trim(),
      activityLink: r.activityLink.trim(),
      slidesLink:   r.slidesLink.trim(),
    })),
  };

  const all = getAdminCourses();
  if (editingCourseId) {
    const idx = all.findIndex(c => c.id === editingCourseId);
    if (idx !== -1) all[idx] = courseData;
    showToast(`✅ "${name}" updated successfully!`);
  } else {
    all.push(courseData);
    showToast(`✅ "${name}" (${courseData.id}) added to catalogue!`);
  }

  saveAdminCourses(all);
  resetCourseForm();
  showAdminTab('courses');
}

/* ── Reset course form ── */
function resetCourseForm() {
  editingCourseId = null;
  _lessonRows = [];
  const titleEl = document.getElementById('addCourseTabTitle');
  if (titleEl) titleEl.textContent = '➕ Add New Course';
  const btnEl = document.getElementById('saveCourseBtn');
  if (btnEl) btnEl.textContent = '✦ Save Course';

  ['ac-name','ac-desc','ac-age','ac-price','ac-classes','ac-duration','ac-students','ac-rating'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const subj = document.getElementById('ac-subject'); if (subj) subj.value = '';
  const lvl  = document.getElementById('ac-level');   if (lvl)  lvl.value  = '';
  const bdg  = document.getElementById('ac-badge');   if (bdg)  bdg.value  = '';

  acSelectedEmoji = '💻';
  acSelectedColor = 'blue';
  buildCourseForm();
}

/* ══════════════════════════════════════════════════════
   SALES PERSONS REGISTRY
══════════════════════════════════════════════════════ */
const SP_COLORS = [
  'linear-gradient(135deg,#ff6b35,#fbbf24)',
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#0694a2,#67e8f9)',
  'linear-gradient(135deg,#e63387,#f9a8d4)',
];

function getSalesPersons() {
  try {
    const stored = JSON.parse(localStorage.getItem('sn_sales_persons') || '[]');
    if (stored.length === 0) {
      const defaults = [
        { id:'SP001', name:'Alex Johnson', initials:'AJ', email:'alex.johnson@stemnest.co.uk', phone:'+44 7700 222001', password:'StemNest2024!', region:'UK & Europe', bio:'Senior academic counselor with 3 years experience.', color:SP_COLORS[0], photo:null, createdAt: new Date().toISOString() },
      ];
      localStorage.setItem('sn_sales_persons', JSON.stringify(defaults));
      return defaults;
    }
    return stored;
  } catch { return []; }
}
function saveSalesPersons(list) { localStorage.setItem('sn_sales_persons', JSON.stringify(list)); }

function nextSalesId() {
  const all  = getSalesPersons();
  const nums = all.map(s => parseInt(s.id.replace('SP','')) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return 'SP' + String(next).padStart(3, '0');
}

/* ── Render sales grid ── */
function renderSalesGrid() {
  const grid = document.getElementById('salesGrid');
  if (!grid) return;
  const persons = getSalesPersons();
  setText('salesBadge', persons.length);

  if (!persons.length) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No sales persons yet.</div>';
    return;
  }

  grid.innerHTML = persons.map(s => {
    const pipeline = JSON.parse(localStorage.getItem('sn_pipeline_' + s.id) || '[]');
    const converted = pipeline.filter(p => p.status === 'converted').length;
    const revenue   = pipeline.filter(p => p.status === 'converted').reduce((sum, p) => sum + (parseFloat(p.paymentAmount) || 0), 0);
    return `
      <div class="tutor-card">
        <div class="tutor-card-av" style="background:${s.color||SP_COLORS[0]}">${s.initials}</div>
        <div class="tutor-card-id">${s.id}</div>
        <div class="tutor-card-name">${s.name}</div>
        <div class="tutor-card-subject">Academic Counselor</div>
        <div class="tutor-card-avail">🌍 ${s.region || '—'}</div>
        <div class="tutor-card-avail" style="color:var(--green);">✅ ${converted} conversions · £${revenue.toLocaleString()}</div>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">
          <button class="ab-btn ab-btn-view" onclick="viewSalesPerson('${s.id}')">👁 View</button>
          <button class="ab-btn" style="background:var(--orange-light);color:var(--orange-dark);" onclick="deleteSalesPerson('${s.id}')">🗑 Remove</button>
        </div>
      </div>`;
  }).join('');
}

function viewSalesPerson(id) {
  const s = getSalesPersons().find(x => x.id === id);
  if (!s) return;
  const pipeline  = JSON.parse(localStorage.getItem('sn_pipeline_' + id) || '[]');
  const converted = pipeline.filter(p => p.status === 'converted').length;
  showToast(`${s.name} · ${converted} conversions`, 'info');
}

function deleteSalesPerson(id) {
  const s = getSalesPersons().find(x => x.id === id);
  if (!s || !confirm(`Remove ${s.name} (${s.id})?`)) return;
  saveSalesPersons(getSalesPersons().filter(x => x.id !== id));
  renderSalesGrid();
  showToast(`${s.name} removed.`);
}

/* ── Add sales person form ── */
document.addEventListener('DOMContentLoaded', () => {
  // Auto-generate SP ID on page load
  const idEl = document.getElementById('sp-id');
  if (idEl) idEl.value = nextSalesId();
});

function generateSalesPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  const pw    = 'SN' + Array.from({length:8}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  const el    = document.getElementById('sp-password');
  if (el) el.value = pw;
}

function resetSalesForm() {
  ['sp-name','sp-email','sp-phone','sp-password','sp-region','sp-bio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const idEl = document.getElementById('sp-id');
  if (idEl) idEl.value = nextSalesId();
}

function saveNewSalesPerson() {
  const name     = document.getElementById('sp-name')?.value.trim();
  const email    = document.getElementById('sp-email')?.value.trim();
  const password = document.getElementById('sp-password')?.value.trim();
  if (!name)     { showToast('Please enter a name.', 'error'); return; }
  if (!email)    { showToast('Please enter an email.', 'error'); return; }
  if (!password) { showToast('Please set a password.', 'error'); return; }

  const existing = getSalesPersons();
  if (existing.some(s => s.email.toLowerCase() === email.toLowerCase())) {
    showToast('A sales person with this email already exists.', 'error'); return;
  }

  const id       = nextSalesId();
  const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const newSP    = {
    id, name, initials, email, password,
    phone:     document.getElementById('sp-phone')?.value.trim(),
    region:    document.getElementById('sp-region')?.value.trim(),
    bio:       document.getElementById('sp-bio')?.value.trim(),
    color:     SP_COLORS[existing.length % SP_COLORS.length],
    photo:     null,
    createdAt: new Date().toISOString(),
  };

  existing.push(newSP);
  saveSalesPersons(existing);

  console.log(`📧 WELCOME EMAIL TO: ${email}
Hi ${name.split(' ')[0]}, your StemNest Academic Counselor account is ready.
ID: ${id} | Password: ${password}
Dashboard: ${window.location.origin}/frontend/pages/sales-dashboard.html`);

  showToast(`✅ ${name} (${id}) created! Welcome email sent.`);
  resetSalesForm();
  showAdminTab('sales');
}

/* ── Populate sales select in assign modal ── */
function populateSalesSelect() {
  const sel = document.getElementById('assignSalesSelect');
  if (!sel) return;
  const persons = getSalesPersons();
  sel.innerHTML = '<option value="">— Select sales person —</option>' +
    persons.map(s => `<option value="${s.id}">${s.name} (${s.id}) · ${s.region || 'Global'}</option>`).join('');
}

/* ── CLASS REPORTS TAB ── */
function renderClassReports() {
  const tbody = document.getElementById('classReportsBody');
  if (!tbody) return;
  const filter  = document.getElementById('reportFilter')?.value || 'all';
  const reports = JSON.parse(localStorage.getItem('sn_class_reports') || '[]');
  const bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');

  let list = reports;
  if (filter === 'completed')  list = reports.filter(r => r.outcome === 'completed');
  if (filter === 'incomplete') list = reports.filter(r => r.outcome === 'incomplete');

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--light);">No class reports yet.</td></tr>';
    return;
  }

  const qualityLabel = { excellent:'⭐⭐⭐⭐⭐', good:'⭐⭐⭐⭐', average:'⭐⭐⭐', poor:'⭐⭐' };
  const interestLabel = { very_high:'🔥 Very High', high:'✅ High', medium:'🤔 Medium', low:'😐 Low', none:'❌ None' };
  const salesStatusLabel = { converted:'✅ Converted', pitched:'📣 Pitched', interested:'🔥 Interested', followup:'📞 Follow-up', lost:'❌ Lost' };

  tbody.innerHTML = list.map(r => {
    const b = bookings.find(x => x.id === r.bookingId) || {};
    const pipeline = JSON.parse(localStorage.getItem('sn_pipeline_' + (b.assignedSalesId || '')) || '[]');
    const pitchRecord = pipeline.find(p => p.bookingId === r.bookingId);
    return `
      <tr>
        <td><strong>${b.studentName || r.bookingId}</strong></td>
        <td><span class="ab-subject ab-${(b.subject||'').toLowerCase()}">${b.subject||'—'}</span></td>
        <td style="font-size:12px;">${formatDate(b.date)} ${b.time||''}</td>
        <td style="font-size:12px;">${r.tutorName||'—'}</td>
        <td><span class="ab-status ${r.outcome==='completed'?'ab-scheduled':'ab-pending'}">${r.outcome==='completed'?'✅ Complete':'❌ Incomplete'}</span></td>
        <td>${r.outcome==='completed' ? (qualityLabel[r.classQuality]||r.classQuality||'—') : `<span style="font-size:12px;color:var(--light);">${r.incompleteReason?.slice(0,40)||'—'}</span>`}</td>
        <td>${r.outcome==='completed' ? (interestLabel[r.studentInterest]||'—') : '—'}</td>
        <td style="font-size:12px;">${b.assignedSalesName||'—'}</td>
        <td>${pitchRecord ? `<span class="ab-status ab-${pitchRecord.status==='converted'?'completed':'pending'}">${salesStatusLabel[pitchRecord.status]||pitchRecord.status}</span>` : '—'}</td>
        <td style="font-size:12px;max-width:160px;">${r.notes||r.incompleteReason||'—'}</td>
      </tr>`;
  }).join('');
}

/* ── Hook sales into showAdminTab and updateStats ── */
const _origShowAdminTab = showAdminTab;
showAdminTab = function(tab) {
  // Extend ADMIN_TABS array if needed
  if (!ADMIN_TABS.includes('sales'))         ADMIN_TABS.push('sales');
  if (!ADMIN_TABS.includes('add-sales'))     ADMIN_TABS.push('add-sales');
  if (!ADMIN_TABS.includes('class-reports')) ADMIN_TABS.push('class-reports');
  _origShowAdminTab(tab);
  if (tab === 'sales')         renderSalesGrid();
  if (tab === 'class-reports') renderClassReports();
  if (tab === 'add-sales') {
    const idEl = document.getElementById('sp-id');
    if (idEl) idEl.value = nextSalesId();
  }
};

/* ── Extend confirmAssign to attach sales person ── */
const _origConfirmAssign = confirmAssign;
confirmAssign = function() {
  const salesId = document.getElementById('assignSalesSelect')?.value;
  const salesPerson = salesId ? getSalesPersons().find(s => s.id === salesId) : null;

  // Patch the booking with sales person before calling original
  if (salesId && activeAssignId) {
    updateBooking(activeAssignId, {
      assignedSalesId:   salesId,
      assignedSalesName: salesPerson?.name || '—',
    });
    // Notify sales person
    if (salesPerson) {
      const b = allBookings.find(x => x.id === activeAssignId);
      console.log(`📧 SALES NOTIFICATION TO: ${salesPerson.email}
Subject: New Demo Class Assigned — ${b?.subject} with ${b?.studentName}

Hi ${salesPerson.name.split(' ')[0]},

A demo class has been assigned to you for counseling:

🎓 Student:  ${b?.studentName} (${b?.grade}, Age ${b?.age})
📚 Subject:  ${b?.subject}
📅 Date:     ${formatDate(b?.date)}
🕐 Time:     ${b?.time}
👩‍🏫 Teacher: ${b?.assignedTutor || 'TBD'}

You will join at the END of the class to pitch courses to the parent.
Dashboard: ${window.location.origin}/frontend/pages/sales-dashboard.html

StemNest Academy`);
    }
  }
  _origConfirmAssign();
};

/* ── Populate sales select when assign modal opens ── */
const _origOpenAssignModal = openAssignModal;
openAssignModal = function(id) {
  _origOpenAssignModal(id);
  populateSalesSelect();
};

/* ── Update stats to include sales count ── */
const _origUpdateStats = updateStats;
updateStats = function() {
  _origUpdateStats();
  setText('salesBadge', getSalesPersons().length);
};

/* ══════════════════════════════════════════════════════
   COMPANION MATERIALS (Admin uploads for teachers)
══════════════════════════════════════════════════════ */

function getMaterials() {
  try { return JSON.parse(localStorage.getItem('sn_companion_materials') || '[]'); }
  catch { return []; }
}
function saveMaterials(list) { localStorage.setItem('sn_companion_materials', JSON.stringify(list)); }

function nextMaterialId() {
  const all  = getMaterials();
  const nums = all.map(m => parseInt(m.id?.replace('MAT','')) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return 'MAT' + String(next).padStart(3,'0');
}

function renderMaterialsTable() {
  const tbody = document.getElementById('materialsTableBody');
  if (!tbody) return;
  const list = getMaterials();
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--light);">No materials uploaded yet. Click "Upload Material" to add the first one.</td></tr>';
    return;
  }
  const typeLabel = { curriculum:'📋 Curriculum', lesson_plan:'📝 Lesson Plan', notes:'📓 Notes', quiz_solution:'✅ Quiz Solutions', activity:'🎯 Activity', tool:'🔧 Tool', other:'📄 Other' };
  tbody.innerHTML = list.map(m => `
    <tr>
      <td><span style="font-family:'Fredoka One',cursive;font-size:12px;color:var(--blue);">${m.id}</span></td>
      <td><strong>${m.title}</strong></td>
      <td>${typeLabel[m.type] || m.type}</td>
      <td>${m.course || 'All Courses'}</td>
      <td style="font-size:12px;max-width:160px;">${m.description || '—'}</td>
      <td>${m.url ? `<a href="${m.url}" target="_blank" style="color:var(--blue);font-weight:700;font-size:12px;">Open ↗</a>` : '—'}</td>
      <td style="font-size:12px;">${formatDateTime(m.uploadedAt)}</td>
      <td>
        <button class="ab-btn" style="background:var(--orange-light);color:var(--orange-dark);" onclick="deleteMaterial('${m.id}')">🗑 Delete</button>
      </td>
    </tr>`).join('');
}

function openAddMaterialModal() {
  // Populate course dropdown
  const sel = document.getElementById('mat-course');
  if (sel) {
    const courses = getAdminCourses();
    sel.innerHTML = '<option value="">All Courses</option>' +
      courses.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }
  ['mat-title','mat-url','mat-desc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const typeEl = document.getElementById('mat-type'); if (typeEl) typeEl.value = 'curriculum';
  document.getElementById('addMaterialOverlay')?.classList.add('open');
}

function closeAddMaterialModal() {
  document.getElementById('addMaterialOverlay')?.classList.remove('open');
}

function saveMaterial() {
  const title = document.getElementById('mat-title')?.value.trim();
  const url   = document.getElementById('mat-url')?.value.trim();
  const type  = document.getElementById('mat-type')?.value;
  if (!title) { showToast('Please enter a title.', 'error'); return; }
  if (!url)   { showToast('Please enter a URL.', 'error'); return; }

  const material = {
    id:          nextMaterialId(),
    title,
    type,
    course:      document.getElementById('mat-course')?.value || '',
    url,
    description: document.getElementById('mat-desc')?.value.trim(),
    uploadedAt:  new Date().toISOString(),
  };

  const all = getMaterials();
  all.unshift(material);
  saveMaterials(all);
  closeAddMaterialModal();
  renderMaterialsTable();
  showToast(`✅ "${title}" uploaded! Teachers can now access it in My Companion.`);
}

function deleteMaterial(id) {
  const m = getMaterials().find(x => x.id === id);
  if (!m || !confirm(`Delete "${m.title}"?`)) return;
  saveMaterials(getMaterials().filter(x => x.id !== id));
  renderMaterialsTable();
  showToast(`"${m.title}" deleted.`);
}

/* Hook companion-admin into showAdminTab */
const _origShowAdminTab2 = showAdminTab;
showAdminTab = function(tab) {
  // Add companion-admin to tabs list
  if (!ADMIN_TABS.includes('companion-admin')) ADMIN_TABS.push('companion-admin');
  _origShowAdminTab2(tab);
  if (tab === 'companion-admin') renderMaterialsTable();
};

/* Bind add material modal close on overlay */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('addMaterialOverlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeAddMaterialModal(); });
});
