/**
 * student-learning.js — assignments (projects), unit quizzes and leaderboard
 * on the student dashboard. Loaded after student-dashboard.js and replaces
 * its project/quiz renderers with ones that show due-date countdowns, late
 * half-marks, link submissions and 3 quiz attempts.
 */
'use strict';

var SL_API = 'https://api.stemnestacademy.co.uk';
var SL_ATTEMPTS = 3;

function _slEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function _slLink(url) {
  var safe = /^https?:\/\//i.test(url || '') ? url : '#';
  return '<a href="' + _slEsc(safe) + '" target="_blank" rel="noopener" style="color:var(--blue);font-weight:800;word-break:break-all;">' + _slEsc(url) + '</a>';
}
function _slDate(d) { return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }

/** Countdown chip: green > 2 days, amber ≤ 2 days, red once overdue. */
function _slDueChip(dueAt) {
  if (!dueAt) return '';
  var ms = new Date(dueAt).getTime() - Date.now();
  var abs = Math.abs(ms), d = Math.floor(abs / 86400000), h = Math.floor((abs % 86400000) / 3600000);
  var txt = d > 0 ? d + 'd ' + h + 'h' : (h > 0 ? h + 'h' : Math.max(1, Math.floor(abs / 60000)) + 'm');
  var bg, fg, label;
  if (ms < 0)                 { bg = '#fed7d7'; fg = '#c53030'; label = '⚠️ Overdue by ' + txt + ' — half marks'; }
  else if (ms <= 2 * 86400000){ bg = '#fef3c7'; fg = '#b45309'; label = '⏰ ' + txt + ' left'; }
  else                        { bg = '#d4f8e8'; fg = '#065f46'; label = '⏳ ' + txt + ' left'; }
  return '<span class="sl-due" data-due="' + _slEsc(dueAt) + '" style="display:inline-block;background:' + bg + ';color:' + fg + ';border-radius:50px;padding:3px 10px;font-size:11px;font-weight:900;white-space:nowrap;">' + label + '</span>';
}
/* Keep countdowns live */
setInterval(function () {
  document.querySelectorAll('.sl-due').forEach(function (el) { el.outerHTML = _slDueChip(el.getAttribute('data-due')); });
}, 60000);

/* ══════════════ Projects ══════════════ */
function _slProjCard(p, kind) {
  var r = p.raw || {};
  var meta = (r.lesson_number ? 'Lesson ' + r.lesson_number + ' · ' : '') + _slEsc(p.course) + (r.tutor_name ? ' · ' + _slEsc(r.tutor_name) : '');
  var right = '';
  if (kind === 'pending')   right = r.due_at ? _slDueChip(r.due_at) : '<span style="font-size:11px;color:var(--light);font-weight:800;">Due: ' + _slEsc(p.due) + '</span>';
  if (kind === 'submitted') right = '<span style="font-size:11px;font-weight:900;color:#1e40af;">⏳ Waiting for review' + (r.is_late ? ' · late' : '') + '</span>';
  if (kind === 'reviewed')  right = '<span style="font-family:\'Fredoka One\',cursive;font-size:20px;color:#065f46;">' + (r.points != null ? r.points : p.score) + '<span style="font-size:12px;color:var(--light);"> pts</span></span>';
  return '<div class="student-proj-card" onclick="openProjectModal(\'' + p.id + '\')" style="display:flex;align-items:center;gap:12px;">' +
    '<div class="spc-emoji">' + (kind === 'reviewed' ? '⭐' : (r.kind === 'lesson' ? '📝' : '💻')) + '</div>' +
    '<div class="spc-info" style="flex:1;min-width:0;"><div class="spc-title">' + _slEsc(p.title) + '</div><div class="spc-meta">' + meta + '</div></div>' +
    '<div>' + right + '</div><div class="spc-arrow">›</div></div>';
}
function _slRenderList(list, elId, moreId, kind, emptyMsg) {
  var el = document.getElementById(elId), more = document.getElementById(moreId);
  if (!el) return;
  if (!list.length) { el.innerHTML = '<div class="empty-state">' + emptyMsg + '</div>'; if (more) more.style.display = 'none'; return; }
  var page = (typeof _projPage !== 'undefined' && _projPage[kind]) || 0;
  var size = typeof PROJ_PAGE_SIZE !== 'undefined' ? PROJ_PAGE_SIZE : 10;
  var slice = list.slice(0, (page + 1) * size);
  el.innerHTML = slice.map(function (p) { return _slProjCard(p, kind); }).join('');
  if (more) more.style.display = slice.length < list.length ? 'block' : 'none';
}
function _slSortByDue(list) {
  return list.slice().sort(function (a, b) {
    var x = (a.raw && a.raw.due_at) ? new Date(a.raw.due_at).getTime() : Infinity;
    var y = (b.raw && b.raw.due_at) ? new Date(b.raw.due_at).getTime() : Infinity;
    return x - y;
  });
}
function _slCounts() {
  var set = function (id, n) { var e = document.getElementById(id); if (e) e.textContent = n; };
  set('projPendingCount', pendingProjects.length);
  set('projSubmittedCount', submittedProjects.length);
  set('projReviewedCount', reviewedProjects.length);
  set('projBadge', pendingProjects.length);
}

