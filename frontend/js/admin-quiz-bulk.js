/* ═══════════════════════════════════════════════════════
   admin-quiz-bulk.js — Admin → Upload Quiz → "Bulk upload quiz files".
   Drop in one or more quiz files (a whole track/grade per file, or an
   "All Tracks" file). Each unit is matched to the curriculum by track
   name (Appforge, Dataville, Mindspire, Questopia, Webweave …), grade and
   unit number, then checked: questions valid, and the file's unit title
   resembles the curriculum's (catches quizzes written for a different
   course). Matching units are ticked; upload sends each one to
   POST /api/quizzes/upload, which also gives the quiz to every student
   who has already finished that unit.
═══════════════════════════════════════════════════════ */
(function () {
  var API = 'https://api.stemnestacademy.co.uk';
  var rows = [], unitsMap = [];
  var TRACKS = [
    [/appforge|mobile|\bapps?\b/i, 'Mobile App Development'],
    [/dataville|data/i, 'Data Science & Analytics'],
    [/mindspire|\bai\b|automation/i, 'AI & Automation'],
    [/questopia|game/i, 'Game Development'],
    [/webweave|web/i, 'Website Development'],
  ];
  var STOP = ('unit the a an of and in to for with grade edition appforge dataville mindspire questopia webweave nova novas ' +
              'part intro introduction band app development mobile data science game web website design advanced project ' +
              'programming system building real world').split(' ');
  /* The last unit of every grade is a capstone ("NOVA's Second Restoration") */
  var SAME = { restoration: 'capstone', final: 'capstone' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tok() { return localStorage.getItem('sn_access_token'); }
  function words(t) {
    return String(t || '').toLowerCase().replace(/^unit\s*\d+\s*[:.\-–—]?/, ' ').replace(/[^a-z]+/g, ' ').split(' ')
      .map(function (w) { w = w.replace(/'?s$/, ''); return SAME[w] || w; })
      .filter(function (w) { return w.length >= 3 && STOP.indexOf(w) < 0; });
  }
  function similar(a, b) {
    var wb = words(b);
    return words(a).some(function (w) { return wb.indexOf(w) >= 0; });
  }
  function trackToPathway(t) {
    for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i][0].test(String(t || ''))) return TRACKS[i][1];
    return null;
  }
  function gradeNum(g) { var m = String(g == null ? '' : g).match(/\d+/); return m ? parseInt(m[0], 10) : null; }
  function validQ(q) {
    return q && typeof q.q === 'string' && q.q.trim() && Array.isArray(q.options) && q.options.length === 4 &&
      q.options.every(function (o) { return String(o == null ? '' : o).trim(); }) &&
      typeof q.answer === 'number' && q.answer >= 0 && q.answer <= 3 && Math.floor(q.answer) === q.answer;
  }

  /* Any supported file shape → [{ track, grade, unitTitle, index, questions }] */
  function unitsOf(data) {
    var out = [];
    function add(track, grade, units) {
      (units || []).forEach(function (u, i) {
        out.push({ track: u.track || track, grade: u.grade != null ? u.grade : grade, unitTitle: u.unit || u.title || '', index: i, questions: u.questions || [] });
      });
    }
    if (data && Array.isArray(data.units)) add(data.track, data.grade, data.units);
    else if (data && Array.isArray(data.questions)) out.push({ track: data.track, grade: data.grade, unitTitle: data.unit || '', index: 0, questions: data.questions, single: true });
    else if (data && typeof data === 'object') {
      Object.keys(data).forEach(function (k) { if (Array.isArray(data[k])) add(k, null, data[k]); });
    }
    return out;
  }

  async function loadUnitsMap() {
    if (unitsMap.length) return unitsMap;
    var r = await fetch(API + '/api/quizzes/units-map', { headers: { Authorization: 'Bearer ' + tok() } });
    var d = await r.json();
    if (!d.success) throw new Error(d.error || 'Could not load the curriculum units');
    unitsMap = d.units || [];
    return unitsMap;
  }

  window.snBulkQuizFiles = async function (input) {
    var files = Array.prototype.slice.call(input.files || []);
    var box = document.getElementById('bulkQuizResult');
    if (!files.length) return;
    box.innerHTML = '<div style="padding:14px;color:var(--light);font-weight:800;">⏳ Reading ' + files.length + ' file(s)…</div>';
    try { await loadUnitsMap(); } catch (e) { box.innerHTML = '<div style="color:#c53030;font-weight:800;">⚠️ ' + esc(e.message) + '</div>'; return; }
    rows = [];
    var seen = {};
    for (var f = 0; f < files.length; f++) {
      var file = files[f], data;
      try { data = JSON.parse(await file.text()); }
      catch (e) { rows.push({ file: file.name, status: 'bad', note: 'Not valid JSON' }); continue; }
      var us = unitsOf(data);
      if (!us.length) { rows.push({ file: file.name, status: 'bad', note: 'No units found in this file' }); continue; }
      us.forEach(function (u) {
        var pathway = trackToPathway(u.track), grade = gradeNum(u.grade);
        var m = String(u.unitTitle).match(/unit\s*(\d+)/i);
        var unit = m ? parseInt(m[1], 10) : u.index + 1;
        var row = { file: file.name, pathway: pathway, grade: grade, unit: unit, title: u.unitTitle, questions: u.questions };
        var live = unitsMap.find(function (x) { return x.pathway === pathway && x.grade === grade && x.unit === unit; });
        var bad = u.questions.filter(function (q) { return !validQ(q); }).length;
        var key = pathway + '|' + grade + '|' + unit;
        if (u.single && (!pathway || !grade)) { row.status = 'bad'; row.note = 'Single-unit file without track and grade — use the single upload below'; }
        else if (!pathway) { row.status = 'bad'; row.note = 'Track "' + (u.track || '?') + '" not recognised'; }
        else if (!grade) { row.status = 'bad'; row.note = 'Grade missing'; }
        else if (!live) { row.status = 'bad'; row.note = 'This unit is not in the curriculum'; }
        else if (!u.questions.length || bad) { row.status = 'bad'; row.note = bad + ' invalid question(s) (need q, 4 options, answer 0–3)'; }
        else if (seen[key]) { row.status = 'dup'; row.note = 'Also in ' + seen[key] + ' — skipped'; }
        else if (!similar(u.unitTitle, live.name)) { row.status = 'warn'; row.note = 'Title does not match the curriculum unit — check it is for this course'; }
        else { row.status = 'ok'; row.note = live.hasQuiz ? 'Replaces the existing quiz' : 'New quiz'; }
        if (live) { row.pathwayId = live.pathwayId; row.liveName = live.name; }
        if (row.status !== 'bad' && !seen[key]) seen[key] = file.name;
        row.checked = row.status === 'ok';
        rows.push(row);
      });
    }
    input.value = '';   /* choosing the same files again still refreshes */
    render();
  };

  function render() {
    var box = document.getElementById('bulkQuizResult');
    var counts = { ok: 0, warn: 0, bad: 0, dup: 0 };
    rows.forEach(function (r) { counts[r.status]++; });
    var icon = { ok: '✅', warn: '⚠️', bad: '❌', dup: '↩️' };
    box.innerHTML =
      '<div style="font-size:13px;font-weight:800;margin:12px 0 8px;">✅ ' + counts.ok + ' match · ⚠️ ' + counts.warn + ' title mismatch · ❌ ' + counts.bad + ' cannot upload · ↩️ ' + counts.dup + ' duplicate</div>' +
      (counts.warn ? '<div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;padding:10px 12px;font-size:12px;font-weight:700;color:#92400e;margin-bottom:10px;">⚠️ rows look like they were written for a different course than the lessons students take. They are not ticked — only tick them if you are sure.</div>' : '') +
      '<div style="max-height:420px;overflow:auto;border:1.5px solid #e8eaf0;border-radius:12px;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f8fafc;text-align:left;position:sticky;top:0;">' +
        '<th style="padding:8px;"><input type="checkbox" onclick="snBulkToggleAll(this.checked)"></th><th style="padding:8px;">Pathway</th><th style="padding:8px 6px;">Grade</th><th style="padding:8px 6px;">Unit</th><th style="padding:8px 6px;">Quiz file title</th><th style="padding:8px 6px;">Curriculum unit</th><th style="padding:8px 6px;">Qs</th><th style="padding:8px 6px;">Status</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        var can = r.status === 'ok' || r.status === 'warn';
        return '<tr style="border-top:1px solid #f1f5f9;background:' + (r.status === 'warn' ? '#fffbeb' : r.status === 'bad' ? '#fff5f5' : '#fff') + ';">' +
          '<td style="padding:6px 8px;">' + (can ? '<input type="checkbox" ' + (r.checked ? 'checked' : '') + ' onchange="snBulkTick(' + i + ',this.checked)">' : '') + '</td>' +
          '<td style="padding:6px 4px;font-weight:800;">' + esc(r.pathway || '—') + '</td><td style="padding:6px;">' + esc(r.grade || '—') + '</td><td style="padding:6px;">' + esc(r.unit || '—') + '</td>' +
          '<td style="padding:6px;">' + esc(r.title || r.file) + '</td><td style="padding:6px;color:#475569;">' + esc(r.liveName || '—') + '</td>' +
          '<td style="padding:6px;">' + (r.questions ? r.questions.length : '—') + '</td>' +
          '<td style="padding-right:8px;">' + icon[r.status] + ' ' + esc(r.note) + (r.result ? '<div style="font-weight:900;color:' + (r.result.ok ? '#065f46' : '#c53030') + ';">' + esc(r.result.msg) + '</div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<button id="bulkQuizGo" onclick="snBulkUpload()" style="margin-top:12px;background:var(--blue);color:#fff;border:none;border-radius:50px;padding:11px 24px;font-family:Nunito,sans-serif;font-weight:900;cursor:pointer;">⬆️ Upload ' + rows.filter(function (r) { return r.checked; }).length + ' selected quiz(zes)</button>';
  }

  window.snBulkTick = function (i, v) { rows[i].checked = v; render(); };
  window.snBulkToggleAll = function (v) { rows.forEach(function (r) { if (r.status === 'ok' || r.status === 'warn') r.checked = v; }); render(); };

  window.snBulkUpload = async function () {
    var todo = rows.filter(function (r) { return r.checked && !(r.result && r.result.ok); });
    if (!todo.length) return;
    if (todo.some(function (r) { return r.status === 'warn'; }) && !confirm('Some ticked quizzes do not match their curriculum unit titles. Upload them anyway?')) return;
    var btn = document.getElementById('bulkQuizGo'); btn.disabled = true;
    var done = 0, given = 0;
    for (var i = 0; i < todo.length; i++) {
      var r = todo[i];
      btn.textContent = 'Uploading ' + (i + 1) + ' of ' + todo.length + '…';
      try {
        var res = await fetch(API + '/api/quizzes/upload', {
          method: 'POST', headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathway_id: r.pathwayId, grade_number: r.grade, unit_number: r.unit, unit_name: r.liveName || r.title, questions: r.questions }),
        });
        var d = await res.json();
        if (!res.ok || !d.success) throw new Error(d.error || 'Upload failed');
        r.result = { ok: true, msg: 'Uploaded' + (d.assignedTo ? ' · given to ' + d.assignedTo + ' student(s)' : '') };
        r.checked = false; done++; given += d.assignedTo || 0;
      } catch (e) { r.result = { ok: false, msg: e.message }; }
    }
    unitsMap = [];
    render();
    if (typeof showToast === 'function') showToast('✅ ' + done + ' quiz(zes) uploaded' + (given ? ' — given to ' + given + ' student(s) who had finished those units' : ''), 'success');
    if (typeof loadAndRenderQuizzes === 'function') loadAndRenderQuizzes();
  };
})();
