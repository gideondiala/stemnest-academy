/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — JOIN CLASS JS
   Lookup booking by email or WhatsApp, show class details,
   Cancel and Reschedule flows.
═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (q) {
    const input = document.getElementById('lookupInput');
    if (input) { input.value = q; findClass(); }
  }
});

function findClass() {
  const raw   = (document.getElementById('lookupInput')?.value || '').trim();
  const query = raw.toLowerCase();
  if (!query) { showToast('Please enter your Gmail or WhatsApp number.', 'error'); return; }

  const btn = document.getElementById('lookupBtnText');
  if (btn) btn.textContent = 'Searching...';

  setTimeout(() => {
    if (btn) btn.textContent = 'Find My Class';

    const bookings = getBookings();
    const normalise = s => s.replace(/[\s\-\(\)]/g, '').toLowerCase();
    const matches = bookings.filter(b =>
      b.email?.toLowerCase() === query ||
      normalise(b.whatsapp || '') === normalise(raw)
    );

    if (matches.length === 0) {
      document.getElementById('notFoundQuery').textContent = raw;
      show('noBookingScreen');
      hide('lookupScreen');
      hide('classScreen');
      return;
    }

    const booking = matches.sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt))[0];
    renderClassScreen(booking, matches);
    show('classScreen');
    hide('lookupScreen');
    hide('noBookingScreen');
  }, 800);
}

function renderClassScreen(b, allMatches) {
  const initials = b.studentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  document.getElementById('studentCard').innerHTML =
    '<div class="jc-student-av">' + initials + '</div>' +
    '<div class="jc-student-info">' +
      '<div class="jc-student-name">' + b.studentName + '</div>' +
      '<div class="jc-student-meta">' +
        b.grade + ' &nbsp;&middot;&nbsp; Age ' + b.age + ' &nbsp;&middot;&nbsp; ' + b.subject + '<br>' +
        '📅 ' + formatDate(b.date) + ' &nbsp;&middot;&nbsp; 🕐 ' + b.time +
      '</div>' +
      '<div class="jc-booking-id">Booking: ' + b.id + '</div>' +
    '</div>' +
    (allMatches.length > 1
      ? '<div style="font-size:12px;font-weight:700;color:var(--light);background:var(--bg);border-radius:10px;padding:8px 12px;">' +
          allMatches.length + ' bookings found. Showing most recent.</div>'
      : '');

  const joinCard = document.getElementById('joinCard');
  joinCard.dataset.bookingId = b.id;

  const actionRow =
    '<div class="jc-action-row">' +
      '<button class="jc-cancel-btn" onclick="openCancelOrRescheduleDialog(\'' + b.id + '\')">Cancel</button>' +
      '<button class="jc-reschedule-btn" onclick="openRescheduleOnly(\'' + b.id + '\')">Reschedule</button>' +
    '</div>';

  if (b.classLink && b.status === 'scheduled') {
    joinCard.innerHTML =
      '<div class="jc-join-subject">📚 ' + b.subject + ' — Live Class</div>' +
      '<div class="jc-join-time">' + b.time + '</div>' +
      '<div class="jc-join-date">📅 ' + formatDate(b.date) + '</div>' +
      '<a href="' + b.classLink + '" target="_blank" class="jc-join-main-btn">🚀 Join Class Now</a>' +
      '<div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:16px;font-weight:700;">' +
        'Tutor: ' + (b.assignedTutor || 'Being assigned') + ' &nbsp;&middot;&nbsp; Opens in a new tab' +
      '</div>' +
      actionRow;
  } else {
    joinCard.classList.add('no-link');
    joinCard.innerHTML =
      '<div class="jc-join-subject">📚 ' + b.subject + '</div>' +
      '<div class="jc-join-time">' + b.time + '</div>' +
      '<div class="jc-join-date">📅 ' + formatDate(b.date) + '</div>' +
      '<div class="jc-join-pending">' +
        '⏳ Your class is being scheduled.<br>' +
        'Your tutor will be assigned shortly and the Join button will appear here.<br><br>' +
        '<strong>Check your email and WhatsApp for updates.</strong>' +
      '</div>' +
      actionRow;
  }
}

/* ══════════════════════════════════════════════════════
   CANCEL OR RESCHEDULE DIALOG
══════════════════════════════════════════════════════ */
var activeJCBookingId = null;

