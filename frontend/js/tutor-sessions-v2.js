/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — TUTOR SESSIONS V2 (tutor-sessions-v2.js)
   Teacher dashboard session cards and end-class logic.
   Depends on: utils.js, dashboard.js, tutor-sessions.js
═══════════════════════════════════════════════════════ */

/* ── Safe wrappers: work even if tutor-sessions.js hasn't fully run yet ── */
function _safeGetCurrentTutor() {
  if (typeof getCurrentTutor === 'function') return getCurrentTutor();
  try {
    var id  = localStorage.getItem('sn_logged_in_teacher');
    var reg = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
    var f   = id ? reg.find(function(t) { return t.id === id; }) : null;
    return f || { id: id || 'CT001', name: 'Teacher', subject: 'Coding' };
  } catch(e) { return { id: 'CT001', name: 'Teacher', subject: 'Coding' }; }
}

function _safeGetMyBookings() {
  if (typeof getMyBookings === 'function') return getMyBookings();
  try {
    var tutor = _safeGetCurrentTutor();
    var all   = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    return all.filter(function(b) {
      return b.assignedTutorId === tutor.id &&
        (b.status === 'scheduled' || b.status === 'completed' || b.status === 'incomplete');
    });
  } catch(e) { return []; }
}

function _safeParseClassDateTime(dateStr, timeStr) {
  if (typeof parseClassDateTime === 'function') return parseClassDateTime(dateStr, timeStr);
  if (!dateStr || !timeStr) return null;
  try {
    var clean = dateStr.replace(/^[A-Za-z]+\s/, '');
    var m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    var timeISO = timeStr;
    if (m) {
      var h = parseInt(m[1]);
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
      timeISO = String(h).padStart(2,'0') + ':' + m[2] + ':00';
    }
    var dt = new Date(clean + 'T' + timeISO);
    return isNaN(dt) ? null : dt;
  } catch(e) { return null; }
}



/* ─────────────────────────────────────────────────────
   1. PAY RATES
───────────────────────────────────────────────────── */
function getPayRates() {
  try {
    var settings = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
    return {
      demo: (settings.demoPayRate !== undefined) ? Number(settings.demoPayRate) : 5,
      paid: (settings.paidPayRate !== undefined) ? Number(settings.paidPayRate) : 20
    };
  } catch (e) {
    return { demo: 5, paid: 20 };
  }
}

/* ─────────────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────────────── */

/** Add earnings to the current tutor's running total */
function _addEarnings(amount) {
  if (!amount || amount <= 0) return;
  var tutor = getCurrentTutor();
  var key   = 'sn_earnings_' + tutor.id;
  var data  = JSON.parse(localStorage.getItem(key) || '{"total":0,"sessions":[]}');
  data.total = (data.total || 0) + amount;
  localStorage.setItem(key, JSON.stringify(data));

  // Also update the shared teacher record
  try {
    var teachers = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
    var idx = teachers.findIndex(function(t) { return t.id === tutor.id; });
    if (idx !== -1) {
      teachers[idx].earnings = (teachers[idx].earnings || 0) + amount;
      localStorage.setItem('sn_teachers', JSON.stringify(teachers));
    }
  } catch (e) { /* silent */ }

  // Refresh overview earnings display
  var earningsEl = document.getElementById('overviewEarnings');
  if (earningsEl) earningsEl.textContent = '\u00a3' + (data.total || 0).toFixed(2);
  var liveEl = document.getElementById('liveEarnings');
  if (liveEl) liveEl.textContent = '\u00a3' + (data.total || 0).toFixed(2);
}

/** Deduct 1 credit from a student booking and log the transaction */
function _deductStudentCredit(booking) {
  try {
    // Update sn_students registry
    var students = JSON.parse(localStorage.getItem('sn_students') || '[]');
    var idx = students.findIndex(function(s) {
      return s.email === booking.email || s.id === booking.studentId;
    });
    if (idx !== -1) {
      students[idx].credits = (parseInt(students[idx].credits) || 0) - 1;
      localStorage.setItem('sn_students', JSON.stringify(students));
    }

    // Also update booking record
    var bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    var bi = bookings.findIndex(function(b) { return b.id === booking.id; });
    if (bi !== -1) {
      bookings[bi].studentCredits = (parseInt(bookings[bi].studentCredits) || 0) - 1;
      localStorage.setItem('sn_bookings', JSON.stringify(bookings));
    }

    // Log the deduction in the student's credit log (append-only)
    var studentKey = booking.studentId || booking.email || booking.id;
    var logKey = 'sn_credit_log_' + studentKey;
    var log = [];
    try { log = JSON.parse(localStorage.getItem(logKey) || '[]'); } catch(e) {}
    log.push({
      id:          'TXN-' + Date.now().toString(36).toUpperCase(),
      type:        'class_deduction',
      description: 'Class completed — 1 credit used',
      credits:     -1,
      date:        new Date().toISOString(),
      loggedAt:    new Date().toISOString(),
      bookingId:   booking.id,
      _readonly:   true,
    });
    localStorage.setItem(logKey, JSON.stringify(log));
  } catch (e) { /* silent */ }
}

/** Mark a booking with a given status and save */
function _updateBookingStatus(bookingId, status, extra) {
  try {
    var all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    var idx = all.findIndex(function(b) { return b.id === bookingId; });
    if (idx !== -1) {
      all[idx].status = status;
      if (extra) {
        Object.keys(extra).forEach(function(k) { all[idx][k] = extra[k]; });
      }
      localStorage.setItem('sn_bookings', JSON.stringify(all));
    }
  } catch (e) { /* silent */ }
}

/** Auto-reschedule a booking by adding 7 days */
function _rescheduleBooking(bookingId) {
  try {
    var all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    var idx = all.findIndex(function(b) { return b.id === bookingId; });
    if (idx !== -1) {
      var b = all[idx];
      var classTime = parseClassDateTime(b.date, b.time);
      if (classTime) {
        var newDate = new Date(classTime.getTime() + 7 * 24 * 60 * 60 * 1000);
        var days    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        var months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var dayName = days[newDate.getDay()];
        var dd      = newDate.getDate();
        var mon     = months[newDate.getMonth()];
        var yyyy    = newDate.getFullYear();
        all[idx].date          = dayName + ' ' + dd + ' ' + mon + ' ' + yyyy;
        all[idx].status        = 'scheduled';
        all[idx].rescheduledAt = new Date().toISOString();
        all[idx].rescheduledFrom = b.date;
        localStorage.setItem('sn_bookings', JSON.stringify(all));
      }
    }
  } catch (e) { /* silent */ }
}

/** Remove a dynamically created modal overlay from the DOM */
function _removeModal(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
}