function renderPendingProjects() {
  _slCounts();
  _slRenderList(_slSortByDue(pendingProjects), 'pendingProjects', 'pendingLoadMore', 'pending', '🎉 No pending assignments. Great work!');
}
function renderSubmittedProjects() {
  _slCounts();
  _slRenderList(submittedProjects, 'submittedProjects', 'submittedLoadMore', 'submitted', 'Nothing waiting for review.');
}
function renderReviewedProjects() {
  _slCounts();
  _slRenderList(reviewedProjects, 'reviewedProjects', 'reviewedLoadMore', 'reviewed', 'No reviewed projects yet.');
}

function _slFindProject(id) {
  var all = pendingProjects.concat(submittedProjects, reviewedProjects);
  for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) return all[i];
  return null;
}

/** Project detail + link submission (links only). */
function openProjectModal(id) {
  var p = _slFindProject(id);
  if (!p) return;
  var r = p.raw || {};
  var status = r.status || 'pending';
  document.getElementById('slProjOverlay') && document.getElementById('slProjOverlay').remove();
  var ov = document.createElement('div');
  ov.id = 'slProjOverlay';
  ov.className = 'modal-overlay open';
  var body =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
      (r.lesson_number ? '<span style="background:var(--blue-light);color:var(--blue);border-radius:50px;padding:3px 10px;font-size:12px;font-weight:800;">Lesson ' + r.lesson_number + '</span>' : '') +
      '<span style="background:var(--bg);border-radius:50px;padding:3px 10px;font-size:12px;font-weight:800;">' + _slEsc(p.course) + '</span>' +
      (status === 'pending' && r.due_at ? _slDueChip(r.due_at) : '') +
    '</div>' +
    '<div style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">📋 What to do</div>' +
    '<div style="white-space:pre-wrap;font-size:14px;line-height:1.7;color:var(--dark);background:var(--bg);border-radius:12px;padding:12px 14px;margin-bottom:14px;">' + _slEsc(p.brief) + '</div>' +
    (r.booking_id && r.lesson_id ? '<a href="/pages/lesson-materials.html?lessonId=' + r.lesson_id + '&bookingId=' + r.booking_id + '" target="_blank" style="display:inline-block;margin-bottom:14px;font-weight:800;color:var(--blue);font-size:13px;">📖 Review the lesson →</a>' : '');

  if (status === 'reviewed') {
    body += '<div style="background:#f0fdf4;border-radius:12px;padding:14px;">' +
      '<div style="font-weight:900;color:#065f46;font-size:15px;">⭐ Score: ' + p.score + '/100' + (r.is_late ? ' — handed in late, so <strong>' + r.points + ' points</strong>' : ' · ' + (r.points != null ? r.points : p.score) + ' points') + '</div>' +
      (p.remarks ? '<div style="margin-top:8px;color:var(--dark);">“' + _slEsc(p.remarks) + '”</div>' : '') +
      (p.submission ? '<div style="margin-top:8px;font-size:13px;">Your work: ' + _slLink(p.submission) + '</div>' : '') + '</div>';
  } else {
    var late = r.due_at && new Date(r.due_at).getTime() < Date.now();
    body +=
      (status === 'submitted' ? '<div style="background:#eef4ff;border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:13px;font-weight:800;color:#1e40af;">✅ Submitted' + (r.is_late ? ' (late)' : '') + ': ' + _slLink(p.submission) + '<br>You can still change the link until your tutor reviews it.</div>' : '') +
      (late ? '<div style="background:#fed7d7;border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:13px;font-weight:800;color:#c53030;">⚠️ The due date has passed — work handed in now earns half marks.</div>' : '') +
      '<div style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">🔗 Link to your work *</div>' +
      '<input id="slProjLink" type="url" placeholder="https://… (Scratch, Replit, Google Drive, Docs)" value="' + _slEsc(p.submission || '') + '" style="width:100%;box-sizing:border-box;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:Nunito,sans-serif;font-size:14px;margin-bottom:8px;">' +
      '<div style="font-size:11px;color:var(--light);font-weight:700;margin:-4px 0 10px;">Make sure the link is set to "anyone with the link can view".</div>' +
      '<textarea id="slProjNote" rows="2" placeholder="Note for your tutor (optional)" style="width:100%;box-sizing:border-box;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:Nunito,sans-serif;font-size:14px;resize:vertical;">' + _slEsc(r.submission_note || '') + '</textarea>' +
      '<button id="slProjBtn" onclick="submitProject()" style="margin-top:12px;width:100%;background:var(--blue);color:#fff;border:none;border-radius:12px;padding:12px;font-family:Nunito,sans-serif;font-weight:900;font-size:14px;cursor:pointer;">' + (status === 'submitted' ? 'Update my link' : 'Submit my work') + '</button>';
  }
  ov.innerHTML = '<div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto;"><div class="modal-header"><div class="modal-title">' + _slEsc(p.title) + '</div>' +
    '<button class="modal-close" onclick="closeProjectModal()">✕</button></div><div class="modal-body">' + body + '</div></div>';
  ov.addEventListener('click', function (e) { if (e.target === ov) closeProjectModal(); });
  document.body.appendChild(ov);
  activeProjectId = id;
}
function closeProjectModal() {
  var ov = document.getElementById('slProjOverlay'); if (ov) ov.remove();
  var old = document.getElementById('projectModalOverlay'); if (old) old.classList.remove('open');
  activeProjectId = null;
}

