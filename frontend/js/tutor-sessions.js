/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — TUTOR SESSION LIFECYCLE (tutor-sessions.js)
   - 15-min join window enforcement
   - Auto-absent if teacher doesn't join
   - End Demo / End Class dialogs
   - Incomplete demo → Pre-Sales flow
   - Completed demo → Sales lead flow
   - Recording link submission
   Loaded after dashboard.js and tutor-companion.js
═══════════════════════════════════════════════════════ */

/* ── HELPERS ── */
function getBookings() {
  try { return JSON.parse(localStorage.getItem('sn_bookings') || '[]'); } catch { return []; }
}
function saveBookings(list) { localStorage.setItem('sn_bookings', JSON.stringify(list)); }

/* Always get the freshest TUTOR object — avoids timing issues */
function getCurrentTutor() {
  try {
    const id       = localStorage.getItem('sn_logged_in_teacher');
    const registry = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
    const found    = id ? registry.find(t => t.id === id) : null;
    return found || (typeof TUTOR !== 'undefined' ? TUTOR : { id: 'CT001' });
  } catch {
    return typeof TUTOR !== 'undefined' ? TUTOR : { id: 'CT001' };
  }
}

/* Get bookings for the currently logged-in teacher */
function getMyBookings() {
  const tutor = getCurrentTutor();
  return getBookings().filter(b =>
    b.assignedTutorId === tutor.id &&
    (b.status === 'scheduled' || b.status === 'completed' || b.status === 'incomplete' || b.status === 'teacher_absent')
  );
}

function parseClassDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  try {
    // Handle "Mon 21 Apr 2026" format
    const clean = dateStr.replace(/^[A-Za-z]+\s/, '');
    // Handle "11:00 AM" format
    const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    let timeISO = timeStr;
    if (m) {
      let h = parseInt(m[1]);
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
      timeISO = String(h).padStart(2,'0') + ':' + m[2] + ':00';
    }
    const dt = new Date(clean + 'T' + timeISO);
    return isNaN(dt) ? null : dt;
  } catch { return null; }
}

function logEmail(to, subject, body) {
  const log = JSON.parse(localStorage.getItem('sn_email_log') || '[]');
  log.unshift({ to, subject, body, sentAt: new Date().toISOString(), status: 'simulated' });
  localStorage.setItem('sn_email_log', JSON.stringify(log));
  console.log('📧 EMAIL TO:', to, '\nSUBJECT:', subject, '\n', body);
}

/* ── SESSION STATE ── */
// Tracks which bookings the teacher has joined (in-memory, per session)
const joinedSessions = new Set();
// Tracks auto-absent timers
const absentTimers = {};

