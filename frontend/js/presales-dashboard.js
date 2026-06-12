/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — PRE-SALES DASHBOARD JS
   Receives free-trial bookings, schedules demo classes,
   assigns teachers, writes directly to teacher calendar.
═══════════════════════════════════════════════════════ */

const PS_TABS = ['incoming', 'scheduled', 'completed', 'incomplete', 'cancelled', 'reschedule', 'notes', 'enrolments', 'incoming-referrals'];
let psScheduleBookingId = null; // booking being scheduled in modal

/* ── STATE MANAGEMENT ── */
window.PS_DATA = {
  bookings: [],
  teachers: [],
  sales: [],
  reports: [],
  enrolments: []
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  const h = new Date().getHours();
  const grEl = document.getElementById('psGreeting');
  if (grEl) grEl.textContent = h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';
  const dateEl = document.getElementById('psDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  /* Load from API first, then render */
  _loadPresalesFromAPI().then(() => {
    showPSTab('incoming');
  });
  bindScheduleModal();

  /* Auto-refresh every 60 seconds — no cache clearing needed */
  setInterval(() => {
    _loadPresalesFromAPI().then(() => {
      updatePSStats();
      const activeTab = PS_TABS.find(t => {
        const el = document.getElementById('tab-' + t);
        return el && el.style.display !== 'none';
      });
      if (activeTab === 'incoming')   renderIncoming();
      if (activeTab === 'scheduled')  renderScheduled();
      if (activeTab === 'completed')  renderCompletedDemos();
      if (activeTab === 'incomplete') renderIncomplete();
    });
  }, 60000);
});

