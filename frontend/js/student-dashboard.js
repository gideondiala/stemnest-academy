/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — STUDENT DASHBOARD JS
   Tabs, lessons, projects, quizzes, certificates, PDF.
═══════════════════════════════════════════════════════ */

/* ── STUDENT DATA ── */
const STUDENT = {
  name: 'James Okafor', initials: 'JO', id: 'S-0047', year: 'Year 9',
};

/* ── COURSES & PROGRESS ── */
const COURSES = [
  { id:1, name:'Python for Beginners',    tutor:'Sarah Rahman',  progress:58, total:24, done:14, color:'blue'   },
  { id:2, name:'GCSE Maths Prep',         tutor:'James Okafor',  progress:35, total:28, done:10, color:'green'  },
  { id:3, name:'Scratch & Game Design',   tutor:'Sarah Rahman',  progress:80, total:16, done:13, color:'purple' },
];

/* ── UPCOMING LESSONS ── */
const LESSONS = [
  {
    id:1, title:'Python for Beginners', date:'Mon 21 Apr 2026', time:'11:00 AM',
    tutor:'Sarah Rahman', subject:'Coding', duration:'60 mins', status:'live',
    modules:[
      { num:1, title:'Variables & Data Types',      done:true  },
      { num:2, title:'Conditionals (if/else)',       done:true  },
      { num:3, title:'Loops (for & while)',          done:true  },
      { num:4, title:'Functions & Return Values',    done:false, current:true },
      { num:5, title:'Lists & Dictionaries',         done:false },
      { num:6, title:'File Handling',                done:false },
      { num:7, title:'Mini Project: Calculator',     done:false },
      { num:8, title:'Final Project: Text Game',     done:false },
    ],
  },
  {
    id:2, title:'GCSE Maths Prep', date:'Tue 22 Apr 2026', time:'3:00 PM',
    tutor:'James Okafor', subject:'Maths', duration:'45 mins', status:'upcoming',
    modules:[
      { num:1, title:'Number & Algebra Basics',      done:true  },
      { num:2, title:'Fractions & Percentages',      done:true  },
      { num:3, title:'Equations & Inequalities',     done:false, current:true },
      { num:4, title:'Geometry & Trigonometry',      done:false },
      { num:5, title:'Statistics & Probability',     done:false },
      { num:6, title:'Mock Exam Practice',           done:false },
    ],
  },
  {
    id:3, title:'Scratch & Game Design', date:'Wed 23 Apr 2026', time:'4:00 PM',
    tutor:'Sarah Rahman', subject:'Coding', duration:'45 mins', status:'upcoming',
    modules:[
      { num:1, title:'Scratch Interface Tour',       done:true  },
      { num:2, title:'Sprites & Backdrops',          done:true  },
      { num:3, title:'Motion & Events',              done:true  },
      { num:4, title:'Loops & Conditions',           done:true  },
      { num:5, title:'Building a Maze Game',         done:false, current:true },
      { num:6, title:'Adding Scores & Lives',        done:false },
    ],
  },
  {
    id:4, title:'Python for Beginners', date:'Mon 28 Apr 2026', time:'11:00 AM',
    tutor:'Sarah Rahman', subject:'Coding', duration:'60 mins', status:'upcoming',
    modules:[
      { num:5, title:'Lists & Dictionaries',         done:false, current:true },
      { num:6, title:'File Handling',                done:false },
    ],
  },
  {
    id:5, title:'GCSE Maths Prep', date:'Tue 29 Apr 2026', time:'3:00 PM',
    tutor:'James Okafor', subject:'Maths', duration:'45 mins', status:'upcoming',
    modules:[
      { num:4, title:'Geometry & Trigonometry',      done:false, current:true },
    ],
  },
  {
    id:6, title:'Scratch & Game Design', date:'Wed 30 Apr 2026', time:'4:00 PM',
    tutor:'Sarah Rahman', subject:'Coding', duration:'45 mins', status:'upcoming',
    modules:[
      { num:6, title:'Adding Scores & Lives',        done:false, current:true },
    ],
  },
];

/* ── PROJECTS DATA ── */
let pendingProjects = [
  {
    id:1, emoji:'🎮', title:'Snake Game in Python',
    course:'Python for Beginners', due:'25 Apr 2026',
    brief:'Build a classic Snake game using Python and the turtle module.',
    steps:[
      'Set up the game window using turtle.Screen()',
      'Create the snake as a list of turtle segments',
      'Handle keyboard input (arrow keys) to change direction',
      'Generate food at random positions on screen',
      'Detect collisions with walls and the snake itself',
      'Display and update the score',
      'Add a game-over screen with restart option',
    ],
  },
  {
    id:2, emoji:'🌐', title:'Personal Portfolio Website',
    course:'Python for Beginners', due:'28 Apr 2026',
    brief:'Design and build a personal portfolio page using HTML and CSS.',
    steps:[
      'Create the HTML structure: header, about, projects, contact sections',
      'Style with CSS using flexbox or grid layout',
      'Add your name, photo placeholder, and a short bio',
      'List 2–3 projects you have worked on',
      'Make it mobile-responsive using media queries',
      'Add a contact form (no backend needed — just the HTML)',
    ],
  },
  {
    id:3, emoji:'🧮', title:'Number Guessing Game',
    course:'Python for Beginners', due:'30 Apr 2026',
    brief:'Create a number guessing game where the computer picks a random number and the player guesses it.',
    steps:[
      'Import the random module and generate a number between 1 and 100',
      'Ask the player to enter a guess in a loop',
      'Give hints: "Too high" or "Too low"',
      'Count the number of attempts',
      'Congratulate the player when they guess correctly',
      'Ask if they want to play again',
    ],
  },
];