async function submitProject() {
  var p = _slFindProject(activeProjectId); if (!p) return;
  var link = (document.getElementById('slProjLink').value || '').trim();
  var note = (document.getElementById('slProjNote').value || '').trim();
  if (!/^https?:\/\/\S+\.\S+/i.test(link)) { showToast('Please paste a full link starting with https://', 'error'); return; }
  var btn = document.getElementById('slProjBtn'); btn.disabled = true; btn.textContent = '⏳ Submitting…';
  try {
    var res = await fetch(SL_API + '/api/projects/' + p.id + '/submit', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('sn_access_token') },
      body: JSON.stringify({ link: link, note: note }),
    });
    var d = await res.json();
    if (!res.ok || !d.success) throw new Error(d.error || 'Could not submit');
    var updated = Object.assign({}, p, { submission: link, raw: Object.assign({}, p.raw, d.project) });
    pendingProjects = pendingProjects.filter(function (x) { return String(x.id) !== String(p.id); });
    submittedProjects = submittedProjects.filter(function (x) { return String(x.id) !== String(p.id); });
    submittedProjects.unshift(updated);
    closeProjectModal();
    renderPendingProjects(); renderSubmittedProjects();
    showToast(d.project.is_late ? '✅ Submitted — it was late, so it can earn half marks.' : '✅ Submitted! Your tutor will review it soon.');
  } catch (e) {
    showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Submit my work';
  }
}

