/* StemNest Learning Hub — search, copy buttons, study time for logged-in students. */
(function () {
  'use strict';

  /* ── Search (index loaded on first use) ── */
  var q = document.getElementById('q'), box = document.getElementById('results'), index = null;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() {
    if (index) return Promise.resolve(index);
    return fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (d) { index = d; return d; });
  }
  function score(item, terms) {
    var s = 0, t = item.t.toLowerCase(), rest = (item.d + ' ' + item.k + ' ' + item.c + ' ' + item.h).toLowerCase();
    for (var i = 0; i < terms.length; i++) {
      var w = terms[i];
      if (t.indexOf(w) >= 0) s += 5;
      else if (rest.indexOf(w) >= 0) s += 2;
      else return 0;
    }
    return s;
  }
  function run() {
    var v = q.value.trim().toLowerCase();
    if (v.length < 2) { box.hidden = true; return; }
    load().then(function (items) {
      var terms = v.split(/\s+/).filter(Boolean);
      var hits = items.map(function (it) { return { it: it, s: score(it, terms) }; })
        .filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 8);
      box.innerHTML = hits.length
        ? hits.map(function (h) { return '<a href="' + h.it.u + '"><strong>' + esc(h.it.t) + '</strong><span>' + esc(h.it.c) + ' · ' + esc(h.it.d) + '</span></a>'; }).join('')
        : '<div class="none">No guides found for "' + esc(q.value) + '" yet. Try another word.</div>';
      box.hidden = false;
    }).catch(function () {});
  }
  if (q && box) {
    var timer;
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 120); });
    q.addEventListener('focus', function () { load(); if (q.value.trim().length >= 2) run(); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { box.hidden = true; q.blur(); }
      if (e.key === 'Enter') { var first = box.querySelector('a'); if (first) location.href = first.href; }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search')) box.hidden = true; });
  }

  /* ── Cookie consent (Google Consent Mode) ──
     Analytics cookies stay off until the visitor accepts. The choice is
     remembered; "Cookie settings" in the footer reopens the banner. */
  function setConsent(v) {
    try { localStorage.setItem('sn_consent', v); } catch (e) {}
    if (typeof gtag === 'function') gtag('consent', 'update', { analytics_storage: v });
    var b = document.getElementById('consent'); if (b) b.remove();
  }
  function showConsent() {
    if (document.getElementById('consent')) return;
    var b = document.createElement('div');
    b.id = 'consent'; b.className = 'consent'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie choices');
    b.innerHTML = '<p>We use cookies to count visits and see which guides help most. Is that OK? <a href="/privacy/">Privacy policy</a></p>' +
      '<div class="actions"><button type="button" class="reject">No thanks</button><button type="button" class="accept">Accept</button></div>';
    b.querySelector('.accept').onclick = function () { setConsent('granted'); };
    b.querySelector('.reject').onclick = function () { setConsent('denied'); };
    document.body.appendChild(b);
  }
  var stored = null; try { stored = localStorage.getItem('sn_consent'); } catch (e) {}
  if (!stored) showConsent();
  var cs = document.getElementById('cookie-settings'); if (cs) cs.onclick = showConsent;

  /* ── Comments ──
     Approved comments load from the StemNest API, five at a time.
     New comments are checked by our team before they appear. */
  var cbox = document.getElementById('comments');
  if (cbox && cbox.dataset.slug) {
    var API = (window.SN_API || 'https://api.stemnestacademy.co.uk') + '/api/blog-comments';
    var slug = cbox.dataset.slug, shown = 0, total = 0, opened = Date.now();
    var fmt = function (d) { try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
    var initials = function (n) { return String(n).trim().split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); };
    var one = function (c, isReply) {
      return '<div class="' + (isReply ? 'reply' : 'comment') + '">' +
        '<div class="comment-head">' + (isReply ? '' : '<span class="avatar avatar-text" style="width:36px;height:36px;font-size:14px">' + esc(initials(c.name)) + '</span>') +
        '<span class="comment-name">' + esc(c.name) + '</span>' + (c.isStaff ? '<span class="badge">Author</span>' : '') +
        '<span class="comment-date">' + esc(fmt(c.createdAt)) + '</span></div>' +
        '<div class="comment-body">' + esc(c.body) + '</div>' +
        (c.replies || []).map(function (r) { return one(r, true); }).join('') + '</div>';
    };
    cbox.innerHTML =
      '<h2 id="comments-title">Comments</h2>' +
      '<form class="comment-form" novalidate>' +
        '<label for="c-name">Your name</label><input id="c-name" name="name" maxlength="40" autocomplete="given-name" placeholder="First name is enough" required>' +
        '<label for="c-body">Your comment or question</label><textarea id="c-body" name="body" maxlength="1500" required placeholder="What did you build? Did anything not work? Ask away!"></textarea>' +
        '<div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<p class="hint">Please don\'t share personal details such as your full name, school, address or phone number. Comments appear after a quick check by our team.</p>' +
        '<div class="row"><p class="form-msg" role="status"></p><button type="submit">Post comment</button></div>' +
      '</form>' +
      '<div class="comment-list"></div>';
    var listEl = cbox.querySelector('.comment-list'), title = cbox.querySelector('#comments-title');
    var load = function () {
      return fetch(API + '?slug=' + encodeURIComponent(slug) + '&offset=' + shown + '&limit=' + (shown ? 10 : 5))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.success) return;
          total = d.total; shown += d.comments.length;
          title.textContent = total ? 'Comments (' + total + ')' : 'Comments';
          var more = listEl.querySelector('.more-comments'); if (more) more.remove();
          if (!total) { listEl.innerHTML = '<p class="empty">No comments yet. Be the first to share what you made!</p>'; return; }
          listEl.insertAdjacentHTML('beforeend', d.comments.map(function (c) { return one(c, false); }).join(''));
          if (shown < total) {
            listEl.insertAdjacentHTML('beforeend', '<button type="button" class="more-comments">See more comments (' + (total - shown) + ')</button>');
            listEl.querySelector('.more-comments').onclick = function () { this.disabled = true; this.textContent = 'Loading…'; load(); };
          }
        }).catch(function () {});
    };
    var form = cbox.querySelector('form'), msg = cbox.querySelector('.form-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var fName = form.querySelector('#c-name'), fBody = form.querySelector('#c-body'), fHp = form.querySelector('input[name=website]');
      var name = fName.value.trim(), body = fBody.value.trim();
      msg.className = 'form-msg';
      if (name.length < 2) { msg.textContent = 'Please add your first name.'; msg.className = 'form-msg err'; return; }
      if (body.length < 3) { msg.textContent = 'Please write a comment.'; msg.className = 'form-msg err'; return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, name: name, body: body, website: fHp.value, elapsed: Date.now() - opened }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (!x.ok || !x.d.success) throw new Error((x.d && x.d.error) || 'Something went wrong. Please try again.');
          fBody.value = '';
          msg.textContent = 'Thanks! Your comment will appear once our team has checked it.'; msg.className = 'form-msg ok';
        })
        .catch(function (err) { msg.textContent = err.message; msg.className = 'form-msg err'; })
        .then(function () { btn.disabled = false; btn.textContent = 'Post comment'; });
    });
    /* Load comments when the reader gets near the end of the article */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '600px' });
      io.observe(cbox);
    } else load();
  }

  /* ── Copy buttons on code blocks ── */
  document.querySelectorAll('.code .copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var code = btn.closest('.code').querySelector('code').innerText;
      var done = function () { btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = 'Copy'; }, 1600); };
      var fallback = function () {   /* older browsers, or clipboard access blocked */
        var t = document.createElement('textarea'); t.value = code; t.setAttribute('readonly', '');
        t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;'; document.body.appendChild(t); t.select();
        try { if (document.execCommand('copy')) done(); else btn.textContent = 'Select and copy'; } catch (e) { btn.textContent = 'Select and copy'; }
        t.remove();
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(code).then(done).catch(fallback);
      else fallback();
    });
  });

  /* ── Study time ──
     A StemNest student who is logged in on stemnestacademy.co.uk gets their
     reading time here added to their progress report. A small hidden page
     from the main site (same site, so it can see the student's login) does
     the saving; this page only says "another minute of active reading".
     Visitors who are not logged-in students are ignored. */
  if (/^learn\.stemnestacademy\.co\.uk$/.test(location.hostname) && document.querySelector('.prose')) {
    var BRIDGE = 'https://stemnestacademy.co.uk/pages/study-bridge';
    var frame = null, active = Date.now(), pending = 0;
    ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(function (e) {
      window.addEventListener(e, function () { active = Date.now(); }, { passive: true });
    });
    function send() {
      if (pending < 15) return;
      if (!frame) {
        frame = document.createElement('iframe');
        frame.src = BRIDGE; frame.title = 'study time'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
        frame.style.cssText = 'position:absolute;width:1px;height:1px;border:0;left:-9999px;';
        document.body.appendChild(frame);
        frame.addEventListener('load', function () { send(); });
        return;
      }
      try { frame.contentWindow.postMessage({ type: 'sn-study', seconds: pending, page: location.pathname }, 'https://stemnestacademy.co.uk'); pending = 0; } catch (e) {}
    }
    setInterval(function () {
      if (document.visibilityState === 'visible' && Date.now() - active < 120000) pending += 15;
      if (pending >= 60) send();
    }, 15000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') send(); });
  }
})();