let submittedProjects = [];

let reviewedProjects = [];

/* ── QUIZZES DATA ── */
const QUIZ_QUESTIONS = {
  q1: [
    { q:'What keyword is used to define a function in Python?',         opts:['func','def','function','define'],       ans:1 },
    { q:'Which of these is a valid Python variable name?',              opts:['2name','my-var','my_var','class'],       ans:2 },
    { q:'What does len("hello") return?',                               opts:['4','5','6','hello'],                     ans:1 },
    { q:'Which symbol is used for comments in Python?',                 opts:['//','/*','#','--'],                      ans:2 },
    { q:'What is the output of print(2 ** 3)?',                         opts:['6','8','9','5'],                         ans:1 },
    { q:'Which data type stores True or False?',                        opts:['int','str','bool','float'],              ans:2 },
    { q:'How do you start a for loop in Python?',                       opts:['for x in range:','for(x=0;x<5;x++)','for x in range(5):','loop x to 5:'], ans:2 },
    { q:'What does the append() method do to a list?',                  opts:['Removes last item','Adds item to end','Sorts the list','Clears the list'], ans:1 },
    { q:'Which function converts a string to an integer?',              opts:['str()','float()','int()','num()'],       ans:2 },
    { q:'What is the correct way to create a dictionary in Python?',    opts:['[key:value]','(key,value)','{key:value}','<key=value>'], ans:2 },
  ],
  q2: [
    { q:'What is 15% of 200?',                                          opts:['25','30','35','40'],                     ans:1 },
    { q:'Solve: 3x + 7 = 22. What is x?',                              opts:['3','4','5','6'],                         ans:2 },
    { q:'What is the area of a rectangle 8cm × 5cm?',                   opts:['26cm²','40cm²','13cm²','80cm²'],         ans:1 },
    { q:'What is the square root of 144?',                              opts:['11','12','13','14'],                     ans:1 },
    { q:'Simplify: 4/8',                                                opts:['2/4','1/2','3/6','1/4'],                 ans:1 },
    { q:'What is the gradient of y = 3x + 5?',                         opts:['5','3','8','1'],                         ans:1 },
    { q:'Convert 0.75 to a fraction.',                                  opts:['3/5','2/3','3/4','4/5'],                 ans:2 },
    { q:'What is 2³ × 2²?',                                             opts:['2⁵','2⁶','4⁵','8'],                     ans:0 },
    { q:'The angles in a triangle sum to:',                             opts:['90°','180°','270°','360°'],              ans:1 },
    { q:'What is the median of: 3, 7, 2, 9, 5?',                       opts:['5','7','3','9'],                         ans:0 },
  ],
};

let pendingQuizzes = [
  { id:'q1', title:'Python Basics Quiz',    course:'Python for Beginners', questions:10, timeLimit:'15 mins', emoji:'💻' },
  { id:'q2', title:'GCSE Maths — Algebra',  course:'GCSE Maths Prep',      questions:10, timeLimit:'15 mins', emoji:'📐' },
];
let completedQuizzes = [];

/* ── CERTIFICATES DATA ── */
const CERTIFICATES = [
  {
    id:1, course:'Scratch & Game Design', instructor:'Sarah Rahman',
    date:'15 March 2026', grade:'Distinction', emoji:'🎮',
    color:'purple',
  },
  {
    id:2, course:'Introduction to HTML & CSS', instructor:'Sarah Rahman',
    date:'10 February 2026', grade:'Merit', emoji:'🌐',
    color:'blue',
  },
];

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setGreeting();
  loadStudentFromStorage();
  renderProgressBars();
  renderUpcomingPreview();
  renderLessons();
  renderProjectSection('pending');
  renderPendingQuizzes();
  renderCompletedQuizzes();
  renderCertificates();
  bindModalCloseOnOverlay('projectModalOverlay', closeProjectModal);
  bindModalCloseOnOverlay('quizModalOverlay',    closeQuizModal);
  bindModalCloseOnOverlay('certModalOverlay',    closeCertModal);
  bindModalCloseOnOverlay('profileModalOverlay', closeProfileModal);
  showTab('overview');
});