async function _loadPresalesFromAPI() {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) { console.warn('[Presales] No token'); return; }
    
    // Fetch bookings — use the sync/dashboard/presales endpoint which is purpose-built
    const bRes = await fetch('https://api.stemnestacademy.co.uk/api/sync/dashboard/presales', {
      headers: { 'Authorization': 'Bearer ' + token },
    });

    if (!bRes.ok) {
      console.error('[Presales] Bookings fetch failed:', bRes.status, await bRes.text());
      return;
    }

    const bData = await bRes.json();
    
    if (bData.bookings) {
      window.PS_DATA.bookings = bData.bookings.map(b => {
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
          parentName:      notes.parentName || '—',
          subject:         b.subject || '—',
          date:            b.date ? b.date.split('T')[0] : '—',
          time:            notes.time || b.time || '—',
          timeWAT:         notes.timeWAT || '',
          timezone:        notes.timezone || '—',
          device:          notes.device || '—',
          status:          b.status,
          assignedTutor:   b.tutor_name || '—',
          assignedTutorId: b.tutor_staff_id || b.tutor_id || '',
          assignedSalesId: b.sales_staff_id || b.sales_id || '',
          classLink:       b.class_link || '',
          bookedAt:        b.booked_at || b.created_at,
          scheduledAt:     b.scheduled_at,
          completedAt:     b.completed_at,
          isDemoClass:     b.is_demo,
          psNote:          notes.psNote || '',
          psConfirmed:     !!notes.psNote,
          cancelReason:    notes.cancelReason || '',
          rescheduleNote:  notes.rescheduleNote || null,
          incompleteReason: notes.incompleteReason || '',
        };
      });
    }

    // Fetch teachers — store BOTH staff_id and UUID
    const tRes = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (tRes.ok) {
      const tData = await tRes.json();
      if (tData.users) {
        window.PS_DATA.teachers = tData.users.map(u => ({
          id:      u.id,
          staffId: u.staff_id,
          name:    u.name,
          subject: u.subject || 'Coding'
        }));
      }
    }

    // Fetch sales — store BOTH staff_id and UUID
    const sRes = await fetch('https://api.stemnestacademy.co.uk/api/users?role=sales', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (sRes.ok) {
      const sData = await sRes.json();
      if (sData.users) {
        window.PS_DATA.sales = sData.users.map(u => ({
          id:      u.id,
          staffId: u.staff_id,
          name:    u.name
        }));
      }
    }

    // Fetch pipeline records with status='converted' — these are students marked paid by sales
    // They should appear in the presales Enrolments tab with an Enroll button
    try {
      const pRes = await fetch('https://api.stemnestacademy.co.uk/api/sync/dashboard/presales', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      // Already fetched above — enrolments come from pipeline converted records
      // We'll derive them from bookings with salesStatus = converted
    } catch {}

    // Enrolments = bookings that have been marked converted by sales (pipeline)
    // Fetch pipeline data
    try {
      const plRes = await fetch('https://api.stemnestacademy.co.uk/api/sync/dashboard/sales', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (plRes.ok) {
        const plData = await plRes.json();
        // Store converted pipeline records as enrolments for presales
        const converted = (plData.pipeline || []).filter(p => p.status === 'converted');
        window.PS_DATA.enrolments = converted.map(p => ({
          id:              p.booking_id || p.bookingId,
          bookingId:       p.booking_id || p.bookingId,
          studentName:     p.student_name || p.studentName || '—',
          email:           p.student_email || p.email || '—',
          subject:         p.subject || '—',
          grade:           p.grade || '—',
          age:             p.age || '—',
          whatsapp:        p.whatsapp || '—',
          salesPersonName: p.sales_name || p.salesPersonName || '—',
          paymentAmount:   p.payment_amount || p.paymentAmount || 0,
          course:          p.course_pitched || p.course || '—',
          status:          'pending_enrol',
          createdAt:       p.updated_at || new Date().toISOString(),
        }));
        setText('enrolmentsBadge', window.PS_DATA.enrolments.length);
      }
    } catch(e) {
      console.warn('[Presales] Pipeline fetch failed:', e.message);
    }

  } catch (e) {
    console.error('[Presales] API load failed:', e.message);
  }
}
/* ── HELPERS ── */
function getBookings()  { return window.PS_DATA.bookings || []; }
function getTeachers()  { return window.PS_DATA.teachers || []; }
function getSales()     { return window.PS_DATA.sales || []; }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function getTeacherAvailability(id) {
  // Mock availability for UI until backend scheduling is built
  return { "2026-05-20|10:00": false, "2026-05-20|11:00": false };
}

/* Write a slot directly onto a teacher's calendar */
function writeTeacherCalendarSlot(teacherId, dateKey, timeKey, bookingId) {
  // In a real-time system, this is handled entirely by the backend `assign` endpoint
  // We no longer rely on localStorage slots
}

/* Convert "HH:MM" 24h to display label */
function to12h(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${period}`;
}

/* ── TAB SWITCHING ── */
function showPSTab(tab) {
  PS_TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
  updatePSStats();
  if (tab === 'incoming')   renderIncoming();
  if (tab === 'scheduled')  renderScheduled();
  if (tab === 'completed')  renderCompletedDemos();
  if (tab === 'incomplete') renderIncomplete();
  if (tab === 'cancelled')  renderCancelled();
  if (tab === 'reschedule') renderReschedule();
  if (tab === 'notes')              renderParentNotes();
  if (tab === 'enrolments')         renderEnrolments();
  if (tab === 'incoming-referrals') renderIncomingReferrals();
}

/* ── STATS ── */
function updatePSStats() {
  const bookings = getBookings();
  const incomplete  = bookings.filter(b => b.status === 'incomplete');
  const cancelled   = bookings.filter(b => b.status === 'cancelled');
  const reschedules = bookings.filter(b => b.rescheduleNote && !b.rescheduleNote.actioned);
  const completed   = bookings.filter(b => b.status === 'completed' && b.isDemoClass);
  setText('psStat1', bookings.filter(b => b.status === 'pending').length);
  setText('psStat2', bookings.filter(b => b.status === 'scheduled').length);
  setText('psStat3', bookings.filter(b => b.psConfirmed).length);
  setText('psStat4', getTeachers().length);
  setText('incomingBadge',   bookings.filter(b => b.status === 'pending').length);
  setText('completedBadge',  completed.length);
  setText('incompleteBadge', incomplete.length);
  setText('cancelledBadge',  cancelled.length);
  setText('rescheduleBadge', reschedules.length);
  
  // Enrolments (mock for now, should come from API)
  setText('enrolmentsBadge', 0);
}

/* ══════════════════════════════════════════════════════
   INCOMING BOOKINGS TABLE
══════════════════════════════════════════════════════ */
function renderIncoming() {
  const el = document.getElementById('incomingList');
  if (!el) return;
  const bookings = getBookings()
    .filter(b => b.status === 'pending')
    .sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt));

  if (!bookings.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:48px;margin-bottom:12px;">🎉</div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">All caught up!</div>
      <div style="font-size:14px;color:var(--light);margin-top:6px;">No pending demo bookings right now.</div>
    </div>`;
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Student</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Subject</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Grade / Age</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Contact</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Preferred Time</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Booked</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map((b, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i % 2 === 0 ? '' : 'background:#fafbff;'}">
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--dark);">${b.studentName}</div>
                <div style="font-size:11px;color:var(--light);font-weight:700;margin-top:2px;">${b.id}</div>
              </td>
              <td style="padding:14px 16px;">
                <span style="background:${b.subject==='Coding'?'var(--blue-light)':b.subject==='Maths'?'var(--green-light)':'#fff3e0'};color:${b.subject==='Coding'?'var(--blue)':b.subject==='Maths'?'var(--green-dark)':'#e65100'};font-size:12px;font-weight:900;padding:3px 10px;border-radius:50px;">
                  ${b.subject==='Coding'?'💻':b.subject==='Maths'?'📐':'🔬'} ${b.subject}
                </span>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.grade || '—'} · Age ${b.age || '—'}</td>
              <td style="padding:14px 16px;">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${b.email}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);margin-top:2px;">
                  ${b.whatsapp && b.whatsapp !== '—'
                    ? `<a href="https://wa.me/${b.whatsapp.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="color:#25D366;font-weight:800;text-decoration:none;">📱 ${b.whatsapp}</a>`
                    : `📱 ${b.whatsapp || '—'}`}
                </div>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.date || '—'}<br>
                <span style="font-size:11px;color:var(--mid);">🕐 ${b.time || '—'} (local)</span>
                ${b.timeWAT ? `<br><span style="font-size:11px;color:var(--blue);font-weight:800;">🇳🇬 ${b.timeWAT}</span>` : ''}
              </td>
              <td style="padding:14px 16px;font-size:12px;color:var(--light);font-weight:700;">${b.bookedAt ? new Date(b.bookedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—'}</td>
              <td style="padding:14px 16px;text-align:center;">
                <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
                  <button onclick="openScheduleModal('${b.id}')"
                    style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;white-space:nowrap;transition:.15s;"
                    onmouseover="this.style.background='#1140b0'" onmouseout="this.style.background='var(--blue)'">
                    📅 Schedule Class
                  </button>
                  ${b.whatsapp && b.whatsapp !== '—' ? `
                  <button onclick="waDemoConfirmed(${JSON.stringify({id:b.id,studentName:b.studentName,subject:b.subject,date:b.date,time:b.time,email:b.email,whatsapp:b.whatsapp,parentName:b.parentName||''}).replace(/"/g,'&quot;')})"
                    style="background:#25D366;color:#fff;border:none;border-radius:10px;padding:6px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;">
                    💬 WhatsApp Parent
                  </button>` : ''}
                  <button onclick="deleteBooking('${b.id}')"
                    style="background:#fde8e8;color:#c53030;border:1.5px solid #fca5a5;border-radius:10px;padding:6px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap;">
                    🗑️ Delete
                  </button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   SCHEDULE DEMO MODAL
══════════════════════════════════════════════════════ */
function openScheduleModal(bookingId) {
  psScheduleBookingId = bookingId;
  const b = getBookings().find(x => x.id === bookingId);
  if (!b) return;

  // Populate student info
  document.getElementById('sm-student-info').innerHTML = `
    <strong>${b.studentName}</strong> · ${b.grade || '—'} · Age ${b.age || '—'}<br>
    📚 ${b.subject} &nbsp;·&nbsp; 📧 ${b.email} &nbsp;·&nbsp; 📱 ${b.whatsapp || '—'}`;

  // Set date min to today
  const dateEl = document.getElementById('sm-date');
  if (dateEl) {
    dateEl.min = new Date().toISOString().split('T')[0];
    dateEl.value = b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '';
  }

  // Set time if available
  const timeEl = document.getElementById('sm-time');
  if (timeEl && b.time) {
    // Convert "11:00 AM" → "11:00"
    const m = b.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m) {
      let h = parseInt(m[1]);
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
      timeEl.value = String(h).padStart(2,'0') + ':' + m[2];
    }
  }

  // Populate teacher dropdown filtered by subject
  populateTeacherDropdown(b.subject);

  // Populate sales person dropdown
  populateSalesDropdown();

  // Clear link/notes
  const linkEl = document.getElementById('sm-link');
  if (linkEl) linkEl.value = '';
  const notesEl = document.getElementById('sm-notes');
  if (notesEl) notesEl.value = '';

  document.getElementById('scheduleModalOverlay').classList.add('open');
}

function populateTeacherDropdown(subject) {
  const sel = document.getElementById('sm-teacher');
  if (!sel) return;
  let teachers = getTeachers();
  if (subject) teachers = teachers.filter(t => t.subject === subject);

  sel.innerHTML = '<option value="">— Select a teacher —</option>' +
    teachers.map(t =>
      `<option value="${t.id}">${t.name} (${t.staffId || t.id}) · ${t.subject}</option>`
    ).join('');
}

function populateSalesDropdown() {
  const sel = document.getElementById('sm-sales');
  if (!sel) return;
  const salesPersons = getSales();
  sel.innerHTML = '<option value="">— Select a sales person —</option>' +
    salesPersons.map(s =>
      `<option value="${s.id}">${s.name} (${s.staffId || s.id})</option>`
    ).join('');
}

async function confirmScheduleDemo() {
  const teacherId  = document.getElementById('sm-teacher')?.value;
  const salesId    = document.getElementById('sm-sales')?.value;
  const date       = document.getElementById('sm-date')?.value;
  const time       = document.getElementById('sm-time')?.value;
  const link       = document.getElementById('sm-link')?.value.trim();
  const notes      = document.getElementById('sm-notes')?.value.trim();

  if (!teacherId) { showToast('Please select a teacher.', 'error'); return; }
  if (!date)      { showToast('Please select a date.', 'error'); return; }
  if (!time)      { showToast('Please select a time.', 'error'); return; }
  if (!link)      { showToast('Please enter a class link.', 'error'); return; }

  const btn = document.querySelector('#scheduleModalOverlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Scheduling…'; }

  const teacher = getTeachers().find(t => t.id === teacherId);

  try {
    let token = localStorage.getItem('sn_access_token');
    if (!token) throw new Error('Not logged in');

    const bookingId = psScheduleBookingId;
    if (!bookingId) throw new Error('No booking selected');

    const assignPayload = {
      tutorId:   teacherId,
      classLink: link,
      date:      date,
      time:      time,
    };
    if (salesId) assignPayload.salesId = salesId;
    if (notes)   assignPayload.notes   = notes;

    /* ── Helper: do the assign call ── */
    const doAssign = async (tok) => fetch(
      'https://api.stemnestacademy.co.uk/api/bookings/' + bookingId + '/assign',
      { method: 'PUT', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(assignPayload) }
    );

    let res = await doAssign(token);

    /* ── If 401/403: try refreshing the token once, then retry ── */
    if (res.status === 401 || res.status === 403) {
      const refreshToken = localStorage.getItem('sn_refresh_token');
      if (refreshToken) {
        try {
          const rRes = await fetch('https://api.stemnestacademy.co.uk/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
          });
          const rData = await rRes.json();
          if (rData.success && rData.accessToken) {
            localStorage.setItem('sn_access_token', rData.accessToken);
            if (rData.refreshToken) localStorage.setItem('sn_refresh_token', rData.refreshToken);
            token = rData.accessToken;
            res = await doAssign(token); // retry with new token
          }
        } catch (refreshErr) { /* fall through to error below */ }
      }
    }

    /* ── If still 401/403 after refresh attempt: session expired ── */
    if (res.status === 401 || res.status === 403) {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirm & Schedule'; }
      closeScheduleModal();
      showToast('⚠️ Your session has expired. Please log in again.', 'error');
      setTimeout(() => { window.location.href = '/pages/login.html'; }, 2000);
      return;
    }

    const data = await res.json();

    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirm & Schedule'; }

    if (!data.success) {
      showToast('Failed to schedule: ' + (data.error || 'Unknown error'), 'error');
      return;
    }

    closeScheduleModal();

    /* Refresh UI from API so incoming moves to scheduled */
    await _loadPresalesFromAPI();
    updatePSStats();
    renderIncoming();
    renderScheduled();
    showToast('✅ Demo scheduled with ' + (teacher?.name || 'teacher') + ' on ' + date + ' at ' + to12h(time) + '!');

  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirm & Schedule'; }
    console.error('[Presales] Schedule failed:', e);
    showToast('Error: ' + e.message, 'error');
  }
}

