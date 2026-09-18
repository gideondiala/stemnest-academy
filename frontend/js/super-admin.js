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
  /* Load real data from API first, then render */
  _loadSAFromAPI().then(() => {
    showSATab('overview');
    bindExpenseModal();
  });
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
function getBookings()    { return window.SA_DATA?.bookings || []; }
function getTeachers()    { return window.SA_DATA?.tutors   || []; }
function getSalesPersons(){ return window.SA_DATA?.sales    || []; }
function getExpenses()    { try { return JSON.parse(localStorage.getItem('sn_expenses') || '[]'); } catch { return []; } }

/* ── LOAD FROM API ── */
window.SA_DATA = { bookings: [], tutors: [], sales: [] };

async function _loadSAFromAPI() {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;

    const res = await fetch('https://api.stemnestacademy.co.uk/api/sync/dashboard/admin', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    /* Map bookings to the shape the rest of the JS expects */
    window.SA_DATA.bookings = (data.bookings || []).map(b => {
      let notes = {};
      try { notes = typeof b.notes === 'string' ? JSON.parse(b.notes) : (b.notes || {}); } catch {}
      return {
        id:              b.id,
        studentName:     b.lesson_name || notes.studentName || '—',
        age:             notes.age     || b.grade || '—',
        grade:           b.grade       || notes.grade || '—',
        email:           b.student_email || notes.email || '—',
        whatsapp:        notes.whatsapp || '—',
        subject:         b.subject || '—',
        date:            b.date ? b.date.split('T')[0] : '—',
        time:            b.time || '—',
        status:          b.status,
        assignedTutor:   b.tutor_name  || '—',
        assignedTutorId: b.tutor_staff_id || b.tutor_id || '',
        classLink:       b.class_link  || '',
        paymentAmount:   b.payment_amount || 0,
        bookedAt:        b.booked_at   || b.created_at,
        isDemoClass:     b.is_demo,
      };
    });

    /* Map tutors */
    window.SA_DATA.tutors = (data.tutors || []).map(t => ({
      id:           t.staff_id || t.id,
      dbId:         t.id,
      name:         t.name,
      email:        t.email,
      subject:      t.subject || 'Coding',
      courses:      t.courses || [],
      gradeGroups:  t.grade_groups || [],
      availability: t.availability || '—',
      isActive:     t.is_active !== false,
      discontinued: t.is_active === false,
    }));

    /* Map sales */
    window.SA_DATA.sales = (data.sales || []).map(s => ({
      id:    s.staff_id || s.id,
      dbId:  s.id,
      name:  s.name,
      email: s.email,
    }));

  } catch (e) {
    console.warn('[SuperAdmin] API load failed:', e.message);
  }
}
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
   PRIORITY 7 — USER CREDENTIALS + LOGIN AS (Founder Only)
   Loads all users from API. Three tabs: Staff | Tutors | Students
   Login As: impersonates user by getting a temp token from backend
══════════════════════════════════════════════════════ */

/* Add credentials tab to SA_TABS */
SA_TABS.push('credentials');

/* Extend showSATab to handle credentials */
const _origShowSATab = window.showSATab;
window.showSATab = function(tab) {
  _origShowSATab(tab);
  if (tab === 'credentials') renderCredentialsChart();
};

let _credActiveGroup = 'staff'; // 'staff' | 'tutors' | 'students'
let _credAllUsers    = null;    // cached after first load

async function renderCredentialsChart() {
  const el = document.getElementById('credentialsChart');
  if (!el) return;

  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Loading users...</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) { el.innerHTML = '<div style="padding:24px;color:#c53030;font-weight:700;">Not logged in.</div>'; return; }

    /* Load all users from API */
    const res  = await fetch('https://api.stemnestacademy.co.uk/api/users?limit=500', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    _credAllUsers = data.users || [];

  } catch(e) {
    el.innerHTML = '<div style="padding:24px;color:#c53030;font-weight:700;">Failed to load users: ' + e.message + '</div>';
    return;
  }

  _renderCredTab();
}

