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
   CHAT WITH TEACHER — IMPROVED (Priority 8)
   - Read receipts (sent/read indicators)
   - Unread badge on sidebar icon
   - Better message styling with timestamps
   - Teacher name clearly shown on teacher messages
══════════════════════════════════════════════════════ */
function initChat() {
  const chatEl = document.getElementById('chatMessages');
  if (!chatEl) return;
  loadChatMessages();
  updateChatUnreadBadge();
}

function getChatMessages() {
  try { return JSON.parse(localStorage.getItem('sn_chat_' + STUDENT.id) || '[]'); } catch { return []; }
}
function saveChatMessages(msgs) { localStorage.setItem('sn_chat_' + STUDENT.id, JSON.stringify(msgs)); }

function updateChatUnreadBadge() {
  const msgs    = getChatMessages();
  const unread  = msgs.filter(m => m.from === 'tutor' && !m.readByStudent).length;
  // Update sidebar badge
  let badge = document.getElementById('chatUnreadBadge');
  if (!badge) {
    const chatLink = document.querySelector('.sidebar-link[data-tab="chat"]');
    if (chatLink) {
      badge = document.createElement('span');
      badge.id = 'chatUnreadBadge';
      badge.className = 'sl-badge';
      chatLink.appendChild(badge);
    }
  }
  if (badge) {
    badge.textContent = unread > 0 ? unread : '';
    badge.style.display = unread > 0 ? 'inline-flex' : 'none';
  }
}