/** Common modal container styles */
function _overlayStyle() {
  return 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;' +
         'display:flex;align-items:center;justify-content:center;padding:20px;';
}
function _modalStyle() {
  return 'background:var(--white,#fff);border-radius:20px;padding:32px;' +
         'max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);' +
         'font-family:\'Nunito\',sans-serif;position:relative;';
}
function _titleStyle() {
  return 'font-family:\'Fredoka One\',cursive;font-size:22px;color:var(--dark,#1a202c);margin-bottom:16px;';
}
function _btnPrimary(extra) {
  return 'background:var(--blue,#1a56db);color:#fff;border:none;border-radius:12px;' +
         'padding:12px 24px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:14px;' +
         'cursor:pointer;' + (extra || '');
}
function _btnOutline(extra) {
  return 'background:transparent;color:var(--dark,#1a202c);border:2px solid #e8eaf0;border-radius:12px;' +
         'padding:12px 24px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:14px;' +
         'cursor:pointer;' + (extra || '');
}
function _btnDanger(extra) {
  return 'background:#c53030;color:#fff;border:none;border-radius:12px;' +
         'padding:12px 24px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:14px;' +
         'cursor:pointer;' + (extra || '');
}

/* ─────────────────────────────────────────────────────
   2. RENDER UPCOMING CARDS
───────────────────────────────────────────────────── */

/**
 * Renders the next 3 upcoming sessions as cards into #upcomingSessionCards.
 * If no real bookings exist, shows placeholder cards so the UI is always visible.
 */
function renderUpcomingCards() {
  var tutor = _safeGetCurrentTutor();
  var now   = new Date();

  /* ── Step 1: get bookings from sn_bookings (assigned by Pre-Sales) ── */
  var fromBookings = _safeGetMyBookings()
    .filter(function(b) { return b.status === 'scheduled'; });

  /* ── Step 2: get booked slots from the calendar store ── */
  var fromCalendar = [];
  try {
    var allAvail = JSON.parse(localStorage.getItem('sn_all_tutor_avail') || '{}');
    var tutorSlots = (allAvail[tutor.id] && allAvail[tutor.id].slots) || {};
    // Also check personal store
    var personalSlots = JSON.parse(localStorage.getItem('sn_tutor_avail_' + tutor.id) || '{}');
    var merged = Object.assign({}, tutorSlots, personalSlots);

    Object.keys(merged).forEach(function(key) {
      var val = merged[key];
      // A booked slot has { booked: true, bookingId: '...' }
      if (val && typeof val === 'object' && val.booked) {
        var parts = key.split('|');
        if (parts.length !== 2) return;
        var dateKey = parts[0];
        var timeKey = parts[1];

        // Only include :00 slots (start of 1-hr block, not the :30 continuation)
        if (timeKey.indexOf(':30') !== -1) return;

        // Skip slots whose booking is already completed/incomplete
        if (val.bookingId) {
          var allBk = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
          var bk = allBk.find(function(b) { return b.id === val.bookingId; });
          if (bk && (bk.status === 'completed' || bk.status === 'incomplete' ||
              bk.status === 'partially_completed' || bk.status === 'cancelled' ||
              bk.status === 'teacher_absent')) return;
        }

        // Convert timeKey "H:MM" to 12h display
        var hh = parseInt(timeKey.split(':')[0]);
        var mm = timeKey.split(':')[1] || '00';
        var period = hh >= 12 ? 'PM' : 'AM';
        var h12 = hh % 12 === 0 ? 12 : hh % 12;
        var timeDisplay = h12 + ':' + mm + ' ' + period;

        // Find matching booking in sn_bookings if bookingId exists
        var matchedBooking = null;
        if (val.bookingId) {
          var allBookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
          matchedBooking = allBookings.find(function(b) { return b.id === val.bookingId; });
        }

        // Build a synthetic session object from calendar slot
        fromCalendar.push({
          id:              val.bookingId || ('CAL-' + dateKey + '-' + timeKey),
          studentName:     matchedBooking ? matchedBooking.studentName : 'Student',
          grade:           matchedBooking ? matchedBooking.grade : '',
          subject:         matchedBooking ? matchedBooking.subject : (tutor.subject || 'Class'),
          topic:           matchedBooking ? (matchedBooking.topic || matchedBooking.subject) : '',
          date:            dateKey,
          time:            timeDisplay,
          classLink:       matchedBooking ? matchedBooking.classLink : '',
          isDemoClass:     matchedBooking ? (matchedBooking.isDemoClass || !matchedBooking.paymentAmount) : false,
          paymentAmount:   matchedBooking ? matchedBooking.paymentAmount : null,
          status:          'scheduled',
          _fromCalendar:   true,
        });
      }
    });
  } catch(e) { /* silent */ }

  /* ── Step 3: merge, deduplicate, sort, take first 3 ── */
  var seen = {};
  var all  = [];

  fromBookings.forEach(function(b) {
    if (!seen[b.id]) { seen[b.id] = true; all.push(b); }
  });
  fromCalendar.forEach(function(b) {
    if (!seen[b.id]) { seen[b.id] = true; all.push(b); }
  });

  all.sort(function(a, b) {
    var da = _safeParseClassDateTime(a.date, a.time) || new Date(0);
    var db = _safeParseClassDateTime(b.date, b.time) || new Date(0);
    return da - db;
  });

  var bookings = all.slice(0, 3);

  // Debug: log what was found
  console.log('[Sessions] Teacher:', tutor.id, tutor.name,
    '| sn_bookings matches:', fromBookings.length,
    '| calendar slots:', fromCalendar.length,
    '| total after merge:', all.length);

  /* ── Step 4: render each card ── */
  var colors = ['#1a56db', '#0e9f6e', '#ff6b35'];
  var titles = ['Current Class', 'Next Class', 'Next Class'];

  for (var idx = 0; idx < 3; idx++) {
    var card = document.getElementById('sessionCard' + idx);
    if (!card) continue;
    var b = bookings[idx];

    if (!b) {
      card.style.borderTopColor = colors[idx];
      card.innerHTML =
        '<div style="font-family:\'Fredoka One\',cursive;font-size:12px;color:' + colors[idx] + ';text-transform:uppercase;letter-spacing:.5px;">' + titles[idx] + '</div>' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:18px;color:#1a202c;">No session</div>' +
        '<div style="font-size:13px;font-weight:700;color:#a0aec0;flex:1;">No class scheduled yet.</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button style="background:#0e9f6e;color:#fff;border:none;border-radius:12px;padding:10px 14px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:not-allowed;flex:1;opacity:.4;" disabled>Join</button>' +
          '<button style="background:#c53030;color:rgba(255,255,255,.4);border:none;border-radius:12px;padding:10px 14px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:not-allowed;flex:1;opacity:.4;" disabled>End</button>' +
        '</div>';
      continue;
    }

    var classTime   = _safeParseClassDateTime(b.date, b.time);
    var isDemo      = b.isDemoClass || !b.paymentAmount;
    var topic       = isDemo ? 'Demo Class' : (b.topic || b.subject || 'Class');
    var minsElapsed = classTime ? Math.floor((now - classTime) / 60000) : -999;
    var hasJoined   = typeof joinedSessions !== 'undefined' && joinedSessions.has(b.id);
    var canEnd      = minsElapsed >= 15 && hasJoined;
    var accent      = isDemo ? '#ff6b35' : colors[idx];

    var dateDisplay = b.date || '';
    try {
      var clean = b.date.replace(/^[A-Za-z]+\s/, '');
      var d = new Date(clean + 'T12:00:00');
      if (!isNaN(d)) dateDisplay = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
    } catch(e) {}

    var endStyle = canEnd
      ? 'background:#c53030;color:#fff;border:none;border-radius:12px;padding:10px 14px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;flex:1;'
      : 'background:#c53030;color:rgba(255,255,255,.45);border:none;border-radius:12px;padding:10px 14px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:not-allowed;flex:1;opacity:.65;';
    var endAttr = canEnd
      ? 'onclick="openEndClassDialogV2(\'' + b.id + '\')"'
      : 'disabled title="' + (!hasJoined ? 'Join class first' : 'Active 15 mins after start') + '"';

    card.style.borderTopColor = accent;
    card.innerHTML =
      '<div style="font-family:\'Fredoka One\',cursive;font-size:12px;color:' + accent + ';text-transform:uppercase;letter-spacing:.5px;">' + titles[idx] + '</div>' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:18px;color:#1a202c;line-height:1.2;">' + (b.studentName || 'Student') + '</div>' +
      '<div style="font-size:13px;font-weight:700;color:#4a5568;">&#128336; ' + (b.time || '') + ' &middot; ' + dateDisplay + '</div>' +
      '<div style="font-size:13px;font-weight:700;color:#4a5568;">' + (isDemo ? '&#127891;' : '&#128218;') + ' ' + topic + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:auto;">' +
        '<button style="background:#0e9f6e;color:#fff;border:none;border-radius:12px;padding:10px 14px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;flex:1;" ' +
        'onclick="teacherJoinClass(\'' + b.id + '\',\'' + (b.classLink || '') + '\')">&#128640; Join</button>' +
        '<button style="' + endStyle + '" ' + endAttr + '>&#128308; End</button>' +
      '</div>';
  }
}

