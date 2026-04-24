/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — OPERATIONS DASHBOARD JS
═══════════════════════════════════════════════════════ */
const OPS_TABS = ['late-joins','penalties','class-log'];

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('opsDate').textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  populateMonthFilter();
  showOpsTab('late-joins');
});

function showOpsTab(tab) {
  OPS_TABS.forEach(t => { const el = document.getElementById('tab-' + t); if (el) el.style.display = t === tab ? 'block' : 'none'; });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
  if (tab === 'late-joins') renderLateJoins();
  if (tab === 'penalties')  renderPenalties();
  if (tab === 'class-log')  renderClassLog();
  updateOpsStats();
}

function refreshOps() { showOpsTab(OPS_TABS.find(t => document.getElementById('tab-'+t)?.style.display !== 'none') || 'late-joins'); showToast('✅ Refreshed!'); }

function getLateJoins() { try { return JSON.parse(localStorage.getItem('sn_late_joins') || '[]'); } catch { return []; } }
function getClassReports() { try { return JSON.parse(localStorage.getItem('sn_class_reports') || '[]'); } catch { return []; } }

function updateOpsStats() {
  const now = new Date();
  const month = now.getFullYear() + '-' + (now.getMonth() + 1);
  const all = getLateJoins();
  const thisMonth = all.filter(l => l.month === month);
  const penalties = thisMonth.filter(l => !l.pardoned);
  const affected  = [...new Set(thisMonth.map(l => l.tutorId))];
  setText('opsStat1', thisMonth.length);
  setText('opsStat2', penalties.length);
  setText('opsStat3', thisMonth.filter(l => l.pardoned).length);
  setText('opsStat4', affected.length);
  setText('lateJoinBadge', thisMonth.length);
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function populateMonthFilter() {
  const all = getLateJoins();
  const months = [...new Set(all.map(l => l.month))].sort().reverse();
  const sel = document.getElementById('lateMonthFilter');
  if (sel) sel.innerHTML = '<option value="">All Months</option>' + months.map(m => `<option value="${m}">${m}</option>`).join('');
}

function renderLateJoins() {
  const tbody = document.getElementById('lateJoinsBody');
  if (!tbody) return;
  let list = getLateJoins();
  const q = document.getElementById('lateSearchInput')?.value.toLowerCase() || '';
  const m = document.getElementById('lateMonthFilter')?.value || '';
  if (q) list = list.filter(l => l.tutorName?.toLowerCase().includes(q) || l.tutorId?.toLowerCase().includes(q));
  if (m) list = list.filter(l => l.month === m);
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--light);">No late joins recorded.</td></tr>'; return; }
  tbody.innerHTML = list.map(l => `
    <tr>
      <td><span style="font-family:'Fredoka One',cursive;color:var(--blue);">${l.tutorId}</span></td>
      <td><strong>${l.tutorName}</strong></td>
      <td style="font-size:12px;">${l.sessionId || '—'}</td>
      <td style="font-size:12px;">${l.joinTime || '—'}</td>
      <td style="font-size:12px;">${new Date(l.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
      <td>${l.month}</td>
      <td><span class="ab-status ${l.pardoned ? 'ab-scheduled' : 'ab-pending'}">${l.pardoned ? '✅ Pardoned' : '⚠️ Penalised'}</span></td>
      <td>${l.penalty ? `<strong style="color:#c53030;">-$${l.penalty}</strong>` : '—'}</td>
    </tr>`).join('');
}

function filterLateJoins() { renderLateJoins(); }

