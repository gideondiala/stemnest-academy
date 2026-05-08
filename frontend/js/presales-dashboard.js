/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — PRE-SALES DASHBOARD JS
   Receives free-trial bookings, schedules demo classes,
   assigns teachers, writes directly to teacher calendar.
═══════════════════════════════════════════════════════ */

const PS_TABS = ['incoming', 'scheduled', 'completed', 'incomplete', 'cancelled', 'reschedule', 'notes', 'enrolments'];
let psScheduleBookingId = null; // booking being scheduled in modal

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  const h = new Date().getHours();
  const grEl = document.getElementById('psGreeting');
  if (grEl) grEl.textContent = h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';
  const dateEl = document.getElementById('psDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  showPSTab('incoming');
  bindScheduleModal();
});

/* ── HELPERS ── */
function getBookings()  { try { return JSON.parse(localStorage.getItem('sn_bookings') || '[]'); } catch { return []; } }
function getTeachers()  { try { return JSON.parse(localStorage.getItem('sn_teachers') || '[]'); } catch { return []; } }
function saveBookings(list) { localStorage.setItem('sn_bookings', JSON.stringify(list)); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function getTeacherAvailability(id) {
  try { return JSON.parse(localStorage.getItem('sn_all_tutor_avail') || '{}')[id]?.slots || {}; }
  catch { return {}; }
}

/* Write a slot directly onto a teacher's calendar */
function writeTeacherCalendarSlot(teacherId, dateKey, timeKey, bookingId) {
  // Read existing availability
  const allAvail = JSON.parse(localStorage.getItem('sn_all_tutor_avail') || '{}');
  const tutorEntry = allAvail[teacherId] || { tutor: getTeachers().find(t => t.id === teacherId) || {}, slots: {} };
  const slots = tutorEntry.slots || {};

  // Mark the 1-hour block (timeKey + timeKey+30)
  slots[dateKey + '|' + timeKey] = { booked: true, bookingId };
  const [h, m] = timeKey.split(':').map(Number);
  const nextKey = m === 0 ? `${h}:30` : `${h + 1}:00`;
  slots[dateKey + '|' + nextKey] = { booked: true, bookingId };

  tutorEntry.slots = slots;
  allAvail[teacherId] = tutorEntry;
  localStorage.setItem('sn_all_tutor_avail', JSON.stringify(allAvail));

  // Also write to teacher's personal store
  const personal = JSON.parse(localStorage.getItem('sn_tutor_avail_' + teacherId) || '{}');
  personal[dateKey + '|' + timeKey] = { booked: true, bookingId };
  personal[dateKey + '|' + nextKey] = { booked: true, bookingId };
  localStorage.setItem('sn_tutor_avail_' + teacherId, JSON.stringify(personal));
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
  if (tab === 'notes')      renderParentNotes();
  if (tab === 'enrolments') renderEnrolments();
}

/* ── STATS ── */
function updatePSStats() {
  const bookings = getBookings();
  const incomplete  = JSON.parse(localStorage.getItem('sn_incomplete_demos') || '[]');
  const cancelled   = JSON.parse(localStorage.getItem('sn_cancelled_classes') || '[]');
  const reschedules = JSON.parse(localStorage.getItem('sn_reschedule_requests') || '[]');
  const completed   = JSON.parse(localStorage.getItem('sn_completed_demos') || '[]');
  setText('psStat1', bookings.filter(b => b.status === 'pending').length);
  setText('psStat2', bookings.filter(b => b.status === 'scheduled').length);
  setText('psStat3', bookings.filter(b => b.psConfirmed).length);
  setText('psStat4', getTeachers().length);
  setText('incomingBadge',   bookings.filter(b => b.status === 'pending').length);
  setText('completedBadge',  completed.length);
  setText('incompleteBadge', incomplete.filter(i => !i.rebooked).length);
  setText('cancelledBadge',  cancelled.length);
  setText('rescheduleBadge', reschedules.filter(r => r.status === 'pending').length);
  const enrolments = JSON.parse(localStorage.getItem('sn_enrolments') || '[]');
  setText('enrolmentsBadge', enrolments.filter(e => e.status === 'active').length);
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
                <div style="font-size:12px;font-weight:700;color:var(--mid);margin-top:2px;">📱 ${b.whatsapp || '—'}</div>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.date || '—'}<br><span style="font-size:11px;">${b.time || '—'}</span></td>
              <td style="padding:14px 16px;font-size:12px;color:var(--light);font-weight:700;">${b.bookedAt ? new Date(b.bookedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—'}</td>
              <td style="padding:14px 16px;text-align:center;">
                <button onclick="openScheduleModal('${b.id}')"
                  style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;white-space:nowrap;transition:.15s;"
                  onmouseover="this.style.background='#1140b0'" onmouseout="this.style.background='var(--blue)'">
                  📅 Schedule Class
                </button>
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
    teachers.map(t => {
      const avail = getTeacherAvailability(t.id);
      const slotCount = Object.keys(avail).filter(k => avail[k] === true || (avail[k] && !avail[k].booked)).length / 2;
      return `<option value="${t.id}">${t.name} (${t.id}) · ${t.subject} · ${Math.round(slotCount)} slots available</option>`;
    }).join('');
}

function populateSalesDropdown() {
  const sel = document.getElementById('sm-sales');
  if (!sel) return;
  const salesPersons = JSON.parse(localStorage.getItem('sn_sales_persons') || '[]');
  sel.innerHTML = '<option value="">— Select a sales person —</option>' +
    salesPersons.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join('');
}

async function confirmScheduleDemo() {
  const teacherId  = document.getElementById('sm-teacher')?.value;
  const salesId    = document.getElementById('sm-sales')?.value;
  const date       = document.getElementById('sm-date')?.value;
  const time       = document.getElementById('sm-time')?.value;
  const link       = document.getElementById('sm-link')?.value.trim();
  const notes      = document.getElementById('sm-notes')?.value.trim();

  if (!teacherId) { showToast('Please select a teacher.', 'error'); return; }
  if (!salesId)   { showToast('Please select a sales person.', 'error'); return; }
  if (!date)      { showToast('Please select a date.', 'error'); return; }
  if (!time)      { showToast('Please select a time.', 'error'); return; }
  if (!link)      { showToast('Please enter a class link.', 'error'); return; }

  const teacher      = getTeachers().find(t => t.id === teacherId);
  const salesPersons = JSON.parse(localStorage.getItem('sn_sales_persons') || '[]');
  const salesPerson  = salesPersons.find(s => s.id === salesId);
  const timeKey      = time;

  /* Update localStorage */
  const all = getBookings();
  const idx = all.findIndex(b => b.id === psScheduleBookingId);
  if (idx !== -1) {
    all[idx] = {
      ...all[idx],
      status:            'scheduled',
      assignedTutor:     teacher?.name,
      assignedTutorId:   teacherId,
      assignedSalesId:   salesId,
      assignedSalesName: salesPerson?.name || '',
      classLink:         link,
      date,
      time:              to12h(time),
      notes,
      tutorNotified:     false,
      salesNotified:     false,
      scheduledAt:       new Date().toISOString(),
    };
    saveBookings(all);
  }

  writeTeacherCalendarSlot(teacherId, date, timeKey, psScheduleBookingId);

  /* Also call real API (fire and forget) */
  if (typeof isApiAvailable === 'function') {
    isApiAvailable().then(online => {
      if (online && typeof Bookings !== 'undefined') {
        Bookings.assign(psScheduleBookingId, {
          tutorId:   teacherId,
          salesId:   salesId || undefined,
          classLink: link,
          notes:     notes || undefined,
        }).catch(e => console.warn('[API] Assign booking failed:', e.message));
      }
    });
  }

  if (typeof emailDemoBookedToTeacher === 'function') {
    const updatedBooking = getBookings().find(b => b.id === psScheduleBookingId) || {};
    emailDemoBookedToTeacher({ ...updatedBooking, date, time: to12h(time), classLink: link, notes }, teacher);
  }

  closeScheduleModal();
  updatePSStats();
  renderIncoming();
  showToast('Demo scheduled with ' + (teacher?.name || 'teacher') + ' & ' + (salesPerson?.name || 'sales team') + ' on ' + date + ' at ' + to12h(time) + '!');
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

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Student</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Subject</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Teacher</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Date & Time</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Contact</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map((b, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i % 2 === 0 ? '' : 'background:#fafbff;'}">
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--dark);">${b.studentName}</div>
                <div style="font-size:11px;color:var(--light);font-weight:700;">${b.id}</div>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.subject}</td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.assignedTutor || '—'}</td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${b.date || '—'}<br><span style="font-size:11px;">${b.time || '—'}</span></td>
              <td style="padding:14px 16px;font-size:12px;color:var(--mid);">📧 ${b.email}<br>📱 ${b.whatsapp || '—'}</td>
              <td style="padding:14px 16px;text-align:center;">
                <button onclick="addParentNote('${b.id}')"
                  style="background:var(--bg);color:var(--mid);border:1.5px solid #e8eaf0;border-radius:10px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                  📝 Note
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ── PARENT NOTES ── */
function addParentNote(bookingId) {
  const note = prompt('Add a note about this parent/student:');
  if (!note) return;
  const all = getBookings();
  const idx = all.findIndex(b => b.id === bookingId);
  if (idx !== -1) { all[idx].psNote = note; all[idx].psConfirmed = true; saveBookings(all); }
  renderIncoming();
  renderScheduled();
  updatePSStats();
  showToast('✅ Note saved!');
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
  const staff = JSON.parse(localStorage.getItem('sn_staff') || '[]');
  const ps = staff.find(s => s.role === 'presales');
  if (ps) setTimeout(() => checkBirthdayForUser(ps.id, ps.name.split(' ')[0]), 1500);
});

