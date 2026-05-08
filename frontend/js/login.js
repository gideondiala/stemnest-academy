/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — LOGIN.JS
   Role switcher, form validation, login handler.
═══════════════════════════════════════════════════════ */

let currentRole = 'student';

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
  seedRegistries();   // ensure defaults exist before any login attempt
  switchRole('student');
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
});

/* ── SEED DEFAULT REGISTRIES (runs once, skips if already populated) ── */
function seedRegistries() {
  // Teachers
  if (!localStorage.getItem('sn_teachers') || JSON.parse(localStorage.getItem('sn_teachers')).length === 0) {
    const teachers = [
      { id:'CT001', name:'Sarah Rahman',  initials:'SR', subject:'Coding',   email:'sarah.rahman@stemnest.co.uk',  password:'StemNest2024!', courses:['Python for Beginners','Scratch & Game Design','Web Dev: HTML/CSS/JS'], gradeGroups:['Year 7–9','Year 10–11'], availability:'Mon–Fri, 9am–6pm', dbs:'yes', color:'linear-gradient(135deg,#1a56db,#4f87f5)', photo:null },
      { id:'MT001', name:'James Okafor',  initials:'JO', subject:'Maths',    email:'james.okafor@stemnest.co.uk',  password:'StemNest2024!', courses:['Primary Maths Boost','GCSE Maths Prep','A-Level Maths Mastery'],         gradeGroups:['Year 7–9','Year 10–11','Year 12–13'], availability:'Mon–Sat, 10am–7pm', dbs:'yes', color:'linear-gradient(135deg,#0e9f6e,#3dd9a4)', photo:null },
      { id:'ST001', name:'Lisa Patel',    initials:'LP', subject:'Sciences', email:'lisa.patel@stemnest.co.uk',    password:'StemNest2024!', courses:['GCSE Biology','GCSE Chemistry','A-Level Physics'],                         gradeGroups:['Year 10–11','Year 12–13'], availability:'Tue–Sat, 11am–6pm', dbs:'yes', color:'linear-gradient(135deg,#ff6b35,#ffaa80)', photo:null },
      { id:'CT002', name:'Marcus King',   initials:'MK', subject:'Coding',   email:'marcus.king@stemnest.co.uk',   password:'StemNest2024!', courses:['Python for Beginners','AI Literacy','A-Level Computer Science'],           gradeGroups:['Year 10–11','Year 12–13'], availability:'Mon–Fri, 2pm–9pm', dbs:'yes', color:'linear-gradient(135deg,#7c3aed,#a78bfa)', photo:null },
    ];
    localStorage.setItem('sn_teachers', JSON.stringify(teachers));
  }

  // Sales persons
  if (!localStorage.getItem('sn_sales_persons') || JSON.parse(localStorage.getItem('sn_sales_persons')).length === 0) {
    const salesPersons = [
      { id:'SP001', name:'Alex Johnson', initials:'AJ', email:'alex.johnson@stemnest.co.uk', password:'StemNest2024!', region:'UK & Europe',   bio:'Senior academic counselor.', color:'linear-gradient(135deg,#ff6b35,#fbbf24)', photo:null },
    ];
    localStorage.setItem('sn_sales_persons', JSON.stringify(salesPersons));
  }

  // Operations, Pre-Sales, Post-Sales, HR staff
  if (!localStorage.getItem('sn_staff') || JSON.parse(localStorage.getItem('sn_staff')).length === 0) {
    const staff = [
      { id:'OPS001', name:'Operations Team', email:'ops@stemnest.co.uk',      password:'StemNest2024!', role:'operations' },
      { id:'PS001',  name:'Pre-Sales Team',  email:'presales@stemnest.co.uk', password:'StemNest2024!', role:'presales'   },
      { id:'POS001', name:'Post-Sales Team', email:'postsales@stemnest.co.uk',password:'StemNest2024!', role:'postsales'  },
      { id:'HR001',  name:'HR Team',         email:'hr@stemnest.co.uk',       password:'StemNest2024!', role:'hr'         },
    ];
    localStorage.setItem('sn_staff', JSON.stringify(staff));
  }
}

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
async function handleLogin() {
  const email = document.getElementById('emailInput')?.value.trim();
  const pw    = document.getElementById('passwordInput')?.value;
  const btn   = document.getElementById('loginBtn');

  if (!email || !pw) {
    btn.style.animation = 'none';
    btn.offsetHeight;
    btn.style.animation = 'shake .4s ease';
    return;
  }

  btn.style.opacity       = '0.7';
  btn.style.pointerEvents = 'none';
  document.getElementById('btnText').textContent = 'Logging in…';
  document.getElementById('btnIcon').textContent = '⏳';

  /* ── Try real API first ── */
  const apiOnline = await isApiAvailable();

  if (apiOnline) {
    try {
      const user = await Auth.login(email, pw);

      document.getElementById('btnIcon').textContent = '✅';
      document.getElementById('btnText').textContent = `Welcome, ${user.name.split(' ')[0]}! Redirecting…`;

      /* Route by role */
      const roleRoutes = {
        tutor:       'tutor-dashboard',
        student:     'student-dashboard',
        sales:       'sales-dashboard',
        presales:    'presales-dashboard',
        postsales:   'postsales-dashboard',
        operations:  'operations-dashboard',
        hr:          'hr-dashboard',
        admin:       'admin-dashboard',
        super_admin: 'super-admin',
      };

      const dest = roleRoutes[user.role];
      if (dest) {
        /* Store role-specific IDs for dashboard JS compatibility */
        if (user.role === 'tutor')   localStorage.setItem('sn_logged_in_teacher', user.staffId || user.id);
        if (user.role === 'sales')   localStorage.setItem('sn_logged_in_sales',   user.staffId || user.id);
        if (user.role === 'student') localStorage.setItem('sn_logged_in_student', user.email);
        setTimeout(() => navigate(dest), 700);
      } else {
        throw new Error('Unknown role: ' + user.role);
      }
      return;
    } catch (err) {
      /* API login failed — show error */
      btn.style.opacity       = '1';
      btn.style.pointerEvents = '';
      document.getElementById('btnIcon').textContent = '❌';
      document.getElementById('btnText').textContent = err.message === 'Invalid email or password'
        ? 'Invalid credentials' : 'Login failed — try again';
      btn.style.animation = 'none';
      btn.offsetHeight;
      btn.style.animation = 'shake .4s ease';
      setTimeout(() => {
        document.getElementById('btnIcon').textContent = loginConfig[currentRole].btnIcon;
        document.getElementById('btnText').textContent = loginConfig[currentRole].btnText;
      }, 2000);
      return;
    }
  }

  /* ── Fallback: localStorage (offline / demo mode) ── */
  setTimeout(() => {
    btn.style.opacity       = '1';
    btn.style.pointerEvents = '';

    if (currentRole === 'tutor') {
      const teachers = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
      const teacher  = teachers.find(t => t.email.toLowerCase() === email.toLowerCase() && t.password === pw);
      const salesPersons = JSON.parse(localStorage.getItem('sn_sales_persons') || '[]');
      const salesPerson  = salesPersons.find(s => s.email.toLowerCase() === email.toLowerCase() && s.password === pw);
      const staff = JSON.parse(localStorage.getItem('sn_staff') || '[]');
      const staffMember = staff.find(s => s.email.toLowerCase() === email.toLowerCase() && s.password === pw);

      if (teacher) {
        localStorage.setItem('sn_logged_in_teacher', teacher.id);
        document.getElementById('btnIcon').textContent = '✅';
        document.getElementById('btnText').textContent = `Welcome back, ${teacher.name.split(' ')[0]}!`;
        setTimeout(() => navigate('tutor-dashboard'), 700);
      } else if (salesPerson) {
        localStorage.setItem('sn_logged_in_sales', salesPerson.id);
        document.getElementById('btnIcon').textContent = '✅';
        document.getElementById('btnText').textContent = `Welcome, ${salesPerson.name.split(' ')[0]}!`;
        setTimeout(() => navigate('sales-dashboard'), 700);
      } else if (staffMember) {
        document.getElementById('btnIcon').textContent = '✅';
        document.getElementById('btnText').textContent = 'Welcome! Redirecting…';
        setTimeout(() => navigate(staffMember.role), 700);
      } else if (email === 'admin@stemnest.co.uk' && pw === 'admin123') {
        document.getElementById('btnIcon').textContent = '✅';
        document.getElementById('btnText').textContent = 'Welcome, Admin!';
        setTimeout(() => navigate('admin-dashboard'), 700);
      } else if (email === 'founder@stemnest.co.uk' && pw === 'Founder2024!') {
        document.getElementById('btnIcon').textContent = '✅';
        document.getElementById('btnText').textContent = 'Welcome, Founder!';
        setTimeout(() => navigate('super-admin'), 700);
      } else {
        document.getElementById('btnIcon').textContent = '❌';
        document.getElementById('btnText').textContent = 'Invalid credentials';
        btn.style.animation = 'none';
        btn.offsetHeight;
        btn.style.animation = 'shake .4s ease';
        setTimeout(() => {
          document.getElementById('btnIcon').textContent = loginConfig[currentRole].btnIcon;
          document.getElementById('btnText').textContent = loginConfig[currentRole].btnText;
        }, 1500);
      }
    } else {
      // Student login
      document.getElementById('btnIcon').textContent = '✅';
      document.getElementById('btnText').textContent = 'Joining your class…';
      setTimeout(() => navigate('student-dashboard'), 700);
    }
  }, 1200);
}

