/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — LOGIN.JS
   Role switcher, form validation, login handler.
═══════════════════════════════════════════════════════ */

let currentRole = 'tutor';

const loginConfig = {
  tutor: {
    eyebrowClass: 'eyebrow-tutor',
    eyebrowText:  '📡 Tutor Portal',
    title:        'Welcome back,<br>ready to teach? 👋',
    sub:          'Log in to access your dashboard, schedule and upcoming live sessions.',
    btnClass:     'btn-tutor-login',
    btnIcon:      '🎓',
    btnText:      'Log In as Tutor',
    tutorActive:  'active-tutor',
    studentActive:'',
    panelClass:   'panel-tutor',
    panelIcon:    '🎓',
    panelTitle:   'Your students<br>are waiting!',
    panelSub:     "Head into your dashboard, review today's schedule and start your next live 1-on-1 session.",
    ctaText:      '👩‍🏫 Join Us as a Tutor',
    ctaAction:    () => navigate('home'),
    cards: `
      <div class="pcard">
        <div class="pcard-icon">📅</div>
        <div><div class="pcard-title">Next session in 20 mins</div><div class="pcard-sub">James O. · Year 9 Maths</div></div>
      </div>
      <div class="pcard">
        <div class="pcard-icon">📊</div>
        <div><div class="pcard-title">4 sessions scheduled today</div><div class="pcard-sub">Coding · Maths · Sciences</div></div>
      </div>
      <div class="pcard">
        <div class="pcard-icon">⭐</div>
        <div><div class="pcard-title">Your rating: 4.9 / 5</div><div class="pcard-sub">Based on 48 student reviews</div></div>
      </div>`,
  },
  student: {
    eyebrowClass: 'eyebrow-student',
    eyebrowText:  '🧑‍💻 Student Portal',
    title:        "Hey there,<br>ready to learn? 🚀",
    sub:          "Log in to join your live class, check homework and see how far you've come.",
    btnClass:     'btn-student-login',
    btnIcon:      '🚀',
    btnText:      'Log In & Join Class',
    tutorActive:  '',
    studentActive:'active-student',
    panelClass:   'panel-student',
    panelIcon:    '🧑‍💻',
    panelTitle:   'Your class is<br>live & waiting!',
    panelSub:     "Jump in, your tutor is online and ready to help you learn something amazing today.",
    ctaText:      '🎓 Book a Free Trial Class — No commitment needed',
    ctaAction:    () => navigate('home'),
    cards: `
      <div class="pcard">
        <div class="pcard-icon">📡</div>
        <div><div class="pcard-title"><span class="live-dot"></span>Live Now — Python Class</div><div class="pcard-sub">Tutor: Sarah R. · 10:00 AM</div></div>
      </div>
      <div class="pcard">
        <div class="pcard-icon">🏆</div>
        <div><div class="pcard-title">You've completed 12 classes</div><div class="pcard-sub">Keep going — you're on a roll!</div></div>
      </div>
      <div class="pcard">
        <div class="pcard-icon">📝</div>
        <div><div class="pcard-title">1 homework task due</div><div class="pcard-sub">Python: Variables & Loops</div></div>
      </div>`,
  },
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  switchRole('tutor'); // set default state
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
});

/* ── SWITCH ROLE ── */
function switchRole(role) {
  currentRole = role;
  const c = loginConfig[role];

  // Toggle buttons
  document.getElementById('tutorBtn').className   = 'role-btn ' + c.tutorActive;
  document.getElementById('studentBtn').className = 'role-btn ' + c.studentActive;

  // Welcome copy
  const ey = document.getElementById('formEyebrow');
  ey.className   = 'form-eyebrow ' + c.eyebrowClass;
  ey.textContent = c.eyebrowText;
  document.getElementById('formTitle').innerHTML = c.title;
  document.getElementById('formSub').textContent = c.sub;

  // Input focus colour
  const pw = document.getElementById('passwordInput');
  const em = document.getElementById('emailInput');
  if (role === 'student') {
    pw?.classList.add('focus-green');
    em?.classList.add('focus-green');
  } else {
    pw?.classList.remove('focus-green');
    em?.classList.remove('focus-green');
  }

  // Login button
  const btn = document.getElementById('loginBtn');
  btn.className = 'login-btn ' + c.btnClass;
  document.getElementById('btnIcon').textContent = c.btnIcon;
  document.getElementById('btnText').textContent = c.btnText;

  // Right panel
  document.getElementById('brandPanel').className = 'brand-panel ' + c.panelClass;
  document.getElementById('panelIcon').textContent  = c.panelIcon;
  document.getElementById('panelTitle').innerHTML   = c.panelTitle;
  document.getElementById('panelSub').textContent   = c.panelSub;
  document.getElementById('panelCards').innerHTML   = c.cards;

  // CTA link below divider
  const cta = document.getElementById('loginCtaLink');
  cta.innerHTML = c.ctaText;
  cta.onclick   = c.ctaAction;
}

/* ── PASSWORD TOGGLE ── */
function togglePw() {
  const inp = document.getElementById('passwordInput');
  const btn = document.getElementById('pwToggle');
  if (inp.type === 'password') { inp.type = 'text';     btn.textContent = '🙈'; }
  else                         { inp.type = 'password'; btn.textContent = '👁️'; }
}

/* ── HANDLE LOGIN ── */
function handleLogin() {
  const email = document.getElementById('emailInput')?.value.trim();
  const pw    = document.getElementById('passwordInput')?.value;
  const btn   = document.getElementById('loginBtn');

  if (!email || !pw) {
    btn.style.animation = 'none';
    btn.offsetHeight; // reflow
    btn.style.animation = 'shake .4s ease';
    return;
  }

  // Loading state
  btn.style.opacity        = '0.7';
  btn.style.pointerEvents  = 'none';
  document.getElementById('btnText').textContent = 'Logging in…';
  document.getElementById('btnIcon').textContent = '⏳';

  // Simulate auth (replace with real API call)
  setTimeout(() => {
    btn.style.opacity       = '1';
    btn.style.pointerEvents = '';
    document.getElementById('btnIcon').textContent = '✅';

    if (currentRole === 'tutor') {
      document.getElementById('btnText').textContent = 'Welcome back! Redirecting…';
      setTimeout(() => navigate('tutor-dashboard'), 700);
    } else {
      document.getElementById('btnText').textContent = 'Joining your class…';
      setTimeout(() => navigate('home'), 700); // → student dashboard (future page)
    }
  }, 1600);
}
