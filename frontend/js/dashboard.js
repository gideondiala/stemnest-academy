/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — TUTOR DASHBOARD JS
   Loads logged-in teacher from localStorage registry,
   weekly availability calendar, photo upload, notifications.
═══════════════════════════════════════════════════════ */

/* ── LOAD LOGGED-IN TUTOR ── */
// Admin creates teachers via sn_teachers registry.
// Login stores the active teacher id in sn_logged_in_teacher.
// Fall back to a default so the page still works standalone.
function getLoggedInTutor() {
  try {
    const id      = localStorage.getItem('sn_logged_in_teacher');
    const registry = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
    const found   = id ? registry.find(t => t.id === id) : null;
    return found || {
      id: 'CT001', name: 'Sarah Rahman', initials: 'SR',
      role: 'Coding Tutor', subject: 'Coding',
      email: 'sarah.rahman@stemnest.co.uk',
      courses: ['Python for Beginners','Scratch & Game Design','Web Dev'],
      gradeGroups: ['Year 7–9','Year 10–11'],
      photo: null,
    };
  } catch { return { id:'CT001', name:'Sarah Rahman', initials:'SR', role:'Coding Tutor', subject:'Coding', photo:null }; }
}

let TUTOR = getLoggedInTutor();

/* ── TABS ── */
const TABS = ['overview', 'sessions', 'projects', 'calendar'];

/* ── AVAILABILITY STORE ── */
function getAvailability() {
  try { return JSON.parse(localStorage.getItem('sn_tutor_avail_' + TUTOR.id) || '{}'); }
  catch { return {}; }
}
function saveAvailability(avail) {
  localStorage.setItem('sn_tutor_avail_' + TUTOR.id, JSON.stringify(avail));
  // Sync to shared store so admin can read it
  const shared = JSON.parse(localStorage.getItem('sn_all_tutor_avail') || '{}');
  shared[TUTOR.id] = { tutor: TUTOR, slots: avail };
  localStorage.setItem('sn_all_tutor_avail', JSON.stringify(shared));
}
function toggleSlot(dk, timeKey) {
  const avail = getAvailability();
  const key   = dk + '|' + timeKey;
  if (avail[key]) delete avail[key];
  else avail[key] = true;
  saveAvailability(avail);
  renderWeeklyCalendar();
}

/* ── WEEKLY CALENDAR STATE ── */
let weekOffset = 0;

const HOURS = [
  '6:00','6:30','7:00','7:30','8:00','8:30',
  '9:00','9:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30',
  '18:00','18:30','19:00','19:30','20:00','20:30',
  '21:00','21:30',
];

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  TUTOR = getLoggedInTutor();
  setGreeting();
  renderSidebarProfile();
  populateProfileModal();
  buildCalStrip();
  bindProfileModal();
  checkAssignedClasses();
  showDashTab('overview');
});

/* ── GREETING ── */
function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById('greetingTime');
  if (el) el.textContent = h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';
  const nameEl = document.getElementById('greetingName');
  if (nameEl) nameEl.textContent = TUTOR.name.split(' ')[0];
  const navEl = document.getElementById('navTutorName');
  if (navEl) navEl.textContent = TUTOR.name;
  const dateEl = document.getElementById('dashDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });
}

/* ── SIDEBAR PROFILE ── */
function renderSidebarProfile() {
  const wrap = document.getElementById('sidebarAvatarWrap');
  if (wrap) {
    if (TUTOR.photo) {
      wrap.innerHTML = `<img src="${TUTOR.photo}" class="sidebar-avatar sidebar-avatar-img" alt="${TUTOR.name}">`;
    } else {
      wrap.innerHTML = `<div class="sidebar-avatar">${TUTOR.initials || TUTOR.name.slice(0,2).toUpperCase()}</div>`;
    }
  }
  const nameEl = document.getElementById('sidebarName');
  if (nameEl) nameEl.textContent = TUTOR.name;
  const roleEl = document.getElementById('sidebarRole');
  if (roleEl) roleEl.textContent = TUTOR.role || TUTOR.subject + ' Tutor';
  const idEl = document.getElementById('tutorIdBadge');
  if (idEl) idEl.textContent = TUTOR.id;
}