function closeScheduleModal() {
  document.getElementById('scheduleModalOverlay')?.classList.remove('open');
  psScheduleBookingId = null;
}

function bindScheduleModal() {
  const overlay = document.getElementById('scheduleModalOverlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeScheduleModal(); });
}

/* ══════════════════════════════════════════════════════
   SCHEDULED TAB
══════════════════════════════════════════════════════ */
function renderScheduled() {
  const el = document.getElementById('scheduledList');
  if (!el) return;
  const bookings = getBookings()
    .filter(b => b.status === 'scheduled')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!bookings.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No scheduled demos yet.</div>';
    return;
  }

  /* Build a lookup map: sales UUID → name */
  const salesMap = {};
  getSales().forEach(s => { salesMap[s.id] = s.name; salesMap[s.staffId] = s.name; });

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Student</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Subject</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Grade / Age</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Contact</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Preferred Time</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Booked</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Teacher</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Learning Advisor</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map((b, i) => {
            const salesName = salesMap[b.assignedSalesId] || b.assignedSalesId || '—';
            return `
            <tr style="border-bottom:1px solid #f0f2f8;${i % 2 === 0 ? '' : 'background:#fafbff;'}">
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--dark);">${b.studentName}</div>
                <div style="font-size:11px;color:var(--light);font-weight:700;">${b.id}</div>
              </td>
              <td style="padding:14px 16px;">
                <span style="background:${b.subject==='Coding'?'var(--blue-light)':b.subject==='Maths'?'var(--green-light)':'#fff3e0'};color:${b.subject==='Coding'?'var(--blue)':b.subject==='Maths'?'var(--green-dark)':'#e65100'};font-size:12px;font-weight:900;padding:3px 10px;border-radius:50px;">
                  ${b.subject==='Coding'?'💻':b.subject==='Maths'?'📐':'🔬'} ${b.subject}
                </span>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.grade || '—'} · Age ${b.age || '—'}</td>
              <td style="padding:14px 16px;">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${b.email}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);margin-top:2px;">
                  ${b.whatsapp && b.whatsapp !== '—'
                    ? `<a href="https://wa.me/${b.whatsapp.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="color:#25D366;font-weight:800;text-decoration:none;">📱 ${b.whatsapp}</a>`
                    : `📱 ${b.whatsapp || '—'}`}
                </div>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.date || '—'}<br>
                <span style="font-size:11px;color:var(--mid);">🕐 ${b.time || '—'} (local)</span>
                ${b.timeWAT ? `<br><span style="font-size:11px;color:var(--blue);font-weight:800;">🇳🇬 ${b.timeWAT}</span>` : ''}
              </td>
              <td style="padding:14px 16px;font-size:12px;color:var(--light);font-weight:700;">${b.bookedAt ? new Date(b.bookedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—'}</td>
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--dark);font-size:13px;">👩‍🏫 ${b.assignedTutor || '—'}</div>
                ${b.assignedTutorId ? `<div style="font-size:11px;color:var(--light);">${b.assignedTutorId}</div>` : ''}
              </td>
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--blue);font-size:13px;">💼 ${salesName}</div>
              </td>
              <td style="padding:14px 16px;text-align:center;">
                <button onclick="addParentNote('${b.id}')"
                  style="background:var(--bg);color:var(--mid);border:1.5px solid #e8eaf0;border-radius:10px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                  📝 Note
                </button>
                <button onclick="generatePaymentForScheduled('${b.id}','${(b.studentName||'Student').replace(/"/g,'')}',${b.subject ? '"' + b.subject + '"' : '"Demo Class"'})"
                  style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;white-space:nowrap;">
                  💳 Payment Request
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ── PARENT NOTES ── */
function addParentNote(bookingId) {
  const note = prompt('Add a note about this parent/student:');
  if (!note) return;
  // TODO: Add actual API endpoint for updating notes
  showToast('Notes update via API is pending backend implementation.');
}

