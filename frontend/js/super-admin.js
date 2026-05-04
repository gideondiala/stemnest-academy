/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — SUPER ADMIN / FOUNDER DASHBOARD JS
   Full reporting: sales, classes, revenue, expenses, profit.
═══════════════════════════════════════════════════════ */

const SA_TABS = ['overview','sales','classes','revenue','expenses','teachers','students','settings'];

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('saDate').textContent = new Date().toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
  loadSettings();
  showSATab('overview');
  bindExpenseModal();
});

/* ── TAB SWITCHING ── */
function showSATab(tab) {
  SA_TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(l => {
    l.classList.toggle('active', l.dataset.tab === tab);
  });
  refreshAllReports();
}

function refreshAllReports() {
  const period = document.getElementById('reportPeriod')?.value || 'month';
  const tab = SA_TABS.find(t => {
    const el = document.getElementById('tab-' + t);
    return el && el.style.display !== 'none';
  }) || 'overview';

  if (tab === 'overview')  renderOverview(period);
  if (tab === 'sales')     renderSalesReport(period);
  if (tab === 'classes')   renderClassReport(period);
  if (tab === 'revenue')   renderRevenueReport(period);
  if (tab === 'expenses')  renderExpensesReport(period);
  if (tab === 'teachers')  renderTeachersReport();
  if (tab === 'students')  renderStudentsReport();
}

/* ── DATA HELPERS ── */
function getBookings()    { try { return JSON.parse(localStorage.getItem('sn_bookings') || '[]'); } catch { return []; } }
function getTeachers()    { try { return JSON.parse(localStorage.getItem('sn_teachers') || '[]'); } catch { return []; } }
function getSalesPersons(){ try { return JSON.parse(localStorage.getItem('sn_sales_persons') || '[]'); } catch { return []; } }
function getExpenses()    { try { return JSON.parse(localStorage.getItem('sn_expenses') || '[]'); } catch { return []; } }
function getClassReports(){ try { return JSON.parse(localStorage.getItem('sn_class_reports') || '[]'); } catch { return []; } }

function filterByPeriod(list, dateField, period) {
  const now = new Date();
  return list.filter(item => {
    const d = new Date(item[dateField] || item.bookedAt || item.date);
    if (isNaN(d)) return period === 'all';
    if (period === 'all')   return true;
    if (period === 'today') return d.toDateString() === now.toDateString();
    if (period === 'week') {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === 'year')  return d.getFullYear() === now.getFullYear();
    return true;
  });
}

function totalRevenue(bookings) {
  return bookings.filter(b => b.status === 'completed' || b.salesStatus === 'converted')
    .reduce((s, b) => s + (parseFloat(b.paymentAmount) || 0), 0);
}

function kpiCard(icon, val, label, trend, trendClass) {
  return `<div class="sa-kpi">
    <div class="sa-kpi-icon">${icon}</div>
    <div class="sa-kpi-val">${val}</div>
    <div class="sa-kpi-label">${label}</div>
    ${trend ? `<div class="sa-kpi-trend ${trendClass}">${trend}</div>` : ''}
  </div>`;
}

