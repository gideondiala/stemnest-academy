/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — MAIL SYSTEM (mail-system.js)
   Priority 9: Transactional + Bulk Email
   All emails are simulated (logged to sn_email_log).
   Ready for real SMTP wiring when backend is connected.
   Load this on admin-dashboard.html and super-admin.html.
═══════════════════════════════════════════════════════ */

/* ── EMAIL LOG ── */
function logEmail(to, subject, body, type) {
  const log = JSON.parse(localStorage.getItem('sn_email_log') || '[]');
  log.unshift({
    id:      'EMAIL-' + Date.now().toString(36).toUpperCase(),
    to,
    subject,
    body,
    type:    type || 'transactional',
    sentAt:  new Date().toISOString(),
    status:  'simulated',
  });
  localStorage.setItem('sn_email_log', JSON.stringify(log));
  console.log('📧 EMAIL\nTO:', to, '\nSUBJECT:', subject, '\n\n', body);
}

/* ══════════════════════════════════════════════════════
   TRANSACTIONAL EMAILS
   Called automatically by other parts of the system.
══════════════════════════════════════════════════════ */

/* Demo class booked → notify teacher */
function emailDemoBookedToTeacher(booking, teacher) {
  if (!teacher?.email) return;
  const subject = `📅 New Demo Class Assigned — ${booking.studentName}`;
  const body = [
    `Hi ${teacher.name.split(' ')[0]},`,
    '',
    `A new demo class has been assigned to you.`,
    '',
    `Student:   ${booking.studentName}`,
    `Grade:     ${booking.grade || '—'} · Age ${booking.age || '—'}`,
    `Subject:   ${booking.subject}`,
    `Date:      ${booking.date || '—'}`,
    `Time:      ${booking.time || '—'}`,
    `Class Link: ${booking.classLink || 'To be provided'}`,
    '',
    `Parent Email:    ${booking.email}`,
    `Parent WhatsApp: ${booking.whatsapp || '—'}`,
    '',
    booking.notes ? `Notes: ${booking.notes}` : '',
    '',
    `Please ensure you are online and ready 5 minutes before the class starts.`,
    '',
    `StemNest Academy`,
  ].filter(l => l !== undefined).join('\n');
  logEmail(teacher.email, subject, body, 'demo_booked');
  showToast(`📧 Notification sent to ${teacher.name}`, 'info');
}

/* Demo class cancelled → notify teacher */
function emailDemoCancelledToTeacher(booking, teacher, reason) {
  if (!teacher?.email) return;
  const subject = `🚫 Demo Class Cancelled — ${booking.studentName}`;
  const body = [
    `Hi ${teacher.name.split(' ')[0]},`,
    '',
    `The following demo class has been cancelled.`,
    '',
    `Student:  ${booking.studentName}`,
    `Subject:  ${booking.subject}`,
    `Date:     ${booking.date || '—'}`,
    `Time:     ${booking.time || '—'}`,
    '',
    `Reason: ${reason || 'No reason provided'}`,
    '',
    `This slot is now free. Please check your calendar.`,
    '',
    `StemNest Academy`,
  ].join('\n');
  logEmail(teacher.email, subject, body, 'demo_cancelled');
  showToast(`📧 Cancellation notice sent to ${teacher.name}`, 'info');
}

/* Student onboarded → send login details to parent */
function emailLoginDetailsToParent(student) {
  if (!student?.email) return;
  const subject = `🎓 Welcome to StemNest Academy — ${student.name}'s Login Details`;
  const body = [
    `Dear Parent / Guardian,`,
    '',
    `Welcome to StemNest Academy! ${student.name}'s account has been created.`,
    '',
    `LOGIN DETAILS`,
    `─────────────────────────────`,
    `Student Name: ${student.name}`,
    `Student ID:   ${student.id}`,
    `Email:        ${student.email}`,
    `Password:     ${student.password}`,
    '',
    `HOW TO LOG IN`,
    `─────────────────────────────`,
    `1. Go to: https://stemnestacademy.co.uk/pages/login.html`,
    `2. Click "I'm a Student"`,
    `3. Enter the email and password above`,
    `4. Click "Log In & Join Class"`,
    '',
    `Credits purchased: ${student.credits} classes`,
    `Course: ${student.course || student.subject || '—'}`,
    '',
    `We recommend changing the password after first login.`,
    '',
    `If you need help, reply to this email or contact us on WhatsApp.`,
    '',
    `StemNest Academy`,
    `support@stemnestacademy.co.uk`,
  ].join('\n');
  logEmail(student.email, subject, body, 'onboarding');
}

/* ══════════════════════════════════════════════════════
   BULK EMAIL SYSTEM
   Used by Admin and Super Admin dashboards.
══════════════════════════════════════════════════════ */

