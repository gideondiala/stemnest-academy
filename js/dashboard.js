/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — DASHBOARD.JS
   Tab switching, calendar, profile modal, greeting.
═══════════════════════════════════════════════════════ */

const TABS = ['overview', 'sessions', 'projects', 'calendar'];
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
const SESSION_DAYS = [1, 3, 4, 7, 8, 10, 14, 15, 17, 21, 22, 24, 28];

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  setGreeting();
  buildCalStrip();
  bindProfileModal();
  showDashTab('overview');
});

/* ── GREETING ── */
function setGreeting() {
  const h  = new Date().getHours();
  const el = document.getElementById('greetingTime');
  if (!el) return;
  el.textContent = h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';

  const dateEl = document.getElementById('dashDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }
}

/* ── TAB SWITCHING ── */
function showDashTab(tab) {
  TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });

  // Sidebar active state
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tab);
  });

  // Quick actions only on overview
  const qa = document.getElementById('quickActions');
  if (qa) qa.style.display = tab === 'overview' ? 'grid' : 'none';

  // Build calendar when that tab opens
  if (tab === 'calendar') buildFullCalendar();
}

/* ── CALENDAR STRIP (week view on overview) ── */
function buildCalStrip() {
  const strip = document.getElementById('calStrip');
  if (!strip) return;
  strip.innerHTML = '';

  const days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = new Date();

  for (let i = -1; i <= 6; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const hasSession = SESSION_DAYS.includes(d.getDate()) && d.getMonth() === calMonth;
    const div = document.createElement('div');
    div.className = 'cal-day'
      + (i === 0 ? ' cal-today' : '')
      + (hasSession ? ' cal-has-session' : '');

    div.innerHTML = `
      <div class="cal-dow">${days[d.getDay()]}</div>
      <div class="cal-num">${d.getDate()}</div>
      ${hasSession ? '<div class="cal-dot"></div>' : ''}`;
    strip.appendChild(div);
  }
}

/* ── FULL CALENDAR (calendar tab) ── */
function buildFullCalendar() {
  const grid       = document.getElementById('calGrid');
  const monthLabel = document.getElementById('calMonth');
  if (!grid) return;

  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  if (monthLabel) monthLabel.textContent = `${monthNames[calMonth]} ${calYear}`;

  const dayNames   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today      = new Date();
  const isCurrent  = today.getFullYear() === calYear && today.getMonth() === calMonth;
  const firstDay   = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth= new Date(calYear, calMonth + 1, 0).getDate();
  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();

  grid.innerHTML = '';

  // Day labels
  dayNames.forEach(d => {
    const el = document.createElement('div');
    el.className   = 'cal-day-label';
    el.textContent = d;
    grid.appendChild(el);
  });

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    const el = document.createElement('div');
    el.className   = 'cal-day other-month';
    el.textContent = prevMonthDays - i;
    grid.appendChild(el);
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const el = document.createElement('div');
    el.className   = 'cal-day';
    el.textContent = d;
    if (isCurrent && d === today.getDate()) el.classList.add('today');
    if (SESSION_DAYS.includes(d))           el.classList.add('has-session');
    grid.appendChild(el);
  }

  // Next month padding
  const total     = firstDay + daysInMonth;
  const remaining = (7 - (total % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const el = document.createElement('div');
    el.className   = 'cal-day other-month';
    el.textContent = d;
    grid.appendChild(el);
  }
}

function changeCalMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  buildFullCalendar();
}

/* ── PROFILE MODAL ── */
function bindProfileModal() {
  const overlay = document.getElementById('profileModalOverlay');
  overlay?.addEventListener('click', e => {
    if (e.target === overlay) closeProfileModal();
  });
}

function openProfileModal() {
  document.getElementById('profileModalOverlay')?.classList.add('open');
}

function closeProfileModal() {
  document.getElementById('profileModalOverlay')?.classList.remove('open');
}

function saveProfile() {
  closeProfileModal();
  showToast('✅ Profile updated successfully!');
}
