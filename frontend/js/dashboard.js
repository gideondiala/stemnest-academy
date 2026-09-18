/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — TUTOR DASHBOARD JS
   Loads logged-in teacher from API session profile,
   weekly availability calendar, photo upload, notifications.
═══════════════════════════════════════════════════════ */

/* ── LOAD LOGGED-IN TUTOR ── */
// Login stores the full tutor profile in sn_current_tutor.
// We read that here — never from the old sn_teachers registry.
function getLoggedInTutor() {
  try {
    const stored = localStorage.getItem('sn_current_tutor');
    if (stored) {
      const t = JSON.parse(stored);
      if (t && t.id) {
        return {
          id:          t.id,
          dbId:        t.dbId || t.id,
          name:        t.name || 'Tutor',
          initials:    t.initials || (t.name || 'T').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(),
          role:        t.role || 'tutor',
          subject:     t.subject || 'Coding',
          email:       t.email || '',
          courses:     t.courses || [],
          gradeGroups: t.gradeGroups || t.grade_groups || [],
          availability:t.availability || '',
          photo:       t.photo || null,
        };
      }
    }
    /* Fallback: blank profile — will be filled by _loadTutorFromAPI */
    const id = localStorage.getItem('sn_logged_in_teacher') || '';
    return { id, name: 'Loading…', initials: '…', role: 'tutor', subject: 'Coding', photo: null };
  } catch {
    return { id: '', name: 'Loading…', initials: '…', role: 'tutor', subject: 'Coding', photo: null };
  }
}

let TUTOR = getLoggedInTutor();
window.TUTOR_DATA = {
  bookings: [],
  materials: []
};

/* ── TABS ── */
const TABS = ['overview', 'sessions', 'projects', 'calendar'];

/* ── AVAILABILITY STORE — synced to DB ── */
function getAvailability() {
  /* Return in-memory cache; populated by _loadAvailabilityFromAPI */
  return window._tutorAvailCache || {};
}

async function _loadAvailabilityFromAPI() {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token || !TUTOR.dbId) return;
    /* Load next 8 weeks of availability */
    const from = new Date().toISOString().split('T')[0];
    const toDate = new Date(); toDate.setDate(toDate.getDate() + 56);
    const to = toDate.toISOString().split('T')[0];
    const res = await fetch(
      `https://api.stemnestacademy.co.uk/api/sessions/availability/${TUTOR.dbId}?from=${from}&to=${to}`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (!res.ok) return;
    const data = await res.json();
    /* Convert DB rows to the key format: "2026-06-01|18:00" → true */
    const cache = {};
    (data.slots || []).forEach(s => {
      const timeKey = s.time_slot.replace(/^(\d{2}:\d{2}):\d{2}$/, '$1'); // strip seconds
      const key = s.date.split('T')[0] + '|' + timeKey;
      cache[key] = s.is_booked ? { booked: true, bookingId: s.booking_id } : true;
    });
    window._tutorAvailCache = cache;
  } catch(e) { console.warn('[Avail] Load failed:', e.message); }
}

async function saveAvailability(avail) {
  window._tutorAvailCache = avail;
  /* Push to API */
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;
    /* Convert cache keys back to slot objects */
    const slots = Object.keys(avail)
      .filter(k => avail[k] === true) // only free slots (not booked)
      .map(k => {
        const [date, time] = k.split('|');
        return { date, time };
      });
    if (slots.length === 0) return;
    await fetch('https://api.stemnestacademy.co.uk/api/sessions/availability', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots })
    });
  } catch(e) { console.warn('[Avail] Save failed:', e.message); }
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
  const avail = getAvailability();
  const key1  = dk + '|' + timeKey;
  const key2  = dk + '|' + nextHalfKey(timeKey);

  if (avail[key1]) {
    delete avail[key1];
    delete avail[key2];
    /* Also delete from DB */
    const token = localStorage.getItem('sn_access_token');
    if (token) {
      fetch('https://api.stemnestacademy.co.uk/api/sessions/availability', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dk })
      }).catch(() => {});
    }
  } else {
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
  
  _loadTutorFromAPI().then(() => {
    _loadAvailabilityFromAPI().then(() => {
      buildCalStrip();
      bindProfileModal();
      showDashTab('overview');
      if (typeof renderUpcomingCards === 'function') renderUpcomingCards();
    });
  });

  /* Auto-refresh bookings every 60 seconds */
  setInterval(() => {
    _loadTutorFromAPI().then(() => {
      if (typeof renderUpcomingCards === 'function') renderUpcomingCards();
      if (typeof renderOverviewSessions === 'function') renderOverviewSessions();
      if (typeof renderSessionsTab === 'function') {
        const sessTab = document.getElementById('tab-sessions');
        if (sessTab && sessTab.style.display !== 'none') renderSessionsTab();
      }
    });
  }, 60000);
});