function _renderCredTab() {
  const el = document.getElementById('credentialsChart');
  if (!el || !_credAllUsers) return;

  const q = (document.getElementById('credSearch')?.value || '').toLowerCase();

  /* Group users */
  const staffRoles   = ['admin','super_admin','sales','presales','postsales','operations','hr'];
  const tutorRoles   = ['tutor'];
  const studentRoles = ['student'];

  let sourceList;
  if (_credActiveGroup === 'staff')    sourceList = _credAllUsers.filter(u => staffRoles.includes(u.role));
  else if (_credActiveGroup === 'tutors')   sourceList = _credAllUsers.filter(u => tutorRoles.includes(u.role));
  else                                      sourceList = _credAllUsers.filter(u => studentRoles.includes(u.role));

  /* Filter by search */
  const list = q ? sourceList.filter(u =>
    (u.name  || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (u.role  || '').toLowerCase().includes(q)
  ) : sourceList;

  const staffCount   = _credAllUsers.filter(u => staffRoles.includes(u.role)).length;
  const tutorCount   = _credAllUsers.filter(u => tutorRoles.includes(u.role)).length;
  const studentCount = _credAllUsers.filter(u => studentRoles.includes(u.role)).length;

  const tabBtn = (group, label, count) => {
    const active = _credActiveGroup === group;
    return '<button onclick="_credSwitchGroup(\'' + group + '\')" style="' +
      'flex:1;padding:11px;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:14px;cursor:pointer;border:none;' +
      (group !== 'staff' ? 'border-left:2px solid #e8eaf0;' : '') +
      'background:' + (active ? 'var(--blue,#1a56db)' : '#fff') + ';' +
      'color:' + (active ? '#fff' : 'var(--mid,#4a5568)') + ';">' +
      label + ' (' + count + ')' +
    '</button>';
  };

  const thS = 'padding:11px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:12px 14px;vertical-align:middle;';

  const rows = list.map(function(u, i) {
    const roleLabel = {
      super_admin: '👑 Super Admin', admin: '🛡️ Admin', tutor: '🎓 Tutor',
      student: '🧑‍💻 Student', sales: '💼 Sales', presales: '📥 Pre-Sales',
      postsales: '💳 Post-Sales', operations: '⚙️ Operations', hr: '👥 HR'
    }[u.role] || u.role;

    return '<tr style="border-bottom:1px solid #f0f2f8;' + (i%2===0?'':'background:#fafbff;') + '">' +
      '<td style="' + tdS + ';font-weight:800;color:var(--dark);">' + (u.name || '—') + '</td>' +
      '<td style="' + tdS + ';font-size:12px;color:var(--mid);font-weight:700;">' + (u.email || '—') + '</td>' +
      '<td style="' + tdS + ';font-size:12px;font-weight:700;color:var(--light);">' + (u.staff_id || '—') + '</td>' +
      '<td style="' + tdS + '"><span style="font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;background:var(--blue-light);color:var(--blue);">' + roleLabel + '</span></td>' +
      '<td style="' + tdS + '">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button onclick="credLoginAs(\'' + u.id + '\',\'' + (u.role) + '\')" ' +
            'style="background:#1a56db;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">🔑 Login As</button>' +
          (_credActiveGroup === 'students' ?
            '<button onclick="credDeleteStudent(\'' + u.id + '\',\'' + (u.name || '').replace(/'/g,'') + '\')" ' +
              'style="background:#fde8e8;color:#c53030;border:1.5px solid #fca5a5;border-radius:8px;padding:7px 14px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">🗑️ Delete</button>' +
            '<button onclick="credEditName(\'' + u.id + '\',\'' + (u.name || '').replace(/'/g,'') + '\')" ' +
              'style="background:var(--bg);color:var(--dark);border:1.5px solid #e8eaf0;border-radius:8px;padding:7px 14px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">✏️ Edit Name</button>'
            : '') +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');

  el.innerHTML =
    '<div style="display:flex;gap:0;margin-bottom:20px;border-radius:12px;overflow:hidden;border:2px solid #e8eaf0;">' +
      tabBtn('staff',    '👔 Staff & Admin', staffCount) +
      tabBtn('tutors',   '🎓 Tutors', tutorCount) +
      tabBtn('students', '🧑‍💻 Students', studentCount) +
    '</div>' +
    (list.length === 0
      ? '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No users found.</div>'
      : '<div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">' +
              '<th style="' + thS + '">Name</th>' +
              '<th style="' + thS + '">Email</th>' +
              '<th style="' + thS + '">Staff ID</th>' +
              '<th style="' + thS + '">Role</th>' +
              '<th style="' + thS + '">Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>'
    ) +
    '<div style="margin-top:10px;font-size:12px;color:var(--light);font-weight:700;text-align:right;">' +
      list.length + ' user' + (list.length !== 1 ? 's' : '') +
    '</div>';
}

function _credSwitchGroup(group) {
  _credActiveGroup = group;
  _renderCredTab();
}

async function credLoginAs(userId, role) {
  try {
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/auth/impersonate/' + userId, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.success) { showToast('Login As failed: ' + (data.error || 'unknown'), 'error'); return; }

    /* Save the impersonation token and open the dashboard in a new tab */
    const tempKey = 'sn_impersonate_token';
    localStorage.setItem(tempKey, JSON.stringify({
      token:    data.token,
      user:     data.user,
      redirect: data.redirect,
      expires:  Date.now() + 30 * 60 * 1000,
    }));

    /* Open dashboard in new tab — the target page reads sn_impersonate_token on load */
    const url = 'https://stemnestacademy.co.uk' + data.redirect + '?impersonate=1';
    window.open(url, '_blank');
    showToast('✅ Opening ' + data.user.name + '\'s dashboard in a new tab.', 'success');
  } catch(e) {
    showToast('Login As error: ' + e.message, 'error');
  }
}

async function credDeleteStudent(userId, name) {
  if (!confirm('Delete student "' + name + '"?\n\nThis will:\n• Deactivate their account (they cannot log in)\n• Cancel all future bookings\n• Remove them from the tutor calendar\n\nThis cannot be undone.')) return;

  try {
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/users/' + userId, {
      method:  'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.success) { showToast('Delete failed: ' + (data.error || 'unknown'), 'error'); return; }

    showToast('✅ Student deactivated. ' + (data.cancelledBookings || 0) + ' future bookings cancelled.', 'success');
    /* Refresh user list */
    _credAllUsers = _credAllUsers.filter(u => u.id !== userId);
    _renderCredTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function credEditName(userId, currentName) {
  const newName = prompt('Enter new name for this student:', currentName);
  if (!newName || newName.trim() === currentName) return;

  try {
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/users/' + userId + '/update-name', {
      method:  'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: newName.trim() })
    });
    const data = await res.json();
    if (!data.success) { showToast('Update failed: ' + (data.error || 'unknown'), 'error'); return; }

    showToast('✅ Name updated to "' + newName.trim() + '"', 'success');
    /* Update in-memory list */
    const idx = _credAllUsers.findIndex(u => u.id === userId);
    if (idx !== -1) _credAllUsers[idx].name = newName.trim();
    _renderCredTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function togglePwVisibility(spanId, btn) {
  const span = document.getElementById(spanId);
  if (!span) return;
  const isBlurred = span.style.filter === 'blur(4px)';
  span.style.filter = isBlurred ? 'none' : 'blur(4px)';
  btn.textContent   = isBlurred ? '🙈 Hide' : '👁 Show';
}

