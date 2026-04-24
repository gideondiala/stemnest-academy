/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — TUTOR COMPANION, LEADERBOARD & KYC
   Phase 3 teacher dashboard upgrades.
   Loaded after dashboard.js.
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   EXTEND TAB SWITCHING to include new tabs
══════════════════════════════════════════════════════ */
const EXTRA_TABS = ['companion', 'leaderboard', 'kyc'];

const _origShowDashTab = showDashTab;
showDashTab = function(tab) {
  // Hide extra tabs
  EXTRA_TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = 'none';
  });
  // Call original for base tabs
  _origShowDashTab(tab);
  // Show extra tab if needed
  if (EXTRA_TABS.includes(tab)) {
    // Hide all base tabs too
    ['overview','sessions','projects','calendar'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.style.display = 'none';
    });
    const el = document.getElementById('tab-' + tab);
    if (el) el.style.display = 'block';
    // Sidebar active state
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
      link.classList.toggle('active', link.dataset.tab === tab);
    });
    // Hide quick actions
    const qa = document.getElementById('quickActions');
    if (qa) qa.style.display = 'none';
  }
  // Render content
  if (tab === 'companion')   renderCompanion();
  if (tab === 'leaderboard') renderLeaderboard();
  if (tab === 'kyc')         renderKYC();
};

/* ══════════════════════════════════════════════════════
   EARNINGS & POINTS STORE
══════════════════════════════════════════════════════ */
function getEarningsData() {
  try { return JSON.parse(localStorage.getItem('sn_earnings_' + TUTOR.id) || '{"earnings":0,"points":0,"classes":0,"lateJoins":[],"pointsLog":[]}'); }
  catch { return { earnings: 0, points: 0, classes: 0, lateJoins: [], pointsLog: [] }; }
}
function saveEarningsData(data) {
  localStorage.setItem('sn_earnings_' + TUTOR.id, JSON.stringify(data));
}

/* Called when a session is marked complete (from dashboard.js submitEndClassReport) */
function addSessionEarning(sessionType) {
  const data = getEarningsData();
  const amount = sessionType === 'demo' ? 5 : 20;
  data.earnings += amount;
  data.classes  += 1;
  data.points   += 20; // 20 points per completed class
  data.pointsLog.unshift({ type: 'class_complete', points: 20, amount, date: new Date().toISOString(), note: `${sessionType === 'demo' ? 'Demo' : 'Paid'} class completed` });
  saveEarningsData(data);
  updateEarningsBadges();
}

/* Called when student submits a star rating */
function addRatingPoints(stars) {
  const data = getEarningsData();
  const pointMap = { 5: 100, 4: 60, 3: 30, 2: 0, 1: -20, 0: -50 };
  const pts = pointMap[stars] ?? 0;
  data.points += pts;
  data.pointsLog.unshift({ type: 'rating', points: pts, stars, date: new Date().toISOString(), note: `Student gave ${stars}★ rating` });
  saveEarningsData(data);
}

/* Late join tracking */
function logLateJoin(sessionId, joinTime) {
  const data = getEarningsData();
  const now  = new Date();
  const month = now.getFullYear() + '-' + (now.getMonth() + 1);
  data.lateJoins = data.lateJoins || [];
  data.lateJoins.push({ sessionId, joinTime, month, date: now.toISOString() });

  // Count late joins this month
  const thisMonthLate = data.lateJoins.filter(l => l.month === month).length;

  // Log to operations
  const ops = JSON.parse(localStorage.getItem('sn_late_joins') || '[]');
  ops.unshift({
    tutorId:   TUTOR.id,
    tutorName: TUTOR.name,
    sessionId,
    joinTime,
    month,
    date:      now.toISOString(),
    penalty:   thisMonthLate >= 3 ? 2 : 0,
    pardoned:  thisMonthLate <= 2,
  });
  localStorage.setItem('sn_late_joins', JSON.stringify(ops));

  // Log penalty (3rd+ late join = $2 logged, NOT deducted from earnings)
  if (thisMonthLate >= 3) {
    data.pointsLog.unshift({ type: 'late_penalty', points: 0, amount: -2, date: now.toISOString(), note: `Late join #${thisMonthLate} — $2 penalty logged to operations` });
    showToast(`⚠️ Late join #${thisMonthLate} this month. $2 penalty logged to operations.`, 'error');
  } else {
    showToast(`⚠️ Late join recorded (${thisMonthLate}/2 pardoned this month).`, 'info');
  }

  saveEarningsData(data);
}