/* ══════════════════════════════════════════════════════
   RENDER LIVE SESSIONS TAB (replaces static HTML)
══════════════════════════════════════════════════════ */
function renderSessionsTab() {
  const el = document.getElementById('sessionsListDynamic');
  if (!el) return;

  const tutor    = getCurrentTutor();
  const allBooks = getBookings();
  const bookings = getMyBookings().sort((a, b) => {
    const da = parseClassDateTime(a.date, a.time) || new Date(0);
    const db = parseClassDateTime(b.date, b.time) || new Date(0);
    return da - db;
  });

  // ── DIAGNOSTIC PANEL ──
  // Shows what's in localStorage so we can see if IDs match
  const diagEl = document.getElementById('sessionsDiagnostic');
  if (diagEl) {
    const myId = tutor.id;
    const allAssigned = allBooks.filter(b => b.assignedTutorId);
    diagEl.innerHTML = allBooks.length === 0
      ? '<div style="background:#fff3e0;border-radius:10px;padding:12px 16px;font-size:13px;font-weight:700;color:#e65100;margin-bottom:12px;">⚠️ No bookings in localStorage at all. Book a demo class first via the free-trial page, then schedule it in Pre-Sales.</div>'
      : bookings.length === 0
        ? '<div style="background:#fde8e8;border-radius:10px;padding:12px 16px;font-size:13px;font-weight:700;color:#c53030;margin-bottom:12px;">' +
          '⚠️ ' + allBooks.length + ' booking(s) exist but none are assigned to teacher ID: <strong>' + myId + '</strong><br>' +
          'Assigned IDs in bookings: <strong>' + (allAssigned.map(b => b.assignedTutorId).join(', ') || 'none') + '</strong><br>' +
          'Make sure Pre-Sales selects this teacher when scheduling.' +
          '</div>'
        : '';
  }

  if (!bookings.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No sessions assigned yet.</div>';
    return;
  }

  const now = new Date();

  el.innerHTML = bookings.map(b => {
    const classTime = parseClassDateTime(b.date, b.time);
    const isDemo    = b.isDemoClass || b.status === 'demo' || !b.paymentAmount;
    const isPast    = b.status === 'completed' || b.status === 'incomplete';
    const minsElapsed = classTime ? Math.floor((now - classTime) / 60000) : -999;
    const hasStarted  = minsElapsed >= 0;
    const canEnd      = joinedSessions.has(b.id); // active once joined
    const typeLabel   = isDemo ? '🎓 Demo' : '📚 Paid';
    const typeCls     = isDemo ? 'sb-demo' : 'sb-paid';

    let statusBadge = '';
    let actions     = '';

    if (isPast) {
      statusBadge = b.status === 'completed'
        ? '<span class="sess-badge sb-done">✅ Completed</span>'
        : '<span class="sess-badge" style="background:#fde8e8;color:#c53030;">❌ Incomplete</span>';
      actions = b.recordingLink
        ? `<a href="${b.recordingLink}" target="_blank" class="ab-btn ab-btn-view" style="font-size:12px;">▶ Recording</a>`
        : '';
    } else {
      statusBadge = hasStarted
        ? '<span class="sess-badge sb-live"><span class="live-dot"></span> Live</span>'
        : '<span class="sess-badge sb-upcoming">Upcoming</span>';

      const joinBtn = `<button class="join-btn" onclick="teacherJoinClass('${b.id}','${b.classLink || ''}')">🚀 Join</button>`;

      const endLabel = isDemo ? '🔴 End Demo' : '🔴 End Class';
      const endBtn   = canEnd
        ? `<button class="end-class-btn" onclick="openEndSessionModal('${b.id}')">${endLabel}</button>`
        : `<button class="end-class-btn" style="opacity:.4;cursor:not-allowed;" title="${joinedSessions.has(b.id) ? 'Available 15 mins after class start' : 'Join class first'}" disabled>${endLabel}</button>`;

      actions = joinBtn + endBtn;
    }

    return `
      <div class="session-item${hasStarted && !isPast ? ' live' : ''}">
        <div class="sess-time">
          <div class="sess-time-val">${b.time?.split(' ')[0] || '—'}</div>
          <div class="sess-time-label">${b.date ? new Date(b.date.replace(/^[A-Za-z]+\s/,'')).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—'}</div>
        </div>
        <div class="sess-divider"></div>
        <div class="sess-info">
          <div class="sess-student">${b.studentName || '—'} <span class="sess-badge ${typeCls}" style="font-size:10px;padding:2px 8px;">${typeLabel}</span></div>
          <div class="sess-subject">${b.subject || '—'} · ${b.grade || '—'} · ${b.duration || '60 mins'}</div>
          ${b.classLink ? `<div style="font-size:11px;color:var(--blue);font-weight:700;margin-top:2px;">🔗 Class link available</div>` : ''}
        </div>
        ${statusBadge}
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">${actions}</div>
      </div>`;
  }).join('');

  // Start auto-absent watchers for upcoming sessions
  getMyBookings().filter(b => b.status === 'scheduled').forEach(b => startAbsentWatcher(b));
}

