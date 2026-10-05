/**
 * student-credits.js — the student's Payments tab: credit balance, the
 * Top up button (opens the latest payment link the team sent), the credit
 * activity log and payments received. All data comes from the server
 * (GET /api/payments/credit-log/me, GET /api/payments/my-top-up).
 * Loaded last on student-dashboard.html.
 */
(function () {
  'use strict';
  if (!/student-dashboard(\.html)?$/.test(location.pathname)) return;

  var state = { log: null, link: undefined, loading: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(amount, currency) {
    if (amount == null || amount === '') return '';
    try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', maximumFractionDigits: 2 }).format(amount); }
    catch (e) { return (currency || '') + ' ' + amount; }
  }
  function day(d) {
    if (!d) return '—';
    var x = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(d);
    return isNaN(x) ? '—' : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  var METHOD = { bank_transfer: 'bank transfer', card: 'card', cash: 'cash', ussd: 'USSD', mobile_money: 'mobile money',
                 banktransfer: 'bank transfer', referral_reward: 'referral reward', other: 'other' };

  async function load(force) {
    if (state.loading && !force) return state.loading;
    state.loading = Promise.all([
      apiCall('/api/payments/credit-log/me').catch(function () { return null; }),
      apiCall('/api/payments/my-top-up').catch(function () { return null; }),
    ]).then(function (r) {
      state.log = r[0];
      state.link = r[1] ? r[1].link : null;
      return state;
    });
    return state.loading;
  }

  function topUpButton(big) {
    var l = state.link;
    var css = big
      ? 'display:inline-flex;align-items:center;gap:8px;background:#e65100;color:#fff;padding:13px 26px;border-radius:50px;font-family:Nunito,sans-serif;font-weight:900;font-size:15px;text-decoration:none;white-space:nowrap;border:none;cursor:pointer;'
      : 'display:block;margin-top:10px;background:#fff;color:#e65100;text-align:center;padding:9px 14px;border-radius:10px;font-family:Nunito,sans-serif;font-weight:900;font-size:13px;text-decoration:none;';
    if (l && l.url) {
      return '<a id="' + (big ? 'snTopUpBig' : 'topUpCreditsBtn') + '" href="' + esc(l.url) + '" target="_blank" rel="noopener" style="' + css + '">💳 Top up' +
        (big && l.amount ? ' — pay ' + esc(money(l.amount, l.currency)) + (l.credits ? ' for ' + l.credits + ' credits' : '') : '') + '</a>';
    }
    return '<a id="' + (big ? 'snTopUpBig' : 'topUpCreditsBtn') + '" href="#" onclick="SNCredits.noLink();return false;" style="' + css + 'opacity:.85;">💳 Top up</a>';
  }

  function activity(e) {
    var paid = e.amountPaid ? money(e.amountPaid, e.currency) : '';
    var how  = e.method ? METHOD[e.method] || e.method : '';
    switch (e.type) {
      case 'onboarding':
        return ['🎉 Enrolment', [paid && 'Paid ' + paid, how && 'by ' + how, e.paidAt && 'on ' + day(e.paidAt), e.reference && 'ref ' + e.reference].filter(Boolean).join(' ') || 'Credits added when you joined'];
      case 'topup':
        return ['💳 Payment', [paid && 'Paid ' + paid, how && 'by ' + how, e.paidAt && 'on ' + day(e.paidAt), e.reference && 'ref ' + e.reference].filter(Boolean).join(' ') || (e.description || 'Credits added')];
      case 'referral_reward':
        return ['🎁 Referral reward', (e.description || 'Thank you for referring a friend!').replace(/^Referral reward — /, '')];
      case 'class_deduction':
        return ['📚 Class completed', [e.classDate && day(e.classDate) + (e.classTime ? ' at ' + e.classTime : ''), e.subject, e.tutorName && 'with ' + e.tutorName].filter(Boolean).join(' · ') || '1 credit used'];
      case 'adjustment':
        return ['✏️ Adjustment', e.description || 'Balance corrected by the team'];
      case 'opening_balance':
        return ['📌 Opening balance', 'Credits before this log started'];
      default:
        return ['• ' + String(e.type || 'Activity').replace(/_/g, ' '), e.description || ''];
    }
  }

  function render() {
    var el = document.getElementById('paymentRecordsContent');
    if (!el) return;
    if (!state.log) {
      el.innerHTML = '<div style="padding:40px;text-align:center;font-weight:800;color:var(--light);">⏳ Loading your credits…</div>';
      load().then(function () { if (state.log) render(); else el.innerHTML = '<div style="padding:40px;text-align:center;font-weight:800;color:#c53030;">Could not load your credits. Please refresh the page.</div>'; });
      return;
    }
    var bal = state.log.balance;
    var color = bal <= -2 ? '#c53030' : bal <= 0 ? '#e65100' : bal <= 3 ? '#e65100' : 'var(--green-dark)';
    var bg    = bal <= -2 ? '#fde8e8' : bal <= 3 ? '#fff3e0' : 'var(--green-light)';
    var th = 'padding:11px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
    var td = 'padding:12px 14px;font-size:13px;vertical-align:top;';

    var html =
      '<div style="background:' + bg + ';border-radius:16px;padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' +
        '<div style="font-size:44px;">💳</div>' +
        '<div style="flex:1;min-width:200px;">' +
          '<div style="font-family:\'Fredoka One\',cursive;font-size:24px;color:' + color + ';">' + bal + ' credit' + (bal === 1 ? '' : 's') + ' remaining</div>' +
          '<div style="font-size:13px;font-weight:700;color:var(--mid);margin-top:4px;">Each completed class uses 1 credit.' +
            (state.link ? ' Your latest payment link is ready.' : '') + '</div>' +
        '</div>' + topUpButton(true) +
      '</div>';

    var entries = state.log.entries || [];
    html += '<div style="font-family:\'Fredoka One\',cursive;font-size:18px;color:var(--dark);margin-bottom:12px;">📋 Credit Activity</div>';
    if (!entries.length) {
      html += '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;background:var(--white);border-radius:14px;border:1.5px solid #e8eaf0;">No credit activity yet.</div>';
    } else {
      html += '<div style="overflow-x:auto;border-radius:14px;border:1.5px solid #e8eaf0;background:var(--white);">' +
        '<table style="width:100%;border-collapse:collapse;min-width:560px;"><thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">' +
        '<th style="' + th + '">Date</th><th style="' + th + '">Activity</th><th style="' + th + '">Details</th><th style="' + th + 'text-align:right;">Credits</th><th style="' + th + 'text-align:right;">Balance</th>' +
        '</tr></thead><tbody>' +
        entries.map(function (e, i) {
          var a = activity(e);
          var n = parseInt(e.amount, 10) || 0;
          var isOpening = e.type === 'opening_balance';
          return '<tr style="border-bottom:1px solid #f0f2f8;' + (i % 2 ? 'background:#fafbff;' : '') + '">' +
            '<td style="' + td + 'font-size:12px;color:var(--light);font-weight:800;white-space:nowrap;">' + esc(day(e.createdAt)) + '</td>' +
            '<td style="' + td + 'font-weight:900;color:var(--dark);white-space:nowrap;">' + esc(a[0]) + '</td>' +
            '<td style="' + td + 'font-weight:700;color:var(--mid);">' + esc(a[1]) + '</td>' +
            '<td style="' + td + 'text-align:right;font-weight:900;color:' + (isOpening ? 'var(--mid)' : n > 0 ? 'var(--green-dark)' : '#c53030') + ';">' + (isOpening ? n : (n > 0 ? '+' : '') + n) + '</td>' +
            '<td style="' + td + 'text-align:right;font-weight:800;color:var(--mid);">' + esc(e.balanceAfter) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    var pays = (state.log.payments || []).filter(function (p) { return p.kind !== 'referral_reward'; });
    if (pays.length) {
      html += '<div style="font-family:\'Fredoka One\',cursive;font-size:18px;color:var(--dark);margin:26px 0 12px;">💰 Payments Received</div>' +
        '<div style="overflow-x:auto;border-radius:14px;border:1.5px solid #e8eaf0;background:var(--white);">' +
        '<table style="width:100%;border-collapse:collapse;min-width:460px;"><thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">' +
        '<th style="' + th + '">Date paid</th><th style="' + th + '">Amount</th><th style="' + th + '">Credits</th><th style="' + th + '">Paid by</th></tr></thead><tbody>' +
        pays.map(function (p, i) {
          return '<tr style="border-bottom:1px solid #f0f2f8;' + (i % 2 ? 'background:#fafbff;' : '') + '">' +
            '<td style="' + td + 'font-weight:800;color:var(--mid);">' + esc(day(p.paidAt)) + '</td>' +
            '<td style="' + td + 'font-weight:900;color:var(--green-dark);">' + esc(money(p.amount, p.currency)) + '</td>' +
            '<td style="' + td + 'font-weight:800;color:var(--blue);">+' + esc(p.credits || 0) + '</td>' +
            '<td style="' + td + 'font-weight:700;color:var(--mid);">' + esc(METHOD[p.method] || p.method || (p.provider && p.provider !== 'manual' ? p.provider.charAt(0).toUpperCase() + p.provider.slice(1) : 'Payment')) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    html += '<div style="margin-top:16px;padding:12px 16px;background:var(--bg);border-radius:10px;font-size:12px;font-weight:700;color:var(--light);">' +
      '🔒 This record is kept by the StemNest team. Questions? Email support@stemnestacademy.co.uk.</div>';
    el.innerHTML = html;
  }

  function sidebarButton() {
    var box = document.getElementById('sidebarCreditsBox');
    if (!box) return;
    var old = document.getElementById('topUpCreditsBtn'); if (old) old.remove();
    var bal = state.log ? state.log.balance : null;
    if (!state.link && (bal === null || bal > 2)) return;
    box.insertAdjacentHTML('beforeend', topUpButton(false));
  }

  window.SNCredits = {
    reload: function () { return load(true).then(function () { render(); sidebarButton(); }); },
    noLink: function () {
      if (typeof showToast === 'function') showToast('No payment link yet — our team will send you one shortly. You can also email support@stemnestacademy.co.uk.', 'info');
    },
  };

  /* Replace the older Payments tab renderers and the browser-only Top Up button */
  window.renderPaymentsTab = render;
  window.renderPaymentRecords = render;
  window.renderTopUpButton = function () { load().then(sidebarButton); };

  function start() {
    load().then(function () {
      sidebarButton();
      var tab = document.getElementById('paymentRecordsContent');
      if (tab && tab.offsetParent !== null) render();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