function updateEarningsBadges() {
  const data = getEarningsData();
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('liveEarnings',    '$' + data.earnings.toFixed(0));
  el('totalPoints',     data.points);
  el('classesCompleted', data.classes);
  const lateCount = (data.lateJoins || []).filter(l => {
    const now = new Date();
    return l.month === now.getFullYear() + '-' + (now.getMonth() + 1);
  }).length;
  el('lateJoins', lateCount);
  const noteEl = document.getElementById('lateJoinNote');
  if (noteEl) noteEl.textContent = lateCount <= 2 ? `${lateCount}/2 pardoned` : `${lateCount - 2} penalised`;
}

/* ══════════════════════════════════════════════════════
   15-MINUTE CLASS REMINDER
══════════════════════════════════════════════════════ */
function startClassReminders() {
  const bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  const myClasses = bookings.filter(b => b.assignedTutorId === TUTOR.id && b.status === 'scheduled');

  myClasses.forEach(b => {
    if (!b.date || !b.time) return;
    try {
      const classTime = new Date(b.date + 'T' + convertTo24(b.time));
      const reminderTime = new Date(classTime.getTime() - 15 * 60 * 1000);
      const now = new Date();
      const msUntilReminder = reminderTime - now;

      if (msUntilReminder > 0 && msUntilReminder < 2 * 60 * 60 * 1000) {
        setTimeout(() => showClassReminderPopup(b), msUntilReminder);
      }
    } catch(e) {}
  });
}

function convertTo24(timeStr) {
  if (!timeStr) return '00:00:00';
  const [time, period] = timeStr.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return String(h).padStart(2,'0') + ':' + String(m||0).padStart(2,'0') + ':00';
}

