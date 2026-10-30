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

  /* ── Challenges ──
     Saved only in this browser, and only after the reader starts a challenge
     or marks a step as finished. Nothing here is ever sent to us. */
  var CH_KEY = 'sn_challenges';
  function chLoad() { try { return JSON.parse(localStorage.getItem(CH_KEY)) || {}; } catch (e) { return {}; } }
  function chSave(d) { try { localStorage.setItem(CH_KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }
  function chCanSave() { try { localStorage.setItem(CH_KEY + '_t', '1'); localStorage.removeItem(CH_KEY + '_t'); return true; } catch (e) { return false; } }
  function chStart(d, id, title, total) {
    if (!d[id]) d[id] = { title: title, total: total, done: [] };
    d[id].at = Date.now();
    return d[id];
  }

  /* Challenge page: progress bar, start button and a tick for each step */
  var chPage = document.querySelector('.ch-page');
  if (chPage && chCanSave()) {
    var chId = chPage.dataset.challenge, chTotal = Number(chPage.dataset.total);
    var chStartBtn = chPage.querySelector('.ch-start'), chResetBtn = chPage.querySelector('.ch-reset');
    var chBar = chPage.querySelector('.ch-bar'), chText = chPage.querySelector('.ch-progress-text');
    var chSteps = Array.prototype.slice.call(chPage.querySelectorAll('.ch-step'));
    var chDraw = function () {
      var st = chLoad()[chId], started = !!st, done = started ? st.done : [];
      chStartBtn.hidden = started; chBar.hidden = !started; chResetBtn.hidden = !started;
      chBar.firstElementChild.style.width = Math.round(done.length / chTotal * 100) + '%';
      chText.textContent = !started ? '' : done.length >= chTotal
        ? 'You finished the whole challenge. Amazing work! 🎉' : done.length + ' of ' + chTotal + ' steps finished';
      var marked = false;
      chSteps.forEach(function (li) {
        var isDone = done.indexOf(li.dataset.post) >= 0, tick = li.querySelector('.ch-tick');
        tick.hidden = !started;
        tick.textContent = isDone ? 'Finished ✓' : 'Mark as finished';
        tick.setAttribute('aria-pressed', isDone ? 'true' : 'false');
        li.classList.toggle('done', isDone);
        li.classList.toggle('now', started && !isDone && !marked);
        if (!isDone) marked = true;
      });
    };
    chStartBtn.onclick = function () { var d = chLoad(); chStart(d, chId, chPage.dataset.title, chTotal); chSave(d); chDraw(); };
    chResetBtn.onclick = function () { var d = chLoad(); delete d[chId]; chSave(d); chDraw(); };
    chSteps.forEach(function (li) {
      li.querySelector('.ch-tick').onclick = function () {
        var d = chLoad(), st = chStart(d, chId, chPage.dataset.title, chTotal), i = st.done.indexOf(li.dataset.post);
        if (i >= 0) st.done.splice(i, 1); else st.done.push(li.dataset.post);
        chSave(d); chDraw();
      };
    });
    chDraw();
  }

  /* Article in a challenge: the finish button, and remembering the section reached */
  var chBox = document.querySelector('.ch-mission');
  if (chBox && chCanSave()) {
    var cId = chBox.dataset.challenge, cPost = chBox.dataset.post, cFin = chBox.querySelector('.ch-finish');
    var cDraw = function () {
      var st = chLoad()[cId], isDone = !!st && st.done.indexOf(cPost) >= 0;
      cFin.hidden = false; cFin.disabled = isDone; cFin.textContent = isDone ? 'Finished ✓' : 'I finished this step';
    };
    cFin.onclick = function () {
      var d = chLoad(), st = chStart(d, cId, chBox.dataset.title, Number(chBox.dataset.total));
      if (st.done.indexOf(cPost) < 0) st.done.push(cPost);
      delete st.place; chSave(d); cDraw();
    };
    cDraw();
    var cHeads = Array.prototype.slice.call(document.querySelectorAll('.prose h2[id]')), cWait = false, cLast = null;
    var cMark = function () {
      cWait = false;
      var d = chLoad(), st = d[cId], cur = null;
      if (!st || st.done.indexOf(cPost) >= 0) return;   /* only for a challenge the reader started */
      cHeads.forEach(function (h) { if (h.getBoundingClientRect().top < window.innerHeight * 0.4) cur = h; });
      if (!cur || cur.id === cLast) return;
      cLast = cur.id;
      st.place = { url: location.pathname + '#' + cur.id, section: cur.textContent, article: document.querySelector('h1').textContent };
      st.at = Date.now(); chSave(d);
    };
    window.addEventListener('scroll', function () { if (!cWait) { cWait = true; setTimeout(cMark, 800); } }, { passive: true });
  }

  /* Home and Challenges: carry on from where the reader stopped */
  var cont = document.getElementById('continue');
  if (cont) {
    var all = chLoad(), best = null;
    Object.keys(all).forEach(function (id) {
      var s = all[id];
      if (s.done && s.done.length < s.total && (!best || (s.at || 0) > (best.at || 0))) { best = s; best.id = id; }
    });
    if (best) {
      var where = best.place
        ? 'You stopped at <strong>' + esc(best.place.section) + '</strong> in ' + esc(best.place.article) + '.'
        : 'You have finished ' + best.done.length + ' of ' + best.total + ' steps.';
      cont.innerHTML = '<div><div class="author-label">Welcome back</div><h2>Carry on with your ' + esc(best.title) + '</h2><p>' + where + '</p></div>' +
        '<a class="btn" href="' + esc(best.place ? best.place.url : '/challenges/' + best.id + '/') + '">Continue</a>';
      cont.hidden = false;
    }
  }

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
