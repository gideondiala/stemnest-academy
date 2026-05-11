/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — SALES DASHBOARD JS
   Academic Counselor portal: upcoming demos, pipeline,
   pitch logging, conversion tracking.
═══════════════════════════════════════════════════════ */

/* ── Load logged-in sales person ── */
function getLoggedInSales() {
  try {
    const id  = localStorage.getItem('sn_logged_in_sales');
    const reg = JSON.parse(localStorage.getItem('sn_sales_persons') || '[]');
    return (id ? reg.find(s => s.id === id) : null) || {
      id:'SP001', name:'Alex Johnson', initials:'AJ',
      email:'alex.johnson@stemnestacademy.co.uk', phone:'', photo:null,
    };
  } catch { return { id:'SP001', name:'Alex Johnson', initials:'AJ', photo:null }; }
}

let SALES = getLoggedInSales();
const SALES_TABS = ['overview','leads','upcoming','pipeline','pitchlog','converted'];
let activePitchBookingId = null;
let selectedInterest = 3;

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  SALES = getLoggedInSales();
  setGreeting();
  renderSidebarProfile();
  buildInterestGrid();
  showSalesTab('overview');
  bindModalCloses();
});

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
  const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  return all.filter(b => b.assignedSalesId === SALES.id);
}

function getMyPipeline() {
  return JSON.parse(localStorage.getItem('sn_pipeline_' + SALES.id) || '[]');
}
function saveMyPipeline(list) {
  localStorage.setItem('sn_pipeline_' + SALES.id, JSON.stringify(list));
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
}

/* ── STATS ── */
function updateStats() {
  const bookings  = getMyBookings();
  const pipeline  = getMyPipeline();
  const upcoming  = bookings.filter(b => b.status === 'scheduled');
  const converted = pipeline.filter(p => p.status === 'converted');
  const revenue   = converted.reduce((s, p) => s + (parseFloat(p.paymentAmount) || 0), 0);
  const leads     = JSON.parse(localStorage.getItem('sn_sales_leads') || '[]')
    .filter(l => l.leadOwnerId === SALES.id || l.assignedSalesId === SALES.id);

  setText('sStat1', upcoming.length);
  setText('sStat2', pipeline.filter(p => p.status !== 'converted' && p.status !== 'lost').length);
  setText('sStat3', converted.length);
  setText('sStat4', '£' + revenue.toLocaleString());
  setText('upcomingBadge', upcoming.length);
  setText('leadsBadge', leads.filter(l => l.status === 'new').length);
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
  const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  const b   = all.find(x => x.id === bookingId);
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

  // Populate course dropdown from admin courses
  _populatePitchCourseDropdown(b.subject, existing ? existing.course : '');

  updateInterestGrid();
  document.getElementById('pitchModalOverlay').classList.add('open');
}

function _populatePitchCourseDropdown(subjectHint, selectedCourse) {
  const sel = document.getElementById('pitchCourse');
  if (!sel) return;
  try {
    const courses = JSON.parse(localStorage.getItem('sn_courses') || '[]');
    let filtered = courses;
    if (subjectHint) {
      const sub = subjectHint.toLowerCase();
      const f = courses.filter(c => c.subject && c.subject.toLowerCase().includes(sub));
      if (f.length) filtered = f;
    }
    sel.innerHTML = '<option value="">— Select a course —</option>' +
      filtered.map(c => `<option value="${c.name}" ${selectedCourse === c.name ? 'selected' : ''}>${c.name}${c.price ? ' — £' + c.price + '/mo' : ''}</option>`).join('') +
      (filtered.length < courses.length ? '<optgroup label="── All Courses ──">' +
        courses.filter(c => !filtered.includes(c)).map(c => `<option value="${c.name}" ${selectedCourse === c.name ? 'selected' : ''}>${c.name}${c.price ? ' — £' + c.price + '/mo' : ''}</option>`).join('') +
        '</optgroup>' : '');
  } catch(e) { /* silent */ }
}

function openPitchModalById(bookingId) { openPitchModal(bookingId); }

function closePitchModal() {
  document.getElementById('pitchModalOverlay').classList.remove('open');
  activePitchBookingId = null;
}