async function _loadTutorFromAPI() {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;

    /* ── Fetch full tutor profile from API ── */
    const meRes = await fetch('https://api.stemnestacademy.co.uk/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (meRes.ok) {
      const meData = await meRes.json();
      if (meData.user) {
        const u = meData.user;
        /* Also fetch tutor_profiles data */
        const profRes = await fetch('https://api.stemnestacademy.co.uk/api/users/' + u.id, {
          headers: { 'Authorization': 'Bearer ' + token },
        });
        let subject = 'Coding', courses = [], gradeGroups = [], availability = '';
        if (profRes.ok) {
          const profData = await profRes.json();
          if (profData.user) {
            subject      = profData.user.subject      || 'Coding';
            courses      = profData.user.courses      || [];
            gradeGroups  = profData.user.grade_groups || [];
            availability = profData.user.availability || '';
          }
        }

        /* Update TUTOR with real data */
        TUTOR.id          = u.staff_id || u.id;
        TUTOR.dbId        = u.id;
        TUTOR.name        = u.name;
        TUTOR.initials    = u.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
        TUTOR.email       = u.email;
        TUTOR.subject     = subject;
        TUTOR.courses     = courses;
        TUTOR.gradeGroups = gradeGroups;
        TUTOR.availability= availability;
        TUTOR.photo       = u.photo_url || null;

        /* Persist updated profile so other JS files can read it */
        localStorage.setItem('sn_current_tutor', JSON.stringify({
          id: TUTOR.id, dbId: TUTOR.dbId, name: TUTOR.name,
          initials: TUTOR.initials, email: TUTOR.email, role: 'tutor',
          subject, courses, gradeGroups, availability,
        }));

        /* Re-render sidebar with real data */
        renderSidebarProfile();
        populateProfileModal();
      }
    }

    /* ── Fetch bookings for this tutor ── */
    const bRes = await fetch('https://api.stemnestacademy.co.uk/api/bookings?limit=500', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const bData = await bRes.json();
    if (bData.bookings) {
      window.TUTOR_DATA.bookings = bData.bookings.map(b => {
        let notes = {};
        try { notes = typeof b.notes === 'string' ? JSON.parse(b.notes) : (b.notes || {}); } catch {}
        return {
          id:              b.id,
          dbId:            b.id,
          studentName:     b.student_name || notes.studentName || b.lesson_name || '—',
          studentId:       b.student_id || '',
          age:             notes.age || b.grade || '—',
          grade:           b.grade || notes.grade || '—',
          email:           b.student_email || notes.email || '—',
          whatsapp:        notes.whatsapp || notes.phone || b.student_phone || b.whatsapp || '—',
          subject:         b.subject || '—',
          date:            b.date ? b.date.split('T')[0] : '—',
          time:            notes.time || b.time || '—',
          status:          b.status,
          assignedTutor:   b.tutor_name || '—',
          assignedTutorId: b.tutor_staff_id || b.tutor_id || '',
          classLink:       b.class_link || '',
          paidScheduled:   notes.paidScheduled || false,
          isRecurring:     b.is_recurring,
          isDemoClass:     b.is_demo === true,
          paymentAmount:   b.payment_amount,
          lessonName:      b.lesson_title_full || b.lesson_name_full || b.pathway_lesson_title || '',
          lessonNumber:    b.lesson_number_in_grade || b.lesson_number || null,
          totalLessons:    b.total_lessons || null,
          activityLink:    b.lesson_activity || b.activity_link || '',
          slidesLink:      b.lesson_slides   || b.slides_link || '',
          pathwayLessonId: b.pathway_lesson_id || b.pathway_lesson_id_joined || null,
          courseName:      b.course_name || '',
          bookedAt:        b.booked_at || b.created_at,
          scheduledAt:     b.scheduled_at,
          creditsSuspended: b.student_credits_suspended === true || b.student_credits_suspended === 'true',
          batchId:         b.batch_id || notes.batchRef ? (b.batch_id || '') : '',
          batchRef:        notes.batchRef || '',
          isBatchClass:    notes.isBatchClass === true || !!b.batch_id,
        };
      });
    }

    /* ── Render overview stats from real API data ── */
    _renderOverviewStats();

  } catch (e) {
    console.warn('[Dashboard] API load failed:', e.message);
  }
}

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
  const tutorId = TUTOR.id;
  const tutorDbId = TUTOR.dbId;
  const bookings = window.TUTOR_DATA?.bookings || [];
  const mine = bookings.filter(b =>
    b.status === 'scheduled' &&
    (b.assignedTutorId === tutorId || b.assignedTutorId === tutorDbId ||
     b.tutor_staff_id === tutorId  || b.tutor_id === tutorDbId)
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
    const all = window.TUTOR_DATA?.bookings || [];
    const myStaffId = TUTOR.id;    // e.g. CT004
    const myDbId    = TUTOR.dbId;  // UUID
    return all.filter(b => {
      const bid = b.assignedTutorId || '';
      return (
        (myStaffId && bid === myStaffId) ||
        (myDbId    && bid === myDbId)    ||
        (myStaffId && b.tutor_staff_id === myStaffId) ||
        (myDbId    && b.tutor_id === myDbId)
      );
    }).filter(b => b.status === 'scheduled' || b.status === 'completed');
  } catch { return []; }
}