/* ── POPULATE PROFILE MODAL FIELDS ── */
function populateProfileModal() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('pmFieldName',      TUTOR.name);
  set('pmFieldEmail',     TUTOR.email);
  set('pmFieldPhone',     TUTOR.phone || '');
  set('pmFieldSubjects',  Array.isArray(TUTOR.courses) ? TUTOR.courses.join(', ') : (TUTOR.subjects || ''));
  set('pmFieldAgeGroups', Array.isArray(TUTOR.gradeGroups) ? TUTOR.gradeGroups.join(', ') : (TUTOR.ageGroups || ''));
  set('pmFieldBio',       TUTOR.bio || '');
  const nameEl = document.getElementById('pmTutorName');
  if (nameEl) nameEl.textContent = TUTOR.name;
  const idEl = document.getElementById('pmTutorId');
  if (idEl) idEl.textContent = 'ID: ' + TUTOR.id;
}

/* ── CHECK FOR NEWLY ASSIGNED CLASSES ── */
function checkAssignedClasses() {
  const banner = document.getElementById('assignedClassBanner');
  if (!banner) return;
  const bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  const mine = bookings.filter(b =>
    b.status === 'scheduled' &&
    b.assignedTutorId === TUTOR.id &&
    !b.tutorNotified
  );
  if (mine.length === 0) { banner.style.display = 'none'; return; }
  const b = mine[0]; // show most recent
  banner.style.display = 'block';
  banner.innerHTML = `
    <div class="assigned-banner">
      <div class="assigned-banner-icon">🎉</div>
      <div class="assigned-banner-body">
        <div class="assigned-banner-title">New class assigned to you!</div>
        <div class="assigned-banner-meta">
          📚 <strong>${b.subject}</strong> &nbsp;·&nbsp;
          🎓 <strong>${b.studentName}</strong> (${b.grade}) &nbsp;·&nbsp;
          📅 <strong>${formatDateSimple(b.date)}</strong> at <strong>${b.time}</strong>
          ${mine.length > 1 ? `<br>+${mine.length - 1} more new assignment${mine.length > 2 ? 's' : ''}` : ''}
        </div>
      </div>
      ${b.classLink ? `<a href="${b.classLink}" target="_blank" class="assigned-banner-btn">🚀 Join Class</a>` : ''}
    </div>`;
  // Mark as notified
  mine.forEach(bk => {
    const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    const idx = all.findIndex(x => x.id === bk.id);
    if (idx !== -1) { all[idx].tutorNotified = true; localStorage.setItem('sn_bookings', JSON.stringify(all)); }
  });
}

/* ── TAB SWITCHING ── */
function showDashTab(tab) {
  TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tab);
  });
  const qa = document.getElementById('quickActions');
  if (qa) qa.style.display = tab === 'overview' ? 'grid' : 'none';
  if (tab === 'calendar') { weekOffset = 0; renderWeeklyCalendar(); }
}

