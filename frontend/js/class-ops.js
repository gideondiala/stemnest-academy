/**
 * class-ops.js — tutor dashboard: ending classes, pay and late joins.
 *
 *  • End Class: paid classes use a simple form (outcome + tick the students
 *    who attended). Each ticked student is charged 1 credit and the tutor is
 *    paid by the number attending. Demo classes keep the demo report form.
 *    Everything is saved by the server (POST /api/bookings/:id/report).
 *  • Classes not ended yet are listed on the Overview with an End button.
 *  • My Payments: this month's pay (Naira, resets each month) and the
 *    previous months, each with an Excel pay sheet.
 *  • Joining a class is timed by the server (late joins).
 * Loaded last on tutor-dashboard.html (after api.js, dashboard.js,
 * tutor-companion.js, tutor-sessions.js, tutor-sessions-v2.js).
 */
(function () {
  'use strict';
  if (!/tutor-dashboard(\.html)?$/.test(location.pathname)) return;

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var INCOMPLETE_REASONS = ['Student Not Joined', 'Student Power Failure', 'Student Internet', 'Student Network',
                            'Student PC Issue', 'Student Medical', 'Tutor Power / Internet Issue', 'No Show', 'Other'];
  var state = { pay: null, rates: null, unended: [], late: [] };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ngn(n) { return '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function setText(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); else alert(msg); }
  function monthLabel(ym) { var p = String(ym).split('-'); return MONTHS[(+p[1]) - 1] + ' ' + p[0]; }
  function bookings() { return (window.TUTOR_DATA && window.TUTOR_DATA.bookings) || []; }
  function findBooking(id) {
    var b = bookings().find(function (x) { return x.id === id; });
    if (b) return b;
    var u = state.unended.find(function (x) { return x.id === id; });
    return u ? { id: u.id, studentName: u.studentName || '—', isDemoClass: u.isDemo === true, isBatchClass: !!u.batchId,
                 batchId: u.batchId || '', batchRef: u.batchRef || '', date: u.date, time: u.time, subject: u.subject || '' } : null;
  }
  function rerender() {
    ['renderUpcomingCards', 'renderSessionsTab', 'renderOverviewSessions', 'renderWeeklyCalendar'].forEach(function (f) {
      try { if (typeof window[f] === 'function') window[f](); } catch (e) { /* keep going */ }
    });
  }

  /* ══════════════ PAY ══════════════ */
  async function refreshPay() {
    try {
      var d = await apiCall('/api/class-ops/my-pay');
      if (!d) return;
      state.pay = d; state.rates = d.rates;
      setText('overviewEarnings', ngn(d.currentMonth.total));
      setText('liveEarnings', ngn(d.currentMonth.total));
      var tab = document.getElementById('tab-payments');
      if (tab && tab.style.display !== 'none') renderPayments();
    } catch (e) { /* offline — keep what is shown */ }
  }
  window.refreshTutorPay = refreshPay;

  /* Pay and credits are settled by the server now; retire the browser-side copies */
  window._addEarnings = function () { refreshPay(); };
  window._deductStudentCredit = function () {};
  window.addSessionEarning = function () { refreshPay(); };
  window._refreshOverviewCards = function () {
    var all = bookings();
    setText('statCompletedDemo', all.filter(function (b) { return b.status === 'completed' && b.isDemoClass === true; }).length);
    setText('statCompletedPaid', all.filter(function (b) { return (b.status === 'completed' || b.status === 'partially_completed') && b.isDemoClass !== true; }).length);
    refreshPay();
  };
  var origBadges = window.updateEarningsBadges;
  window.updateEarningsBadges = function () {
    try { if (typeof origBadges === 'function') origBadges(); } catch (e) {}
    if (state.pay) setText('liveEarnings', ngn(state.pay.currentMonth.total));
    showLate();
  };
  /* The old browser-only earnings sheet on the leaderboard → point to My Payments */
  window.renderEarningsSheet = function () {
    var c = document.getElementById('tab-leaderboard');
    if (!c) return;
    var old = document.getElementById('earningsSheetSection'); if (old) old.remove();
    var s = document.createElement('div');
    s.id = 'earningsSheetSection'; s.style.cssText = 'margin-top:28px;';
    s.innerHTML = '<div style="background:#fff;border-radius:20px;padding:20px 24px;box-shadow:0 4px 20px rgba(0,0,0,.08);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
      '<div style="font-weight:800;color:var(--mid);">💰 Your pay for each class, month by month, is in <strong>My Payments</strong>.</div>' +
      '<button onclick="showDashTab(\'payments\')" style="background:var(--green,#0e9f6e);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-family:Nunito,sans-serif;font-weight:900;cursor:pointer;">Open My Payments →</button></div>';
    c.appendChild(s);
  };
  window.downloadMonthlyPaysheet = function (month, year) {
    downloadPaySheet(year + '-' + String(month).padStart(2, '0'));
  };

  /* ══════════════ LATE JOINS ══════════════ */
  window.logLateJoin = function () { /* recorded by the server when Join is clicked */ };
  var origJoin = window.teacherJoinClass;
  window.teacherJoinClass = function (bookingId) {
    var r = typeof origJoin === 'function' ? origJoin.apply(this, arguments) : undefined;
    if (UUID_RE.test(String(bookingId))) {
      apiCall('/api/class-ops/' + bookingId + '/join', { method: 'POST' }).then(function (d) {
        if (!d || !d.late || d.alreadyJoined) return;
        if (d.pardoned) toast('⚠️ You joined ' + d.minsLate + ' min late. Late join ' + d.nthInMonth + ' of ' + d.pardonedPerMonth + ' pardoned this month.', 'info');
        else toast('⚠️ You joined ' + d.minsLate + ' min late — late join #' + d.nthInMonth + ' this month, so a ₦' + Number(d.penalty).toLocaleString() + ' penalty has been logged.', 'error');
        refreshLate();
      }).catch(function () {});
    }
    return r;
  };
  async function refreshLate() {
    try { var d = await apiCall('/api/class-ops/late-joins'); if (d) { state.late = d.lateJoins || []; showLate(); } } catch (e) {}
  }
  function showLate() {
    var n = state.late.length;
    setText('lateJoins', n);
    setText('lateJoinNote', n <= 2 ? n + '/2 pardoned this month' : (n - 2) + ' × ₦1,000 penalty logged');
  }

  /* ══════════════ END CLASS ══════════════ */
  function modal(id, html) {
    var old = document.getElementById(id); if (old) old.remove();
    var o = document.createElement('div');
    o.id = id;
    o.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
    o.innerHTML = '<div style="background:#fff;border-radius:20px;padding:24px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;font-family:Nunito,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.25);">' + html + '</div>';
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }
  function who(b) { return b.isBatchClass && b.batchRef ? 'Batch ' + b.batchRef : (b.studentName || '—'); }
  function infoLine(b) {
    return '<div style="font-size:13px;font-weight:700;color:var(--mid,#4a5568);margin-bottom:16px;">' +
      '<strong>' + esc(who(b)) + '</strong>' + (b.lessonName || b.subject ? ' · ' + esc(b.lessonName || b.subject) : '') +
      ' · ' + esc(b.date || '') + ' at ' + esc(String(b.time || '').slice(0, 5)) + '</div>';
  }
  var btn = 'border:none;border-radius:50px;padding:11px 22px;font-family:Nunito,sans-serif;font-weight:900;font-size:14px;cursor:pointer;';

  window.openEndClassDialogV2 = function (bookingId) {
    var b = findBooking(bookingId);
    if (!b) { toast('Booking not found — please refresh the page.', 'error'); return; }
    if (b.isDemoClass === true) openDemoEnd(b); else openPaidEnd(b);
  };
  var origOpenEndClassModal = window.openEndClassModal;
  window.openEndClassModal = function (bookingId) {
    var b = findBooking(bookingId);
    if (b && b.isDemoClass !== true) { openPaidEnd(b); return; }
    if (typeof origOpenEndClassModal === 'function') origOpenEndClassModal(bookingId);
  };

  function outcomeCards(name, opts) {
    return opts.map(function (o) {
      return '<label style="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:2px solid #e8eaf0;border-radius:14px;cursor:pointer;margin-bottom:8px;">' +
        '<input type="radio" name="' + name + '" value="' + o[0] + '" style="margin-top:3px;width:auto;">' +
        '<div><div style="font-weight:900;font-size:14px;">' + o[1] + '</div><div style="font-size:12px;font-weight:600;color:#718096;">' + o[2] + '</div></div></label>';
    }).join('');
  }
  function reasonSelect(id) {
    return '<select id="' + id + '" style="width:100%;padding:11px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:Nunito,sans-serif;font-size:14px;margin-bottom:8px;">' +
      '<option value="">— Select a reason —</option>' + INCOMPLETE_REASONS.map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select>';
  }
  var inputCss = 'width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:Nunito,sans-serif;font-size:14px;';

  /* ── Paid class: outcome + who attended ── */
  function openPaidEnd(b) {
    var o = modal('paidEndOverlay',
      '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;margin-bottom:4px;">🔴 End Class</div>' + infoLine(b) +
      '<div style="font-size:12px;font-weight:900;color:#4a5568;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">1 · How did the class go?</div>' +
      outcomeCards('peOutcome', [
        ['completed', '✅ Completed', 'The full lesson was delivered'],
        ['partially_completed', '◐ Partially completed', 'At least half the lesson was covered — one-third pay'],
        ['incomplete', '❌ Incomplete', 'The class did not hold — no pay, no credit; the lesson moves to the next slot'],
      ]) +
      '<div id="peAttend" style="display:none;margin-top:14px;">' +
        '<div style="font-size:12px;font-weight:900;color:#4a5568;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">2 · Tick the students who attended</div>' +
        '<div style="font-size:12px;font-weight:700;color:#718096;margin:-4px 0 8px;">Each ticked student uses 1 class credit.</div>' +
        '<div id="peStudents"><div style="font-size:13px;color:#718096;font-weight:700;">⏳ Loading students…</div></div>' +
        '<div id="pePay" style="margin-top:10px;font-size:13px;font-weight:900;color:#0e9f6e;"></div>' +
        '<textarea id="peNotes" placeholder="Homework or a note for the parent (optional)" style="' + inputCss + 'min-height:64px;margin-top:12px;resize:vertical;"></textarea>' +
        '<input id="peRec" type="url" placeholder="Recording link (optional)" style="' + inputCss + 'margin-top:8px;">' +
      '</div>' +
      '<div id="peIncomplete" style="display:none;margin-top:14px;">' +
        '<div style="font-size:12px;font-weight:900;color:#4a5568;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">2 · Why was the class incomplete?</div>' +
        reasonSelect('peReason') +
        '<input id="peReasonMore" placeholder="More detail (optional)" style="' + inputCss + '">' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">' +
        '<button id="peCancel" style="' + btn + 'background:#f1f5f9;color:#4a5568;">Cancel</button>' +
        '<button id="peSubmit" style="' + btn + 'background:#1a56db;color:#fff;">Submit</button></div>');

    var students = [];
    var loaded = loadStudents(b).then(function (list) {
      students = list;
      var box = document.getElementById('peStudents');
      if (!box) return;
      box.innerHTML = list.length ? list.map(function (s) {
        return '<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1.5px solid #e8eaf0;border-radius:10px;margin-bottom:6px;cursor:pointer;font-size:14px;font-weight:800;">' +
          '<input type="checkbox" class="peStu" value="' + esc(s.id) + '" style="width:18px;height:18px;"> ' + esc(s.name) +
          (s.note ? ' <span style="font-size:11px;color:#c53030;font-weight:800;">' + esc(s.note) + '</span>' : '') + '</label>';
      }).join('') : '<div style="font-size:13px;color:#c53030;font-weight:700;">Could not load the student list — all students will be marked present.</div>';
      box.querySelectorAll('.peStu').forEach(function (cb) { cb.addEventListener('change', payPreview); });
      payPreview();
    });

    function outcome() { var r = o.querySelector('input[name="peOutcome"]:checked'); return r ? r.value : ''; }
    function ticked() { return Array.prototype.map.call(o.querySelectorAll('.peStu:checked'), function (cb) { return cb.value; }); }
    function payPreview() {
      var el = document.getElementById('pePay'); if (!el) return;
      var n = ticked().length, oc = outcome(), r = state.rates;
      if (!r || !n || (oc !== 'completed' && oc !== 'partially_completed')) { el.textContent = ''; return; }
      var full = r['paid' + Math.min(3, n)] || 0;
      var amt = oc === 'partially_completed' ? Math.round(full / 3 * 100) / 100 : full;
      el.textContent = amt > 0 ? '💰 You will earn ' + ngn(amt) + ' for ' + n + ' student' + (n === 1 ? '' : 's') + (oc === 'partially_completed' ? ' (one-third pay)' : '') : '';
    }
    o.querySelectorAll('input[name="peOutcome"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var oc = outcome();
        document.getElementById('peAttend').style.display = oc && oc !== 'incomplete' ? 'block' : 'none';
        document.getElementById('peIncomplete').style.display = oc === 'incomplete' ? 'block' : 'none';
        payPreview();
      });
    });
    document.getElementById('peCancel').onclick = function () { o.remove(); };
    document.getElementById('peSubmit').onclick = async function () {
      var oc = outcome();
      if (!oc) { toast('Please choose how the class went.', 'error'); return; }
      var body = { outcome: oc };
      if (oc === 'incomplete') {
        var reason = document.getElementById('peReason').value;
        if (!reason) { toast('Please select a reason.', 'error'); return; }
        var more = document.getElementById('peReasonMore').value.trim();
        body.incompleteReason = reason + (more ? ' — ' + more : '');
      } else {
        await loaded;
        var ids = ticked();
        if (students.length && !ids.length) { toast('Tick the students who attended — or choose Incomplete if nobody did.', 'error'); return; }
        if (ids.length && ids.every(function (x) { return UUID_RE.test(x); })) body.attendees = ids;
        body.notes = document.getElementById('peNotes').value.trim();
        var rec = document.getElementById('peRec').value.trim();
        if (rec) body.recordingLink = rec;
      }
      submitReport(b, body, this, function () { o.remove(); });
    };
  }

  /* The class's students: the batch members, or the 1-on-1 student */
  async function loadStudents(b) {
    if (b.isBatchClass && b.batchId) {
      try {
        var d = await apiCall('/api/batches/' + b.batchId);
        return (d.members || []).filter(function (m) { return m.status === 'active'; })
          .map(function (m) { return { id: m.studentId, name: m.studentName || 'Student', note: m.classPaused ? 'on hold — not charged' : '' }; });
      } catch (e) { return []; }
    }
    return [{ id: b.studentId || 'student', name: b.studentName || 'Student' }];
  }

  /* ── Demo class: the demo report form for Completed; simple forms otherwise ── */
  function openDemoEnd(b) {
    var o = modal('demoEndOverlay',
      '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;margin-bottom:4px;">🎓 End Demo Class</div>' + infoLine(b) +
      outcomeCards('deOutcome', [
        ['completed', '✅ Completed', 'Demo delivered — fill in the demo report next'],
        ['partially_completed', '◐ Partially completed', 'Demo partly delivered'],
        ['incomplete', '❌ Incomplete', 'The demo did not hold'],
      ]) +
      '<div id="deIncomplete" style="display:none;margin-top:10px;">' + reasonSelect('deReason') + '</div>' +
      '<div id="dePartial" style="display:none;margin-top:10px;"><textarea id="dePartialWhy" placeholder="Why did the demo end early?" style="' + inputCss + 'min-height:64px;"></textarea></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">' +
        '<button id="deCancel" style="' + btn + 'background:#f1f5f9;color:#4a5568;">Cancel</button>' +
        '<button id="deSubmit" style="' + btn + 'background:#1a56db;color:#fff;">Continue →</button></div>');
    function outcome() { var r = o.querySelector('input[name="deOutcome"]:checked'); return r ? r.value : ''; }
    o.querySelectorAll('input[name="deOutcome"]').forEach(function (r) {
      r.addEventListener('change', function () {
        document.getElementById('deIncomplete').style.display = outcome() === 'incomplete' ? 'block' : 'none';
        document.getElementById('dePartial').style.display = outcome() === 'partially_completed' ? 'block' : 'none';
      });
    });
    document.getElementById('deCancel').onclick = function () { o.remove(); };
    document.getElementById('deSubmit').onclick = function () {
      var oc = outcome();
      if (!oc) { toast('Please choose how the demo went.', 'error'); return; }
      if (oc === 'completed') {
        o.remove();
        if (typeof _handleDemoOutcome === 'function') _handleDemoOutcome(b.id, b, 'completed', {});
        return;
      }
      if (oc === 'incomplete') {
        var reason = document.getElementById('deReason').value;
        if (!reason) { toast('Please select a reason.', 'error'); return; }
        submitReport(b, { outcome: 'incomplete', incompleteReason: reason }, this, function () { o.remove(); });
      } else {
        var why = document.getElementById('dePartialWhy').value.trim();
        if (!why) { toast('Please say why the demo ended early.', 'error'); return; }
        submitReport(b, { outcome: 'partially_completed', notes: why }, this, function () { o.remove(); });
      }
    };
  }

  async function submitReport(b, body, button, done) {
    var label = button.textContent;
    button.disabled = true; button.textContent = '⏳ Saving…';
    try {
      var d = await apiCall('/api/bookings/' + b.id + '/report', { method: 'POST', body: body });
      done();
      /* Reflect it straight away */
      var bk = bookings().find(function (x) { return x.id === b.id; });
      if (bk) {
        if (body.outcome === 'incomplete' && d.movedTo) {
          bk.incompleteHistory = (bk.incompleteHistory || []).concat([{ date: bk.date, time: bk.time, reason: body.incompleteReason, by: 'tutor' }]);
          bk.date = d.movedTo.d; bk.time = d.movedTo.t; bk.status = 'scheduled';
        } else {
          bk.status = body.outcome;
        }
      }
      try {
        if (typeof recordClassSession === 'function') {
          recordClassSession(b, body.outcome, body.incompleteReason || '', d.pay ? d.pay.amount : 0, body.outcome !== 'incomplete' && !b.isDemoClass);
        }
      } catch (e) {}
      var msg = body.outcome === 'incomplete'
        ? '❌ Class marked incomplete.' + (d.movedTo ? ' The lesson moved to ' + d.movedTo.d + ' at ' + String(d.movedTo.t).slice(0, 5) + '.' : '')
        : (body.outcome === 'completed' ? '✅ Class completed.' : '◐ Class marked partially completed.') +
          (d.pay && d.pay.amount ? ' ' + ngn(d.pay.amount) + ' added to your pay.' : '');
      toast(msg, body.outcome === 'incomplete' ? 'info' : 'success');
      rerender();
      refreshPay();
      refreshUnended();
    } catch (e) {
      button.disabled = false; button.textContent = label;
      toast('⚠️ ' + e.message, 'error');
    }
  }

  /* ══════════════ CLASSES NOT ENDED (Overview) ══════════════ */
  async function refreshUnended() {
    try {
      var d = await apiCall('/api/class-ops/unended');
      if (!d) return;
      state.unended = d.classes || [];
      renderUnended();
    } catch (e) {}
  }
  function renderUnended() {
    var host = document.getElementById('tab-overview');
    if (!host) return;
    var box = document.getElementById('unendedBanner');
    if (!state.unended.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'unendedBanner';
      host.insertBefore(box, host.firstChild);
    }
    var overdue = state.unended.some(function (c) { return c.minsSinceEnd >= 120; });
    box.style.cssText = 'background:' + (overdue ? '#fef2f2' : '#fffbeb') + ';border:2px solid ' + (overdue ? '#fca5a5' : '#fcd34d') +
      ';border-radius:16px;padding:16px 18px;margin-bottom:20px;font-family:Nunito,sans-serif;';
    box.innerHTML =
      '<div style="font-weight:900;font-size:15px;color:' + (overdue ? '#991b1b' : '#92400e') + ';margin-bottom:4px;">⏳ ' +
        state.unended.length + ' class' + (state.unended.length === 1 ? '' : 'es') + ' waiting to be ended</div>' +
      '<div style="font-size:12px;font-weight:700;color:#4a5568;margin-bottom:10px;">Please mark each class as completed, partially completed or incomplete. ' +
        'Classes not ended within 2 hours get a reminder email, and Admin may mark them incomplete.</div>' +
      state.unended.map(function (c) {
        var late = c.minsSinceEnd >= 120;
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#fff;border-radius:12px;padding:9px 12px;margin-bottom:6px;">' +
          '<div style="font-size:13px;font-weight:800;">' + esc(c.date) + ' · ' + esc(c.time) + ' — ' + esc(c.batchRef ? 'Batch ' + c.batchRef : (c.studentName || 'Student')) +
            (c.isDemo ? ' <span style="color:#7c3aed;">(demo)</span>' : '') +
            (late ? ' <span style="color:#dc2626;font-size:11px;">overdue</span>' : '') + '</div>' +
          '<button onclick="openEndClassDialogV2(\'' + c.id + '\')" style="background:' + (late ? '#dc2626' : '#f59e0b') + ';color:#fff;border:none;border-radius:50px;padding:7px 16px;font-family:Nunito,sans-serif;font-weight:900;font-size:12px;cursor:pointer;">🔴 End class</button></div>';
      }).join('');
  }

  /* ══════════════ MY PAYMENTS TAB ══════════════ */
  function ensurePaymentsTab() {
    if (document.getElementById('tab-payments')) return;
    var after = document.querySelector('.sidebar-link[data-tab="records"]') || document.querySelector('.sidebar-link[data-tab="leaderboard"]');
    if (after) {
      var a = document.createElement('a');
      a.className = 'sidebar-link'; a.dataset.tab = 'payments';
      a.innerHTML = '<span class="sl-icon">💰</span> My Payments';
      a.onclick = function () { showDashTab('payments'); };
      after.parentNode.insertBefore(a, after.nextSibling);
    }
    var ref = document.getElementById('tab-records') || document.getElementById('tab-overview');
    var tab = document.createElement('div');
    tab.id = 'tab-payments'; tab.style.display = 'none';
    if (ref && ref.parentNode) ref.parentNode.insertBefore(tab, ref.nextSibling);
    if (typeof EXTRA_TABS !== 'undefined' && EXTRA_TABS.indexOf('payments') === -1) EXTRA_TABS.push('payments');
    var prev = window.showDashTab;
    window.showDashTab = function (t) {
      prev(t);
      if (t === 'payments') { renderPayments(); refreshPay(); }
    };
  }

  function renderPayments() {
    var tab = document.getElementById('tab-payments');
    if (!tab) return;
    var p = state.pay;
    if (!p) { tab.innerHTML = '<div style="padding:30px;text-align:center;font-weight:800;color:var(--light);">⏳ Loading your payments…</div>'; return; }
    var cur = p.currentMonth, r = p.rates || {};
    var rateLine = r.configured
      ? 'Pay per class: Demo ' + ngn(r.demo) + ' · 1 student ' + ngn(r.paid1) + ' · 2 students ' + ngn(r.paid2) + ' · 3+ students ' + ngn(r.paid3) + ' · Partly completed = one-third'
      : 'Pay rates are being set up by Admin.';
    tab.innerHTML =
      '<div class="dash-section-header"><div class="dash-section-title">💰 My Payments</div>' +
        '<span style="font-size:12px;font-weight:700;color:var(--light);">In Naira. Your pay starts again from ₦0 on the 1st of each month; past months are kept below.</span></div>' +
      '<div style="background:linear-gradient(135deg,#0e9f6e,#1a56db);color:#fff;border-radius:20px;padding:24px;margin-bottom:22px;box-shadow:0 8px 24px rgba(26,86,219,.18);">' +
        '<div style="font-size:13px;font-weight:800;opacity:.9;">' + esc(monthLabel(cur.month)) + ' · so far</div>' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:40px;line-height:1.2;margin:4px 0;">' + ngn(cur.total) + '</div>' +
        '<div style="font-size:13px;font-weight:800;opacity:.95;">' + cur.classes + ' class' + (cur.classes === 1 ? '' : 'es') + ' · ' +
          cur.demos + ' demo · ' + cur.paid + ' paid · ' + cur.students + ' student attendance' + (cur.students === 1 ? '' : 's') + '</div>' +
        '<button onclick="SNClassOps.downloadPaySheet(\'' + cur.month + '\')" style="margin-top:14px;background:#fff;color:#1a56db;border:none;border-radius:50px;padding:9px 18px;font-family:Nunito,sans-serif;font-weight:900;font-size:13px;cursor:pointer;">📄 View pay details (Excel)</button>' +
      '</div>' +
      '<div style="font-size:12px;font-weight:700;color:var(--mid);margin:-8px 0 18px;">' + esc(rateLine) + '</div>' +
      '<div class="dash-section-header"><div class="dash-section-title">Previous months</div></div>' +
      (p.previousMonths.length
        ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">' + p.previousMonths.map(function (m) {
            return '<div style="background:#fff;border:1.5px solid #e8eaf0;border-radius:16px;padding:18px;">' +
              '<div style="font-weight:900;color:var(--mid);font-size:13px;">' + esc(monthLabel(m.month)) + '</div>' +
              '<div style="font-family:\'Fredoka One\',cursive;font-size:26px;color:#0e9f6e;margin:4px 0;">' + ngn(m.total) + '</div>' +
              '<div style="font-size:12px;font-weight:700;color:var(--light);margin-bottom:12px;">' + m.classes + ' classes · ' + m.demos + ' demo · ' + m.paid + ' paid</div>' +
              '<button onclick="SNClassOps.downloadPaySheet(\'' + m.month + '\')" style="width:100%;background:#eef4ff;color:#1a56db;border:1.5px solid #c7d7fe;border-radius:10px;padding:8px;font-family:Nunito,sans-serif;font-weight:900;font-size:13px;cursor:pointer;">📄 View pay details</button></div>';
          }).join('') + '</div>'
        : '<div style="background:#fff;border:1.5px dashed #e8eaf0;border-radius:16px;padding:22px;text-align:center;font-weight:700;color:var(--light);">Past months will appear here from next month.</div>');
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

  var OUTCOME = { completed: 'Completed', partially_completed: 'Partly completed (1/3 pay)', incomplete: 'Incomplete' };

  async function downloadPaySheet(month) {
    try {
      toast('⏳ Preparing your pay sheet…', 'info');
      var parts = await Promise.all([apiCall('/api/class-ops/my-pay/' + month), loadXLSX()]);
      var d = parts[0], X = parts[1];
      var cls = d.classes || [];
      var tutor = d.tutor || {};
      var HEAD = ['#', 'Class date', 'Time (WAT)', 'Class type', 'Student(s)', 'Students completed', 'Outcome', 'Subject', 'Ended on', 'Amount (₦)'];
      var aoa = [
        ['StemNest Academy — Tutor Pay Sheet'],
        ['Tutor', (tutor.name || '') + (tutor.staffId ? ' (' + tutor.staffId + ')' : '')],
        ['Month', monthLabel(month)],
        ['Currency', 'Nigerian Naira (₦)'],
        ['Downloaded', new Date().toLocaleString('en-GB')],
        [],
        HEAD,
      ];
      var first = aoa.length + 1;
      cls.forEach(function (c, i) {
        aoa.push([i + 1, c.classDate, c.classTime, c.type === 'demo' ? 'Demo' : (c.isBatch ? 'Paid — group' : 'Paid — 1-on-1'),
                  c.studentNames || (c.batchRef ? 'Batch ' + c.batchRef : ''), c.studentsCount, OUTCOME[c.outcome] || c.outcome || 'Completed',
                  c.subject || '', c.endedAt || '', c.amount]);
      });
      var last = aoa.length;
      var demo = cls.filter(function (c) { return c.type === 'demo'; });
      var paid = cls.filter(function (c) { return c.type !== 'demo'; });
      var sum = function (a) { return a.reduce(function (t, c) { return t + c.amount; }, 0); };
      aoa.push([]);
      aoa.push(['', 'Summary', 'Classes', '', '', 'Students', '', '', '', 'Amount (₦)']);
      aoa.push(['', 'Demo classes', demo.length, '', '', demo.length, '', '', '', sum(demo)]);
      aoa.push(['', 'Paid classes', paid.length, '', '', paid.reduce(function (t, c) { return t + c.studentsCount; }, 0), '', '', '', sum(paid)]);
      aoa.push(['', 'TOTAL PAY', cls.length, '', '', '', '', '', '', d.total]);

      var ws = X.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 5 }, { wch: 13 }, { wch: 11 }, { wch: 16 }, { wch: 34 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 17 }, { wch: 14 }];
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
      if (cls.length) ws['!autofilter'] = { ref: 'A' + (first - 1) + ':J' + last };
      /* Money format on the amount column */
      for (var r = first; r <= aoa.length; r++) {
        var cell = ws['J' + r];
        if (cell && typeof cell.v === 'number') cell.z = '"₦"#,##0.00';
      }
      /* Total as a live formula, so edits in Excel still add up */
      if (cls.length) ws['J' + aoa.length] = { t: 'n', v: d.total, f: 'SUM(J' + first + ':J' + last + ')', z: '"₦"#,##0.00' };
      var wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, 'Pay ' + month);
      X.writeFile(wb, 'StemNest-Pay-' + (tutor.staffId || 'tutor') + '-' + month + '.xlsx');
    } catch (e) {
      toast('⚠️ ' + e.message, 'error');
    }
  }

  window.SNClassOps = { refreshPay: refreshPay, refreshUnended: refreshUnended, downloadPaySheet: downloadPaySheet };

  function start() {
    ensurePaymentsTab();
    refreshPay();
    refreshLate();
    refreshUnended();
    setInterval(refreshUnended, 5 * 60 * 1000);
    if (location.hash === '#payments') setTimeout(function () { showDashTab('payments'); }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 300); });
  else setTimeout(start, 300);
})();