function simpleTable(headers, rows, emptyMsg) {
  if (!rows.length) return `<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">${emptyMsg || 'No data.'}</div>`;
  return `<table class="sa-table">
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

/* ── OVERVIEW ── */
function renderOverview(period) {
  const bookings = filterByPeriod(getBookings(), 'bookedAt', period);
  const reports  = filterByPeriod(getClassReports(), 'reportedAt', period);
  const rev      = totalRevenue(bookings);
  const expenses = filterByPeriod(getExpenses(), 'date', period).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const profit   = rev - expenses;

  document.getElementById('kpiGrid').innerHTML =
    kpiCard('📋', bookings.length,                                    'Total Bookings',    null, '') +
    kpiCard('📡', reports.filter(r => r.outcome === 'completed').length, 'Classes Completed', null, '') +
    kpiCard('❌', reports.filter(r => r.outcome === 'incomplete').length,'Classes Incomplete',null, '') +
    kpiCard('💰', '£' + rev.toFixed(0),                               'Revenue',           null, '') +
    kpiCard('💸', '£' + expenses.toFixed(0),                          'Expenses',          null, '') +
    kpiCard('📈', `<span class="${profit >= 0 ? 'sa-profit-positive' : 'sa-profit-negative'}">£${profit.toFixed(0)}</span>`, 'Net Profit', null, '');

  // Demo chart (simple bar)
  renderBarChart('demoClassChart', bookings, period);

  // Recent bookings
  const recent = [...getBookings()].sort((a,b) => new Date(b.bookedAt) - new Date(a.bookedAt)).slice(0, 8);
  document.getElementById('recentBookings').innerHTML = simpleTable(
    ['Student','Subject','Date','Status','Sales Person'],
    recent.map(b => [
      `<strong>${b.studentName}</strong>`,
      b.subject || '—',
      formatSADate(b.bookedAt),
      `<span class="ab-status ab-${b.status}">${capitalise(b.status)}</span>`,
      b.assignedSalesName || '—',
    ]),
    'No bookings yet.'
  );
}

/* ── SALES REPORT ── */
function renderSalesReport(period) {
  const bookings  = filterByPeriod(getBookings(), 'bookedAt', period);
  const converted = bookings.filter(b => b.salesStatus === 'converted');
  const rev       = totalRevenue(bookings);
  const persons   = getSalesPersons();

  document.getElementById('salesKpiGrid').innerHTML =
    kpiCard('📋', bookings.length,    'Total Demos',    null, '') +
    kpiCard('✅', converted.length,   'Converted',      null, '') +
    kpiCard('❌', bookings.length - converted.length, 'Not Converted', null, '') +
    kpiCard('💰', '£' + rev.toFixed(0), 'Revenue Won',  null, '') +
    kpiCard('📊', bookings.length ? Math.round(converted.length / bookings.length * 100) + '%' : '0%', 'Conversion Rate', null, '');

  // Per sales person
  const spRows = persons.map(sp => {
    const pipeline = JSON.parse(localStorage.getItem('sn_pipeline_' + sp.id) || '[]');
    const spConverted = pipeline.filter(p => p.status === 'converted');
    const spRev = spConverted.reduce((s, p) => s + (parseFloat(p.paymentAmount) || 0), 0);
    return [sp.name, sp.id, pipeline.length, spConverted.length, '£' + spRev.toFixed(0)];
  });
  document.getElementById('salesPersonTable').innerHTML = simpleTable(
    ['Name','ID','Total Pitched','Converted','Revenue'],
    spRows, 'No sales persons yet.'
  );

  // Conversion pipeline breakdown
  const statuses = ['pitched','interested','followup','converted','lost'];
  const statusLabel = { pitched:'📣 Pitched', interested:'🔥 Interested', followup:'📞 Follow-up', converted:'✅ Converted', lost:'❌ Lost' };
  const allPipeline = persons.flatMap(sp => JSON.parse(localStorage.getItem('sn_pipeline_' + sp.id) || '[]'));
  const convRows = statuses.map(s => [statusLabel[s], allPipeline.filter(p => p.status === s).length]);
  document.getElementById('conversionTable').innerHTML = simpleTable(['Status','Count'], convRows, 'No pipeline data.');
}

/* ── CLASS REPORT ── */
function renderClassReport(period) {
  const reports  = filterByPeriod(getClassReports(), 'reportedAt', period);
  const bookings = filterByPeriod(getBookings(), 'bookedAt', period);
  const completed   = reports.filter(r => r.outcome === 'completed').length;
  const incomplete  = reports.filter(r => r.outcome === 'incomplete').length;
  const scheduled   = bookings.filter(b => b.status === 'scheduled').length;
  const pending     = bookings.filter(b => b.status === 'pending').length;

  document.getElementById('classKpiGrid').innerHTML =
    kpiCard('📅', scheduled,  'Scheduled',         null, '') +
    kpiCard('✅', completed,  'Completed',          null, '') +
    kpiCard('❌', incomplete, 'Incomplete',         null, '') +
    kpiCard('⏳', pending,    'Pending Assignment', null, '');

  const rows = reports.slice(0, 30).map(r => {
    const b = getBookings().find(x => x.id === r.bookingId) || {};
    return [
      `<strong>${b.studentName || r.bookingId}</strong>`,
      b.subject || '—',
      formatSADate(r.reportedAt),
      r.tutorName || '—',
      r.outcome === 'completed' ? '✅ Complete' : '❌ Incomplete',
      r.classQuality || r.incompleteReason?.slice(0,40) || '—',
    ];
  });
  document.getElementById('classBreakdownTable').innerHTML = simpleTable(
    ['Student','Subject','Date','Teacher','Outcome','Notes'], rows, 'No class reports yet.'
  );
}

/* ── REVENUE REPORT ── */
function renderRevenueReport(period) {
  const bookings  = filterByPeriod(getBookings(), 'bookedAt', period);
  const rev       = totalRevenue(bookings);
  const expenses  = filterByPeriod(getExpenses(), 'date', period).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const profit    = rev - expenses;

  document.getElementById('revenueKpiGrid').innerHTML =
    kpiCard('💰', '£' + rev.toFixed(0),     'Gross Revenue', null, '') +
    kpiCard('💸', '£' + expenses.toFixed(0), 'Total Expenses', null, '') +
    kpiCard('📈', `<span class="${profit >= 0 ? 'sa-profit-positive' : 'sa-profit-negative'}">£${profit.toFixed(0)}</span>`, 'Net Profit', null, '');

  // Revenue by subject
  const subjects = ['Coding','Maths','Sciences'];
  const revRows = subjects.map(s => {
    const subRev = bookings.filter(b => b.subject === s && (b.status === 'completed' || b.salesStatus === 'converted'))
      .reduce((sum, b) => sum + (parseFloat(b.paymentAmount) || 0), 0);
    return [s, bookings.filter(b => b.subject === s).length, '£' + subRev.toFixed(0)];
  });
  document.getElementById('revenueTable').innerHTML = simpleTable(
    ['Subject','Bookings','Revenue'], revRows, 'No revenue data.'
  );
}

/* ── EXPENSES REPORT ── */
function renderExpensesReport(period) {
  const expenses = filterByPeriod(getExpenses(), 'date', period);
  const total    = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const rev      = totalRevenue(filterByPeriod(getBookings(), 'bookedAt', period));
  const profit   = rev - total;

  document.getElementById('expenseKpiGrid').innerHTML =
    kpiCard('💸', '£' + total.toFixed(0),  'Total Expenses', null, '') +
    kpiCard('💰', '£' + rev.toFixed(0),    'Revenue',        null, '') +
    kpiCard('📈', `<span class="${profit >= 0 ? 'sa-profit-positive' : 'sa-profit-negative'}">£${profit.toFixed(0)}</span>`, 'Net Profit', null, '');

  const catLabel = { salary:'💷 Teacher Salary', salary_sales:'💷 Sales Salary', salary_ops:'💷 Ops Salary', platform:'💻 Platform', marketing:'📣 Marketing', admin:'📋 Admin', other:'📦 Other' };
  const rows = expenses.map(e => [
    `<strong>${e.description}</strong>`,
    `<span class="exp-cat-badge">${catLabel[e.category] || e.category}</span>`,
    '£' + parseFloat(e.amount).toFixed(2),
    formatSADate(e.date),
    e.notes || '—',
    `<button class="ab-btn" style="background:var(--orange-light);color:var(--orange-dark);" onclick="deleteExpense('${e.id}')">🗑</button>`,
  ]);
  document.getElementById('expenseTable').innerHTML = simpleTable(
    ['Description','Category','Amount','Date','Notes',''], rows, 'No expenses logged yet.'
  );
}

/* ── TEACHERS REPORT ── */
let saTeacherSubTab = 'active';
let saStudentSubTab = 'demo';

function switchTeacherSubTab(tab) {
  saTeacherSubTab = tab;
  document.querySelectorAll('[id^="teacherSubTab-"]').forEach(function(btn) {
    btn.classList.toggle('sa-subtab-active', btn.id === 'teacherSubTab-' + tab);
  });
  renderTeachersReport();
}

function switchStudentSubTab(tab) {
  saStudentSubTab = tab;
  document.querySelectorAll('[id^="studentSubTab-"]').forEach(function(btn) {
    btn.classList.toggle('sa-subtab-active', btn.id === 'studentSubTab-' + tab);
  });
  renderStudentsReport();
}

function renderTeachersReport() {
  var teachers = getTeachers();
  var q    = (document.getElementById('teacherSearch') ? document.getElementById('teacherSearch').value : '').toLowerCase();
  var subj = document.getElementById('teacherSubjectFilter') ? document.getElementById('teacherSubjectFilter').value : '';

  document.getElementById('teacherKpiGrid').innerHTML =
    kpiCard('\u{1F469}\u200D\u{1F3EB}', teachers.length, 'Total Teachers', null, '') +
    kpiCard('\u{1F4BB}', teachers.filter(function(t){return t.subject==='Coding';}).length, 'Coding', null, '') +
    kpiCard('\u{1F4D0}', teachers.filter(function(t){return t.subject==='Maths';}).length, 'Maths', null, '') +
    kpiCard('\u{1F52C}', teachers.filter(function(t){return t.subject==='Sciences';}).length, 'Sciences', null, '');

  var list = teachers.filter(function(t) {
    var isDisc = !!t.discontinued;
    return saTeacherSubTab === 'discontinued' ? isDisc : !isDisc;
  });

  if (q) {
    list = list.filter(function(t) {
      return (t.id||'').toLowerCase().includes(q) ||
             (t.name||'').toLowerCase().includes(q) ||
             (t.email||'').toLowerCase().includes(q) ||
             (t.subject||'').toLowerCase().includes(q) ||
             (t.country||'').toLowerCase().includes(q);
    });
  }
  if (subj) list = list.filter(function(t){ return t.subject === subj; });

  var thS = 'padding:11px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  var tdS = 'padding:12px 14px;font-size:13px;vertical-align:middle;';

  if (!list.length) {
    document.getElementById('teacherFullTable').innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No teachers found.</div>';
    return;
  }

  var rows = list.map(function(t, i) {
    var data = JSON.parse(localStorage.getItem('sn_earnings_' + t.id) || '{}');
    var bg   = i % 2 === 0 ? '' : 'background:#fafbff;';
    var statusBadge = t.discontinued
      ? '<span style="background:#fde8e8;color:#c53030;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">Discontinued</span>'
      : '<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">Active</span>';
    var actionBtn = '<button onclick="toggleTeacherStatus(\''+t.id+'\')" style="background:var(--bg);border:1.5px solid #e8eaf0;border-radius:8px;padding:5px 10px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:11px;cursor:pointer;color:var(--mid);">'+(t.discontinued?'Reinstate':'Discontinue')+'</button>';
    return '<tr style="border-bottom:1px solid #f0f2f8;'+bg+'">'
      +'<td style="'+tdS+'"><span style="font-family:\'Fredoka One\',cursive;color:var(--blue);font-size:12px;">'+t.id+'</span></td>'
      +'<td style="'+tdS+'"><div style="font-weight:800;color:var(--dark);">'+t.name+'</div><div style="font-size:11px;color:var(--light);">'+(t.email||'—')+'</div></td>'
      +'<td style="'+tdS+';font-weight:700;color:var(--mid);">'+t.subject+'</td>'
      +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(t.country||'—')+'</td>'
      +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(t.availability||'—')+'</td>'
      +'<td style="'+tdS+';font-weight:700;color:var(--mid);">'+(data.classes||0)+'</td>'
      +'<td style="'+tdS+';font-weight:800;color:var(--green-dark);">£'+(data.earnings||0).toFixed(0)+'</td>'
      +'<td style="'+tdS+';font-weight:700;color:var(--purple);">'+(data.points||0)+'</td>'
      +'<td style="'+tdS+'">'+statusBadge+'</td>'
      +'<td style="'+tdS+'">'+actionBtn+'</td>'
      +'</tr>';
  }).join('');

  document.getElementById('teacherFullTable').innerHTML =
    '<div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">'
    +'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">'
    +'<th style="'+thS+'">ID</th><th style="'+thS+'">Name / Email</th><th style="'+thS+'">Subject</th>'
    +'<th style="'+thS+'">Country</th><th style="'+thS+'">Availability</th>'
    +'<th style="'+thS+'">Classes</th><th style="'+thS+'">Earnings</th><th style="'+thS+'">Points</th>'
    +'<th style="'+thS+'">Status</th><th style="'+thS+'">Action</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function toggleTeacherStatus(teacherId) {
  var teachers = getTeachers();
  var idx = teachers.findIndex(function(t){ return t.id === teacherId; });
  if (idx === -1) return;
  teachers[idx].discontinued = !teachers[idx].discontinued;
  localStorage.setItem('sn_teachers', JSON.stringify(teachers));
  renderTeachersReport();
  showToast(teachers[idx].discontinued ? 'Teacher discontinued.' : 'Teacher reinstated.');
}

/* ── STUDENTS REPORT ── */
function renderStudentsReport() {
  var q    = (document.getElementById('studentSearch') ? document.getElementById('studentSearch').value : '').toLowerCase();
  var subj = document.getElementById('studentSubjectFilter') ? document.getElementById('studentSubjectFilter').value : '';

  var bookings = getBookings();
  var students = JSON.parse(localStorage.getItem('sn_students') || '[]');

  var thS = 'padding:11px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  var tdS = 'padding:12px 14px;font-size:13px;vertical-align:middle;';

  var list = [];
  var headers = [];

  if (saStudentSubTab === 'demo') {
    list = bookings.filter(function(b){ return b.status === 'pending' || b.status === 'scheduled' || b.status === 'demo'; });
    headers = ['ID','Student','Grade','Age','Subject','Email','WhatsApp','Date','Status','Booked'];
  } else if (saStudentSubTab === 'paid') {
    list = bookings.filter(function(b){ return b.salesStatus === 'converted' || b.studentOnboarded; });
    headers = ['ID','Student','Grade','Subject','Email','Credits','Amount','Onboarded'];
  } else {
    list = bookings.filter(function(b){ return b.status === 'cancelled' || b.status === 'discontinued'; });
    headers = ['ID','Student','Subject','Email','Status','Date'];
  }

  if (q) {
    list = list.filter(function(b) {
      return (b.id||'').toLowerCase().includes(q) ||
             (b.studentName||'').toLowerCase().includes(q) ||
             (b.email||'').toLowerCase().includes(q) ||
             (b.country||'').toLowerCase().includes(q) ||
             (b.subject||'').toLowerCase().includes(q);
    });
  }
  if (subj) list = list.filter(function(b){ return b.subject === subj; });

  if (!list.length) {
    document.getElementById('studentFullTable').innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No students found.</div>';
    return;
  }

  var rows = list.map(function(b, i) {
    var bg = i % 2 === 0 ? '' : 'background:#fafbff;';
    if (saStudentSubTab === 'demo') {
      return '<tr style="border-bottom:1px solid #f0f2f8;'+bg+'">'
        +'<td style="'+tdS+'"><span style="font-family:\'Fredoka One\',cursive;color:var(--blue);font-size:11px;">'+b.id+'</span></td>'
        +'<td style="'+tdS+'"><div style="font-weight:800;color:var(--dark);">'+(b.studentName||'—')+'</div></td>'
        +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(b.grade||'—')+'</td>'
        +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(b.age||'—')+'</td>'
        +'<td style="'+tdS+';font-weight:700;color:var(--mid);">'+(b.subject||'—')+'</td>'
        +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(b.email||'—')+'</td>'
        +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(b.whatsapp||'—')+'</td>'
        +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(b.date||'—')+'</td>'
        +'<td style="'+tdS+'"><span class="ab-status ab-'+(b.status||'pending')+'">'+capitalise(b.status||'pending')+'</span></td>'
        +'<td style="'+tdS+';font-size:11px;color:var(--light);">'+formatSADate(b.bookedAt)+'</td>'
        +'</tr>';
    } else if (saStudentSubTab === 'paid') {
      return '<tr style="border-bottom:1px solid #f0f2f8;'+bg+'">'
        +'<td style="'+tdS+'"><span style="font-family:\'Fredoka One\',cursive;color:var(--blue);font-size:11px;">'+(b.studentId||b.id)+'</span></td>'
        +'<td style="'+tdS+'"><div style="font-weight:800;color:var(--dark);">'+(b.studentName||'—')+'</div><div style="font-size:11px;color:var(--light);">'+(b.email||'—')+'</div></td>'
        +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(b.grade||'—')+'</td>'
        +'<td style="'+tdS+';font-weight:700;color:var(--mid);">'+(b.subject||'—')+'</td>'
        +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(b.email||'—')+'</td>'
        +'<td style="'+tdS+';font-weight:800;color:var(--blue);">'+(b.studentCredits||'—')+'</td>'
        +'<td style="'+tdS+';font-weight:800;color:var(--green-dark);">'+(b.paymentAmount?'£'+b.paymentAmount:'—')+'</td>'
        +'<td style="'+tdS+'"><span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">'+(b.studentOnboarded?'Onboarded':'Converted')+'</span></td>'
        +'</tr>';
    } else {
      return '<tr style="border-bottom:1px solid #f0f2f8;'+bg+'">'
        +'<td style="'+tdS+'"><span style="font-family:\'Fredoka One\',cursive;color:var(--blue);font-size:11px;">'+b.id+'</span></td>'
        +'<td style="'+tdS+'"><div style="font-weight:800;color:var(--dark);">'+(b.studentName||'—')+'</div></td>'
        +'<td style="'+tdS+';font-weight:700;color:var(--mid);">'+(b.subject||'—')+'</td>'
        +'<td style="'+tdS+';font-size:12px;color:var(--mid);">'+(b.email||'—')+'</td>'
        +'<td style="'+tdS+'"><span class="ab-status ab-'+(b.status||'cancelled')+'">'+capitalise(b.status||'cancelled')+'</span></td>'
        +'<td style="'+tdS+';font-size:11px;color:var(--light);">'+formatSADate(b.bookedAt)+'</td>'
        +'</tr>';
    }
  }).join('');

  document.getElementById('studentFullTable').innerHTML =
    '<div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">'
    +'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">'
    +headers.map(function(h){ return '<th style="'+thS+'">'+h+'</th>'; }).join('')
    +'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}

/* ── BAR CHART (CSS-only) ── */
function renderBarChart(containerId, bookings, period) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const counts = days.map((_, i) => bookings.filter(b => {
    const d = new Date(b.bookedAt);
    return d.getDay() === (i + 1) % 7;
  }).length);
  const max = Math.max(...counts, 1);
  el.innerHTML = `<div class="sa-bar-chart">
    ${days.map((d, i) => `
      <div class="sa-bar-wrap">
        <div class="sa-bar-val">${counts[i]}</div>
        <div class="sa-bar" style="height:${Math.round(counts[i]/max*90)}px;background:var(--blue);opacity:${0.4 + counts[i]/max*0.6};"></div>
        <div class="sa-bar-label">${d}</div>
      </div>`).join('')}
  </div>`;
}

/* ── EXPENSES CRUD ── */
function openAddExpenseModal() {
  const dateEl = document.getElementById('exp-date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
  ['exp-desc','exp-amount','exp-notes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('expenseModalOverlay')?.classList.add('open');
}
function closeExpenseModal() { document.getElementById('expenseModalOverlay')?.classList.remove('open'); }
function bindExpenseModal() {
  const overlay = document.getElementById('expenseModalOverlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeExpenseModal(); });
}

function saveExpense() {
  const desc   = document.getElementById('exp-desc')?.value.trim();
  const amount = document.getElementById('exp-amount')?.value;
  const date   = document.getElementById('exp-date')?.value;
  if (!desc || !amount || !date) { showToast('Please fill in all required fields.', 'error'); return; }

  const expense = {
    id:          'EXP' + Date.now().toString(36).toUpperCase(),
    description: desc,
    category:    document.getElementById('exp-cat')?.value || 'other',
    amount:      parseFloat(amount),
    date,
    notes:       document.getElementById('exp-notes')?.value.trim(),
    createdAt:   new Date().toISOString(),
  };
  const all = getExpenses();
  all.unshift(expense);
  localStorage.setItem('sn_expenses', JSON.stringify(all));
  closeExpenseModal();
  renderExpensesReport(document.getElementById('reportPeriod')?.value || 'month');
  showToast('✅ Expense logged!');
}

function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  const all = getExpenses().filter(e => e.id !== id);
  localStorage.setItem('sn_expenses', JSON.stringify(all));
  renderExpensesReport(document.getElementById('reportPeriod')?.value || 'month');
  showToast('Expense deleted.');
}

/* ── SETTINGS ── */
function loadSettings() {
  const settings = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
  if (settings.seal) {
    const el = document.getElementById('sealPreview');
    if (el) el.innerHTML = `<img src="${settings.seal}" class="sa-seal-preview" alt="Seal">`;
  }
  if (settings.signature) {
    const el = document.getElementById('sigPreview');
    if (el) el.innerHTML = `<img src="${settings.signature}" class="sa-sig-preview" alt="Signature">`;
  }
  if (settings.birthdayMsg) {
    const el = document.getElementById('birthdayMsg');
    if (el) el.value = settings.birthdayMsg;
  }
  if (settings.saEmail) {
    const el = document.getElementById('saEmail');
    if (el) el.value = settings.saEmail;
  }
  if (settings.founderDob) {
    const el = document.getElementById('saFounderDob');
    if (el) el.value = settings.founderDob;
  }
  if (settings.demoClassPay !== undefined) {
    const el = document.getElementById('demoClassPay');
    if (el) el.value = settings.demoClassPay;
  }
  if (settings.paidClassPay !== undefined) {
    const el = document.getElementById('paidClassPay');
    if (el) el.value = settings.paidClassPay;
  }
}

function saveSettings(key, val) {
  const s = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
  s[key] = val;
  localStorage.setItem('sn_sa_settings', JSON.stringify(s));
}

function uploadSeal(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    saveSettings('seal', ev.target.result);
    const el = document.getElementById('sealPreview');
    if (el) el.innerHTML = `<img src="${ev.target.result}" class="sa-seal-preview" alt="Seal">`;
    showToast('✅ Company seal saved!');
  };
  reader.readAsDataURL(file);
}

function uploadSignature(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    saveSettings('signature', ev.target.result);
    const el = document.getElementById('sigPreview');
    if (el) el.innerHTML = `<img src="${ev.target.result}" class="sa-sig-preview" alt="Signature">`;
    showToast('✅ Founder signature saved!');
  };
  reader.readAsDataURL(file);
}

function savePayRates() {
  const demo = parseFloat(document.getElementById('demoClassPay')?.value || '5');
  const paid = parseFloat(document.getElementById('paidClassPay')?.value || '20');
  saveSettings('demoClassPay', demo);
  saveSettings('paidClassPay', paid);
  showToast('✅ Pay rates saved! Demo: £' + demo + ' · Paid: £' + paid);
}

function getPayRates() {
  const s = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
  return {
    demo: parseFloat(s.demoClassPay || '5'),
    paid: parseFloat(s.paidClassPay || '20'),
  };
}

function saveBirthdayMsg() {
  const msg = document.getElementById('birthdayMsg')?.value.trim();
  if (!msg) { showToast('Please enter a message.', 'error'); return; }
  saveSettings('birthdayMsg', msg);
  showToast('✅ Birthday message saved!');
}

function saveSACredentials() {
  const email = document.getElementById('saEmail')?.value.trim();
  const pw    = document.getElementById('saPassword')?.value;
  if (!email) { showToast('Please enter an email.', 'error'); return; }
  saveSettings('saEmail', email);
  if (pw) saveSettings('saPassword', pw);
  showToast('✅ Credentials updated!');
}

/* ── EXPORT ALL CSV ── */
function exportAllCSV() {
  const bookings = getBookings();
  if (!bookings.length) { showToast('No data to export.', 'error'); return; }
  const headers = ['ID','Student','Age','Grade','Subject','Date','Time','Email','WhatsApp','Status','Tutor','Sales Person','Revenue','Booked At'];
  const rows = bookings.map(b => [
    b.id, b.studentName, b.age, b.grade, b.subject, b.date, b.time,
    b.email, b.whatsapp, b.status, b.assignedTutor || '', b.assignedSalesName || '',
    b.paymentAmount || '', formatSADate(b.bookedAt),
  ].map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `stemnest-full-report-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Full report exported!');
}