/* ── TEACHER JOINS CLASS ── */
function teacherJoinClass(bookingId, classLink) {
  // If already joined this session, just re-open the link — no penalty re-log
  const alreadyJoined = joinedSessions.has(bookingId);
  joinedSessions.add(bookingId);

  if (!alreadyJoined) {
    // Record join (start) time for this session
    const startTimes = JSON.parse(localStorage.getItem('sn_session_start_times') || '{}');
    startTimes[bookingId] = new Date().toISOString();
    localStorage.setItem('sn_session_start_times', JSON.stringify(startTimes));

    // First join — check if late (> 4 mins after class start time)
    const b = getBookings().find(x => x.id === bookingId);
    if (b) {
      const classTime   = parseClassDateTime(b.date, b.time);
      const minsElapsed = classTime ? Math.floor((new Date() - classTime) / 60000) : 0;
      // Late = joined more than 4 mins after start
      if (minsElapsed > 4 && typeof logLateJoin === 'function') {
        logLateJoin(bookingId, new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }));
      }
    }
  }
  // Cancel auto-absent timer
  if (absentTimers[bookingId]) {
    clearTimeout(absentTimers[bookingId]);
    delete absentTimers[bookingId];
  }

  // Open class link
  if (classLink) window.open(classLink, '_blank');
  else showToast('No class link set for this session.', 'error');

  // Re-render to enable End Class button after 15 mins
  renderSessionsTab();
  setTimeout(renderSessionsTab, 15 * 60 * 1000 + 1000);
}

/* ── AUTO-ABSENT WATCHER ── */
function startAbsentWatcher(booking) {
  if (absentTimers[booking.id]) return; // already watching
  const classTime = parseClassDateTime(booking.date, booking.time);
  if (!classTime) return;

  const msUntilAbsent = (classTime.getTime() + 15 * 60 * 1000) - Date.now();
  if (msUntilAbsent <= 0) {
    // Already past 15-min window — check if joined
    if (!joinedSessions.has(booking.id)) markTeacherAbsent(booking);
    return;
  }

  absentTimers[booking.id] = setTimeout(() => {
    if (!joinedSessions.has(booking.id)) markTeacherAbsent(booking);
  }, msUntilAbsent);
}

function markTeacherAbsent(booking) {
  const tutor = getCurrentTutor();
  // Update booking
  const all = getBookings();
  const idx = all.findIndex(b => b.id === booking.id);
  if (idx !== -1) {
    all[idx].status         = 'teacher_absent';
    all[idx].teacherAbsent  = true;
    all[idx].absentAt       = new Date().toISOString();
    saveBookings(all);
  }

  // Log to operations
  const ops = JSON.parse(localStorage.getItem('sn_absent_teachers') || '[]');
  ops.unshift({
    id:          'ABS-' + Date.now().toString(36).toUpperCase(),
    bookingId:   booking.id,
    tutorId:     tutor.id,
    tutorName:   tutor.name,
    studentName: booking.studentName,
    subject:     booking.subject,
    date:        booking.date,
    time:        booking.time,
    loggedAt:    new Date().toISOString(),
  });
  localStorage.setItem('sn_absent_teachers', JSON.stringify(ops));

  showToast('⚠️ Session auto-closed — teacher did not join within 15 minutes. Operations notified.', 'error');
  renderSessionsTab();
}

/* ══════════════════════════════════════════════════════
   END SESSION MODAL (Demo + Paid)
══════════════════════════════════════════════════════ */
let activeEndSessionId = null;

