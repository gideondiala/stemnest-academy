/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — SALES DASHBOARD JS
   Learning Advisor portal: upcoming demos, pipeline,
   pitch logging, conversion tracking.
═══════════════════════════════════════════════════════ */

/* ── Load logged-in sales person ── */
function getLoggedInSales() {
  try {
    const user = JSON.parse(localStorage.getItem('sn_api_user'));
    if (user && user.role === 'sales') {
      return {
        id:       user.staffId || user.staff_id || user.id,  // staff ID for display (SP001)
        dbId:     user.id,                                    // UUID for API matching
        name:     user.name,
        initials: user.name.slice(0,2).toUpperCase(),
        email:    user.email,
        phone:    user.phone || ''
      };
    }
    return {
      id:'SP001', dbId:'', name:'Alex Johnson', initials:'AJ',
      email:'alex.johnson@stemnestacademy.co.uk', phone:'', photo:null,
    };
  } catch {
    return { id:'SP001', dbId:'', name:'Alex Johnson', initials:'AJ', photo:null };
  }
}

let SALES = getLoggedInSales();
const SALES_TABS = ['overview','leads','upcoming','pipeline','pitchlog','converted','followup','retention'];
let activePitchBookingId = null;
let selectedInterest = 3;

/* ── STATE MANAGEMENT ── */
window.SALES_DATA = {
  bookings: [],
  pipeline: [],
  leads: [],
  courses: [],
  reports: []
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  SALES = getLoggedInSales();
  setGreeting();
  renderSidebarProfile();
  buildInterestGrid();
  
  _loadSalesFromAPI().then(() => {
    showSalesTab('overview');
  });
  
  bindModalCloses();

  /* Auto-refresh every 60 seconds */
  setInterval(() => {
    _loadSalesFromAPI().then(() => {
      updateStats();
      const activeTab = SALES_TABS.find(t => {
        const el = document.getElementById('tab-' + t);
        return el && el.style.display !== 'none';
      });
      if (activeTab === 'overview')  renderOverview();
      if (activeTab === 'upcoming')  renderUpcoming();
      if (activeTab === 'pipeline')  renderPipeline();
      if (activeTab === 'followup')  renderFollowUp();
    });
  }, 60000);
});

async function _loadSalesFromAPI() {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;

    // Fetch bookings assigned to me
    const bRes = await fetch('https://api.stemnestacademy.co.uk/api/bookings?limit=500', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const bData = await bRes.json();
    if (bData.bookings) {
      window.SALES_DATA.bookings = bData.bookings.map(b => {
        let notes = {};
        try { notes = typeof b.notes === 'string' ? JSON.parse(b.notes) : (b.notes || {}); } catch {}
        return {
          id:              b.id,
          dbId:            b.id,
          studentName:     b.lesson_name || notes.studentName || '—',
          age:             notes.age || b.grade || '—',
          grade:           b.grade || notes.grade || '—',
          email:           b.student_email || notes.email || '—',
          whatsapp:        notes.whatsapp || '—',
          subject:         b.subject || '—',
          date:            b.date ? b.date.split('T')[0] : '—',
          time:            notes.time || b.time || '—',
          status:          b.status,
          assignedTutor:   b.tutor_name || '—',
          assignedSalesId:    b.sales_staff_id || b.sales_id || '',
          assignedSalesDbId:  b.sales_id || '',
          classLink:       b.class_link || '',
          bookedAt:        b.booked_at || b.created_at,
          scheduledAt:     b.scheduled_at,
          completedAt:     b.completed_at,
          isDemoClass:     b.is_demo,
        };
      });
    }

    // Attempt to fetch dashboard data (pipeline, leads, etc.)
    try {
      const dRes = await fetch('https://api.stemnestacademy.co.uk/api/sync/dashboard/sales', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const dData = await dRes.json();
      if (dData.pipeline) window.SALES_DATA.pipeline = dData.pipeline;
      if (dData.leads)    window.SALES_DATA.leads    = dData.leads;

      /* Merge class reports into bookings so Lead cards show teacher observations */
      if (dData.classReports && dData.classReports.length > 0) {
        const reportMap = {};
        dData.classReports.forEach(r => { reportMap[r.booking_id] = r; });
        window.SALES_DATA.bookings = window.SALES_DATA.bookings.map(b => {
          const rep = reportMap[b.id];
          if (rep) {
            return {
              ...b,
              teacherQuality:   rep.class_quality   || '',
              teacherInterest:  rep.student_interest || '',
              teacherPower:     rep.purchasing_power || '',
              teacherNotes:     rep.notes            || '',
            };
          }
          return b;
        });
      }
    } catch {}

    // If pipeline is empty from API, it's just empty — no localStorage fallback
    if (window.SALES_DATA.pipeline.length === 0) {
      window.SALES_DATA.pipeline = [];
    }

    // Fetch pathways and courses for pitch dropdown
    try {
      /* Try pathways first — these are the main sellable products */
      const pwRes = await fetch('https://api.stemnestacademy.co.uk/api/pathways', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (pwRes.ok) {
        const pwData = await pwRes.json();
        const pathwayItems = (pwData.pathways || []).map(p => ({
          id:      p.id,
          name:    p.name,
          subject: p.subject || 'Coding',
          price:   p.price   || null,
          type:    'pathway',
        }));
        window.SALES_DATA.courses = pathwayItems;
      }

      /* Also try courses table as fallback/addition */
      const cRes = await fetch('https://api.stemnestacademy.co.uk/api/courses', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (cRes.ok) {
        const cData = await cRes.json();
        const courseItems = (cData.courses || []).map(c => ({
          id:      c.id,
          name:    c.name,
          subject: c.subject,
          price:   c.price,
          type:    'course',
        }));
        /* Merge — pathways first, then courses */
        if (courseItems.length > 0) {
          window.SALES_DATA.courses = [...window.SALES_DATA.courses, ...courseItems];
        }
      }
    } catch {}

  } catch (e) {
    console.warn('[Sales Dashboard] API load failed:', e.message);
  }
}

function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById('salesGreeting');
  if (el) el.textContent = h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';
  const nameEl = document.getElementById('salesGreetingName');
  if (nameEl) nameEl.textContent = SALES.name.split(' ')[0];
  const navEl = document.getElementById('navSalesName');
  if (navEl) navEl.textContent = SALES.name;
  const dateEl = document.getElementById('salesDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function renderSidebarProfile() {
  const wrap = document.getElementById('salesAvatarWrap');
  if (wrap) {
    wrap.innerHTML = SALES.photo
      ? `<img src="${SALES.photo}" class="sidebar-avatar" style="object-fit:cover;" alt="${SALES.name}">`
      : `<div class="sidebar-avatar" style="background:linear-gradient(135deg,var(--orange),#fbbf24);">${SALES.initials || SALES.name.slice(0,2).toUpperCase()}</div>`;
  }
  const nameEl = document.getElementById('salesSidebarName');
  if (nameEl) nameEl.textContent = SALES.name;
  const idEl = document.getElementById('salesIdBadge');
  if (idEl) idEl.textContent = SALES.id;
}

/* ── Get my bookings (assigned to this sales person) ── */
function getMyBookings() {
  const myId   = SALES.id;    // staff ID e.g. SP001
  const myDbId = SALES.dbId;  // UUID from DB
  return window.SALES_DATA.bookings.filter(b => {
    const sid   = b.assignedSalesId   || '';
    const sidDb = b.assignedSalesDbId || '';
    /* Match if staff ID OR UUID matches against either field */
    if (!sid && !sidDb) return false; // unassigned — don't show to anyone
    return (myId   && (sid === myId   || sidDb === myId))   ||
           (myDbId && (sid === myDbId || sidDb === myDbId));
  });
}

function getMyPipeline() {
  return window.SALES_DATA.pipeline || [];
}

async function saveMyPipeline(list) {
  window.SALES_DATA.pipeline = list;
  // Push to API
  const token = localStorage.getItem('sn_access_token');
  if (token && list.length > 0) {
    const latest = list[0];
    fetch('https://api.stemnestacademy.co.uk/api/sync/pipeline', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId:       latest.bookingId,
        studentName:     latest.studentName,
        subject:         latest.subject,
        course:          latest.course,
        status:          latest.status,
        interest:        latest.interest,
        purchasingPower: latest.purchasingPower,
        paymentAmount:   latest.paymentAmount,
        notes:           latest.notes,
      })
    }).catch(e => console.warn('[Sales] Pipeline save failed:', e.message));
  }
}

