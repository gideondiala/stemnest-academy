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

/* Return the "next :30" key for a given time key, e.g. "9:00" → "9:30", "9:30" → "10:00", "23:30" → "0:00" */
function nextHalfKey(timeKey) {
  const [h, m] = timeKey.split(':').map(Number);
  if (m === 0)  return `${h}:30`;
  // m === 30 → next hour (wrap at 24)
  const nextH = (h + 1) % 24;
  return `${nextH}:00`;
}

/* Toggle a 1-hour availability block starting at timeKey.
   Marks both timeKey and timeKey+30min as a pair.
   If the block is already set, clears both. */
function toggleSlot(dk, timeKey) {
  const avail    = getAvailability();
  const key1     = dk + '|' + timeKey;
  const key2     = dk + '|' + nextHalfKey(timeKey);

  if (avail[key1]) {
    // Already set — clear the whole 1-hour block
    delete avail[key1];
    delete avail[key2];
  } else {
    // Mark both halves of the 1-hour block
    avail[key1] = true;
    avail[key2] = true;
  }
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
  // Pre-fill DOB (Phase 6)
  const dobEl = document.getElementById('pmFieldDob');
  if (dobEl) {
    const saved = localStorage.getItem('sn_dob_' + TUTOR.id);
    if (saved) dobEl.value = saved;
  }
}

/* ── CHECK FOR NEWLY ASSIGNED CLASSES ── */
function checkAssignedClasses() {
  const banner = document.getElementById('assignedClassBanner');
  if (!banner) return;
  const tutorId = localStorage.getItem('sn_logged_in_teacher') || (typeof TUTOR !== 'undefined' ? TUTOR.id : 'CT001');
  const bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  const mine = bookings.filter(b =>
    b.status === 'scheduled' && b.assignedTutorId === tutorId
  );
  if (mine.length === 0) { banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  const rows = mine.slice(0, 3).map(b =>
    '📚 <strong>' + b.subject + '</strong> &nbsp;·&nbsp; 🎓 <strong>' + b.studentName + '</strong> &nbsp;·&nbsp; 📅 ' + (b.date || '—') + ' at ' + (b.time || '—')
  ).join('<br>');
  const extra = mine.length > 3 ? '<br>+' + (mine.length - 3) + ' more' : '';
  banner.innerHTML = [
    '<div class="assigned-banner">',
      '<div class="assigned-banner-icon">📅</div>',
      '<div class="assigned-banner-body">',
        '<div class="assigned-banner-title">' + mine.length + ' upcoming class' + (mine.length > 1 ? 'es' : '') + ' assigned to you</div>',
        '<div class="assigned-banner-meta">' + rows + extra + '</div>',
      '</div>',
      '<div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0;">',
        '<button class="assigned-banner-btn" onclick="showDashTab(\'sessions\')">📡 View Sessions</button>',
        '<button onclick="document.getElementById(\'assignedClassBanner\').style.display=\'none\'"',
          ' style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:50px;padding:7px 16px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">',
          '✕ Dismiss',
        '</button>',
      '</div>',
    '</div>',
  ].join('');
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

/* Convert "HH:MM" string to total minutes since midnight */
function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/* Get all bookings assigned to this tutor */
function getTutorBookings() {
  try {
    const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    return all.filter(b =>
      b.assignedTutorId === TUTOR.id &&
      (b.status === 'scheduled' || b.status === 'completed')
    );
  } catch { return []; }
}

/* Parse a booking's time string to 24h "HH:MM" */
function parseBookingTime(timeStr) {
  if (!timeStr) return null;
  // Already 24h
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) return timeStr.padStart(5, '0');
  // 12h format e.g. "11:00 AM"
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2];
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + min;
}