function openCancelOrRescheduleDialog(bookingId) {
  activeJCBookingId = bookingId;
  removeJCModal();

  var modal = document.createElement('div');
  modal.id = 'jcModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:24px;padding:36px 32px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);text-align:center;">' +
      '<div style="font-size:48px;margin-bottom:16px;">🤔</div>' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;color:#1a202c;margin-bottom:10px;">What would you like to do?</div>' +
      '<div style="font-size:14px;color:#718096;margin-bottom:28px;line-height:1.6;">You can cancel this class if you\'re no longer interested, or reschedule it for a more convenient time.</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<button onclick="openNotInterestedFlow()" style="padding:14px 20px;border-radius:14px;border:2px solid #fde8e8;background:#fde8e8;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:15px;color:#c53030;cursor:pointer;">❌ I\'m Not Interested — Cancel Class</button>' +
        '<button onclick="openRescheduleFlow()" style="padding:14px 20px;border-radius:14px;border:2px solid #dbeafe;background:#dbeafe;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:15px;color:#1a56db;cursor:pointer;">🔄 Reschedule for Another Day</button>' +
        '<button onclick="removeJCModal()" style="padding:12px 20px;border-radius:14px;border:2px solid #e8eaf0;background:#f7f9ff;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:14px;color:#718096;cursor:pointer;">← Go Back</button>' +
      '</div>' +
    '</div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) removeJCModal(); });
  document.body.appendChild(modal);
}

/* ── NOT INTERESTED FLOW ── */
function openNotInterestedFlow() {
  removeJCModal();
  var modal = document.createElement('div');
  modal.id = 'jcModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:24px;padding:36px 32px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:20px;color:#1a202c;margin-bottom:8px;">📝 Tell us why</div>' +
      '<div style="font-size:14px;color:#718096;margin-bottom:16px;line-height:1.6;">We\'re sorry to hear that. Please let us know why you\'re cancelling — this helps us improve.</div>' +
      '<textarea id="jcCancelReason" placeholder="e.g. My schedule changed, I found another provider, I need more time to decide..." style="width:100%;min-height:100px;padding:12px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:\'Nunito\',sans-serif;font-size:14px;outline:none;resize:vertical;margin-bottom:16px;"></textarea>' +
      '<div style="display:flex;gap:10px;">' +
        '<button onclick="openCancelOrRescheduleDialog(\'' + activeJCBookingId + '\')" style="flex:1;padding:12px;border-radius:12px;border:2px solid #e8eaf0;background:#f7f9ff;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:14px;color:#718096;cursor:pointer;">← Back</button>' +
        '<button onclick="confirmCancellation()" style="flex:2;padding:12px;border-radius:12px;border:none;background:#c53030;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:14px;color:#fff;cursor:pointer;">Confirm Cancellation</button>' +
      '</div>' +
    '</div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) removeJCModal(); });
  document.body.appendChild(modal);
}

function confirmCancellation() {
  var reason = document.getElementById('jcCancelReason')?.value.trim();
  if (!reason) { showToast('Please enter a reason for cancellation.', 'error'); return; }

  var bookings = getBookings();
  var b = bookings.find(function(x) { return x.id === activeJCBookingId; });
  if (!b) return;

  var cancelled = JSON.parse(localStorage.getItem('sn_cancelled_classes') || '[]');
  cancelled.unshift({
    id:            'CAN-' + Date.now().toString(36).toUpperCase(),
    bookingId:     b.id,
    studentName:   b.studentName,
    email:         b.email,
    whatsapp:      b.whatsapp,
    grade:         b.grade,
    age:           b.age,
    subject:       b.subject,
    date:          b.date,
    time:          b.time,
    assignedTutor: b.assignedTutor || '—',
    reason:        reason,
    cancelledAt:   new Date().toISOString(),
    source:        'join-class-page',
  });
  localStorage.setItem('sn_cancelled_classes', JSON.stringify(cancelled));

  var all = getBookings();
  var idx = all.findIndex(function(x) { return x.id === activeJCBookingId; });
  if (idx !== -1) { all[idx].status = 'cancelled'; all[idx].cancelReason = reason; localStorage.setItem('sn_bookings', JSON.stringify(all)); }

  removeJCModal();

  var joinCard = document.getElementById('joinCard');
  if (joinCard) {
    joinCard.innerHTML =
      '<div style="text-align:center;padding:20px 0;">' +
        '<div style="font-size:56px;margin-bottom:16px;">✅</div>' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;color:#fff;margin-bottom:8px;">Class Cancelled</div>' +
        '<div style="font-size:14px;color:rgba(255,255,255,.8);line-height:1.7;margin-bottom:20px;">Your cancellation has been received. Our team has been notified.<br>We hope to see you again soon!</div>' +
        '<a href="free-trial.html" style="display:inline-block;background:#fff;color:#1a56db;padding:12px 28px;border-radius:50px;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:14px;text-decoration:none;">📅 Book a New Demo Class</a>' +
      '</div>';
  }
}

/* ── RESCHEDULE FLOW ── */
function openRescheduleOnly(bookingId) {
  activeJCBookingId = bookingId;
  openRescheduleFlow();
}