/* ══════════════════════════════════════════════════════
   WEEKLY AVAILABILITY CALENDAR
══════════════════════════════════════════════════════ */
function getWeekDates(offset) {
  const today = new Date();
  const day   = today.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMon + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateKey(d) { return d.toISOString().split('T')[0]; }

function renderWeeklyCalendar() {
  const container = document.getElementById('weeklyCalContainer');
  if (!container) return;

  const days     = getWeekDates(weekOffset);
  const avail    = getAvailability();
  const today    = new Date();
  const todayKey = toDateKey(today);
  const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const weekLabel = document.getElementById('weekLabel');
  if (weekLabel) {
    const o = { day:'numeric', month:'short' };
    weekLabel.textContent =
      days[0].toLocaleDateString('en-GB', o) + ' – ' +
      days[6].toLocaleDateString('en-GB', o) + ' ' + days[0].getFullYear();
  }

  const totalAvail = Object.keys(avail).length;
  const summaryEl  = document.getElementById('availSummary');
  if (summaryEl) summaryEl.textContent = `${totalAvail} slot${totalAvail !== 1 ? 's' : ''} marked available`;

  let html = `<div class="wcal-wrap"><table class="wcal-table"><thead><tr>
    <th class="wcal-time-col">Time</th>
    ${days.map((d, i) => {
      const dk = toDateKey(d);
      const isToday = dk === todayKey;
      return `<th class="${isToday ? 'wcal-today-col' : ''}">
        <div class="wcal-day-name">${DAY_NAMES[i]}</div>
        <div class="wcal-day-num ${isToday ? 'wcal-today-num' : ''}">${d.getDate()}</div>
      </th>`;
    }).join('')}
  </tr></thead><tbody>`;

  HOURS.forEach(time => {
    const isHour = !time.includes(':30');
    html += `<tr class="${isHour ? 'wcal-hour-row' : 'wcal-half-row'}">
      <td class="wcal-time-label">${isHour ? time : '<span class="wcal-half-label">:30</span>'}</td>`;
    days.forEach((d, i) => {
      const dk  = toDateKey(d);
      const key = dk + '|' + time;
      const isAvail = !!avail[key];
      const isPast  = d < today && dk !== todayKey;
      const cls     = isAvail ? 'wcal-slot wcal-avail' : isPast ? 'wcal-slot wcal-past' : 'wcal-slot';
      const click   = isPast ? '' : `onclick="toggleSlot('${dk}','${time}')"`;
      html += `<td class="${cls}" ${click} title="${DAY_NAMES[i]} ${d.getDate()} at ${time}">
        ${isAvail ? '<span class="wcal-avail-dot"></span>' : ''}
      </td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

function changeWeek(dir) { weekOffset += dir; renderWeeklyCalendar(); }

function clearWeekAvailability() {
  const days  = getWeekDates(weekOffset);
  const avail = getAvailability();
  days.forEach(d => HOURS.forEach(t => delete avail[toDateKey(d) + '|' + t]));
  saveAvailability(avail);
  renderWeeklyCalendar();
  showToast('Week availability cleared.');
}

/* ── CALENDAR STRIP (overview) ── */
function buildCalStrip() {
  const strip = document.getElementById('calStrip');
  if (!strip) return;
  strip.innerHTML = '';
  const days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = new Date();
  const avail = getAvailability();
  for (let i = 0; i <= 7; i++) {
    const d  = new Date(today);
    d.setDate(today.getDate() + i);
    const dk = toDateKey(d);
    const hasAvail = HOURS.some(t => avail[dk + '|' + t]);
    const div = document.createElement('div');
    div.className = 'cal-day' + (i === 0 ? ' cal-today' : '') + (hasAvail ? ' cal-has-session' : '');
    div.innerHTML = `
      <div class="cal-dow">${days[d.getDay()]}</div>
      <div class="cal-num">${d.getDate()}</div>
      ${hasAvail ? '<div class="cal-dot"></div>' : ''}`;
    strip.appendChild(div);
  }
}

/* ══════════════════════════════════════════════════════
   PROFILE MODAL
══════════════════════════════════════════════════════ */
function bindProfileModal() {
  const overlay = document.getElementById('profileModalOverlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeProfileModal(); });
  const photoInput = document.getElementById('photoUploadInput');
  photoInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) { showToast('Please select an image file.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      TUTOR.photo = ev.target.result;
      updatePhotoPreview();
      renderSidebarProfile();
      persistTutorPhoto();
      showToast('✅ Photo updated!');
    };
    reader.readAsDataURL(file);
  });
}

function updatePhotoPreview() {
  const preview = document.getElementById('pmAvatarPreview');
  if (!preview) return;
  preview.innerHTML = TUTOR.photo
    ? `<img src="${TUTOR.photo}" class="pm-avatar-img" alt="Profile photo" style="cursor:pointer;" onclick="triggerPhotoUpload()">`
    : `<div class="pm-avatar" style="cursor:pointer;" onclick="triggerPhotoUpload()">${TUTOR.initials || TUTOR.name.slice(0,2).toUpperCase()}</div>`;
}

function persistTutorPhoto() {
  const registry = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
  const idx = registry.findIndex(t => t.id === TUTOR.id);
  if (idx !== -1) { registry[idx].photo = TUTOR.photo; localStorage.setItem('sn_teachers', JSON.stringify(registry)); }
}

function openProfileModal() {
  populateProfileModal();
  updatePhotoPreview();
  document.getElementById('profileModalOverlay')?.classList.add('open');
}

function closeProfileModal() {
  document.getElementById('profileModalOverlay')?.classList.remove('open');
}

function saveProfile() {
  const name      = document.getElementById('pmFieldName')?.value.trim();
  const email     = document.getElementById('pmFieldEmail')?.value.trim();
  const phone     = document.getElementById('pmFieldPhone')?.value.trim();
  const subjects  = document.getElementById('pmFieldSubjects')?.value.trim();
  const ageGroups = document.getElementById('pmFieldAgeGroups')?.value.trim();
  const bio       = document.getElementById('pmFieldBio')?.value.trim();
  const newPw     = document.getElementById('pmFieldPassword')?.value;

  if (!name || !email) { showToast('Name and email are required.', 'error'); return; }

  TUTOR.name      = name;
  TUTOR.email     = email;
  TUTOR.phone     = phone;
  TUTOR.bio       = bio;
  TUTOR.initials  = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

  // Persist to registry
  const registry = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
  const idx = registry.findIndex(t => t.id === TUTOR.id);
  if (idx !== -1) {
    registry[idx] = { ...registry[idx], name, email, phone, bio,
      initials: TUTOR.initials,
      courses: subjects.split(',').map(s => s.trim()).filter(Boolean),
      gradeGroups: ageGroups.split(',').map(s => s.trim()).filter(Boolean),
      ...(newPw ? { password: newPw } : {}),
    };
    localStorage.setItem('sn_teachers', JSON.stringify(registry));
    TUTOR = registry[idx];
  }

  renderSidebarProfile();
  closeProfileModal();
  showToast('✅ Profile updated successfully!');
}

function triggerPhotoUpload() {
  document.getElementById('photoUploadInput')?.click();
}

/* ── HELPERS ── */
function formatDateSimple(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }); }
  catch { return dateStr; }
}

/* ══════════════════════════════════════════════════════
   END CLASS MODAL
══════════════════════════════════════════════════════ */
let activeEndClassId = null;

function openEndClassModal(bookingId) {
  activeEndClassId = bookingId;

  // Try to find booking details
  const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  const b   = all.find(x => x.id === bookingId);

  const infoEl = document.getElementById('endClassBookingInfo');
  if (infoEl) {
    infoEl.innerHTML = b
      ? `🎓 <strong>${b.studentName}</strong> (${b.grade}) · 📚 <strong>${b.subject}</strong> · 📅 ${b.date} at ${b.time}`
      : `Session ID: ${bookingId}`;
  }

  // Reset form
  document.querySelectorAll('input[name="classOutcome"]').forEach(r => r.checked = false);
  document.getElementById('incompleteFields').style.display  = 'none';
  document.getElementById('completedFields').style.display   = 'none';
  document.getElementById('incompleteReason').value = '';
  document.getElementById('classNotes').value        = '';

  document.getElementById('endClassModalOverlay').classList.add('open');
}

function closeEndClassModal() {
  document.getElementById('endClassModalOverlay').classList.remove('open');
  activeEndClassId = null;
}

function toggleOutcomeFields() {
  const val = document.querySelector('input[name="classOutcome"]:checked')?.value;
  document.getElementById('incompleteFields').style.display = val === 'incomplete' ? 'block' : 'none';
  document.getElementById('completedFields').style.display  = val === 'completed'  ? 'block' : 'none';
}

function submitEndClassReport() {
  const outcome = document.querySelector('input[name="classOutcome"]:checked')?.value;
  if (!outcome) { showToast('Please select the class outcome.', 'error'); return; }

  if (outcome === 'incomplete') {
    const reason = document.getElementById('incompleteReason')?.value.trim();
    if (!reason) { showToast('Please describe why the class was incomplete.', 'error'); return; }
  }

  const report = {
    bookingId:       activeEndClassId,
    tutorId:         TUTOR.id,
    tutorName:       TUTOR.name,
    outcome,
    incompleteReason: outcome === 'incomplete' ? document.getElementById('incompleteReason')?.value.trim() : '',
    classQuality:    outcome === 'completed'   ? document.getElementById('classQuality')?.value : '',
    studentInterest: outcome === 'completed'   ? document.getElementById('studentInterest')?.value : '',
    purchasingPower: outcome === 'completed'   ? document.getElementById('purchasingPower')?.value : '',
    notes:           outcome === 'completed'   ? document.getElementById('classNotes')?.value.trim() : '',
    reportedAt:      new Date().toISOString(),
  };

  // Save report
  const reports = JSON.parse(localStorage.getItem('sn_class_reports') || '[]');
  const idx = reports.findIndex(r => r.bookingId === activeEndClassId);
  if (idx !== -1) reports[idx] = report;
  else reports.unshift(report);
  localStorage.setItem('sn_class_reports', JSON.stringify(reports));

  // Update booking status
  const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  const bi  = all.findIndex(b => b.id === activeEndClassId);
  if (bi !== -1) {
    all[bi].status        = outcome === 'completed' ? 'completed' : 'incomplete';
    all[bi].classReport   = report;
    all[bi].tutorNotified = true;
    localStorage.setItem('sn_bookings', JSON.stringify(all));
  }

  closeEndClassModal();
  showToast(outcome === 'completed'
    ? '✅ Class marked complete! Report saved.'
    : '📋 Incomplete report submitted to admin.');
}

// Bind end class modal overlay close
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('endClassModalOverlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeEndClassModal(); });
});