function renderWeeklyCalendar() {
  const container = document.getElementById('weeklyCalContainer');
  if (!container) return;

  const days       = getWeekDates(weekOffset);
  const avail      = getAvailability();
  const bookings   = getTutorBookings();
  const now        = new Date();
  const todayKey   = toDateKey(now);
  const nowMins    = now.getHours() * 60 + now.getMinutes();
  const DAY_NAMES  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  /* ── Week label ── */
  const weekLabel = document.getElementById('weekLabel');
  if (weekLabel) {
    const o = { day:'numeric', month:'short' };
    weekLabel.textContent =
      days[0].toLocaleDateString('en-GB', o) + ' – ' +
      days[6].toLocaleDateString('en-GB', o) + ' ' + days[0].getFullYear();
  }

  /* ── Slot count summary — count 1-hour blocks (only the start keys) ── */
  const totalAvail = Object.keys(avail).filter(k => {
    if (!avail[k]) return false;
    // Only count the "start" of each block — key whose previous 30-min is NOT set
    const parts    = k.split('|');
    const [h, m]   = parts[1].split(':').map(Number);
    const prevMins = h * 60 + m - 30;
    if (prevMins < 0) return true;
    const prevKey  = parts[0] + '|' + Math.floor(prevMins / 60) + ':' + (prevMins % 60 === 0 ? '00' : '30');
    return !avail[prevKey];
  }).length;
  const summaryEl  = document.getElementById('availSummary');
  if (summaryEl) summaryEl.textContent = `${totalAvail} hour slot${totalAvail !== 1 ? 's' : ''} available`;

  /* ── Build booking lookup: dateKey → array of {timeMins, booking} ── */
  const bookingMap = {};
  bookings.forEach(b => {
    if (!b.date) return;
    // Normalise date key — bookings may store "Mon 21 Apr 2026" or ISO
    let dk = b.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) {
      try {
        const cleaned = dk.replace(/^[A-Za-z]+\s/, '');
        const parsed  = new Date(cleaned);
        if (!isNaN(parsed)) dk = toDateKey(parsed);
      } catch { return; }
    }
    const t24 = parseBookingTime(b.time);
    if (!t24) return;
    if (!bookingMap[dk]) bookingMap[dk] = [];
    bookingMap[dk].push({ timeMins: timeToMins(t24), booking: b });
  });

  /* ── HOUR slots: 00:00 → 23:30 — full 24 hours ── */
  const HOUR_SLOTS = [];
  for (let h = 0; h <= 23; h++) {
    HOUR_SLOTS.push({ label: h < 12 ? `${h === 0 ? 12 : h}:00 AM` : h === 12 ? '12:00 PM' : `${h-12}:00 PM`, key: `${h}:00`, mins: h * 60 });
    HOUR_SLOTS.push({ label: '', key: `${h}:30`, mins: h * 60 + 30, isHalf: true });
  }

  /* ── Build HTML ── */
  let html = `<div class="wcal-wrap"><table class="wcal-table"><thead><tr>
    <th class="wcal-time-col">Time</th>
    ${days.map((d, i) => {
      const dk      = toDateKey(d);
      const isToday = dk === todayKey;
      return `<th class="wcal-day-th${isToday ? ' wcal-today-col' : ''}">
        <div class="wcal-day-name">${DAY_NAMES[i]}</div>
        <div class="wcal-day-num-wrap">
          <div class="wcal-day-num${isToday ? ' wcal-today-num' : ''}">${d.getDate()}</div>
        </div>
      </th>`;
    }).join('')}
  </tr></thead><tbody>`;

  HOUR_SLOTS.forEach(slot => {
    const isHalf = !!slot.isHalf;
    html += `<tr class="${isHalf ? 'wcal-half-row' : 'wcal-hour-row'}">
      <td class="wcal-time-label">${isHalf
        ? '<span class="wcal-half-label">:30</span>'
        : `<span class="wcal-hour-label">${slot.label}</span>`
      }</td>`;

    days.forEach((d, di) => {
      const dk      = toDateKey(d);
      const key     = dk + '|' + slot.key;
      const isToday = dk === todayKey;

      /* Is this slot in the past? */
      const slotDate = new Date(d);
      slotDate.setHours(0, 0, 0, 0);
      const todayDate = new Date(now);
      todayDate.setHours(0, 0, 0, 0);
      const isPastDay  = slotDate < todayDate;
      const isPastSlot = isPastDay || (isToday && slot.mins <= nowMins);

      /* Check if a booking occupies this slot */
      const dayBookings = bookingMap[dk] || [];
      /* A booking at time T occupies slots T and T+30 (1 hour = 2 half-slots) */
      const bookedEntry = dayBookings.find(entry => {
        return slot.mins >= entry.timeMins && slot.mins < entry.timeMins + 60;
      });

      const isAvail  = !!avail[key];

      /* Is this the SECOND half of a 1-hour availability block?
         i.e. the previous 30-min slot for this day is also set. */
      const prevMins = slot.mins - 30;
      const prevKey  = prevMins >= 0
        ? dk + '|' + Math.floor(prevMins / 60) + ':' + (prevMins % 60 === 0 ? '00' : '30')
        : null;
      const isSecondHalf = isAvail && prevKey && !!avail[prevKey];

      if (bookedEntry) {
        /* ── BOOKED SLOT ── */
        const b       = bookedEntry.booking;
        const isDemo  = b.status === 'demo' || !b.paymentAmount || b.isDemoStudent;
        const isFirst = slot.mins === bookedEntry.timeMins;
        const cls     = isDemo ? 'wcal-slot wcal-demo-booked' : 'wcal-slot wcal-paid-booked';
        const isRecurring = b.isRecurring;

        if (isFirst) {
          const rescheduleBtn = isRecurring
            ? `<button onclick="event.stopPropagation();openRescheduleModal('${b.id}')" style="margin-top:4px;background:rgba(255,255,255,.25);color:#fff;border:none;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;">🔄 Reschedule</button>`
            : '';
          if (isDemo) {
            html += `<td class="${cls}" onclick="showBookingPopup('${b.id}')" title="Demo: ${b.studentName}">
              <div class="wcal-booked-inner wcal-booked-demo">
                <div class="wcal-booked-label">🎓 ${b.studentName}</div>
                <div class="wcal-booked-sub">${b.grade || ''}</div>
                ${rescheduleBtn}
              </div>
            </td>`;
          } else {
            html += `<td class="${cls}" onclick="showBookingPopup('${b.id}')" title="Paid: ${b.studentName}">
              <div class="wcal-booked-inner wcal-booked-paid">
                <div class="wcal-booked-label">📚 ${b.studentName}</div>
                <div class="wcal-booked-sub">${b.subject || ''} ${b.lessonNumber ? '· L' + b.lessonNumber : ''}</div>
                ${rescheduleBtn}
              </div>
            </td>`;
          }
        } else {
          html += `<td class="${cls} wcal-booked-cont" onclick="showBookingPopup('${b.id}')"></td>`;
        }

      } else if (isPastSlot) {
        /* ── PAST SLOT — not clickable ── */
        html += `<td class="wcal-slot wcal-past" title="Past — cannot edit"></td>`;

      } else if (isAvail && isSecondHalf) {
        /* ── SECOND HALF of a 1-hour availability block — visual continuation, not clickable ── */
        const todayCls = isToday ? ' wcal-today-slot' : '';
        html += `<td class="wcal-slot wcal-avail wcal-avail-cont${todayCls}"
          onclick="toggleSlot('${dk}','${prevKey.split('|')[1]}')"
          title="Click to remove this 1-hour slot"></td>`;

      } else if (isAvail) {
        /* ── FIRST HALF of a 1-hour availability block — show label + dot ── */
        const todayCls = isToday ? ' wcal-today-slot' : '';
        html += `<td class="wcal-slot wcal-avail wcal-avail-start${todayCls}"
          onclick="toggleSlot('${dk}','${slot.key}')"
          title="Click to remove this 1-hour slot">
          <div class="wcal-avail-block">
            <span class="wcal-avail-dot"></span>
            <span class="wcal-avail-time">${slot.label || slot.key}</span>
          </div>
        </td>`;

      } else {
        /* ── OPEN SLOT — click to create a 1-hour block ── */
        const todayCls = isToday ? ' wcal-today-slot' : '';
        html += `<td class="wcal-slot${todayCls}"
          onclick="toggleSlot('${dk}','${slot.key}')"
          title="Click to mark available: ${slot.label || slot.key} – ${nextHalfKey(slot.key).replace(':00',' hr').replace(':30',' hr 30')}">
        </td>`;
      }
    });

    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

/* ── Show booking detail popup ── */
function showBookingPopup(bookingId) {
  const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  const b   = all.find(x => x.id === bookingId);
  if (!b) return;

  const isDemo = b.status === 'demo' || !b.paymentAmount || b.isDemoStudent;

  // Remove any existing popup
  document.getElementById('calBookingPopup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'calBookingPopup';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;';

  if (isDemo) {
    popup.innerHTML = `
      <div style="background:var(--white);border-radius:20px;padding:28px 32px;max-width:400px;width:100%;box-shadow:0 16px 60px rgba(0,0,0,.25);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--orange-dark);">🎓 Demo Class</div>
          <button onclick="document.getElementById('calBookingPopup').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--light);">✕</button>
        </div>
        <div style="background:var(--orange-light);border-radius:12px;padding:16px;margin-bottom:16px;">
          <div style="font-weight:900;font-size:16px;color:var(--dark);margin-bottom:8px;">${b.studentName}</div>
          <div style="font-size:13px;color:var(--mid);font-weight:700;line-height:1.8;">
            🎓 Grade: <strong>${b.grade || '—'}</strong><br>
            📅 ${b.date || '—'} at ${b.time || '—'}<br>
            📚 Subject: <strong>${b.subject || '—'}</strong>
          </div>
        </div>
        <div style="background:var(--bg);border-radius:12px;padding:14px;margin-bottom:16px;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;color:var(--light);margin-bottom:6px;">📱 Parent / Student Phone</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span id="popupPhone" style="font-size:15px;font-weight:800;color:var(--dark);">${b.whatsapp || b.phone || '—'}</span>
            ${(b.whatsapp || b.phone) ? `<button onclick="copyPhone('${b.whatsapp || b.phone}')" style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:800;cursor:pointer;">📋 Copy</button>` : ''}
          </div>
        </div>
        ${b.classLink ? `<a href="${b.classLink}" target="_blank" style="display:block;background:var(--orange);color:#fff;text-align:center;padding:12px;border-radius:12px;font-weight:900;font-size:14px;text-decoration:none;margin-bottom:10px;">🚀 Join Class</a>` : ''}
        <button onclick="document.getElementById('calBookingPopup').remove()" style="width:100%;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:14px;cursor:pointer;color:var(--mid);">Close</button>
      </div>`;
  } else {
    popup.innerHTML = `
      <div style="background:var(--white);border-radius:20px;padding:28px 32px;max-width:400px;width:100%;box-shadow:0 16px 60px rgba(0,0,0,.25);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--blue);">📚 Paid Class</div>
          <button onclick="document.getElementById('calBookingPopup').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--light);">✕</button>
        </div>
        <div style="background:var(--blue-light);border-radius:12px;padding:16px;margin-bottom:16px;">
          <div style="font-weight:900;font-size:16px;color:var(--dark);margin-bottom:8px;">${b.studentName}</div>
          <div style="font-size:13px;color:var(--mid);font-weight:700;line-height:1.8;">
            📚 Topic: <strong>${b.topic || b.subject || '—'}</strong><br>
            🎓 Grade: <strong>${b.grade || '—'}</strong><br>
            📅 ${b.date || '—'} at ${b.time || '—'}<br>
            ⏱ Duration: <strong>${b.duration || '60 mins'}</strong>
          </div>
        </div>
        ${b.classLink ? `<a href="${b.classLink}" target="_blank" style="display:block;background:var(--blue);color:#fff;text-align:center;padding:12px;border-radius:12px;font-weight:900;font-size:14px;text-decoration:none;margin-bottom:10px;">🚀 Join Class</a>` : ''}
        <button onclick="openEndClassModal('${b.id}')" style="width:100%;background:var(--green);color:#fff;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:14px;cursor:pointer;margin-bottom:10px;">✅ End Class</button>
        <button onclick="document.getElementById('calBookingPopup').remove()" style="width:100%;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:14px;cursor:pointer;color:var(--mid);">Close</button>
      </div>`;
  }

  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
  document.body.appendChild(popup);
}

function copyPhone(phone) {
  navigator.clipboard.writeText(phone)
    .then(() => showToast('📋 Phone number copied!'))
    .catch(() => {
      // Fallback
      const el = document.createElement('textarea');
      el.value = phone;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('📋 Phone number copied!');
    });
}

function changeWeek(dir) { weekOffset += dir; renderWeeklyCalendar(); }

function clearWeekAvailability() {
  const days  = getWeekDates(weekOffset);
  const avail = getAvailability();
  days.forEach(d => {
    const dk = toDateKey(d);
    Object.keys(avail).forEach(k => { if (k.startsWith(dk + '|')) delete avail[k]; });
  });
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
  // Save DOB (Phase 6)
  const dobEl = document.getElementById('pmFieldDob');
  if (dobEl && dobEl.value) {
    localStorage.setItem('sn_dob_' + TUTOR.id, dobEl.value);
  }
  // Run birthday check after saving
  checkBirthdayForUser(TUTOR.id, TUTOR.name.split(' ')[0]);
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

/* ── Sync overview earnings badges (called by tutor-companion.js) ── */
function syncOverviewStats() {
  try {
    const data = JSON.parse(localStorage.getItem('sn_earnings_' + TUTOR.id) || '{}');
    const el1 = document.getElementById('overviewEarnings');
    const el2 = document.getElementById('overviewPoints');
    if (el1) el1.textContent = '$' + (data.earnings || 0).toFixed(0);
    if (el2) el2.textContent = data.points || 0;
  } catch(e) {}
}

/* ── Wire earnings into end class report ── */
const _origSubmitEndClassReport = submitEndClassReport;
submitEndClassReport = function() {
  const outcome = document.querySelector('input[name="classOutcome"]:checked')?.value;
  _origSubmitEndClassReport();
  // Add earnings if completed (tutor-companion.js must be loaded)
  if (outcome === 'completed' && typeof addSessionEarning === 'function') {
    const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    const b   = all.find(x => x.id === activeEndClassId);
    const sessionType = b?.status === 'demo' ? 'demo' : 'paid';
    addSessionEarning(sessionType);
    syncOverviewStats();
  }
};

/* ══════════════════════════════════════════════════════
   PHASE 6 — BIRTHDAY CHECK (shared utility)
   Used by tutor dashboard; same function reused in all
   staff dashboards via their own JS files.
══════════════════════════════════════════════════════ */
function checkBirthdayForUser(userId, firstName) {
  const dob = localStorage.getItem('sn_dob_' + userId);
  if (!dob) return;
  const today = new Date();
  const birth = new Date(dob);
  if (today.getDate() !== birth.getDate() || today.getMonth() !== birth.getMonth()) return;

  const settings = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
  const template = settings.birthdayMsg ||
    'Happy Birthday {name}! 🎉 Wishing you a wonderful day from all of us at StemNest Academy!';
  const msg = template.replace('{name}', firstName || 'there');

  setTimeout(() => {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    popup.innerHTML = `
      <div style="background:var(--white);border-radius:28px;padding:48px 40px;max-width:440px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.35);">
        <div style="font-size:72px;margin-bottom:16px;">🎂</div>
        <div style="font-family:'Fredoka One',cursive;font-size:28px;color:var(--dark);margin-bottom:12px;">Happy Birthday, ${firstName}!</div>
        <div style="font-size:16px;color:var(--mid);line-height:1.7;margin-bottom:24px;">${msg}</div>
        <button onclick="this.closest('div[style]').remove()" style="background:var(--blue);color:#fff;border:none;padding:12px 32px;border-radius:50px;font-family:'Nunito',sans-serif;font-weight:900;font-size:16px;cursor:pointer;">Thank you! 🎉</button>
      </div>`;
    document.body.appendChild(popup);
  }, 2000);
}

// Run birthday check on load for the logged-in tutor
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    checkBirthdayForUser(TUTOR.id, TUTOR.name.split(' ')[0]);
  }, 1500);
});