/* ══════════════════════════════════════════════════════
   FORGOT PASSWORD
══════════════════════════════════════════════════════ */
function openForgotPassword() {
  document.getElementById('forgotStep1').style.display = 'block';
  document.getElementById('forgotStep2').style.display = 'none';
  const emailEl = document.getElementById('forgotEmail');
  if (emailEl) emailEl.value = '';
  document.getElementById('forgotPwOverlay').classList.add('open');
}

function closeForgotPassword() {
  document.getElementById('forgotPwOverlay').classList.remove('open');
}

async function submitForgotPassword() {
  const email = document.getElementById('forgotEmail')?.value.trim().toLowerCase();
  if (!email) { showToast('Please enter your email address.', 'error'); return; }

  const btn = document.querySelector('#forgotStep1 button.btn-primary') ||
              document.querySelector('#forgotStep1 .btn');

  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }

  /* Try real API first */
  const apiOnline = await isApiAvailable();
  if (apiOnline) {
    try {
      await Auth.forgotPassword(email);
      document.getElementById('forgotStep1').style.display = 'none';
      document.getElementById('forgotStep2').style.display = 'block';
      document.getElementById('forgotSuccessMsg').textContent =
        `If ${email} is registered, a reset link has been sent to that address. Check your email and WhatsApp.`;
      const tempBox = document.getElementById('forgotTempPwBox');
      if (tempBox) tempBox.style.display = 'none';
      if (btn) { btn.textContent = 'Send Reset Link'; btn.disabled = false; }
      return;
    } catch (err) {
      /* Fall through to localStorage */
    }
  }

  /* Fallback: localStorage demo mode */
  if (btn) { btn.textContent = 'Send Reset Link'; btn.disabled = false; }

  let found = null, registry = null, registryKey = null;
  const teachers = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
  const teacher  = teachers.find(t => t.email.toLowerCase() === email);
  if (teacher) { found = teacher; registry = teachers; registryKey = 'sn_teachers'; }

  if (!found) {
    const sales = JSON.parse(localStorage.getItem('sn_sales_persons') || '[]');
    const sp    = sales.find(s => s.email.toLowerCase() === email);
    if (sp) { found = sp; registry = sales; registryKey = 'sn_sales_persons'; }
  }
  if (!found) {
    const staff = JSON.parse(localStorage.getItem('sn_staff') || '[]');
    const sm    = staff.find(s => s.email.toLowerCase() === email);
    if (sm) { found = sm; registry = staff; registryKey = 'sn_staff'; }
  }
  if (!found) {
    const students = JSON.parse(localStorage.getItem('sn_students') || '[]');
    const st       = students.find(s => s.email.toLowerCase() === email);
    if (st) { found = st; registry = students; registryKey = 'sn_students'; }
  }
  if (!found && email === 'admin@stemnest.co.uk')   found = { name:'Admin',   email, password:'admin123',   _isAdmin:true };
  if (!found && email === 'founder@stemnest.co.uk') found = { name:'Founder', email, password:'Founder2024!', _isFounder:true };

  if (!found) { showToast('No account found with that email address.', 'error'); return; }

  const tempPw = 'SN' + Math.random().toString(36).slice(2, 8).toUpperCase() + '!';
  if (registry && registryKey) {
    const idx = registry.findIndex(u => u.email.toLowerCase() === email);
    if (idx !== -1) { registry[idx].password = tempPw; localStorage.setItem(registryKey, JSON.stringify(registry)); }
  }

  document.getElementById('forgotStep1').style.display = 'none';
  document.getElementById('forgotStep2').style.display = 'block';
  document.getElementById('forgotSuccessMsg').textContent =
    `A temporary password has been sent to ${email}. Use it to log in, then change your password.`;
  const tempBox = document.getElementById('forgotTempPwBox');
  if (tempBox) {
    tempBox.style.display = 'block';
    tempBox.innerHTML = `<strong>Temp Password (demo mode):</strong><br><span style="font-family:'Courier New',monospace;font-size:16px;color:var(--blue);font-weight:900;">${tempPw}</span>`;
  }
}

/* Bind overlay close */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('forgotPwOverlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeForgotPassword(); });
});

/* ── PASSWORD REGISTRY (for Super Admin chart) ── */
function updatePasswordRegistry(user) {
  const reg = JSON.parse(localStorage.getItem('sn_password_registry') || '[]');
  const idx = reg.findIndex(u => u.id === user.id || u.email === user.email);
  const entry = { id: user.id || user.email, name: user.name, email: user.email, role: user.role || 'user', password: user.password, updatedAt: new Date().toISOString() };
  if (idx !== -1) reg[idx] = entry;
  else reg.unshift(entry);
  localStorage.setItem('sn_password_registry', JSON.stringify(reg));
}