function savePitch() {
  if (!activePitchBookingId) return;
  const all = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  const b   = all.find(x => x.id === activePitchBookingId);
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

  // If converted, update booking status and notify admin
  if (record.status === 'converted') {
    const bookings = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    const bi = bookings.findIndex(x => x.id === activePitchBookingId);
    if (bi !== -1) {
      bookings[bi].salesStatus = 'converted';
      bookings[bi].paymentAmount = record.paymentAmount;
      bookings[bi].salesPersonId = SALES.id;
      bookings[bi].salesPersonName = SALES.name;
      localStorage.setItem('sn_bookings', JSON.stringify(bookings));
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
  const reg = JSON.parse(localStorage.getItem('sn_sales_persons') || '[]');
  const idx = reg.findIndex(s => s.id === SALES.id);
  if (idx !== -1) { reg[idx] = { ...reg[idx], ...SALES }; localStorage.setItem('sn_sales_persons', JSON.stringify(reg)); }
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
  const all = JSON.parse(localStorage.getItem('sn_sales_leads') || '[]');
  // Show leads assigned to this sales person OR where leadOwnerId matches
  return all.filter(l => !l.assignedSalesId || l.assignedSalesId === SALES.id || l.leadOwnerId === SALES.id);
}

function saveLeads(list) {
  localStorage.setItem('sn_sales_leads', JSON.stringify(list));
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
            <th style="${thS}">Interest</th>
            <th style="${thS}">Status</th>
            <th style="${thS};text-align:center;">Update</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map((l, i) => {
            const sc = statusConfig[l.status] || statusConfig['new'];
            const stars = '★'.repeat(l.interest || 0) + '☆'.repeat(5 - (l.interest || 0));
            return `<tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${l.studentName}</div>
                <div style="font-size:11px;color:var(--light);">📧 ${l.email} · 📱 ${l.whatsapp||'—'}</div>
                <div style="font-size:11px;color:var(--light);">🎓 ${l.grade||'—'} · Age ${l.age||'—'}</div>
              </td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${l.subject||'—'}</td>
              <td style="${tdS};font-size:12px;color:var(--mid);">${l.date||'—'}<br>${l.time||'—'}</td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${l.leadOwner||'—'}</td>
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
  const all = JSON.parse(localStorage.getItem('sn_sales_leads') || '[]');
  const idx = all.findIndex(l => l.id === leadId);
  if (idx !== -1) {
    all[idx].status    = newStatus;
    all[idx].updatedAt = new Date().toISOString();

    // If marked paid → also create a pipeline entry for post-sales
    if (newStatus === 'paid') {
      const lead = all[idx];
      const pipeline = getMyPipeline();
      const existing = pipeline.findIndex(p => p.bookingId === lead.bookingId);
      if (existing === -1) {
        pipeline.unshift({
          bookingId:       lead.bookingId,
          studentName:     lead.studentName,
          subject:         lead.subject,
          date:            lead.date,
          email:           lead.email,
          whatsapp:        lead.whatsapp,
          grade:           lead.grade,
          age:             lead.age,
          status:          'converted',
          interest:        lead.interest || 3,
          purchasingPower: lead.purchasingPower || 'medium',
          notes:           lead.notes || '',
          updatedAt:       new Date().toISOString(),
        });
        saveMyPipeline(pipeline);
      }
    }

    localStorage.setItem('sn_sales_leads', JSON.stringify(all));
    updateStats();
    renderLeads();
    showToast('✅ Lead status updated!');
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
  var all      = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
  var myDemos  = all.filter(function(b) {
    return b.assignedSalesId === SALES.id &&
      (b.status === 'completed' || b.status === 'incomplete' || b.status === 'scheduled');
  });

  // Also get pitch log (manually saved records)
  var pitchKey = 'sn_pitch_log_' + SALES.id;
  var pitchLog = [];
  try { pitchLog = JSON.parse(localStorage.getItem(pitchKey) || '[]'); } catch(e) {}

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

  var pitchKey = 'sn_pitch_log_' + SALES.id;
  var log = [];
  try { log = JSON.parse(localStorage.getItem(pitchKey) || '[]'); } catch(e) {}

  var idx = log.findIndex(function(p) { return p.bookingId === bookingId; });
  var entry = idx !== -1 ? log[idx] : { bookingId: bookingId, loggedAt: new Date().toISOString() };
  entry.recordingLink = link;
  entry.updatedAt     = new Date().toISOString();

  if (idx !== -1) log[idx] = entry; else log.unshift(entry);
  localStorage.setItem(pitchKey, JSON.stringify(log));

  showToast('✅ Pitch recording saved!');
  renderPitchRecords();
}