/* Get recipient list based on filter */
function getBulkRecipients(filter) {
  const recipients = [];

  const teachers     = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
  const salesPersons = JSON.parse(localStorage.getItem('sn_sales_persons') || '[]');
  const staff        = JSON.parse(localStorage.getItem('sn_staff') || '[]');
  const students     = JSON.parse(localStorage.getItem('sn_students') || '[]');
  const bookings     = JSON.parse(localStorage.getItem('sn_bookings') || '[]');

  switch (filter) {
    case 'all_staff':
      teachers.forEach(t => recipients.push({ name: t.name, email: t.email, role: t.subject + ' Teacher' }));
      salesPersons.forEach(s => recipients.push({ name: s.name, email: s.email, role: 'Sales' }));
      staff.forEach(s => recipients.push({ name: s.name, email: s.email, role: s.role }));
      break;
    case 'all_coding_teachers':
      teachers.filter(t => t.subject === 'Coding').forEach(t => recipients.push({ name: t.name, email: t.email, role: 'Coding Teacher' }));
      break;
    case 'all_maths_teachers':
      teachers.filter(t => t.subject === 'Maths').forEach(t => recipients.push({ name: t.name, email: t.email, role: 'Maths Teacher' }));
      break;
    case 'all_sciences_teachers':
      teachers.filter(t => t.subject === 'Sciences').forEach(t => recipients.push({ name: t.name, email: t.email, role: 'Sciences Teacher' }));
      break;
    case 'all_teachers':
      teachers.forEach(t => recipients.push({ name: t.name, email: t.email, role: t.subject + ' Teacher' }));
      break;
    case 'all_students':
      students.forEach(s => recipients.push({ name: s.name, email: s.email, role: 'Student' }));
      // Also include demo students from bookings
      bookings.forEach(b => {
        if (b.email && !recipients.find(r => r.email === b.email)) {
          recipients.push({ name: b.studentName, email: b.email, role: 'Demo Student' });
        }
      });
      break;
    case 'all_coding_students':
      students.filter(s => s.subject === 'Coding').forEach(s => recipients.push({ name: s.name, email: s.email, role: 'Coding Student' }));
      bookings.filter(b => b.subject === 'Coding' && b.email).forEach(b => {
        if (!recipients.find(r => r.email === b.email)) recipients.push({ name: b.studentName, email: b.email, role: 'Demo/Coding Student' });
      });
      break;
    case 'all_maths_students':
      students.filter(s => s.subject === 'Maths').forEach(s => recipients.push({ name: s.name, email: s.email, role: 'Maths Student' }));
      bookings.filter(b => b.subject === 'Maths' && b.email).forEach(b => {
        if (!recipients.find(r => r.email === b.email)) recipients.push({ name: b.studentName, email: b.email, role: 'Demo/Maths Student' });
      });
      break;
    case 'all_sciences_students':
      students.filter(s => s.subject === 'Sciences').forEach(s => recipients.push({ name: s.name, email: s.email, role: 'Sciences Student' }));
      bookings.filter(b => b.subject === 'Sciences' && b.email).forEach(b => {
        if (!recipients.find(r => r.email === b.email)) recipients.push({ name: b.studentName, email: b.email, role: 'Demo/Sciences Student' });
      });
      break;
    case 'students_nigeria':
      bookings.filter(b => (b.country || '').toLowerCase().includes('nigeria') && b.email).forEach(b => {
        if (!recipients.find(r => r.email === b.email)) recipients.push({ name: b.studentName, email: b.email, role: 'Student (Nigeria)' });
      });
      break;
    case 'students_uk':
      bookings.filter(b => (b.country || '').toLowerCase().includes('uk') || (b.country || '').toLowerCase().includes('united kingdom') && b.email).forEach(b => {
        if (!recipients.find(r => r.email === b.email)) recipients.push({ name: b.studentName, email: b.email, role: 'Student (UK)' });
      });
      break;
    case 'students_ghana':
      bookings.filter(b => (b.country || '').toLowerCase().includes('ghana') && b.email).forEach(b => {
        if (!recipients.find(r => r.email === b.email)) recipients.push({ name: b.studentName, email: b.email, role: 'Student (Ghana)' });
      });
      break;
    case 'students_uae':
      bookings.filter(b => (b.country || '').toLowerCase().includes('uae') || (b.country || '').toLowerCase().includes('emirates') && b.email).forEach(b => {
        if (!recipients.find(r => r.email === b.email)) recipients.push({ name: b.studentName, email: b.email, role: 'Student (UAE)' });
      });
      break;
    case 'everyone':
    default:
      teachers.forEach(t => recipients.push({ name: t.name, email: t.email, role: t.subject + ' Teacher' }));
      salesPersons.forEach(s => recipients.push({ name: s.name, email: s.email, role: 'Sales' }));
      staff.forEach(s => recipients.push({ name: s.name, email: s.email, role: s.role }));
      students.forEach(s => recipients.push({ name: s.name, email: s.email, role: 'Student' }));
      bookings.forEach(b => {
        if (b.email && !recipients.find(r => r.email === b.email)) {
          recipients.push({ name: b.studentName, email: b.email, role: 'Demo Student' });
        }
      });
      break;
  }

  // Deduplicate by email
  const seen = new Set();
  return recipients.filter(r => {
    if (!r.email || seen.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });
}

/* Send bulk email */
function sendBulkEmail() {
  const filter  = document.getElementById('bulkFilter')?.value || 'everyone';
  const subject = document.getElementById('bulkSubject')?.value.trim();
  const body    = document.getElementById('bulkBody')?.value.trim();

  if (!subject) { showToast('Please enter an email subject.', 'error'); return; }
  if (!body)    { showToast('Please write the email body.', 'error'); return; }

  const recipients = getBulkRecipients(filter);
  if (!recipients.length) { showToast('No recipients found for this filter.', 'error'); return; }

  // Preview first
  const previewEl = document.getElementById('bulkPreview');
  if (previewEl) {
    previewEl.style.display = 'block';
    previewEl.innerHTML = `
      <div style="background:var(--blue-light);border-radius:12px;padding:16px 20px;margin-bottom:16px;">
        <div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--blue);margin-bottom:8px;">📧 Ready to send to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}</div>
        <div style="font-size:13px;color:var(--mid);font-weight:700;max-height:120px;overflow-y:auto;">
          ${recipients.slice(0, 10).map(r => `${r.name} (${r.email})`).join('<br>')}
          ${recipients.length > 10 ? `<br><em>...and ${recipients.length - 10} more</em>` : ''}
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="confirmBulkSend()">
        🚀 Confirm & Send to ${recipients.length} Recipients
      </button>`;
  }
}

function confirmBulkSend() {
  const filter  = document.getElementById('bulkFilter')?.value || 'everyone';
  const subject = document.getElementById('bulkSubject')?.value.trim();
  const body    = document.getElementById('bulkBody')?.value.trim();
  const recipients = getBulkRecipients(filter);

  // Log one email per recipient
  recipients.forEach(r => {
    const personalised = body.replace(/{name}/gi, r.name.split(' ')[0]);
    logEmail(r.email, subject, personalised, 'bulk');
  });

  // Clear form
  const subEl  = document.getElementById('bulkSubject'); if (subEl) subEl.value = '';
  const bodyEl = document.getElementById('bulkBody');    if (bodyEl) bodyEl.value = '';
  const prevEl = document.getElementById('bulkPreview'); if (prevEl) prevEl.style.display = 'none';

  showToast(`✅ Bulk email sent to ${recipients.length} recipients!`);
}

/* ── INJECT BULK EMAIL TAB into Admin and Super Admin ── */
function injectBulkEmailTab(dashMain) {
  if (!dashMain || document.getElementById('tab-bulk-email')) return;

  const html = `
    <div id="tab-bulk-email" style="display:none;">
      <div class="dash-section-header">
        <div class="dash-section-title">📧 Bulk Email</div>
        <span style="font-size:13px;font-weight:700;color:var(--light);">Send to staff, teachers, or students</span>
      </div>
      <div class="add-teacher-form-wrap">
        <form class="add-teacher-form" onsubmit="return false;">
          <div class="atf-section-title">📬 Compose Email</div>

          <div class="atf-field atf-full" style="margin-bottom:20px;">
            <label style="font-size:13px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:8px;">Send To <span class="req">*</span></label>
            <select id="bulkFilter" style="width:100%;padding:13px 16px;border:2px solid #e8eaf0;border-radius:14px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:700;color:var(--dark);outline:none;background:var(--white);cursor:pointer;appearance:auto;">
              <option value="everyone">🌍 Everyone (All Users)</option>
              <optgroup label="── Staff ──">
                <option value="all_staff">👥 All Staff</option>
                <option value="all_teachers">👩‍🏫 All Teachers</option>
                <option value="all_coding_teachers">💻 All Coding Teachers</option>
                <option value="all_maths_teachers">📐 All Maths Teachers</option>
                <option value="all_sciences_teachers">🔬 All Sciences Teachers</option>
              </optgroup>
              <optgroup label="── Students ──">
                <option value="all_students">🎓 All Students</option>
                <option value="all_coding_students">💻 All Coding Students</option>
                <option value="all_maths_students">📐 All Maths Students</option>
                <option value="all_sciences_students">🔬 All Sciences Students</option>
              </optgroup>
              <optgroup label="── Students by Country ──">
                <option value="students_uk">🇬🇧 Students in UK</option>
                <option value="students_nigeria">🇳🇬 Students in Nigeria</option>
                <option value="students_ghana">🇬🇭 Students in Ghana</option>
                <option value="students_uae">🇦🇪 Students in UAE</option>
              </optgroup>
            </select>
          </div>

          <div class="atf-field atf-full" style="margin-bottom:20px;">
            <label style="font-size:13px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:8px;">Subject <span class="req">*</span></label>
            <input type="text" id="bulkSubject" placeholder="e.g. Important Update from StemNest Academy"
              style="width:100%;padding:13px 16px;border:2px solid #e8eaf0;border-radius:14px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:600;color:var(--dark);outline:none;">
          </div>

          <div class="atf-field atf-full" style="margin-bottom:20px;">
            <label style="font-size:13px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px;">Email Body <span class="req">*</span></label>
            <div style="font-size:12px;color:var(--light);font-weight:700;margin-bottom:8px;">💡 Use <strong>{name}</strong> to personalise with the recipient's first name.</div>
            <textarea id="bulkBody" style="min-height:220px;padding:16px;border:2px solid #e8eaf0;border-radius:14px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:600;color:var(--dark);width:100%;outline:none;resize:vertical;line-height:1.8;" placeholder="Hi {name},

We wanted to share an important update with you...

StemNest Academy"></textarea>
          </div>

          <div class="atf-divider"></div>
          <div class="atf-actions">
            <button type="button" class="btn btn-outline" onclick="document.getElementById('bulkSubject').value='';document.getElementById('bulkBody').value='';document.getElementById('bulkPreview').style.display='none'">🗑 Clear</button>
            <button type="button" class="btn btn-primary" style="font-size:15px;padding:12px 28px;" onclick="sendBulkEmail()">📧 Preview & Send</button>
          </div>
          <div id="bulkPreview" style="display:none;margin-top:20px;"></div>
        </form>
      </div>

      <!-- Email Log -->
      <div class="dash-section-header" style="margin-top:40px;">
        <div class="dash-section-title">📋 Email Log</div>
        <button class="btn btn-outline" style="font-size:13px;" onclick="renderEmailLog()">🔄 Refresh</button>
      </div>
      <div id="emailLogList"></div>
    </div>`;

  dashMain.insertAdjacentHTML('beforeend', html);
}

function renderEmailLog() {
  const el  = document.getElementById('emailLogList');
  if (!el) return;
  const log = JSON.parse(localStorage.getItem('sn_email_log') || '[]')
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
    .slice(0, 50);

  if (!log.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">No emails sent yet.</div>';
    return;
  }

  const typeLabel = { transactional:'📨 Transactional', bulk:'📢 Bulk', demo_booked:'📅 Demo Booked', demo_cancelled:'🚫 Demo Cancelled', onboarding:'🎓 Onboarding', simulated:'📧 Simulated' };
  const thS = 'padding:10px 14px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  const tdS = 'padding:12px 14px;font-size:13px;vertical-align:top;';

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="${thS}">To</th>
            <th style="${thS}">Subject</th>
            <th style="${thS}">Type</th>
            <th style="${thS}">Sent</th>
          </tr>
        </thead>
        <tbody>
          ${log.map((e, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}" onclick="showEmailDetail('${e.id}')" style="cursor:pointer;">
              <td style="${tdS};font-weight:700;color:var(--dark);">${e.to}</td>
              <td style="${tdS};color:var(--mid);">${e.subject}</td>
              <td style="${tdS}"><span style="background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:900;padding:2px 8px;border-radius:50px;">${typeLabel[e.type]||e.type}</span></td>
              <td style="${tdS};font-size:12px;color:var(--light);font-weight:700;">${new Date(e.sentAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function showEmailDetail(emailId) {
  const log   = JSON.parse(localStorage.getItem('sn_email_log') || '[]');
  const email = log.find(e => e.id === emailId);
  if (!email) return;

  const popup = document.createElement('div');
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  popup.innerHTML = `
    <div style="background:var(--white);border-radius:20px;padding:28px;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 16px 60px rgba(0,0,0,.25);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">📧 Email Detail</div>
        <button onclick="this.closest('div[style]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--light);">✕</button>
      </div>
      <div style="background:var(--bg);border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;font-weight:700;color:var(--mid);line-height:1.8;">
        <div><strong>To:</strong> ${email.to}</div>
        <div><strong>Subject:</strong> ${email.subject}</div>
        <div><strong>Sent:</strong> ${new Date(email.sentAt).toLocaleString('en-GB')}</div>
      </div>
      <pre style="background:#1e293b;color:#e2e8f0;padding:16px;border-radius:12px;font-size:12px;line-height:1.7;overflow-x:auto;white-space:pre-wrap;">${email.body}</pre>
      <button onclick="this.closest('div[style]').remove()" class="btn btn-outline" style="margin-top:16px;width:100%;justify-content:center;">Close</button>
    </div>`;
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
  document.body.appendChild(popup);
}