/* ══════════════ Quizzes ══════════════ */
function _slQuizzes() {
  return (window.QUIZ_ASSIGNMENTS || []).map(function (a) {
    return {
      id: a.quiz_id, title: a.unit_name || ('Unit ' + a.unit_number), pathway: a.pathway_name, grade: a.grade_number,
      total: a.total_questions, passScore: a.pass_score || 60, dueAt: a.due_at,
      used: a.attempts_used || 0, best: a.best_percentage != null ? Number(a.best_percentage) : null,
      points: a.points != null ? Number(a.points) : 0, passed: !!a.ever_passed,
    };
  });
}
function renderPendingQuizzes() {
  var el = document.getElementById('pendingQuizzes'); if (!el) return;
  var list = _slQuizzes().filter(function (q) { return q.used < SL_ATTEMPTS && !q.passed; });
  var badge = document.getElementById('quizBadge'); if (badge) badge.textContent = list.length;
  if (!list.length) { el.innerHTML = '<div class="empty-state">🎉 No pending quizzes. A unit quiz unlocks when you finish a unit.</div>'; return; }
  el.innerHTML = list.map(function (q) {
    return '<div class="quiz-card" onclick="openQuiz(\'' + q.id + '\')">' +
      '<div class="qc-emoji">🧠</div><div class="qc-info"><div class="qc-title">' + _slEsc(q.title) + '</div>' +
      '<div class="qc-meta">' + _slEsc(q.pathway || '—') + ' · Grade ' + (q.grade || '—') + ' · ' + (q.total || '?') + ' questions · Pass: ' + q.passScore + '% · Attempt ' + (q.used + 1) + ' of ' + SL_ATTEMPTS +
      (q.best != null ? ' · Best so far ' + q.best.toFixed(0) + '%' : '') + '</div>' +
      '<div style="margin-top:6px;">' + _slDueChip(q.dueAt) + '</div></div>' +
      '<button class="btn btn-blue" style="font-size:13px;padding:8px 18px;" onclick="event.stopPropagation();openQuiz(\'' + q.id + '\')">' + (q.used ? 'Try again →' : 'Start Quiz →') + '</button></div>';
  }).join('');
}
function renderCompletedQuizzes() {
  var el = document.getElementById('completedQuizzes'); if (!el) return;
  var list = _slQuizzes().filter(function (q) { return q.used > 0 && (q.passed || q.used >= SL_ATTEMPTS); });
  if (!list.length) { el.innerHTML = '<div class="empty-state" style="color:var(--light);">No completed quizzes yet.</div>'; return; }
  el.innerHTML = list.map(function (q) {
    var ok = q.passed;
    return '<div class="quiz-card completed-quiz"><div class="qc-emoji">' + (ok ? '🏆' : '💪') + '</div>' +
      '<div class="qc-info"><div class="qc-title">' + _slEsc(q.title) + '</div><div class="qc-meta">' + _slEsc(q.pathway || '—') + ' · Grade ' + (q.grade || '—') + ' · ' + q.used + ' attempt' + (q.used === 1 ? '' : 's') + '</div></div>' +
      '<div class="qc-score"><div class="qc-score-val" style="color:' + (ok ? '#0e9f6e' : '#e65100') + ';">' + (q.best != null ? q.best.toFixed(0) : 0) + '%</div>' +
      '<div class="qc-score-label">' + (ok ? '✅ Passed' : '❌ Not passed') + ' · ' + q.points + ' pts</div></div></div>';
  }).join('');
}

