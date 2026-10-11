/**
 * reports-tutor.js — tutor dashboard: "📊 Reports to write".
 * When a student finishes a unit (or a grade) a report is created with the
 * numbers filled in. The tutor adds 1–5 skill ratings, remarks and a
 * recommendation, which publishes it to the parent. Without comments it is
 * published automatically after 5 days.
 */
(function () {
  'use strict';
  if (!/tutor-dashboard(\.html)?$/.test(location.pathname)) return;

  var state = { list: [], skills: [] };
  var LABELS = { 1: 'Needs a lot of help', 2: 'Needs some help', 3: 'Getting there', 4: 'Good', 5: 'Excellent' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); else alert(msg); }
  function daysLeft(d) {
    var ms = new Date(d).getTime() - Date.now();
    if (ms <= 0) return 'today';
    var h = Math.round(ms / 3600000);
    return h < 24 ? 'in ' + h + ' hour' + (h === 1 ? '' : 's') : 'in ' + Math.ceil(h / 24) + ' days';
  }

  async function refresh() {
    try {
      var d = await apiCall('/api/reports/tutor/pending');
      if (!d || !d.success) return;
      state.list = d.reports || []; state.skills = d.skills || [];
      render();
    } catch (e) {}
  }

  function render() {
    var host = document.getElementById('tab-overview');
    if (!host) return;
    var box = document.getElementById('reportsToWriteBox');
    if (!state.list.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'reportsToWriteBox';
      var after = document.getElementById('scheduleChangesBox') || document.getElementById('unendedBanner');
      host.insertBefore(box, after ? after.nextSibling : host.firstChild);
    }
    box.style.cssText = 'background:#f5f3ff;border:2px solid #c4b5fd;border-radius:16px;padding:16px 18px;margin-bottom:20px;font-family:Nunito,sans-serif;';
    box.innerHTML =
      '<div style="font-weight:900;font-size:15px;color:#5b21b6;margin-bottom:4px;">📊 ' + state.list.length + ' report' + (state.list.length === 1 ? '' : 's') + ' to write</div>' +
      '<div style="font-size:12px;font-weight:700;color:#4a5568;margin-bottom:10px;">Your student finished a unit. The scores are filled in — add your ratings, remarks and a recommendation (about 3 minutes). ' +
        'Reports go to the parent automatically after 5 days, without your comments if they are missing.</div>' +
      state.list.map(function (r) {
        var soon = new Date(r.publishDueAt).getTime() - Date.now() < 36 * 3600000;
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#fff;border-radius:12px;padding:10px 12px;margin-bottom:6px;">' +
          '<div><div style="font-size:13px;font-weight:900;">' + esc(r.studentName) + ' — ' + esc(r.title) + (r.unit && r.unit.name ? ': ' + esc(r.unit.name) : '') + '</div>' +
            '<div style="font-size:11px;font-weight:700;color:' + (soon ? '#dc2626' : '#718096') + ';">' + esc(r.pathway || '') + ' · Grade ' + esc(r.grade) + ' · goes to the parent ' + esc(daysLeft(r.publishDueAt)) + '</div></div>' +
          '<button onclick="SNTutorReports.open(\'' + r.id + '\')" style="background:#7c3aed;color:#fff;border:none;border-radius:50px;padding:7px 16px;font-family:Nunito,sans-serif;font-weight:900;font-size:12px;cursor:pointer;">✍️ Write report</button></div>';
      }).join('');
  }

  function summary(m) {
    var bits = [];
    bits.push('✅ ' + m.classesTaken + ' class' + (m.classesTaken === 1 ? '' : 'es') + ' completed');
    var p = m.punctuality, tracked = p.early + p.onTime + p.late;
    if (tracked) bits.push('⏰ joined early/on time ' + (p.early + p.onTime) + ' of ' + tracked);
    if (m.projects.total) bits.push('📝 projects: ' + (m.projects.averageScore != null ? 'average ' + m.projects.averageScore + '%' : 'none marked yet') +
      (m.projects.missing ? ', ' + m.projects.missing + ' missing' : ''));
    else bits.push('📝 no projects in this unit yet');
    if (m.quiz.exists) bits.push('🧠 quiz: ' + (m.quiz.averageScore != null ? m.quiz.averageScore + '%' : 'not taken yet'));
    if (m.study.minutes) bits.push('📚 ' + m.study.minutes + ' min extra study');
    return bits.join('<br>');
  }

  async function open(id) {
    var d;
    try { d = await apiCall('/api/reports/' + id); } catch (e) { return toast('⚠️ ' + e.message, 'error'); }
    if (!d || !d.success) return toast('⚠️ ' + ((d && d.error) || 'Could not open the report'), 'error');
    var r = d.report, skills = r.skills || state.skills;
    var o = document.createElement('div');
    o.id = 'reportWriteOverlay';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;font-family:Nunito,sans-serif;';
    o.innerHTML =
      '<div style="background:#fff;border-radius:20px;max-width:620px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);">' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;color:#1a202c;">✍️ ' + esc(r.student.name) + ' — ' + esc(r.title) + '</div>' +
        '<div style="font-size:13px;font-weight:800;color:#7c3aed;margin-bottom:10px;">' + esc(r.pathway || '') + ' · ' + esc(r.gradeName) + (r.unit && r.unit.name ? ' · ' + esc(r.unit.name) : '') + '</div>' +
        '<div style="background:#f8fafc;border-radius:12px;padding:12px 14px;font-size:13px;font-weight:700;color:#334155;line-height:1.7;margin-bottom:14px;">' + summary(r.metrics) +
          '<div style="margin-top:6px;"><a href="report.html?id=' + encodeURIComponent(r.id) + '" target="_blank" rel="noopener" style="color:#1a56db;font-weight:900;">See the full report as the parent will →</a></div></div>' +
        '<div style="font-weight:900;font-size:14px;margin-bottom:6px;">Skill ratings <span style="font-weight:700;color:#94a3b8;font-size:12px;">(1 = needs a lot of help · 5 = excellent)</span></div>' +
        skills.map(function (s) {
          var v = r.ratings && r.ratings[s.key];
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:7px 0;border-bottom:1px solid #f1f5f9;">' +
            '<div style="font-size:13px;font-weight:800;">' + esc(s.label) + '</div>' +
            '<div data-skill="' + s.key + '" data-val="' + (v || '') + '" style="display:flex;gap:4px;align-items:center;">' +
              [1, 2, 3, 4, 5].map(function (n) {
                return '<button type="button" data-n="' + n + '" title="' + LABELS[n] + '" style="width:34px;height:34px;border-radius:50%;border:2px solid #c4b5fd;background:' + (v && n <= v ? '#7c3aed' : '#fff') + ';color:' + (v && n <= v ? '#fff' : '#7c3aed') + ';font-weight:900;cursor:pointer;">' + n + '</button>';
              }).join('') +
              '<span class="rw-lbl" style="font-size:11px;font-weight:800;color:#7c3aed;min-width:110px;">' + (v ? LABELS[v] : '') + '</span>' +
            '</div></div>';
        }).join('') +
        '<label style="display:block;font-weight:900;font-size:14px;margin:14px 0 4px;">Remarks and observations</label>' +
        '<textarea id="rwRemarks" rows="4" maxlength="3000" placeholder="What went well in this unit, what ' + esc(r.student.name.split(' ')[0]) + ' found hard, how they behave in class…" style="width:100%;box-sizing:border-box;border:2px solid #e2e8f0;border-radius:12px;padding:10px;font-family:Nunito,sans-serif;font-size:14px;">' + esc(r.remarks || '') + '</textarea>' +
        '<label style="display:block;font-weight:900;font-size:14px;margin:12px 0 4px;">Recommendation for the parent</label>' +
        '<textarea id="rwRec" rows="3" maxlength="2000" placeholder="e.g. Practise 20 minutes on Scratch twice a week; revise loops before the next unit…" style="width:100%;box-sizing:border-box;border:2px solid #e2e8f0;border-radius:12px;padding:10px;font-family:Nunito,sans-serif;font-size:14px;">' + esc(r.recommendation || '') + '</textarea>' +
        '<div style="font-size:12px;color:#718096;font-weight:700;margin-top:6px;">Write in simple language — most parents are not technical.</div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">' +
          '<button id="rwCancel" style="background:#f1f5f9;border:none;border-radius:50px;padding:10px 20px;font-family:Nunito,sans-serif;font-weight:900;cursor:pointer;">Cancel</button>' +
          '<button id="rwSubmit" style="background:#7c3aed;color:#fff;border:none;border-radius:50px;padding:10px 22px;font-family:Nunito,sans-serif;font-weight:900;cursor:pointer;">' + (r.status === 'published' ? 'Save changes' : 'Publish report to parent') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(o);

    o.querySelectorAll('[data-skill]').forEach(function (row) {
      row.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          var n = Number(b.dataset.n);
          row.dataset.val = n;
          row.querySelectorAll('button').forEach(function (x) {
            var on = Number(x.dataset.n) <= n;
            x.style.background = on ? '#7c3aed' : '#fff'; x.style.color = on ? '#fff' : '#7c3aed';
          });
          row.querySelector('.rw-lbl').textContent = LABELS[n];
        };
      });
    });
    document.getElementById('rwCancel').onclick = function () { o.remove(); };
    document.getElementById('rwSubmit').onclick = async function () {
      var btn = this, ratings = {};
      o.querySelectorAll('[data-skill]').forEach(function (row) { ratings[row.dataset.skill] = Number(row.dataset.val) || 0; });
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        var res = await apiCall('/api/reports/' + r.id + '/comments', { method: 'PUT', body: {
          ratings: ratings, remarks: document.getElementById('rwRemarks').value, recommendation: document.getElementById('rwRec').value } });
        if (!res || !res.success) throw new Error((res && res.error) || 'Could not save');
        o.remove();
        toast(res.published ? '✅ Report published — the parent has been emailed.' : '✅ Report updated.', 'success');
        refresh();
      } catch (e) {
        btn.disabled = false; btn.textContent = r.status === 'published' ? 'Save changes' : 'Publish report to parent';
        toast('⚠️ ' + e.message, 'error');
      }
    };
  }

  window.SNTutorReports = { refresh: refresh, open: open };

  function start() {
    refresh();
    setInterval(refresh, 10 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 600); });
  else setTimeout(start, 600);
})();
