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
  if (tab === 'applications') renderApplications();
  if (tab === 'interviews')   renderInterviews();
  if (tab === 'training')     renderTraining();
  if (tab === 'adverts')      renderAdverts();
}

function getApplications() { try { return JSON.parse(localStorage.getItem('sn_applications') || '[]'); } catch { return []; } }
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
  const filter = document.getElementById('appStatusFilter')?.value || 'all';
  let apps = getApplications();
  if (filter !== 'all') apps = apps.filter(a => a.status === filter);
  if (!apps.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">No applications yet. Share the Teach With Us page to receive applications.</div>'; return; }

  const statusClass = { pending:'ab-pending', shortlisted:'ab-scheduled', interview:'ab-completed', rejected:'ab-pending' };
  el.innerHTML = apps.map((a, i) => `
    <div class="demo-item" style="margin-bottom:12px;">
      <div class="demo-item-info">
        <div class="demo-item-name">${a.name} <span style="font-size:11px;color:var(--light);">${a.id}</span></div>
        <div class="demo-item-meta">
          📧 ${a.email} · 📱 ${a.phone || '—'} · 🌍 ${a.country || '—'}<br>
          📚 ${(a.subjects || []).join(', ')} · 🎓 ${a.qual || '—'} · ⏱ ${a.exp || '0'} yrs exp<br>
          Applied: ${new Date(a.appliedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
        </div>
        ${a.bio ? `<div style="font-size:12px;color:var(--mid);background:var(--bg);border-radius:8px;padding:6px 10px;margin-top:6px;font-style:italic;">"${a.bio.slice(0,120)}${a.bio.length > 120 ? '…' : ''}"</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
        <span class="ab-status ${statusClass[a.status] || 'ab-pending'}">${capitalise(a.status || 'pending')}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="ab-btn ab-btn-view"   onclick="viewApplication(${i})">👁 View</button>
          <button class="ab-btn ab-btn-assign" onclick="updateAppStatus(${i},'shortlisted')">⭐ Shortlist</button>
          <button class="ab-btn ab-btn-complete" onclick="scheduleInterview(${i})">📅 Interview</button>
          <button class="ab-btn" style="background:var(--orange-light);color:var(--orange-dark);" onclick="updateAppStatus(${i},'rejected')">❌ Reject</button>
          <button class="ab-btn" style="background:#fde8e8;color:#c53030;" onclick="deleteApplication(${i})">🗑 Delete</button>
        </div>
      </div>
    </div>`).join('');
}

function viewApplication(idx) {
  const a = getApplications()[idx];
  if (!a) return;
  alert(`Application: ${a.id}\nName: ${a.name}\nEmail: ${a.email}\nSubjects: ${(a.subjects||[]).join(', ')}\nQualification: ${a.qual}\nExperience: ${a.exp} years\nCountry: ${a.country}\nBio: ${a.bio}\nLinkedIn: ${a.linkedin || '—'}`);
}

function updateAppStatus(idx, status) {
  const apps = getApplications();
  if (apps[idx]) { apps[idx].status = status; localStorage.setItem('sn_applications', JSON.stringify(apps)); }
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