/* ─────────────────────────────────────────────────────
   3. END CLASS DIALOG V2 — Confirmation + Outcome
───────────────────────────────────────────────────── */

/**
 * Opens a modal asking "Are you sure you want to end class?"
 * On Yes, shows outcome options: Completed / Incomplete / Partially Completed
 */
function openEndClassDialogV2(bookingId) {
  _removeModal('endClassV2Overlay');

  var all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  var booking = all.find(function(b) { return b.id === bookingId; });
  if (!booking) { showToast('Booking not found.', 'error'); return; }

  var isDemo = booking.isDemoClass || !booking.paymentAmount;

  var overlay = document.createElement('div');
  overlay.id  = 'endClassV2Overlay';
  overlay.style.cssText = _overlayStyle();

  var modal = document.createElement('div');
  modal.style.cssText = _modalStyle();

  modal.innerHTML =
    '<div style="' + _titleStyle() + '">🔴 End Class</div>' +
    '<div style="font-size:14px;font-weight:700;color:var(--mid,#4a5568);margin-bottom:8px;">' +
      '<strong>' + (booking.studentName || '—') + '</strong> · ' + (booking.subject || (isDemo ? 'Demo Class' : '—')) +
    '</div>' +
    '<div style="font-size:14px;color:var(--mid,#4a5568);margin-bottom:24px;">' +
      'Are you sure you want to end this class?' +
    '</div>' +
    '<div style="display:flex;gap:12px;justify-content:flex-end;">' +
      '<button id="endV2No"  style="' + _btnOutline() + '">No, Go Back</button>' +
      '<button id="endV2Yes" style="' + _btnDanger()  + '">Yes, End Class</button>' +
    '</div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.getElementById('endV2No').addEventListener('click', function() {
    _removeModal('endClassV2Overlay');
  });

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) _removeModal('endClassV2Overlay');
  });

  document.getElementById('endV2Yes').addEventListener('click', function() {
    _removeModal('endClassV2Overlay');
    _showOutcomeDialog(bookingId, booking, isDemo);
  });
}

/* ── Outcome selection dialog ── */
function _showOutcomeDialog(bookingId, booking, isDemo) {
  _removeModal('outcomeDialogOverlay');

  var overlay = document.createElement('div');
  overlay.id  = 'outcomeDialogOverlay';
  overlay.style.cssText = _overlayStyle();

  var modal = document.createElement('div');
  modal.style.cssText = _modalStyle();

  var outcomeOptions = isDemo
    ? [
        { value: 'completed',  label: '✅ Completed',  desc: 'Demo went well, student engaged' },
        { value: 'incomplete', label: '❌ Incomplete',  desc: 'Class could not be completed' },
        { value: 'partially_completed', label: '⚡ Partially Completed', desc: 'Demo partially delivered' }]
    : [
        { value: 'completed',           label: '✅ Completed',           desc: 'Full lesson delivered' },
        { value: 'partially_completed', label: '⚡ Partially Completed', desc: 'Lesson partially delivered' },
        { value: 'incomplete',          label: '❌ Incomplete',           desc: 'Class could not be completed' }
      ];

  var optionsHTML = outcomeOptions.map(function(opt) {
    return '<label style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;' +
           'border:2px solid #e8eaf0;border-radius:14px;cursor:pointer;margin-bottom:10px;' +
           'font-weight:800;font-size:14px;transition:.2s;" ' +
           'onmouseover="this.style.borderColor=\'var(--blue,#1a56db)\'" ' +
           'onmouseout="this.style.borderColor=\'#e8eaf0\'">' +
           '<input type="radio" name="v2Outcome" value="' + opt.value + '" style="margin-top:2px;width:auto;">' +
           '<div><div>' + opt.label + '</div>' +
           '<div style="font-size:12px;font-weight:600;color:var(--light,#a0aec0);margin-top:2px;">' + opt.desc + '</div>' +
           '</div></label>';
  }).join('');

  modal.innerHTML =
    '<div style="' + _titleStyle() + '">📋 Class Outcome</div>' +
    '<div style="font-size:13px;font-weight:700;color:var(--mid,#4a5568);margin-bottom:18px;">' +
      (booking.studentName || '—') + ' · ' + (booking.subject || (isDemo ? 'Demo' : '—')) +
    '</div>' +
    optionsHTML +
    '<div style="display:flex;gap:12px;justify-content:flex-end;margin-top:8px;">' +
      '<button id="outcomeCancelBtn" style="' + _btnOutline() + '">Cancel</button>' +
      '<button id="outcomeConfirmBtn" style="' + _btnPrimary() + '">Continue →</button>' +
    '</div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) _removeModal('outcomeDialogOverlay');
  });

  document.getElementById('outcomeCancelBtn').addEventListener('click', function() {
    _removeModal('outcomeDialogOverlay');
  });

  document.getElementById('outcomeConfirmBtn').addEventListener('click', function() {
    var selected = document.querySelector('input[name="v2Outcome"]:checked');
    if (!selected) { showToast('Please select an outcome.', 'error'); return; }
    var outcome = selected.value;
    _removeModal('outcomeDialogOverlay');
    _handleOutcome(bookingId, booking, isDemo, outcome);
  });
}

/* ─────────────────────────────────────────────────────
   4 & 5. OUTCOME HANDLERS — PAID & DEMO
───────────────────────────────────────────────────── */

var _incompleteReasons = [
  'Student Not Joined',
  'Student Power Failure',
  'Student Internet',
  'Student Network',
  'Student PC Issue',
  'Student Medical',
  'No Show'
];

