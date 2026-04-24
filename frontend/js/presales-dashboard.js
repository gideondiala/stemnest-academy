/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — PRE-SALES DASHBOARD JS
   Receives free-trial bookings, schedules demo classes,
   assigns teachers, writes directly to teacher calendar.
═══════════════════════════════════════════════════════ */

const PS_TABS = ['incoming', 'scheduled', 'notes'];
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
  if (tab === 'incoming')  renderIncoming();
  if (tab === 'scheduled') renderScheduled();
  if (tab === 'notes')     renderParentNotes();
}

/* ── STATS ── */
function updatePSStats() {
  const bookings = getBookings();
  setText('psStat1', bookings.filter(b => b.status === 'pending').length);
  setText('psStat2', bookings.filter(b => b.status === 'scheduled').length);
  setText('psStat3', bookings.filter(b => b.psConfirmed).length);
  setText('psStat4', getTeachers().length);
  setText('incomingBadge', bookings.filter(b => b.status === 'pending').length);
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
      const slotCount = Object.keys(avail).filter(k => avail[k] === true || (avail[k] && !avail[k].booked)).length / 2; // 1-hr blocks
      return `<option value="${t.id}">${t.name} (${t.id}) · ${t.subject} · ${Math.round(slotCount)} slots available</option>`;
    }).join('');
}

function confirmScheduleDemo() {
  const teacherId = document.getElementById('sm-teacher')?.value;
  const date      = document.getElementById('sm-date')?.value;
  const time      = document.getElementById('sm-time')?.value;
  const link      = document.getElementById('sm-link')?.value.trim();
  const notes     = document.getElementById('sm-notes')?.value.trim();

  if (!teacherId) { showToast('Please select a teacher.', 'error'); return; }
  if (!date)      { showToast('Please select a date.', 'error'); return; }
  if (!time)      { showToast('Please select a time.', 'error'); return; }
  if (!link)      { showToast('Please enter a class link.', 'error'); return; }

  const teacher = getTeachers().find(t => t.id === teacherId);
  const timeKey = time; // already "HH:MM"

  // Update booking record
  const all = getBookings();
  const idx = all.findIndex(b => b.id === psScheduleBookingId);
  if (idx !== -1) {
    all[idx] = {
      ...all[idx],
      status:          'scheduled',
      assignedTutor:   teacher?.name,
      assignedTutorId: teacherId,
      classLink:       link,
      date,
      time:            to12h(time),
      notes,
      tutorNotified:   false,
      scheduledAt:     new Date().toISOString(),
    };
    saveBookings(all);
  }

  // Write directly to teacher's calendar
  writeTeacherCalendarSlot(teacherId, date, timeKey, psScheduleBookingId);

  closeScheduleModal();
  updatePSStats();
  renderIncoming();
  showToast(`✅ Demo class scheduled with ${teacher?.name} on ${date} at ${to12h(time)}!`);
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