/** Open a quiz: shows attempts used, then starts the next attempt. */
async function openQuiz(quizId) {
  activeQuizId = quizId;
  var q = _slQuizzes().find(function (x) { return x.id === quizId; });
  var portal = document.getElementById('quizPortal');
  document.getElementById('quizModalTitle').textContent = '🧠 Loading quiz…';
  document.getElementById('quizModalOverlay').classList.add('open');
  if (q && (q.used >= SL_ATTEMPTS || q.passed)) {
    portal.innerHTML = '<div style="text-align:center;padding:32px 20px;"><div style="font-size:52px;">' + (q.passed ? '🏆' : '💪') + '</div>' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;margin:8px 0;">' + (q.passed ? 'You passed this quiz' : 'No attempts left') + '</div>' +
      '<div style="font-size:14px;color:var(--mid);">Best score ' + (q.best || 0).toFixed(0) + '% · ' + q.points + ' points</div>' +
      '<button class="btn btn-outline" style="margin-top:18px;" onclick="closeQuizModal()">Close</button></div>';
    document.getElementById('quizModalTitle').textContent = '🧠 ' + q.title;
    return;
  }
  portal.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">⏳ Loading quiz…</div>';
  try {
    var res = await fetch(SL_API + '/api/quizzes/' + quizId, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sn_access_token') } });
    var d = await res.json();
    if (!d.success) throw new Error(d.error || 'Could not load the quiz');
    _startQuiz(d.quiz);
    var used = q ? q.used : 0;
    document.getElementById('quizModalTitle').textContent = '🧠 ' + (d.quiz.unit_name || 'Quiz') + ' — attempt ' + (used + 1) + ' of ' + SL_ATTEMPTS;
  } catch (e) {
    portal.innerHTML = '<div style="text-align:center;padding:40px;color:#c53030;font-weight:700;">⚠️ ' + _slEsc(e.message) + '</div>';
  }
}

async function submitQuiz() {
  var unanswered = quizAnswers.filter(function (a) { return a === null; }).length;
  if (unanswered > 0) { showToast(unanswered + ' question' + (unanswered > 1 ? 's' : '') + ' still unanswered.', 'error'); return; }
  var portal = document.getElementById('quizPortal');
  portal.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">⏳ Marking your answers…</div>';
  try {
    var res = await fetch(SL_API + '/api/quizzes/' + activeQuizId + '/attempt', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sn_access_token'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: quizAnswers }),
    });
    var d = await res.json();
    if (!res.ok || !d.success) throw new Error(d.error || 'Could not save your answers');
    var r = d.result, pct = Number(r.percentage || 0);
    var emoji = r.passed ? (pct >= 90 ? '🌟' : '🏆') : '💪';
    portal.innerHTML = '<div style="text-align:center;padding:20px 16px;">' +
      '<div style="font-size:60px;">' + emoji + '</div>' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:26px;margin:6px 0;">' + (r.passed ? 'Passed!' : (r.attemptsLeft ? 'Not quite — try again' : 'Quiz finished')) + '</div>' +
      '<div style="background:var(--bg);border-radius:20px;padding:18px 24px;display:inline-block;margin:10px 0;">' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:44px;color:' + (r.passed ? '#0e9f6e' : '#e65100') + ';">' + pct.toFixed(0) + '%</div>' +
        '<div style="font-size:13px;color:var(--mid);font-weight:700;">' + r.score + ' of ' + r.total + ' correct · pass mark ' + r.passScore + '%</div>' +
        '<div style="font-size:13px;color:var(--mid);font-weight:800;margin-top:6px;">' + (r.late ? '⚠️ Late — this attempt earns ' + r.points + ' points · ' : '') + 'Best: ' + r.bestPoints + ' points</div>' +
      '</div>' +
      '<div style="font-size:13px;font-weight:800;color:var(--mid);">Attempt ' + r.attempt + ' of ' + SL_ATTEMPTS + (r.attemptsLeft ? ' · ' + r.attemptsLeft + ' left — your best score counts' : '') + '</div>' +
      '<details style="text-align:left;margin:16px 0;"><summary style="cursor:pointer;font-weight:800;color:var(--blue);font-size:14px;">📋 See your answers</summary>' +
      '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;">' +
      (r.breakdown || []).map(function (b, i) {
        var tail = b.isRight ? '✅ Correct' : ('❌ Your answer: ' + _slEsc(b.options[b.selected] || '—') + (r.answersRevealed && b.correct != null ? ' · Correct: ' + _slEsc(b.options[b.correct]) : ''));
        return '<div style="background:' + (b.isRight ? '#f0fdf4' : '#fff5f5') + ';border-radius:10px;padding:10px 14px;font-size:13px;border-left:3px solid ' + (b.isRight ? '#0e9f6e' : '#c53030') + ';">' +
          '<div style="font-weight:800;margin-bottom:4px;">' + (i + 1) + '. ' + _slEsc(b.q) + '</div><div style="font-weight:700;color:' + (b.isRight ? '#065f46' : '#c53030') + ';">' + tail + '</div></div>';
      }).join('') + '</div>' +
      (!r.answersRevealed ? '<div style="font-size:12px;color:var(--light);font-weight:700;margin-top:8px;">Correct answers are shown once you pass or use all ' + SL_ATTEMPTS + ' attempts.</div>' : '') + '</details>' +
      '<div style="display:flex;gap:10px;justify-content:center;"><button class="btn btn-outline" onclick="closeQuizModal()">Close</button>' +
      (!r.passed && r.attemptsLeft ? '<button class="btn btn-primary" onclick="openQuiz(\'' + activeQuizId + '\')">🔄 Try again</button>' : '') + '</div></div>';

    /* update local state */
    var a = (window.QUIZ_ASSIGNMENTS || []).find(function (x) { return x.quiz_id === activeQuizId; });
    if (!a) { a = { quiz_id: activeQuizId, unit_name: document.getElementById('quizModalTitle').textContent.replace('🧠 ', '').split(' — ')[0] }; (window.QUIZ_ASSIGNMENTS = window.QUIZ_ASSIGNMENTS || []).push(a); }
    a.attempts_used = r.attempt; a.best_percentage = Math.max(Number(a.best_percentage || 0), pct);
    a.points = r.bestPoints; a.ever_passed = a.ever_passed || r.passed;
    renderPendingQuizzes(); renderCompletedQuizzes();
  } catch (e) {
    showToast(e.message, 'error');
    if (typeof _renderQuestion === 'function') _renderQuestion();
  }
}