function openRescheduleFlow() {
  removeJCModal();
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var minDate = tomorrow.toISOString().split('T')[0];

  var modal = document.createElement('div');
  modal.id = 'jcModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:24px;padding:36px 32px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;color:#1a202c;margin-bottom:8px;">🔄 Reschedule Your Class</div>' +
      '<div style="font-size:14px;color:#718096;margin-bottom:20px;line-height:1.6;">Choose a new date and time that works better for you. Our team will confirm your new slot.</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">' +
        '<div>' +
          '<label style="font-size:12px;font-weight:900;color:#718096;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px;">New Date *</label>' +
          '<input type="date" id="jcRescheduleDate" min="' + minDate + '" style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:\'Nunito\',sans-serif;font-size:14px;outline:none;">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:12px;font-weight:900;color:#718096;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px;">New Time *</label>' +
          '<select id="jcRescheduleTime" style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:\'Nunito\',sans-serif;font-size:14px;outline:none;background:#fff;">' +
            '<option value="">Select time</option>' +
            generateTimeOptions() +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button onclick="openCancelOrRescheduleDialog(\'' + activeJCBookingId + '\')" style="flex:1;padding:12px;border-radius:12px;border:2px solid #e8eaf0;background:#f7f9ff;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:14px;color:#718096;cursor:pointer;">← Back</button>' +
        '<button onclick="confirmReschedule()" style="flex:2;padding:12px;border-radius:12px;border:none;background:#1a56db;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:14px;color:#fff;cursor:pointer;">✅ Confirm Reschedule</button>' +
      '</div>' +
    '</div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) removeJCModal(); });
  document.body.appendChild(modal);
}

function generateTimeOptions() {
  var slots = [];
  for (var h = 6; h <= 22; h++) {
    ['00', '30'].forEach(function(m) {
      var period = h < 12 ? 'AM' : 'PM';
      var h12    = h % 12 === 0 ? 12 : h % 12;
      var label  = h12 + ':' + m + ' ' + period;
      slots.push('<option value="' + label + '">' + label + '</option>');
    });
  }
  return slots.join('');
}

function confirmReschedule() {
  var date = document.getElementById('jcRescheduleDate')?.value;
  var time = document.getElementById('jcRescheduleTime')?.value;
  if (!date) { showToast('Please select a new date.', 'error'); return; }
  if (!time) { showToast('Please select a new time.', 'error'); return; }

  var bookings = getBookings();
  var b = bookings.find(function(x) { return x.id === activeJCBookingId; });
  if (!b) return;

  var requests = JSON.parse(localStorage.getItem('sn_reschedule_requests') || '[]');
  requests.unshift({
    id:            'RSC-' + Date.now().toString(36).toUpperCase(),
    bookingId:     b.id,
    studentName:   b.studentName,
    email:         b.email,
    whatsapp:      b.whatsapp,
    grade:         b.grade,
    age:           b.age,
    subject:       b.subject,
    originalDate:  b.date,
    originalTime:  b.time,
    preferredDate: date,
    preferredTime: time,
    status:        'pending',
    requestedAt:   new Date().toISOString(),
    source:        'join-class-page',
  });
  localStorage.setItem('sn_reschedule_requests', JSON.stringify(requests));

  removeJCModal();

  var formattedDate = date;
  try {
    formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch(e) {}

  var joinCard = document.getElementById('joinCard');
  if (joinCard) {
    joinCard.innerHTML =
      '<div style="text-align:center;padding:20px 0;">' +
        '<div style="font-size:56px;margin-bottom:16px;">🎉</div>' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;color:#fff;margin-bottom:8px;">Reschedule Requested!</div>' +
        '<div style="font-size:14px;color:rgba(255,255,255,.85);line-height:1.8;margin-bottom:20px;">' +
          'Your request has been received.<br>' +
          '<strong>📅 ' + formattedDate + '</strong><br>' +
          '<strong>🕐 ' + time + '</strong><br><br>' +
          'Our team will confirm your new slot shortly.<br>' +
          'Check your email and WhatsApp for confirmation.' +
        '</div>' +
        '<div style="background:rgba(255,255,255,.15);border-radius:14px;padding:14px;font-size:13px;color:rgba(255,255,255,.8);font-weight:700;">' +
          '💬 Need help? Contact us on WhatsApp or email support@stemnest.co.uk' +
        '</div>' +
      '</div>';
  }
}

function removeJCModal() {
  var m = document.getElementById('jcModal');
  if (m) m.remove();
}

function resetLookup() {
  hide('noBookingScreen');
  hide('classScreen');
  show('lookupScreen');
  var input = document.getElementById('lookupInput');
  if (input) { input.value = ''; input.focus(); }
}

/* ── Helpers ── */
function getBookings() {
  try { return JSON.parse(localStorage.getItem('sn_bookings') || '[]'); } catch { return []; }
}
function show(id) { var el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function hide(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    var d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch(e) { return dateStr; }
}