/* Get bookings from API — called by renderWeeklyCalendar if API is available */
async function getTutorBookingsFromAPI() {
  try {
    if (typeof isApiAvailable === 'function' && await isApiAvailable()) {
      const data = await Sessions.upcoming();
      return (data.sessions || []).map(s => ({
        id:              s.id,
        studentName:     s.student_name || '—',
        grade:           s.grade        || '—',
        subject:         s.subject      || '—',
        topic:           s.lesson_name_full || s.lesson_name || s.subject || '—',
        lessonName:      s.lesson_name_full || s.lesson_name || '',
        lessonNumber:    s.lesson_number,
        totalLessons:    s.total_lessons,
        activityLink:    s.lesson_activity || s.activity_link || '',
        slidesLink:      s.lesson_slides   || s.slides_link  || '',
        date:            s.date,
        time:            s.time,
        classLink:       s.class_link || '',
        status:          s.status,
        isDemoClass:     s.is_demo,
        isRecurring:     s.is_recurring,
        paymentAmount:   s.payment_amount,
        assignedTutorId: TUTOR.id,
        courseName:      s.course_name || '',
        _fromApi:        true,
      }));
    }
  } catch (e) { /* fall through */ }
  return null;
}

/* Parse a booking's time string to 24h "HH:MM" */
function parseBookingTime(timeStr) {
  if (!timeStr) return null;
  // Strip seconds if present: "14:00:00" → "14:00"
  const stripped = timeStr.replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
  // Already 24h "HH:MM"
  if (/^\d{1,2}:\d{2}$/.test(stripped)) return stripped.padStart(5, '0');
  // 12h format e.g. "11:00 AM"
  const m = stripped.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
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
        const isDemo  = b.isDemoClass === true;
        const isFirst = slot.mins === bookedEntry.timeMins;
        const isSuspended = b.creditsSuspended === true;

        /* Suspended student — grey slot with warning */
        if (isSuspended) {
          if (isFirst) {
            html += `<td class="wcal-slot wcal-paid-booked"
              style="background:#f5f3ff;border:2px solid #7c3aed;opacity:.85;cursor:pointer;"
              onclick="showSuspendedSlotWarning('${b.id}')"
              title="⚠️ Classes paused — ${b.studentName}">
              <div class="wcal-booked-inner" style="background:transparent;">
                <div class="wcal-booked-label" style="color:#5b21b6;">⚠️ ${b.studentName}</div>
                <div class="wcal-booked-sub" style="color:#7c3aed;">Classes Paused</div>
              </div>
            </td>`;
          } else {
            html += `<td class="wcal-slot wcal-paid-booked wcal-booked-cont"
              style="background:#f5f3ff;border:2px solid #7c3aed;opacity:.85;"
              onclick="showSuspendedSlotWarning('${b.id}')"></td>`;
          }
        } else {

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
            const lessonTitle = b.lessonName || b.topic || '';
            const lessonShort = lessonTitle ? lessonTitle.slice(0, 20) + (lessonTitle.length > 20 ? '…' : '') : (b.subject || '');
            html += `<td class="${cls}" onclick="showBookingPopup('${b.id}')" title="${b.studentName}${lessonTitle ? ' — ' + lessonTitle : ''}">
              <div class="wcal-booked-inner wcal-booked-paid">
                <div class="wcal-booked-label">📚 ${b.studentName}</div>
                <div class="wcal-booked-sub">${lessonShort}${b.lessonNumber ? ' · L' + b.lessonNumber : ''}</div>
                ${rescheduleBtn}
              </div>
            </td>`;
          }
        } else {
          html += `<td class="${cls} wcal-booked-cont" onclick="showBookingPopup('${b.id}')"></td>`;
        }

        } /* end non-suspended else */

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

