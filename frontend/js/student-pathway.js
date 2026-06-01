/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — STUDENT DASHBOARD: PATHWAY EXTENSION
   Shows pathway progress, lesson content reveal,
   homework → projects flow.
   Loaded after student-dashboard.js
═══════════════════════════════════════════════════════ */

/* ── Pathway state ── */
window.STUDENT_PATHWAY = {
  enrolments: [],
  activeEnrolment: null,
};

/* ── Hook into _loadStudentFromAPI to capture enrolments ── */
const _origLoadStudent = window._loadStudentFromAPI;
window._loadStudentFromAPI = async function() {
  await _origLoadStudent();
  const data = window._lastStudentAPIData;
  if (data && data.enrolments) {
    window.STUDENT_PATHWAY.enrolments = data.enrolments;
    window.STUDENT_PATHWAY.activeEnrolment = data.enrolments[0] || null;
    _renderPathwayProgress();
    _injectPathwayBanner();
  }
};

/* Store raw API data for pathway use */
const _origFetch = window.fetch;
// We patch _loadStudentFromAPI differently — intercept the data after it loads
document.addEventListener('DOMContentLoaded', () => {
  /* After student data loads, check for pathway enrolments */
  setTimeout(_checkPathwayData, 2000);
});

async function _checkPathwayData() {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;
    const res = await fetch('https://api.stemnestacademy.co.uk/api/sync/dashboard/student', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.enrolments && data.enrolments.length) {
      window.STUDENT_PATHWAY.enrolments = data.enrolments;
      window.STUDENT_PATHWAY.activeEnrolment = data.enrolments[0];
      _renderPathwayProgress();
      _injectPathwayBanner();
    }
    /* Also update LESSONS with pathway lesson data */
    if (data.bookings) {
      window._pathwayBookings = data.bookings;
    }
  } catch(e) { /* silent */ }
}

/* ── Inject pathway banner on overview tab ── */
function _injectPathwayBanner() {
  const enr = window.STUDENT_PATHWAY.activeEnrolment;
  if (!enr || !enr.pathway_name) return;
  const existing = document.getElementById('pathwayProgressBanner');
  if (existing) existing.remove();

  const overview = document.getElementById('tab-overview');
  if (!overview) return;

  const gradeNum  = enr.current_grade || 1;
  const unitNum   = enr.current_unit  || 1;
  const completed = enr.lessons_completed || 0;
  const total     = 72;
  const pct       = Math.round((completed / total) * 100);

  const banner = document.createElement('div');
  banner.id = 'pathwayProgressBanner';
  banner.style.cssText = 'margin-bottom:24px;';
  banner.innerHTML = `
    <div style="background:linear-gradient(135deg,#1a56db,#0e9f6e);border-radius:20px;padding:24px 28px;color:#fff;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:13px;font-weight:800;opacity:.8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Your Career Pathway</div>
          <div style="font-family:'Fredoka One',cursive;font-size:22px;">${enr.pathway_emoji || '🚀'} ${enr.pathway_name}</div>
          <div style="font-size:14px;opacity:.9;margin-top:4px;">Grade ${gradeNum} of 12 &nbsp;·&nbsp; Unit ${unitNum} of 8 &nbsp;·&nbsp; ${completed} / ${total} lessons</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Fredoka One',cursive;font-size:32px;">${pct}%</div>
          <div style="font-size:12px;opacity:.8;">Grade Progress</div>
        </div>
      </div>
      <div style="background:rgba(255,255,255,.25);border-radius:50px;height:8px;margin-top:16px;overflow:hidden;">
        <div style="background:#fff;height:100%;width:${pct}%;border-radius:50px;transition:width .5s;"></div>
      </div>
    </div>`;

  /* Insert before the first child of overview */
  overview.insertBefore(banner, overview.firstChild);
}

/* ── Render pathway progress in the progress bars section ── */
function _renderPathwayProgress() {
  const enr = window.STUDENT_PATHWAY.activeEnrolment;
  if (!enr || !enr.pathway_name) return;
  /* Override COURSES array to show pathway progress */
  const gradeNum  = enr.current_grade || 1;
  const completed = enr.lessons_completed || 0;
  const total     = 72;
  COURSES = [{
    id:       enr.pathway_id || 'pathway',
    name:     `${enr.pathway_emoji || '🚀'} ${enr.pathway_name} — Grade ${gradeNum}`,
    tutor:    'Assigned Tutor',
    progress: Math.round((completed / total) * 100),
    total,
    done:     completed,
    color:    'blue',
  }];
  renderProgressBars();
}

/* ══════════════════════════════════════════════════════
   LESSON CONTENT REVEAL
   When a booking is completed, show lesson details
   including Task 1 link and Task 2 link
══════════════════════════════════════════════════════ */