function renderParentNotes() {
  const el = document.getElementById('parentNotesList');
  if (!el) return;
  const bookings = getBookings().filter(b => b.psNote);
  if (!bookings.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No notes yet.</div>';
    return;
  }
  el.innerHTML = bookings.map(b => `
    <div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:14px;padding:16px 20px;margin-bottom:12px;">
      <div style="font-weight:800;color:var(--dark);">${b.studentName} <span style="font-size:11px;color:var(--light);">${b.id}</span></div>
      <div style="font-size:12px;color:var(--mid);font-weight:700;margin:4px 0;">📚 ${b.subject} · 📅 ${b.date || '—'} · 📧 ${b.email}</div>
      <div style="font-size:13px;color:var(--mid);background:var(--bg);border-radius:8px;padding:8px 12px;margin-top:8px;font-style:italic;">"${b.psNote}"</div>
    </div>`).join('');
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
  // Birthday check uses API profile data — no localStorage needed
  const token = localStorage.getItem('sn_access_token');
  if (token) {
    fetch('https://api.stemnestacademy.co.uk/api/users/me/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).catch(() => {});
  }
});

/* ══════════════════════════════════════════════════════
   INCOMPLETE DEMOS
══════════════════════════════════════════════════════ */
function renderIncomplete() {
  const el   = document.getElementById('incompleteDemosList');
  if (!el) return;
  
  const bookings = getBookings().filter(b => b.status === 'incomplete');
  
  const list = bookings.map(b => {
    return {
      ...b,
      tutorName: b.assignedTutor,
      reason: b.incompleteReason || '—',
      rebooked: false // This will require a backend status check in the future
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No incomplete demos. 🎉</div>';
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Student</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Subject</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Teacher</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Date</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Reason</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((item, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--dark);">${item.studentName}</div>
                <div style="font-size:11px;color:var(--light);">📧 ${item.email} · 📱 ${item.whatsapp||'—'}</div>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${item.subject}</td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${item.tutorName}</td>
              <td style="padding:14px 16px;font-size:12px;color:var(--mid);">${item.date||'—'}<br>${item.time||'—'}</td>
              <td style="padding:14px 16px;font-size:12px;color:var(--mid);max-width:200px;">
                <div style="background:#fde8e8;border-radius:8px;padding:6px 10px;color:#c53030;font-weight:700;">${item.reason||'—'}</div>
              </td>
              <td style="padding:14px 16px;text-align:center;">
                ${!item.rebooked ? `
                  <button onclick="rebookIncomplete('${item.id}')"
                    style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;">
                    🔄 Rebook Demo
                  </button>` : `
                  <span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Rebooked</span>`}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function rebookIncomplete(incId) {
  const bookings = getBookings().filter(b => b.status === 'incomplete');
  const b = bookings.find(x => x.id === incId);
  if (!b) return;

  const item = {
    ...b,
    bookingId: b.id,
    tutorName: b.assignedTutor,
    reason: b.incompleteReason || '—'
  };

  // Pre-fill the schedule modal with this student's details
  psScheduleBookingId = item.bookingId;
  const infoEl = document.getElementById('sm-student-info');
  if (infoEl) infoEl.innerHTML =
    `<strong>${item.studentName}</strong> · ${item.grade||'—'} · Age ${item.age||'—'}<br>` +
    `📚 ${item.subject} &nbsp;·&nbsp; 📧 ${item.email} &nbsp;·&nbsp; 📱 ${item.whatsapp||'—'}<br>` +
    `<span style="color:#c53030;font-weight:800;">Previous reason: ${item.reason}</span>`;
  
  populateTeacherDropdown(item.subject);

  const dateEl = document.getElementById('sm-date');
  if (dateEl) dateEl.min = new Date().toISOString().split('T')[0];

  ['sm-time','sm-link'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  // Mark as rebooked after scheduling (Requires backend endpoint for proper tracking)
  const _origConfirm = window.confirmScheduleDemo;
  window.confirmScheduleDemo = async function() {
    await _origConfirm();
    window.confirmScheduleDemo = _origConfirm;
  };

  document.getElementById('scheduleModalOverlay').classList.add('open');
}

/* ══════════════════════════════════════════════════════
   CANCELLED CLASSES
══════════════════════════════════════════════════════ */
function renderCancelled() {
  const el   = document.getElementById('cancelledClassesList');
  if (!el) return;
  
  const list = getBookings().filter(b => b.status === 'cancelled').map(b => ({
      ...b,
      reason: b.cancelReason || 'Cancelled by student',
      cancelledAt: b.date // fallback
  })).sort((a, b) => new Date(b.cancelledAt) - new Date(a.cancelledAt));

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No cancelled classes.</div>';
    return;
  }

  const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:14px 16px;vertical-align:middle;';

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thS}">Booking ID</th>
            <th style="${thS}">Student</th>
            <th style="${thS}">Subject</th>
            <th style="${thS}">Original Slot</th>
            <th style="${thS}">Contact</th>
            <th style="${thS}">Reason</th>
            <th style="${thS}">Cancelled</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((item, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS}">
                <span style="font-family:'Fredoka One',cursive;font-size:12px;color:var(--blue);">${item.bookingId||item.id||'—'}</span>
              </td>
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${item.studentName||'—'}</div>
                <div style="font-size:11px;color:var(--light);font-weight:700;">${item.grade||'—'} · Age ${item.age||'—'}</div>
              </td>
              <td style="${tdS}">
                <span style="font-weight:700;color:var(--mid);">${item.subject||'—'}</span>
              </td>
              <td style="${tdS}">
                <div style="font-weight:700;color:var(--mid);">${item.date||'—'}</div>
                <div style="font-size:12px;color:var(--light);">${item.time||'—'}</div>
              </td>
              <td style="${tdS}">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${item.email||'—'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);margin-top:2px;">📱 ${item.whatsapp||'—'}</div>
              </td>
              <td style="${tdS};max-width:220px;">
                <div style="background:#fde8e8;border-radius:8px;padding:6px 10px;font-size:12px;color:#c53030;font-weight:700;line-height:1.5;">
                  🚫 ${item.reason||'No reason given'}
                </div>
              </td>
              <td style="${tdS};font-size:12px;color:var(--light);font-weight:700;white-space:nowrap;">
                ${new Date(item.cancelledAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   RESCHEDULE REQUESTS
══════════════════════════════════════════════════════ */
function renderReschedule() {
  const el   = document.getElementById('rescheduleRequestsList');
  if (!el) return;
  
  const list = getBookings().filter(b => b.rescheduleNote).map(b => ({
      ...b,
      originalDate: b.date,
      originalTime: b.time,
      preferredDate: b.rescheduleNote?.date || '—',
      preferredTime: b.rescheduleNote?.time || '—',
      status: b.rescheduleNote?.actioned ? 'actioned' : 'pending'
  }));

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No reschedule requests.</div>';
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Student</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Subject</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Original Slot</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Preferred New Slot</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Status</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((item, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--dark);">${item.studentName}</div>
                <div style="font-size:11px;color:var(--light);">📧 ${item.email}</div>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${item.subject}</td>
              <td style="padding:14px 16px;font-size:12px;color:var(--mid);">${item.originalDate||'—'}<br>${item.originalTime||'—'}</td>
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--blue);">📅 ${item.preferredDate||'—'}</div>
                <div style="font-size:12px;color:var(--mid);">🕐 ${item.preferredTime||'—'}</div>
              </td>
              <td style="padding:14px 16px;text-align:center;">
                <span style="background:${item.status==='actioned'?'var(--green-light)':'#fff3e0'};color:${item.status==='actioned'?'var(--green-dark)':'#e65100'};font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">
                  ${item.status==='actioned'?'✅ Actioned':'⏳ Pending'}
                </span>
              </td>
              <td style="padding:14px 16px;text-align:center;">
                ${item.status!=='actioned' ? `
                  <button onclick="actionReschedule('${item.id}')"
                    style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;">
                    📅 Schedule
                  </button>` : '—'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function actionReschedule(reqId) {
  const list = getBookings().filter(b => b.rescheduleNote).map(b => ({
      id: b.id, bookingId: b.id, studentName: b.studentName,
      subject: b.subject, email: b.email, 
      preferredDate: b.rescheduleNote?.date || '—',
      preferredTime: b.rescheduleNote?.time || '—'
  }));
  const item = list.find(r => r.id === reqId);
  if (!item) return;

  // Pre-fill schedule modal
  psScheduleBookingId = item.bookingId;
  const infoEl = document.getElementById('sm-student-info');
  if (infoEl) infoEl.innerHTML =
    `<strong>${item.studentName}</strong> · 📚 ${item.subject}<br>` +
    `📧 ${item.email} · Preferred: <strong>${item.preferredDate} at ${item.preferredTime}</strong>`;

  populateTeacherDropdown(item.subject);

  const dateEl = document.getElementById('sm-date');
  if (dateEl) { dateEl.min = new Date().toISOString().split('T')[0]; dateEl.value = item.preferredDate || ''; }
  const timeEl = document.getElementById('sm-time');
  if (timeEl && item.preferredTime) {
    const m = item.preferredTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m) {
      let h = parseInt(m[1]);
      if (m[3].toUpperCase()==='PM' && h!==12) h+=12;
      if (m[3].toUpperCase()==='AM' && h===12) h=0;
      timeEl.value = String(h).padStart(2,'0')+':'+m[2];
    }
  }

  // Mark as actioned after scheduling (Requires backend endpoint for proper tracking)
  const _origConfirm = window.confirmScheduleDemo;
  window.confirmScheduleDemo = async function() {
    await _origConfirm();
    window.confirmScheduleDemo = _origConfirm;
    updatePSStats();
  };

  document.getElementById('scheduleModalOverlay').classList.add('open');
}

/* ══════════════════════════════════════════════════════
   COMPLETED DEMOS — from teacher end-class reports
══════════════════════════════════════════════════════ */
function renderCompletedDemos() {
  const el   = document.getElementById('completedDemosList');
  if (!el) return;
  const list = getBookings().filter(b => b.status === 'completed' && b.isDemoClass)
    .sort((a, b) => new Date(b.completedAt || b.date) - new Date(a.completedAt || a.date));

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No completed demos yet. Completed demo classes will appear here.</div>';
    return;
  }

  const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:14px 16px;vertical-align:middle;';

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thS}">Student</th>
            <th style="${thS}">Subject</th>
            <th style="${thS}">Teacher</th>
            <th style="${thS}">Date & Time</th>
            <th style="${thS}">Quality</th>
            <th style="${thS}">Interest</th>
            <th style="${thS}">Notes</th>
            <th style="${thS}">Completed</th>
            <th style="${thS}">Enrol</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((item, i) => {
            const alreadyEnrolled = (window.PS_DATA.enrolments || [])
              .some(e => e.studentEmail === item.email && e.status === 'active');
            return `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${item.studentName||'—'}</div>
                <div style="font-size:11px;color:var(--light);">📧 ${item.email||'—'} · 📱 ${item.whatsapp||'—'}</div>
              </td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${item.subject||'—'}</td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${item.tutorName||'—'}</td>
              <td style="${tdS};font-size:12px;color:var(--mid);">${item.date||'—'}<br>${item.time||'—'}</td>
              <td style="${tdS}">
                <span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">${item.classQuality||'—'}</span>
              </td>
              <td style="${tdS}">
                <span style="background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">${item.studentInterest||'—'}</span>
              </td>
              <td style="${tdS};font-size:12px;color:var(--mid);max-width:180px;">${item.notes||'—'}</td>
              <td style="${tdS};font-size:12px;color:var(--light);font-weight:700;white-space:nowrap;">
                ${new Date(item.completedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
              </td>
              <td style="${tdS};text-align:center;">
                ${alreadyEnrolled
                  ? '<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Enrolled</span>'
                  : `<button onclick="openEnrolmentModal('${item.bookingId||item.id}')"
                      style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;white-space:nowrap;">
                      🎓 Enrol
                    </button>`
                }
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   ENROLMENTS TAB
   Shows students marked as paid by Learning Advisor (sales)
   Each record has an "Enroll" button to move to postsales
══════════════════════════════════════════════════════ */
function renderEnrolments() {
  const el = document.getElementById('enrolmentsList');
  if (!el) return;
  const list = (window.PS_DATA.enrolments || [])
    .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));

  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:48px;margin-bottom:12px;">🎓</div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No enrolments yet</div>
      <div style="font-size:14px;color:var(--light);margin-top:6px;">When a Learning Advisor marks a student as paid, they appear here with an Enroll button.</div>
    </div>`;
    return;
  }

  const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:14px 16px;vertical-align:middle;';

  el.innerHTML = `
    <div style="background:#f0f4ff;border-radius:12px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#1e40af;font-weight:700;">
      🎓 These students have been marked as paid by the Learning Advisor. Click <strong>Enroll</strong> to move them to Post-Sales for onboarding.
    </div>
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thS}">Student</th>
            <th style="${thS}">Subject / Course</th>
            <th style="${thS}">Contact</th>
            <th style="${thS}">Amount</th>
            <th style="${thS}">Learning Advisor</th>
            <th style="${thS}">Status</th>
            <th style="${thS};text-align:center;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((enr, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${enr.studentName || '—'}</div>
                <div style="font-size:11px;color:var(--light);">${enr.grade || '—'} · Age ${enr.age || '—'}</div>
              </td>
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${enr.subject || '—'}</div>
                <div style="font-size:11px;color:var(--light);">${enr.course || '—'}</div>
              </td>
              <td style="${tdS}">
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${enr.email || '—'}</div>
                <div style="font-size:12px;font-weight:700;color:var(--mid);">📱 ${enr.whatsapp || '—'}</div>
              </td>
              <td style="${tdS};font-weight:800;color:var(--green-dark);">${enr.paymentAmount ? '£' + enr.paymentAmount : '—'}</td>
              <td style="${tdS};font-weight:700;color:var(--blue);">💼 ${enr.salesPersonName || '—'}</td>
              <td style="${tdS}">
                ${enr.enrolled
                  ? '<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Enrolled</span>'
                  : '<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">⏳ Awaiting Enrolment</span>'}
              </td>
              <td style="${tdS};text-align:center;">
                ${!enr.enrolled
                  ? `<button onclick="enrollStudentToPostSales('${enr.bookingId || enr.id}', ${JSON.stringify(enr).replace(/"/g,'&quot;')})"
                      style="background:var(--green);color:#fff;border:none;border-radius:10px;padding:9px 18px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;white-space:nowrap;">
                      🎓 Enroll
                    </button>`
                  : '<span style="font-size:12px;color:var(--light);font-weight:700;">Done</span>'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* Move student from presales enrolments → postsales paid students */
async function enrollStudentToPostSales(bookingId, enrolment) {
  if (!confirm('Move ' + (enrolment.studentName || 'this student') + ' to Post-Sales for onboarding?')) return;

  const token = localStorage.getItem('sn_access_token');
  if (!token) { showToast('Not logged in.', 'error'); return; }

  try {
    /* Update booking status to 'converted' so postsales paid students tab picks it up */
    const res = await fetch('https://api.stemnestacademy.co.uk/api/bookings/' + bookingId + '/status', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    const data = await res.json();

    if (data.success || res.ok) {
      /* Mark as enrolled in local state */
      const idx = (window.PS_DATA.enrolments || []).findIndex(e => (e.bookingId || e.id) === bookingId);
      if (idx !== -1) window.PS_DATA.enrolments[idx].enrolled = true;

      setText('enrolmentsBadge', (window.PS_DATA.enrolments || []).filter(e => !e.enrolled).length);
      renderEnrolments();
      showToast('✅ Student moved to Post-Sales! They will appear in the Paid Students section.');
    } else {
      showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════
   INCOMING REFERRALS TAB (presales)
   Fetches from GET /api/enrollments/referrals?status=pending
   Two actions: Book Demo (pre-fill schedule modal) or Enroll
   (move to postsales incoming referrals)
══════════════════════════════════════════════════════ */
async function renderIncomingReferrals() {
  const el = document.getElementById('incomingReferralsList');
  if (!el) return;

  el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--light);font-weight:700;">⏳ Loading referrals...</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) { el.innerHTML = '<div style="padding:24px;color:var(--orange);font-weight:700;">Not logged in.</div>'; return; }

    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/referrals?status=pending', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const referrals = data.referrals || [];

    if (!referrals.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:12px;">🤝</div>
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No referrals yet</div>
        <div style="font-size:14px;color:var(--light);margin-top:6px;">When students refer friends, they appear here.</div>
      </div>`;
      return;
    }

    const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
    const tdS = 'padding:14px 16px;vertical-align:middle;';

    el.innerHTML = `
      <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
              <th style="${thS}">Referred Student</th>
              <th style="${thS}">Grade / Age</th>
              <th style="${thS}">Parent Contact</th>
              <th style="${thS}">Referred By</th>
              <th style="${thS}">Needs Demo?</th>
              <th style="${thS}">Received</th>
              <th style="${thS}">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${referrals.map((r, i) => `
              <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
                <td style="${tdS}">
                  <div style="font-weight:800;color:var(--dark);">${r.student_name || '—'}</div>
                  <div style="font-size:11px;color:var(--light);">Ref #${r.id}</div>
                </td>
                <td style="${tdS};font-weight:700;color:var(--mid);">${r.grade || '—'} · Age ${r.age || '—'}</td>
                <td style="${tdS}">
                  <div style="font-size:12px;font-weight:700;color:var(--mid);">📧 ${r.parent_email || '—'}</div>
                  <div style="font-size:12px;font-weight:700;color:var(--mid);">
                    ${r.parent_phone
                      ? `<a href="https://wa.me/${r.parent_phone.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="color:#25D366;font-weight:800;text-decoration:none;">📱 ${r.parent_phone}</a>`
                      : '📱 —'}
                  </div>
                </td>
                <td style="${tdS}">
                  <div style="font-weight:800;color:var(--blue);">${r.referrer_name || '—'}</div>
                  <div style="font-size:11px;color:var(--light);">${r.referrer_staff_id || ''}</div>
                </td>
                <td style="${tdS}">
                  <span style="background:${r.needs_demo?'var(--blue-light)':'var(--green-light)'};color:${r.needs_demo?'var(--blue)':'var(--green-dark)'};font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">
                    ${r.needs_demo ? '📅 Yes' : '✅ No'}
                  </span>
                </td>
                <td style="${tdS};font-size:12px;color:var(--light);font-weight:700;">
                  ${r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}
                </td>
                <td style="${tdS}">
                  <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start;">
                    <button onclick="bookDemoFromReferral(${JSON.stringify(r).replace(/"/g,'&quot;')})"
                      style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;white-space:nowrap;">
                      📅 Book Demo
                    </button>
                    <button onclick="enrollFromReferral(${r.id})"
                      style="background:var(--green);color:#fff;border:none;border-radius:10px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:900;font-size:12px;cursor:pointer;white-space:nowrap;">
                      🎓 Enroll
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px;font-size:12px;font-weight:700;color:var(--light);text-align:right;">${referrals.length} referral${referrals.length!==1?'s':''}</div>`;
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--orange);font-weight:700;">Failed to load referrals. Please refresh.</div>';
    console.error('[Presales] Referrals load error:', e);
  }
}