function _handleOutcome(bookingId, booking, isDemo, outcome) {
  var rates = getPayRates();

  if (isDemo) {
    _handleDemoOutcome(bookingId, booking, outcome, rates);
  } else {
    _handlePaidOutcome(bookingId, booking, outcome, rates);
  }
}

/* ── PAID CLASS OUTCOMES ── */
function _handlePaidOutcome(bookingId, booking, outcome, rates) {
  if (outcome === 'completed') {
    // Full pay, deduct 1 credit, mark completed
    _addEarnings(rates.paid);
    _deductStudentCredit(booking);
    _updateBookingStatus(bookingId, 'completed', { completedAt: new Date().toISOString() });
    recordClassSession(booking, 'completed', '', rates.paid, true);
    _refreshOverviewCards();
    showToast('\u2705 Class completed! \u00a3' + rates.paid.toFixed(2) + ' added to earnings.', 'success');
    renderUpcomingCards();

  } else if (outcome === 'partially_completed') {
    _showPartiallyCompletedDialog(bookingId, booking, rates);

  } else if (outcome === 'incomplete') {
    _showIncompleteReasonDialog(bookingId, booking, false, rates);
  }
}

/* ── Partially Completed flow ── */
function _showPartiallyCompletedDialog(bookingId, booking, rates) {
  _removeModal('partialDialogOverlay');

  var overlay = document.createElement('div');
  overlay.id  = 'partialDialogOverlay';
  overlay.style.cssText = _overlayStyle();

  var modal = document.createElement('div');
  modal.style.cssText = _modalStyle();

  modal.innerHTML =
    '<div style="' + _titleStyle() + '">⚡ Partially Completed</div>' +
    '<div style="font-size:14px;font-weight:700;color:var(--mid,#4a5568);margin-bottom:20px;">' +
      'Was at least 50% of the lesson content covered?' +
    '</div>' +
    '<div style="display:flex;gap:12px;justify-content:flex-end;">' +
      '<button id="partialNo"  style="' + _btnOutline() + '">No</button>' +
      '<button id="partialYes" style="' + _btnPrimary() + '">Yes</button>' +
    '</div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) _removeModal('partialDialogOverlay');
  });

  document.getElementById('partialNo').addEventListener('click', function() {
    _removeModal('partialDialogOverlay');
    showToast('Class marked as partially completed — no pay or credit change.', 'info');
    _updateBookingStatus(bookingId, 'partially_completed', { completedAt: new Date().toISOString() });
    recordClassSession(booking, 'partially_completed', 'Less than 50% covered', 0, false);
    renderUpcomingCards();
  });

  document.getElementById('partialYes').addEventListener('click', function() {
    _removeModal('partialDialogOverlay');
    _showPartialReasonDialog(bookingId, booking, rates);
  });
}

function _showPartialReasonDialog(bookingId, booking, rates) {
  _removeModal('partialReasonOverlay');

  var overlay = document.createElement('div');
  overlay.id  = 'partialReasonOverlay';
  overlay.style.cssText = _overlayStyle();

  var modal = document.createElement('div');
  modal.style.cssText = _modalStyle();

  modal.innerHTML =
    '<div style="' + _titleStyle() + '">⚡ Reason for Partial End</div>' +
    '<div style="font-size:14px;font-weight:700;color:var(--mid,#4a5568);margin-bottom:16px;">' +
      'Please provide a reason for ending the class early.' +
    '</div>' +
    '<textarea id="partialReasonText" style="width:100%;min-height:90px;padding:12px 14px;' +
    'border:2px solid #e8eaf0;border-radius:12px;font-family:\'Nunito\',sans-serif;' +
    'font-size:14px;outline:none;resize:vertical;box-sizing:border-box;" ' +
    'placeholder="e.g. Student had to leave early due to..."></textarea>' +
    '<div style="display:flex;gap:12px;justify-content:flex-end;margin-top:16px;">' +
      '<button id="partialReasonCancel" style="' + _btnOutline() + '">Cancel</button>' +
      '<button id="partialReasonSubmit" style="' + _btnPrimary() + '">Submit</button>' +
    '</div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) _removeModal('partialReasonOverlay');
  });

  document.getElementById('partialReasonCancel').addEventListener('click', function() {
    _removeModal('partialReasonOverlay');
  });

  document.getElementById('partialReasonSubmit').addEventListener('click', function() {
    var reason = document.getElementById('partialReasonText').value.trim();
    if (!reason) { showToast('Please enter a reason.', 'error'); return; }
    _removeModal('partialReasonOverlay');

    var partialPay = parseFloat((rates.paid / 3).toFixed(2));
    _addEarnings(partialPay);
    _deductStudentCredit(booking);
    _updateBookingStatus(bookingId, 'partially_completed', { completedAt: new Date().toISOString() });
    recordClassSession(booking, 'partially_completed', reason, partialPay, true);
    _refreshOverviewCards();
    showToast('\u26a1 Partially completed. \u00a3' + partialPay.toFixed(2) + ' added to earnings.', 'success');
    renderUpcomingCards();
  });
}

/* ── Incomplete reason dialog (shared by paid + demo) ── */
function _showIncompleteReasonDialog(bookingId, booking, isDemo, rates) {
  _removeModal('incompleteV2Overlay');

  var overlay = document.createElement('div');
  overlay.id  = 'incompleteV2Overlay';
  overlay.style.cssText = _overlayStyle();

  var modal = document.createElement('div');
  modal.style.cssText = _modalStyle();

  var optionsHTML = _incompleteReasons.map(function(r) {
    return '<option value="' + r + '">' + r + '</option>';
  }).join('');

  modal.innerHTML =
    '<div style="' + _titleStyle() + '">❌ Incomplete Class</div>' +
    '<div style="font-size:14px;font-weight:700;color:var(--mid,#4a5568);margin-bottom:16px;">' +
      'Please select the reason for the incomplete class.' +
    '</div>' +
    '<select id="incompleteV2Reason" style="width:100%;padding:12px 14px;border:2px solid #e8eaf0;' +
    'border-radius:12px;font-family:\'Nunito\',sans-serif;font-size:14px;outline:none;' +
    'background:var(--white,#fff);margin-bottom:16px;">' +
    '<option value="">— Select a reason —</option>' + optionsHTML +
    '</select>' +
    '<div style="display:flex;gap:12px;justify-content:flex-end;">' +
      '<button id="incompleteV2Cancel" style="' + _btnOutline() + '">Cancel</button>' +
      '<button id="incompleteV2Submit" style="' + _btnDanger()  + '">Submit</button>' +
    '</div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) _removeModal('incompleteV2Overlay');
  });

  document.getElementById('incompleteV2Cancel').addEventListener('click', function() {
    _removeModal('incompleteV2Overlay');
  });

  document.getElementById('incompleteV2Submit').addEventListener('click', function() {
    var reason = document.getElementById('incompleteV2Reason').value;
    if (!reason) { showToast('Please select a reason.', 'error'); return; }
    _removeModal('incompleteV2Overlay');

    if (isDemo) {
      _finaliseDemoIncomplete(bookingId, booking, reason);
    } else {
      // Paid incomplete: no pay, no credit deduction, auto-reschedule
      _updateBookingStatus(bookingId, 'incomplete', { incompleteAt: new Date().toISOString(), incompleteReason: reason });
      _rescheduleBooking(bookingId);
      recordClassSession(booking, 'incomplete', reason, 0, false);
      showToast('\u274c Class marked incomplete. Auto-rescheduled +7 days.', 'info');
      renderUpcomingCards();
    }
  });
}