function openLessonDetails(bookingId) {
  const bookings = window._pathwayBookings || [];
  const b = bookings.find(x => x.id === bookingId);
  if (!b) { showToast('Lesson details not available.', 'error'); return; }

  /* Only show content if class is completed */
  if (b.status !== 'completed' && !b.content_released) {
    showToast('Lesson content will be available after your class is completed.', 'info');
    return;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

  const title = b.pathway_lesson_title || b.title || b.subject || 'Lesson';
  const taskLinks = [];
  if (b.task1_link) taskLinks.push({ label: 'Task 1 — Guided', url: b.task1_link, desc: b.task1_description });
  if (b.task2_link) taskLinks.push({ label: 'Task 2 — Independent', url: b.task2_link, desc: b.task2_description });

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.3);">
      <div style="background:linear-gradient(135deg,#1a56db,#0e9f6e);padding:24px 28px;border-radius:24px 24px 0 0;display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:12px;font-weight:800;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Lesson ${b.pathway_lesson_number || ''}</div>
          <div style="font-family:'Fredoka One',cursive;font-size:22px;color:#fff;">${title}</div>
        </div>
        <button onclick="this.closest('div[style]').remove()" style="background:rgba(255,255,255,.2);border:none;border-radius:50%;width:36px;height:36px;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;">✕</button>
      </div>
      <div style="padding:28px;">
        ${b.learning_objectives ? `
          <div style="margin-bottom:20px;">
            <div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:8px;">🎯 Learning Objectives</div>
            <div style="font-size:14px;color:var(--mid);line-height:1.7;background:var(--bg);border-radius:12px;padding:14px 16px;">${b.learning_objectives}</div>
          </div>` : ''}
        ${b.concept_discovery ? `
          <div style="margin-bottom:20px;">
            <div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:8px;">💡 Concept Discovery</div>
            <div style="font-size:14px;color:var(--mid);line-height:1.7;background:var(--bg);border-radius:12px;padding:14px 16px;">${b.concept_discovery}</div>
          </div>` : ''}
        ${taskLinks.length ? `
          <div style="margin-bottom:20px;">
            <div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:12px;">📋 Class Tasks</div>
            ${taskLinks.map(t => `
              <div style="background:var(--blue-light);border-radius:14px;padding:16px 18px;margin-bottom:10px;">
                <div style="font-weight:900;color:var(--blue);font-size:14px;margin-bottom:4px;">${t.label}</div>
                ${t.desc ? `<div style="font-size:13px;color:var(--mid);margin-bottom:10px;">${t.desc}</div>` : ''}
                <a href="${t.url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:var(--blue);color:#fff;text-decoration:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;">
                  🔗 Open Task →
                </a>
              </div>`).join('')}
          </div>` : ''}
        ${b.debrief ? `
          <div style="margin-bottom:20px;">
            <div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:8px;">🔄 DeBrief</div>
            <div style="font-size:14px;color:var(--mid);line-height:1.7;background:var(--bg);border-radius:12px;padding:14px 16px;">${b.debrief}</div>
          </div>` : ''}
        ${b.what_comes_next ? `
          <div style="background:var(--green-light);border-radius:14px;padding:16px 18px;">
            <div style="font-family:'Fredoka One',cursive;font-size:15px;color:var(--green-dark);margin-bottom:6px;">⏭️ What Comes Next</div>
            <div style="font-size:13px;color:var(--green-dark);line-height:1.6;">${b.what_comes_next}</div>
          </div>` : ''}
        ${!b.learning_objectives && !taskLinks.length && !b.concept_discovery ? `
          <div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">
            <div style="font-size:48px;margin-bottom:12px;">📖</div>
            <div>Lesson content will appear here after your class is completed.</div>
          </div>` : ''}
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/* ══════════════════════════════════════════════════════
   HOMEWORK → PROJECTS
   After class completion, homework1 and homework2
   appear as project cards in Pending Projects
══════════════════════════════════════════════════════ */

/* Override renderPendingProjects to also show homework projects */
const _origRenderPendingProjects = window.renderPendingProjects;
window.renderPendingProjects = function() {
  _injectHomeworkProjects();
  _origRenderPendingProjects();
};

function _injectHomeworkProjects() {
  const bookings = window._pathwayBookings || [];
  /* Find completed bookings that have homework and haven't been submitted yet */
  const hwProjects = [];
  bookings.forEach(b => {
    if (b.status !== 'completed') return;
    if (b.homework1) {
      const projId = 'hw-' + b.id + '-1';
      const alreadyPending = pendingProjects.some(p => p.id === projId);
      const alreadySubmitted = submittedProjects.some(p => p.id === projId);
      const alreadyReviewed = reviewedProjects.some(p => p.id === projId);
      if (!alreadyPending && !alreadySubmitted && !alreadyReviewed) {
        hwProjects.push({
          id:     projId,
          title:  (b.pathway_lesson_title || b.subject || 'Lesson') + ' — Homework 1',
          course: b.pathway_lesson_title || b.subject || '—',
          brief:  b.homework1,
          due:    'No deadline',
          emoji:  '📝',
          steps:  ['Read the homework brief carefully', 'Complete the task at your own pace', 'Paste your project link when ready to submit'],
          isHomework: true,
          bookingId: b.id,
        });
      }
    }
    if (b.homework2) {
      const projId = 'hw-' + b.id + '-2';
      const alreadyPending = pendingProjects.some(p => p.id === projId);
      const alreadySubmitted = submittedProjects.some(p => p.id === projId);
      const alreadyReviewed = reviewedProjects.some(p => p.id === projId);
      if (!alreadyPending && !alreadySubmitted && !alreadyReviewed) {
        hwProjects.push({
          id:     projId,
          title:  (b.pathway_lesson_title || b.subject || 'Lesson') + ' — Homework 2',
          course: b.pathway_lesson_title || b.subject || '—',
          brief:  b.homework2,
          due:    'No deadline',
          emoji:  '📝',
          steps:  ['Read the homework brief carefully', 'Complete the task at your own pace', 'Paste your project link when ready to submit'],
          isHomework: true,
          bookingId: b.id,
        });
      }
    }
  });
  /* Add homework projects to the front of pendingProjects */
  hwProjects.forEach(hw => {
    if (!pendingProjects.some(p => p.id === hw.id)) {
      pendingProjects.unshift(hw);
    }
  });
}

/* ── Update lessons list to show "View Details" button on completed lessons ── */
const _origRenderLessons = window.renderLessons;
window.renderLessons = function() {
  const el = document.getElementById('lessonsList');
  if (!el) return;
  const pathwayBookings = window._pathwayBookings || [];
  if (!pathwayBookings.length) { _origRenderLessons(); return; }

  /* Build lessons from pathway bookings */
  const lessons = pathwayBookings
    .filter(b => b.status === 'scheduled' || b.status === 'completed')
    .sort((a, b) => {
      if (a.status === 'scheduled' && b.status !== 'scheduled') return -1;
      if (b.status === 'scheduled' && a.status !== 'scheduled') return 1;
      return new Date(a.date) - new Date(b.date);
    })
    .slice(0, 20);

  if (!lessons.length) { _origRenderLessons(); return; }

  el.innerHTML = lessons.map((b, i) => {
    const isCompleted = b.status === 'completed';
    const isLive      = b.status === 'scheduled' && _isClassLiveNow(b);
    const dateStr     = b.date ? new Date(b.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : '—';
    const timeStr     = (b.time || '—').replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
    const lessonTitle = b.pathway_lesson_title || b.subject || 'Class';
    const lessonNum   = b.pathway_lesson_number ? `Lesson ${b.pathway_lesson_number}` : '';

    return `
      <div class="lesson-card${isLive ? ' lesson-live' : ''}${isCompleted ? '' : ''}">
        <div class="lesson-card-left">
          <div class="lesson-date-box">
            <div class="lesson-day">${dateStr.split(' ')[1] || ''}</div>
            <div class="lesson-month">${dateStr.split(' ')[2] || ''}</div>
          </div>
          <div class="lesson-info">
            <div class="lesson-title">${lessonTitle}${lessonNum ? ' <span style="font-size:11px;color:var(--light);font-weight:700;">· ' + lessonNum + '</span>' : ''}</div>
            <div class="lesson-meta">🕐 ${timeStr} &nbsp;·&nbsp; 👩‍🏫 ${b.tutor_name || 'Tutor'} &nbsp;·&nbsp; ${isCompleted ? '✅ Completed' : '📅 Upcoming'}</div>
          </div>
        </div>
        <div class="lesson-card-right" style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          ${isLive ? `<button class="join-btn" onclick="joinClass()">🚀 Join</button>` : ''}
          ${isCompleted ? `
            <button onclick="openLessonDetails('${b.id}')"
              style="background:var(--blue-light);color:var(--blue);border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;">
              📖 View Details
            </button>` : ''}
          <span class="lesson-arrow">›</span>
        </div>
      </div>`;
  }).join('');
};

function _isClassLiveNow(booking) {
  if (!booking.date || !booking.time) return false;
  try {
    const timeStr = (booking.time || '').replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
    const classStart = new Date(booking.date + 'T' + timeStr + ':00');
    const classEnd   = new Date(classStart.getTime() + 60 * 60 * 1000);
    const now        = new Date();
    return now >= classStart && now <= classEnd;
  } catch(e) { return false; }
}
