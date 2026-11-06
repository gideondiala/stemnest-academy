/**
 * finance.js — Finance tab on the Admin and HR dashboards.
 *
 *  • Every tutor's pay for a chosen month: classes, demos, students, class
 *    pay, late-join penalties and net pay, with totals.
 *  • One Excel workbook for the month: a Summary sheet (one row per tutor,
 *    totals as formulas) plus a sheet per tutor listing every paid class,
 *    so HR can prepare payouts without opening each tutor's dashboard.
 *
 * Class pay is the same figure each tutor sees in My Payments
 * (GET /api/class-ops/pay-summary). Load this after the dashboard's own
 * script; it adds the "finance" tab to ADMIN_TABS / HR_TABS.
 */
(function () {
  'use strict';
  var API = 'https://api.stemnestacademy.co.uk';
  var XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var OUTCOME = { completed: 'Completed', partially_completed: 'Partly completed (1/3 pay)', incomplete: 'Incomplete' };
  var state = { month: null, data: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ngn(n) { return '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function monthLabel(ym) { var p = String(ym).split('-'); return MONTHS[(+p[1]) - 1] + ' ' + p[0]; }
  function thisMonthWAT() { return new Date(Date.now() + 3600e3).toISOString().slice(0, 7); }
  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); else alert(msg); }

  async function api(path) {
    var res = await fetch(API + path, { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('sn_access_token') || '') } });
    var d = {};
    try { d = await res.json(); } catch (e) { d = { success: false, error: 'Server error (' + res.status + ')' }; }
    if (res.status === 401) throw new Error('Your session has expired — please log in again.');
    if (res.status === 403) throw new Error('You do not have access to tutor pay.');
    if (!res.ok || d.success === false) throw new Error(d.error || 'Could not load pay (' + res.status + ')');
    return d;
  }

  function container() { return document.getElementById('tab-finance'); }

  function shell() {
    var el = container();
    if (!el || el.dataset.ready) return;
    el.dataset.ready = '1';
    el.innerHTML =
      '<div class="dash-section-header">' +
        '<div class="dash-section-title">💰 Finance — Tutor Pay</div>' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
          '<label for="finMonth" style="font-size:12px;font-weight:900;color:var(--mid);">Month</label>' +
          '<input type="month" id="finMonth" style="padding:8px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:\'Nunito\',sans-serif;font-size:13px;font-weight:700;outline:none;">' +
          '<button type="button" class="btn btn-primary" id="finDownload" style="font-size:13px;padding:8px 16px;">⬇ Download payout workbook</button>' +
        '</div>' +
      '</div>' +
      '<div id="finTiles" class="dash-stats" style="margin-bottom:18px;"></div>' +
      '<div id="finTable"></div>' +
      '<div style="font-size:12px;font-weight:700;color:var(--light);margin-top:12px;line-height:1.6;">' +
        'Class pay is what each tutor sees in My Payments for the month. Late joins after the first two in a month carry a penalty; net pay is class pay less penalties. ' +
        'The workbook has a summary sheet and one sheet per tutor listing every paid class.' +
      '</div>';
    var m = document.getElementById('finMonth');
    m.max = thisMonthWAT();
    m.value = state.month || thisMonthWAT();
    m.addEventListener('change', function () { if (m.value) load(m.value); });
    document.getElementById('finDownload').addEventListener('click', download);
  }

  function tile(cls, icon, value, label) {
    return '<div class="dstat ' + cls + '"><div class="dstat-icon di-' + cls.slice(3) + '">' + icon + '</div>' +
      '<div class="dstat-val">' + value + '</div><div class="dstat-label">' + label + '</div></div>';
  }

  async function load(month) {
    shell();
    state.month = month || state.month || thisMonthWAT();
    var tableEl = document.getElementById('finTable');
    var tilesEl = document.getElementById('finTiles');
    tableEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading pay for ' + esc(monthLabel(state.month)) + '…</div>';
    tilesEl.innerHTML = '';
    try {
      var d = await api('/api/class-ops/pay-summary?month=' + encodeURIComponent(state.month));
      if (d.month !== state.month) return;      /* a newer month was chosen meanwhile */
      state.data = d;
      var t = d.totals;
      var paidTutors = d.tutors.filter(function (x) { return x.classes > 0; }).length;
      tilesEl.innerHTML =
        tile('ds-green', '₦', ngn(t.netPay), 'Net pay · ' + esc(monthLabel(d.month))) +
        tile('ds-blue', '📚', ngn(t.classPay), 'Class pay (' + t.classes + ' class' + (t.classes === 1 ? '' : 'es') + ')') +
        tile('ds-orange', '⏰', ngn(t.penalties), 'Late-join penalties') +
        tile('ds-purple', '👩‍🏫', paidTutors + ' / ' + d.tutors.length, 'Tutors with classes');

      if (!d.tutors.length) { tableEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--light);font-weight:700;">No tutors found.</div>'; return; }
      var rows = d.tutors.map(function (x) {
        return '<tr' + (x.classes ? '' : ' style="color:var(--light);"') + '>' +
          '<td><strong>' + esc(x.tutorName) + '</strong>' + (x.staffId ? '<div style="font-size:11px;color:var(--light);">' + esc(x.staffId) + '</div>' : '') +
            (x.isActive ? '' : '<div style="font-size:11px;color:#c53030;font-weight:800;">inactive</div>') + '</td>' +
          '<td>' + x.classes + '<div style="font-size:11px;color:var(--light);">' + x.paid + ' paid · ' + x.demos + ' demo</div></td>' +
          '<td>' + x.students + '</td>' +
          '<td>' + ngn(x.classPay) + '</td>' +
          '<td>' + (x.lateJoins ? x.lateJoins + (x.penalties ? ' · <span style="color:#c53030;">−' + ngn(x.penalties) + '</span>' : ' · pardoned') : '—') + '</td>' +
          '<td><strong>' + ngn(x.netPay) + '</strong></td>' +
        '</tr>';
      }).join('');
      tableEl.innerHTML =
        '<div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Tutor</th><th>Classes</th><th>Students</th><th>Class pay</th><th>Late joins</th><th>Net pay</th></tr></thead>' +
          '<tbody>' + rows +
            '<tr style="background:#f8fafc;font-weight:900;"><td>Total</td><td>' + t.classes + '</td><td>' + t.students + '</td><td>' + ngn(t.classPay) +
            '</td><td>' + (t.penalties ? '−' + ngn(t.penalties) : '—') + '</td><td>' + ngn(t.netPay) + '</td></tr>' +
          '</tbody></table></div>';
    } catch (e) {
      tableEl.innerHTML = '<div style="padding:24px;color:#c53030;font-weight:700;">⚠️ ' + esc(e.message) + '</div>';
    }
  }

  function loadXLSX() {
    return new Promise(function (resolve, reject) {
      if (window.XLSX) return resolve(window.XLSX);
      var s = document.createElement('script');
      s.src = XLSX_SRC;
      s.onload = function () { resolve(window.XLSX); };
      s.onerror = function () { reject(new Error('Could not load the Excel tool — check your connection.')); };
      document.head.appendChild(s);
    });
  }

  /* Excel sheet names: at most 31 characters, none of : \ / ? * [ ], and unique */
  function sheetName(name, used) {
    var base = String(name || 'Tutor').replace(/[:\\\/?*\[\]]/g, ' ').trim().slice(0, 28) || 'Tutor';
    var n = base, i = 2;
    while (used[n.toLowerCase()]) n = base.slice(0, 26) + ' ' + (i++);
    used[n.toLowerCase()] = true;
    return n;
  }

  function money(ws, from, to, col) {
    for (var r = from; r <= to; r++) { var c = ws[col + r]; if (c && typeof c.v === 'number') c.z = '"₦"#,##0.00'; }
  }

  async function download() {
    var btn = document.getElementById('finDownload');
    var month = state.month;
    if (!month) return;
    btn.disabled = true; btn.textContent = '⏳ Preparing…';
    try {
      var parts = await Promise.all([
        api('/api/class-ops/pay-summary?month=' + encodeURIComponent(month)),
        api('/api/class-ops/pay-summary/' + encodeURIComponent(month) + '/classes'),
        loadXLSX(),
      ]);
      var sum = parts[0], lines = parts[1].classes || [], X = parts[2];
      var wb = X.utils.book_new();

      /* Summary: one row per tutor, totals as formulas */
      var HEAD = ['Staff ID', 'Tutor', 'Email', 'Phone', 'Classes', 'Paid classes', 'Demo classes', 'Students taught', 'Class pay (₦)', 'Late joins', 'Penalties (₦)', 'Net pay (₦)'];
      var aoa = [
        ['StemNest Academy — Tutor Payouts'],
        ['Month', monthLabel(month)],
        ['Currency', 'Nigerian Naira (₦)'],
        ['Downloaded', new Date().toLocaleString('en-GB')],
        [],
        HEAD,
      ];
      var first = aoa.length + 1;
      sum.tutors.forEach(function (x) {
        aoa.push([x.staffId || '', x.tutorName, x.email || '', x.phone || '', x.classes, x.paid, x.demos, x.students, x.classPay, x.lateJoins, x.penalties, x.netPay]);
      });
      var last = aoa.length;
      aoa.push(['', 'TOTAL', '', '']);
      var ws = X.utils.aoa_to_sheet(aoa);
      var totalRow = aoa.length;
      ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach(function (col) {
        var key = { E: 'classes', F: 'paid', G: 'demos', H: 'students', I: 'classPay', J: 'lateJoins', K: 'penalties', L: 'netPay' }[col];
        ws[col + totalRow] = { t: 'n', v: sum.totals[key], f: sum.tutors.length ? 'SUM(' + col + first + ':' + col + last + ')' : undefined };
      });
      ['I', 'K', 'L'].forEach(function (col) { money(ws, first, totalRow, col); });
      ws['!cols'] = [{ wch: 10 }, { wch: 26 }, { wch: 28 }, { wch: 16 }, { wch: 9 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 15 }];
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }];
      if (sum.tutors.length) ws['!autofilter'] = { ref: 'A' + (first - 1) + ':L' + last };
      X.utils.book_append_sheet(wb, ws, 'Summary');

      /* One sheet per tutor who had paid classes, same layout as the tutor's own pay sheet */
      var used = { summary: true };
      sum.tutors.filter(function (x) { return x.classes > 0; }).forEach(function (x) {
        var cls = lines.filter(function (c) { return c.tutorId === x.tutorId; });
        var rows = [
          ['StemNest Academy — Tutor Pay Sheet'],
          ['Tutor', x.tutorName + (x.staffId ? ' (' + x.staffId + ')' : '')],
          ['Month', monthLabel(month)],
          [],
          ['#', 'Class date', 'Time (WAT)', 'Class type', 'Student(s)', 'Students completed', 'Outcome', 'Subject', 'Ended on', 'Amount (₦)'],
        ];
        var f1 = rows.length + 1;
        cls.forEach(function (c, i) {
          rows.push([i + 1, c.classDate, c.classTime, c.type === 'demo' ? 'Demo' : (c.isBatch ? 'Paid — group' : 'Paid — 1-on-1'),
                     c.studentNames || (c.batchRef ? 'Batch ' + c.batchRef : ''), c.studentsCount, OUTCOME[c.outcome] || c.outcome || 'Completed',
                     c.subject || '', c.endedAt || '', c.amount]);
        });
        var l1 = rows.length;
        rows.push([]);
        rows.push(['', 'Class pay', '', '', '', '', '', '', '', x.classPay]);
        rows.push(['', 'Late-join penalties (' + x.lateJoins + ' late join' + (x.lateJoins === 1 ? '' : 's') + ')', '', '', '', '', '', '', '', -x.penalties]);
        rows.push(['', 'NET PAY', '', '', '', '', '', '', '', x.netPay]);
        var tws = X.utils.aoa_to_sheet(rows);
        var r = rows.length;
        if (cls.length) {
          tws['J' + (r - 2)] = { t: 'n', v: x.classPay, f: 'SUM(J' + f1 + ':J' + l1 + ')' };
          tws['J' + r] = { t: 'n', v: x.netPay, f: 'J' + (r - 2) + '+J' + (r - 1) };
        }
        money(tws, f1, r, 'J');
        tws['!cols'] = [{ wch: 5 }, { wch: 13 }, { wch: 11 }, { wch: 16 }, { wch: 34 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 17 }, { wch: 14 }];
        tws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
        X.utils.book_append_sheet(wb, tws, sheetName(x.tutorName, used));
      });

      X.writeFile(wb, 'StemNest-Tutor-Payouts-' + month + '.xlsx');
      toast('✅ Payout workbook for ' + monthLabel(month) + ' downloaded.', 'success');
    } catch (e) {
      toast('⚠️ ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '⬇ Download payout workbook';
    }
  }

  /* ── Plug the tab into whichever dashboard loaded this ── */
  function onShow(tab) { if (tab === 'finance') load(state.month); }
  if (typeof ADMIN_TABS !== 'undefined' && ADMIN_TABS.indexOf('finance') < 0) ADMIN_TABS.push('finance');
  if (typeof HR_TABS !== 'undefined' && HR_TABS.indexOf('finance') < 0) HR_TABS.push('finance');
  ['showAdminTab', 'showHRTab'].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function (tab) { orig.apply(this, arguments); onShow(tab); };
  });
  window.SNFinance = { load: load, download: download };
})();