/* ── DEMO CLASS OUTCOMES ── */
function _handleDemoOutcome(bookingId, booking, outcome, rates) {
  var tutor = getCurrentTutor();

  if (outcome === 'completed') {
    // Add demo pay, mark completed, send lead to sn_sales_leads
    _addEarnings(rates.demo);
    _updateBookingStatus(bookingId, 'completed', { completedAt: new Date().toISOString() });
    recordClassSession(booking, 'completed', '', rates.demo, false);

    // Send to sales leads
    try {
      var leads = JSON.parse(localStorage.getItem('sn_sales_leads') || '[]');
      leads.unshift({
        id:             'LEAD-' + Date.now().toString(36).toUpperCase(),
        bookingId:      bookingId,
        studentName:    booking.studentName,
        grade:          booking.grade,
        age:            booking.age,
        subject:        booking.subject,
        email:          booking.email,
        whatsapp:       booking.whatsapp,
        date:           booking.date,
        time:           booking.time,
        leadOwner:      tutor.name,
        leadOwnerId:    tutor.id,
        leadOwnerType:  'teacher',
        status:         'new',
        source:         'demo_completed_v2',
        createdAt:      new Date().toISOString()
      });
      localStorage.setItem('sn_sales_leads', JSON.stringify(leads));
    // Save to sn_completed_demos for Pre-Sales Completed tab
    try {
      var completed = JSON.parse(localStorage.getItem('sn_completed_demos') || '[]');
      completed.unshift({
        id:          'COMP-' + Date.now().toString(36).toUpperCase(),
        bookingId:   bookingId,
        studentName: booking.studentName,
        grade:       booking.grade,
        age:         booking.age,
        subject:     booking.subject,
        email:       booking.email,
        whatsapp:    booking.whatsapp,
        date:        booking.date,
        time:        booking.time,
        tutorName:   tutor.name,
        tutorId:     tutor.id,
        completedAt: new Date().toISOString()
      });
      localStorage.setItem('sn_completed_demos', JSON.stringify(completed));
    } catch (e) { /* silent */ }

    } catch (e) { /* silent */ }

    _refreshOverviewCards();
    showToast('\u2705 Demo complete! \u00a3' + rates.demo.toFixed(2) + ' added. Lead sent to Sales.', 'success');
    renderUpcomingCards();

  } else if (outcome === 'partially_completed') {
    _showPartiallyCompletedDialog(bookingId, booking, rates);
  } else if (outcome === 'incomplete') {
    _showIncompleteReasonDialog(bookingId, booking, true, rates);
  }
}

function _finaliseDemoIncomplete(bookingId, booking, reason) {
  var tutor = getCurrentTutor();
  _updateBookingStatus(bookingId, 'incomplete', { incompleteAt: new Date().toISOString(), incompleteReason: reason });
  recordClassSession(booking, 'incomplete', reason, 0, false);

  // Send to sn_incomplete_demos for Pre-Sales follow-up
  try {
    var incomplete = JSON.parse(localStorage.getItem('sn_incomplete_demos') || '[]');
    incomplete.unshift({
      id:          'INC-' + Date.now().toString(36).toUpperCase(),
      bookingId:   bookingId,
      studentName: booking.studentName,
      grade:       booking.grade,
      age:         booking.age,
      subject:     booking.subject,
      email:       booking.email,
      whatsapp:    booking.whatsapp,
      date:        booking.date,
      time:        booking.time,
      tutorName:   tutor.name,
      tutorId:     tutor.id,
      reason:      reason,
      source:      'demo_incomplete_v2',
      loggedAt:    new Date().toISOString()
    });
    localStorage.setItem('sn_incomplete_demos', JSON.stringify(incomplete));
  } catch (e) { /* silent */ }

  showToast('\u274c Incomplete demo logged. Pre-Sales team notified.', 'info');
  renderUpcomingCards();
}

/* ── Refresh overview stat cards ── */
function _refreshOverviewCards() {
  if (typeof syncOverviewStats === 'function') {
    syncOverviewStats();
  }
  // Update earnings display from stored value
  var tutor = getCurrentTutor();
  try {
    var data = JSON.parse(localStorage.getItem('sn_earnings_' + tutor.id) || '{"total":0}');
    var total = (data.total || 0).toFixed(2);
    var earningsEl = document.getElementById('overviewEarnings');
    if (earningsEl) earningsEl.textContent = '\u00a3' + total;
    var liveEl = document.getElementById('liveEarnings');
    if (liveEl) liveEl.textContent = '\u00a3' + total;
  } catch (e) { /* silent */ }
}

/* ─────────────────────────────────────────────────────
   6. RECORD CLASS SESSION
───────────────────────────────────────────────────── */

/**
 * Saves a completed/incomplete session record to sn_class_sessions_TUTORID.
 * @param {Object}  booking        - The booking object
 * @param {string}  outcome        - 'completed' | 'partially_completed' | 'incomplete'
 * @param {string}  reason         - Reason string (for incomplete/partial)
 * @param {number}  payAmount      - Amount paid to tutor for this session
 * @param {boolean} creditDeducted - Whether a student credit was deducted
 */
