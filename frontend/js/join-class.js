/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — JOIN CLASS JS
   Lookup booking by email or WhatsApp, show class details.
═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Auto-fill from URL param ?q=email
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
  if (btn) btn.textContent = '⏳ Searching...';

  setTimeout(() => {
    if (btn) btn.textContent = '🔍 Find My Class';

    const bookings = getBookings();
    // Match by email OR whatsapp (strip spaces/dashes for phone comparison)
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

    // Show the most recent / upcoming booking
    const booking = matches.sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt))[0];
    renderClassScreen(booking, matches);
    show('classScreen');
    hide('lookupScreen');
    hide('noBookingScreen');
  }, 800);
}

function renderClassScreen(b, allMatches) {
  // Student card
  const initials = b.studentName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('studentCard').innerHTML = `
    <div class="jc-student-av">${initials}</div>
    <div class="jc-student-info">
      <div class="jc-student-name">${b.studentName}</div>
      <div class="jc-student-meta">
        ${b.grade} &nbsp;·&nbsp; Age ${b.age} &nbsp;·&nbsp; ${b.subject}<br>
        📅 ${formatDate(b.date)} &nbsp;·&nbsp; 🕐 ${b.time}
      </div>
      <div class="jc-booking-id">Booking: ${b.id}</div>
    </div>
    ${allMatches.length > 1 ? `
      <div style="font-size:12px;font-weight:700;color:var(--light);background:var(--bg);border-radius:10px;padding:8px 12px;">
        ${allMatches.length} bookings found for this contact.<br>Showing most recent.
      </div>` : ''}
  `;

  // Join card
  const joinCard = document.getElementById('joinCard');
  if (b.classLink && b.status === 'scheduled') {
    joinCard.innerHTML = `
      <div class="jc-join-subject">📚 ${b.subject} — Live Class</div>
      <div class="jc-join-time">${b.time}</div>
      <div class="jc-join-date">📅 ${formatDate(b.date)}</div>
      <a href="${b.classLink}" target="_blank" class="jc-join-main-btn">
        🚀 Join Class Now
      </a>
      <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:16px;font-weight:700;">
        Tutor: ${b.assignedTutor || 'Being assigned'} &nbsp;·&nbsp; Opens in a new tab
      </div>
    `;
  } else {
    joinCard.classList.add('no-link');
    joinCard.innerHTML = `
      <div class="jc-join-subject">📚 ${b.subject}</div>
      <div class="jc-join-time">${b.time}</div>
      <div class="jc-join-date">📅 ${formatDate(b.date)}</div>
      <div class="jc-join-pending">
        ⏳ Your class is being scheduled.<br>
        Your tutor will be assigned shortly and the Join button will appear here.<br><br>
        <strong>Check your email and WhatsApp for updates.</strong>
      </div>
    `;
  }
}

function resetLookup() {
  hide('noBookingScreen');
  hide('classScreen');
  show('lookupScreen');
  const input = document.getElementById('lookupInput');
  if (input) { input.value = ''; input.focus(); }
}

/* ── Helpers ── */
function getBookings() {
  try { return JSON.parse(localStorage.getItem('sn_bookings') || '[]'); } catch { return []; }
}
function show(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  } catch { return dateStr; }
}