function openEndSessionModal(bookingId) {
  activeEndSessionId = bookingId;
  const b = getBookings().find(x => x.id === bookingId);
  if (!b) return;

  const isDemo = b.isDemoClass || !b.paymentAmount;

  // Update modal title
  const titleEl = document.getElementById('endClassModalTitle');
  if (titleEl) titleEl.textContent = isDemo ? '🎓 End Demo Class' : '📋 End Class Report';

  // Update booking info
  const infoEl = document.getElementById('endClassBookingInfo');
  if (infoEl) infoEl.innerHTML =
    `🎓 <strong>${b.studentName}</strong> (${b.grade || '—'}) &nbsp;·&nbsp; ` +
    `📚 <strong>${b.subject}</strong> &nbsp;·&nbsp; ` +
    `📅 ${b.date || '—'} at ${b.time || '—'}`;

  // Reset form
  document.querySelectorAll('input[name="classOutcome"]').forEach(r => r.checked = false);
  const incEl = document.getElementById('incompleteFields');
  const comEl = document.getElementById('completedFields');
  if (incEl) incEl.style.display = 'none';
  if (comEl) comEl.style.display = 'none';

  const reasonEl = document.getElementById('incompleteReason');
  const notesEl  = document.getElementById('classNotes');
  const recEl    = document.getElementById('recordingLink');
  if (reasonEl) reasonEl.value = '';
  if (notesEl)  notesEl.value  = '';
  if (recEl)    recEl.value    = '';

  document.getElementById('endClassModalOverlay').classList.add('open');
}

function closeEndSessionModal() {
  document.getElementById('endClassModalOverlay')?.classList.remove('open');
  activeEndSessionId = null;
}




/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Override showDashTab to render sessions dynamically
  const _origTab = window.showDashTab;
  window.showDashTab = function(tab) {
    _origTab(tab);
    if (tab === 'sessions') renderSessionsTab();
  };

  // Bind close on overlay click
  const overlay = document.getElementById('endClassModalOverlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeEndSessionModal();
    });
  }
});

/* ══════════════════════════════════════════════════════
   OVERVIEW SESSIONS — shows next 4 sessions with Join buttons
══════════════════════════════════════════════════════ */
function renderOverviewSessions() {
  const el = document.getElementById('overviewSessionsList');
  if (!el) return;

  const bookings = getMyBookings().sort((a, b) => {
    const da = parseClassDateTime(a.date, a.time) || new Date(0);
    const db = parseClassDateTime(b.date, b.time) || new Date(0);
    return da - db;
  }).slice(0, 4);

  if (!bookings.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-size:13px;font-weight:700;">No sessions assigned yet.</div>';
    return;
  }

  const now = new Date();
  el.innerHTML = bookings.map(b => {
    const classTime   = parseClassDateTime(b.date, b.time);
    const isDemo      = b.isDemoClass || !b.paymentAmount;
    const isPast      = b.status === 'completed' || b.status === 'incomplete';
    const minsElapsed = classTime ? Math.floor((now - classTime) / 60000) : -999;
    const hasStarted  = minsElapsed >= 0;
    const isJoined    = joinedSessions.has(b.id);
    const typeCls     = isDemo ? 'sb-demo' : 'sb-paid';
    const typeLabel   = isDemo ? '🎓 Demo' : '📚 Paid';

    const badge = isPast
      ? '<span class="sess-badge sb-done">✅ Done</span>'
      : hasStarted
        ? '<span class="sess-badge sb-live"><span class="live-dot"></span> Live</span>'
        : '<span class="sess-badge sb-upcoming">Upcoming</span>';

    let actions = '';
    if (!isPast) {
      actions = '<button class="join-btn" onclick="teacherJoinClass(\'' + b.id + '\',\'' + (b.classLink || '') + '\')">🚀 Join</button>';
      if (isJoined) {
        const endLabel = isDemo ? '🔴 End Demo' : '🔴 End Class';
        actions += '<button class="end-class-btn" onclick="openEndSessionModal(\'' + b.id + '\')">' + endLabel + '</button>';
      }
    }

    const dateLabel = b.date
      ? new Date(b.date.replace(/^[A-Za-z]+\s/, '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '—';

    return '<div class="session-item' + (hasStarted && !isPast ? ' live' : '') + '">' +
      '<div class="sess-time">' +
        '<div class="sess-time-val">' + (b.time ? b.time.split(' ')[0] : '—') + '</div>' +
        '<div class="sess-time-label">' + dateLabel + '</div>' +
      '</div>' +
      '<div class="sess-divider"></div>' +
      '<div class="sess-info">' +
        '<div class="sess-student">' + (b.studentName || '—') + ' <span class="sess-badge ' + typeCls + '" style="font-size:10px;padding:2px 8px;">' + typeLabel + '</span></div>' +
        '<div class="sess-subject">' + (b.subject || '—') + ' · ' + (b.grade || '—') + '</div>' +
      '</div>' +
      badge +
      '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">' + actions + '</div>' +
    '</div>';
  }).join('');
}

/* Wire overview rendering into tab switch and init */
(function() {
  const _origInit = window.showDashTab;
  if (_origInit) {
    const _prev = window.showDashTab;
    window.showDashTab = function(tab) {
      _prev(tab);
      if (tab === 'overview') setTimeout(renderOverviewSessions, 100);
    };
  }
  // Also render on page load
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(renderOverviewSessions, 500);
  });
})();