/* ── HELPERS ── */
function formatSADate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
  catch { return iso; }
}
function capitalise(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : '—'; }

/* ══════════════════════════════════════════════════════
   PHASE 6 — BIRTHDAY CHECK (Founder / Super Admin)
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

// Add DOB field to super admin settings and check birthday on load
document.addEventListener('DOMContentLoaded', () => {
  // Check founder birthday (stored under 'founder' key)
  const settings = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
  if (settings.founderDob) {
    localStorage.setItem('sn_dob_founder', settings.founderDob);
  }
  setTimeout(() => checkBirthdayForUser('founder', 'Founder'), 1500);
});

// Extend saveSettings to also handle founderDob
const _origSaveSettings = window.saveSettings;
window.saveSettings = function(key, val) {
  _origSaveSettings(key, val);
  if (key === 'founderDob') {
    localStorage.setItem('sn_dob_founder', val);
  }
};

/* ══════════════════════════════════════════════════════
   PRIORITY 7 — USER CREDENTIALS CHART (Founder Only)
══════════════════════════════════════════════════════ */

/* Add credentials tab to SA_TABS */
SA_TABS.push('credentials');

/* Extend showSATab to handle credentials */
const _origShowSATab = window.showSATab;
window.showSATab = function(tab) {
  _origShowSATab(tab);
  if (tab === 'credentials') renderCredentialsChart();
};