/* ── TAB SWITCHING ── */
function showSalesTab(tab) {
  SALES_TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(l => {
    l.classList.toggle('active', l.dataset.tab === tab);
  });
  updateStats();
  if (tab === 'overview')   renderOverview();
  if (tab === 'leads')      renderLeads();
  if (tab === 'upcoming')   renderUpcoming();
  if (tab === 'pipeline')   renderPipeline();
  if (tab === 'pitchlog')   filterPitchRecords(_currentPitchFilter || 'today');
  if (tab === 'converted')  renderConverted();
  if (tab === 'followup')   renderFollowUp();
}

/* ── STATS ── */
function updateStats() {
  const bookings  = getMyBookings();
  const pipeline  = getMyPipeline();
  const upcoming  = bookings.filter(b => b.status === 'scheduled');
  const converted = pipeline.filter(p => p.status === 'converted');
  const revenue   = converted.reduce((s, p) => s + (parseFloat(p.paymentAmount) || 0), 0);
  
  // Use in-memory leads or calculate from completed bookings if missing
  let leads = window.SALES_DATA.leads || [];
  if (leads.length === 0) {
     leads = bookings.filter(b => b.status === 'completed' && b.isDemoClass).map(b => ({
        id: b.id, bookingId: b.id, studentName: b.studentName, status: 'new', leadOwnerId: b.assignedSalesId
     }));
  }

  setText('sStat1', upcoming.length);
  setText('sStat2', pipeline.filter(p => p.status !== 'converted' && p.status !== 'lost').length);
  setText('sStat3', converted.length);
  setText('sStat4', '£' + revenue.toLocaleString());
  setText('upcomingBadge', upcoming.length);
  setText('leadsBadge', leads.filter(l => l.status === 'new').length);

  /* Follow-up badge — completed demos with no pitch logged yet */
  const needsFollowUp = _getFollowUpItems();
  setText('followupBadge', needsFollowUp.length);
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

/* ── OVERVIEW ── */
function renderOverview() {
  const bookings = getMyBookings().filter(b => b.status === 'scheduled')
    .sort((a, b) => new Date(a.date + 'T' + (a.time || '00:00')) - new Date(b.date + 'T' + (b.time || '00:00')));

  // ── Upcoming demos table (up to 5) ──
  const upcomingEl = document.getElementById('nextDemoCard');
  if (upcomingEl) {
    if (!bookings.length) {
      upcomingEl.innerHTML = '<div class="snd-empty">No upcoming demo classes assigned to you yet.</div>';
    } else {
      const shown = bookings.slice(0, 5);
      upcomingEl.innerHTML = `
        <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Student</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Subject</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Date & Time</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Teacher</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Contact</th>
                <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${shown.map((b, i) => `
                <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
                  <td style="padding:12px 14px;">
                    <div style="font-weight:800;color:var(--dark);">${b.studentName}</div>
                    <div style="font-size:11px;color:var(--light);">🎓 ${b.grade || '—'}, Age ${b.age || '—'}</div>
                  </td>
                  <td style="padding:12px 14px;font-weight:700;color:var(--mid);">${b.subject || '—'}</td>
                  <td style="padding:12px 14px;">
                    <div style="font-weight:800;color:var(--dark);">${formatDateSimple(b.date)}</div>
                    <div style="font-size:12px;color:var(--mid);">${b.time || '—'}</div>
                  </td>
                  <td style="padding:12px 14px;font-weight:700;color:var(--mid);">${b.assignedTutor || '—'}</td>
                  <td style="padding:12px 14px;">
                    <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${b.email || '—'}</div>
                    <div style="font-size:12px;font-weight:700;color:var(--mid);">📱 ${b.whatsapp || '—'}</div>
                  </td>
                  <td style="padding:12px 14px;text-align:center;">
                    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                      ${b.classLink ? `<a href="${b.classLink}" target="_blank" style="background:var(--green);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;text-decoration:none;white-space:nowrap;">🚀 Join</a>` : ''}
                      <button onclick="openPitchModal('${b.id}')" style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;">💼 Log Pitch</button>
                      ${b.whatsapp && b.whatsapp !== '—' ? `<a href="https://wa.me/${b.whatsapp.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;text-decoration:none;white-space:nowrap;">💬 WA</a>` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${bookings.length > 5 ? `<div style="text-align:center;margin-top:12px;"><button class="btn btn-outline" style="font-size:13px;" onclick="showSalesTab('upcoming')">See All ${bookings.length} Upcoming →</button></div>` : ''}`;
    }
  }

  // ── Recent pipeline (up to 5) ──
  const pipeline = getMyPipeline().slice(0, 5);
  const listEl = document.getElementById('recentPipelineList');
  if (listEl) {
    listEl.innerHTML = pipeline.length
      ? pipeline.map(p => buildPipelineCard(p)).join('') +
        `<div style="text-align:center;margin-top:12px;"><button class="btn btn-outline" style="font-size:13px;" onclick="showSalesTab('pipeline')">Full Pipeline →</button></div>`
      : '<div class="snd-empty">No pipeline records yet. Log your first pitch after a demo class.</div>';
  }
}

/* ── UPCOMING DEMOS ── */
let _upcomingPage = 0;
const UPCOMING_PAGE_SIZE = 10;

function renderUpcoming() {
  const bookings = getMyBookings().filter(b => b.status === 'scheduled')
    .sort((a, b) => new Date(a.date + 'T' + (a.time || '00:00')) - new Date(b.date + 'T' + (b.time || '00:00')));
  const el = document.getElementById('upcomingDemosList');
  if (!el) return;
  if (!bookings.length) {
    el.innerHTML = '<div class="snd-empty">No upcoming demos assigned to you.</div>';
    return;
  }

  _upcomingPage = 0;
  _renderUpcomingTable(bookings, el);
}

function _renderUpcomingTable(bookings, el) {
  const slice = bookings.slice(0, (_upcomingPage + 1) * UPCOMING_PAGE_SIZE);
  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Student</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Subject</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Date & Time</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Teacher</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Contact</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${slice.map((b, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--dark);">${b.studentName}</div>
                <div style="font-size:11px;color:var(--light);">🎓 ${b.grade || '—'}, Age ${b.age || '—'}</div>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.subject || '—'}</td>
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--dark);">${formatDateSimple(b.date)}</div>
                <div style="font-size:12px;color:var(--mid);">${b.time || '—'}</div>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.assignedTutor || '—'}</td>
              <td style="padding:14px 16px;">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${b.email || '—'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📱 ${b.whatsapp || '—'}</div>
              </td>
              <td style="padding:14px 16px;text-align:center;">
                <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                  ${b.classLink ? `<a href="${b.classLink}" target="_blank" class="ab-btn ab-btn-assign">🚀 Join</a>` : ''}
                  <button class="ab-btn ab-btn-view" onclick="openPitchModal('${b.id}')">💼 Log Pitch</button>
                  ${b.whatsapp && b.whatsapp !== '—' ? `<a href="https://wa.me/${b.whatsapp.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;text-decoration:none;white-space:nowrap;">💬 WA</a>` : ''}
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${slice.length < bookings.length ? `
      <div style="text-align:center;margin-top:16px;">
        <button class="btn btn-outline" onclick="_loadMoreUpcoming()">Load More (${bookings.length - slice.length} remaining) →</button>
      </div>` : ''}`;

  // Store bookings for load more
  el.dataset.total = bookings.length;
  window._upcomingBookings = bookings;
}

function _loadMoreUpcoming() {
  _upcomingPage++;
  const el = document.getElementById('upcomingDemosList');
  if (el && window._upcomingBookings) _renderUpcomingTable(window._upcomingBookings, el);
}

/* ── PIPELINE ── */
let _pipelinePage = 0;
const PIPELINE_PAGE_SIZE = 10;

function renderPipeline() {
  const filter = document.getElementById('pipelineFilter')?.value || 'all';
  let pipeline = getMyPipeline();
  if (filter !== 'all') pipeline = pipeline.filter(p => p.status === filter);
  const el = document.getElementById('pipelineList');
  if (!el) return;
  if (!pipeline.length) {
    el.innerHTML = '<div class="snd-empty">No records in this category.</div>';
    return;
  }
  _pipelinePage = 0;
  window._pipelineData = pipeline;
  _renderPipelineSlice(el);
}

function _renderPipelineSlice(el) {
  const pipeline = window._pipelineData || [];
  const slice = pipeline.slice(0, (_pipelinePage + 1) * PIPELINE_PAGE_SIZE);
  el.innerHTML = slice.map(p => buildPipelineCard(p, true)).join('') +
    (slice.length < pipeline.length
      ? `<div style="text-align:center;margin-top:16px;"><button class="btn btn-outline" onclick="_loadMorePipeline()">Load More (${pipeline.length - slice.length} remaining) →</button></div>`
      : '');
}

function _loadMorePipeline() {
  _pipelinePage++;
  const el = document.getElementById('pipelineList');
  if (el) _renderPipelineSlice(el);
}

function buildPipelineCard(p, showEdit = false) {
  const statusClass = { pitched:'ps-pitched', interested:'ps-interested', followup:'ps-followup', converted:'ps-converted', lost:'ps-lost' };
  const statusLabel = { pitched:'📣 Pitched', interested:'🔥 Interested', followup:'📞 Follow-up', converted:'✅ Converted', lost:'❌ Lost' };
  const initials = p.studentName?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '??';
  const stars = '★'.repeat(p.interest || 0) + '☆'.repeat(5 - (p.interest || 0));
  return `
    <div class="pipeline-card">
      <div class="pc-avatar">${initials}</div>
      <div class="pc-info">
        <div class="pc-name">${p.studentName}</div>
        <div class="pc-meta">
          📚 ${p.subject} · 📅 ${formatDateSimple(p.date)} · ${p.course || '—'}<br>
          Interest: <span style="color:#f59e0b;">${stars}</span> · Power: ${p.purchasingPower || '—'}
          ${p.paymentAmount ? ` · 💷 £${p.paymentAmount}` : ''}
        </div>
        ${p.notes ? `<div class="pc-notes">${p.notes}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
        <span class="pc-status ${statusClass[p.status] || 'ps-pitched'}">${statusLabel[p.status] || p.status}</span>
        ${showEdit ? `<button class="ab-btn ab-btn-view" onclick="openPitchModalById('${p.bookingId}')">✏️ Edit</button>` : ''}
        ${p.status !== 'converted' ? `<button class="ab-btn ab-btn-complete" onclick="markConverted('${p.bookingId}')">✅ Mark Paid</button>` : ''}
        <button class="ab-btn" style="background:var(--blue);color:#fff;"
          onclick="generatePaymentLink('${p.bookingId}')">
          💳 New Payment Link
        </button>
      </div>
    </div>`;
}

/* ── CONVERTED ── */
function renderConverted() {
  const converted = getMyPipeline().filter(p => p.status === 'converted');
  const el = document.getElementById('convertedList');
  if (!el) return;
  if (!converted.length) {
    el.innerHTML = '<div class="snd-empty">No conversions yet. Keep pitching! 💪</div>';
    return;
  }
  el.innerHTML = converted.map(p => buildPipelineCard(p)).join('');
}

/* ── PITCH MODAL ── */
function openPitchModal(bookingId) {
  const b = getMyBookings().find(x => x.id === bookingId);
  if (!b) return;
  activePitchBookingId = bookingId;

  document.getElementById('pitchStudentInfo').innerHTML = `
    🎓 <strong>${b.studentName}</strong> (${b.grade}, Age ${b.age})<br>
    📚 <strong>${b.subject}</strong> · 📅 ${formatDateSimple(b.date)} at ${b.time}<br>
    📧 ${b.email} · 📱 ${b.whatsapp}`;

  // Pre-fill if existing record
  const existing = getMyPipeline().find(p => p.bookingId === bookingId);
  if (existing) {
    setVal('pitchStatus',          existing.status || 'pitched');
    setVal('pitchPurchasingPower', existing.purchasingPower || 'medium');
    setVal('pitchNotes',           existing.notes || '');
    setVal('pitchPaymentAmount',   existing.paymentAmount || '');
    selectedInterest = existing.interest || 3;
  } else {
    setVal('pitchStatus', 'pitched');
    setVal('pitchNotes', '');
    setVal('pitchPaymentAmount', '');
    selectedInterest = 3;
  }

  // Clear any previous payment link display
  const linkDisplay = document.getElementById('payLinkDisplay');
  if (linkDisplay) linkDisplay.innerHTML = '';

  // Populate course dropdown from admin courses
  _populatePitchCourseDropdown(b.subject, existing ? existing.course : '');

  updateInterestGrid();
  document.getElementById('pitchModalOverlay').classList.add('open');
}

function _populatePitchCourseDropdown(subjectHint, selectedCourse) {
  const sel = document.getElementById('pitchCourse');
  if (!sel) return;

  const items = window.SALES_DATA.courses || [];

  /* If we have items, filter by subject hint where possible */
  let filtered = items;
  if (subjectHint && items.length > 0) {
    const sub = subjectHint.toLowerCase();
    const matched = items.filter(c =>
      c.subject && c.subject.toLowerCase().includes(sub)
    );
    /* Only filter if there are matches — otherwise show all */
    if (matched.length > 0) filtered = matched;
  }

  /* If still nothing, show all items */
  if (filtered.length === 0) filtered = items;

  if (filtered.length === 0) {
    sel.innerHTML = '<option value="">— No courses/pathways found —</option>';
    return;
  }

  /* Separate pathways and courses for grouped display */
  const pathways = filtered.filter(c => c.type === 'pathway' || !c.type);
  const courses   = filtered.filter(c => c.type === 'course');

  let html = '<option value="">— Select a course/pathway —</option>';

  if (pathways.length > 0) {
    html += '<optgroup label="📚 Pathways">';
    html += pathways.map(p =>
      `<option value="${p.name}" ${selectedCourse === p.name ? 'selected' : ''}>${p.name}${p.price ? ' — £' + p.price : ''}</option>`
    ).join('');
    html += '</optgroup>';
  }

  if (courses.length > 0) {
    html += '<optgroup label="🎓 Courses">';
    html += courses.map(c =>
      `<option value="${c.name}" ${selectedCourse === c.name ? 'selected' : ''}>${c.name}${c.price ? ' — £' + c.price + '/mo' : ''}</option>`
    ).join('');
    html += '</optgroup>';
  }

  /* If filtered didn't split cleanly, just show everything */
  if (pathways.length === 0 && courses.length === 0) {
    html += filtered.map(c =>
      `<option value="${c.name}" ${selectedCourse === c.name ? 'selected' : ''}>${c.name}</option>`
    ).join('');
  }

  sel.innerHTML = html;
}

function openPitchModalById(bookingId) { openPitchModal(bookingId); }

function closePitchModal() {
  document.getElementById('pitchModalOverlay').classList.remove('open');
  activePitchBookingId = null;
}

function savePitch() {
  if (!activePitchBookingId) return;
  const b = getMyBookings().find(x => x.id === activePitchBookingId);
  if (!b) return;

  const record = {
    bookingId:       activePitchBookingId,
    studentName:     b.studentName,
    subject:         b.subject,
    date:            b.date,
    email:           b.email,
    whatsapp:        b.whatsapp,
    grade:           b.grade,
    age:             b.age,
    status:          document.getElementById('pitchStatus')?.value || 'pitched',
    course:          document.getElementById('pitchCourse')?.value || '',
    interest:        selectedInterest,
    purchasingPower: document.getElementById('pitchPurchasingPower')?.value,
    notes:           document.getElementById('pitchNotes')?.value.trim(),
    paymentAmount:   document.getElementById('pitchPaymentAmount')?.value || '',
    updatedAt:       new Date().toISOString(),
  };

  const pipeline = getMyPipeline();
  const idx = pipeline.findIndex(p => p.bookingId === activePitchBookingId);
  if (idx !== -1) pipeline[idx] = record;
  else pipeline.unshift(record);
  saveMyPipeline(pipeline);

  /* Push to real API */
  if (typeof pushPipelineRecord === 'function') {
    pushPipelineRecord(record);
  }

  // If converted, update booking status (Ideally via API)
  if (record.status === 'converted') {
    if (b.dbId) {
      const token = localStorage.getItem('sn_access_token');
      fetch('https://api.stemnestacademy.co.uk/api/bookings/' + b.dbId + '/status', {
         method: 'PUT',
         headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
         body: JSON.stringify({ status: 'converted', paymentAmount: record.paymentAmount })
      }).catch(console.warn);
    }
  }

  closePitchModal();
  updateStats();
  showSalesTab('pipeline');
  showToast('✅ Pitch record saved!');
}

function markConverted(bookingId) {
  const pipeline = getMyPipeline();
  const idx = pipeline.findIndex(p => p.bookingId === bookingId);
  if (idx !== -1) {
    pipeline[idx].status = 'converted';
    pipeline[idx].updatedAt = new Date().toISOString();
    saveMyPipeline(pipeline);
    updateStats();
    renderPipeline();
    showToast('✅ Marked as converted!');
  }
}

/* ── INTEREST GRID ── */
function buildInterestGrid() {
  const grid = document.getElementById('interestGrid');
  if (!grid) return;
  grid.innerHTML = [1,2,3,4,5].map(n => `
    <div class="interest-star ${n <= selectedInterest ? 'selected' : ''}" onclick="setInterest(${n})">★</div>`).join('');
}
function updateInterestGrid() {
  document.querySelectorAll('.interest-star').forEach((el, i) => {
    el.classList.toggle('selected', i + 1 <= selectedInterest);
  });
}
function setInterest(n) {
  selectedInterest = n;
  updateInterestGrid();
}

/* ── PROFILE MODAL ── */
function openSalesProfileModal() {
  const nameEl = document.getElementById('salesPmName');
  const idEl   = document.getElementById('salesPmId');
  const avEl   = document.getElementById('salesPmAvatar');
  if (nameEl) nameEl.textContent = SALES.name;
  if (idEl)   idEl.textContent   = 'ID: ' + SALES.id;
  if (avEl)   avEl.innerHTML     = `<div class="pm-avatar" style="background:linear-gradient(135deg,var(--orange),#fbbf24);">${SALES.initials || SALES.name.slice(0,2).toUpperCase()}</div>`;
  setVal('spFieldName',  SALES.name);
  setVal('spFieldEmail', SALES.email || '');
  setVal('spFieldPhone', SALES.phone || '');
  document.getElementById('salesProfileOverlay').classList.add('open');
}
function closeSalesProfileModal() { document.getElementById('salesProfileOverlay').classList.remove('open'); }
function saveSalesProfile() {
  SALES.name  = document.getElementById('spFieldName')?.value.trim() || SALES.name;
  SALES.email = document.getElementById('spFieldEmail')?.value.trim() || SALES.email;
  SALES.phone = document.getElementById('spFieldPhone')?.value.trim();
  SALES.initials = SALES.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  // In a real app we'd update the user profile via API here
  renderSidebarProfile();
  closeSalesProfileModal();
  showToast('✅ Profile updated!');
}

/* ── HELPERS ── */
function bindModalCloses() {
  ['pitchModalOverlay','salesProfileOverlay'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('click', e => {
      if (e.target !== el) return;
      if (id === 'pitchModalOverlay') closePitchModal();
      else closeSalesProfileModal();
    });
  });
}
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }
function formatDateSimple(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }); }
  catch { return dateStr; }
}


/* ══════════════════════════════════════════════════════
   RETENTION ALERTS — students near end of credits
   Fetched from GET /api/sync/dashboard/sales retention data
══════════════════════════════════════════════════════ */

async function loadRetentionAlerts() {
  const el = document.getElementById('retentionAlertsList');
  if (!el) return;

  el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">⏳ Loading...</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) { el.innerHTML = '<div style="padding:20px;color:orange;">Not logged in.</div>'; return; }

    const res = await fetch('https://api.stemnestacademy.co.uk/api/sync/dashboard/retention', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) { throw new Error('API returned ' + res.status); }
    const data = await res.json();
    const alerts = data.retentionAlerts || [];

    if (!alerts.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:12px;">🌟</div>
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">All students are well-topped-up!</div>
        <div style="font-size:14px;color:var(--light);margin-top:6px;">No students are at risk of running out of credits.</div>
      </div>`;
      return;
    }

    const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
    const tdS = 'padding:14px 16px;vertical-align:middle;';

    el.innerHTML = `
      <div style="background:#fff3e0;border-radius:12px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#e65100;font-weight:700;">
        🔔 These active students are running low on credits. Reach out now to discuss renewal before their classes stop.
      </div>
      <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
              <th style="${thS}">Student</th>
              <th style="${thS}">Credits Left</th>
              <th style="${thS}">Contact</th>
              <th style="${thS}">Subject</th>
              <th style="${thS}">Status</th>
              <th style="${thS};text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${alerts.map((a, i) => {
              const credits = parseInt(a.credits || 0);
              const urgency = credits <= 0 ? 'critical' : credits === 1 ? 'urgent' : 'warning';
              const badge   = credits <= 0
                ? '<span style="background:#fde8e8;color:#c53030;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">🔴 ' + credits + ' credits</span>'
                : credits === 1
                ? '<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">⚠️ 1 credit left</span>'
                : '<span style="background:#fef9c3;color:#854d0e;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">📚 ' + credits + ' credits</span>';
              return `<tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
                <td style="${tdS}">
                  <div style="font-weight:800;color:var(--dark);">${a.student_name || '—'}</div>
                  <div style="font-size:11px;color:var(--light);">ID: ${a.student_id?.slice(0,8) || '—'}</div>
                </td>
                <td style="${tdS}">${badge}</td>
                <td style="${tdS}">
                  <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${a.email || '—'}</div>
                  <div style="font-size:12px;font-weight:700;color:var(--mid);margin-top:2px;">
                    ${a.whatsapp && a.whatsapp !== '—'
                      ? `<a href="https://wa.me/${a.whatsapp.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="color:#25D366;font-weight:800;text-decoration:none;">📱 ${a.whatsapp}</a>`
                      : `📱 ${a.whatsapp || '—'}`}
                  </div>
                </td>
                <td style="${tdS};font-weight:700;color:var(--mid);">${a.subject || '—'}</td>
                <td style="${tdS}">
                  ${a.suspended
                    ? '<span style="background:#f5f3ff;color:#7c3aed;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">🔒 Paused</span>'
                    : '<span style="background:#f0fdf4;color:#065f46;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Active</span>'}
                </td>
                <td style="${tdS};text-align:center;">
                  <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                    <button onclick="openRenewalPaymentModal('${a.student_id}', '${a.student_name}', '${a.email}', '${a.whatsapp || ''}')"
                      style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;white-space:nowrap;">
                      💳 Send Renewal Link
                    </button>
                    ${a.whatsapp && a.whatsapp !== '—' ? `
                    <a href="https://wa.me/${a.whatsapp.replace(/[\s\-\(\)\+]/g,'')}?text=${encodeURIComponent('Hi! I\'m reaching out from StemNest Academy regarding ' + a.student_name + '\'s class credits. Do you have a moment to discuss renewal?')}"
                      target="_blank"
                      style="background:#25D366;color:#fff;border:none;border-radius:10px;padding:7px 12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;text-decoration:none;white-space:nowrap;">
                      💬 WhatsApp
                    </a>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div style="padding:20px;color:var(--light);font-weight:700;">Could not load retention alerts: ${err.message}</div>`;
  }
}

/* Open a quick renewal payment modal */
function openRenewalPaymentModal(studentId, studentName, email, whatsapp) {
  /* Reuse the pitch modal but pre-set for renewal */
  const amountInput = document.getElementById('pitchPaymentAmount');
  if (amountInput) amountInput.value = '';

  /* Create a lightweight renewal modal */
  document.getElementById('renewalModalOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'renewalModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:32px;max-width:460px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">💳 Send Renewal Link</div>
        <button onclick="document.getElementById('renewalModalOverlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--light);">✕</button>
      </div>
      <div style="background:var(--bg);border-radius:12px;padding:14px 16px;margin-bottom:20px;font-size:13px;font-weight:700;color:var(--mid);">
        👤 <strong style="color:var(--dark);">${studentName}</strong><br>
        📧 ${email || '—'} &nbsp;·&nbsp; 📱 ${whatsapp || '—'}
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-size:13px;font-weight:800;color:var(--mid);display:block;margin-bottom:6px;">Renewal Amount (£)</label>
        <input type="number" id="renewalAmount" placeholder="e.g. 120" min="1"
          style="width:100%;padding:12px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:700;outline:none;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:20px;">
        <label style="font-size:13px;font-weight:800;color:var(--mid);display:block;margin-bottom:6px;">Package / Note (optional)</label>
        <input type="text" id="renewalNote" placeholder="e.g. 8 classes — Coding"
          style="width:100%;padding:12px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;outline:none;box-sizing:border-box;">
      </div>
      <div id="renewalLinkDisplay"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;">
        <button onclick="document.getElementById('renewalModalOverlay').remove()"
          style="background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;cursor:pointer;color:var(--mid);">
          Cancel
        </button>
        <button onclick="sendRenewalPaymentLink('${studentId}','${studentName}','${email}','${whatsapp}')"
          style="background:var(--blue);color:#fff;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;">
          💳 Generate & Send Link
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function sendRenewalPaymentLink(studentId, studentName, email, whatsapp) {
  const amount = parseFloat(document.getElementById('renewalAmount')?.value || '0');
  const note   = document.getElementById('renewalNote')?.value.trim() || 'Course renewal';

  if (!amount || amount <= 0) {
    showToast('Please enter a renewal amount.', 'error');
    return;
  }

  const btn = document.querySelector('#renewalModalOverlay button:last-child');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/payments/create-link', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId,
        studentName,
        studentEmail: email,
        amount,
        currency:  'GBP',
        credits:   Math.round(amount / 15),
        notes:     note,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');

    const display = document.getElementById('renewalLinkDisplay');
    if (display) {
      display.innerHTML = `
        <div style="background:#f0f4ff;border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="font-size:12px;font-weight:800;color:var(--blue);margin-bottom:8px;">✅ Link sent to parent by email!</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input type="text" value="${data.paymentUrl}" readonly
              style="flex:1;padding:8px 10px;border:2px solid #e8eaf0;border-radius:10px;font-size:11px;font-family:monospace;min-width:0;">
            <button onclick="navigator.clipboard.writeText('${data.paymentUrl}').then(()=>showToast('Copied!'))"
              style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:8px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">📋</button>
            ${whatsapp ? `
            <a href="https://wa.me/${whatsapp.replace(/[\s\-\(\)\+]/g,'')}?text=${encodeURIComponent('Hi! Here is the renewal payment link for ' + studentName + '\'s classes: ' + data.paymentUrl)}"
              target="_blank"
              style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;text-decoration:none;">💬</a>` : ''}
          </div>
        </div>`;
    }
    showToast('✅ Renewal payment link generated and sent!');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💳 Generate & Send Link'; }
  }
}

/* ══════════════════════════════════════════════════════
   NEEDS FOLLOW-UP TAB
   Completed demos assigned to this LA with no pitch yet
══════════════════════════════════════════════════════ */

function _getFollowUpItems() {
  const pipeline  = getMyPipeline();
  const pitchedIds = new Set(pipeline.map(p => p.bookingId));
  return getMyBookings().filter(b =>
    b.isDemoClass &&
    (b.status === 'completed' || b.status === 'incomplete') &&
    !pitchedIds.has(b.id)
  ).sort((a, b) => new Date(b.completedAt || b.date) - new Date(a.completedAt || a.date));
}

function renderFollowUp() {
  const el = document.getElementById('followupList');
  if (!el) return;

  const items = _getFollowUpItems();

  if (!items.length) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:12px;">🎉</div>
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">All followed up!</div>
        <div style="font-size:14px;color:var(--light);margin-top:6px;">No completed demos waiting for a pitch. Great work!</div>
      </div>`;
    return;
  }

  const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:14px 16px;vertical-align:middle;';

  el.innerHTML = `
    <div style="background:#fff3e0;border-radius:12px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#e65100;font-weight:700;">
      🔔 These are demo classes that have been completed but you have not yet logged a pitch for. Follow up with the parent and log the outcome.
    </div>
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thS}">Student</th>
            <th style="${thS}">Subject</th>
            <th style="${thS}">Demo Date</th>
            <th style="${thS}">Contact</th>
            <th style="${thS}">Teacher</th>
            <th style="${thS};text-align:center;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((b, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${b.studentName}</div>
                <div style="font-size:11px;color:var(--light);">🎓 ${b.grade||'—'} · Age ${b.age||'—'}</div>
              </td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${b.subject||'—'}</td>
              <td style="${tdS};">
                <div style="font-weight:800;color:var(--dark);">${formatDateSimple(b.date)}</div>
                <div style="font-size:12px;color:var(--mid);">${b.time||'—'}</div>
                <span style="background:#fde8e8;color:#c53030;font-size:10px;font-weight:900;padding:2px 7px;border-radius:50px;">⏳ No pitch logged</span>
              </td>
              <td style="${tdS}">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${b.email||'—'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);margin-top:2px;">
                  ${b.whatsapp && b.whatsapp !== '—'
                    ? `<a href="https://wa.me/${b.whatsapp.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="color:#25D366;font-weight:800;text-decoration:none;">📱 ${b.whatsapp}</a>`
                    : `📱 ${b.whatsapp||'—'}`}
                </div>
              </td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${b.assignedTutor||'—'}</td>
              <td style="${tdS};text-align:center;">
                <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                  <button onclick="openPitchModal('${b.id}')"
                    style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;white-space:nowrap;">
                    💼 Log Pitch
                  </button>
                  ${b.whatsapp && b.whatsapp !== '—' ? `
                  <a href="https://wa.me/${b.whatsapp.replace(/[\s\-\(\)\+]/g,'')}" target="_blank"
                    style="background:#25D366;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;text-decoration:none;white-space:nowrap;">
                    💬 WhatsApp
                  </a>` : ''}
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ══════════════════════════════════════════════
   GENERATE FINCRA PAYMENT LINK
   Called from the pitch modal — supports NGN and USD
══════════════════════════════════════════════ */

/* Shared exchange rates */
const _RATES = { NGN_PER_GBP: 2050, USD_PER_GBP: 1.27 };

async function generatePaymentLink(bookingId) {
  const b = getMyBookings().find(x => x.id === bookingId);
  if (!b) { showToast('Booking not found.', 'error'); return; }

  /* Read the agreed GBP amount from the pitch modal */
  const gbpAmountInput = document.getElementById('pitchPaymentAmount');
  const gbpAmount      = gbpAmountInput ? parseFloat(gbpAmountInput.value) : 0;

  /* Reuse or create modal */
  document.getElementById('fincraPayLinkOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'fincraPayLinkOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

  const waNum = b.whatsapp && b.whatsapp !== '—' ? b.whatsapp.replace(/[\s\-\(\)\+]/g, '') : '';

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:28px 28px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.2);max-height:90vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
        <div style="font-family:'Fredoka One',cursive;font-size:19px;color:var(--dark);">💳 Generate Payment Link</div>
        <button onclick="document.getElementById('fincraPayLinkOverlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--light);">✕</button>
      </div>

      <div style="background:var(--bg);border-radius:12px;padding:12px 14px;margin-bottom:18px;font-size:13px;font-weight:700;color:var(--mid);">
        👤 <strong style="color:var(--dark);">${b.studentName}</strong> &nbsp;·&nbsp; 📧 ${b.email} &nbsp;·&nbsp; 📱 ${b.whatsapp || '—'}
      </div>

      <div style="margin-bottom:14px;">
        <label style="font-size:13px;font-weight:800;color:var(--mid);display:block;margin-bottom:6px;">GBP Amount (agreed price in £) *</label>
        <input type="number" id="slPayGBP" value="${gbpAmount > 0 ? gbpAmount : ''}" placeholder="e.g. 150" min="1"
          oninput="_slUpdateConvertedAmounts()"
          style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:700;outline:none;box-sizing:border-box;">
      </div>

      <div style="margin-bottom:16px;">
        <label style="font-size:13px;font-weight:800;color:var(--mid);display:block;margin-bottom:8px;">Payment Currency *</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div id="slCurNGNCard" onclick="document.getElementById('slCurNGN').checked=true;_slUpdateConvertedAmounts();"
            style="border:2px solid #e8eaf0;border-radius:12px;padding:14px;text-align:center;cursor:pointer;">
            <input type="radio" name="slPayCurrency" value="NGN" id="slCurNGN" onchange="_slUpdateConvertedAmounts()" style="display:none;">
            <div style="font-size:22px;">🇳🇬</div>
            <div style="font-weight:900;color:var(--dark);font-size:13px;">Nigerian Naira</div>
            <div id="slNGNAmt" style="font-size:12px;font-weight:800;color:#065f46;margin-top:4px;"></div>
          </div>
          <div id="slCurUSDCard" onclick="document.getElementById('slCurUSD').checked=true;_slUpdateConvertedAmounts();"
            style="border:2px solid #e8eaf0;border-radius:12px;padding:14px;text-align:center;cursor:pointer;">
            <input type="radio" name="slPayCurrency" value="USD" id="slCurUSD" onchange="_slUpdateConvertedAmounts()" style="display:none;">
            <div style="font-size:22px;">🇺🇸</div>
            <div style="font-weight:900;color:var(--dark);font-size:13px;">US Dollar</div>
            <div id="slUSDAmt" style="font-size:12px;font-weight:800;color:#065f46;margin-top:4px;"></div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--light);font-weight:700;margin-top:6px;">
          Rate: £1 = ₦${_RATES.NGN_PER_GBP.toLocaleString()} &nbsp;|&nbsp; £1 = $${_RATES.USD_PER_GBP}
        </div>
      </div>

      <div style="margin-bottom:18px;">
        <label style="font-size:13px;font-weight:800;color:var(--mid);display:block;margin-bottom:6px;">
          Amount in chosen currency <span id="slFinalCurLabel" style="color:var(--blue);">(select above)</span>
        </label>
        <input type="number" id="slPayFinalAmt" placeholder="Auto-filled"
          style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:700;outline:none;box-sizing:border-box;">
      </div>

      <div id="slPayLinkDisplay"></div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button onclick="document.getElementById('fincraPayLinkOverlay').remove()"
          style="background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;cursor:pointer;color:var(--mid);">
          Cancel
        </button>
        <button id="slPayGenBtn" onclick="_slDoGenerateLink('${b.id}','${b.studentName}','${b.email}','${waNum}')"
          style="background:var(--blue);color:#fff;border:none;border-radius:12px;padding:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;">
          💳 Generate & Send Link
        </button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  /* Trigger auto-fill if GBP already entered */
  if (gbpAmount > 0) setTimeout(_slUpdateConvertedAmounts, 50);
}

function _slUpdateConvertedAmounts() {
  const gbp    = parseFloat(document.getElementById('slPayGBP')?.value || '0');
  const ngnAmt = gbp > 0 ? Math.round(gbp * _RATES.NGN_PER_GBP) : 0;
  const usdAmt = gbp > 0 ? Math.round(gbp * _RATES.USD_PER_GBP * 100) / 100 : 0;

  const ngnEl = document.getElementById('slNGNAmt');
  const usdEl = document.getElementById('slUSDAmt');
  if (ngnEl) ngnEl.textContent = gbp > 0 ? '≈ ₦' + ngnAmt.toLocaleString() : '';
  if (usdEl) usdEl.textContent = gbp > 0 ? '≈ $' + usdAmt.toFixed(2) : '';

  const ngnChecked = document.getElementById('slCurNGN')?.checked;
  const usdChecked = document.getElementById('slCurUSD')?.checked;

  const ngnCard = document.getElementById('slCurNGNCard');
  const usdCard = document.getElementById('slCurUSDCard');
  if (ngnCard) { ngnCard.style.borderColor = ngnChecked ? '#0e9f6e' : '#e8eaf0'; ngnCard.style.background = ngnChecked ? '#f0fdf4' : '#fff'; }
  if (usdCard) { usdCard.style.borderColor = usdChecked ? '#0e9f6e' : '#e8eaf0'; usdCard.style.background = usdChecked ? '#f0fdf4' : '#fff'; }

  const finalEl = document.getElementById('slPayFinalAmt');
  const labelEl = document.getElementById('slFinalCurLabel');
  if (ngnChecked && finalEl) { finalEl.value = gbp > 0 ? ngnAmt : ''; if (labelEl) labelEl.textContent = '(Nigerian Naira — ₦)'; }
  else if (usdChecked && finalEl) { finalEl.value = gbp > 0 ? usdAmt : ''; if (labelEl) labelEl.textContent = '(US Dollar — $)'; }
}

async function _slDoGenerateLink(bookingId, studentName, email, waNum) {
  const gbpAmount   = parseFloat(document.getElementById('slPayGBP')?.value      || '0');
  const finalAmount = parseFloat(document.getElementById('slPayFinalAmt')?.value  || '0');
  const currency    = document.querySelector('input[name="slPayCurrency"]:checked')?.value || '';

  if (!gbpAmount || gbpAmount <= 0)    { showToast('Please enter the GBP amount.', 'error'); return; }
  if (!currency)                        { showToast('Please select NGN or USD.', 'error'); return; }
  if (!finalAmount || finalAmount <= 0) { showToast('Please confirm the amount in the chosen currency.', 'error'); return; }
  if (!email)                           { showToast('No parent email on this booking.', 'error'); return; }

  const btn = document.getElementById('slPayGenBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/payments/create-link', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName,
        studentEmail: email,
        amount:   finalAmount,
        currency,
        credits:  Math.round(gbpAmount / 15),
        notes:    'StemNest course enrolment — ' + studentName,
        bookingId,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to generate link');

    const sym = currency === 'NGN' ? '₦' : '$';
    const display = document.getElementById('slPayLinkDisplay');
    if (display) {
      const waMsg = encodeURIComponent(
        'Hi! Your StemNest payment link for ' + studentName + ': ' + data.paymentUrl +
        '\n\nAmount: ' + sym + finalAmount.toLocaleString() + ' ' + currency +
        '\nCard, bank transfer & USSD accepted. Valid 48 hours.'
      );
      display.innerHTML = `
        <div style="background:#f0fdf4;border-radius:12px;padding:14px 16px;margin-bottom:14px;border:2px solid #0e9f6e;">
          <div style="font-weight:900;color:#065f46;font-size:13px;margin-bottom:8px;">✅ Link generated and emailed to parent!</div>
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">${sym}${finalAmount.toLocaleString()} ${currency} &nbsp;·&nbsp; £${gbpAmount} equivalent</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <input type="text" value="${data.paymentUrl}" readonly style="flex:1;padding:7px 10px;border:2px solid #e8eaf0;border-radius:8px;font-size:11px;font-family:monospace;min-width:0;">
            <button onclick="navigator.clipboard.writeText('${data.paymentUrl}').then(()=>showToast('Copied!'))" style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:7px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">📋</button>
            ${waNum ? `<a href="https://wa.me/${waNum}?text=${waMsg}" target="_blank" style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:7px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;text-decoration:none;">💬 WA</a>` : ''}
          </div>
        </div>`;
    }

    /* Update button to "Done — Close" */
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✅ Done — Close';
      btn.style.background = '#0e9f6e';
      btn.onclick = function() {
        document.getElementById('fincraPayLinkOverlay').remove();
        /* Move student to Pipeline */
        _slMoveToConvertedPipeline(bookingId, studentName, email, waNum, currency, finalAmount, gbpAmount, '');
        updateStats();
        renderPipeline();
        showPSTab ? showPSTab('pipeline') : showSalesTab('pipeline');
        showToast('✅ Student moved to Pipeline!');
      };
    }
    showToast('✅ Payment link generated!');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💳 Generate & Send Link'; }
  }
}

/* Move student into pipeline after payment link is generated */
function _slMoveToConvertedPipeline(bookingId, studentName, email, whatsapp, currency, finalAmount, gbpAmount, course) {
  const pipeline = getMyPipeline();
  const existing = pipeline.findIndex(p => p.bookingId === bookingId);
  const record = {
    bookingId,
    studentName,
    subject:         SALES_DATA?.bookings?.find(b => b.id === bookingId)?.subject || '—',
    email,
    whatsapp,
    status:          'payment_sent',
    course:          course || '',
    paymentAmount:   gbpAmount,
    paymentCurrency: currency,
    paymentFinalAmt: finalAmount,
    notes:           'Payment link sent · awaiting payment',
    updatedAt:       new Date().toISOString(),
  };
  if (existing === -1) pipeline.unshift(record);
  else pipeline[existing] = { ...pipeline[existing], ...record };
  saveMyPipeline(pipeline);
}

/* ══════════════════════════════════════════════════════
   PHASE 6 — BIRTHDAY CHECK + DOB SAVE
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

// Override openSalesProfileModal to pre-fill DOB
const _origOpenSalesProfileModal = window.openSalesProfileModal;
window.openSalesProfileModal = function() {
  _origOpenSalesProfileModal();
  const dobEl = document.getElementById('spFieldDob');
  if (dobEl) {
    const saved = localStorage.getItem('sn_dob_' + SALES.id);
    if (saved) dobEl.value = saved;
  }
};

// Override saveSalesProfile to save DOB
const _origSaveSalesProfile = window.saveSalesProfile;
window.saveSalesProfile = function() {
  _origSaveSalesProfile();
  const dobEl = document.getElementById('spFieldDob');
  if (dobEl && dobEl.value) {
    localStorage.setItem('sn_dob_' + SALES.id, dobEl.value);
  }
  checkBirthdayForUser(SALES.id, SALES.name.split(' ')[0]);
};

// Run birthday check on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => checkBirthdayForUser(SALES.id, SALES.name.split(' ')[0]), 1500);
});

/* ══════════════════════════════════════════════════════
   PRIORITY 11 — DEMO LEADS (from completed demos)
   Status: new | paid | promising | low_interest | lost
══════════════════════════════════════════════════════ */
function getLeads() {
  let all = window.SALES_DATA.leads || [];
  // Build leads from completed demo bookings assigned to this sales person
  const completedDemos = (window.SALES_DATA.bookings || []).filter(b =>
    (b.status === 'completed' || b.status === 'incomplete') && b.isDemoClass
  );
  if (completedDemos.length > 0) {
    // Merge with any existing lead status records
    const leadMap = {};
    all.forEach(l => { leadMap[l.bookingId || l.id] = l; });
    completedDemos.forEach(b => {
      if (!leadMap[b.id]) {
        leadMap[b.id] = {
          id:              b.id,
          bookingId:       b.id,
          studentName:     b.studentName,
          subject:         b.subject,
          date:            b.date,
          time:            b.time,
          email:           b.email,
          whatsapp:        b.whatsapp,
          grade:           b.grade,
          age:             b.age,
          status:          'new',
          interest:        3,
          leadOwner:       SALES.name,
          leadOwnerId:     SALES.id,
          createdAt:       b.completedAt || b.bookedAt,
          /* Teacher report fields */
          teacherQuality:  b.teacherQuality  || '',
          teacherInterest: b.teacherInterest || '',
          teacherPower:    b.teacherPower    || '',
          teacherNotes:    b.teacherNotes    || '',
        };
      } else {
        /* Update teacher report fields on existing lead record */
        if (b.teacherQuality)  leadMap[b.id].teacherQuality  = b.teacherQuality;
        if (b.teacherInterest) leadMap[b.id].teacherInterest = b.teacherInterest;
        if (b.teacherPower)    leadMap[b.id].teacherPower    = b.teacherPower;
        if (b.teacherNotes)    leadMap[b.id].teacherNotes    = b.teacherNotes;
      }
    });
    all = Object.values(leadMap);
    window.SALES_DATA.leads = all;
  }
  return all.filter(l => !l.assignedSalesId ||
    l.assignedSalesId === SALES.id || l.assignedSalesId === SALES.dbId ||
    l.leadOwnerId === SALES.id || l.leadOwnerId === SALES.dbId);
}

function saveLeads(list) {
  window.SALES_DATA.leads = list;
  // No localStorage — data lives in memory and DB
}

/* Push a lead status update to the backend pipeline table */
async function _pushLeadStatus(lead) {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token || !lead.bookingId) return;
    await fetch('https://api.stemnestacademy.co.uk/api/sync/pipeline', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId:       lead.bookingId,
        studentName:     lead.studentName,
        subject:         lead.subject,
        status:          lead.status,
        interest:        lead.interest,
        purchasingPower: lead.purchasingPower,
        paymentAmount:   lead.paymentAmount,
        notes:           lead.notes,
      })
    });
  } catch(e) { console.warn('[Sales] Lead push failed:', e.message); }
}

function renderLeads() {
  const el = document.getElementById('leadsListContainer');
  if (!el) return;

  const filter = document.getElementById('leadsFilter')?.value || 'all';
  let leads = getLeads();
  if (filter !== 'all') leads = leads.filter(l => l.status === filter);
  leads = leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const statusConfig = {
    new:          { label: '🆕 New Lead',        bg: 'var(--blue-light)',   color: 'var(--blue)'       },
    paid:         { label: '💰 Paid',             bg: 'var(--green-light)',  color: 'var(--green-dark)' },
    promising:    { label: '🔥 Parent Promising', bg: '#fff3e0',             color: '#e65100'           },
    low_interest: { label: '😐 Low Interest',     bg: '#f3f4f6',             color: '#6b7280'           },
    lost:         { label: '❌ Lost',              bg: '#fde8e8',             color: '#c53030'           },
  };

  const filterHtml = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <select id="leadsFilter" onchange="renderLeads()" style="padding:9px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;color:var(--dark);outline:none;background:var(--white);">
        <option value="all">All Leads</option>
        <option value="new">🆕 New</option>
        <option value="promising">🔥 Promising</option>
        <option value="low_interest">😐 Low Interest</option>
        <option value="paid">💰 Paid</option>
        <option value="lost">❌ Lost</option>
      </select>
      <span style="font-size:13px;font-weight:800;color:var(--light);">${leads.length} lead${leads.length !== 1 ? 's' : ''}</span>
    </div>`;

  if (!leads.length) {
    el.innerHTML = filterHtml + '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No leads yet. Completed demos will appear here.</div>';
    return;
  }

  const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:13px 16px;vertical-align:middle;';

  el.innerHTML = filterHtml + `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thS}">Student</th>
            <th style="${thS}">Subject</th>
            <th style="${thS}">Demo Date</th>
            <th style="${thS}">Lead Owner</th>
            <th style="${thS}">Teacher Report</th>
            <th style="${thS}">Interest</th>
            <th style="${thS}">Status</th>
            <th style="${thS};text-align:center;">Update</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map((l, i) => {
            const sc = statusConfig[l.status] || statusConfig['new'];
            const stars = '★'.repeat(l.interest || 0) + '☆'.repeat(5 - (l.interest || 0));

            /* Teacher report badge colours */
            const qualityColor  = { excellent:'#065f46', good:'#1e40af', average:'#92400e', poor:'#991b1b' };
            const interestColor = { very_high:'#b45309', high:'#065f46', medium:'#1e40af', low:'#6b7280', none:'#991b1b' };
            const qualityLabel  = { excellent:'⭐⭐⭐⭐⭐ Excellent', good:'⭐⭐⭐⭐ Good', average:'⭐⭐⭐ Average', poor:'⭐⭐ Poor' };
            const interestLabel = { very_high:'🔥 Very High', high:'✅ High', medium:'🤔 Medium', low:'😐 Low', none:'❌ None' };
            const powerLabel    = { high:'💰 High', medium:'💵 Medium', low:'💸 Low' };

            const hasReport = l.teacherQuality || l.teacherInterest || l.teacherPower;
            const reportCell = hasReport
              ? `<div style="display:flex;flex-direction:column;gap:4px;">
                  ${l.teacherQuality  ? `<span style="font-size:11px;font-weight:800;color:${qualityColor[l.teacherQuality]||'#374151'};">${qualityLabel[l.teacherQuality]||l.teacherQuality}</span>` : ''}
                  ${l.teacherInterest ? `<span style="font-size:11px;font-weight:800;color:${interestColor[l.teacherInterest]||'#374151'};">${interestLabel[l.teacherInterest]||l.teacherInterest}</span>` : ''}
                  ${l.teacherPower    ? `<span style="font-size:11px;color:#6b7280;font-weight:700;">${powerLabel[l.teacherPower]||l.teacherPower}</span>` : ''}
                  ${l.teacherNotes    ? `<div style="font-size:11px;color:var(--mid);margin-top:3px;font-style:italic;max-width:160px;white-space:normal;">"${l.teacherNotes}"</div>` : ''}
                </div>`
              : '<span style="font-size:11px;color:var(--light);font-weight:700;">No report yet</span>';

            return `<tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${l.studentName}</div>
                <div style="font-size:11px;color:var(--light);">📧 ${l.email} · 📱 ${l.whatsapp||'—'}</div>
                <div style="font-size:11px;color:var(--light);">🎓 ${l.grade||'—'} · Age ${l.age||'—'}</div>
              </td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${l.subject||'—'}</td>
              <td style="${tdS};font-size:12px;color:var(--mid);">${l.date||'—'}<br>${l.time||'—'}</td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${l.leadOwner||'—'}</td>
              <td style="${tdS}">${reportCell}</td>
              <td style="${tdS}">
                <div style="color:#f59e0b;font-size:14px;">${stars}</div>
                <div style="font-size:11px;color:var(--light);font-weight:700;">${l.purchasingPower||'—'}</div>
              </td>
              <td style="${tdS}">
                <span style="background:${sc.bg};color:${sc.color};font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">${sc.label}</span>
              </td>
              <td style="${tdS};text-align:center;">
                <select onchange="updateLeadStatus('${l.id}', this.value)"
                  style="padding:7px 10px;border:2px solid #e8eaf0;border-radius:10px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;color:var(--dark);outline:none;background:var(--white);cursor:pointer;">
                  <option value="">Change status…</option>
                  <option value="new">🆕 New Lead</option>
                  <option value="promising">🔥 Parent Promising</option>
                  <option value="low_interest">😐 Low Interest</option>
                  <option value="paid">💰 Paid</option>
                  <option value="lost">❌ Lost</option>
                </select>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function updateLeadStatus(leadId, newStatus) {
  if (!newStatus) return;
  const all = window.SALES_DATA.leads || [];
  const idx = all.findIndex(l => l.id === leadId);
  if (idx !== -1) {
    all[idx].status    = newStatus;
    all[idx].updatedAt = new Date().toISOString();

    // If marked paid → create a pipeline entry (converted) so presales enrolments tab picks it up
    if (newStatus === 'paid') {
      const lead = all[idx];
      const pipeline = getMyPipeline();
      const existing = pipeline.findIndex(p => p.bookingId === lead.bookingId);
      const record = {
        bookingId:       lead.bookingId,
        studentName:     lead.studentName,
        subject:         lead.subject,
        date:            lead.date,
        email:           lead.email,
        whatsapp:        lead.whatsapp,
        grade:           lead.grade,
        age:             lead.age,
        status:          'converted',
        salesStatus:     'converted',
        interest:        lead.interest || 3,
        purchasingPower: lead.purchasingPower || 'medium',
        notes:           lead.notes || '',
        salesPersonName: SALES.name,
        salesPersonId:   SALES.id,
        updatedAt:       new Date().toISOString(),
      };
      if (existing === -1) pipeline.unshift(record);
      else pipeline[existing] = record;
      saveMyPipeline(pipeline);

      /* Also update booking status in DB to 'converted' so postsales can see it */
      const token = localStorage.getItem('sn_access_token');
      if (token && lead.bookingId) {
        fetch('https://api.stemnestacademy.co.uk/api/bookings/' + lead.bookingId + '/status', {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' })
        }).catch(() => {});
      }
    }

    saveLeads(all);
    _pushLeadStatus(all[idx]);
    updateStats();
    renderLeads();
    showToast(newStatus === 'paid' ? '✅ Marked as paid! Student will appear in Presales Enrolments.' : '✅ Lead status updated!');
  }
}

/* ══════════════════════════════════════════════════════
   PITCH RECORDS — Sales person's demo attendance log
   Same concept as teacher's Class Records tab.
   Records each demo the sales person attended with
   pitch recording link.
══════════════════════════════════════════════════════ */

var _currentPitchFilter = 'today';

function filterPitchRecords(period) {
  _currentPitchFilter = period;
  ['today','week','month','all'].forEach(function(p) {
    var btn = document.getElementById('pitchFilter-' + p);
    if (btn) btn.classList.toggle('rec-filter-active', p === period);
  });
  renderPitchRecords();
}

function renderPitchRecords() {
  var el = document.getElementById('pitchRecordsTable');
  if (!el) return;

  // Get all bookings assigned to this sales person
  var myDemos = getMyBookings().filter(function(b) {
    return b.status === 'completed' || b.status === 'incomplete' || b.status === 'scheduled';
  });

  // Also get pitch log (manually saved records)
  var pitchLog = window.SALES_DATA.pitchLog || [];
  if (!pitchLog.length) {
      try { pitchLog = JSON.parse(localStorage.getItem('sn_pitch_log_' + SALES.id) || '[]'); } catch(e) {}
      window.SALES_DATA.pitchLog = pitchLog;
  }

  // Merge: use booking data + any pitch log entries
  var now = new Date();
  var records = myDemos.map(function(b) {
    var logEntry = pitchLog.find(function(p) { return p.bookingId === b.id; }) || {};
    return {
      bookingId:      b.id,
      studentName:    b.studentName || '—',
      subject:        b.subject || '—',
      date:           b.date || '—',
      time:           b.time || '—',
      status:         b.status,
      outcome:        logEntry.outcome || (b.status === 'completed' ? 'completed' : b.status),
      pitchNotes:     logEntry.pitchNotes || '',
      recordingLink:  logEntry.recordingLink || '',
      loggedAt:       logEntry.loggedAt || b.scheduledAt || '',
    };
  });

  // Apply date filter
  var filtered = records.filter(function(r) {
    var d = r.loggedAt ? new Date(r.loggedAt) : null;
    if (!d) return _currentPitchFilter === 'all';
    if (_currentPitchFilter === 'today')  return d.toDateString() === now.toDateString();
    if (_currentPitchFilter === 'week')   { var w = new Date(now); w.setDate(now.getDate()-7); return d >= w; }
    if (_currentPitchFilter === 'month')  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  });

  if (!filtered.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;background:var(--white);border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,.06);">' +
      '<div style="font-size:48px;margin-bottom:12px;">📋</div>' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:20px;color:var(--dark);margin-bottom:8px;">No pitch records found</div>' +
      '<div style="font-size:14px;color:var(--light);font-weight:700;">Demo classes assigned to you will appear here once scheduled.</div>' +
      '</div>';
    return;
  }

  var thS = 'padding:11px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  var tdS = 'padding:12px 14px;font-size:13px;vertical-align:middle;';

  var rows = filtered.map(function(r, i) {
    var bg = i % 2 === 0 ? '' : 'background:#fafbff;';
    var outcomeColor = r.outcome === 'completed' ? '#065f46' : r.outcome === 'incomplete' ? '#c53030' : '#e65100';
    var outcomeBg    = r.outcome === 'completed' ? '#d1fae5' : r.outcome === 'incomplete' ? '#fde8e8' : '#fff3e0';
    var outcomeLabel = r.outcome === 'completed' ? '✅ Completed' : r.outcome === 'incomplete' ? '❌ Incomplete' : '⏳ Scheduled';

    var recCell;
    if (r.recordingLink) {
      recCell = '<a href="' + r.recordingLink + '" target="_blank" style="color:#1a56db;font-weight:800;font-size:12px;text-decoration:none;">▶ View Recording</a>' +
        '<br><span style="background:#d1fae5;color:#065f46;font-size:11px;font-weight:900;padding:2px 8px;border-radius:50px;">✅ Uploaded</span>';
    } else {
      recCell = '<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:2px 8px;border-radius:50px;">⏳ Pending</span>' +
        '<br><button onclick="openPitchRecordingInput(\'' + r.bookingId + '\')" ' +
        'style="margin-top:4px;background:#dbeafe;color:#1e40af;border:none;border-radius:8px;padding:4px 10px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">+ Add Link</button>';
    }

    return '<tr style="border-bottom:1px solid #f0f2f8;' + bg + '">' +
      '<td style="' + tdS + '"><div style="font-weight:800;color:#1a202c;">' + r.studentName + '</div><div style="font-size:11px;color:#a0aec0;">' + r.date + '</div></td>' +
      '<td style="' + tdS + ';font-weight:700;color:#4a5568;">' + r.subject + '</td>' +
      '<td style="' + tdS + ';font-size:12px;color:#4a5568;font-weight:700;">' + r.time + '</td>' +
      '<td style="' + tdS + '"><span style="background:' + outcomeBg + ';color:' + outcomeColor + ';font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">' + outcomeLabel + '</span></td>' +
      '<td style="' + tdS + '">' + recCell + '</td>' +
    '</tr>';
  }).join('');

  el.innerHTML =
    '<div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:#fff;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    '<thead><tr style="background:#f7f9ff;border-bottom:2px solid #e8eaf0;">' +
      '<th style="' + thS + '">Student</th>' +
      '<th style="' + thS + '">Subject</th>' +
      '<th style="' + thS + '">Time</th>' +
      '<th style="' + thS + '">Outcome</th>' +
      '<th style="' + thS + '">Pitch Recording</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>' +
    '<div style="margin-top:10px;font-size:12px;font-weight:700;color:#a0aec0;text-align:right;">' + filtered.length + ' record' + (filtered.length !== 1 ? 's' : '') + '</div>';
}

function openPitchRecordingInput(bookingId) {
  var existing = document.getElementById('pitchLinkInput_' + bookingId);
  if (existing) { existing.remove(); return; }
  var btn = event.target;
  var container = document.createElement('div');
  container.id = 'pitchLinkInput_' + bookingId;
  container.style.cssText = 'margin-top:6px;display:flex;gap:6px;';
  container.innerHTML =
    '<input type="url" placeholder="Paste recording link..." ' +
    'style="flex:1;padding:6px 10px;border:2px solid #e8eaf0;border-radius:8px;font-family:\'Nunito\',sans-serif;font-size:12px;outline:none;" ' +
    'id="pitchLinkVal_' + bookingId + '">' +
    '<button onclick="savePitchRecording(\'' + bookingId + '\')" ' +
    'style="background:#0e9f6e;color:#fff;border:none;border-radius:8px;padding:6px 10px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">Save</button>';
  btn.parentNode.appendChild(container);
}

function savePitchRecording(bookingId) {
  var input = document.getElementById('pitchLinkVal_' + bookingId);
  var link  = input ? input.value.trim() : '';
  if (!link) { showToast('Please paste a recording link.', 'error'); return; }

  var log = window.SALES_DATA.pitchLog || [];

  var idx = log.findIndex(function(p) { return p.bookingId === bookingId; });
  var entry = idx !== -1 ? log[idx] : { bookingId: bookingId, loggedAt: new Date().toISOString() };
  entry.recordingLink = link;
  entry.updatedAt     = new Date().toISOString();

  if (idx !== -1) log[idx] = entry; else log.unshift(entry);
  window.SALES_DATA.pitchLog = log;
  localStorage.setItem('sn_pitch_log_' + SALES.id, JSON.stringify(log));

  showToast('✅ Pitch recording saved!');
  renderPitchRecords();
}