/* ── Show booking detail popup from calendar slot click ── */
function showBookingPopup(bookingId) {
  const all = window.TUTOR_DATA?.bookings || [];
  const b   = all.find(x => x.id === bookingId);
  if (!b) return;

  const isDemo = b.isDemoClass === true;
  const phone  = b.whatsapp || b.phone || '—';
  // Strip seconds from time
  const timeDisplay = (b.time || '—').replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
  const isJoined = typeof joinedSessions !== 'undefined' && joinedSessions.has(b.id);

  document.getElementById('calBookingPopup')?.remove();
  const popup = document.createElement('div');
  popup.id = 'calBookingPopup';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;';

  if (isDemo) {
    // DEMO popup: student name, grade, date, time, subject, phone (copy), class material link, join, end, close
    popup.innerHTML = `
      <div style="background:var(--white);border-radius:20px;padding:28px 32px;max-width:420px;width:100%;box-shadow:0 16px 60px rgba(0,0,0,.25);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">🎓 DEMO CLASS</span>
          </div>
          <button onclick="document.getElementById('calBookingPopup').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--light);">✕</button>
        </div>
        <div style="background:var(--orange-light);border-radius:12px;padding:16px;margin-bottom:14px;">
          <div style="font-weight:900;font-size:18px;color:var(--dark);margin-bottom:10px;">${b.studentName || '—'}</div>
          <div style="font-size:13px;color:var(--mid);font-weight:700;line-height:2;">
            🎓 Grade: <strong>${b.grade || '—'}</strong><br>
            📚 Subject: <strong>${b.subject || '—'}</strong><br>
            📅 <strong>${b.date || '—'}</strong> at <strong>${timeDisplay}</strong>
          </div>
        </div>
        <div style="background:var(--bg);border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;color:var(--light);margin-bottom:8px;">📱 Parent / Student Phone</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:15px;font-weight:800;color:var(--dark);">${phone}</span>
            ${phone !== '—' ? `<button onclick="copyPhone('${phone}')" style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:800;cursor:pointer;">📋 Copy</button>` : ''}
          </div>
        </div>
        <a href="#" onclick="showToast('Class material page coming soon — will be set up per lesson topic.','info');return false;" style="display:flex;align-items:center;justify-content:space-between;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:12px 16px;text-decoration:none;color:var(--dark);font-weight:800;font-size:13px;margin-bottom:14px;">
          📖 Class Material &amp; Lesson Plan <span style="color:var(--blue);font-size:11px;">Coming Soon ↗</span>
        </a>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          ${b.classLink
            ? `<a href="${b.classLink}" target="_blank" onclick="teacherJoinClass('${b.id}','${b.classLink}')" style="display:block;background:var(--blue);color:#fff;text-align:center;padding:12px;border-radius:12px;font-weight:900;font-size:13px;text-decoration:none;">🚀 Join Class</a>`
            : `<button onclick="showToast('No class link set yet. Contact admin.','error')" style="background:var(--blue);color:#fff;border:none;border-radius:12px;padding:12px;font-weight:900;font-size:13px;cursor:pointer;width:100%;">🚀 Join Class</button>`}
          <button onclick="document.getElementById('calBookingPopup').remove();openEndClassModal('${b.id}')" style="background:var(--orange);color:#fff;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;">🔴 End Demo</button>
        </div>
        <button onclick="document.getElementById('calBookingPopup').remove()" style="width:100%;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:14px;cursor:pointer;color:var(--mid);">Close</button>
      </div>`;
  } else if (b.isBatchClass && b.batchId) {
    /* ── BATCH CLASS popup — fetch members and show student list ── */
    const batchRef  = b.batchRef || 'Batch';
    const lessonTitle = b.lessonName || ('Lesson ' + (b.lessonNumber || ''));
    popup.innerHTML = `
      <div style="background:var(--white);border-radius:20px;padding:28px 32px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 16px 60px rgba(0,0,0,.25);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="background:#e0f0ff;color:var(--blue);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">👥 GROUP CLASS</span>
            <span style="font-family:'Fredoka One',cursive;font-size:14px;color:var(--blue);">${batchRef}</span>
          </div>
          <button onclick="document.getElementById('calBookingPopup').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--light);">✕</button>
        </div>
        <div style="background:var(--blue-light);border-radius:12px;padding:16px;margin-bottom:14px;">
          <div style="font-weight:900;font-size:16px;color:var(--dark);margin-bottom:4px;">${lessonTitle}</div>
          <div style="font-size:13px;color:var(--mid);font-weight:700;line-height:2;">
            📖 <strong>${b.subject || b.courseName || 'Coding'}</strong>${b.lessonNumber ? ' · Lesson ' + b.lessonNumber : ''}<br>
            📅 <strong>${b.date || '—'}</strong> at <strong>${timeDisplay}</strong>
          </div>
        </div>
        <div id="batchPopupStudents" style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;color:var(--light);margin-bottom:8px;">👩‍🎓 Students in this class</div>
          <div id="batchPopupStudentsList" style="font-size:13px;color:var(--light);font-weight:700;">⏳ Loading students…</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          ${b.classLink
            ? `<a href="${b.classLink}" target="_blank" onclick="teacherJoinClass('${b.id}','${b.classLink}')" style="display:block;background:var(--blue);color:#fff;text-align:center;padding:12px;border-radius:12px;font-weight:900;font-size:13px;text-decoration:none;">🚀 Join Class</a>`
            : `<button onclick="showToast('No class link set yet.','error')" style="background:var(--blue);color:#fff;border:none;border-radius:12px;padding:12px;font-weight:900;font-size:13px;cursor:pointer;width:100%;">🚀 Join Class</button>`}
          <button onclick="document.getElementById('calBookingPopup').remove();openEndClassModal('${b.id}')" style="background:var(--green);color:#fff;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;">✅ End Class</button>
        </div>
        <button onclick="document.getElementById('calBookingPopup').remove()" style="width:100%;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:14px;cursor:pointer;color:var(--mid);">Close</button>
      </div>`;

    /* Fetch batch members asynchronously after popup is shown */
    const token = localStorage.getItem('sn_access_token');
    fetch('https://api.stemnestacademy.co.uk/api/batches/' + b.batchId, {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json()).then(data => {
      const listEl = document.getElementById('batchPopupStudentsList');
      if (!listEl) return;
      const members = (data.members || []).filter(m => m.status === 'active');
      if (!members.length) { listEl.textContent = 'No students found.'; return; }
      const pathwayLine = data.batch && data.batch.pathwayName
        ? `<div style="background:#f0fdf4;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:12px;font-weight:700;color:#065f46;">📚 Pathway: ${data.batch.pathwayName}${data.batch.grade_number ? ' · Grade ' + data.batch.grade_number : ''}</div>`
        : '';
      listEl.innerHTML = pathwayLine + members.map(function(m) {
        const phone = m.phone || m.whatsapp || '—';
        const safeName = (m.studentName || '').replace(/'/g, "\\'");
        const safePhone = phone.replace(/'/g, "\\'");
        return `<div style="border:1.5px solid #e8eaf0;border-radius:10px;padding:11px 14px;margin-bottom:8px;">
          <div style="font-weight:900;font-size:14px;color:var(--dark);margin-bottom:4px;">${m.studentName || '—'}</div>
          <div style="font-size:12px;color:var(--mid);font-weight:700;line-height:1.8;">
            🎓 Grade: <strong>${m.grade || '—'}</strong><br>
            🪪 Student ID: <strong>${m.staffId || m.studentId.slice(0,8).toUpperCase()}</strong><br>
            📧 ${m.email || '—'}<br>
            📱 ${phone}${phone !== '—' ? ` <button onclick="navigator.clipboard.writeText('${safePhone}').then(()=>showToast('📋 Copied!')).catch(()=>{var el=document.createElement('input');el.value='${safePhone}';document.body.appendChild(el);el.select();document.execCommand('copy');document.body.removeChild(el);showToast('📋 Copied!');})" style="background:var(--blue);color:#fff;border:none;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:800;cursor:pointer;margin-left:4px;">📋</button>` : ''}
          </div>
        </div>`;
      }).join('');
    }).catch(function() {
      const listEl = document.getElementById('batchPopupStudentsList');
      if (listEl) listEl.textContent = 'Could not load students.';
    });

  } else {
    // PAID popup: topic, date, time, student phone, join, end, reschedule, close
    // If lessonName equals studentName (no pathway linked), fall back to courseName/subject
    const lessonTitle = (b.lessonName && b.lessonName !== b.studentName) ? b.lessonName : null;
    const topic = lessonTitle || b.courseName || b.subject || '—';
    popup.innerHTML = `
      <div style="background:var(--white);border-radius:20px;padding:28px 32px;max-width:440px;width:100%;box-shadow:0 16px 60px rgba(0,0,0,.25);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">📚 PAID CLASS</span>
          </div>
          <button onclick="document.getElementById('calBookingPopup').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--light);">✕</button>
        </div>
        <div style="background:var(--blue-light);border-radius:12px;padding:16px;margin-bottom:14px;">
          <div style="font-weight:900;font-size:16px;color:var(--dark);margin-bottom:4px;">${b.studentName || '—'}</div>
          <div style="font-size:13px;color:var(--mid);font-weight:700;line-height:2;">
            📖 <strong>${topic}</strong>${b.lessonNumber ? ' · Lesson ' + b.lessonNumber + (b.totalLessons ? ' of ' + b.totalLessons : '') : ''}<br>
            🎓 Grade: <strong>${b.grade || '—'}</strong><br>
            📅 <strong>${b.date || '—'}</strong> at <strong>${timeDisplay}</strong><br>
            ⏱ Duration: <strong>${b.duration || '60 mins'}</strong>
          </div>
        </div>
        ${(b.activityLink || b.slidesLink || b.pathwayLessonId) ? `
        <div style="background:var(--bg);border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;color:var(--light);margin-bottom:8px;">📎 Class Resources</div>
          ${b.pathwayLessonId ? `<a href="/pages/lesson-materials.html?lessonId=${b.pathwayLessonId}&bookingId=${b.id}" target="_blank" style="display:flex;align-items:center;gap:8px;background:#dbeafe;border:1.5px solid var(--blue);border-radius:10px;padding:10px 14px;text-decoration:none;color:var(--blue);font-weight:900;font-size:13px;margin-bottom:8px;">📖 View Lesson Materials <span style="margin-left:auto;font-size:11px;">Open ↗</span></a>` : ''}
          ${b.activityLink ? `<a href="${b.activityLink}" target="_blank" style="display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #e8eaf0;border-radius:10px;padding:10px 14px;text-decoration:none;color:var(--dark);font-weight:800;font-size:13px;margin-bottom:8px;">🔗 Activity / Class Material <span style="margin-left:auto;color:var(--blue);font-size:11px;">Open ↗</span></a>` : ''}
          ${b.slidesLink ? `<a href="${b.slidesLink}" target="_blank" style="display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #e8eaf0;border-radius:10px;padding:10px 14px;text-decoration:none;color:var(--dark);font-weight:800;font-size:13px;">📊 Slides <span style="margin-left:auto;color:var(--blue);font-size:11px;">Open ↗</span></a>` : ''}
        </div>` : ''}
        <div style="background:var(--bg);border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;color:var(--light);margin-bottom:8px;">📱 Student Phone</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:15px;font-weight:800;color:var(--dark);">${phone}</span>
            ${phone !== '—' ? `<button onclick="copyPhone('${phone}')" style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:800;cursor:pointer;">📋 Copy</button>` : ''}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          ${b.classLink
            ? `<a href="${b.classLink}" target="_blank" onclick="teacherJoinClass('${b.id}','${b.classLink}')" style="display:block;background:var(--blue);color:#fff;text-align:center;padding:12px;border-radius:12px;font-weight:900;font-size:13px;text-decoration:none;">🚀 Join Class</a>`
            : `<button onclick="showToast('No class link set yet. Contact admin.','error')" style="background:var(--blue);color:#fff;border:none;border-radius:12px;padding:12px;font-weight:900;font-size:13px;cursor:pointer;width:100%;">🚀 Join Class</button>`}
          <button onclick="document.getElementById('calBookingPopup').remove();openEndClassModal('${b.id}')" style="background:var(--green);color:#fff;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;">✅ End Class</button>
        </div>
        <button onclick="document.getElementById('calBookingPopup').remove(); setTimeout(function(){ openRescheduleModal('${b.id}'); }, 50)" style="width:100%;background:var(--bg);border:1.5px solid var(--blue);border-radius:12px;padding:10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;cursor:pointer;color:var(--blue);margin-bottom:10px;">🔄 Reschedule Class</button>
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
      const el = document.createElement('textarea');
      el.value = phone;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('📋 Phone number copied!');
    });
}