/* ══════════════════════════════════════════════════════
   INCOMPLETE DEMOS
══════════════════════════════════════════════════════ */
function renderIncomplete() {
  const el   = document.getElementById('incompleteDemosList');
  if (!el) return;
  const list = JSON.parse(localStorage.getItem('sn_incomplete_demos') || '[]')
    .sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));

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
  const list = JSON.parse(localStorage.getItem('sn_incomplete_demos') || '[]');
  const item = list.find(i => i.id === incId);
  if (!item) return;

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

  // Mark as rebooked after scheduling
  const _origConfirm = window.confirmScheduleDemo;
  window.confirmScheduleDemo = function() {
    _origConfirm();
    const idx = list.findIndex(i => i.id === incId);
    if (idx !== -1) { list[idx].rebooked = true; localStorage.setItem('sn_incomplete_demos', JSON.stringify(list)); }
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
  const list = JSON.parse(localStorage.getItem('sn_cancelled_classes') || '[]')
    .sort((a, b) => new Date(b.cancelledAt) - new Date(a.cancelledAt));

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
  const list = JSON.parse(localStorage.getItem('sn_reschedule_requests') || '[]')
    .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

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
  const list = JSON.parse(localStorage.getItem('sn_reschedule_requests') || '[]');
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

  // Mark as actioned after scheduling
  const _origConfirm = window.confirmScheduleDemo;
  window.confirmScheduleDemo = function() {
    _origConfirm();
    const idx = list.findIndex(r => r.id === reqId);
    if (idx !== -1) { list[idx].status = 'actioned'; localStorage.setItem('sn_reschedule_requests', JSON.stringify(list)); }
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
  const list = JSON.parse(localStorage.getItem('sn_completed_demos') || '[]')
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

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
            const alreadyEnrolled = (JSON.parse(localStorage.getItem('sn_enrolments') || '[]'))
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
══════════════════════════════════════════════════════ */
function renderEnrolments() {
  const el = document.getElementById('enrolmentsList');
  if (!el) return;
  const list = JSON.parse(localStorage.getItem('sn_enrolments') || '[]')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:48px;margin-bottom:12px;">🎓</div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No enrolments yet</div>
      <div style="font-size:14px;color:var(--light);margin-top:6px;">Once a demo converts to a paid course, click "Enrol" on the Completed Demos tab.</div>
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
            <th style="${thS}">Enrolment ID</th>
            <th style="${thS}">Student</th>
            <th style="${thS}">Course</th>
            <th style="${thS}">Teacher</th>
            <th style="${thS}">Schedule</th>
            <th style="${thS}">Start Date</th>
            <th style="${thS}">Lessons</th>
            <th style="${thS}">Status</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((enr, i) => {
            const scheduleStr = (enr.schedule || []).map(s => {
              const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
              return (days[s.weekday] || '?') + ' ' + s.time;
            }).join(', ');
            // Count completed lessons
            const allBk = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
            const enrBk = allBk.filter(b => b.enrolmentId === enr.id);
            const done  = enrBk.filter(b => b.status === 'completed').length;
            const total = enr.totalLessons || enrBk.length;
            return `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS}">
                <span style="font-family:'Fredoka One',cursive;font-size:12px;color:var(--blue);">${enr.id}</span>
              </td>
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${enr.studentName||'—'}</div>
                <div style="font-size:11px;color:var(--light);">${enr.studentEmail||'—'}</div>
              </td>
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${enr.courseName||'—'}</div>
                <div style="font-size:11px;color:var(--light);">${enr.courseId||'—'}</div>
              </td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${enr.teacherName||'—'}</td>
              <td style="${tdS};font-size:12px;color:var(--mid);">${scheduleStr||'—'}</td>
              <td style="${tdS};font-size:12px;color:var(--mid);">${enr.startDate||'—'}</td>
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${done} / ${total}</div>
                <div style="background:#e8eaf0;border-radius:50px;height:6px;margin-top:4px;overflow:hidden;">
                  <div style="background:var(--green);height:100%;width:${total>0?Math.round(done/total*100):0}%;border-radius:50px;"></div>
                </div>
              </td>
              <td style="${tdS}">
                <span style="background:${enr.status==='active'?'var(--green-light)':'#f0f2f8'};color:${enr.status==='active'?'var(--green-dark)':'var(--light)'};font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">
                  ${enr.status==='active'?'✅ Active':'⏸ Inactive'}
                </span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}