/* Open schedule modal pre-filled with referral data */
function bookDemoFromReferral(referral) {
  /* We need a booking ID to schedule — create a temporary pending booking first */
  const token = localStorage.getItem('sn_access_token');
  if (!token) { showToast('Not logged in.', 'error'); return; }

  /* Pre-fill the schedule modal manually */
  const infoEl = document.getElementById('sm-student-info');
  if (infoEl) infoEl.innerHTML =
    `<strong>${referral.student_name}</strong> · ${referral.grade || '—'} · Age ${referral.age || '—'}<br>` +
    `📧 ${referral.parent_email || '—'} &nbsp;·&nbsp; 📱 ${referral.parent_phone || '—'}<br>` +
    `<span style="color:var(--blue);font-weight:800;">Referred by: ${referral.referrer_name || '—'}</span>`;

  /* Create a real booking first so we have an ID to assign */
  const today = new Date().toISOString().split('T')[0];
  fetch('https://api.stemnestacademy.co.uk/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentName: referral.student_name,
      age:         String(referral.age || '—'),
      grade:       referral.grade || '—',
      email:       referral.parent_email || '',
      whatsapp:    referral.parent_phone || '',
      subject:     referral.subject || 'Coding',
      device:      'laptop',
      timezone:    'Europe/London',
      date:        today,
      time:        '10:00',
    })
  }).then(r => r.json()).then(d => {
    if (d.success && d.bookingId) {
      psScheduleBookingId = d.bookingId;
      /* Mark referral as booking_created */
      fetch('https://api.stemnestacademy.co.uk/api/enrollments/referrals/' + referral.id, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'demo_booked', bookingId: d.bookingId })
      }).catch(() => {});
      /* Reload presales data so the new booking appears */
      _loadPresalesFromAPI().then(() => {});
    }
  }).catch(() => {});

  populateTeacherDropdown('Coding');
  populateSalesDropdown();

  const dateEl = document.getElementById('sm-date');
  if (dateEl) dateEl.min = new Date().toISOString().split('T')[0];

  ['sm-time','sm-link'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  document.getElementById('scheduleModalOverlay').classList.add('open');
}