/* ── Load student from localStorage (if onboarded) ── */
function loadStudentFromStorage() {
  try {
    const email = localStorage.getItem('sn_logged_in_student');
    if (!email) { updateCreditsDisplay(null); return; }
    const students = JSON.parse(localStorage.getItem('sn_students') || '[]');
    const s = students.find(st => st.email === email);
    if (!s) { updateCreditsDisplay(null); return; }

    // Format ID as S-0001
    const rawId = s.id || '';
    const numMatch = rawId.match(/(\d+)$/);
    const formattedId = numMatch ? 'S-' + numMatch[1].padStart(4, '0') : rawId;

    // Update sidebar
    const nameEl = document.getElementById('sidebarName');
    if (nameEl) nameEl.textContent = s.name || STUDENT.name;
    const idEl = document.querySelector('.student-id-badge');
    if (idEl) idEl.textContent = 'ID: ' + formattedId;

    updateCreditsDisplay(parseInt(s.credits) || 0);
  } catch(e) { updateCreditsDisplay(null); }
}

function updateCreditsDisplay(credits) {
  const statEl  = document.getElementById('statCreditsRemaining');
  const noteEl  = document.getElementById('statCreditsNote');
  if (statEl) statEl.textContent = credits !== null ? credits : '—';
  if (noteEl) {
    if (credits === null) { noteEl.textContent = 'Class credits'; return; }
    if (credits <= 2) {
      noteEl.innerHTML = '<span style="color:#ffd700;font-weight:900;">⚠️ Low — Top up soon</span>';
    } else {
      noteEl.textContent = credits + ' class' + (credits !== 1 ? 'es' : '') + ' remaining';
    }
  }
}

/* ── GREETING ── */
function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById('greetingTime');
  if (el) el.textContent = h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';
  const dateEl = document.getElementById('dashDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });
}

/* ── TAB SWITCHING ── */
const ALL_TABS = ['overview','lessons','projects','quizzes','certificates','payments'];
function showTab(tab) {
  ALL_TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tab);
  });
}

/* ── HELPER: bind overlay click to close ── */
function bindModalCloseOnOverlay(overlayId, closeFn) {
  const el = document.getElementById(overlayId);
  el?.addEventListener('click', e => { if (e.target === el) closeFn(); });
}

/* ══════════════════════════════════════════════════════
   OVERVIEW — PROGRESS BARS
══════════════════════════════════════════════════════ */
function renderProgressBars() {
  const el = document.getElementById('progressList');
  if (!el) return;
  el.innerHTML = COURSES.map(c => `
    <div class="progress-item">
      <div class="progress-top">
        <div class="progress-name">${c.name}</div>
        <div class="progress-pct" style="color:var(--${c.color})">${c.progress}%</div>
      </div>
      <div class="progress-sub">Tutor: ${c.tutor} &nbsp;·&nbsp; ${c.done} of ${c.total} classes done</div>
      <div class="progress-track">
        <div class="progress-fill pf-${c.color}" style="width:${c.progress}%"></div>
      </div>
    </div>
  `).join('');
}

/* ── OVERVIEW — UPCOMING PREVIEW (first 3 lessons) ── */
function renderUpcomingPreview() {
  const el = document.getElementById('upcomingPreview');
  if (!el) return;
  el.innerHTML = LESSONS.slice(0, 3).map(l => buildSessionItem(l)).join('');
}

function buildSessionItem(l) {
  const isLive = l.status === 'live';
  const badgeHtml = isLive
    ? `<span class="sess-badge sb-live">🔴 Live Now</span><button class="join-btn" onclick="joinClass()">Join →</button>`
    : `<span class="sess-badge sb-upcoming">Upcoming</span>`;
  return `
    <div class="session-item${isLive ? ' live' : ''}">
      <div class="sess-time">
        <div class="sess-time-val">${l.time.split(' ')[0]}</div>
        <div class="sess-time-label">${l.time.split(' ')[1] || ''}</div>
      </div>
      <div class="sess-divider"></div>
      <div class="sess-info">
        <div class="sess-student">${l.title}</div>
        <div class="sess-subject">${l.subject} · ${l.tutor} · ${l.duration} · ${l.date}</div>
      </div>
      ${badgeHtml}
    </div>`;
}

function joinClass() {
  showToast('🚀 Opening your live class...', 'info');
  setTimeout(() => window.open('https://meet.google.com', '_blank'), 800);
}

