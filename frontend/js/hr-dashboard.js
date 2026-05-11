/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — HR DASHBOARD JS
═══════════════════════════════════════════════════════ */
const HR_TABS = ['applications','interviews','training','adverts'];

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('hrDate').textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  showHRTab('applications');
});

function showHRTab(tab) {
  HR_TABS.forEach(t => { const el = document.getElementById('tab-' + t); if (el) el.style.display = t === tab ? 'block' : 'none'; });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
  updateHRStats();
  if (tab === 'applications') {
    /* Load from API first, then render */
    loadApplicationsFromAPI().then(() => renderApplications());
  }
  if (tab === 'interviews')   renderInterviews();
  if (tab === 'training')     renderTraining();
  if (tab === 'adverts')      renderAdverts();
}

function getApplications() { try { return JSON.parse(localStorage.getItem('sn_applications') || '[]'); } catch { return []; } }

async function loadApplicationsFromAPI() {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return null;
    const res = await fetch('https://api.stemnestacademy.co.uk/api/applications', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.applications) {
      /* Normalise API fields to match localStorage format */
      const apps = data.applications.map(a => ({
        id:        a.id,
        name:      a.name,
        email:     a.email,
        phone:     a.phone || '—',
        country:   a.country || '—',
        qual:      a.qualification || '—',
        exp:       a.experience_years || '0',
        subjects:  a.subjects || [],
        topics:    a.topics || '',
        ageGroups: a.age_groups || [],
        hours:     a.hours_per_week || '',
        times:     a.preferred_times || '',
        device:    a.device || '',
        bio:       a.bio || '',
        linkedin:  a.linkedin || '',
        source:    a.source || '',
        status:    a.status || 'pending',
        appliedAt: a.applied_at,
        _fromApi:  true,
      }));
      localStorage.setItem('sn_applications', JSON.stringify(apps));
      return apps;
    }
  } catch (e) { console.warn('[HR] API load failed:', e.message); }
  return null;
}