function loadChatMessages() {
  const chatEl = document.getElementById('chatMessages');
  if (!chatEl) return;
  const messages = getChatMessages();

  // Mark all tutor messages as read when chat is opened
  let changed = false;
  messages.forEach(m => {
    if (m.from === 'tutor' && !m.readByStudent) { m.readByStudent = true; changed = true; }
  });
  if (changed) { saveChatMessages(messages); updateChatUnreadBadge(); }

  if (!messages.length) {
    chatEl.innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;margin-bottom:12px;">💬</div>
        <div style="font-family:'Fredoka One',cursive;font-size:18px;color:var(--dark);margin-bottom:6px;">No messages yet</div>
        <div style="font-size:13px;color:var(--light);font-weight:700;">Send your first message to your tutor below.</div>
      </div>`;
    return;
  }

  // Group messages by date
  const grouped = {};
  messages.forEach(m => {
    const day = new Date(m.timestamp).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(m);
  });

  chatEl.innerHTML = Object.entries(grouped).map(([day, msgs]) => `
    <div class="chat-date-divider"><span>${day}</span></div>
    ${msgs.map(m => buildChatMessage(m)).join('')}
  `).join('');

  chatEl.scrollTop = chatEl.scrollHeight;
}

function buildChatMessage(m) {
  const isStudent = m.from === 'student';
  const time      = new Date(m.timestamp).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  const senderName = isStudent ? STUDENT.name : (m.tutorName || 'Tutor');
  const senderId   = isStudent ? STUDENT.id : '';

  let content = '';
  if (m.type === 'image') {
    content = `<img src="${m.content}" style="max-width:220px;border-radius:10px;display:block;" alt="Image">`;
  } else if (m.type === 'file') {
    content = `<a href="${m.content}" target="_blank" style="color:inherit;font-weight:800;display:flex;align-items:center;gap:6px;">📎 ${m.fileName}</a>`;
  } else {
    content = m.content;
  }

  // Read receipt for student messages
  let receipt = '';
  if (isStudent) {
    receipt = m.readByTutor
      ? '<span style="color:#60a5fa;font-size:11px;font-weight:800;">✓✓ Read</span>'
      : '<span style="color:rgba(255,255,255,.5);font-size:11px;font-weight:800;">✓ Sent</span>';
  }

  return `
    <div class="chat-msg ${isStudent ? 'chat-msg-student' : 'chat-msg-tutor'}">
      ${!isStudent ? `<div class="chat-msg-sender">${senderName}</div>` : ''}
      <div class="chat-msg-bubble">${content}</div>
      <div class="chat-msg-meta">
        ${isStudent ? `<span>${STUDENT.name} · ${STUDENT.id}</span>` : `<span>${senderName}</span>`}
        <span>${time}</span>
        ${receipt}
      </div>
    </div>`;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text  = input?.value.trim();
  if (!text) return;
  const messages = getChatMessages();
  messages.push({
    from:      'student',
    type:      'text',
    content:   text,
    timestamp: new Date().toISOString(),
    readByTutor: false,
  });
  saveChatMessages(messages);
  input.value = '';
  loadChatMessages();
}

function handleChatFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('File must be under 5MB.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const messages = getChatMessages();
    const isImage  = file.type.startsWith('image/');
    messages.push({
      from:        'student',
      type:        isImage ? 'image' : 'file',
      content:     ev.target.result,
      fileName:    file.name,
      timestamp:   new Date().toISOString(),
      readByTutor: false,
    });
    saveChatMessages(messages);
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

/* ══════════════════════════════════════════════════════
   STUDENT CANCEL / RESCHEDULE CLASS
══════════════════════════════════════════════════════ */

/* Inject Cancel + Reschedule buttons into the demo countdown card */
function injectCancelRescheduleButtons() {
  const section = document.getElementById('demoCountdownSection');
  if (!section || section.style.display === 'none') return;

  // Don't add twice
  if (document.getElementById('cancelRescheduleBar')) return;

  const bar = document.createElement('div');
  bar.id = 'cancelRescheduleBar';
  bar.style.cssText = 'display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;';
  bar.innerHTML = `
    <button onclick="openCancelDialog()"
      style="flex:1;background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.3);color:#fff;padding:10px 16px;border-radius:12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;cursor:pointer;transition:.2s;"
      onmouseover="this.style.background='rgba(255,255,255,.25)'" onmouseout="this.style.background='rgba(255,255,255,.15)'">
      🚫 Cancel Class
    </button>
    <button onclick="openRescheduleDialog()"
      style="flex:1;background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.3);color:#fff;padding:10px 16px;border-radius:12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;cursor:pointer;transition:.2s;"
      onmouseover="this.style.background='rgba(255,255,255,.25)'" onmouseout="this.style.background='rgba(255,255,255,.15)'">
      🔄 Reschedule
    </button>`;

  const inner = section.querySelector('div');
  if (inner) inner.appendChild(bar);
}

/* ── CANCEL DIALOG (triple confirmation) ── */
let cancelStep = 0;

function openCancelDialog() {
  cancelStep = 1;
  showCancelStep();
}

function showCancelStep() {
  document.getElementById('cancelClassModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'cancelClassModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

  if (cancelStep === 1) {
    modal.innerHTML = `
      <div style="background:var(--white);border-radius:20px;padding:32px;max-width:400px;width:100%;text-align:center;box-shadow:0 16px 60px rgba(0,0,0,.25);">
        <div style="font-size:48px;margin-bottom:12px;">🚫</div>
        <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--dark);margin-bottom:8px;">Cancel your class?</div>
        <div style="font-size:14px;color:var(--mid);margin-bottom:24px;line-height:1.6;">Are you sure you want to cancel your demo class? Your teacher has prepared for this session.</div>
        <div style="display:flex;gap:12px;">
          <button onclick="document.getElementById('cancelClassModal').remove()" style="flex:1;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:14px;cursor:pointer;color:var(--mid);">Keep My Class</button>
          <button onclick="cancelStep=2;showCancelStep()" style="flex:1;background:#fde8e8;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:14px;cursor:pointer;color:#c53030;">Yes, Cancel</button>
        </div>
      </div>`;
  } else if (cancelStep === 2) {
    modal.innerHTML = `
      <div style="background:var(--white);border-radius:20px;padding:32px;max-width:400px;width:100%;text-align:center;box-shadow:0 16px 60px rgba(0,0,0,.25);">
        <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
        <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--dark);margin-bottom:8px;">Really sure?</div>
        <div style="font-size:14px;color:var(--mid);margin-bottom:24px;line-height:1.6;">This will cancel your class and notify our team. You can always rebook a new demo class.</div>
        <div style="display:flex;gap:12px;">
          <button onclick="document.getElementById('cancelClassModal').remove()" style="flex:1;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:14px;cursor:pointer;color:var(--mid);">Keep My Class</button>
          <button onclick="cancelStep=3;showCancelStep()" style="flex:1;background:#fde8e8;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:14px;cursor:pointer;color:#c53030;">Yes, I'm Sure</button>
        </div>
      </div>`;
  } else if (cancelStep === 3) {
    modal.innerHTML = `
      <div style="background:var(--white);border-radius:20px;padding:32px;max-width:400px;width:100%;box-shadow:0 16px 60px rgba(0,0,0,.25);">
        <div style="font-size:48px;margin-bottom:12px;text-align:center;">📝</div>
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);margin-bottom:8px;text-align:center;">Final Step</div>
        <div style="font-size:14px;color:var(--mid);margin-bottom:16px;line-height:1.6;">Please tell us why you're cancelling so we can improve:</div>
        <textarea id="cancelReasonInput" placeholder="e.g. I have a conflict, I need to reschedule, technical issues..."
          style="width:100%;padding:12px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;min-height:80px;outline:none;resize:vertical;margin-bottom:16px;"></textarea>
        <div style="display:flex;gap:12px;">
          <button onclick="document.getElementById('cancelClassModal').remove()" style="flex:1;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:14px;cursor:pointer;color:var(--mid);">Go Back</button>
          <button onclick="confirmCancelClass()" style="flex:1;background:#c53030;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:14px;cursor:pointer;color:#fff;">Confirm Cancel</button>
        </div>
      </div>`;
  }

  document.body.appendChild(modal);
}

function confirmCancelClass() {
  const reason = document.getElementById('cancelReasonInput')?.value.trim();
  if (!reason) { showToast('Please enter a reason for cancellation.', 'error'); return; }

  const booking = getStudentBooking();
  if (!booking) return;

  // Save to cancelled classes store
  const cancelled = JSON.parse(localStorage.getItem('sn_cancelled_classes') || '[]');
  cancelled.unshift({
    id:          'CAN-' + Date.now().toString(36).toUpperCase(),
    bookingId:   booking.id,
    studentName: STUDENT.name,
    email:       STUDENT.email || booking.email,
    whatsapp:    booking.whatsapp,
    subject:     booking.subject,
    date:        booking.date,
    time:        booking.time,
    reason,
    cancelledAt: new Date().toISOString(),
  });
  localStorage.setItem('sn_cancelled_classes', JSON.stringify(cancelled));

  // Update booking status
  const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  const idx = all.findIndex(b => b.id === booking.id);
  if (idx !== -1) { all[idx].status = 'cancelled'; all[idx].cancelReason = reason; localStorage.setItem('sn_bookings', JSON.stringify(all)); }

  document.getElementById('cancelClassModal')?.remove();

  // Hide countdown
  const section = document.getElementById('demoCountdownSection');
  if (section) section.innerHTML = `
    <div style="background:var(--bg);border:1.5px solid #e8eaf0;border-radius:20px;padding:28px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">✅</div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);margin-bottom:8px;">Class Cancelled</div>
      <div style="font-size:14px;color:var(--light);">Your cancellation has been received. Our team will be in touch to help you rebook.</div>
      <a href="free-trial.html" class="btn btn-primary" style="margin-top:16px;font-size:14px;">📅 Book a New Demo</a>
    </div>`;

  showToast('Class cancelled. Our team has been notified.', 'info');
}

/* ── RESCHEDULE DIALOG ── */
function openRescheduleDialog() {
  document.getElementById('rescheduleModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'rescheduleModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:20px;padding:32px;max-width:420px;width:100%;box-shadow:0 16px 60px rgba(0,0,0,.25);">
      <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--dark);margin-bottom:6px;">🔄 Reschedule Request</div>
      <div style="font-size:14px;color:var(--mid);margin-bottom:20px;line-height:1.6;">Tell us when you'd prefer to have your demo class and we'll do our best to accommodate.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
        <div>
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px;">Preferred Date</label>
          <input type="date" id="rescheduleDate" min="${new Date().toISOString().split('T')[0]}"
            style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
        </div>
        <div>
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px;">Preferred Time</label>
          <input type="time" id="rescheduleTime"
            style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
        </div>
      </div>
      <div style="display:flex;gap:12px;">
        <button onclick="document.getElementById('rescheduleModal').remove()" style="flex:1;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:14px;cursor:pointer;color:var(--mid);">Cancel</button>
        <button onclick="submitRescheduleRequest()" style="flex:2;background:var(--blue);border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:14px;cursor:pointer;color:#fff;">Send Request →</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
}

function submitRescheduleRequest() {
  const date = document.getElementById('rescheduleDate')?.value;
  const time = document.getElementById('rescheduleTime')?.value;
  if (!date || !time) { showToast('Please select both a date and time.', 'error'); return; }

  const booking = getStudentBooking();
  if (!booking) return;

  const requests = JSON.parse(localStorage.getItem('sn_reschedule_requests') || '[]');
  requests.unshift({
    id:            'RSC-' + Date.now().toString(36).toUpperCase(),
    bookingId:     booking.id,
    studentName:   STUDENT.name,
    email:         STUDENT.email || booking.email,
    whatsapp:      booking.whatsapp,
    subject:       booking.subject,
    originalDate:  booking.date,
    originalTime:  booking.time,
    preferredDate: date,
    preferredTime: time,
    status:        'pending',
    requestedAt:   new Date().toISOString(),
  });
  localStorage.setItem('sn_reschedule_requests', JSON.stringify(requests));

  document.getElementById('rescheduleModal')?.remove();
  showToast('✅ Reschedule request sent! Our team will confirm your new slot shortly.', 'success');
}

/* Extend initDemoFeatures to inject buttons after countdown renders */
const _origInitDemoFeatures = window.initDemoFeatures;
window.initDemoFeatures = function() {
  if (typeof _origInitDemoFeatures === 'function') _origInitDemoFeatures();
  setTimeout(injectCancelRescheduleButtons, 500);
};

/* ══════════════════════════════════════════════════════
   TASK2 — CREDIT SYSTEM + PAYMENT RECORDS
   1. Credits always visible in sidebar
   2. Credits reduce by 1 after each completed class
   3. Payment Records tab — read-only
   4. Credits ≤ -2 → hide Join Class button
══════════════════════════════════════════════════════ */

/* ── Get student credits from booking or students registry ── */
function getStudentCredits() {
  // Try sn_students registry first (onboarded students)
  try {
    const students = JSON.parse(localStorage.getItem('sn_students') || '[]');
    const me = students.find(s => s.email === STUDENT.email || s.id === STUDENT.id);
    if (me && me.credits !== undefined) return parseInt(me.credits) || 0;
  } catch(e) {}

  // Fall back to booking record
  const booking = getStudentBooking();
  if (booking && booking.studentCredits !== undefined) return parseInt(booking.studentCredits) || 0;

  return 0;
}

/* ── Save updated credits ── */
function setStudentCredits(newVal) {
  // Update sn_students
  try {
    const students = JSON.parse(localStorage.getItem('sn_students') || '[]');
    const idx = students.findIndex(s => s.email === STUDENT.email || s.id === STUDENT.id);
    if (idx !== -1) {
      students[idx].credits = newVal;
      localStorage.setItem('sn_students', JSON.stringify(students));
    }
  } catch(e) {}

  // Update booking record
  try {
    const bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    const idx = bookings.findIndex(b => b.email === STUDENT.email);
    if (idx !== -1) {
      bookings[idx].studentCredits = newVal;
      localStorage.setItem('sn_bookings', JSON.stringify(bookings));
    }
  } catch(e) {}
}

/* ── Update sidebar credits display ── */
function updateSidebarCredits() {
  const credits = getStudentCredits();
  const valEl   = document.getElementById('sidebarCreditsVal');
  const lblEl   = document.getElementById('sidebarCreditsLabel');
  const box     = document.getElementById('sidebarCreditsBox');

  if (valEl) valEl.textContent = credits;

  if (credits <= 0) {
    if (box) box.style.background = 'linear-gradient(135deg,#c53030,#e53e3e)';
    if (lblEl) lblEl.textContent = credits < 0 ? 'OVERDUE' : 'No credits left';
  } else if (credits <= 2) {
    if (box) box.style.background = 'linear-gradient(135deg,#e65100,#ff6b35)';
    if (lblEl) lblEl.textContent = 'Low — top up now';
  } else if (credits <= 3) {
    if (box) box.style.background = 'linear-gradient(135deg,#e65100,#ff6b35)';
    if (lblEl) lblEl.textContent = 'Low — renew soon';
  } else {
    if (box) box.style.background = 'linear-gradient(135deg,var(--blue),var(--green))';
    if (lblEl) lblEl.textContent = 'remaining';
  }

  // Show/hide Top Up button (visible when credits ≤ 2)
  renderTopUpButton(credits);

  // If credits ≤ -2, hide Join Class button
  enforceJoinClassBlock(credits);
}

/* ── Top Up Credits button ── */
function renderTopUpButton(credits) {
  // Remove existing button
  const existing = document.getElementById('topUpCreditsBtn');
  if (existing) existing.remove();

  if (credits > 2) return; // only show when ≤ 2

  // Find the payment link for this student from Post-Sales
  const links = JSON.parse(localStorage.getItem('sn_payment_links') || '[]');
  const myLink = links.find(l =>
    (l.email === STUDENT.email || l.student === STUDENT.name) &&
    l.status === 'pending' && l.url
  );

  const box = document.getElementById('sidebarCreditsBox');
  if (!box) return;

  const btn = document.createElement('a');
  btn.id = 'topUpCreditsBtn';
  btn.style.cssText = 'display:block;margin-top:10px;background:#fff;color:#e65100;text-align:center;' +
    'padding:9px 14px;border-radius:10px;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:13px;' +
    'text-decoration:none;transition:.2s;';
  btn.textContent = '💳 Top Up Credits';

  if (myLink && myLink.url) {
    btn.href   = myLink.url;
    btn.target = '_blank';
  } else {
    btn.href = '#';
    btn.onclick = function(e) {
      e.preventDefault();
      showToast('Your payment link is being prepared. Our team will notify you shortly.', 'info');
    };
    btn.style.opacity = '0.75';
    btn.textContent = '💳 Top Up (link pending)';
  }

  box.appendChild(btn);
}

/* ── Block Join Class if credits ≤ -2 ── */
function enforceJoinClassBlock(credits) {
  if (credits <= -2) {
    // Hide the join class card
    const joinCard = document.getElementById('joinClassCard');
    if (joinCard) joinCard.style.display = 'none';

    // Show a warning banner instead
    let banner = document.getElementById('creditBlockBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'creditBlockBanner';
      banner.style.cssText = 'background:linear-gradient(135deg,#c53030,#e53e3e);border-radius:20px;padding:24px 28px;margin-bottom:24px;color:#fff;';
      banner.innerHTML = '<div style="font-family:\'Fredoka One\',cursive;font-size:20px;margin-bottom:8px;">⚠️ Classes Paused</div>' +
        '<div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.85);line-height:1.7;">' +
        'Your class credits have run out. You have <strong>' + credits + ' credits</strong> (2 classes attended without payment).<br>' +
        'Please contact our team to renew your subscription and resume classes.' +
        '</div>' +
        '<a href="../pages/free-trial.html" style="display:inline-block;margin-top:14px;background:#fff;color:#c53030;padding:10px 24px;border-radius:50px;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:14px;text-decoration:none;">💳 Renew Now</a>';
      const overview = document.getElementById('tab-overview');
      if (overview) overview.insertBefore(banner, overview.firstChild);
    }
  } else {
    const banner = document.getElementById('creditBlockBanner');
    if (banner) banner.remove();
  }
}

/* ── Deduct 1 credit after a completed class ── */
function deductStudentCreditAfterClass() {
  const current = getStudentCredits();
  const newVal  = current - 1;
  setStudentCredits(newVal);

  // Log the deduction to payment records
  logCreditTransaction({
    type:        'class_deduction',
    description: 'Class completed — 1 credit used',
    credits:     -1,
    date:        new Date().toISOString(),
  });

  updateSidebarCredits();
  return newVal;
}

/* ── Log a credit transaction (tamper-resistant: append-only) ── */
function logCreditTransaction(entry) {
  // Use a hash-like key to make it harder to manipulate
  const key = 'sn_credit_log_' + STUDENT.id;
  const log = JSON.parse(localStorage.getItem(key) || '[]');
  log.push({
    ...entry,
    id:        'TXN-' + Date.now().toString(36).toUpperCase(),
    loggedAt:  new Date().toISOString(),
    _readonly: true,
  });
  localStorage.setItem(key, JSON.stringify(log));
}

/* ── Render Payment Records tab ── */
function renderPaymentRecords() {
  const el = document.getElementById('paymentRecordsContent');
  if (!el) return;

  const credits = getStudentCredits();

  // Get payment records from sn_payment_links (added by Post-Sales)
  const allLinks = JSON.parse(localStorage.getItem('sn_payment_links') || '[]');
  const myPayments = allLinks.filter(p => p.email === STUDENT.email || p.student === STUDENT.name);

  // Get credit transaction log
  const key = 'sn_credit_log_' + STUDENT.id;
  const txnLog = JSON.parse(localStorage.getItem(key) || '[]').reverse(); // newest first

  const thS = 'padding:11px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:12px 14px;font-size:13px;vertical-align:middle;';

  // Credits summary card
  const summaryColor = credits <= -2 ? '#c53030' : credits <= 0 ? '#e65100' : credits <= 3 ? '#e65100' : 'var(--green-dark)';
  const summaryBg    = credits <= -2 ? '#fde8e8' : credits <= 0 ? '#fff3e0' : credits <= 3 ? '#fff3e0' : 'var(--green-light)';

  // Check if a top-up payment link exists for this student
  const topUpLinks = JSON.parse(localStorage.getItem('sn_payment_links') || '[]');
  const topUpLink = topUpLinks.find(function(l) {
    return (l.email === STUDENT.email || l.student === STUDENT.name) && l.status === 'pending' && l.url;
  });
  const showTopUp = credits <= 2;

  const topUpBtnHtml = showTopUp
    ? '<a href="' + (topUpLink ? topUpLink.url : '#') + '" ' +
      (topUpLink ? 'target="_blank"' : 'onclick="showToast(\'Your payment link is being prepared. Our team will notify you shortly.\',\'info\');return false;"') +
      ' style="display:inline-flex;align-items:center;gap:8px;background:#e65100;color:#fff;padding:12px 24px;border-radius:50px;' +
      'font-family:\'Nunito\',sans-serif;font-weight:900;font-size:14px;text-decoration:none;white-space:nowrap;flex-shrink:0;">' +
      '💳 ' + (topUpLink ? 'Top Up Credits' : 'Top Up (link pending)') + '</a>'
    : '';

  let html = '<div style="background:' + summaryBg + ';border-radius:16px;padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' +
    '<div style="font-size:48px;flex-shrink:0;">💳</div>' +
    '<div style="flex:1;">' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;color:' + summaryColor + ';">' + credits + ' Credits Remaining</div>' +
      '<div style="font-size:13px;font-weight:700;color:var(--mid);margin-top:4px;">Each completed class uses 1 credit. Contact us to top up.</div>' +
    '</div>' +
    topUpBtnHtml +
  '</div>';

  // Payments received
  if (myPayments.length) {
    html += '<div style="font-family:\'Fredoka One\',cursive;font-size:18px;color:var(--dark);margin-bottom:12px;">💰 Payments Received</div>';
    html += '<div style="overflow-x:auto;border-radius:14px;border:1.5px solid #e8eaf0;background:var(--white);margin-bottom:24px;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">' +
        '<th style="' + thS + '">Date</th>' +
        '<th style="' + thS + '">Course</th>' +
        '<th style="' + thS + '">Amount</th>' +
        '<th style="' + thS + '">Credits Added</th>' +
        '<th style="' + thS + '">Status</th>' +
      '</tr></thead><tbody>' +
      myPayments.map(function(p, i) {
        var bg = i % 2 === 0 ? '' : 'background:#fafbff;';
        var date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
        return '<tr style="border-bottom:1px solid #f0f2f8;' + bg + '">' +
          '<td style="' + tdS + ';font-size:12px;color:var(--light);font-weight:700;">' + date + '</td>' +
          '<td style="' + tdS + ';font-weight:700;color:var(--dark);">' + (p.course || '—') + '</td>' +
          '<td style="' + tdS + ';font-weight:800;color:var(--green-dark);">' + (p.currency || '£') + (p.amount || '—') + '</td>' +
          '<td style="' + tdS + ';font-weight:800;color:var(--blue);">+' + (p.credits || '—') + ' credits</td>' +
          '<td style="' + tdS + '"><span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Confirmed</span></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  // Credit transaction log
  html += '<div style="font-family:\'Fredoka One\',cursive;font-size:18px;color:var(--dark);margin-bottom:12px;">📋 Credit Activity Log</div>';

  if (!txnLog.length) {
    html += '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;background:var(--white);border-radius:14px;border:1.5px solid #e8eaf0;">No credit activity yet. Credits are deducted after each completed class.</div>';
  } else {
    html += '<div style="overflow-x:auto;border-radius:14px;border:1.5px solid #e8eaf0;background:var(--white);">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">' +
        '<th style="' + thS + '">Date</th>' +
        '<th style="' + thS + '">Description</th>' +
        '<th style="' + thS + '">Credits</th>' +
        '<th style="' + thS + '">Balance After</th>' +
      '</tr></thead><tbody>' +
      (function() {
        var balance = credits;
        // Rebuild balance from log (newest first, so reverse to calculate)
        var rows = [];
        var runningBalance = credits;
        txnLog.forEach(function(t, i) {
          var bg = i % 2 === 0 ? '' : 'background:#fafbff;';
          var date = t.loggedAt ? new Date(t.loggedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
          var creditVal = t.credits || 0;
          var creditColor = creditVal > 0 ? 'var(--green-dark)' : '#c53030';
          var creditLabel = (creditVal > 0 ? '+' : '') + creditVal;
          rows.push('<tr style="border-bottom:1px solid #f0f2f8;' + bg + '">' +
            '<td style="' + tdS + ';font-size:12px;color:var(--light);font-weight:700;">' + date + '</td>' +
            '<td style="' + tdS + ';font-weight:700;color:var(--dark);">' + (t.description || '—') + '</td>' +
            '<td style="' + tdS + ';font-weight:900;color:' + creditColor + ';">' + creditLabel + '</td>' +
            '<td style="' + tdS + ';font-weight:800;color:var(--mid);">' + runningBalance + '</td>' +
          '</tr>');
          runningBalance -= creditVal; // going backwards
        });
        return rows.join('');
      })() +
      '</tbody></table></div>';
  }

  html += '<div style="margin-top:16px;padding:12px 16px;background:var(--bg);border-radius:10px;font-size:12px;font-weight:700;color:var(--light);">' +
    '🔒 This record is read-only and managed by the StemNest Finance Team. Contact support@stemnestacademy.co.uk for any queries.' +
  '</div>';

  el.innerHTML = html;
}

/* ── Wire showTab to render payment records ── */
const _origShowTabForPayments = window.showTab;
window.showTab = function(tab) {
  if (typeof _origShowTabForPayments === 'function') _origShowTabForPayments(tab);
  if (tab === 'payments') renderPaymentRecords();
};

/* ── INIT: update credits on load ── */
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(updateSidebarCredits, 300);
});
