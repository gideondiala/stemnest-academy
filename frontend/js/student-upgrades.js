/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — STUDENT DASHBOARD UPGRADES (Phase 4)
   Learning Nest, Chat, Multi-course, Payment Link,
   Certificate signatures, Late project alerts.
   Loaded after student-dashboard.js.
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   MULTI-COURSE PORTAL SELECTOR
   If student has 2+ courses, show portal selector first.
══════════════════════════════════════════════════════ */
function checkMultiCoursePortal() {
  const booking = getStudentBooking();
  if (!booking) return;
  const subjects = [...new Set((booking.enrolledSubjects || [STUDENT.subject || 'Coding']))];
  if (subjects.length < 2) return;

  // Show portal selector overlay
  const overlay = document.createElement('div');
  overlay.id = 'portalSelectorOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#0a1628,#1a3a6b);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:28px;padding:48px 40px;max-width:520px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.3);">
      <div style="font-size:48px;margin-bottom:16px;">🎓</div>
      <div style="font-family:'Fredoka One',cursive;font-size:28px;color:var(--dark);margin-bottom:8px;">Welcome back, ${STUDENT.name.split(' ')[0]}!</div>
      <div style="font-size:15px;color:var(--mid);margin-bottom:32px;">You are enrolled in multiple courses. Which portal would you like to open?</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${subjects.map(s => `
          <button onclick="openPortal('${s}')" style="padding:16px 24px;border-radius:14px;border:2px solid #e8eaf0;background:var(--bg);font-family:'Nunito',sans-serif;font-weight:800;font-size:16px;color:var(--dark);cursor:pointer;transition:.2s;display:flex;align-items:center;gap:12px;">
            <span style="font-size:24px;">${s === 'Coding' ? '💻' : s === 'Maths' ? '📐' : '🔬'}</span>
            Go to ${s} Portal →
          </button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function openPortal(subject) {
  document.getElementById('portalSelectorOverlay')?.remove();
  // Add switch portal button to sidebar
  addSwitchPortalButton(subject);
  // Filter lessons/courses to this subject
  window.ACTIVE_PORTAL = subject;
}

function addSwitchPortalButton(currentSubject) {
  const sidebar = document.querySelector('.sidebar-nav');
  if (!sidebar || document.getElementById('switchPortalBtn')) return;
  const btn = document.createElement('div');
  btn.id = 'switchPortalBtn';
  btn.style.cssText = 'margin:8px 12px;padding:10px 14px;background:var(--orange-light);border-radius:12px;cursor:pointer;font-size:13px;font-weight:800;color:var(--orange-dark);text-align:center;';
  btn.textContent = '🔄 Switch Portal';
  btn.onclick = () => { window.ACTIVE_PORTAL = null; checkMultiCoursePortal(); };
  sidebar.appendChild(btn);
}

function getStudentBooking() {
  try {
    const bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    return bookings.find(b => b.email === STUDENT.email) || null;
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════
   LEARNING NEST — Past classes with summaries
══════════════════════════════════════════════════════ */
function renderLearningNest() {
  const el = document.getElementById('learningNestContent');
  if (!el) return;

  const pastClasses = JSON.parse(localStorage.getItem('sn_past_classes_' + STUDENT.id) || '[]');

  if (!pastClasses.length) {
    el.innerHTML = `
      <div style="text-align:center;padding:48px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">🪺</div>
        <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--dark);margin-bottom:8px;">Your Learning Nest is empty</div>
        <div style="font-size:14px;color:var(--light);">Past class summaries, exercises, and recordings will appear here after each session.</div>
      </div>`;
    return;
  }

  // Group by course (module)
  const grouped = {};
  pastClasses.forEach(c => {
    const key = c.course || 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  el.innerHTML = Object.entries(grouped).map(([course, classes]) => `
    <div class="nest-module">
      <div class="nest-module-title">📚 ${course}</div>
      ${classes.map(c => `
        <div class="nest-class-card" onclick="openNestClass('${c.id}')">
          <div class="nest-class-icon">${c.subject === 'Coding' ? '💻' : c.subject === 'Maths' ? '📐' : '🔬'}</div>
          <div class="nest-class-info">
            <div class="nest-class-title">${c.topic || c.title}</div>
            <div class="nest-class-meta">📅 ${c.date} · 👩‍🏫 ${c.tutor} · ⏱ ${c.duration || '60 mins'}</div>
          </div>
          <div class="nest-class-arrow">›</div>
        </div>`).join('')}
    </div>`).join('');
}

function openNestClass(classId) {
  const pastClasses = JSON.parse(localStorage.getItem('sn_past_classes_' + STUDENT.id) || '[]');
  const c = pastClasses.find(x => x.id === classId);
  if (!c) return;

  const modal = document.getElementById('nestClassModal');
  const body  = document.getElementById('nestClassBody');
  if (!modal || !body) return;

  body.innerHTML = `
    <div style="background:var(--bg);border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">${c.topic || c.title}</div>
      <div style="font-size:13px;color:var(--light);font-weight:700;margin-top:4px;">📅 ${c.date} · 👩‍🏫 ${c.tutor} · 📚 ${c.course}</div>
    </div>
    ${c.summary ? `<div style="margin-bottom:20px;"><div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:8px;">📝 Class Summary</div><div style="font-size:14px;color:var(--mid);line-height:1.8;">${c.summary}</div></div>` : ''}
    ${c.exercises?.length ? `<div style="margin-bottom:20px;"><div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:8px;">✏️ Exercises</div><ul style="padding-left:20px;">${c.exercises.map(e => `<li style="font-size:14px;color:var(--mid);margin-bottom:6px;">${e}</li>`).join('')}</ul></div>` : ''}
    ${c.submittedLinks?.length ? `<div style="margin-bottom:20px;"><div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:8px;">🔗 Your Submissions</div>${c.submittedLinks.map(l => `<a href="${l}" target="_blank" style="display:block;color:var(--blue);font-weight:700;font-size:13px;margin-bottom:4px;">${l}</a>`).join('')}</div>` : ''}
    ${c.recordingUrl ? `<div><div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:8px;">🎥 Class Recording</div><a href="${c.recordingUrl}" target="_blank" class="btn btn-blue" style="font-size:13px;">▶ Watch Recording</a></div>` : ''}`;

  modal.classList.add('open');
}

/* ══════════════════════════════════════════════════════
   CHAT WITH TEACHER
══════════════════════════════════════════════════════ */
function initChat() {
  const chatEl = document.getElementById('chatMessages');
  if (!chatEl) return;
  loadChatMessages();
}

function loadChatMessages() {
  const chatEl = document.getElementById('chatMessages');
  if (!chatEl) return;
  const messages = JSON.parse(localStorage.getItem('sn_chat_' + STUDENT.id) || '[]');
  if (!messages.length) {
    chatEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-size:13px;font-weight:700;">No messages yet. Send your first message to your tutor!</div>';
    return;
  }
  chatEl.innerHTML = messages.map(m => `
    <div class="chat-msg ${m.from === 'student' ? 'chat-msg-student' : 'chat-msg-tutor'}">
      <div class="chat-msg-bubble">
        ${m.type === 'image' ? `<img src="${m.content}" style="max-width:200px;border-radius:8px;" alt="Image">` :
          m.type === 'file'  ? `<a href="${m.content}" target="_blank" style="color:inherit;font-weight:800;">📎 ${m.fileName}</a>` :
          m.content}
      </div>
      <div class="chat-msg-meta">${m.from === 'student' ? STUDENT.name + ' · ' + STUDENT.id : 'Tutor'} · ${new Date(m.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
    </div>`).join('');
  chatEl.scrollTop = chatEl.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text  = input?.value.trim();
  if (!text) return;
  const messages = JSON.parse(localStorage.getItem('sn_chat_' + STUDENT.id) || '[]');
  messages.push({ from:'student', type:'text', content:text, timestamp:new Date().toISOString() });
  localStorage.setItem('sn_chat_' + STUDENT.id, JSON.stringify(messages));
  input.value = '';
  loadChatMessages();
}

function handleChatFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('File must be under 5MB.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const messages = JSON.parse(localStorage.getItem('sn_chat_' + STUDENT.id) || '[]');
    const isImage  = file.type.startsWith('image/');
    messages.push({ from:'student', type: isImage ? 'image' : 'file', content: ev.target.result, fileName: file.name, timestamp: new Date().toISOString() });
    localStorage.setItem('sn_chat_' + STUDENT.id, JSON.stringify(messages));
    loadChatMessages();
    showToast(`✅ ${isImage ? 'Image' : 'File'} sent!`);
  };
  reader.readAsDataURL(file);
  input.value = '';
}

/* ══════════════════════════════════════════════════════
   PAYMENT LINK — appears when credits ≤ 3
══════════════════════════════════════════════════════ */
function checkPaymentLink() {
  const booking = getStudentBooking();
  const credits = booking?.studentCredits ?? 10;
  const el = document.getElementById('paymentLinkSection');
  if (!el) return;

  if (credits <= 3) {
    const links = JSON.parse(localStorage.getItem('sn_payment_links') || '[]');
    const myLink = links.find(l => l.email === STUDENT.email && l.status === 'pending');
    el.style.display = 'block';
    el.innerHTML = `
      <div class="payment-link-banner">
        <div class="plb-icon">💳</div>
        <div class="plb-body">
          <div class="plb-title">You have ${credits} class credit${credits !== 1 ? 's' : ''} remaining</div>
          <div class="plb-sub">Renew now to keep your learning momentum going!</div>
          ${myLink ? `<a href="${myLink.url || '#'}" target="_blank" class="btn btn-primary" style="margin-top:12px;font-size:14px;">💳 Pay Now — ${myLink.course} (${myLink.currency} ${myLink.amount})</a>` : '<div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:8px;">Your payment link will appear here once generated by our team.</div>'}
        </div>
      </div>`;
  } else {
    el.style.display = 'none';
  }
}

/* ══════════════════════════════════════════════════════
   LATE PROJECT NOTIFICATIONS
══════════════════════════════════════════════════════ */
function checkLateProjects() {
  const today = new Date();
  let hasLate = false;
  pendingProjects.forEach(p => {
    if (!p.due) return;
    const due = new Date(p.due.split(' ').reverse().join('-'));
    if (today > due) {
      hasLate = true;
      // Add late badge to project card
      const cards = document.querySelectorAll('.student-proj-card');
      cards.forEach(card => {
        if (card.querySelector('.spc-title')?.textContent === p.title) {
          if (!card.querySelector('.late-badge')) {
            const badge = document.createElement('span');
            badge.className = 'late-badge';
            badge.textContent = '⚠️ Late';
            badge.style.cssText = 'font-size:10px;font-weight:900;background:#fde8e8;color:#c53030;padding:2px 8px;border-radius:50px;margin-left:8px;';
            card.querySelector('.spc-meta')?.appendChild(badge);
          }
        }
      });
    }
  });
  if (hasLate) showToast('⚠️ You have overdue projects! Please submit them as soon as possible.', 'error');
}

/* ══════════════════════════════════════════════════════
   CERTIFICATE UPGRADES — append signatures & seal
══════════════════════════════════════════════════════ */
function getSignatures() {
  const settings = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
  return { seal: settings.seal || null, founderSig: settings.signature || null };
}

function getTeacherSignature(instructorName) {
  const teachers = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
  const teacher  = teachers.find(t => t.name === instructorName);
  return teacher?.signature || null;
}

// Override renderCertDoc to include real signatures
const _origRenderCertDoc = window.renderCertDoc;
window.renderCertDoc = function(c) {
  _origRenderCertDoc(c);
  const { seal, founderSig } = getSignatures();
  const teacherSig = getTeacherSignature(c.instructor);

  // Replace placeholder seal
  const certDoc = document.getElementById('certificateDoc');
  if (!certDoc) return;

  if (seal) {
    certDoc.querySelectorAll('.cert-doc-seal, .cert-doc-seal-center').forEach(el => {
      el.innerHTML = `<img src="${seal}" style="max-height:60px;max-width:80px;object-fit:contain;" alt="Seal">`;
    });
  }
  if (founderSig) {
    const founderSigLine = certDoc.querySelectorAll('.cert-doc-sig')[1];
    if (founderSigLine) {
      const line = founderSigLine.querySelector('.cert-sig-line');
      if (line) line.innerHTML = `<img src="${founderSig}" style="max-height:40px;max-width:120px;object-fit:contain;" alt="Signature">`;
    }
  }
  if (teacherSig) {
    const teacherSigLine = certDoc.querySelectorAll('.cert-doc-sig')[0];
    if (teacherSigLine) {
      const line = teacherSigLine.querySelector('.cert-sig-line');
      if (line) line.innerHTML = `<img src="${teacherSig}" style="max-height:40px;max-width:120px;object-fit:contain;" alt="Signature">`;
    }
  }
};

/* ══════════════════════════════════════════════════════
   BIRTHDAY CHECK
══════════════════════════════════════════════════════ */
function checkBirthday() {
  const dob = localStorage.getItem('sn_dob_' + STUDENT.id);
  if (!dob) return;
  const today = new Date();
  const birth = new Date(dob);
  if (today.getDate() === birth.getDate() && today.getMonth() === birth.getMonth()) {
    const settings = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
    const msg = (settings.birthdayMsg || 'Happy Birthday {name}! 🎉 Wishing you a wonderful day from all of us at StemNest Academy!').replace('{name}', STUDENT.name.split(' ')[0]);
    setTimeout(() => {
      const popup = document.createElement('div');
      popup.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
      popup.innerHTML = `<div style="background:var(--white);border-radius:28px;padding:48px 40px;max-width:440px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.3);">
        <div style="font-size:72px;margin-bottom:16px;">🎂</div>
        <div style="font-family:'Fredoka One',cursive;font-size:28px;color:var(--dark);margin-bottom:12px;">Happy Birthday!</div>
        <div style="font-size:16px;color:var(--mid);line-height:1.7;margin-bottom:24px;">${msg}</div>
        <button onclick="this.closest('div[style]').remove()" class="btn btn-primary" style="font-size:16px;padding:12px 32px;">Thank you! 🎉</button>
      </div>`;
      document.body.appendChild(popup);
    }, 1500);
  }
}

/* ══════════════════════════════════════════════════════
   INIT — runs after student-dashboard.js
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  checkMultiCoursePortal();
  checkPaymentLink();
  checkBirthday();
  setTimeout(checkLateProjects, 500);
  initChat();
});

/* ══════════════════════════════════════════════════════
   PHASE 5 — DEMO STUDENT: COUNTDOWN + WAITING QUIZ + AUTO-JOIN
   + POST-DEMO FEE DISPLAY
══════════════════════════════════════════════════════ */

/* Fun quiz questions shown while waiting for class */
const WAITING_QUIZZES = [
  { q: 'What does HTML stand for?', opts: ['Hyper Text Markup Language','High Tech Modern Language','Hyper Transfer Markup Logic','Home Tool Markup Language'], ans: 0 },
  { q: 'Which planet is closest to the Sun?', opts: ['Venus','Earth','Mercury','Mars'], ans: 2 },
  { q: 'What is 7 × 8?', opts: ['54','56','58','64'], ans: 1 },
  { q: 'What does CPU stand for?', opts: ['Central Processing Unit','Computer Power Unit','Core Processing Utility','Central Program Unit'], ans: 0 },
  { q: 'Which of these is NOT a programming language?', opts: ['Python','Java','Photoshop','JavaScript'], ans: 2 },
  { q: 'How many sides does a hexagon have?', opts: ['5','6','7','8'], ans: 1 },
  { q: 'What symbol is used for "not equal to" in most programming languages?', opts: ['<>','!=','=/=','~='], ans: 1 },
  { q: 'What is the square root of 81?', opts: ['7','8','9','10'], ans: 2 },
  { q: 'Which gas do plants absorb from the air?', opts: ['Oxygen','Nitrogen','Carbon Dioxide','Hydrogen'], ans: 2 },
  { q: 'What does "www" stand for in a website address?', opts: ['World Wide Web','Wide World Web','Web World Wide','World Web Wide'], ans: 0 },
];

let countdownInterval = null;
let waitingQuizIdx    = 0;
let waitingQuizScore  = 0;
let waitingQuizAnswered = false;

function initDemoFeatures() {
  const booking = getStudentBooking();
  if (!booking) return;

  // Check if this is a demo student (status = 'scheduled' or 'demo')
  const isDemo = booking.status === 'scheduled' || booking.status === 'demo' || booking.isDemoStudent;

  // Check if demo is already completed
  const isPostDemo = booking.status === 'completed' || booking.demoCompleted;

  if (isPostDemo) {
    renderPostDemoFee(booking);
    return;
  }

  if (isDemo && booking.date && booking.time) {
    renderDemoCountdown(booking);
  }
}

function renderDemoCountdown(booking) {
  const section = document.getElementById('demoCountdownSection');
  if (!section) return;

  // Parse class datetime
  const classDateTime = parseClassDateTime(booking.date, booking.time);
  if (!classDateTime) return;

  const now = new Date();
  const diff = classDateTime - now;

  // Hide the regular join class card for demo students
  const joinCard = document.getElementById('joinClassCard');
  if (joinCard) joinCard.style.display = 'none';

  section.style.display = 'block';
  section.innerHTML = buildCountdownCard(booking, classDateTime);

  // Start countdown
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const remaining = classDateTime - new Date();
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      // Auto-join!
      autoJoinClass(booking);
      return;
    }
    updateCountdownDisplay(remaining);

    // Show waiting quiz if student is within 30 mins of class
    if (remaining <= 30 * 60 * 1000) {
      showWaitingQuiz();
    }
  }, 1000);

  // Initial update
  if (diff > 0) {
    updateCountdownDisplay(diff);
    if (diff <= 30 * 60 * 1000) showWaitingQuiz();
  } else {
    autoJoinClass(booking);
  }
}

function buildCountdownCard(booking, classDateTime) {
  const subjectEmoji = booking.subject === 'Coding' ? '💻' : booking.subject === 'Maths' ? '📐' : '🔬';
  return `
    <div style="background:linear-gradient(135deg,#1a56db,#2563eb);border-radius:24px;padding:32px;color:#fff;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;background:rgba(255,255,255,.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-60px;left:-30px;width:160px;height:160px;background:rgba(255,255,255,.04);border-radius:50%;"></div>
      <div style="position:relative;z-index:1;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="background:rgba(255,255,255,.2);padding:4px 14px;border-radius:50px;font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">🎓 Demo Class</span>
        </div>
        <div style="font-family:'Fredoka One',cursive;font-size:26px;margin-bottom:6px;">${subjectEmoji} ${booking.subject || 'Your'} Demo Class</div>
        <div style="font-size:14px;color:rgba(255,255,255,.8);margin-bottom:24px;">
          📅 ${booking.date || '—'} &nbsp;·&nbsp; 🕐 ${booking.time || '—'}
          ${booking.assignedTutor ? ` &nbsp;·&nbsp; 👩‍🏫 ${booking.assignedTutor}` : ''}
        </div>
        <div style="font-family:'Fredoka One',cursive;font-size:15px;color:rgba(255,255,255,.7);margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;">Class starts in</div>
        <div style="display:flex;gap:16px;justify-content:center;margin-bottom:24px;" id="countdownBlocks">
          <div class="cd-block"><div class="cd-num" id="cdDays">--</div><div class="cd-label">Days</div></div>
          <div class="cd-sep">:</div>
          <div class="cd-block"><div class="cd-num" id="cdHours">--</div><div class="cd-label">Hours</div></div>
          <div class="cd-sep">:</div>
          <div class="cd-block"><div class="cd-num" id="cdMins">--</div><div class="cd-label">Mins</div></div>
          <div class="cd-sep">:</div>
          <div class="cd-block"><div class="cd-num" id="cdSecs">--</div><div class="cd-label">Secs</div></div>
        </div>
        <div id="joinNowBtnWrap" style="display:none;text-align:center;">
          <button onclick="autoJoinClass()" style="background:#fff;color:var(--blue);border:none;padding:14px 36px;border-radius:50px;font-family:'Nunito',sans-serif;font-weight:900;font-size:16px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2);">
            🚀 Join Class Now
          </button>
        </div>
      </div>
    </div>`;
}

function updateCountdownDisplay(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const days  = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;

  const pad = n => String(n).padStart(2, '0');
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = pad(val); };
  set('cdDays',  days);
  set('cdHours', hours);
  set('cdMins',  mins);
  set('cdSecs',  secs);

  // Show join button when within 5 mins
  if (ms <= 5 * 60 * 1000) {
    const btn = document.getElementById('joinNowBtnWrap');
    if (btn) btn.style.display = 'block';
  }
}

function autoJoinClass(booking) {
  if (!booking) booking = getStudentBooking();
  clearInterval(countdownInterval);

  // Update countdown display to zeros
  ['cdDays','cdHours','cdMins','cdSecs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '00';
  });

  showToast('🚀 Class time! Joining your demo class now...', 'info');

  const link = booking?.classLink || 'https://meet.google.com';
  setTimeout(() => window.open(link, '_blank'), 1000);
}

function showWaitingQuiz() {
  const section = document.getElementById('waitingQuizSection');
  if (!section || section.style.display === 'block') return;
  section.style.display = 'block';
  waitingQuizIdx = 0;
  waitingQuizScore = 0;
  renderWaitingQuestion();
}

function renderWaitingQuestion() {
  const section = document.getElementById('waitingQuizSection');
  if (!section) return;

  if (waitingQuizIdx >= WAITING_QUIZZES.length) {
    section.innerHTML = `
      <div style="background:linear-gradient(135deg,#0e9f6e,#10b981);border-radius:20px;padding:28px;color:#fff;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">🎉</div>
        <div style="font-family:'Fredoka One',cursive;font-size:22px;margin-bottom:8px;">Quiz Complete!</div>
        <div style="font-size:15px;color:rgba(255,255,255,.85);">You scored <strong>${waitingQuizScore} / ${WAITING_QUIZZES.length}</strong> — great warm-up before class!</div>
        <button onclick="restartWaitingQuiz()" style="margin-top:16px;background:rgba(255,255,255,.2);border:2px solid rgba(255,255,255,.4);color:#fff;padding:10px 24px;border-radius:50px;font-family:'Nunito',sans-serif;font-weight:800;font-size:14px;cursor:pointer;">Play Again 🔄</button>
      </div>`;
    return;
  }

  const q = WAITING_QUIZZES[waitingQuizIdx];
  section.innerHTML = `
    <div style="background:var(--white);border:2px solid #e8eaf0;border-radius:20px;padding:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <span style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:var(--blue);background:var(--blue-light);padding:4px 12px;border-radius:50px;">🧠 Fun Quiz While You Wait</span>
        <span style="font-size:13px;font-weight:800;color:var(--light);">Q ${waitingQuizIdx + 1} / ${WAITING_QUIZZES.length}</span>
      </div>
      <div style="font-family:'Fredoka One',cursive;font-size:18px;color:var(--dark);margin-bottom:16px;">${q.q}</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${q.opts.map((opt, i) => `
          <button onclick="answerWaitingQuiz(${i})" style="padding:12px 16px;border-radius:12px;border:2px solid #e8eaf0;background:var(--bg);font-family:'Nunito',sans-serif;font-weight:700;font-size:14px;color:var(--dark);cursor:pointer;text-align:left;transition:.2s;" onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='#e8eaf0'">
            <span style="font-weight:900;color:var(--blue);margin-right:8px;">${String.fromCharCode(65+i)}.</span>${opt}
          </button>`).join('')}
      </div>
    </div>`;
}

function answerWaitingQuiz(idx) {
  const q = WAITING_QUIZZES[waitingQuizIdx];
  const isCorrect = idx === q.ans;
  if (isCorrect) waitingQuizScore++;

  const section = document.getElementById('waitingQuizSection');
  if (!section) return;

  // Show feedback briefly then next question
  const buttons = section.querySelectorAll('button[onclick^="answerWaitingQuiz"]');
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.ans) btn.style.cssText += ';background:#d1fae5;border-color:#0e9f6e;color:#065f46;';
    else if (i === idx && !isCorrect) btn.style.cssText += ';background:#fde8e8;border-color:#c53030;color:#c53030;';
  });

  const feedback = document.createElement('div');
  feedback.style.cssText = 'margin-top:12px;padding:10px 16px;border-radius:10px;font-weight:800;font-size:14px;text-align:center;';
  feedback.style.background = isCorrect ? '#d1fae5' : '#fde8e8';
  feedback.style.color = isCorrect ? '#065f46' : '#c53030';
  feedback.textContent = isCorrect ? '✅ Correct! Well done!' : `❌ Not quite — the answer is: ${q.opts[q.ans]}`;
  section.querySelector('div').appendChild(feedback);

  setTimeout(() => {
    waitingQuizIdx++;
    renderWaitingQuestion();
  }, 1800);
}

function restartWaitingQuiz() {
  waitingQuizIdx = 0;
  waitingQuizScore = 0;
  renderWaitingQuestion();
}

function renderPostDemoFee(booking) {
  const section = document.getElementById('postDemoFeeSection');
  if (!section) return;

  const fee     = booking.agreedFee || booking.paymentAmount || null;
  const course  = booking.subject || 'your course';
  const payLink = booking.paymentLink || null;

  section.style.display = 'block';
  section.innerHTML = `
    <div style="background:linear-gradient(135deg,#ff6b35,#fbbf24);border-radius:24px;padding:32px;color:#fff;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:160px;height:160px;background:rgba(255,255,255,.08);border-radius:50%;"></div>
      <div style="position:relative;z-index:1;">
        <div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,.2);display:inline-block;padding:4px 14px;border-radius:50px;margin-bottom:12px;">🎉 Demo Complete!</div>
        <div style="font-family:'Fredoka One',cursive;font-size:24px;margin-bottom:8px;">Ready to continue learning?</div>
        <div style="font-size:15px;color:rgba(255,255,255,.85);margin-bottom:20px;">
          Your tutor and academic counselor have agreed on the following package for you:
        </div>
        ${fee ? `
          <div style="background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.3);border-radius:16px;padding:20px;margin-bottom:20px;text-align:center;">
            <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.7);margin-bottom:6px;">Agreed Course Fee</div>
            <div style="font-family:'Fredoka One',cursive;font-size:36px;">${fee}</div>
            <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px;">${course} Programme</div>
          </div>` : `
          <div style="background:rgba(255,255,255,.15);border:2px dashed rgba(255,255,255,.4);border-radius:16px;padding:20px;margin-bottom:20px;text-align:center;">
            <div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.8);">Your personalised fee will appear here once confirmed by your academic counselor.</div>
          </div>`}
        ${payLink ? `
          <a href="${payLink}" target="_blank" style="display:block;background:#fff;color:var(--orange);text-align:center;padding:14px 24px;border-radius:50px;font-family:'Nunito',sans-serif;font-weight:900;font-size:16px;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.15);">
            💳 Pay Now & Enrol →
          </a>` : `
          <div style="background:rgba(255,255,255,.15);border-radius:12px;padding:14px;text-align:center;font-size:14px;font-weight:700;color:rgba(255,255,255,.8);">
            💬 Your payment link will appear here once generated by our team. We'll be in touch shortly!
          </div>`}
      </div>
    </div>`;
}

function parseClassDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  try {
    // Handle formats like "Mon 21 Apr 2026" and "11:00 AM"
    const cleanDate = dateStr.replace(/^[A-Za-z]+\s/, ''); // remove day name
    const dt = new Date(`${cleanDate} ${timeStr}`);
    if (!isNaN(dt)) return dt;
    // Try ISO format
    const iso = new Date(`${dateStr}T${timeStr.replace(' AM','').replace(' PM','')}`);
    return isNaN(iso) ? null : iso;
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════
   PHASE 6 — BIRTHDAY SYSTEM: DOB SAVE IN STUDENT PROFILE
══════════════════════════════════════════════════════ */

/* Override saveProfile to also save DOB */
const _origSaveProfile = window.saveProfile;
window.saveProfile = function() {
  if (typeof _origSaveProfile === 'function') _origSaveProfile();
  const dobEl = document.getElementById('pmDob');
  if (dobEl && dobEl.value) {
    localStorage.setItem('sn_dob_' + STUDENT.id, dobEl.value);
  }
};

/* Pre-fill DOB in profile modal */
const _origOpenProfileModal = window.openProfileModal;
window.openProfileModal = function() {
  if (typeof _origOpenProfileModal === 'function') _origOpenProfileModal();
  const dobEl = document.getElementById('pmDob');
  if (dobEl) {
    const saved = localStorage.getItem('sn_dob_' + STUDENT.id);
    if (saved) dobEl.value = saved;
  }
};

/* ══════════════════════════════════════════════════════
   UPDATED INIT — Phase 5 + 6
══════════════════════════════════════════════════════ */
// Extend the existing DOMContentLoaded to also run Phase 5
document.addEventListener('DOMContentLoaded', () => {
  initDemoFeatures();
});
