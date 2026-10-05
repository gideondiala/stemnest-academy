/**
 * chat.js — Student ⇄ tutor chat (student dashboard, tutor dashboard).
 * Messages are stored on the server; new ones are picked up every 20 s.
 * Tutors get a red unread badge and a pop-up for each new message.
 * Links only (no file uploads).
 */
(function () {
  'use strict';
  var API = 'https://api.stemnestacademy.co.uk/api/chat';
  var POLL_MS = 20000;
  /* Pages are served with or without ".html" (/pages/tutor-dashboard) */
  var isTutor = /tutor-dashboard(\.html)?$/.test(location.pathname);
  var isStudent = /student-dashboard(\.html)?$/.test(location.pathname);
  if (!isTutor && !isStudent) return;

  var st = { threads: [], current: null, since: new Date().toISOString(), poll: null, firstCheck: true };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function linkify(s) { return esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;word-break:break-all;">$1</a>'); }
  function tok() { return localStorage.getItem('sn_access_token'); }
  async function api(path, method, body) {
    var r = await fetch(API + path, { method: method || 'GET', headers: { 'Authorization': 'Bearer ' + tok(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok || d.success === false) throw new Error(d.error || 'Request failed');
    return d;
  }
  function when(ts) {
    var d = new Date(ts), now = new Date();
    var t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? t : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' + t;
  }
  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type || 'success'); }

  /* ══════════════ Layout ══════════════ */
  function ensureTutorTab() {
    if (document.getElementById('tab-messages')) return;
    var nav = document.querySelector('.sidebar-link[data-tab="projects"]');
    if (nav) {
      var a = document.createElement('a');
      a.className = 'sidebar-link'; a.dataset.tab = 'messages';
      a.innerHTML = '<span class="sl-icon">💬</span> Messages <span class="sl-badge" id="chatNavBadge" style="display:none;background:#e53e3e;color:#fff;">0</span>';
      a.onclick = function () { showDashTab('messages'); };
      nav.parentNode.insertBefore(a, nav);
    }
    var main = document.getElementById('tab-overview');
    var tab = document.createElement('div');
    tab.id = 'tab-messages'; tab.style.display = 'none';
    tab.innerHTML = '<div class="dash-section-header"><div class="dash-section-title">💬 Messages</div>' +
      '<span style="font-size:12px;font-weight:700;color:var(--light);">Students (and their parents) can message you here. Admins can read conversations for safeguarding.</span></div><div id="chatRoot"></div>';
    if (main && main.parentNode) main.parentNode.insertBefore(tab, main.nextSibling);
    /* Make showDashTab aware of the new tab */
    var orig = window.showDashTab;
    window.showDashTab = function (t) {
      if (t === 'messages') {
        document.querySelectorAll('[id^="tab-"]').forEach(function (el) { el.style.display = 'none'; });
        tab.style.display = 'block';
        document.querySelectorAll('.sidebar-link[data-tab]').forEach(function (l) { l.classList.toggle('active', l.dataset.tab === 'messages'); });
        var qa = document.getElementById('quickActions'); if (qa) qa.style.display = 'none';
        openInbox();
        return;
      }
      tab.style.display = 'none';
      orig(t);
    };
  }

  function ensureStudentTab() {
    var tab = document.getElementById('tab-chat');
    if (!tab) return;
    tab.innerHTML = '<div class="dash-section-header"><div class="dash-section-title">💬 Chat with Your Tutor</div>' +
      '<span style="font-size:12px;font-weight:700;color:var(--light);">Your messages show your name. Parents on a family login can chat here too.</span></div><div id="chatRoot"></div>';
    var nav = document.querySelector('.sidebar-link[data-tab="chat"]');
    if (nav && !document.getElementById('chatNavBadge')) {
      nav.insertAdjacentHTML('beforeend', ' <span class="sl-badge" id="chatNavBadge" style="display:none;background:#e53e3e;color:#fff;">0</span>');
    }
    if (st.tabWrapped) return;
    st.tabWrapped = true;
    var orig = window.showTab;
    window.showTab = function (t) { orig(t); if (t === 'chat') openInbox(); };
  }

  function renderShell() {
    var root = document.getElementById('chatRoot'); if (!root) return;
    root.innerHTML =
      '<div style="display:grid;grid-template-columns:260px 1fr;gap:14px;min-height:460px;" class="chat-grid">' +
        '<div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;overflow:hidden;">' +
          '<div style="padding:12px 14px;font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #f1f3f8;">' + (isTutor ? 'Your students' : 'Your tutors') + '</div>' +
          '<div id="chatThreads" style="max-height:520px;overflow-y:auto;"></div></div>' +
        '<div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;display:flex;flex-direction:column;min-height:460px;">' +
          '<div id="chatHead" style="padding:12px 16px;border-bottom:1px solid #f1f3f8;font-weight:900;color:var(--dark);">Choose a conversation</div>' +
          '<div id="chatBody" style="flex:1;overflow-y:auto;padding:14px 16px;max-height:440px;background:#fafbff;"></div>' +
          '<div id="chatForm" style="display:none;border-top:1px solid #f1f3f8;padding:10px 12px;">' +
            '<div style="display:flex;gap:8px;">' +
              '<textarea id="chatText" rows="2" placeholder="Type a message…" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:Nunito,sans-serif;font-size:14px;resize:none;outline:none;"></textarea>' +
              '<button id="chatSend" style="background:var(--blue);color:#fff;border:none;border-radius:12px;padding:0 18px;font-family:Nunito,sans-serif;font-weight:900;font-size:14px;cursor:pointer;">Send</button>' +
            '</div>' +
            '<input id="chatLink" type="url" placeholder="🔗 Add a link (optional) — e.g. your Scratch or Google Drive work" style="margin-top:6px;width:100%;box-sizing:border-box;padding:8px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:Nunito,sans-serif;font-size:13px;outline:none;">' +
          '</div></div></div>' +
      '<style>@media(max-width:760px){.chat-grid{grid-template-columns:1fr!important;}}</style>';
    document.getElementById('chatSend').onclick = send;
    document.getElementById('chatText').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  }

  /* ══════════════ Threads & messages ══════════════ */
  async function openInbox() {
    /* Older dashboard code may have replaced the chat area — put it back */
    if (!document.getElementById('chatRoot') && isStudent) ensureStudentTab();
    if (!document.getElementById('chatThreads')) renderShell();
    if (!document.getElementById('chatThreads')) return;
    try {
      var d = await api('/threads');
      st.threads = d.threads;
      renderThreads();
      if (!st.current && st.threads.length === 1) openThread(st.threads[0].id);
      else if (st.current) openThread(st.current, true);
    } catch (e) {
      document.getElementById('chatThreads').innerHTML = '<div style="padding:14px;color:#c53030;font-weight:700;font-size:13px;">' + esc(e.message) + '</div>';
    }
  }

  function renderThreads() {
    var el = document.getElementById('chatThreads'); if (!el) return;
    if (!st.threads.length) {
      el.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--light);font-weight:700;">' + (isTutor ? 'Students you teach appear here.' : 'Your tutor appears here once your classes are scheduled.') + '</div>';
      return;
    }
    el.innerHTML = st.threads.map(function (t) {
      var on = st.current === t.id;
      return '<div data-id="' + t.id + '" style="cursor:pointer;padding:12px 14px;border-bottom:1px solid #f1f3f8;' + (on ? 'background:var(--blue-light);' : '') + '">' +
        '<div style="display:flex;justify-content:space-between;gap:6px;align-items:center;"><span style="font-weight:900;font-size:14px;color:var(--dark);">' + esc(t.name) + '</span>' +
        (t.unread ? '<span style="background:#e53e3e;color:#fff;border-radius:50px;padding:1px 8px;font-size:11px;font-weight:900;">' + t.unread + '</span>' : '') + '</div>' +
        '<div style="font-size:12px;color:var(--light);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (t.staffId ? esc(t.staffId) + ' · ' : '') + (t.lastText ? esc(t.lastText) : 'No messages yet') + '</div></div>';
    }).join('');
    el.querySelectorAll('[data-id]').forEach(function (row) { row.onclick = function () { openThread(row.getAttribute('data-id')); }; });
  }

  async function openThread(otherId, quiet) {
    st.current = otherId;
    if (!document.getElementById('chatHead')) return;
    var t = st.threads.find(function (x) { return x.id === otherId; }) || {};
    document.getElementById('chatHead').innerHTML = esc(t.name || '') + (t.staffId ? ' <span style="color:var(--light);font-weight:700;font-size:12px;">' + esc(t.staffId) + '</span>' : '');
    document.getElementById('chatForm').style.display = 'block';
    var body = document.getElementById('chatBody');
    if (!quiet) body.innerHTML = '<div style="color:var(--light);font-weight:700;">⏳ Loading…</div>';
    try {
      var q = isTutor ? '?studentId=' + otherId : '?tutorId=' + otherId;
      var d = await api('/messages' + q);
      var atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
      body.innerHTML = d.messages.length ? d.messages.map(bubble).join('') : '<div style="color:var(--light);font-weight:700;font-size:13px;text-align:center;margin-top:40px;">Say hello 👋</div>';
      if (!quiet || atBottom) body.scrollTop = body.scrollHeight;
      if (t.unread) { t.unread = 0; renderThreads(); refreshBadge(); }
      else renderThreads();
    } catch (e) { body.innerHTML = '<div style="color:#c53030;font-weight:700;">' + esc(e.message) + '</div>'; }
  }

  function bubble(m) {
    var mine = isTutor ? m.senderRole === 'tutor' : m.senderRole !== 'tutor';
    var who = m.senderRole === 'parent' ? (m.senderName || 'Parent') + ' (parent)' : (m.senderName || '');
    var seen = mine ? (isTutor ? m.readByStudentAt : m.readByTutorAt) : null;
    return '<div style="display:flex;justify-content:' + (mine ? 'flex-end' : 'flex-start') + ';margin-bottom:10px;">' +
      '<div style="max-width:78%;background:' + (mine ? 'var(--blue)' : '#fff') + ';color:' + (mine ? '#fff' : 'var(--dark)') + ';border:' + (mine ? 'none' : '1.5px solid #e8eaf0') + ';border-radius:14px;padding:9px 12px;font-size:14px;line-height:1.5;">' +
        (!mine || m.senderRole === 'parent' ? '<div style="font-size:11px;font-weight:900;opacity:.75;margin-bottom:2px;">' + esc(who) + '</div>' : '') +
        (m.body ? '<div style="white-space:pre-wrap;">' + linkify(m.body) + '</div>' : '') +
        (m.link ? '<div style="margin-top:4px;">🔗 ' + linkify(m.link) + '</div>' : '') +
        '<div style="font-size:10px;opacity:.7;margin-top:3px;text-align:right;">' + when(m.createdAt) + (mine ? (seen ? ' · ✓✓ Seen' : ' · ✓ Sent') : '') + '</div>' +
      '</div></div>';
  }

  async function send() {
    if (!st.current) return;
    var text = document.getElementById('chatText'), link = document.getElementById('chatLink');
    var body = text.value.trim(), url = link.value.trim();
    if (!body && !url) return;
    if (url && !/^https?:\/\/\S+\.\S+/i.test(url)) { toast('Links must start with https://', 'error'); return; }
    var btn = document.getElementById('chatSend'); btn.disabled = true;
    try {
      var payload = isTutor ? { studentId: st.current, body: body, link: url } : { tutorId: st.current, body: body, link: url };
      await api('/messages', 'POST', payload);
      text.value = ''; link.value = '';
      await openThread(st.current, true);
      document.getElementById('chatBody').scrollTop = 1e9;
    } catch (e) { toast(e.message, 'error'); }
    finally { btn.disabled = false; text.focus(); }
  }

  /* ══════════════ Unread badge + pop-ups ══════════════ */
  function refreshBadge(n) {
    var b = document.getElementById('chatNavBadge'); if (!b) return;
    if (typeof n === 'number') b.dataset.n = n;
    var c = Number(b.dataset.n || 0);
    b.textContent = c; b.style.display = c > 0 ? 'inline-block' : 'none';
  }

  function popup(m) {
    var wrap = document.getElementById('chatPopups');
    if (!wrap) {
      wrap = document.createElement('div'); wrap.id = 'chatPopups';
      wrap.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9800;display:flex;flex-direction:column;gap:10px;max-width:340px;';
      document.body.appendChild(wrap);
    }
    var from = isTutor ? (m.senderRole === 'parent' ? (m.senderName || 'Parent') + ' (parent of ' + m.studentName + ')' : m.studentName + (m.studentStaffId ? ' (' + m.studentStaffId + ')' : '')) : m.tutorName;
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-left:5px solid var(--blue);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:12px 14px;font-family:Nunito,sans-serif;cursor:pointer;animation:slideIn .3s ease;';
    card.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px;"><div style="font-weight:900;font-size:13px;color:var(--dark);">💬 New message from ' + esc(from) + '</div>' +
      '<span data-x style="color:var(--light);font-weight:900;cursor:pointer;">✕</span></div>' +
      '<div style="font-size:13px;color:var(--mid);font-weight:700;margin-top:4px;">' + esc(m.preview || '') + '</div>' +
      '<div style="font-size:12px;color:var(--blue);font-weight:900;margin-top:6px;">Open conversation →</div>';
    card.onclick = function (e) {
      card.remove();
      if (e.target && e.target.hasAttribute('data-x')) return;
      st.current = isTutor ? m.studentId : m.tutorId;
      if (isTutor) showDashTab('messages'); else showTab('chat');
    };
    wrap.appendChild(card);
    setTimeout(function () { card.remove(); }, 15000);
  }

  async function check() {
    try {
      var d = await api('/unread?since=' + encodeURIComponent(st.since));
      st.since = d.now || new Date().toISOString();
      refreshBadge(d.unread);
      var viewingOpen = st.current && document.getElementById('chatBody') && (isTutor ? document.getElementById('tab-messages').style.display !== 'none' : document.getElementById('tab-chat').style.display !== 'none');
      if (st.firstCheck && d.unread > 0 && isTutor) {
        popup({ studentName: 'your students', preview: 'You have ' + d.unread + ' unread message' + (d.unread === 1 ? '' : 's') + '.', studentId: null });
      }
      st.firstCheck = false;
      (d.recent || []).forEach(function (m) {
        var otherId = isTutor ? m.studentId : m.tutorId;
        if (viewingOpen && otherId === st.current) return;
        popup(m);
      });
      if (viewingOpen) openThread(st.current, true);
      else if (d.recent && d.recent.length && document.getElementById('chatThreads')) openInbox();
    } catch (e) { /* offline — try again next time */ }
  }

  function start() {
    if (!tok()) return;
    if (isTutor) ensureTutorTab(); else ensureStudentTab();
    var style = document.createElement('style');
    style.textContent = '@keyframes slideIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}';
    document.head.appendChild(style);
    /* first check looks back a day so a just-logged-in tutor sees what came in */
    st.since = new Date(Date.now() - 60000).toISOString();
    check();
    st.poll = setInterval(check, POLL_MS);
    if (location.hash === '#messages' && isTutor) setTimeout(function () { showDashTab('messages'); }, 1500);
    if (location.hash === '#chat' && isStudent) setTimeout(function () { showTab('chat'); }, 2500);
  }

  /* Replace the old browser-only chat helpers */
  window.sendChatMessage = function () { send(); };
  window.handleChatFileUpload = function () { toast('Please share a link instead of a file.', 'info'); };
  window.loadChatMessages = function () { openInbox(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 800); });
  else setTimeout(start, 800);
})();
