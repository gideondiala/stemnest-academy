/* ═══════════════════════════════════════════════════════
   admin-blog-comments.js — Admin → Blog → 💬 Comments.
   Comments on learn.stemnestacademy.co.uk wait here until approved.
   Moderators can approve, hide, delete, or reply as the author (a reply
   is published straight away with an "Author" badge and also approves
   the comment it answers).
═══════════════════════════════════════════════════════ */
(function () {
  var API = 'https://api.stemnestacademy.co.uk/api/blog-comments';
  var LEARN = 'https://learn.stemnestacademy.co.uk/';
  var status = 'pending', items = [], counts = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tok() { return localStorage.getItem('sn_access_token'); }
  function when(d) { try { return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }
  async function call(path, opts) {
    var r = await fetch(API + path, Object.assign({ headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json' } }, opts || {}));
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok || !d.success) throw new Error(d.error || 'Request failed');
    return d;
  }

  function ensureTab() {
    if (document.getElementById('tab-blog-comments')) return;
    var after = document.querySelector('.sidebar-link[data-tab="blog-new"]');
    if (after) {
      var a = document.createElement('a');
      a.className = 'sidebar-link'; a.dataset.tab = 'blog-comments';
      a.innerHTML = '<span class="sl-icon">💬</span> Comments <span class="sl-badge" id="blogCommentsBadge" style="display:none">0</span>';
      a.onclick = function () { showAdminTab('blog-comments'); };
      after.parentNode.insertBefore(a, after.nextSibling);
    }
    var host = document.querySelector('.dash-main') || document.querySelector('main') || document.body;
    var tab = document.createElement('div');
    tab.id = 'tab-blog-comments'; tab.style.display = 'none';
    host.appendChild(tab);
    if (typeof ADMIN_TABS !== 'undefined' && ADMIN_TABS.indexOf('blog-comments') < 0) ADMIN_TABS.push('blog-comments');
    var prev = window.showAdminTab;
    window.showAdminTab = function (t) {
      if (typeof ADMIN_TABS !== 'undefined' && ADMIN_TABS.indexOf('blog-comments') < 0) ADMIN_TABS.push('blog-comments');
      prev(t);
      var el = document.getElementById('tab-blog-comments');
      if (el) el.style.display = t === 'blog-comments' ? 'block' : 'none';
      if (t === 'blog-comments') load();
    };
  }

  async function load() {
    var tab = document.getElementById('tab-blog-comments');
    if (tab && !items.length) tab.innerHTML = '<div style="padding:30px;color:var(--light);font-weight:800;">Loading comments…</div>';
    try {
      var d = await call('/moderation?status=' + status);
      items = d.comments || []; counts = d.counts || {};
      badge();
      render();
    } catch (e) { if (tab) tab.innerHTML = '<div style="padding:30px;color:#c53030;font-weight:800;">⚠️ ' + esc(e.message) + '</div>'; }
  }
  function badge() {
    var b = document.getElementById('blogCommentsBadge');
    if (b) { var n = counts.pending || 0; b.textContent = n; b.style.display = n ? '' : 'none'; }
  }

  function render() {
    var tab = document.getElementById('tab-blog-comments'); if (!tab) return;
    var tabs = ['pending', 'approved', 'hidden'].map(function (s) {
      var label = { pending: '⏳ Waiting', approved: '✅ Published', hidden: '🙈 Hidden' }[s];
      return '<button type="button" data-s="' + s + '" style="border:2px solid ' + (s === status ? 'var(--blue)' : '#e8eaf0') + ';background:' + (s === status ? 'var(--blue)' : '#fff') + ';color:' + (s === status ? '#fff' : 'var(--dark)') + ';border-radius:50px;padding:8px 16px;font-family:Nunito,sans-serif;font-weight:800;cursor:pointer;">' + label + ' (' + (counts[s] || 0) + ')</button>';
    }).join('');
    tab.innerHTML =
      '<div class="dash-section-header"><div class="dash-section-title">💬 Learning Hub comments</div>' +
        '<button class="btn btn-outline" style="font-size:13px;" id="bcRefresh">↻ Refresh</button></div>' +
      '<div style="background:#eff6ff;border-left:4px solid var(--blue);border-radius:12px;padding:12px 16px;font-size:13px;color:#334155;font-weight:600;margin-bottom:16px;max-width:820px;">' +
        'Comments only appear on the site after you approve them. Hide anything with personal details (full names, schools, phone numbers), unkind words or spam. Replying approves the comment and publishes your reply with an <b>Author</b> badge.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' + tabs + '</div>' +
      (items.length ? items.map(card).join('') : '<div style="padding:30px;background:#fff;border-radius:16px;color:var(--light);font-weight:800;text-align:center;">Nothing here right now.</div>');
    tab.querySelectorAll('[data-s]').forEach(function (b) { b.onclick = function () { status = b.dataset.s; items = []; load(); }; });
    document.getElementById('bcRefresh').onclick = function () { load(); };
    tab.querySelectorAll('[data-act]').forEach(function (b) { b.onclick = function () { act(b.dataset.id, b.dataset.act, b); }; });
  }

  function card(c) {
    var btn = function (act, label, bg, fg) { return '<button type="button" data-act="' + act + '" data-id="' + c.id + '" style="background:' + bg + ';color:' + fg + ';border:0;border-radius:50px;padding:7px 14px;font-family:Nunito,sans-serif;font-weight:800;font-size:13px;cursor:pointer;">' + label + '</button>'; };
    return '<div style="background:#fff;border:1.5px solid #e8eaf0;border-radius:16px;padding:16px 18px;margin-bottom:12px;max-width:820px;">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--light);font-weight:700;">' +
        '<span><b style="color:var(--dark);font-size:15px;">' + esc(c.name) + '</b> on <a href="' + LEARN + esc(c.post_slug) + '/#comments" target="_blank" rel="noopener">' + esc(c.post_slug) + '</a></span><span>' + esc(when(c.created_at)) + '</span></div>' +
      '<div style="white-space:pre-wrap;margin:8px 0 10px;font-size:15px;overflow-wrap:anywhere;">' + esc(c.body) + '</div>' +
      (c.replies || []).map(function (r) { return '<div style="background:#eff6ff;border-radius:10px;padding:10px 12px;margin:6px 0;font-size:14px;"><b>' + esc(r.name) + '</b> <span style="font-size:11px;background:var(--blue);color:#fff;border-radius:50px;padding:1px 7px;">Author</span><div style="white-space:pre-wrap;margin-top:4px;">' + esc(r.body) + '</div></div>'; }).join('') +
      '<textarea id="rep-' + c.id + '" placeholder="Write a reply as the author (optional)…" style="width:100%;box-sizing:border-box;min-height:64px;border:2px solid #e8eaf0;border-radius:12px;padding:10px;font-family:Nunito,sans-serif;font-size:14px;margin:6px 0 10px;"></textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        (c.status !== 'approved' ? btn('approve', '✅ Approve', '#dcfce7', '#166534') : '') +
        btn('reply', '💬 Reply & publish', 'var(--blue)', '#fff') +
        (c.status !== 'hidden' ? btn('hide', '🙈 Hide', '#fef3c7', '#92400e') : '') +
        btn('delete', '🗑 Delete', '#fee2e2', '#b91c1c') +
      '</div></div>';
  }

  async function act(id, what, b) {
    try {
      b.disabled = true;
      if (what === 'approve') await call('/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status: 'approved' }) });
      if (what === 'hide') await call('/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status: 'hidden' }) });
      if (what === 'delete') { if (!confirm('Delete this comment for good?')) { b.disabled = false; return; } await call('/' + id, { method: 'DELETE' }); }
      if (what === 'reply') {
        var body = (document.getElementById('rep-' + id).value || '').trim();
        if (!body) { toast('Write your reply first.', 'warning'); b.disabled = false; return; }
        await call('/' + id + '/reply', { method: 'POST', body: JSON.stringify({ body: body }) });
      }
      toast({ approve: '✅ Comment published', hide: '🙈 Comment hidden', delete: '🗑 Comment deleted', reply: '💬 Reply published' }[what], 'success');
      load();
    } catch (e) { b.disabled = false; toast('⚠️ ' + e.message, 'error'); }
  }

  function start() {
    ensureTab();
    call('/moderation?status=pending').then(function (d) { counts = d.counts || {}; badge(); }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 500); });
  else setTimeout(start, 500);
})();
