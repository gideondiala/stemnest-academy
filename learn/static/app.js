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