function renderPenalties() {
  const tbody = document.getElementById('penaltiesBody');
  if (!tbody) return;
  const all = getLateJoins();
  const byTeacherMonth = {};
  all.forEach(l => {
    const key = l.tutorId + '|' + l.month;
    if (!byTeacherMonth[key]) byTeacherMonth[key] = { tutorId: l.tutorId, tutorName: l.tutorName, month: l.month, joins: [] };
    byTeacherMonth[key].joins.push(l);
  });
  const rows = Object.values(byTeacherMonth).sort((a,b) => b.month.localeCompare(a.month));
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--light);">No records.</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => {
    const pardoned  = r.joins.filter(j => j.pardoned).length;
    const penalised = r.joins.filter(j => !j.pardoned).length;
    const total     = penalised * 2;
    return `<tr>
      <td><span style="font-family:'Fredoka One',cursive;color:var(--blue);">${r.tutorId}</span></td>
      <td><strong>${r.tutorName}</strong></td>
      <td>${r.month}</td>
      <td>${r.joins.length}</td>
      <td>${pardoned}</td>
      <td>${penalised}</td>
      <td><strong style="color:${total > 0 ? '#c53030' : 'var(--green)'};">${total > 0 ? '-$' + total : '$0'}</strong></td>
    </tr>`;
  }).join('');
}

function renderClassLog() {
  const tbody = document.getElementById('classLogBody');
  if (!tbody) return;
  const reports  = getClassReports();
  const bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  if (!reports.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--light);">No class reports yet.</td></tr>'; return; }
  tbody.innerHTML = reports.map(r => {
    const b = bookings.find(x => x.id === r.bookingId) || {};
    return `<tr>
      <td><strong>${b.studentName || r.bookingId}</strong></td>
      <td>${b.subject || '—'}</td>
      <td>${r.tutorName || '—'}</td>
      <td style="font-size:12px;">${new Date(r.reportedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</td>
      <td><span class="ab-status ${r.outcome === 'completed' ? 'ab-completed' : 'ab-pending'}">${r.outcome === 'completed' ? '✅ Complete' : '❌ Incomplete'}</span></td>
      <td style="font-size:12px;max-width:200px;">${r.incompleteReason || r.notes || '—'}</td>
    </tr>`;
  }).join('');
}

function exportLateJoinsCSV() {
  const list = getLateJoins();
  if (!list.length) { showToast('No data to export.', 'error'); return; }
  const headers = ['Teacher ID','Teacher Name','Session ID','Join Time','Date','Month','Pardoned','Penalty ($)'];
  const rows = list.map(l => [l.tutorId, l.tutorName, l.sessionId||'', l.joinTime||'', new Date(l.date).toLocaleDateString('en-GB'), l.month, l.pardoned?'Yes':'No', l.penalty||0].map(v=>`"${v}"`).join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `late-joins-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✅ CSV exported!');
}

/* ══════════════════════════════════════════════════════
   PHASE 6 — BIRTHDAY CHECK
══════════════════════════════════════════════════════ */
function checkBirthdayForUser(userId, firstName) {
  const dob = localStorage.getItem('sn_dob_' + userId);
  if (!dob) return;
  const today = new Date();
  const birth = new Date(dob);
  if (today.getDate() !== birth.getDate() || today.getMonth() !== birth.getMonth()) return;
  const settings = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
  const template = settings.birthdayMsg || 'Happy Birthday {name}! 🎉 Wishing you a wonderful day from all of us at StemNest Academy!';
  const msg = template.replace('{name}', firstName || 'there');
  setTimeout(() => {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    popup.innerHTML = `<div style="background:var(--white);border-radius:28px;padding:48px 40px;max-width:440px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.35);">
      <div style="font-size:72px;margin-bottom:16px;">🎂</div>
      <div style="font-family:'Fredoka One',cursive;font-size:28px;color:var(--dark);margin-bottom:12px;">Happy Birthday, ${firstName}!</div>
      <div style="font-size:16px;color:var(--mid);line-height:1.7;margin-bottom:24px;">${msg}</div>
      <button onclick="this.closest('div[style]').remove()" style="background:var(--blue);color:#fff;border:none;padding:12px 32px;border-radius:50px;font-family:'Nunito',sans-serif;font-weight:900;font-size:16px;cursor:pointer;">Thank you! 🎉</button>
    </div>`;
    document.body.appendChild(popup);
  }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
  const staff = JSON.parse(localStorage.getItem('sn_staff') || '[]');
  const ops = staff.find(s => s.role === 'operations');
  if (ops) setTimeout(() => checkBirthdayForUser(ops.id, ops.name.split(' ')[0]), 1500);
});