/* ══════════════ Leaderboard ══════════════ */
async function renderLeaderboard() {
  var el = document.getElementById('leaderboardBody'); if (!el) return;
  try {
    var res = await fetch(SL_API + '/api/learning/leaderboard', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sn_access_token') } });
    var d = await res.json();
    if (!d.success) throw new Error(d.error || 'Could not load');
    var me = d.me || { points: 0 };
    var medal = function (r) { return r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '#' + r; };
    el.innerHTML =
      '<div style="background:linear-gradient(135deg,#1a56db,#0e9f6e);border-radius:18px;padding:20px 24px;color:#fff;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">' +
        '<div><div style="font-size:13px;font-weight:800;opacity:.85;">Your points</div><div style="font-family:\'Fredoka One\',cursive;font-size:40px;line-height:1;">' + me.points + '</div>' +
        '<div style="font-size:12px;font-weight:700;opacity:.85;margin-top:4px;">' + (me.projects || 0) + ' projects reviewed · ' + (me.quizzes || 0) + ' quizzes taken</div></div>' +
        '<div style="text-align:right;"><div style="font-size:13px;font-weight:800;opacity:.85;">Your rank</div><div style="font-family:\'Fredoka One\',cursive;font-size:40px;line-height:1;">' + (me.rank ? medal(me.rank) : '—') + '</div>' +
        '<div style="font-size:12px;font-weight:700;opacity:.85;margin-top:4px;">' + (me.rank ? 'of ' + me.of + ' students' : 'Earn points to join the board') + '</div></div></div>' +
      '<div style="font-size:12px;font-weight:700;color:var(--light);margin-bottom:10px;">Points = project scores (out of 100 each) + best unit-quiz scores. Late work earns half.</div>' +
      (d.top.length ? '<div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;overflow:hidden;">' + d.top.map(function (r) {
        return '<div style="display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid #f1f3f8;' + (r.isMe ? 'background:#eef4ff;' : '') + '">' +
          '<div style="width:40px;font-family:\'Fredoka One\',cursive;font-size:18px;text-align:center;">' + medal(r.rank) + '</div>' +
          '<div style="flex:1;font-weight:800;">' + _slEsc(r.name) + (r.isMe ? ' <span style="color:var(--blue);">(you)</span>' : '') + '</div>' +
          '<div style="font-size:12px;color:var(--light);font-weight:700;">' + r.projects + ' proj · ' + r.quizzes + ' quiz</div>' +
          '<div style="font-family:\'Fredoka One\',cursive;font-size:20px;color:#065f46;min-width:60px;text-align:right;">' + r.points + '</div></div>';
      }).join('') + '</div>' : '<div class="empty-state">No points yet — hand in projects and pass unit quizzes to climb the board!</div>');
  } catch (e) {
    el.innerHTML = '<div style="padding:20px;color:#c53030;font-weight:700;">⚠️ ' + _slEsc(e.message) + '</div>';
  }
}

/* Leaderboard renders when its tab opens; #projects / #quizzes / #leaderboard deep links */
(function () {
  var _origShowTab = window.showTab;
  window.showTab = function (tab) {
    _origShowTab(tab);
    if (tab === 'leaderboard') renderLeaderboard();
  };
  var wanted = (location.hash || '').replace('#', '');
  if (['projects', 'quizzes', 'leaderboard'].indexOf(wanted) !== -1) {
    var tries = 0, t = setInterval(function () {
      tries++;
      if (document.querySelector('.sidebar-link.active[data-tab="overview"]') || tries > 40) {
        clearInterval(t); window.showTab(wanted);
      }
    }, 250);
  }
})();

/* "Open lesson & submit work" on the live/next class card */
(function () {
  function addLessonButton() {
    var card = document.getElementById('joinClassCard');
    if (!card || card.querySelector('.sl-lesson-btn') || typeof LESSONS === 'undefined') return;
    var now = Date.now();
    var live = LESSONS.find(function (l) { return l.pathwayLessonId && l.startsAt && l.startsAt.getTime() <= now && l.endsAt && l.endsAt.getTime() + 3600000 > now; });
    if (!live) return;
    var a = document.createElement('a');
    a.className = 'sl-lesson-btn';
    a.href = '/pages/lesson-materials.html?lessonId=' + live.pathwayLessonId + '&bookingId=' + live.id;
    a.target = '_blank';
    a.textContent = '📖 Open today\'s lesson & submit your work';
    a.style.cssText = 'display:block;margin-top:12px;text-align:center;background:#eef4ff;color:#1a56db;border:1.5px solid #1a56db;border-radius:12px;padding:10px;font-weight:900;font-size:14px;text-decoration:none;';
    card.appendChild(a);
  }
  setInterval(addLessonButton, 5000);
  document.addEventListener('DOMContentLoaded', function () { setTimeout(addLessonButton, 3000); });
})();