/* ══════════════════════════════════════════════════════
   LESSONS TAB
══════════════════════════════════════════════════════ */
function renderLessons() {
  const el = document.getElementById('lessonsList');
  if (!el) return;
  el.innerHTML = LESSONS.map((l, i) => {
    const isLive = l.status === 'live';
    return `
      <div class="lesson-card${isLive ? ' lesson-live' : ''}" onclick="showModules(${i})">
        <div class="lesson-card-left">
          <div class="lesson-date-box">
            <div class="lesson-day">${l.date.split(' ')[1]}</div>
            <div class="lesson-month">${l.date.split(' ')[2]}</div>
          </div>
          <div class="lesson-info">
            <div class="lesson-title">${l.title}</div>
            <div class="lesson-meta">🕐 ${l.time} &nbsp;·&nbsp; 👩‍🏫 ${l.tutor} &nbsp;·&nbsp; ⏱ ${l.duration}</div>
          </div>
        </div>
        <div class="lesson-card-right">
          ${isLive
            ? `<button class="join-btn" onclick="event.stopPropagation();joinClass()">🚀 Join</button>`
            : `<span class="sess-badge sb-upcoming">Upcoming</span>`}
          <span class="lesson-arrow">›</span>
        </div>
      </div>`;
  }).join('');
}

function showModules(idx) {
  const l = LESSONS[idx];
  const panel = document.getElementById('modulePanel');
  if (!panel) return;

  // Highlight selected lesson card
  document.querySelectorAll('.lesson-card').forEach((c, i) => {
    c.classList.toggle('lesson-selected', i === idx);
  });

  panel.innerHTML = `
    <div class="module-panel-header">
      <div class="module-panel-title">${l.title}</div>
      <div class="module-panel-sub">${l.date} · ${l.time}</div>
    </div>
    <div class="module-list">
      ${l.modules.map(m => `
        <div class="module-item${m.done ? ' mod-done' : ''}${m.current ? ' mod-current' : ''}">
          <div class="mod-icon">${m.done ? '✅' : m.current ? '▶️' : '⬜'}</div>
          <div class="mod-text">
            <div class="mod-num">Module ${m.num}</div>
            <div class="mod-title">${m.title}</div>
          </div>
          ${m.current ? '<span class="mod-badge">Current</span>' : ''}
          ${m.done    ? '<span class="mod-badge mod-done-badge">Done</span>' : ''}
        </div>
      `).join('')}
    </div>`;
}

/* ══════════════════════════════════════════════════════
   PROJECTS TAB — Toggle sections with pagination
══════════════════════════════════════════════════════ */
const PROJ_PAGE_SIZE = 10;
const _projPage = { pending: 0, submitted: 0, reviewed: 0 };

function showProjectSection(section) {
  ['pending','submitted','reviewed'].forEach(s => {
    const sec = document.getElementById('projSection-' + s);
    const btn = document.getElementById('projToggle-' + s);
    if (sec) sec.style.display = s === section ? 'block' : 'none';
    if (btn) {
      btn.classList.toggle('proj-toggle-active', s === section);
      // Fix count badge color
      const span = btn.querySelector('span');
      if (span) span.style.background = s === section ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.08)';
    }
  });
  _projPage[section] = 0;
  renderProjectSection(section);
}

function renderProjectSection(section) {
  if (section === 'pending')   renderPendingProjects();
  if (section === 'submitted') renderSubmittedProjects();
  if (section === 'reviewed')  renderReviewedProjects();
}

function loadMoreProjects(section) {
  _projPage[section]++;
  renderProjectSection(section);
}

function renderPendingProjects() {
  const el = document.getElementById('pendingProjects');
  const moreEl = document.getElementById('pendingLoadMore');
  const countEl = document.getElementById('projPendingCount');
  if (!el) return;

  if (countEl) countEl.textContent = pendingProjects.length;
  const badge = document.getElementById('projBadge');
  if (badge) badge.textContent = pendingProjects.length;

  if (pendingProjects.length === 0) {
    el.innerHTML = '<div class="empty-state">🎉 All projects submitted! Great work.</div>';
    if (moreEl) moreEl.style.display = 'none';
    return;
  }

  const page  = _projPage.pending || 0;
  const slice = pendingProjects.slice(0, (page + 1) * PROJ_PAGE_SIZE);
  el.innerHTML = slice.map(p => `
    <div class="student-proj-card" onclick="openProjectModal(${p.id})">
      <div class="spc-emoji">${p.emoji}</div>
      <div class="spc-info">
        <div class="spc-title">${p.title}</div>
        <div class="spc-meta">${p.course} &nbsp;·&nbsp; Due: ${p.due}</div>
      </div>
      <div class="spc-arrow">›</div>
    </div>
  `).join('');

  if (moreEl) moreEl.style.display = slice.length < pendingProjects.length ? 'block' : 'none';
}