/* ══════════════════════════════════════════════════════
   DEBUG HELPER — logs session data to console
   Open browser DevTools → Console to see the output
══════════════════════════════════════════════════════ */
function debugSessions() {
  const tutor    = getCurrentTutor();
  const all      = getBookings();
  const mine     = getMyBookings();
  console.group('🔍 StemNest Session Debug');
  console.log('Logged-in teacher ID:', tutor.id, '| Name:', tutor.name);
  console.log('Total bookings in localStorage:', all.length);
  console.log('Bookings assigned to this teacher:', mine.length);
  if (all.length > 0) {
    console.log('All booking assignedTutorIds:', all.map(b => b.assignedTutorId + ' (' + b.studentName + ')'));
  }
  if (mine.length > 0) {
    console.log('My sessions:', mine.map(b => b.studentName + ' | ' + b.date + ' ' + b.time + ' | status:' + b.status));
  } else {
    console.warn('No sessions found for teacher ID:', tutor.id);
    console.warn('Check that assignedTutorId in bookings matches this teacher ID exactly.');
  }
  console.groupEnd();
}

/* Auto-run debug on sessions tab load */
const _origRenderSessionsTab = renderSessionsTab;
renderSessionsTab = function() {
  debugSessions();
  _origRenderSessionsTab();
};

/* ══════════════════════════════════════════════════════
   SEED TEST SESSION — creates a real booking for this
   teacher so sessions tab can be tested immediately
══════════════════════════════════════════════════════ */
function seedTestSession() {
  const tutor = getCurrentTutor();

  // Create a demo booking 1 hour from now
  const classTime = new Date();
  classTime.setHours(classTime.getHours() + 1, 0, 0, 0);

  const dateISO = classTime.toISOString().split('T')[0];
  const h       = classTime.getHours();
  const period  = h >= 12 ? 'PM' : 'AM';
  const h12     = h % 12 === 0 ? 12 : h % 12;
  const timeStr = h12 + ':00 ' + period;

  const booking = {
    id:              'TEST-' + Date.now().toString(36).toUpperCase(),
    studentName:     'Test Student',
    grade:           'Year 9',
    age:             '14',
    subject:         tutor.subject || 'Coding',
    email:           'test@stemnestacademy.co.uk',
    whatsapp:        '+44 7700 000000',
    status:          'scheduled',
    assignedTutor:   tutor.name,
    assignedTutorId: tutor.id,
    classLink:       'https://meet.google.com/test-link',
    date:            dateISO,
    time:            timeStr,
    isDemoClass:     true,
    tutorNotified:   false,
    bookedAt:        new Date().toISOString(),
    scheduledAt:     new Date().toISOString(),
  };

  const all = getBookings();
  all.unshift(booking);
  saveBookings(all);

  renderSessionsTab();
  renderOverviewSessions();
  if (typeof renderUpcomingCards === 'function') renderUpcomingCards();
  showToast('✅ Test session added for ' + tutor.name + ' at ' + timeStr + '!');
}