function renderCredentialsChart() {
  const el = document.getElementById('credentialsChart');
  if (!el) return;

  const q = (document.getElementById('credSearch')?.value || '').toLowerCase();

  // Collect all users from all registries
  const allUsers = [];

  // Teachers
  JSON.parse(localStorage.getItem('sn_teachers') || '[]').forEach(t => {
    allUsers.push({ id: t.id, name: t.name, email: t.email, role: t.subject + ' Teacher', password: t.password || '—' });
  });

  // Sales persons
  JSON.parse(localStorage.getItem('sn_sales_persons') || '[]').forEach(s => {
    allUsers.push({ id: s.id, name: s.name, email: s.email, role: 'Sales / Counselor', password: s.password || '—' });
  });

  // Staff
  const roleLabel = { operations: 'Operations', presales: 'Pre-Sales', postsales: 'Post-Sales', hr: 'HR' };
  JSON.parse(localStorage.getItem('sn_staff') || '[]').forEach(s => {
    allUsers.push({ id: s.id, name: s.name, email: s.email, role: roleLabel[s.role] || s.role, password: s.password || '—' });
  });

  // Students
  JSON.parse(localStorage.getItem('sn_students') || '[]').forEach(s => {
    allUsers.push({ id: s.id, name: s.name, email: s.email, role: 'Student', password: s.password || '—' });
  });

  // Admin + Founder (from settings or hardcoded)
  const settings = JSON.parse(localStorage.getItem('sn_sa_settings') || '{}');
  allUsers.push({ id: 'ADMIN', name: 'Admin', email: 'admin@stemnest.co.uk', role: 'Admin', password: settings.adminPassword || 'admin123' });
  allUsers.push({ id: 'FOUNDER', name: 'Founder', email: settings.saEmail || 'founder@stemnest.co.uk', role: 'Founder / Super Admin', password: settings.saPassword || 'Founder2024!' });

  // Also merge from password registry (catches password changes)
  const registry = JSON.parse(localStorage.getItem('sn_password_registry') || '[]');
  registry.forEach(r => {
    const idx = allUsers.findIndex(u => u.email === r.email);
    if (idx !== -1) allUsers[idx].password = r.password;
  });

  // Filter
  const filtered = q
    ? allUsers.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      )
    : allUsers;

  if (!filtered.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No users found.</div>';
    return;
  }

  const roleColors = {
    'Founder / Super Admin': 'background:linear-gradient(135deg,#1a56db,#7c3aed);color:#fff;',
    'Admin':                 'background:var(--blue-light);color:var(--blue);',
    'Student':               'background:var(--green-light);color:var(--green-dark);',
    'Sales / Counselor':     'background:#fff3e0;color:#e65100;',
    'Operations':            'background:#ede9fe;color:#5b21b6;',
    'Pre-Sales':             'background:#fce7f3;color:#9d174d;',
    'Post-Sales':            'background:#d1fae5;color:#065f46;',
    'HR':                    'background:#fef3c7;color:#92400e;',
  };

  const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:13px 16px;vertical-align:middle;';

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thS}">ID</th>
            <th style="${thS}">Name</th>
            <th style="${thS}">Email</th>
            <th style="${thS}">Role</th>
            <th style="${thS}">Password</th>
            <th style="${thS}">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((u, i) => {
            const reg = registry.find(r => r.email === u.email);
            const updated = reg ? new Date(reg.updatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
            const roleCss = Object.entries(roleColors).find(([k]) => u.role.includes(k.split(' ')[0]))?.[1] || 'background:var(--bg);color:var(--mid);';
            return `<tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS};font-family:'Fredoka One',cursive;color:var(--blue);font-size:12px;">${u.id}</td>
              <td style="${tdS};font-weight:800;color:var(--dark);">${u.name}</td>
              <td style="${tdS};font-size:12px;color:var(--mid);font-weight:700;">${u.email}</td>
              <td style="${tdS}"><span style="font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;${roleCss}">${u.role}</span></td>
              <td style="${tdS}">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span id="pw-${i}" style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:var(--dark);filter:blur(4px);transition:.2s;">${u.password}</span>
                  <button onclick="togglePwVisibility('pw-${i}',this)" style="background:var(--bg);border:1.5px solid #e8eaf0;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:800;cursor:pointer;color:var(--mid);">👁 Show</button>
                </div>
              </td>
              <td style="${tdS};font-size:12px;color:var(--light);font-weight:700;">${updated}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--light);font-weight:700;text-align:right;">
      ${filtered.length} user${filtered.length !== 1 ? 's' : ''} · Passwords are blurred by default for security
    </div>`;
}

function togglePwVisibility(spanId, btn) {
  const span = document.getElementById(spanId);
  if (!span) return;
  const isBlurred = span.style.filter === 'blur(4px)';
  span.style.filter = isBlurred ? 'none' : 'blur(4px)';
  btn.textContent   = isBlurred ? '🙈 Hide' : '👁 Show';
}