function recordClassSession(booking, outcome, reason, payAmount, creditDeducted) {
  var tutor = _safeGetCurrentTutor();
  var key   = 'sn_class_sessions_' + tutor.id;

  var sessions = [];
  try { sessions = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { sessions = []; }

  var isDemo = booking.isDemoClass || !booking.paymentAmount;

  // Get start time from join record
  var startTimes = {};
  try { startTimes = JSON.parse(localStorage.getItem('sn_session_start_times') || '{}'); } catch(e) {}
  var startedAt = startTimes[booking.id] || null;

  // Calculate duration in minutes
  var durationMins = null;
  if (startedAt) {
    durationMins = Math.round((new Date() - new Date(startedAt)) / 60000);
  }

  var record = {
    bookingId:      booking.id,
    studentName:    booking.studentName  || '—',
    subject:        booking.subject      || (isDemo ? 'Demo Class' : '—'),
    topic:          booking.topic        || (isDemo ? 'Demo Class' : (booking.subject || '—')),
    date:           booking.date         || '—',
    scheduledTime:  booking.time         || '—',
    startedAt:      startedAt,
    endedAt:        new Date().toISOString(),
    durationMins:   durationMins,
    outcome:        outcome,
    reason:         reason || '',
    payAmount:      typeof payAmount === 'number' ? payAmount : 0,
    creditDeducted: creditDeducted ? true : false,
    type:           isDemo ? 'demo' : 'paid',
    recordingLink:  booking.recordingLink || '',
    recordingStatus: booking.recordingLink ? 'uploaded' : 'pending',
  };

  // Replace existing record for same booking, or prepend
  var existing = sessions.findIndex(function(s) { return s.bookingId === booking.id; });
  if (existing !== -1) {
    sessions[existing] = record;
  } else {
    sessions.unshift(record);
  }

  localStorage.setItem(key, JSON.stringify(sessions));
}

/* ─────────────────────────────────────────────────────
   7. DOWNLOAD MONTHLY PAYSHEET
───────────────────────────────────────────────────── */

/**
 * Generates and downloads a CSV paysheet for the given month/year.
 * @param {number} month - 1-indexed month (1 = January)
 * @param {number} year  - Full year e.g. 2025
 */
function downloadMonthlyPaysheet(month, year) {
  var tutor    = getCurrentTutor();
  var key      = 'sn_class_sessions_' + tutor.id;
  var sessions = [];
  try { sessions = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { sessions = []; }

  // Filter to the requested month/year using endedAt
  var filtered = sessions.filter(function(s) {
    if (!s.endedAt) return false;
    var d = new Date(s.endedAt);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  var monthNames = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
  var monthName  = monthNames[month - 1] || String(month);

  // CSV header
  var rows = [
    ['Date', 'Time Ended', 'Student', 'Subject', 'Type', 'Outcome', 'Reason', 'Pay (\u00a3)', 'Credits Deducted']
  ];

  var totalPay     = 0;
  var totalCredits = 0;

  filtered.forEach(function(s) {
    var endedDate = s.endedAt ? new Date(s.endedAt).toLocaleDateString('en-GB') : s.date;
    var endedTime = s.endedAt ? new Date(s.endedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : s.time;
    var pay       = typeof s.payAmount === 'number' ? s.payAmount : 0;
    var credits   = s.creditDeducted ? 1 : 0;
    totalPay     += pay;
    totalCredits += credits;

    rows.push([
      endedDate,
      endedTime,
      s.studentName  || '—',
      s.subject      || '—',
      s.type         || '—',
      s.outcome      || '—',
      s.reason       || '',
      pay.toFixed(2),
      credits
    ]);
  });

  // Totals row
  rows.push([
    'TOTAL', '', '', '', '', '',
    filtered.length + ' session(s)',
    totalPay.toFixed(2),
    totalCredits
  ]);

  // Build CSV string
  var csv = rows.map(function(row) {
    return row.map(function(cell) {
      var val = String(cell === null || cell === undefined ? '' : cell);
      // Escape double quotes and wrap in quotes if needed
      if (val.indexOf(',') !== -1 || val.indexOf('"') !== -1 || val.indexOf('\n') !== -1) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(',');
  }).join('\r\n');

  // Sanitise tutor name for filename
  var safeName = (tutor.name || 'Tutor').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
  var filename  = 'StemNest-Paysheet-' + safeName + '-' + monthName + '-' + year + '.csv';

  // Trigger download
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);

  showToast('\u2b07\ufe0f Downloading ' + filename, 'success');
}

/* ─────────────────────────────────────────────────────
   8. RENDER EARNINGS SHEET
───────────────────────────────────────────────────── */

/**
 * Renders the current month's session table into the leaderboard tab,
 * with download buttons for current and previous month.
 * Also auto-archives the previous month's data at the start of a new month.
 */
function renderEarningsSheet() {
  var container = document.getElementById('tab-leaderboard');
  if (!container) return;

  var tutor    = getCurrentTutor();
  var key      = 'sn_class_sessions_' + tutor.id;
  var sessions = [];
  try { sessions = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { sessions = []; }

  var now       = new Date();
  var curMonth  = now.getMonth() + 1;
  var curYear   = now.getFullYear();

  // Previous month
  var prevDate  = new Date(curYear, curMonth - 2, 1);
  var prevMonth = prevDate.getMonth() + 1;
  var prevYear  = prevDate.getFullYear();

  var monthNames = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

  // Auto-archive previous month if not already done
  _autoArchivePreviousMonth(sessions, prevMonth, prevYear, tutor);

  // Filter current month sessions
  var curSessions = sessions.filter(function(s) {
    if (!s.endedAt) return false;
    var d = new Date(s.endedAt);
    return d.getFullYear() === curYear && (d.getMonth() + 1) === curMonth;
  });

  var totalPay = curSessions.reduce(function(sum, s) {
    return sum + (typeof s.payAmount === 'number' ? s.payAmount : 0);
  }, 0);

  // Build table rows
  var tableRows = curSessions.length === 0
    ? '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--light,#a0aec0);font-weight:700;">No sessions recorded this month yet.</td></tr>'
    : curSessions.map(function(s) {
        var endedDate = s.endedAt ? new Date(s.endedAt).toLocaleDateString('en-GB') : s.date;
        var endedTime = s.endedAt ? new Date(s.endedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : s.time;
        var outcomeColor = s.outcome === 'completed' ? 'var(--green,#38a169)'
                         : s.outcome === 'partially_completed' ? 'var(--orange,#f6ad55)'
                         : '#c53030';
        return '<tr style="border-bottom:1px solid #f0f0f0;">' +
          '<td style="padding:10px 12px;font-size:13px;">' + endedDate + '</td>' +
          '<td style="padding:10px 12px;font-size:13px;">' + endedTime + '</td>' +
          '<td style="padding:10px 12px;font-size:13px;font-weight:700;">' + (s.studentName || '—') + '</td>' +
          '<td style="padding:10px 12px;font-size:13px;">' + (s.subject || '—') + '</td>' +
          '<td style="padding:10px 12px;font-size:12px;">' +
            '<span style="background:' + (s.type === 'demo' ? 'var(--orange,#f6ad55)' : 'var(--blue,#1a56db)') +
            ';color:#fff;border-radius:8px;padding:2px 8px;font-weight:800;">' +
            (s.type || '—') + '</span></td>' +
          '<td style="padding:10px 12px;font-size:12px;font-weight:800;color:' + outcomeColor + ';">' +
            (s.outcome || '—') + '</td>' +
          '<td style="padding:10px 12px;font-size:12px;color:var(--mid,#4a5568);">' + (s.reason || '—') + '</td>' +
          '<td style="padding:10px 12px;font-size:13px;font-weight:800;color:var(--green,#38a169);">' +
            '\u00a3' + (typeof s.payAmount === 'number' ? s.payAmount.toFixed(2) : '0.00') + '</td>' +
          '<td style="padding:10px 12px;font-size:13px;text-align:center;">' +
            (s.creditDeducted ? '\u2705' : '\u2014') + '</td>' +
        '</tr>';
      }).join('');

  // Previous month archive
  var archiveKey  = 'sn_paysheet_archive_' + tutor.id;
  var archives    = [];
  try { archives = JSON.parse(localStorage.getItem(archiveKey) || '[]'); } catch (e) { archives = []; }
  var prevArchive = archives.find(function(a) { return a.month === prevMonth && a.year === prevYear; });

  var prevMonthHTML = prevArchive
    ? '<div style="background:var(--white,#fff);border-radius:16px;padding:20px 24px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.06);margin-top:24px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:16px;color:var(--dark,#1a202c);">' +
          '\ud83d\udcc5 ' + monthNames[prevMonth - 1] + ' ' + prevYear + ' — Archived Paysheet' +
        '</div>' +
        '<button onclick="downloadMonthlyPaysheet(' + prevMonth + ',' + prevYear + ')" ' +
        'style="background:var(--blue,#1a56db);color:#fff;border:none;border-radius:10px;' +
        'padding:8px 16px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:13px;cursor:pointer;">' +
        '\u2b07\ufe0f Download ' + monthNames[prevMonth - 1] + '</button>' +
      '</div>' +
      '<div style="font-size:13px;font-weight:700;color:var(--mid,#4a5568);">' +
        prevArchive.sessionCount + ' sessions · Total: \u00a3' + (prevArchive.totalPay || 0).toFixed(2) +
      '</div>' +
      '</div>'
    : '<div style="background:var(--bg,#f7f8fc);border-radius:16px;padding:16px 24px;margin-top:24px;' +
      'font-size:13px;font-weight:700;color:var(--light,#a0aec0);">' +
      'No archived paysheet for ' + monthNames[prevMonth - 1] + ' ' + prevYear + '.' +
      '</div>';

  // Remove existing earnings sheet if present
  var existing = document.getElementById('earningsSheetSection');
  if (existing) existing.remove();

  var section = document.createElement('div');
  section.id  = 'earningsSheetSection';
  section.style.cssText = 'margin-top:28px;';

  section.innerHTML =
    '<div style="background:var(--white,#fff);border-radius:20px;padding:24px;' +
    'box-shadow:0 4px 20px rgba(0,0,0,0.08);">' +

    // Header
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:20px;color:var(--dark,#1a202c);">' +
        '\ud83d\udcb7 ' + monthNames[curMonth - 1] + ' ' + curYear + ' — Earnings Sheet' +
      '</div>' +
      '<div style="display:flex;gap:10px;align-items:center;">' +
        '<div style="font-size:14px;font-weight:800;color:var(--green,#38a169);">' +
          'Total: \u00a3' + totalPay.toFixed(2) +
        '</div>' +
        '<button onclick="downloadMonthlyPaysheet(' + curMonth + ',' + curYear + ')" ' +
        'style="background:var(--green,#38a169);color:#fff;border:none;border-radius:10px;' +
        'padding:8px 16px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:13px;cursor:pointer;">' +
        '\u2b07\ufe0f Download This Month</button>' +
      '</div>' +
    '</div>' +

    // Table
    '<div style="overflow-x:auto;">' +
    '<table style="width:100%;border-collapse:collapse;font-family:\'Nunito\',sans-serif;">' +
    '<thead>' +
    '<tr style="background:var(--bg,#f7f8fc);">' +
      '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:800;color:var(--mid,#4a5568);">Date</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:800;color:var(--mid,#4a5568);">Time Ended</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:800;color:var(--mid,#4a5568);">Student</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:800;color:var(--mid,#4a5568);">Subject</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:800;color:var(--mid,#4a5568);">Type</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:800;color:var(--mid,#4a5568);">Outcome</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:800;color:var(--mid,#4a5568);">Reason</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:800;color:var(--mid,#4a5568);">Pay (\u00a3)</th>' +
      '<th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:800;color:var(--mid,#4a5568);">Credits</th>' +
    '</tr>' +
    '</thead>' +
    '<tbody>' + tableRows + '</tbody>' +
    '</table>' +
    '</div>' +
    '</div>' +

    // Previous month section
    prevMonthHTML;

  container.appendChild(section);
}

/* ── Auto-archive previous month at start of new month ── */
function _autoArchivePreviousMonth(sessions, prevMonth, prevYear, tutor) {
  var archiveKey = 'sn_paysheet_archive_' + tutor.id;
  var archives   = [];
  try { archives = JSON.parse(localStorage.getItem(archiveKey) || '[]'); } catch (e) { archives = []; }

  // Check if already archived
  var alreadyDone = archives.some(function(a) { return a.month === prevMonth && a.year === prevYear; });
  if (alreadyDone) return;

  var prevSessions = sessions.filter(function(s) {
    if (!s.endedAt) return false;
    var d = new Date(s.endedAt);
    return d.getFullYear() === prevYear && (d.getMonth() + 1) === prevMonth;
  });

  if (prevSessions.length === 0) return;

  var totalPay = prevSessions.reduce(function(sum, s) {
    return sum + (typeof s.payAmount === 'number' ? s.payAmount : 0);
  }, 0);

  archives.unshift({
    month:        prevMonth,
    year:         prevYear,
    sessionCount: prevSessions.length,
    totalPay:     totalPay,
    archivedAt:   new Date().toISOString()
  });

  localStorage.setItem(archiveKey, JSON.stringify(archives));
}

/* ─────────────────────────────────────────────────────
   9. INIT — DOMContentLoaded wiring
───────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function() {

  // Try rendering immediately, then retry a few times to handle timing
  // This ensures cards populate even if TUTOR loads slightly late
  var attempts = 0;
  function tryRender() {
    renderUpcomingCards();
    attempts++;
    // Keep retrying every 500ms for the first 5 seconds
    if (attempts < 10) {
      setTimeout(tryRender, 500);
    }
  }
  setTimeout(tryRender, 200);

  // After initial burst, refresh every 30 seconds (keeps 15-min gate current)
  setInterval(renderUpcomingCards, 30 * 1000);

  // Override showDashTab to hook into tab switches
  var _prevShowDashTab = window.showDashTab;
  window.showDashTab = function(tab) {
    if (typeof _prevShowDashTab === 'function') _prevShowDashTab(tab);
    if (tab === 'overview') {
      setTimeout(renderUpcomingCards, 150);
    }
    if (tab === 'leaderboard') {
      setTimeout(renderEarningsSheet, 150);
    }
  };

});

/* ─────────────────────────────────────────────────────
   CLASS RECORDS TAB
   Shows all sessions with start/end times, recording links,
   filter by today / this week / this month / all
───────────────────────────────────────────────────── */

var _currentRecFilter = 'today';

function filterClassRecords(period) {
  _currentRecFilter = period;
  // Update active button
  ['today','week','month','all'].forEach(function(p) {
    var btn = document.getElementById('recFilter-' + p);
    if (btn) {
      btn.classList.toggle('rec-filter-active', p === period);
    }
  });
  renderClassRecords();
}

function renderClassRecords() {
  var el = document.getElementById('classRecordsTable');
  if (!el) return;

  var tutor    = _safeGetCurrentTutor();
  var key      = 'sn_class_sessions_' + tutor.id;
  var sessions = [];
  try { sessions = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { sessions = []; }

  // Apply date filter
  var now   = new Date();
  var filtered = sessions.filter(function(s) {
    if (!s.endedAt) return false;
    var d = new Date(s.endedAt);
    if (_currentRecFilter === 'today') {
      return d.toDateString() === now.toDateString();
    }
    if (_currentRecFilter === 'week') {
      var weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (_currentRecFilter === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true; // 'all'
  });

  if (!filtered.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;background:var(--white);border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,.06);">' +
      '<div style="font-size:48px;margin-bottom:12px;">📋</div>' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:20px;color:#1a202c;margin-bottom:8px;">No records found</div>' +
      '<div style="font-size:14px;color:#a0aec0;font-weight:700;">No classes recorded for this period. Complete a class to see it here.</div>' +
      '</div>';
    return;
  }

  var thS = 'padding:11px 14px;text-align:left;font-size:11px;font-weight:900;color:#718096;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;';
  var tdS = 'padding:12px 14px;font-size:13px;vertical-align:middle;';

  var rows = filtered.map(function(s, i) {
    var bg = i % 2 === 0 ? '' : 'background:#fafbff;';

    // Format times
    var startDisplay = s.startedAt
      ? new Date(s.startedAt).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
      : '—';
    var endDisplay = s.endedAt
      ? new Date(s.endedAt).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
      : '—';
    var dateDisplay = s.endedAt
      ? new Date(s.endedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
      : (s.date || '—');
    var duration = s.durationMins ? s.durationMins + ' mins' : '—';

    // Outcome badge
    var outcomeColor = s.outcome === 'completed' ? '#065f46' : s.outcome === 'partially_completed' ? '#e65100' : '#c53030';
    var outcomeBg    = s.outcome === 'completed' ? '#d1fae5' : s.outcome === 'partially_completed' ? '#fff3e0' : '#fde8e8';
    var outcomeLabel = s.outcome === 'completed' ? '✅ Completed' : s.outcome === 'partially_completed' ? '⚡ Partial' : '❌ Incomplete';

    // Type badge
    var typeBg    = s.type === 'demo' ? '#fff3e0' : '#dbeafe';
    var typeColor = s.type === 'demo' ? '#e65100' : '#1e40af';

    // Recording link
    var recCell;
    if (s.recordingLink) {
      recCell = '<a href="' + s.recordingLink + '" target="_blank" style="color:#1a56db;font-weight:800;font-size:12px;text-decoration:none;">▶ View Recording</a>' +
        '<br><span class="rec-status-uploaded">✅ Uploaded</span>';
    } else {
      recCell = '<span class="rec-status-pending">⏳ Pending</span>' +
        '<br><button onclick="openRecordingInput(\'' + s.bookingId + '\')" ' +
        'style="margin-top:4px;background:var(--blue-light);color:var(--blue);border:none;border-radius:8px;padding:4px 10px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">+ Add Link</button>';
    }

    return '<tr style="border-bottom:1px solid #f0f2f8;' + bg + '">' +
      '<td style="' + tdS + '">' +
        '<div style="font-weight:800;color:#1a202c;">' + (s.studentName || '—') + '</div>' +
        '<div style="font-size:11px;color:#a0aec0;">' + dateDisplay + '</div>' +
      '</td>' +
      '<td style="' + tdS + ';font-weight:700;color:#4a5568;">' + (s.topic || s.subject || '—') + '</td>' +
      '<td style="' + tdS + '">' +
        '<span style="background:' + typeBg + ';color:' + typeColor + ';font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">' +
        (s.type === 'demo' ? '🎓 Demo' : '📚 Paid') + '</span>' +
      '</td>' +
      '<td style="' + tdS + ';font-size:12px;color:#4a5568;font-weight:700;">' + startDisplay + '</td>' +
      '<td style="' + tdS + ';font-size:12px;color:#4a5568;font-weight:700;">' + endDisplay + '</td>' +
      '<td style="' + tdS + ';font-size:12px;color:#4a5568;font-weight:700;">' + duration + '</td>' +
      '<td style="' + tdS + '">' +
        '<span style="background:' + outcomeBg + ';color:' + outcomeColor + ';font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">' + outcomeLabel + '</span>' +
        (s.reason ? '<div style="font-size:11px;color:#a0aec0;margin-top:3px;">' + s.reason + '</div>' : '') +
      '</td>' +
      '<td style="' + tdS + '">' + recCell + '</td>' +
    '</tr>';
  }).join('');

  el.innerHTML =
    '<div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:#fff;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    '<thead><tr style="background:#f7f9ff;border-bottom:2px solid #e8eaf0;">' +
      '<th style="' + thS + '">Student</th>' +
      '<th style="' + thS + '">Topic</th>' +
      '<th style="' + thS + '">Type</th>' +
      '<th style="' + thS + '">Start Time</th>' +
      '<th style="' + thS + '">End Time</th>' +
      '<th style="' + thS + '">Duration</th>' +
      '<th style="' + thS + '">Outcome</th>' +
      '<th style="' + thS + '">Recording</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>' +
    '<div style="margin-top:10px;font-size:12px;font-weight:700;color:#a0aec0;text-align:right;">' +
      filtered.length + ' record' + (filtered.length !== 1 ? 's' : '') +
    '</div>';
}

/* ── Add recording link inline ── */
function openRecordingInput(bookingId) {
  // Remove any existing input
  var existing = document.getElementById('recLinkInput_' + bookingId);
  if (existing) { existing.remove(); return; }

  var btn = event.target;
  var container = document.createElement('div');
  container.id = 'recLinkInput_' + bookingId;
  container.style.cssText = 'margin-top:6px;display:flex;gap:6px;';
  container.innerHTML =
    '<input type="url" placeholder="Paste Google Drive link..." ' +
    'style="flex:1;padding:6px 10px;border:2px solid #e8eaf0;border-radius:8px;font-family:\'Nunito\',sans-serif;font-size:12px;outline:none;" ' +
    'id="recLinkVal_' + bookingId + '">' +
    '<button onclick="saveRecordingLink(\'' + bookingId + '\')" ' +
    'style="background:#0e9f6e;color:#fff;border:none;border-radius:8px;padding:6px 10px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">Save</button>';
  btn.parentNode.appendChild(container);
}

function saveRecordingLink(bookingId) {
  var input = document.getElementById('recLinkVal_' + bookingId);
  var link  = input ? input.value.trim() : '';
  if (!link) { showToast('Please paste a recording link.', 'error'); return; }

  var tutor = _safeGetCurrentTutor();
  var key   = 'sn_class_sessions_' + tutor.id;
  var sessions = [];
  try { sessions = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { sessions = []; }

  var idx = sessions.findIndex(function(s) { return s.bookingId === bookingId; });
  if (idx !== -1) {
    sessions[idx].recordingLink   = link;
    sessions[idx].recordingStatus = 'uploaded';
    localStorage.setItem(key, JSON.stringify(sessions));
  }

  // Also update the booking record
  try {
    var bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    var bi = bookings.findIndex(function(b) { return b.id === bookingId; });
    if (bi !== -1) { bookings[bi].recordingLink = link; localStorage.setItem('sn_bookings', JSON.stringify(bookings)); }
  } catch(e) {}

  showToast('✅ Recording link saved!');
  renderClassRecords();
}

/* Wire Class Records tab into showDashTab */
(function() {
  var _prev = window.showDashTab;
  window.showDashTab = function(tab) {
    if (typeof _prev === 'function') _prev(tab);
    if (tab === 'records') {
      setTimeout(function() { filterClassRecords(_currentRecFilter); }, 100);
    }
  };
  // Also wire into tutor-companion's EXTRA_TABS
  if (typeof EXTRA_TABS !== 'undefined' && EXTRA_TABS.indexOf('records') === -1) {
    EXTRA_TABS.push('records');
  }
})();