function showClassReminderPopup(booking) {
  // Remove any existing reminder
  document.getElementById('classReminderPopup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'classReminderPopup';
  popup.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:linear-gradient(135deg,var(--blue),var(--green));
    color:#fff; border-radius:20px; padding:20px 24px;
    box-shadow:0 12px 40px rgba(0,0,0,.3); max-width:320px;
    animation:fadeIn .4s ease; font-family:'Nunito',sans-serif;
  `;
  popup.innerHTML = `
    <div style="font-family:'Fredoka One',cursive;font-size:18px;margin-bottom:8px;">⏰ Class in 15 minutes!</div>
    <div style="font-size:14px;font-weight:700;opacity:.9;line-height:1.6;">
      📚 ${booking.subject}<br>
      🎓 ${booking.studentName} (${booking.grade})<br>
      🕐 ${booking.time}
    </div>
    ${booking.classLink ? `<a href="${booking.classLink}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;margin-top:14px;background:#fff;color:var(--blue);padding:9px 18px;border-radius:50px;font-weight:900;font-size:13px;text-decoration:none;">🚀 Join Class</a>` : ''}
    <button onclick="this.closest('#classReminderPopup').remove()" style="position:absolute;top:10px;right:12px;background:none;border:none;color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;">✕</button>
  `;
  document.body.appendChild(popup);

  // Auto-dismiss after 2 minutes
  setTimeout(() => popup.remove(), 2 * 60 * 1000);
}

/* ══════════════════════════════════════════════════════
   MY COMPANION TAB
══════════════════════════════════════════════════════ */
function renderCompanion() {
  const el = document.getElementById('companionContent');
  if (!el) return;

  // Get materials from admin uploads (sn_companion_materials)
  const allMaterials = JSON.parse(localStorage.getItem('sn_companion_materials') || '[]');
  // Filter to courses this teacher is assigned to
  const myCourses = TUTOR.courses || [];
  const myMaterials = allMaterials.filter(m => !m.course || myCourses.includes(m.course));

  if (!myMaterials.length) {
    el.innerHTML = `
      <div class="companion-empty">
        <div style="font-size:48px;margin-bottom:16px;">📚</div>
        <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--dark);margin-bottom:8px;">No materials yet</div>
        <div style="font-size:14px;color:var(--light);">Your course materials will appear here once the admin uploads them for your assigned courses.</div>
        <div style="margin-top:16px;font-size:13px;font-weight:700;color:var(--blue);">Your courses: ${myCourses.join(', ') || 'None assigned'}</div>
      </div>`;
    return;
  }

  // Group by course
  const grouped = {};
  myMaterials.forEach(m => {
    const key = m.course || 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  const typeIcon = { curriculum:'📋', lesson_plan:'📝', notes:'📓', quiz_solution:'✅', activity:'🎯', tool:'🔧', other:'📄' };
  const typeLabel = { curriculum:'Curriculum', lesson_plan:'Lesson Plan', notes:'Lesson Notes', quiz_solution:'Quiz Solutions', activity:'Activity Guide', tool:'Quick Tool', other:'Resource' };

  el.innerHTML = Object.entries(grouped).map(([course, items]) => `
    <div class="companion-course-section">
      <div class="companion-course-title">📚 ${course}</div>
      <div class="companion-grid">
        ${items.map(m => `
          <a href="${m.url || '#'}" target="_blank" class="companion-card" ${!m.url ? 'onclick="showToast(\'File not yet uploaded.\',\'error\');return false;"' : ''}>
            <div class="companion-card-icon">${typeIcon[m.type] || '📄'}</div>
            <div class="companion-card-body">
              <div class="companion-card-title">${m.title}</div>
              <div class="companion-card-meta">${typeLabel[m.type] || 'Resource'} · ${m.id || '—'}</div>
              ${m.description ? `<div class="companion-card-desc">${m.description}</div>` : ''}
            </div>
            <div class="companion-card-arrow">↗</div>
          </a>`).join('')}
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════
   LEADERBOARD TAB
══════════════════════════════════════════════════════ */
function renderLeaderboard() {
  updateEarningsBadges();

  // Points breakdown log
  const data = getEarningsData();
  const logEl = document.getElementById('pointsBreakdown');
  if (logEl) {
    if (!data.pointsLog?.length) {
      logEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">No activity yet. Complete classes to earn points!</div>';
    } else {
      logEl.innerHTML = `
        <div class="points-log-header">
          <span>Activity</span><span>Points</span><span>Date</span>
        </div>
        ${data.pointsLog.slice(0, 20).map(l => `
          <div class="points-log-row">
            <div class="points-log-note">${l.note}</div>
            <div class="points-log-pts ${l.points >= 0 ? 'pts-pos' : 'pts-neg'}">${l.points >= 0 ? '+' : ''}${l.points}</div>
            <div class="points-log-date">${new Date(l.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
          </div>`).join('')}`;
    }
  }

  // All tutors leaderboard
  const teachers = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
  const listEl = document.getElementById('leaderboardList');
  if (!listEl) return;

  const ranked = teachers.map(t => {
    const d = JSON.parse(localStorage.getItem('sn_earnings_' + t.id) || '{"points":0,"earnings":0,"classes":0}');
    return { ...t, points: d.points || 0, earnings: d.earnings || 0, classes: d.classes || 0 };
  }).sort((a, b) => b.points - a.points);

  if (!ranked.length) { listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">No tutors yet.</div>'; return; }

  listEl.innerHTML = ranked.map((t, i) => {
    const isMe = t.id === TUTOR.id;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
    return `
      <div class="lb-row ${isMe ? 'lb-me' : ''}">
        <div class="lb-rank">${medal}</div>
        <div class="lb-av" style="background:${t.color || 'linear-gradient(135deg,var(--blue),var(--green))'}">
          ${t.photo ? `<img src="${t.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : t.initials}
        </div>
        <div class="lb-info">
          <div class="lb-name">${t.name} ${isMe ? '<span class="lb-you">You</span>' : ''}</div>
          <div class="lb-sub">${t.id} · ${t.classes} classes · $${t.earnings}</div>
        </div>
        <div class="lb-points">${t.points} <span>pts</span></div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════
   KYC TAB
══════════════════════════════════════════════════════ */
function renderKYC() {
  const el = document.getElementById('kycContent');
  if (!el) return;

  el.innerHTML = `
    <div class="kyc-card">
      <div class="kyc-header">
        <div class="kyc-avatar-wrap">
          ${TUTOR.photo
            ? `<img src="${TUTOR.photo}" class="kyc-avatar-img" alt="${TUTOR.name}">`
            : `<div class="kyc-avatar-initials">${TUTOR.initials || TUTOR.name.slice(0,2).toUpperCase()}</div>`}
          <button class="kyc-photo-btn" onclick="triggerPhotoUpload()">📷 Update Photo</button>
        </div>
        <div class="kyc-header-info">
          <div class="kyc-name">${TUTOR.name}</div>
          <div class="kyc-id-badge">${TUTOR.id}</div>
          <div class="kyc-role">${TUTOR.role || TUTOR.subject + ' Tutor'}</div>
        </div>
      </div>

      <div class="kyc-intro-tip">
        💡 <strong>Demo Class Tip:</strong> Use this information to introduce yourself confidently to new students and parents.
      </div>

      <div class="kyc-fields">
        <div class="kyc-field-group">
          <div class="kyc-field-label">Full Name</div>
          <div class="kyc-field-value">${TUTOR.name || '—'}</div>
        </div>
        <div class="kyc-field-group">
          <div class="kyc-field-label">Teacher ID</div>
          <div class="kyc-field-value">${TUTOR.id}</div>
        </div>
        <div class="kyc-field-group">
          <div class="kyc-field-label">Email Address</div>
          <div class="kyc-field-value">${TUTOR.email || '—'}</div>
        </div>
        <div class="kyc-field-group">
          <div class="kyc-field-label">Phone Number</div>
          <div class="kyc-field-value">${TUTOR.phone || '—'}</div>
        </div>
        <div class="kyc-field-group">
          <div class="kyc-field-label">Subject Specialisms</div>
          <div class="kyc-field-value">${Array.isArray(TUTOR.courses) ? TUTOR.courses.join(', ') : (TUTOR.subjects || '—')}</div>
        </div>
        <div class="kyc-field-group">
          <div class="kyc-field-label">Grade Groups</div>
          <div class="kyc-field-value">${Array.isArray(TUTOR.gradeGroups) ? TUTOR.gradeGroups.join(', ') : '—'}</div>
        </div>
        <div class="kyc-field-group">
          <div class="kyc-field-label">Availability</div>
          <div class="kyc-field-value">${TUTOR.availability || '—'}</div>
        </div>
        <div class="kyc-field-group kyc-full">
          <div class="kyc-field-label">Short Bio</div>
          <div class="kyc-field-value">${TUTOR.bio || '—'}</div>
        </div>
      </div>

      <div class="kyc-intro-script">
        <div class="kyc-script-title">📝 Suggested Demo Introduction</div>
        <div class="kyc-script-text">
          "Hi! My name is <strong>${TUTOR.name}</strong>, and I'm a ${TUTOR.subject} tutor here at StemNest Academy.
          My teacher ID is <strong>${TUTOR.id}</strong>.
          I specialise in ${Array.isArray(TUTOR.courses) ? TUTOR.courses.slice(0,2).join(' and ') : TUTOR.subject},
          and I work with students in ${Array.isArray(TUTOR.gradeGroups) ? TUTOR.gradeGroups.join(', ') : 'various year groups'}.
          ${TUTOR.bio ? TUTOR.bio.split('.')[0] + '.' : ''}
          I'm really looking forward to today's session — let's get started!"
        </div>
      </div>

      <div style="margin-top:20px;text-align:right;">
        <button class="btn btn-primary" onclick="openProfileModal()">✏️ Edit My Details</button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   INIT — run after dashboard.js DOMContentLoaded
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  updateEarningsBadges();
  startClassReminders();
});
