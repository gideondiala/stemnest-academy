/* ═══════════════════════════════════════════════════════
   student-reports.js — "📊 My Reports" tab on the student dashboard:
   unit reports (after every unit) and grade reports. Each opens the
   full report page (charts + PDF). Also times the Learning Nest tab
   for the study-time part of the report.
═══════════════════════════════════════════════════════ */
(function () {
  var loaded = false, list = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }

  function ensureTab() {
    if (document.getElementById('tab-reports')) return;
    var after = document.querySelector('.sidebar-link[data-tab="certificates"]');
    if (after) {
      var a = document.createElement('a');
      a.className = 'sidebar-link'; a.dataset.tab = 'reports';
      a.innerHTML = '<span class="sl-icon">📊</span> My Reports <span class="sl-badge" id="reportsBadge" style="display:none;"></span>';
      a.onclick = function () { showTab('reports'); };
      after.parentNode.insertBefore(a, after.nextSibling);
    }
    var ref = document.getElementById('tab-certificates');
    var tab = document.createElement('div');
    tab.id = 'tab-reports'; tab.style.display = 'none';
    if (ref && ref.parentNode) ref.parentNode.insertBefore(tab, ref.nextSibling);
    if (typeof ALL_TABS !== 'undefined' && ALL_TABS.indexOf('reports') === -1) ALL_TABS.push('reports');

    var prev = window.showTab;
    window.showTab = function (t) {
      prev(t);
      if (t === 'reports') render();
      if (window.SNStudy) { if (t === 'nest') SNStudy.start('nest'); else SNStudy.stop(); }
    };
  }

  async function load() {
    try {
      var d = await apiCall('/api/reports/mine');
      if (!d || !d.success) return;
      list = d.reports || [];
      loaded = true;
      /* Badge: reports from the last 14 days not opened on this device yet */
      var seen = [];
      try { seen = JSON.parse(localStorage.getItem('sn_reports_seen') || '[]'); } catch (e) {}
      var fresh = list.filter(function (r) { return seen.indexOf(r.id) < 0 && Date.now() - new Date(r.publishedAt).getTime() < 14 * 86400000; }).length;
      var b = document.getElementById('reportsBadge');
      if (b) { b.textContent = fresh; b.style.display = fresh ? '' : 'none'; }
      if (document.getElementById('tab-reports') && document.getElementById('tab-reports').style.display === 'block') render();
    } catch (e) {}
  }

  function render() {
    var tab = document.getElementById('tab-reports');
    if (!tab) return;
    var head =
      '<div style="margin-bottom:18px;">' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:26px;color:var(--dark,#1a202c);">📊 My Reports</div>' +
        '<div style="font-size:14px;color:var(--light,#718096);font-weight:600;max-width:640px;">A short report arrives after every unit (about 8 classes), and a full report when a grade is finished. ' +
        'Each shows projects, quizzes, joining classes on time, extra study time and the teacher\'s comments — and can be downloaded as a PDF.</div>' +
      '</div>';
    if (!loaded) { tab.innerHTML = head + '<div style="padding:30px;color:#94a3b8;font-weight:700;">Loading…</div>'; load(); return; }
    if (!list.length) {
      tab.innerHTML = head +
        '<div style="background:#fff;border-radius:20px;padding:44px 20px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.05);">' +
          '<div style="font-size:46px;margin-bottom:10px;">📊</div>' +
          '<div style="font-family:\'Fredoka One\',cursive;font-size:21px;color:#1a202c;margin-bottom:6px;">No reports yet</div>' +
          '<div style="font-size:14px;color:#718096;font-weight:600;">Your first report arrives when you finish your current unit. Keep going! 🚀</div>' +
        '</div>';
      return;
    }
    tab.innerHTML = head + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px;">' +
      list.map(function (r) {
        var grade = r.kind === 'grade';
        return '<a href="report.html?id=' + encodeURIComponent(r.id) + '" target="_blank" rel="noopener" onclick="SNStudentReports.seen(\'' + r.id + '\')" ' +
          'style="display:block;text-decoration:none;background:' + (grade ? 'linear-gradient(135deg,#fef3c7,#fff)' : '#fff') + ';border-radius:20px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.06);border:2px solid ' + (grade ? '#fcd34d' : '#e2e8f0') + ';">' +
          '<div style="font-size:30px;margin-bottom:6px;">' + (grade ? '🎓' : '📘') + '</div>' +
          '<div style="font-family:\'Fredoka One\',cursive;font-size:19px;color:#1a202c;">' + esc(r.title) + '</div>' +
          (r.unit && r.unit.name ? '<div style="font-size:13px;font-weight:800;color:#1a56db;margin:2px 0 6px;">' + esc(r.unit.name) + '</div>' : '') +
          '<div style="font-size:12px;font-weight:700;color:#718096;">' + esc(r.pathway || '') + ' · Grade ' + esc(r.grade) + '</div>' +
          '<div style="font-size:12px;font-weight:700;color:#94a3b8;margin-top:4px;">' + esc(fmtDate(r.publishedAt)) + (r.tutorName ? ' · ' + esc(r.tutorName) : '') + '</div>' +
          '<div style="margin-top:12px;font-weight:900;font-size:13px;color:#1a56db;">Open report →</div>' +
        '</a>';
      }).join('') + '</div>';
  }

  function seen(id) {
    try {
      var s = JSON.parse(localStorage.getItem('sn_reports_seen') || '[]');
      if (s.indexOf(id) < 0) { s.push(id); localStorage.setItem('sn_reports_seen', JSON.stringify(s.slice(-100))); }
    } catch (e) {}
    setTimeout(load, 500);
  }

  window.SNStudentReports = { load: load, render: render, seen: seen };

  function start() { ensureTab(); load(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 400); });
  else setTimeout(start, 400);
})();