function renderSubmittedProjects() {
  const el = document.getElementById('submittedProjects');
  const moreEl = document.getElementById('submittedLoadMore');
  const countEl = document.getElementById('projSubmittedCount');
  if (!el) return;

  if (countEl) countEl.textContent = submittedProjects.length;

  if (submittedProjects.length === 0) {
    el.innerHTML = '<div class="empty-state" style="color:var(--light);">No submissions yet.</div>';
    if (moreEl) moreEl.style.display = 'none';
    return;
  }

  const page  = _projPage.submitted || 0;
  const slice = submittedProjects.slice(0, (page + 1) * PROJ_PAGE_SIZE);
  el.innerHTML = slice.map(p => `
    <div class="student-proj-card submitted-card">
      <div class="spc-emoji">${p.emoji}</div>
      <div class="spc-info">
        <div class="spc-title">${p.title}</div>
        <div class="spc-meta">${p.course} &nbsp;·&nbsp; Submitted ✓</div>
      </div>
      <span class="proj-badge pb-reviewed">Submitted ✓</span>
    </div>
  `).join('');

  if (moreEl) moreEl.style.display = slice.length < submittedProjects.length ? 'block' : 'none';
}

function renderReviewedProjects() {
  const el = document.getElementById('reviewedProjects');
  const moreEl = document.getElementById('reviewedLoadMore');
  const countEl = document.getElementById('projReviewedCount');
  if (!el) return;

  if (countEl) countEl.textContent = reviewedProjects.length;

  if (reviewedProjects.length === 0) {
    el.innerHTML = '<div class="empty-state" style="color:var(--light);">No reviewed projects yet.</div>';
    if (moreEl) moreEl.style.display = 'none';
    return;
  }

  const page  = _projPage.reviewed || 0;
  const slice = reviewedProjects.slice(0, (page + 1) * PROJ_PAGE_SIZE);
  el.innerHTML = slice.map(p => `
    <div class="student-proj-card reviewed-card" style="border-left:4px solid var(--green);">
      <div class="spc-emoji">${p.emoji}</div>
      <div class="spc-info">
        <div class="spc-title">${p.title}</div>
        <div class="spc-meta">${p.course} &nbsp;·&nbsp; Reviewed by ${p.reviewedBy || 'Tutor'}</div>
        ${p.remarks ? `<div style="font-size:12px;color:var(--mid);margin-top:4px;font-style:italic;">"${p.remarks}"</div>` : ''}
        ${p.score !== undefined ? `<div style="font-size:12px;font-weight:900;color:var(--green);margin-top:4px;">Score: ${p.score}/100 &nbsp;·&nbsp; +${p.score} pts</div>` : ''}
      </div>
      <span class="proj-badge" style="background:var(--green-light);color:var(--green-dark);">⭐ Reviewed</span>
    </div>
  `).join('');

  if (moreEl) moreEl.style.display = slice.length < reviewedProjects.length ? 'block' : 'none';
}

/* ── PROJECT MODAL ── */
let activeProjectId = null;

function openProjectModal(id) {
  const p = pendingProjects.find(x => x.id === id);
  if (!p) return;
  activeProjectId = id;

  document.getElementById('projModalTitle').textContent = `${p.emoji} ${p.title}`;
  document.getElementById('projModalMeta').innerHTML =
    `<span>📚 ${p.course}</span><span>📅 Due: ${p.due}</span>`;
  document.getElementById('projModalBrief').innerHTML =
    `<div class="proj-brief-label">📋 Project Brief</div><p>${p.brief}</p>`;
  document.getElementById('projModalSteps').innerHTML = `
    <div class="proj-brief-label">🪜 How to Approach This</div>
    <ol class="proj-steps-list">
      ${p.steps.map(s => `<li>${s}</li>`).join('')}
    </ol>`;
  document.getElementById('projSubmitText').value = '';
  document.getElementById('projectModalOverlay').classList.add('open');
}

function closeProjectModal() {
  document.getElementById('projectModalOverlay').classList.remove('open');
  activeProjectId = null;
}

function submitProject() {
  const text = document.getElementById('projSubmitText').value.trim();
  if (!text) { showToast('Please write your submission before submitting.', 'error'); return; }

  const idx = pendingProjects.findIndex(x => x.id === activeProjectId);
  if (idx === -1) return;

  const project = pendingProjects.splice(idx, 1)[0];
  submittedProjects.push({ ...project, submission: text, submittedAt: new Date().toISOString() });

  // Save to localStorage so teacher can see it
  try {
    const email = localStorage.getItem('sn_logged_in_student') || STUDENT.id;
    const key = 'sn_submitted_projects_' + email;
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    saved.unshift({ ...project, submission: text, submittedAt: new Date().toISOString(), status: 'submitted' });
    localStorage.setItem(key, JSON.stringify(saved));
  } catch(e) {}

  closeProjectModal();
  renderPendingProjects();
  renderSubmittedProjects();
  showToast('✅ Project submitted! Your tutor will review it soon.');
}

