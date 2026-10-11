/* ═══════════════════════════════════════════════════════
   report-view.js — the student report page (pages/report.html?id=…).
   Written for parents: traffic-light tiles, simple bars, stars and
   plain sentences instead of statistics. "Download PDF" builds an A4
   PDF with the logo in the header and a faint logo watermark on
   every page.
═══════════════════════════════════════════════════════ */
(function () {
  var PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  var COLORS = { early: '#16a34a', onTime: '#1a56db', late: '#f59e0b', none: '#cbd5e1', proj: '#1a56db', quiz: '#7c3aed', punct: '#16a34a' };
  var R = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* Score → colour class + friendly word */
  function level(pct) {
    if (pct == null) return { c: 'n', w: 'Not set yet', col: '#cbd5e1' };
    if (pct >= 80) return { c: 'g', w: 'Excellent', col: '#16a34a' };
    if (pct >= 60) return { c: 'b', w: 'Good', col: '#1a56db' };
    return { c: 'a', w: 'Keep practising', col: '#f59e0b' };
  }

  function tile(icon, big, label, lv) {
    return '<div class="tile ' + lv.c + '"><div class="ic">' + icon + '</div><div class="big">' + esc(big) + '</div>' +
      '<div class="lbl">' + esc(label) + '</div><div class="word ' + lv.c + '">' + esc(lv.w) + '</div></div>';
  }

  function render(r) {
    var m = r.metrics, first = (r.student.name || 'Your child').split(' ')[0];
    var p = m.punctuality, tracked = p.early + p.onTime + p.late;
    var onTimePct = tracked ? Math.round(100 * (p.early + p.onTime) / tracked) : null;
    var attendPct = m.lessonsInScope ? Math.round(100 * Math.min(m.classesTaken, m.lessonsInScope) / m.lessonsInScope) : null;
    var h = '<div class="wm"></div>';

    /* Header: logo top-left, report details top-right */
    h += '<div class="head"><img src="../assets/images/logo2.png" alt="StemNest Academy" crossorigin="anonymous">' +
      '<div class="who"><div class="kind">' + (r.kind === 'grade' ? '🎓 ' : '📘 ') + esc(r.title) + '</div>' +
      '<div class="name">' + esc(r.student.name) + (r.student.ref ? ' <span style="font-size:13px;color:#94a3b8;">' + esc(r.student.ref) + '</span>' : '') + '</div>' +
      '<div class="meta">' + esc(r.pathway || '') + ' · ' + esc(r.gradeName) + (r.unit && r.unit.name ? ' · ' + esc(r.unit.name) : '') + '</div>' +
      '<div class="meta">' + (r.periodStart && String(r.periodStart).slice(0, 10) !== String(r.periodEnd).slice(0, 10) ? esc(fmtDate(r.periodStart)) + ' – ' : '') + esc(fmtDate(r.periodEnd)) + (r.tutorName ? ' · Teacher: ' + esc(r.tutorName) : '') + '</div>' +
      '</div></div>';

    /* At a glance */
    h += '<div class="section"><h2>⭐ At a glance</h2><p class="sub">Green means excellent, blue means good, orange means more practice will help.</p><div class="tiles">' +
      tile('✅', m.classesTaken + (m.lessonsInScope ? ' / ' + m.lessonsInScope : ''), 'Classes completed', level(attendPct)) +
      tile('📝', m.projects.averageScore != null ? m.projects.averageScore + '%' : '—', 'Project score', level(m.projects.averageScore)) +
      tile('🧠', m.quiz.averageScore != null ? m.quiz.averageScore + '%' : '—', m.quiz.exists ? 'Quiz score' : 'Quiz (none yet)', level(m.quiz.averageScore)) +
      tile('⏰', tracked ? (p.early + p.onTime) + ' / ' + tracked : '—', 'On time for class', level(onTimePct)) +
      '</div></div>';

    /* Punctuality */
    h += '<div class="section card"><h2>⏰ Joining classes on time</h2>';
    if (tracked) {
      var seg = function (n, col) { return n ? '<div style="width:' + (100 * n / tracked) + '%;background:' + col + ';">' + n + '</div>' : ''; };
      h += '<div class="stack">' + seg(p.early, COLORS.early) + seg(p.onTime, COLORS.onTime) + seg(p.late, COLORS.late) + '</div>' +
        '<div class="legend"><span><span class="dot" style="background:' + COLORS.early + '"></span>Early: ' + p.early + '</span>' +
        '<span><span class="dot" style="background:' + COLORS.onTime + '"></span>On time: ' + p.onTime + '</span>' +
        '<span><span class="dot" style="background:' + COLORS.late + '"></span>Late: ' + p.late + '</span></div>' +
        '<p class="say">' + esc(first) + ' joined <strong>' + (p.early + p.onTime) + ' of ' + tracked + '</strong> classes early or on time' +
        (p.late ? '. Joining a few minutes early helps ' + esc(first) + ' get the most out of every class.' : ' — well done! 👏') + '</p>';
      if (p.notRecorded) h += '<p class="sub" style="margin-top:6px;">' + plural(p.notRecorded, 'class') + ' had no joining time recorded (we started recording on ' + esc(fmtDate(p.trackingFrom)) + ').</p>';
    } else {
      h += '<p class="say">We started recording joining times on ' + esc(fmtDate(p.trackingFrom)) + '. They will appear in the next report.</p>';
    }
    h += '</div>';

    /* Projects */
    h += '<div class="section card"><h2>📝 Projects</h2>';
    if (!m.projects.total) {
      h += '<p class="say">There were no take-home projects in this ' + (r.kind === 'grade' ? 'grade' : 'unit') + ' yet. Projects are being added to more lessons and will appear here.</p>';
    } else {
      var pr = m.projects;
      h += '<p class="sub">Each project is marked out of 100.</p>' + pr.list.map(function (x) {
        var lv = level(x.score), chip;
        if (x.state === 'marked') chip = x.late ? ['Handed in late', 'a'] : ['On time', 'g'];
        else if (x.state === 'awaiting_marking') chip = ['Waiting for marking', 'b'];
        else if (x.state === 'missing') chip = ['Not handed in', 'a'];
        else chip = ['Not due yet', 'n'];
        return '<div class="prow"><div>' + esc(String(x.title).replace(/^Lesson \d+:\s*/, '')) + (x.score != null ? ' <span style="color:' + lv.col + ';">' + x.score + '%</span>' : '') + '</div>' +
          '<div class="track"><div style="width:' + (x.score || 0) + '%;background:' + lv.col + ';"></div></div>' +
          '<div class="chip ' + chip[1] + '">' + chip[0] + '</div></div>';
      }).join('');
      var bits = [];
      if (pr.onTime) bits.push(plural(pr.onTime, 'project') + ' handed in on time');
      if (pr.late) bits.push(pr.late + ' late');
      if (pr.missing) bits.push(pr.missing + ' not handed in');
      if (bits.length) h += '<p class="say">' + esc(first) + ': ' + esc(bits.join(', ')) + '.' + (pr.missing ? ' Late or missing work earns fewer points, so a gentle reminder at home helps.' : '') + '</p>';
    }
    h += '</div>';

    /* Quiz */
    h += '<div class="section card"><h2>🧠 ' + (r.kind === 'grade' ? 'Unit quizzes' : 'Unit quiz') + '</h2>';
    if (!m.quiz.exists) {
      h += '<p class="say">There is no quiz for this ' + (r.kind === 'grade' ? 'grade' : 'unit') + ' yet. Quizzes are being added and will appear in future reports.</p>';
    } else {
      h += m.quiz.list.map(function (q) {
        var lv = level(q.score), chip;
        if (q.state === 'done') chip = q.onTime ? ['On time', 'g'] : ['Taken late', 'a'];
        else if (q.state === 'open') chip = ['Still open', 'b'];
        else if (q.state === 'missed') chip = ['Not taken', 'a'];
        else chip = ['Not set yet', 'n'];
        return '<div class="prow"><div>Unit ' + q.unit + (q.name ? ': ' + esc(q.name) : '') + (q.score != null ? ' <span style="color:' + lv.col + ';">' + q.score + '%</span>' : '') + '</div>' +
          '<div class="track" style="position:relative;"><div style="width:' + (q.score || 0) + '%;background:' + lv.col + ';"></div>' +
            (q.passMark ? '<span title="Pass mark" style="position:absolute;top:-3px;bottom:-3px;left:' + q.passMark + '%;width:3px;background:#1a202c;border-radius:2px;"></span>' : '') + '</div>' +
          '<div class="chip ' + chip[1] + '">' + chip[0] + '</div></div>';
      }).join('') + '<p class="sub" style="margin-top:6px;">The black line is the pass mark. Students get 3 tries; the best score counts.</p>';
    }
    h += '</div>';

    /* Grade report: unit by unit */
    if (r.kind === 'grade' && m.units && m.units.length) h += unitChart(m.units);

    /* Skills */
    var skills = r.skills || [];
    h += '<div class="section card"><h2>🌟 Skills</h2>';
    if (r.ratings) {
      h += '<p class="sub">Rated by ' + esc(r.tutorName || 'the teacher') + ' from 1 to 5 stars.</p>' + skills.map(function (s) {
        var v = Number(r.ratings[s.key]) || 0, st = '';
        for (var i = 1; i <= 5; i++) st += i <= v ? '★' : '<span class="off">★</span>';
        var word = ['', 'Needs a lot of help', 'Needs some help', 'Getting there', 'Good', 'Excellent'][v] || '';
        return '<div class="srow"><div style="font-weight:800;font-size:14px;">' + esc(s.label) + '</div><div style="display:flex;align-items:center;gap:10px;"><span class="stars">' + st + '</span><span style="font-size:12px;font-weight:800;color:#64748b;min-width:120px;">' + esc(word) + '</span></div></div>';
      }).join('');
    } else {
      h += '<p class="say">The teacher has not added skill ratings for this ' + (r.kind === 'grade' ? 'grade' : 'unit') + '.</p>';
    }
    h += '</div>';

    /* Teacher's words */
    if (r.remarks || r.recommendation) {
      h += '<div class="section two">' +
        '<div><h2>💬 Teacher\'s remarks</h2><div class="quote">' + esc(r.remarks || '—') + '</div></div>' +
        '<div><h2>🎯 Recommendation</h2><div class="quote rec">' + esc(r.recommendation || '—') + '</div></div></div>';
    }

    /* Extra study */
    var sm = m.study.minutes;
    h += '<div class="section card"><h2>📚 Extra study time</h2>' +
      '<p class="say">' + (sm
        ? esc(first) + ' spent <strong>' + (sm >= 60 ? Math.floor(sm / 60) + ' h ' + (sm % 60) + ' min' : sm + ' minutes') + '</strong> on StemNest learning resources (lesson materials, the learning blog and the Learning Nest) outside class. ' + (sm >= 60 ? 'Great effort! 🌟' : 'A little extra practice each week makes a big difference.')
        : 'No extra study time was recorded in this period. Reading the lesson materials and the StemNest learning blog between classes helps ' + esc(first) + ' remember more.') + '</p></div>';

    /* Key + footer */
    h += '<div class="section"><div class="key"><span class="g">🟢 80% and above: Excellent</span><span class="b">🔵 60–79%: Good</span><span class="a">🟠 Below 60%: Keep practising</span><span class="n">⚪ Not set yet</span></div></div>';
    h += '<div class="foot"><span>StemNest Academy · stemnestacademy.co.uk</span><span>' +
      (r.publishedAt ? 'Issued ' + esc(fmtDate(r.publishedAt)) : 'Draft — not yet sent to the parent') + '</span></div>';
    return h;
  }

  /* Grouped bars per unit: projects, quiz, on-time % */
  function unitChart(units) {
    var W = 820, H = 230, padL = 34, padB = 34, top = 12, cw = (W - padL) / units.length, bw = Math.min(22, cw / 4.2);
    var y = function (v) { return top + (H - top - padB) * (1 - v / 100); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Scores for each unit" style="display:block;font-family:Nunito,sans-serif;">';
    [0, 50, 100].forEach(function (g) {
      s += '<line x1="' + padL + '" x2="' + W + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="#e2e8f0" stroke-dasharray="4 4"/>' +
        '<text x="' + (padL - 6) + '" y="' + (y(g) + 4) + '" font-size="11" text-anchor="end" fill="#94a3b8" font-weight="700">' + g + '%</text>';
    });
    units.forEach(function (u, i) {
      var cx = padL + cw * i + cw / 2;
      [['projectAverage', COLORS.proj, -1], ['quizScore', COLORS.quiz, 0], ['onTimeRate', COLORS.punct, 1]].forEach(function (k) {
        var v = u[k[0]], x = cx + k[2] * (bw + 3) - bw / 2;
        if (v == null) s += '<rect x="' + x + '" y="' + (y(0) - 3) + '" width="' + bw + '" height="3" fill="#e2e8f0" rx="1"/>';
        else s += '<rect x="' + x + '" y="' + y(v) + '" width="' + bw + '" height="' + (y(0) - y(v)) + '" fill="' + k[1] + '" rx="4"><title>' + v + '%</title></rect>';
      });
      s += '<text x="' + cx + '" y="' + (H - 12) + '" font-size="12" text-anchor="middle" fill="#334155" font-weight="800">Unit ' + u.unit + '</text>';
    });
    s += '</svg>';
    return '<div class="section card"><h2>📈 Unit by unit</h2><p class="sub">How each unit of the grade went. Taller bars are better.</p>' + s +
      '<div class="legend" style="margin-top:6px;"><span><span class="dot" style="background:' + COLORS.proj + '"></span>Projects</span>' +
      '<span><span class="dot" style="background:' + COLORS.quiz + '"></span>Quiz</span>' +
      '<span><span class="dot" style="background:' + COLORS.punct + '"></span>On time for class</span></div></div>';
  }

  /* ── PDF ── */
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      if (window.html2pdf) return ok();
      var t = document.createElement('script'); t.src = src; t.onload = ok; t.onerror = function () { fail(new Error('Could not load the PDF tool')); };
      document.head.appendChild(t);
    });
  }
  function watermarkData() {
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'), w = 600, hh = Math.round(600 * img.height / img.width);
        c.width = w; c.height = hh; c.getContext('2d').drawImage(img, 0, 0, w, hh);
        ok({ data: c.toDataURL('image/png'), ratio: hh / w });
      };
      img.onerror = function () { ok(null); };
      img.src = '../assets/icons/icon.png';
    });
  }
  async function downloadPdf() {
    var btn = document.getElementById('pdfBtn'), el = document.getElementById('report');
    btn.disabled = true; btn.textContent = 'Preparing PDF…';
    try {
      await loadScript(PDF_LIB);
      var wm = await watermarkData();
      el.classList.add('pdf-mode');
      var name = ('StemNest-' + R.student.name + '-' + R.title).replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') + '.pdf';
      await html2pdf().set({
        margin: [8, 8, 12, 8], filename: name,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.section', '.tile', '.prow'] },
      }).from(el).toPdf().get('pdf').then(function (pdf) {
        var n = pdf.internal.getNumberOfPages(), pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
        for (var i = 1; i <= n; i++) {
          pdf.setPage(i);
          if (wm) {
            var w = pw * 0.6, hgt = w * wm.ratio;
            if (pdf.GState) pdf.setGState(new pdf.GState({ opacity: 0.04 }));
            pdf.addImage(wm.data, 'PNG', (pw - w) / 2, (ph - hgt) / 2, w, hgt);
            if (pdf.GState) pdf.setGState(new pdf.GState({ opacity: 1 }));
          }
          pdf.setFontSize(8); pdf.setTextColor(148, 163, 184);
          pdf.text('StemNest Academy · ' + R.student.name + ' · ' + R.title + ' · page ' + i + ' of ' + n, pw / 2, ph - 5, { align: 'center' });
        }
      }).save();
    } catch (e) {
      alert('Sorry — the PDF could not be made (' + e.message + '). You can use your browser\'s Print → Save as PDF instead.');
    } finally {
      el.classList.remove('pdf-mode');
      btn.disabled = false; btn.textContent = '⬇️ Download PDF';
    }
  }

  async function start() {
    var id = new URLSearchParams(location.search).get('id');
    var box = document.getElementById('report');
    try {
      var u = JSON.parse(localStorage.getItem('sn_api_user') || 'null');
      var back = { tutor: 'tutor-dashboard.html', admin: 'admin-dashboard.html', super_admin: 'super-admin.html', postsales: 'postsales-dashboard.html', operations: 'operations-dashboard.html' }[u && u.role];
      if (back) document.getElementById('backLink').href = back;
    } catch (e) {}
    if (!id) { box.innerHTML = '<div class="msg">No report selected.</div>'; return; }
    try {
      var d = await apiCall('/api/reports/' + encodeURIComponent(id));
      if (!d || !d.success) throw new Error((d && d.error) || 'Report not found');
      R = d.report;
      document.title = R.student.name + ' — ' + R.title + ' – StemNest Academy';
      box.innerHTML = render(R);
      var btn = document.getElementById('pdfBtn');
      btn.style.display = ''; btn.onclick = downloadPdf;
    } catch (e) {
      box.innerHTML = '<div class="msg">😕 ' + esc(e.message) + '<br><br><a href="student-dashboard.html" style="color:#1a56db;">Back to the dashboard</a></div>';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
