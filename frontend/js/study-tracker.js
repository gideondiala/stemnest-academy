/* ═══════════════════════════════════════════════════════
   study-tracker.js — counts a logged-in student's time on learning
   pages (blog, lesson materials, Learning Nest) for their report.
   Time only counts while the page is visible and the student has
   moved, scrolled or typed in the last 2 minutes.

   Auto-starts with <script src="study-tracker.js" data-source="blog">;
   or call SNStudy.start('nest') / SNStudy.stop() yourself.
═══════════════════════════════════════════════════════ */
(function () {
  var API = 'https://api.stemnestacademy.co.uk';
  var TICK = 15, SEND_AT = 60, IDLE_MS = 2 * 60 * 1000;
  var source = null, pending = 0, lastActive = Date.now(), timer = null;

  function token() {
    try {
      var u = JSON.parse(localStorage.getItem('sn_api_user') || 'null');
      if (!u || u.role !== 'student') return null;
      return localStorage.getItem('sn_access_token');
    } catch (e) { return null; }
  }
  function send(keepalive) {
    var t = token(), s = pending;
    if (!t || !source || s < 5) return;
    pending = 0;
    try {
      fetch(API + '/api/reports/study', {
        method: 'POST', keepalive: !!keepalive,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ source: source, seconds: s }),
      }).then(function (r) { if (r.status === 401 || r.status === 403) stop(); }).catch(function () {});
    } catch (e) {}
  }
  function tick() {
    if (document.visibilityState === 'visible' && Date.now() - lastActive < IDLE_MS) pending += TICK;
    if (pending >= SEND_AT) send(false);
  }
  function active() { lastActive = Date.now(); }
  function start(src) {
    if (!token()) return;
    if (source && source !== src) send(false);
    source = src; lastActive = Date.now();
    if (!timer) timer = setInterval(tick, TICK * 1000);
  }
  function stop() {
    send(true);
    source = null;
    if (timer) { clearInterval(timer); timer = null; }
  }

  ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(function (e) {
    window.addEventListener(e, active, { passive: true });
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') send(true); });
  window.addEventListener('pagehide', function () { send(true); });

  window.SNStudy = { start: start, stop: stop };
  var me = document.currentScript;
  if (me && me.dataset && me.dataset.source) start(me.dataset.source);
})();