/* ══════════════════════════════════════════════════════
   QUIZZES TAB
══════════════════════════════════════════════════════ */
function renderPendingQuizzes() {
  const el = document.getElementById('pendingQuizzes');
  if (!el) return;
  if (pendingQuizzes.length === 0) {
    el.innerHTML = '<div class="empty-state">🎉 All quizzes completed!</div>';
    return;
  }
  el.innerHTML = pendingQuizzes.map(q => `
    <div class="quiz-card" onclick="openQuiz('${q.id}')">
      <div class="qc-emoji">${q.emoji}</div>
      <div class="qc-info">
        <div class="qc-title">${q.title}</div>
        <div class="qc-meta">${q.course} &nbsp;·&nbsp; ${q.questions} questions &nbsp;·&nbsp; ${q.timeLimit}</div>
      </div>
      <button class="btn btn-blue" style="font-size:13px;padding:8px 18px;" onclick="event.stopPropagation();openQuiz('${q.id}')">Start Quiz →</button>
    </div>
  `).join('');
  const badge = document.getElementById('quizBadge');
  if (badge) badge.textContent = pendingQuizzes.length;
}

function renderCompletedQuizzes() {
  const el = document.getElementById('completedQuizzes');
  if (!el) return;
  if (completedQuizzes.length === 0) {
    el.innerHTML = '<div class="empty-state" style="color:var(--light);">No completed quizzes yet.</div>';
    return;
  }
  el.innerHTML = completedQuizzes.map(q => `
    <div class="quiz-card completed-quiz">
      <div class="qc-emoji">${q.emoji}</div>
      <div class="qc-info">
        <div class="qc-title">${q.title}</div>
        <div class="qc-meta">${q.course}</div>
      </div>
      <div class="qc-score">
        <div class="qc-score-val">${q.score}/${q.total}</div>
        <div class="qc-score-label">${getScoreLabel(q.score, q.total)}</div>
      </div>
    </div>
  `).join('');
}

function getScoreLabel(score, total) {
  const pct = (score / total) * 100;
  if (pct >= 90) return '🌟 Excellent';
  if (pct >= 70) return '👍 Good';
  if (pct >= 50) return '📚 Keep Practising';
  return '💪 Try Again';
}

/* ══════════════════════════════════════════════════════
   QUIZ PORTAL
══════════════════════════════════════════════════════ */
let activeQuizId    = null;
let quizQuestions   = [];
let currentQuestion = 0;
let quizAnswers     = [];

function openQuiz(id) {
  const quiz = pendingQuizzes.find(q => q.id === id);
  if (!quiz) return;
  activeQuizId    = id;
  quizQuestions   = QUIZ_QUESTIONS[id] || [];
  currentQuestion = 0;
  quizAnswers     = new Array(quizQuestions.length).fill(null);

  document.getElementById('quizModalTitle').textContent = `🧠 ${quiz.title}`;
  document.getElementById('quizModalOverlay').classList.add('open');
  renderQuestion();
}

function closeQuizModal() {
  document.getElementById('quizModalOverlay').classList.remove('open');
  activeQuizId = null;
}

function renderQuestion() {
  const total = quizQuestions.length;
  const q     = quizQuestions[currentQuestion];

  // Progress bar
  document.getElementById('quizProgressText').textContent = `Q ${currentQuestion + 1} / ${total}`;
  const pct = ((currentQuestion + 1) / total) * 100;
  document.getElementById('quizProgressFill').style.width = pct + '%';

  const portal = document.getElementById('quizPortal');
  portal.innerHTML = `
    <div class="quiz-question-num">Question ${currentQuestion + 1} of ${total}</div>
    <div class="quiz-question-text">${q.q}</div>
    <div class="quiz-options">
      ${q.opts.map((opt, i) => `
        <button class="quiz-opt${quizAnswers[currentQuestion] === i ? ' selected' : ''}"
                onclick="selectAnswer(${i})">
          <span class="quiz-opt-letter">${String.fromCharCode(65 + i)}</span>
          ${opt}
        </button>
      `).join('')}
    </div>
    <div class="quiz-nav">
      <button class="btn btn-outline" onclick="quizNav(-1)" ${currentQuestion === 0 ? 'disabled' : ''}>← Back</button>
      ${currentQuestion < total - 1
        ? `<button class="btn btn-blue" onclick="quizNav(1)">Next →</button>`
        : `<button class="btn btn-primary" onclick="submitQuiz()">Submit Quiz ✦</button>`}
    </div>`;
}

function selectAnswer(optIdx) {
  quizAnswers[currentQuestion] = optIdx;
  renderQuestion();
}

function quizNav(dir) {
  currentQuestion += dir;
  renderQuestion();
}