/* ── Suspended student slot warning popup (tutor calendar) ── */
function showSuspendedSlotWarning(bookingId) {
  const all = window.TUTOR_DATA?.bookings || [];
  const b   = all.find(x => x.id === bookingId);
  const name = b ? b.studentName : 'This student';

  document.getElementById('suspendedSlotPopup')?.remove();
  const popup = document.createElement('div');
  popup.id = 'suspendedSlotPopup';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;';
  popup.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:32px;max-width:400px;width:100%;box-shadow:0 16px 60px rgba(0,0,0,.25);text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">🔒</div>
      <div style="font-family:'Fredoka One',cursive;font-size:22px;color:#5b21b6;margin-bottom:10px;">Classes Paused</div>
      <div style="font-size:14px;color:#4a5568;font-weight:700;line-height:1.7;margin-bottom:20px;">
        <strong>${name}</strong>'s live class access is currently paused due to insufficient credits.<br><br>
        Please advise the parent to top up their credits to resume classes.<br><br>
        <span style="background:#f5f3ff;color:#7c3aed;padding:6px 14px;border-radius:50px;font-size:12px;font-weight:900;">The class slot remains visible but is not joinable</span>
      </div>
      <button onclick="document.getElementById('suspendedSlotPopup').remove()"
        style="background:#7c3aed;color:#fff;border:none;border-radius:12px;padding:12px 32px;font-family:'Nunito',sans-serif;font-weight:900;font-size:14px;cursor:pointer;width:100%;">
        OK, Got It
      </button>
    </div>`;
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
  document.body.appendChild(popup);
}

function changeWeek(dir) { weekOffset += dir; renderWeeklyCalendar(); }

function clearWeekAvailability() {
  const days  = getWeekDates(weekOffset);
  const avail = getAvailability();
  const token = localStorage.getItem('sn_access_token');
  days.forEach(d => {
    const dk = toDateKey(d);
    Object.keys(avail).forEach(k => { if (k.startsWith(dk + '|')) delete avail[k]; });
    /* Delete from DB */
    if (token) {
      fetch('https://api.stemnestacademy.co.uk/api/sessions/availability', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dk })
      }).catch(() => {});
    }
  });
  window._tutorAvailCache = avail;
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

async function saveProfile() {
  const name      = document.getElementById('pmFieldName')?.value.trim();
  const email     = document.getElementById('pmFieldEmail')?.value.trim();
  const phone     = document.getElementById('pmFieldPhone')?.value.trim();
  const subjects  = document.getElementById('pmFieldSubjects')?.value.trim();
  const ageGroups = document.getElementById('pmFieldAgeGroups')?.value.trim();
  const bio       = document.getElementById('pmFieldBio')?.value.trim();
  const newPw     = document.getElementById('pmFieldPassword')?.value;
  const dob       = document.getElementById('pmFieldDob')?.value;

  if (!name || !email) { showToast('Name and email are required.', 'error'); return; }

  const token = localStorage.getItem('sn_access_token');
  if (!token || !TUTOR.dbId) { showToast('Session expired. Please log in again.', 'error'); return; }

  /* Disable save button */
  const saveBtn = document.querySelector('#profileModalOverlay .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Saving…'; }

  try {
    /* Build update payload — only include fields that have values */
    const payload = { name };
    if (phone)  payload.phone = phone;
    if (bio)    payload.bio   = bio;
    if (dob)    payload.date_of_birth = dob;

    const res = await fetch('https://api.stemnestacademy.co.uk/api/users/' + TUTOR.dbId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!data.success) {
      showToast('Failed to save: ' + (data.error || 'unknown error'), 'error');
      return;
    }

    /* Change password if provided */
    if (newPw && newPw.length >= 8) {
      const currentPw = document.getElementById('pmFieldCurrentPassword')?.value || '';
      if (!currentPw) {
        showToast('Enter your current password to change it.', 'error');
        return;
      }
      const pwRes = await fetch('https://api.stemnestacademy.co.uk/api/users/' + TUTOR.dbId + '/password', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const pwData = await pwRes.json();
      if (!pwData.success) {
        showToast('Password change failed: ' + (pwData.error || 'unknown error'), 'error');
        return;
      }
    }

    /* Update local TUTOR object with saved values */
    TUTOR.name     = name;
    TUTOR.email    = email;
    TUTOR.phone    = phone;
    TUTOR.bio      = bio;
    TUTOR.initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

    /* Persist updated profile to localStorage so other tabs read it */
    const stored = JSON.parse(localStorage.getItem('sn_current_tutor') || '{}');
    stored.name     = name;
    stored.email    = email;
    stored.phone    = phone;
    stored.bio      = bio;
    stored.initials = TUTOR.initials;
    localStorage.setItem('sn_current_tutor', JSON.stringify(stored));

    /* Also update sn_api_user so nav shows correct name */
    const apiUser = JSON.parse(localStorage.getItem('sn_api_user') || '{}');
    apiUser.name = name;
    localStorage.setItem('sn_api_user', JSON.stringify(apiUser));

    /* Save DOB locally for birthday check */
    if (dob) localStorage.setItem('sn_dob_' + TUTOR.id, dob);

    renderSidebarProfile();
    setGreeting();
    closeProfileModal();
    showToast('✅ Profile saved successfully!');

    /* Run birthday check after saving */
    checkBirthdayForUser(TUTOR.id, TUTOR.name.split(' ')[0]);

  } catch (err) {
    showToast('Network error — please check your connection.', 'error');
    console.error('[saveProfile]', err);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes ✦'; }
  }
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
  const all = window.TUTOR_DATA?.bookings || JSON.parse(localStorage.getItem('sn_bookings') || '[]');
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

  /* activeEndClassId is set by openEndClassModal() for calendar popup flow.
     window.activeEndClassId is set by the V2 dialog flow (tutor-sessions-v2.js).
     Use whichever is available — both point to the same booking UUID. */
  const bookingId = activeEndClassId || window.activeEndClassId || null;
  const payload = {
    outcome,
    incompleteReason: outcome === 'incomplete' ? (document.getElementById('incompleteReason')?.value.trim() || '') : '',
    classQuality:     outcome === 'completed'  ? (document.getElementById('classQuality')?.value || '') : '',
    studentInterest:  outcome === 'completed'  ? (document.getElementById('studentInterest')?.value || '') : '',
    purchasingPower:  outcome === 'completed'  ? (document.getElementById('purchasingPower')?.value || '') : '',
    notes:            outcome === 'completed'  ? (document.getElementById('classNotes')?.value.trim() || '') : '',
    recordingLink:    document.getElementById('recordingLink')?.value.trim() || '',
  };

  if (!bookingId || bookingId === 'null') {
    showToast('⚠️ Unable to identify the booking. Please close and try again.', 'error');
    return;
  }

  const token = localStorage.getItem('sn_access_token');

  /* Disable submit button to prevent double-submit */
  const submitBtn = document.querySelector('#endClassModalOverlay .btn-primary');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ Submitting...'; }

  /* POST to backend API — all data persists to DB, never localStorage */
  fetch('https://api.stemnestacademy.co.uk/api/bookings/' + bookingId + '/report', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  .then(r => r.json())
  .then(data => {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Report ✦'; }
    if (!data.success) {
      showToast('⚠️ Failed to save report: ' + (data.error || 'unknown error'), 'error');
      return;
    }

    /* Update in-memory TUTOR_DATA so the session card reflects completed status immediately */
    if (window.TUTOR_DATA && window.TUTOR_DATA.bookings) {
      const bi = window.TUTOR_DATA.bookings.findIndex(b => b.id === bookingId);
      if (bi !== -1) {
        window.TUTOR_DATA.bookings[bi].status = outcome;
        window.TUTOR_DATA.bookings[bi].classReport = payload;
      }
    }

    closeEndClassModal();
    showToast(outcome === 'completed'
      ? '✅ Class marked complete! Report saved.'
      : '📋 Incomplete report submitted.');

    /* Trigger earnings recording if completed */
    if (outcome === 'completed' && typeof addSessionEarning === 'function') {
      const b = window.TUTOR_DATA?.bookings?.find(x => x.id === bookingId);
      addSessionEarning(b?.isDemoClass ? 'demo' : 'paid');
      syncOverviewStats();
    }

    /* Re-render sessions to show updated status */
    if (typeof renderSessionsTab === 'function')     renderSessionsTab();
    if (typeof renderOverviewSessions === 'function') renderOverviewSessions();
    if (typeof renderUpcomingCards === 'function')    renderUpcomingCards();
  })
  .catch(err => {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Report ✦'; }
    showToast('⚠️ Network error — please check your connection and try again.', 'error');
    console.error('[EndClass] API call failed:', err);
  });
}

/* ── Sync overview earnings badges (called after end class report) ── */
function syncOverviewStats() {
  try {
    const el1 = document.getElementById('overviewEarnings');
    const el2 = document.getElementById('overviewPoints');
    if (el1 && window.TUTOR_DATA?.earnings !== undefined)
      el1.textContent = '£' + (parseFloat(window.TUTOR_DATA.earnings) || 0).toFixed(0);
    if (el2 && window.TUTOR_DATA?.points !== undefined)
      el2.textContent = window.TUTOR_DATA.points || 0;
  } catch(e) {}
}

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

/* ══════════════════════════════════════════════════════
   OVERVIEW STATS — computed from real API bookings data
   Called after _loadTutorFromAPI() populates TUTOR_DATA
══════════════════════════════════════════════════════ */
function _renderOverviewStats() {
  try {
    const bookings = window.TUTOR_DATA?.bookings || [];
    const todayStr = new Date().toISOString().split('T')[0];

    /* Sessions today: scheduled bookings whose date is today */
    const todayBookings = bookings.filter(b => {
      const d = (b.date || '').split('T')[0];
      return d === todayStr && (b.status === 'scheduled' || b.status === 'completed');
    });
    const el = document.getElementById('statSessionsToday');
    if (el) el.textContent = todayBookings.length;
    const trendEl = document.getElementById('statSessionsTrend');
    if (trendEl) trendEl.textContent = todayBookings.length === 0 ? 'No classes today' : todayBookings.length + ' class' + (todayBookings.length !== 1 ? 'es' : '') + ' today';

    /* Live earnings — load from tutor_profiles.earnings via API */
    const token = localStorage.getItem('sn_access_token');
    if (token && TUTOR.dbId) {
      fetch('https://api.stemnestacademy.co.uk/api/users/' + TUTOR.dbId, {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(r => r.json()).then(d => {
        if (d.user) {
          const earnings = parseFloat(d.user.earnings || 0).toFixed(2);
          const points   = d.user.points   || 0;

          const earningsEl = document.getElementById('overviewEarnings');
          if (earningsEl) earningsEl.textContent = '£' + earnings;
          const liveEl = document.getElementById('liveEarnings');
          if (liveEl) liveEl.textContent = '£' + earnings;

          const pointsEl = document.getElementById('overviewPoints');
          if (pointsEl) pointsEl.textContent = points;
          const totalPointsEl = document.getElementById('totalPoints');
          if (totalPointsEl) totalPointsEl.textContent = points;

          /* Store in TUTOR_DATA for other functions */
          window.TUTOR_DATA.earnings = earnings;
          window.TUTOR_DATA.points   = points;
        }
      }).catch(() => {});
    }

    /* Projects pending count — from tutor-projects API */
    if (token && TUTOR.dbId) {
      fetch('https://api.stemnestacademy.co.uk/api/projects?tutorId=' + TUTOR.dbId + '&status=pending', {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(r => r.json()).then(d => {
        const count = (d.projects || []).length;
        const projEl = document.getElementById('statProjectsPending');
        if (projEl) projEl.textContent = count;
        const projBadgeEl = document.getElementById('projectsTabBadge');
        if (projBadgeEl) projBadgeEl.textContent = count + ' pending review';
        const qaSubEl = document.getElementById('qaProjectsSub');
        if (qaSubEl) qaSubEl.textContent = count === 0 ? 'No submissions waiting' : count + ' submission' + (count !== 1 ? 's' : '') + ' waiting';
      }).catch(() => {
        /* If projects API doesn't support this filter yet, show 0 */
        const projEl = document.getElementById('statProjectsPending');
        if (projEl) projEl.textContent = '0';
        const projBadgeEl = document.getElementById('projectsTabBadge');
        if (projBadgeEl) projBadgeEl.textContent = '—';
        const qaSubEl = document.getElementById('qaProjectsSub');
        if (qaSubEl) qaSubEl.textContent = 'Check projects tab';
      });
    }

  } catch(e) {
    console.warn('[Stats] Failed to render overview stats:', e.message);
  }
}