/* Move referral to postsales incoming referrals */
async function enrollFromReferral(referralId) {
  if (!confirm('Move this referral to Post-Sales for enrollment processing?')) return;
  const token = localStorage.getItem('sn_access_token');
  if (!token) { showToast('Not logged in.', 'error'); return; }

  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/referrals/' + referralId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'postsales' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Referral moved to Post-Sales for enrollment.');
      renderIncomingReferrals();
    } else {
      showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════
   DELETE BOOKING
   Allows presales to remove test/incorrect bookings
══════════════════════════════════════════════════════ */
async function deleteBooking(bookingId, studentName) {
  const name = typeof studentName === 'string' ? studentName : (document.querySelector(`[data-id="${bookingId}"]`)?.dataset?.name || 'this student');
  const confirmed = confirm(
    `Delete booking for "${name}"?\n\nThis will permanently remove the record. This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/bookings/' + bookingId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Booking deleted.');
      /* Refresh presales data */
      await _loadPresalesFromAPI();
      updatePSStats();
      renderIncoming();
    } else {
      showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════
   PAYMENT REQUEST FROM SCHEDULED DEMO
   Generates Grey bank details for a scheduled student
   so presales can share payment info immediately
══════════════════════════════════════════════════════ */

/* Store payment data for copy button */
window._psPaymentCopyData = null;

async function generatePaymentForScheduled(bookingId, studentName, subject) {
  /* Open modal with loading state */
  let modal = document.getElementById('psPaymentModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'psPaymentModalOverlay';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto;">
        <div class="modal-header">
          <div class="modal-title">💳 Payment Request</div>
          <button class="modal-close" onclick="document.getElementById('psPaymentModalOverlay').classList.remove('open')">✕</button>
        </div>
        <div class="modal-body" id="psPaymentBody">
          <div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Generating...</div>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }

  document.getElementById('psPaymentBody').innerHTML =
    '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">⏳ Generating payment reference...</div>';
  modal.classList.add('open');

  try {
    const token = localStorage.getItem('sn_access_token');

    /* Generate a unique reference via Grey API */
    const refRes = await fetch('https://api.stemnestacademy.co.uk/api/grey/payment-reference', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName,
        amount: 0,
        currency: 'USD',
        notes: `Demo class booking — ${subject || 'Demo'}`,
      })
    });
    const refData = await refRes.json();
    const reference = (refData.success && refData.reference) ? refData.reference
      : ('SN-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2,7).toUpperCase());

    /* USD bank details */
    const account = {
      currency:      'USD',
      accountName:   'StemNest Academy Ltd',
      accountNumber: '218292502181',
      routingNumber: '101019644',
      accountType:   'Checking',
      bankName:      'Lead Bank',
      bankAddress:   '1801 Main St., Kansas City, MO 64108',
    };

    window._psPaymentCopyData = { reference, account };

    const fields = [
      { label: 'Account Name',    value: account.accountName },
      { label: 'Account Number',  value: account.accountNumber },
      { label: 'Routing Number',  value: account.routingNumber },
      { label: 'Account Type',    value: account.accountType },
      { label: 'Bank Name',       value: account.bankName },
      { label: 'Bank Address',    value: account.bankAddress },
      { label: 'Payment Reference', value: reference, highlight: true },
    ];

    document.getElementById('psPaymentBody').innerHTML = `
      <div style="background:var(--green-light);border-radius:12px;padding:14px 18px;margin-bottom:16px;font-size:13px;font-weight:700;color:var(--green-dark);">
        ✅ Payment reference generated for <strong>${studentName}</strong>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--mid);margin-bottom:16px;">
        Share these bank details with the parent. Ask them to include the <strong style="color:var(--blue);">Payment Reference</strong> in the transfer description.
      </div>
      <div style="background:var(--white);border:2px solid #e8eaf0;border-radius:14px;padding:18px 20px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <span style="font-size:22px;">🇺🇸</span>
          <div style="font-family:'Fredoka One',cursive;font-size:15px;color:var(--dark);">US Dollar (USD) — Lead Bank</div>
        </div>
        ${fields.map(f => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f0f2f8;">
            <span style="font-size:12px;font-weight:700;color:var(--light);text-transform:uppercase;letter-spacing:.3px;">${f.label}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;font-weight:${f.highlight?'900':'800'};color:${f.highlight?'var(--blue)':'var(--dark)'};">${f.value}</span>
              <button onclick="navigator.clipboard.writeText('${f.value}').then(()=>showToast('✅ ${f.label} copied!'))"
                style="background:var(--bg);border:1px solid #e8eaf0;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:800;color:var(--mid);cursor:pointer;">📋</button>
            </div>
          </div>`).join('')}
      </div>
      <div style="background:#fff8e1;border:2px solid #f59e0b;border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:13px;font-weight:800;color:#92400e;">
        ⚠️ <strong>IMPORTANT:</strong> Parent MUST include <strong style="color:#1a56db;">${reference}</strong> in the transfer memo/description.
      </div>
      <button id="psCopyAllBtn" onclick="copyAllPSPaymentDetails()"
        style="width:100%;background:linear-gradient(135deg,#1a56db,#0e9f6e);color:#fff;border:none;border-radius:14px;padding:14px;font-family:'Fredoka One',cursive;font-size:17px;cursor:pointer;margin-bottom:6px;">
        📋 Copy All Payment Details
      </button>
      <div style="text-align:center;font-size:12px;color:var(--light);font-weight:700;">Paste directly into WhatsApp or email</div>`;

  } catch(e) {
    document.getElementById('psPaymentBody').innerHTML =
      `<div style="padding:24px;color:var(--orange);font-weight:700;">Error: ${e.message}. Please try again.</div>`;
  }
}

function copyAllPSPaymentDetails() {
  const data = window._psPaymentCopyData;
  if (!data) { showToast('No payment data. Please reopen the modal.', 'error'); return; }

  const ref = data.reference;
  const a   = data.account;

  const text = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '  STEMNEST ACADEMY — PAYMENT DETAILS',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '  Bank Name:       ' + a.bankName,
    '  Account Name:    ' + a.accountName,
    '  Account Number:  ' + a.accountNumber,
    '  Routing Number:  ' + a.routingNumber,
    '  Account Type:    ' + a.accountType,
    '  Bank Address:    ' + a.bankAddress,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '  PAYMENT REFERENCE: ' + ref,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '  IMPORTANT: Include the Payment Reference',
    '  (' + ref + ') in the transfer memo/description.',
    '',
    '  Questions? support@stemnestacademy.co.uk',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');

  const btn = document.getElementById('psCopyAllBtn');
  const markCopied = () => {
    if (btn) { btn.textContent = '✅ Copied! Paste into WhatsApp or Email'; btn.style.background = '#0e9f6e';
      setTimeout(() => { btn.textContent = '📋 Copy All Payment Details'; btn.style.background = 'linear-gradient(135deg,#1a56db,#0e9f6e)'; }, 3000); }
    showToast('✅ Payment details copied!');
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(markCopied).catch(() => { _fallbackCopy(text); markCopied(); });
  } else { _fallbackCopy(text); markCopied(); }
}