function submitQuiz() {
  const unanswered = quizAnswers.filter(a => a === null).length;
  if (unanswered > 0) {
    showToast(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Please answer all questions.`, 'error');
    return;
  }

  // Score
  let score = 0;
  quizQuestions.forEach((q, i) => { if (quizAnswers[i] === q.ans) score++; });

  const quiz = pendingQuizzes.find(q => q.id === activeQuizId);

  // Show results screen
  const portal = document.getElementById('quizPortal');
  const pct    = Math.round((score / quizQuestions.length) * 100);
  portal.innerHTML = `
    <div class="quiz-results">
      <div class="quiz-result-emoji">${pct >= 70 ? '🌟' : pct >= 50 ? '👍' : '💪'}</div>
      <div class="quiz-result-title">${getScoreLabel(score, quizQuestions.length)}</div>
      <div class="quiz-result-score">${score} / ${quizQuestions.length}</div>
      <div class="quiz-result-pct">${pct}% correct</div>
      <div class="quiz-result-breakdown">
        ${quizQuestions.map((q, i) => `
          <div class="qrb-item ${quizAnswers[i] === q.ans ? 'qrb-correct' : 'qrb-wrong'}">
            <span>${quizAnswers[i] === q.ans ? '✅' : '❌'}</span>
            <span>${q.q}</span>
            ${quizAnswers[i] !== q.ans ? `<span class="qrb-correct-ans">Correct: ${q.opts[q.ans]}</span>` : ''}
          </div>
        `).join('')}
      </div>
      <button class="btn btn-green" style="margin-top:20px;width:100%;justify-content:center;" onclick="closeQuizModal()">Done ✓</button>
    </div>`;

  // Move quiz from pending to completed
  const idx = pendingQuizzes.findIndex(q => q.id === activeQuizId);
  if (idx !== -1) {
    const done = pendingQuizzes.splice(idx, 1)[0];
    completedQuizzes.push({ ...done, score, total: quizQuestions.length });
  }
  renderPendingQuizzes();
  renderCompletedQuizzes();
}

/* ══════════════════════════════════════════════════════
   CERTIFICATES TAB
══════════════════════════════════════════════════════ */
function renderCertificates() {
  const grid  = document.getElementById('certGrid');
  const empty = document.getElementById('certEmpty');
  const count = document.getElementById('certCount');
  if (!grid) return;

  if (CERTIFICATES.length === 0) {
    grid.style.display  = 'none';
    empty.style.display = 'block';
    return;
  }

  if (count) count.textContent = `${CERTIFICATES.length} earned`;
  grid.innerHTML = CERTIFICATES.map(c => `
    <div class="cert-card cert-${c.color}">
      <div class="cert-card-top">
        <div class="cert-seal">🏛️</div>
        <div class="cert-emoji">${c.emoji}</div>
      </div>
      <div class="cert-card-body">
        <div class="cert-label">Certificate of Completion</div>
        <div class="cert-course">${c.course}</div>
        <div class="cert-student">${STUDENT.name}</div>
        <div class="cert-meta">Instructor: ${c.instructor} &nbsp;·&nbsp; ${c.date}</div>
        <div class="cert-grade grade-${c.color}">${c.grade}</div>
      </div>
      <div class="cert-card-footer">
        <button class="btn btn-outline" style="font-size:13px;padding:8px 16px;" onclick="previewCert(${c.id})">👁 Preview</button>
        <button class="btn btn-primary" style="font-size:13px;padding:8px 16px;" onclick="downloadCertById(${c.id})">⬇ Download PDF</button>
      </div>
    </div>
  `).join('');
}

/* ── CERTIFICATE PREVIEW MODAL ── */
let activeCertId = null;

function previewCert(id) {
  activeCertId = id;
  const c = CERTIFICATES.find(x => x.id === id);
  if (!c) return;
  renderCertDoc(c);
  document.getElementById('certModalOverlay').classList.add('open');
}

function closeCertModal() {
  document.getElementById('certModalOverlay').classList.remove('open');
  activeCertId = null;
}

function renderCertDoc(c) {
  document.getElementById('certificateDoc').innerHTML = `
    <div class="cert-doc-inner">
      <div class="cert-doc-border">
        <div class="cert-doc-header">
          <div class="cert-doc-logo">
            <div class="logo-icon" style="width:52px;height:52px;font-size:24px;">S</div>
            <div>
              <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--blue);">StemNest<span style="color:var(--orange);">Academy</span></div>
              <div style="font-size:11px;color:var(--light);font-weight:700;letter-spacing:1px;text-transform:uppercase;">UK-Based · Globally Trusted</div>
            </div>
          </div>
          <div class="cert-doc-seal">🏛️</div>
        </div>
        <div class="cert-doc-body">
          <div class="cert-doc-label">Certificate of Completion</div>
          <div class="cert-doc-presented">This is to certify that</div>
          <div class="cert-doc-name">${STUDENT.name}</div>
          <div class="cert-doc-presented">has successfully completed the course</div>
          <div class="cert-doc-course">${c.course}</div>
          <div class="cert-doc-grade-row">
            <div class="cert-doc-grade">Grade: <strong>${c.grade}</strong></div>
            <div class="cert-doc-date">Date: ${c.date}</div>
          </div>
        </div>
        <div class="cert-doc-sigs">
          <div class="cert-doc-sig">
            <div class="cert-sig-line"></div>
            <div class="cert-sig-name">${c.instructor}</div>
            <div class="cert-sig-role">Course Instructor</div>
          </div>
          <div class="cert-doc-seal-center">🏛️<div style="font-size:10px;font-weight:800;color:var(--light);margin-top:4px;">OFFICIAL SEAL</div></div>
          <div class="cert-doc-sig">
            <div class="cert-sig-line"></div>
            <div class="cert-sig-name">Dr. A. Osei</div>
            <div class="cert-sig-role">Founder, StemNest Academy</div>
          </div>
        </div>
        <div class="cert-doc-footer">
          Student ID: ${STUDENT.id} &nbsp;·&nbsp; StemNest Academy Ltd · Registered in England & Wales
        </div>
      </div>
    </div>`;
}

function downloadCert() {
  if (activeCertId) downloadCertById(activeCertId);
}

function downloadCertById(id) {
  const c = CERTIFICATES.find(x => x.id === id);
  if (!c) return;

  // Render cert into the hidden doc element then print-to-PDF
  renderCertDoc(c);
  document.getElementById('certModalOverlay').classList.add('open');

  showToast('📄 Opening print dialog — choose "Save as PDF"', 'info');
  setTimeout(() => {
    const certEl = document.getElementById('certificateDoc');
    const printWin = window.open('', '_blank', 'width=900,height=650');
    printWin.document.write(`
      <!DOCTYPE html><html><head>
      <title>Certificate — ${c.course}</title>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{font-family:'Nunito',sans-serif;background:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
        ${getCertPrintStyles()}
      </style>
      </head><body>${certEl.innerHTML}</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 600);
  }, 400);
}