async function updateAppStatusAPI(appId, status) {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;
    await fetch('https://api.stemnestacademy.co.uk/api/applications/' + appId, {
      method:  'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    });
  } catch (e) { /* silent */ }
}
function getInterviews()   { try { return JSON.parse(localStorage.getItem('sn_interviews') || '[]'); } catch { return []; } }
function getTrainings()    { try { return JSON.parse(localStorage.getItem('sn_trainings') || '[]'); } catch { return []; } }
function getAdverts()      { try { return JSON.parse(localStorage.getItem('sn_job_adverts') || '[]'); } catch { return []; } }

function updateHRStats() {
  const apps = getApplications();
  setText('hrStat1', apps.length);
  setText('hrStat2', apps.filter(a => a.status === 'pending').length);
  setText('hrStat3', getInterviews().length);
  setText('hrStat4', getTrainings().filter(t => t.status === 'active').length);
  setText('appBadge', apps.filter(a => a.status === 'pending').length);
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function renderApplications() {
  const el = document.getElementById('applicationsList');
  if (!el) return;

  const filter     = document.getElementById('appStatusFilter')?.value || 'all';
  const dateFilter = document.getElementById('appDateFilter')?.value   || 'all';
  let apps = getApplications();

  /* Status filter */
  if (filter !== 'all') apps = apps.filter(a => a.status === filter);

  /* Date filter */
  const now = new Date();
  if (dateFilter === 'today') {
    apps = apps.filter(a => new Date(a.appliedAt).toDateString() === now.toDateString());
  } else if (dateFilter === 'week') {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    apps = apps.filter(a => new Date(a.appliedAt) >= weekAgo);
  } else if (dateFilter === 'month') {
    const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
    apps = apps.filter(a => new Date(a.appliedAt) >= monthAgo);
  } else if (dateFilter === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 0);
    apps = apps.filter(a => { const d = new Date(a.appliedAt); return d >= start && d <= end; });
  }

  /* Update count badge */
  const countEl = document.getElementById('appCount');
  if (countEl) countEl.textContent = apps.length + ' application' + (apps.length !== 1 ? 's' : '');

  if (!apps.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:48px;margin-bottom:12px;">📭</div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No applications found</div>
      <div style="font-size:14px;color:var(--light);margin-top:6px;">Share the <a href="../pages/teach-with-us.html" target="_blank" style="color:var(--blue);">Teach With Us</a> page to receive applications.</div>
    </div>`;
    return;
  }

  const statusBadge = {
    pending:     '<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">⏳ Pending</span>',
    shortlisted: '<span style="background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">⭐ Shortlisted</span>',
    interview:   '<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">📅 Interview</span>',
    rejected:    '<span style="background:#fde8e8;color:#c53030;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">❌ Rejected</span>',
    hired:       '<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Hired</span>',
  };

  const thS = 'padding:11px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:12px 14px;vertical-align:middle;font-size:13px;';

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thS}">Applicant</th>
            <th style="${thS}">Contact</th>
            <th style="${thS}">Subjects</th>
            <th style="${thS}">Qualification</th>
            <th style="${thS}">Experience</th>
            <th style="${thS}">Location</th>
            <th style="${thS}">Applied</th>
            <th style="${thS}">Status</th>
            <th style="${thS};text-align:center;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${apps.map((a, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
              <td style="${tdS}">
                <div style="font-weight:800;color:var(--dark);">${a.name}</div>
                <div style="font-size:11px;color:var(--light);">${a.id}</div>
                ${a.linkedin ? `<a href="${a.linkedin}" target="_blank" style="font-size:11px;color:var(--blue);font-weight:700;">LinkedIn ↗</a>` : ''}
              </td>
              <td style="${tdS}">
                <div style="font-weight:700;color:var(--mid);">📧 ${a.email}</div>
                <div style="font-weight:700;color:var(--mid);margin-top:2px;">
                  ${a.phone ? `<a href="https://wa.me/${a.phone.replace(/[\s\-\(\)\+]/g,'')}" target="_blank" style="color:#25D366;font-weight:800;text-decoration:none;">📱 ${a.phone}</a>` : '—'}
                </div>
              </td>
              <td style="${tdS}">
                <div style="font-weight:700;color:var(--mid);">${(a.subjects||[]).join(', ') || '—'}</div>
                <div style="font-size:11px;color:var(--light);">${a.topics || '—'}</div>
              </td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${a.qual || '—'}</td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${a.exp || '0'} yrs</td>
              <td style="${tdS};font-weight:700;color:var(--mid);">${a.country || '—'}</td>
              <td style="${tdS};font-size:12px;color:var(--light);font-weight:700;white-space:nowrap;">
                ${new Date(a.appliedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
              </td>
              <td style="${tdS}">${statusBadge[a.status] || statusBadge.pending}</td>
              <td style="${tdS};text-align:center;">
                <div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;">
                  <button class="ab-btn ab-btn-view"   onclick="viewApplication(${getApplications().indexOf(a)})">👁 View</button>
                  <button class="ab-btn ab-btn-assign" onclick="updateAppStatus(${getApplications().indexOf(a)},'shortlisted')" title="Shortlist">⭐</button>
                  <button class="ab-btn ab-btn-complete" onclick="scheduleInterview(${getApplications().indexOf(a)})" title="Schedule Interview">📅</button>
                  <button class="ab-btn" style="background:var(--green-light);color:var(--green-dark);" onclick="updateAppStatus(${getApplications().indexOf(a)},'hired')" title="Mark Hired">✅</button>
                  <button class="ab-btn" style="background:#fde8e8;color:#c53030;" onclick="updateAppStatus(${getApplications().indexOf(a)},'rejected')" title="Reject">❌</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function exportApplicationsCSV() {
  const apps = getApplications();
  if (!apps.length) { showToast('No applications to export.', 'error'); return; }

  const headers = ['ID','Name','Email','Phone','Country','Qualification','Experience (yrs)',
                   'Subjects','Topics','Age Groups','Hours/Week','Preferred Times','Device',
                   'LinkedIn','Source','Status','Applied At','Bio'];

  const rows = apps.map(a => [
    a.id, a.name, a.email, a.phone || '', a.country || '',
    a.qual || '', a.exp || '0',
    (a.subjects || []).join('; '), a.topics || '',
    (a.ageGroups || []).join('; '), a.hours || '', a.times || '', a.device || '',
    a.linkedin || '', a.source || '', a.status || 'pending',
    new Date(a.appliedAt).toLocaleDateString('en-GB'),
    (a.bio || '').replace(/"/g, '""'),
  ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `stemnest-applications-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Applications exported to CSV!');
}

function viewApplication(idx) {
  const a = getApplications()[idx];
  if (!a) return;
  alert(`Application: ${a.id}\nName: ${a.name}\nEmail: ${a.email}\nSubjects: ${(a.subjects||[]).join(', ')}\nQualification: ${a.qual}\nExperience: ${a.exp} years\nCountry: ${a.country}\nBio: ${a.bio}\nLinkedIn: ${a.linkedin || '—'}`);
}

function updateAppStatus(idx, status) {
  const apps = getApplications();
  if (apps[idx]) {
    const appId = apps[idx].id;
    apps[idx].status = status;
    localStorage.setItem('sn_applications', JSON.stringify(apps));
    /* Also update in real DB */
    updateAppStatusAPI(appId, status);
  }
  renderApplications(); updateHRStats();
  showToast(`✅ Application ${status}!`);
}

function deleteApplication(idx) {
  if (!confirm('Delete this application?')) return;
  const apps = getApplications();
  apps.splice(idx, 1);
  localStorage.setItem('sn_applications', JSON.stringify(apps));
  renderApplications(); updateHRStats();
  showToast('Application deleted.');
}

function scheduleInterview(idx) {
  const a = getApplications()[idx];
  if (!a) return;
  const date = prompt('Interview date (YYYY-MM-DD):');
  const time = prompt('Interview time (e.g. 10:00 AM):');
  if (!date || !time) return;
  const interviews = getInterviews();
  interviews.push({ id: 'INT-' + Date.now().toString(36).toUpperCase(), applicantId: a.id, name: a.name, email: a.email, subjects: a.subjects, date, time, status: 'scheduled', createdAt: new Date().toISOString() });
  localStorage.setItem('sn_interviews', JSON.stringify(interviews));
  updateAppStatus(idx, 'interview');
  showToast(`📅 Interview scheduled for ${a.name} on ${date} at ${time}`);
}

function renderInterviews() {
  const el = document.getElementById('interviewsList');
  if (!el) return;
  const list = getInterviews().sort((a,b) => new Date(a.date) - new Date(b.date));
  if (!list.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No interviews scheduled.</div>'; return; }
  el.innerHTML = list.map(i => `
    <div class="demo-item" style="margin-bottom:12px;">
      <div class="demo-item-time"><div class="demo-item-time-val">${i.time}</div><div class="demo-item-time-label">${i.date}</div></div>
      <div class="demo-item-divider"></div>
      <div class="demo-item-info">
        <div class="demo-item-name">${i.name} <span style="font-size:11px;color:var(--light);">${i.id}</span></div>
        <div class="demo-item-meta">📧 ${i.email} · 📚 ${(i.subjects||[]).join(', ')}</div>
      </div>
      <span class="ab-status ab-scheduled">${capitalise(i.status)}</span>
    </div>`).join('');
}

function openScheduleModal() { showToast('Use the Applications tab to schedule interviews from applications.', 'info'); }

function renderTraining() {
  const el = document.getElementById('trainingList');
  if (!el) return;
  const list = getTrainings();
  if (!list.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No training schedules yet.</div>'; return; }
  el.innerHTML = list.map(t => `
    <div class="demo-item" style="margin-bottom:12px;">
      <div class="demo-item-info">
        <div class="demo-item-name">${t.title}</div>
        <div class="demo-item-meta">👤 ${t.trainee} · 📅 ${t.date} · ⏱ ${t.duration || '—'}</div>
        ${t.notes ? `<div style="font-size:12px;color:var(--mid);margin-top:4px;">${t.notes}</div>` : ''}
      </div>
      <span class="ab-status ${t.status === 'active' ? 'ab-scheduled' : 'ab-completed'}">${capitalise(t.status)}</span>
    </div>`).join('');
}

function openTrainingModal() {
  const trainee  = prompt('Trainee name:');
  const title    = prompt('Training title:');
  const date     = prompt('Date (YYYY-MM-DD):');
  const duration = prompt('Duration (e.g. 2 hours):');
  if (!trainee || !title || !date) return;
  const list = getTrainings();
  list.push({ id: 'TRN-' + Date.now().toString(36).toUpperCase(), trainee, title, date, duration, status: 'active', createdAt: new Date().toISOString() });
  localStorage.setItem('sn_trainings', JSON.stringify(list));
  renderTraining(); updateHRStats();
  showToast(`✅ Training scheduled for ${trainee}!`);
}

function renderAdverts() {
  const el = document.getElementById('advertsList');
  if (!el) return;
  const list = getAdverts();
  if (!list.length) { el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">No adverts posted yet.</div>'; return; }
  const statusClass = { open:'ab-completed', urgent:'ab-pending', closed:'ab-scheduled' };
  el.innerHTML = list.map((a, i) => `
    <div class="demo-item" style="margin-bottom:12px;">
      <div class="demo-item-info">
        <div class="demo-item-name">${a.title}</div>
        <div class="demo-item-meta">📚 ${a.subject} · 💷 ${a.pay || '—'} · Deadline: ${a.deadline || '—'}</div>
        ${a.description ? `<div style="font-size:12px;color:var(--mid);margin-top:4px;">${a.description.slice(0,100)}…</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
        <span class="ab-status ${statusClass[a.status] || 'ab-scheduled'}">${capitalise(a.status)}</span>
        <button class="ab-btn" style="background:var(--orange-light);color:var(--orange-dark);" onclick="deleteAdvert(${i})">🗑 Remove</button>
      </div>
    </div>`).join('');
}

function postAdvert() {
  const title = document.getElementById('adv-title')?.value.trim();
  const desc  = document.getElementById('adv-desc')?.value.trim();
  if (!title || !desc) { showToast('Please enter a title and description.', 'error'); return; }
  const list = getAdverts();
  list.unshift({ id: 'ADV-' + Date.now().toString(36).toUpperCase(), title, subject: document.getElementById('adv-subject')?.value, pay: document.getElementById('adv-pay')?.value.trim(), description: desc, deadline: document.getElementById('adv-deadline')?.value, status: document.getElementById('adv-status')?.value || 'open', createdAt: new Date().toISOString() });
  localStorage.setItem('sn_job_adverts', JSON.stringify(list));
  clearAdvert(); renderAdverts();
  showToast('✅ Job advert posted!');
}

function clearAdvert() {
  ['adv-title','adv-pay','adv-desc','adv-deadline'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function deleteAdvert(idx) {
  if (!confirm('Remove this advert?')) return;
  const list = getAdverts(); list.splice(idx, 1);
  localStorage.setItem('sn_job_adverts', JSON.stringify(list));
  renderAdverts();
}

function capitalise(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : '—'; }

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
  const hr = staff.find(s => s.role === 'hr');
  if (hr) setTimeout(() => checkBirthdayForUser(hr.id, hr.name.split(' ')[0]), 1500);
});
