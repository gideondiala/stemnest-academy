/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — TUTOR PROJECTS
   Real-time project review from API.
   Pending Projects / Reviewed Projects filter buttons.
   Replaces the hardcoded project list in tutor-dashboard.
═══════════════════════════════════════════════════════ */

let _tutorProjects = [];
let _tutorProjectFilter = 'pending';

/* ── Hook into showDashTab ── */
(function() {
  const _prev = window.showDashTab;
  if (!_prev) return;
  window.showDashTab = function(tab) {
    _prev(tab);
    if (tab === 'projects') renderTutorProjects();
  };
})();

/* ── Load projects from API ── */
async function loadTutorProjects() {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;
    const res = await fetch('https://api.stemnestacademy.co.uk/api/projects?role=tutor', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    _tutorProjects = data.projects || [];
  } catch(e) { console.warn('[TutorProjects] Load failed:', e.message); }
}

/* ── Render projects tab ── */
async function renderTutorProjects() {
  const container = document.getElementById('tab-projects');
  if (!container) return;

  container.innerHTML = `
    <div class="dash-section-header">
      <div class="dash-section-title">📁 Student Projects</div>
      <button class="btn btn-outline" style="font-size:12px;" onclick="renderTutorProjects()">🔄 Refresh</button>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
      <button id="projFilter-pending"  class="proj-toggle-btn ${_tutorProjectFilter==='pending'?'proj-toggle-active':''}" onclick="setTutorProjectFilter('pending')">
        📝 Pending Review <span id="pendingProjCount" style="background:rgba(255,255,255,.3);border-radius:50px;padding:1px 8px;font-size:11px;margin-left:4px;">0</span>
      </button>
      <button id="projFilter-reviewed" class="proj-toggle-btn ${_tutorProjectFilter==='reviewed'?'proj-toggle-active':''}" onclick="setTutorProjectFilter('reviewed')">
        ✅ Reviewed <span id="reviewedProjCount" style="background:rgba(0,0,0,.08);border-radius:50px;padding:1px 8px;font-size:11px;margin-left:4px;">0</span>
      </button>
    </div>
    <div id="tutorProjectsList"><div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading projects...</div></div>`;

  await loadTutorProjects();
  _renderTutorProjectsList();
}

function setTutorProjectFilter(filter) {
  _tutorProjectFilter = filter;
  ['pending','reviewed'].forEach(f => {
    const btn = document.getElementById('projFilter-' + f);
    if (btn) btn.className = 'proj-toggle-btn' + (f === filter ? ' proj-toggle-active' : '');
  });
  _renderTutorProjectsList();
}

function _renderTutorProjectsList() {
  const el = document.getElementById('tutorProjectsList');
  if (!el) return;

  const pending  = _tutorProjects.filter(p => p.status === 'submitted');
  const reviewed = _tutorProjects.filter(p => p.status === 'reviewed');

  const pendingCount  = document.getElementById('pendingProjCount');
  const reviewedCount = document.getElementById('reviewedProjCount');
  if (pendingCount)  pendingCount.textContent  = pending.length;
  if (reviewedCount) reviewedCount.textContent = reviewed.length;

  const list = _tutorProjectFilter === 'pending' ? pending : reviewed;

  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;background:var(--white);border-radius:16px;border:1.5px solid #e8eaf0;">
      <div style="font-size:48px;margin-bottom:12px;">${_tutorProjectFilter === 'pending' ? '🎉' : '📋'}</div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">
        ${_tutorProjectFilter === 'pending' ? 'No pending projects!' : 'No reviewed projects yet.'}
      </div>
      <div style="font-size:14px;color:var(--light);margin-top:6px;">
        ${_tutorProjectFilter === 'pending' ? 'All caught up — great work.' : 'Reviewed projects will appear here.'}
      </div>
    </div>`;
    return;
  }

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${list.map(p => `
        <div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;padding:18px 22px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="font-weight:900;color:var(--dark);font-size:15px;margin-bottom:4px;">📝 ${p.title || 'Project'}</div>
            <div style="font-size:13px;font-weight:700;color:var(--mid);margin-bottom:4px;">👤 ${p.student_name || '—'} · ${p.course_name || '—'}</div>
            ${p.submission ? `
              <div style="margin-top:8px;">
                <a href="${p.submission}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:var(--blue-light);color:var(--blue);text-decoration:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;">
                  🔗 View Submission →
                </a>
              </div>` : '<div style="font-size:12px;color:var(--light);margin-top:6px;">No submission link</div>'}
            ${p.status === 'reviewed' && p.remarks ? `
              <div style="margin-top:8px;background:var(--green-light);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--green-dark);font-weight:700;">
                ✅ Your feedback: "${p.remarks}"
              </div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;flex-shrink:0;">
            <span style="background:${p.status==='reviewed'?'var(--green-light)':'#fff3e0'};color:${p.status==='reviewed'?'var(--green-dark)':'#e65100'};font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">
              ${p.status === 'reviewed' ? '✅ Reviewed' : '⏳ Pending Review'}
            </span>
            ${p.status === 'submitted' ? `
              <button onclick="openProjectReviewModal('${p.id}','${(p.title||'Project').replace(/'/g,'')}')"
                style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;white-space:nowrap;">
                ✏️ Review
              </button>` : ''}
            <div style="font-size:11px;color:var(--light);font-weight:700;">
              ${p.submitted_at ? 'Submitted ' + new Date(p.submitted_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : ''}
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}

/* ── Project Review Modal ── */
function openProjectReviewModal(projectId, projectTitle) {
  document.getElementById('projReviewOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'projReviewOverlay';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-header">
        <div class="modal-title">✏️ Review Project</div>
        <button class="modal-close" onclick="document.getElementById('projReviewOverlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div style="font-weight:800;color:var(--dark);font-size:15px;margin-bottom:16px;">📝 ${projectTitle}</div>
        <div class="pm-field">
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Feedback / Remarks *</label>
          <textarea id="pr-remarks" rows="4" placeholder="Write your feedback for the student..." style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;resize:vertical;"></textarea>
        </div>
        <div class="pm-field" style="margin-top:12px;">
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Score (0–100, optional)</label>
          <input type="number" id="pr-score" min="0" max="100" placeholder="e.g. 85" style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="btn btn-outline" style="flex:1;" onclick="document.getElementById('projReviewOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:2;" onclick="submitProjectReview('${projectId}')">✅ Submit Review</button>
        </div>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function submitProjectReview(projectId) {
  const remarks = document.getElementById('pr-remarks')?.value.trim();
  const score   = document.getElementById('pr-score')?.value;
  if (!remarks) { showToast('Please write feedback before submitting.', 'error'); return; }
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch(`https://api.stemnestacademy.co.uk/api/projects/${projectId}/review`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ remarks, score: score ? parseInt(score) : null })
    });
    const data = await res.json();
    document.getElementById('projReviewOverlay')?.remove();
    if (data.success) {
      showToast('✅ Review submitted! Student has been notified.');
      await renderTutorProjects();
    } else {
      showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ── Auto-load on page ready ── */
document.addEventListener('DOMContentLoaded', () => {
  /* Pre-load projects count for badge */
  setTimeout(async () => {
    await loadTutorProjects();
    const pending = _tutorProjects.filter(p => p.status === 'submitted').length;
    const badge = document.querySelector('[data-tab="projects"] .sl-badge');
    if (badge) badge.textContent = pending;
  }, 1500);
});