function getCertPrintStyles() {
  return `
    .cert-doc-inner{width:100%;max-width:800px;margin:0 auto;}
    .cert-doc-border{border:8px double #1a56db;border-radius:16px;padding:40px;background:#fff;position:relative;}
    .cert-doc-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #e8eaf0;}
    .cert-doc-logo{display:flex;align-items:center;gap:12px;}
    .logo-icon{width:52px;height:52px;background:linear-gradient(135deg,#1a56db,#0e9f6e);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Fredoka One',cursive;font-size:24px;}
    .cert-doc-seal{font-size:48px;}
    .cert-doc-body{text-align:center;padding:20px 0 32px;}
    .cert-doc-label{font-family:'Fredoka One',cursive;font-size:32px;color:#1a56db;margin-bottom:20px;letter-spacing:1px;}
    .cert-doc-presented{font-size:16px;color:#718096;margin-bottom:8px;}
    .cert-doc-name{font-family:'Fredoka One',cursive;font-size:42px;color:#1a202c;margin:12px 0;border-bottom:2px solid #1a56db;display:inline-block;padding-bottom:4px;}
    .cert-doc-course{font-family:'Fredoka One',cursive;font-size:26px;color:#ff6b35;margin:16px 0;}
    .cert-doc-grade-row{display:flex;justify-content:center;gap:40px;margin-top:16px;font-size:15px;font-weight:700;color:#4a5568;}
    .cert-doc-sigs{display:flex;align-items:flex-end;justify-content:space-between;padding-top:32px;border-top:1px solid #e8eaf0;margin-top:8px;}
    .cert-doc-sig{text-align:center;flex:1;}
    .cert-sig-line{width:160px;height:2px;background:#1a202c;margin:0 auto 8px;}
    .cert-sig-name{font-weight:800;font-size:14px;color:#1a202c;}
    .cert-sig-role{font-size:12px;color:#718096;margin-top:2px;}
    .cert-doc-seal-center{text-align:center;font-size:40px;flex-shrink:0;padding:0 20px;}
    .cert-doc-footer{text-align:center;font-size:11px;color:#a0aec0;margin-top:24px;padding-top:16px;border-top:1px solid #e8eaf0;}
  `;
}

/* ══════════════════════════════════════════════════════
   PROFILE MODAL
══════════════════════════════════════════════════════ */
function openProfileModal() {
  document.getElementById('profileModalOverlay').classList.add('open');
}
function closeProfileModal() {
  document.getElementById('profileModalOverlay').classList.remove('open');
}
function saveProfile() {
  closeProfileModal();
  showToast('✅ Profile updated successfully!');
}

/* ── Extend tab switching for new tabs ── */
const _origShowTab = showTab;
showTab = function(tab) {
  const extraTabs = ['nest','chat'];
  extraTabs.forEach(t => { const el = document.getElementById('tab-' + t); if (el) el.style.display = 'none'; });
  _origShowTab(tab);
  if (extraTabs.includes(tab)) {
    ALL_TABS.forEach(t => { const el = document.getElementById('tab-' + t); if (el) el.style.display = 'none'; });
    const el = document.getElementById('tab-' + tab);
    if (el) el.style.display = 'block';
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
    if (tab === 'nest') renderLearningNest();
    if (tab === 'chat') { initChat(); loadChatMessages(); }
  }
};
