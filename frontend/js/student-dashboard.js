/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — STUDENT DASHBOARD JS
   Tabs, lessons, projects, quizzes, certificates, PDF.
═══════════════════════════════════════════════════════ */

/* ── STUDENT DATA — populated from API, not hardcoded ── */
const STUDENT = {
  name: '', initials: '', id: '', year: '',
};

/* ── COURSES & PROGRESS ── */
let COURSES = [];

/* ── UPCOMING LESSONS ── */
let LESSONS = [];

/* ── PROJECTS DATA ── */
let pendingProjects = [];
let submittedProjects = [];
let reviewedProjects = [];

/* ── QUIZZES DATA ── */
const QUIZ_QUESTIONS = {};
let pendingQuizzes = [];
let completedQuizzes = [];

/* ── CERTIFICATES DATA ── */
let CERTIFICATES = [];

/* ── STUDENT GLOBAL DATA ── */
window.STUDENT_DATA = {
  profile: null,
  payments: [],
  courses: []
};

document.addEventListener('DOMContentLoaded', () => {
  setGreeting();
  _loadStudentFromAPI().then(() => {
    renderProgressBars();
    renderUpcomingPreview();
    renderLessons();
    renderProjectSection('pending');
    renderPendingQuizzes();
    renderCompletedQuizzes();
    renderCertificates();
    renderPaymentsTab();
    bindModalCloseOnOverlay('projectModalOverlay', closeProjectModal);
    bindModalCloseOnOverlay('quizModalOverlay',    closeQuizModal);
    bindModalCloseOnOverlay('certModalOverlay',    closeCertModal);
    bindModalCloseOnOverlay('profileModalOverlay', closeProfileModal);

    /* If URL has ?topup=1, open payments tab directly */
    if (window.location.search.includes('topup=1')) {
      showTab('payments');
    } else {
      showTab('overview');
    }
  });

  /* Auto-refresh every 90 seconds */
  setInterval(() => {
    _loadStudentFromAPI().then(() => {
      renderProgressBars();
      renderUpcomingPreview();
      /* Only re-render lessons if that tab is currently visible — preserves tab state */
      const lessonsTab = document.getElementById('tab-lessons');
      if (lessonsTab && lessonsTab.style.display !== 'none') {
        renderLessons(); /* _lessonsActiveTab preserved — won't switch tabs */
      }
    });
  }, 90000);
});

/* ── Load student from API ── */
async function _loadStudentFromAPI() {
  try {
    if (typeof isApiAvailable === 'function' && !(await isApiAvailable())) return;
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;
    const res = await fetch('https://api.stemnestacademy.co.uk/api/sync/dashboard/student', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success) {
      window.STUDENT_DATA.payments = data.payments || [];
      window.STUDENT_DATA.profile = data.students?.[0] || null;
      
      // Map API courses to UI COURSES
      COURSES = (data.courses || []).map(c => ({
        id: c.id,
        name: c.name,
        tutor: 'Assigned Tutor',
        progress: 0,
        total: c.num_lessons || 10,
        done: 0,
        color: 'blue'
      }));

      // Map API bookings to UI LESSONS — include both scheduled and completed
      LESSONS = (data.bookings || []).map(b => {
        let dateStr = '—';
        let timeStr = (b.time || '—').replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
        try {
          if (b.date) {
            const d = new Date(b.date);
            dateStr = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
          }
        } catch(e) {}
        return {
          id:              b.id,
          title:           b.pathway_lesson_title || b.lesson_name_full || b.lesson_title_full || b.lesson_name || b.subject || 'Class',
          lessonTitle:     b.pathway_lesson_title || b.lesson_name_full || b.lesson_name || '',
          lessonNumber:    b.lesson_number_in_grade || b.pathway_lesson_number || b.lesson_number || null,
          totalLessons:    b.total_lessons || 72,
          pathwayLessonId: b.pathway_lesson_id || null,
          unitId:          b.unit_id || null,
          date:            dateStr,
          rawDate:         b.date || '',
          time:            timeStr,
          tutor:           b.tutor_name || 'Tutor',
          subject:         b.subject || '',
          duration:        (b.duration_mins || 60) + ' mins',
          status:          b.status || 'scheduled',
          classLink:       b.class_link || '',
          modules:         []
        };
      });

      // Map API projects to UI project arrays
      pendingProjects   = [];
      submittedProjects = [];
      reviewedProjects  = [];
      (data.projects || []).forEach((p, i) => {
        const proj = {
          id:         p.id || i,
          title:      p.title || 'Project',
          course:     p.course_name || '—',
          brief:      p.brief || 'Complete this project as instructed by your tutor.',
          due:        p.due_date ? new Date(p.due_date).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : 'No deadline',
          emoji:      '💻',
          steps:      ['Read the brief carefully', 'Plan your approach', 'Build and test', 'Submit your work'],
          submission: p.submission || '',
          remarks:    p.remarks || '',
          score:      p.score,
          reviewedBy: 'Tutor',
        };
        if (p.status === 'reviewed')   reviewedProjects.push(proj);
        else if (p.status === 'submitted') submittedProjects.push(proj);
        else pendingProjects.push(proj);
      });

      /* Map quiz attempts from API */
      pendingQuizzes   = [];
      completedQuizzes = [];
      (data.quizAttempts || []).forEach(a => {
        completedQuizzes.push({
          id:          a.quiz_id,
          title:       a.unit_name || ('Unit ' + a.unit_number),
          pathway:     a.pathway_name || '—',
          grade:       a.grade_number,
          unit:        a.unit_number,
          score:       a.score,
          total:       a.total,
          percentage:  parseFloat(a.percentage || 0),
          passed:      a.passed,
          passScore:   a.pass_score || 70,
          submittedAt: a.submitted_at,
        });
      });

      /* Map certificates from API */
      CERTIFICATES = (data.certificates || []).map(c => ({
        id:        c.id,
        title:     c.pathway_name || 'STEMNest Pathway',
        grade:     c.grade_number,
        gradeName: c.grade_name || ('Grade ' + c.grade_number),
        issuedAt:  c.issued_at,
        certUrl:   c.certificate_url || null,
      }));

      /* Map enrolments to COURSES with real progress */
      if (data.enrolments && data.enrolments.length > 0) {
        COURSES = data.enrolments.map(e => {
          const total    = parseInt(e.total_lessons || 72);
          const done     = parseInt(e.lessons_completed || 0);
          const progress = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
          return {
            id:       e.id,
            name:     (e.pathway_emoji || '🚀') + ' ' + (e.pathway_name || 'STEMNest Pathway'),
            tutor:    'Assigned Tutor',
            progress,
            total,
            done,
            color:    'blue',
            grade:    e.current_grade,
          };
        });
      }

      if (window.STUDENT_DATA.profile) {
        const s = window.STUDENT_DATA.profile;
        
        // Populate the STUDENT object from real API data
        STUDENT.name = s.name || '';
        STUDENT.year = s.grade || '';
        const rawId = s.id || '';
        const numMatch = rawId.match(/(\d+)$/);
        STUDENT.id = numMatch ? 'S-' + numMatch[1].padStart(4, '0') : (s.staff_id || rawId.slice(0, 8));
        STUDENT.initials = (s.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

        const nameEl = document.getElementById('sidebarName');
        if (nameEl) nameEl.textContent = s.name || '';

        const avatarEl = document.getElementById('sidebarAvatar');
        if (avatarEl) avatarEl.textContent = STUDENT.initials || '—';

        const roleEl = document.getElementById('sidebarRole');
        if (roleEl) roleEl.textContent = 'Student' + (s.grade ? ' · ' + s.grade : '');

        const idEl = document.getElementById('studentIdBadge');
        if (idEl) idEl.textContent = 'ID: ' + STUDENT.id;

        /* Also update nav bar name and greeting */
        const navNameEl = document.getElementById('navStudentName');
        if (navNameEl) navNameEl.textContent = s.name || '';

        const greetingNameEl = document.getElementById('greetingName');
        if (greetingNameEl) greetingNameEl.textContent = (s.name || '').split(' ')[0] || 'there';

        /* Store class_paused globally so Join buttons and banners can read it */
        window._studentClassPaused = s.class_paused === true;
        updateCreditsDisplay(parseInt(s.credits) || 0, s.credits_suspended === true, s.class_paused === true);

        /* Update stat cards with real values */
        const completedBookings = (data.bookings || []).filter(b =>
          b.status === 'completed' || b.status === 'partially_completed'
        );
        const el_classesDone = document.getElementById('statClassesDone');
        if (el_classesDone) el_classesDone.textContent = completedBookings.length;

        const el_courses = document.getElementById('statCoursesEnrolled');
        if (el_courses) el_courses.textContent = COURSES.length || 0;

        const el_projects = document.getElementById('statProjectsPending');
        if (el_projects) el_projects.textContent = pendingProjects.length || 0;

        const el_certs = document.getElementById('statCertificates');
        if (el_certs) el_certs.textContent = CERTIFICATES.length || 0;
      } else {
        updateCreditsDisplay(null, false);
      }
    }
  } catch (e) { console.warn('[STUDENT] API load failed:', e.message); updateCreditsDisplay(null, false); }
}
function updateCreditsDisplay(credits, suspended, classPaused) {
  const statEl  = document.getElementById('statCreditsRemaining');
  const noteEl  = document.getElementById('statCreditsNote');

  /* Store suspension state globally so Join buttons can read it */
  window._studentCreditsSuspended = !!suspended;

  if (statEl) statEl.textContent = credits !== null ? credits : '—';
  if (noteEl) {
    if (credits === null) { noteEl.textContent = 'Class credits'; return; }
    if (suspended || credits <= -2) {
      noteEl.innerHTML = '<span style="color:#7c3aed;font-weight:900;">🔒 Classes paused — top up to resume</span>';
    } else if (credits <= 0) {
      noteEl.innerHTML = '<span style="color:#c53030;font-weight:900;">🔴 No credits — top up urgently</span>';
    } else if (credits === 1) {
      noteEl.innerHTML = '<span style="color:#e65100;font-weight:900;">⚠️ Last class — top up now</span>';
    } else if (credits <= 3) {
      noteEl.innerHTML = '<span style="color:#ffd700;font-weight:900;">⚠️ Low — Top up soon</span>';
    } else {
      noteEl.textContent = credits + ' class' + (credits !== 1 ? 'es' : '') + ' remaining';
    }
  }

  /* Show CLASS PAUSED banner (manual pause by team — different from credit suspension) */
  let pauseBanner = document.getElementById('classPausedBanner');
  if (classPaused) {
    if (!pauseBanner) {
      pauseBanner = document.createElement('div');
      pauseBanner.id = 'classPausedBanner';
      pauseBanner.style.cssText = 'background:#fffbeb;border:2px solid #f59e0b;border-radius:14px;padding:16px 20px;margin:0 0 20px;font-size:14px;color:#92400e;font-weight:700;display:flex;align-items:center;gap:12px;';
      pauseBanner.innerHTML = `
        <span style="font-size:28px;">⏸️</span>
        <div>
          <div style="font-weight:900;font-size:15px;margin-bottom:4px;">Classes are currently on a break</div>
          <div style="font-weight:700;color:#b45309;">Your live classes have been paused. You can still view all your completed lessons, assignments and certificates. When you're ready to return, contact us and we'll set up a new schedule for you.</div>
        </div>`;
      const main = document.querySelector('.dash-main') || document.querySelector('.main-content') || document.body;
      main.insertBefore(pauseBanner, main.firstChild);
    }
    /* Also store globally so Join buttons know to hide */
    window._studentClassPaused = true;
  } else if (pauseBanner) {
    pauseBanner.remove();
    window._studentClassPaused = false;
  }

  /* Show suspension banner if suspended */
  let banner = document.getElementById('creditSuspendedBanner');
  if (suspended || (credits !== null && credits <= -2)) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'creditSuspendedBanner';
      banner.style.cssText = 'background:#f5f3ff;border:2px solid #7c3aed;border-radius:14px;padding:16px 20px;margin:0 0 20px;font-size:14px;color:#5b21b6;font-weight:700;display:flex;align-items:center;gap:12px;';
      banner.innerHTML = `
        <span style="font-size:28px;">🔒</span>
        <div>
          <div style="font-weight:900;font-size:15px;margin-bottom:4px;">Live classes are currently paused</div>
          <div style="font-weight:700;color:#6d28d9;">Your class credits have run out. You can still access all your past lesson materials, assignments and quizzes. Top up to resume live classes.</div>
          <a href="?topup=1" style="display:inline-block;margin-top:10px;background:#7c3aed;color:#fff;text-decoration:none;padding:8px 20px;border-radius:50px;font-weight:900;font-size:13px;">Top Up Credits →</a>
        </div>`;
      /* Insert at top of main content */
      const main = document.querySelector('.dash-main') || document.querySelector('.main-content') || document.body;
      main.insertBefore(banner, main.firstChild);
    }
  } else if (banner) {
    banner.remove();
  }
}

/* ══════════════════════════════════════════════════════
   PAYMENTS TAB — Top-Up + Payment History
══════════════════════════════════════════════════════ */

/* Credit packages offered */
const CREDIT_PACKAGES = [
  { classes: 4,  price: 60,  label: 'Starter',   desc: '4 classes', popular: false, color: '#0e9f6e' },
  { classes: 8,  price: 110, label: 'Standard',  desc: '8 classes', popular: true,  color: '#1a56db' },
  { classes: 12, price: 150, label: 'Value',     desc: '12 classes', popular: false, color: '#7c3aed' },
  { classes: 24, price: 280, label: 'Best Value', desc: '24 classes', popular: false, color: '#e65100' },
];

function renderPaymentsTab() {
  const el = document.getElementById('paymentRecordsContent');
  if (!el) return;

  const profile   = window.STUDENT_DATA?.profile;
  const credits   = profile ? parseInt(profile.credits || 0) : null;
  const suspended = window._studentCreditsSuspended;
  const payments  = window.STUDENT_DATA?.payments || [];

  /* ── Top-up section ── */
  const topUpHtml = `
    <div style="margin-bottom:32px;">
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);margin-bottom:6px;">🎟️ Top Up Credits</div>
      <div style="font-size:14px;color:var(--mid);font-weight:700;margin-bottom:20px;">
        Current balance: <strong>${credits !== null ? credits + ' class' + (credits !== 1 ? 'es' : '') : '—'}</strong>
        ${suspended ? ' &nbsp;·&nbsp; <span style="color:#7c3aed;font-weight:900;">🔒 Classes paused</span>' : ''}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:24px;">
        ${CREDIT_PACKAGES.map(pkg => `
          <div onclick="selectTopUpPackage(${pkg.classes}, ${pkg.price})"
            id="pkg-${pkg.classes}"
            style="border:2px solid ${pkg.popular ? pkg.color : '#e8eaf0'};border-radius:16px;padding:20px 16px;text-align:center;cursor:pointer;transition:.15s;background:${pkg.popular ? pkg.color + '0d' : '#fff'};"
            onmouseover="this.style.borderColor='${pkg.color}';this.style.background='${pkg.color}0d';"
            onmouseout="this.style.borderColor=document.getElementById('pkg-${pkg.classes}').dataset.selected==='1'?'${pkg.color}':'#e8eaf0';this.style.background=document.getElementById('pkg-${pkg.classes}').dataset.selected==='1'?'${pkg.color}0d':'#fff';">
            ${pkg.popular ? `<div style="background:${pkg.color};color:#fff;font-size:10px;font-weight:900;padding:2px 10px;border-radius:50px;display:inline-block;margin-bottom:8px;">MOST POPULAR</div><br>` : '<br>'}
            <div style="font-family:'Fredoka One',cursive;font-size:28px;color:${pkg.color};">${pkg.classes}</div>
            <div style="font-size:12px;font-weight:900;color:var(--mid);margin-bottom:6px;">classes</div>
            <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--dark);">£${pkg.price}</div>
            <div style="font-size:11px;color:var(--light);font-weight:700;">£${(pkg.price / pkg.classes).toFixed(2)}/class</div>
          </div>`).join('')}
      </div>

      <div id="topupSelectedInfo" style="display:none;background:#f0f4ff;border-radius:14px;padding:18px 20px;margin-bottom:16px;">
        <div style="font-weight:800;color:var(--dark);font-size:15px;" id="topupSelectedLabel">—</div>
        <div style="font-size:13px;color:var(--mid);font-weight:700;margin-top:4px;" id="topupSelectedDetail">—</div>
      </div>

      <button id="topupPayBtn" onclick="initiateTopUp()" disabled
        style="background:#e8eaf0;color:#a0aec0;border:none;border-radius:14px;padding:14px 32px;
               font-family:'Nunito',sans-serif;font-weight:900;font-size:15px;cursor:not-allowed;
               width:100%;max-width:340px;display:block;transition:.2s;">
        💳 Select a package above
      </button>

      <div id="topupLinkDisplay" style="margin-top:16px;"></div>
    </div>`;

  /* ── Payment history ── */
  const historyHtml = payments.length
    ? `<div style="font-family:'Fredoka One',cursive;font-size:18px;color:var(--dark);margin-bottom:14px;">📋 Payment History</div>
       <div style="overflow-x:auto;border-radius:14px;border:1.5px solid #e8eaf0;">
         <table style="width:100%;border-collapse:collapse;font-size:13px;">
           <thead>
             <tr style="background:#f7f9ff;border-bottom:2px solid #e8eaf0;">
               <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Date</th>
               <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Amount</th>
               <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Credits</th>
               <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Course</th>
               <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;">Status</th>
             </tr>
           </thead>
           <tbody>
             ${payments.map((p, i) => `
               <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;}'}">
                 <td style="padding:12px 16px;font-size:12px;color:var(--mid);font-weight:700;">${p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
                 <td style="padding:12px 16px;font-weight:800;color:var(--dark);">£${parseFloat(p.amount || 0).toFixed(2)}</td>
                 <td style="padding:12px 16px;font-weight:700;color:var(--mid);">${p.credits_purchased || '—'} class${p.credits_purchased !== 1 ? 'es' : ''}</td>
                 <td style="padding:12px 16px;font-size:12px;color:var(--mid);">${p.course_name || 'StemNest'}</td>
                 <td style="padding:12px 16px;">
                   <span style="background:${p.status === 'confirmed' ? '#d1fae5' : p.status === 'pending' ? '#fff3e0' : '#f3f4f6'};
                                color:${p.status === 'confirmed' ? '#065f46' : p.status === 'pending' ? '#e65100' : '#6b7280'};
                                font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">
                     ${p.status === 'confirmed' ? '✅ Paid' : p.status === 'pending' ? '⏳ Pending' : p.status || '—'}
                   </span>
                 </td>
               </tr>`).join('')}
           </tbody>
         </table>
       </div>`
    : `<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;font-size:14px;">No payment records yet.</div>`;

  el.innerHTML = topUpHtml + historyHtml;

  /* Update the overview paymentLinkSection for low-credits nudge */
  _renderOverviewTopUpNudge(credits, suspended);
}

let _selectedTopUpPackage = null;

function selectTopUpPackage(classes, price) {
  _selectedTopUpPackage = { classes, price };

  /* Visual: highlight selected, deselect others */
  CREDIT_PACKAGES.forEach(pkg => {
    const card = document.getElementById('pkg-' + pkg.classes);
    if (!card) return;
    const isSelected = pkg.classes === classes;
    card.dataset.selected = isSelected ? '1' : '0';
    card.style.borderColor = isSelected ? (CREDIT_PACKAGES.find(p => p.classes === pkg.classes)?.color || 'var(--blue)') : '#e8eaf0';
    card.style.background  = isSelected ? (CREDIT_PACKAGES.find(p => p.classes === pkg.classes)?.color || '#1a56db') + '0d' : '#fff';
  });

  const selectedPkg = CREDIT_PACKAGES.find(p => p.classes === classes);
  const info = document.getElementById('topupSelectedInfo');
  const lbl  = document.getElementById('topupSelectedLabel');
  const det  = document.getElementById('topupSelectedDetail');
  if (info) info.style.display = 'block';
  if (lbl)  lbl.textContent  = `${classes} classes — £${price}`;
  if (det)  det.textContent  = `${selectedPkg?.label || ''} package · £${(price / classes).toFixed(2)} per class · Instant activation after payment`;

  const btn = document.getElementById('topupPayBtn');
  if (btn) {
    btn.disabled = false;
    btn.style.background  = selectedPkg?.color || 'var(--blue)';
    btn.style.color       = '#fff';
    btn.style.cursor      = 'pointer';
    btn.textContent       = `💳 Pay £${price} for ${classes} classes →`;
  }
}

async function initiateTopUp() {
  if (!_selectedTopUpPackage) { showToast('Please select a package first.', 'error'); return; }

  const profile = window.STUDENT_DATA?.profile;
  if (!profile || !profile.email) {
    showToast('Account email not found. Please contact support.', 'error');
    return;
  }

  const btn = document.getElementById('topupPayBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating payment link…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) throw new Error('Not logged in');

    const res = await fetch('https://api.stemnestacademy.co.uk/api/payments/create-link', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId:    profile.id,
        studentName:  profile.name,
        studentEmail: profile.parent_email || profile.email,
        amount:       _selectedTopUpPackage.price,
        currency:     'GBP',
        credits:      _selectedTopUpPackage.classes,
        notes:        `Top-up: ${_selectedTopUpPackage.classes} classes`,
      }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to generate payment link');

    const display = document.getElementById('topupLinkDisplay');
    if (display) {
      display.innerHTML = `
        <div style="background:#f0fdf4;border-radius:14px;padding:20px;border:2px solid #0e9f6e;">
          <div style="font-weight:900;color:#065f46;font-size:15px;margin-bottom:10px;">✅ Your payment link is ready!</div>
          <div style="font-size:13px;color:#4a5568;font-weight:700;margin-bottom:14px;">
            Click the button below to pay securely. Your credits will be added instantly after payment is confirmed.
          </div>
          <a href="${data.paymentUrl}" target="_blank"
            style="display:block;background:#0e9f6e;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-family:'Nunito',sans-serif;font-weight:900;font-size:15px;text-align:center;margin-bottom:10px;">
            🔗 Open Secure Payment Page →
          </a>
          <div style="font-size:11px;color:#a0aec0;font-weight:700;text-align:center;">
            Powered by Fincra · Card, Bank Transfer & USSD accepted · Secure &amp; Encrypted
          </div>
        </div>`;
    }

    showToast('✅ Payment link generated! Click the green button to pay.', 'success');
    if (btn) { btn.disabled = true; btn.textContent = '✅ Payment link ready — see below'; btn.style.background = '#0e9f6e'; }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = `💳 Pay £${_selectedTopUpPackage.price} for ${_selectedTopUpPackage.classes} classes →`; }
  }
}

function _renderOverviewTopUpNudge(credits, suspended) {
  const section = document.getElementById('paymentLinkSection');
  if (!section) return;

  if (credits === null || credits > 3) { section.style.display = 'none'; return; }

  const urgency  = suspended || credits <= 0 ? 'suspended' : credits <= 1 ? 'urgent' : 'low';
  const configs  = {
    suspended: { bg: '#f5f3ff', border: '#7c3aed', icon: '🔒', title: 'Classes paused — top up to resume',   btnColor: '#7c3aed' },
    urgent:    { bg: '#fde8e8', border: '#c53030', icon: '🔴', title: 'Only 1 class left — top up urgently', btnColor: '#c53030' },
    low:       { bg: '#fff3e0', border: '#e65100', icon: '⚠️', title: `${credits} classes remaining — top up soon`, btnColor: '#e65100' },
  };
  const cfg = configs[urgency];

  section.style.display = 'block';
  section.innerHTML = `
    <div style="background:${cfg.bg};border:2px solid ${cfg.border};border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
      <span style="font-size:28px;">${cfg.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:900;color:var(--dark);font-size:14px;">${cfg.title}</div>
        <div style="font-size:12px;color:var(--mid);font-weight:700;margin-top:2px;">Top up now to keep ${STUDENT.name || 'your child'}'s learning uninterrupted.</div>
      </div>
      <button onclick="showTab('payments')"
        style="background:${cfg.btnColor};color:#fff;border:none;border-radius:10px;padding:10px 20px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;white-space:nowrap;">
        Top Up Credits →
      </button>
    </div>`;
}

/* ── Greeting ── */
function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById('greetingTime');
  if (el) el.textContent = h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';
  const dateEl = document.getElementById('dashDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });
}

/* ── TAB SWITCHING ── */
const ALL_TABS = ['overview','lessons','projects','quizzes','certificates','payments','nest','chat','refer'];
function showTab(tab) {
  ALL_TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tab);
  });
  /* Re-render lessons tab on every visit so LESSONS data is always fresh */
  if (tab === 'lessons') renderLessons();
  if (tab === 'refer') loadMyReferrals();
}

/* ── HELPER: bind overlay click to close ── */
function bindModalCloseOnOverlay(overlayId, closeFn) {
  const el = document.getElementById(overlayId);
  el?.addEventListener('click', e => { if (e.target === el) closeFn(); });
}

/* ══════════════════════════════════════════════════════
   OVERVIEW — PROGRESS BARS
══════════════════════════════════════════════════════ */
function renderProgressBars() {
  const el = document.getElementById('progressList');
  if (!el) return;
  if (COURSES.length === 0) {
    el.innerHTML = '<div style="color:var(--light);font-size:14px;padding:20px;">No active courses.</div>';
    return;
  }
  el.innerHTML = COURSES.map(c => `
    <div class="progress-item">
      <div class="progress-top">
        <div class="progress-name">${c.name}</div>
        <div class="progress-pct" style="color:var(--${c.color})">${c.progress}%</div>
      </div>
      <div class="progress-sub">Tutor: ${c.tutor} &nbsp;·&nbsp; ${c.done} of ${c.total} classes done</div>
      <div class="progress-track">
        <div class="progress-fill pf-${c.color}" style="width:${c.progress}%"></div>
      </div>
    </div>
  `).join('');
}

/* ── OVERVIEW — JOIN CLASS CARD + UPCOMING PREVIEW (first 3 lessons) ── */
function renderUpcomingPreview() {
  /* Populate the join class card */
  const cardEl = document.getElementById('joinClassCard');
  if (cardEl) {
    const upcomingOnly = LESSONS.filter(l => l.status === 'scheduled');
    if (upcomingOnly.length === 0) {
      cardEl.innerHTML = '';  /* hide entirely when no classes */
    } else {
      const next = upcomingOnly[0];
      const isLive = next.status === 'live';
      const isSuspended = window._studentCreditsSuspended === true;
      const isPaused    = window._studentClassPaused === true;
      cardEl.className = 'join-class-card';
      cardEl.innerHTML = `
        <div class="jc-left">
          <div class="jc-live-pill">
            ${isPaused
              ? '<span style="color:#b45309;">⏸️ On Break</span>'
              : isSuspended
                ? '<span style="color:#7c3aed;">🔒 Classes Paused</span>'
                : isLive
                  ? '<span class="live-dot"></span> Live Now'
                  : '📅 Next Class'}
          </div>
          <div class="jc-title">${next.title || next.subject || 'Class'}</div>
          <div class="jc-meta">
            <span>👩‍🏫 Tutor: ${next.tutor || '—'}</span>
            <span>🕐 ${next.time || '—'}</span>
            <span>📅 ${next.date || '—'}</span>
          </div>
          ${next.subject ? `<div class="jc-desc">Subject: <strong>${next.subject}</strong></div>` : ''}
        </div>
        <div class="jc-right">
          ${isPaused
            ? `<button class="join-class-btn" disabled style="opacity:.6;cursor:not-allowed;">⏸️ On Break</button>
               <div class="jc-note">Contact us to resume your schedule</div>`
            : `<button class="join-class-btn" onclick="joinClass('${next.classLink || ''}')"
                ${isSuspended ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}>
                🚀 ${isSuspended ? 'Classes Paused' : isLive ? 'Join Class Now' : 'Join When Live'}
               </button>
               <div class="jc-note">${isSuspended ? 'Top up credits to resume' : 'Link opens in a new tab'}</div>`}
        </div>`;
    }
  }

  const el = document.getElementById('upcomingPreview');
  if (!el) return;
  const upcomingOnly = LESSONS.filter(l => l.status === 'scheduled');
  if (upcomingOnly.length === 0) {
    el.innerHTML = '<div style="color:var(--light);font-size:14px;padding:20px;">No upcoming lessons.</div>';
    return;
  }
  el.innerHTML = upcomingOnly.slice(0, 3).map(l => buildSessionItem(l)).join('');
}

function buildSessionItem(l) {
  const isLive      = l.status === 'live';
  const isSuspended = window._studentCreditsSuspended === true;
  const isPaused    = window._studentClassPaused === true;
  let badgeHtml;
  if (isPaused) {
    badgeHtml = `<span style="background:#fffbeb;color:#b45309;font-size:11px;font-weight:900;padding:4px 10px;border-radius:50px;">⏸️ On Break</span>`;
  } else if (isSuspended) {
    badgeHtml = `<span style="background:#f5f3ff;color:#7c3aed;font-size:11px;font-weight:900;padding:4px 10px;border-radius:50px;">🔒 Paused</span>`;
  } else if (isLive) {
    badgeHtml = `<span class="sess-badge sb-live">🔴 Live Now</span><button class="join-btn" onclick="joinClass('${l.classLink || ''}')">Join →</button>`;
  } else {
    badgeHtml = `<span class="sess-badge sb-upcoming">Upcoming</span>`;
  }
  return `
    <div class="session-item${isLive && !isSuspended ? ' live' : ''}">
      <div class="sess-time">
        <div class="sess-time-val">${l.time.split(' ')[0]}</div>
        <div class="sess-time-label">${l.time.split(' ')[1] || ''}</div>
      </div>
      <div class="sess-divider"></div>
      <div class="sess-info">
        <div class="sess-student">${l.title}</div>
        <div class="sess-subject">${l.subject} · ${l.tutor} · ${l.duration} · ${l.date}</div>
      </div>
      ${badgeHtml}
    </div>`;
}

function joinClass(classLink) {
  const link = classLink || 'https://meet.google.com';
  if (window._studentClassPaused) {
    showToast('⏸️ Your classes are currently on a break. Contact us to resume.', 'error');
    return;
  }
  if (window._studentCreditsSuspended) {
    showToast('🔒 Your live classes are paused. Please top up your credits to rejoin.', 'error');
    return;
  }
  showToast('🚀 Opening your live class...', 'info');
  setTimeout(() => window.open(link, '_blank'), 800);
}

/* ══════════════════════════════════════════════════════
   LESSONS TAB — Upcoming + Completed with unit grouping
══════════════════════════════════════════════════════ */
let _lessonsActiveTab = 'upcoming';
let _upcomingLessonsShown = 8; // number currently visible

function renderLessons(tab) {
  if (tab) _lessonsActiveTab = tab;
  if (tab === 'upcoming') _upcomingLessonsShown = 8;
  const el = document.getElementById('lessonsList');
  if (!el) return;

  const upcoming  = LESSONS.filter(l => l.status === 'scheduled');
  const completed = LESSONS.filter(l => l.status === 'completed' || l.status === 'partially_completed');

  /* ── Tab toggle header ── */
  const headerHtml =
    '<div style="display:flex;gap:0;margin-bottom:20px;border-radius:12px;overflow:hidden;border:2px solid #e8eaf0;">' +
      '<button id="tab-upcoming-btn" onclick="renderLessons(\'upcoming\')" ' +
        'style="flex:1;padding:11px;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:14px;cursor:pointer;border:none;' +
        'background:' + (_lessonsActiveTab === 'upcoming' ? 'var(--blue,#1a56db)' : '#fff') + ';' +
        'color:' + (_lessonsActiveTab === 'upcoming' ? '#fff' : 'var(--mid,#4a5568)') + ';">' +
        '📅 Upcoming (' + upcoming.length + ')' +
      '</button>' +
      '<button id="tab-completed-btn" onclick="renderLessons(\'completed\')" ' +
        'style="flex:1;padding:11px;font-family:\'Nunito\',sans-serif;font-weight:900;font-size:14px;cursor:pointer;border:none;border-left:2px solid #e8eaf0;' +
        'background:' + (_lessonsActiveTab === 'completed' ? 'var(--green,#0e9f6e)' : '#fff') + ';' +
        'color:' + (_lessonsActiveTab === 'completed' ? '#fff' : 'var(--mid,#4a5568)') + ';">' +
        '✅ Completed (' + completed.length + ')' +
      '</button>' +
    '</div>';

  if (_lessonsActiveTab === 'upcoming') {
    /* ── UPCOMING LESSONS ── */
    if (upcoming.length === 0) {
      el.innerHTML = headerHtml + '<div class="empty-state">No upcoming lessons scheduled yet.</div>';
      return;
    }
    /* Show _upcomingLessonsShown lessons, with See More button */
    var visibleUpcoming = upcoming.slice(0, _upcomingLessonsShown);
    var cardsHtml = visibleUpcoming.map(function(l, i) {
      var isLive      = l.status === 'live';
      var isSuspended = window._studentCreditsSuspended === true;
      var lessonLabel = l.lessonNumber ? 'Lesson ' + l.lessonNumber + (l.totalLessons ? ' of ' + l.totalLessons : '') : '';
      return '<div class="lesson-card' + (isLive ? ' lesson-live' : '') + '" style="margin-bottom:10px;">' +
        '<div class="lesson-card-left">' +
          '<div class="lesson-info" style="padding:14px 0;">' +
            '<div class="lesson-title" style="font-size:15px;font-weight:900;">' + (l.lessonTitle || l.title) + '</div>' +
            (lessonLabel ? '<div style="font-size:11px;font-weight:800;color:var(--blue);margin-top:2px;">' + lessonLabel + '</div>' : '') +
            '<div class="lesson-meta" style="margin-top:4px;">🕐 ' + l.time + ' &nbsp;·&nbsp; 📅 ' + l.date + '</div>' +
            '<div class="lesson-meta">👩‍🏫 ' + l.tutor + ' &nbsp;·&nbsp; ⏱ ' + l.duration + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="lesson-card-right">' +
          (isLive
            ? '<button class="join-btn" onclick="event.stopPropagation();joinClass(\'' + (l.classLink || '') + '\')">🚀 Join</button>'
            : isSuspended
              ? '<span style="background:#f5f3ff;color:#7c3aed;font-size:11px;font-weight:900;padding:3px 8px;border-radius:50px;">🔒 Paused</span>'
              : '<span class="sess-badge sb-upcoming">Upcoming</span>') +
          '<div style="font-size:11px;color:var(--light);margin-top:6px;text-align:right;">📖 Materials available after class</div>' +
        '</div>' +
      '</div>';
    }).join('');
    /* See More button if there are more lessons */
    var seeMoreBtn = '';
    if (upcoming.length > _upcomingLessonsShown) {
      var remaining = upcoming.length - _upcomingLessonsShown;
      seeMoreBtn = '<div style="text-align:center;margin-top:8px;">' +
        '<button onclick="_upcomingLessonsShown += 8; renderLessons();" ' +
          'style="background:#fff;border:2px solid #e8eaf0;border-radius:12px;padding:11px 28px;' +
          'font-family:\"Nunito\",sans-serif;font-weight:900;font-size:14px;cursor:pointer;color:var(--blue);width:100%;">' +
          '⬇ See ' + Math.min(remaining, 8) + ' More Lessons' +
        '</button>' +
      '</div>';
    }
    el.innerHTML = headerHtml + cardsHtml + seeMoreBtn;

  } else {
    /* ── COMPLETED LESSONS — grouped by unit ── */
    if (completed.length === 0) {
      el.innerHTML = headerHtml + '<div class="empty-state">No completed lessons yet. Your completed lessons will appear here after each class.</div>';
      return;
    }

    /* Group by unit — lessons without a unitId go in "Other" */
    var unitMap = {};
    var unitOrder = [];
    completed.forEach(function(l) {
      var unitKey = l.unitId || 'other';
      if (!unitMap[unitKey]) {
        unitMap[unitKey] = { lessons: [], unitId: l.unitId };
        unitOrder.push(unitKey);
      }
      unitMap[unitKey].lessons.push(l);
    });

    /* Sort each unit's lessons by lesson number */
    unitOrder.forEach(function(k) {
      unitMap[k].lessons.sort(function(a, b) { return (a.lessonNumber || 0) - (b.lessonNumber || 0); });
    });

    /* Fetch unit names from POS_DATA or API (best-effort — fall back to "Unit N") */
    var unitNamesCache = window._studentUnitNames || {};

    var unitsHtml = unitOrder.map(function(unitKey, uIdx) {
      var group       = unitMap[unitKey];
      var unitName    = unitNamesCache[unitKey] || ('Unit ' + (uIdx + 1));
      var lessonsHtml = group.lessons.map(function(l) {
        var lessonLabel = l.lessonNumber ? 'Lesson ' + l.lessonNumber : '';
        return '<div style="display:flex;align-items:center;justify-content:space-between;' +
          'padding:12px 16px;border-bottom:1px solid #f0f2f8;background:#fff;" ' +
          'onmouseover="this.style.background=\'#f7f9ff\'" onmouseout="this.style.background=\'#fff\'">' +
          '<div>' +
            '<div style="font-weight:800;font-size:14px;color:var(--dark);">' + (l.lessonTitle || l.title) + '</div>' +
            (lessonLabel ? '<div style="font-size:11px;font-weight:700;color:var(--light);margin-top:2px;">' + lessonLabel + ' &nbsp;·&nbsp; ' + l.date + '</div>' : '<div style="font-size:11px;color:var(--light);margin-top:2px;">' + l.date + '</div>') +
          '</div>' +
          (l.pathwayLessonId
            ? '<a href="/pages/lesson-materials.html?lessonId=' + l.pathwayLessonId + '&bookingId=' + l.id + '" target="_blank" ' +
                'style="background:var(--blue,#1a56db);color:#fff;text-decoration:none;padding:8px 16px;border-radius:10px;' +
                'font-family:\'Nunito\',sans-serif;font-weight:900;font-size:12px;white-space:nowrap;">📖 View Materials →</a>'
            : '<span style="font-size:11px;color:var(--light);font-weight:700;">No materials</span>') +
        '</div>';
      }).join('');

      return '<div style="margin-bottom:16px;border-radius:14px;overflow:hidden;border:1.5px solid #e8eaf0;">' +
        '<div style="background:var(--bg,#f7f8fc);padding:12px 16px;font-family:\'Fredoka One\',cursive;font-size:15px;color:var(--dark);border-bottom:1.5px solid #e8eaf0;">' +
          '📦 ' + unitName +
        '</div>' +
        lessonsHtml +
      '</div>';
    }).join('');

    el.innerHTML = headerHtml + unitsHtml;

    /* Best-effort: load unit names if we have pathway lesson IDs */
    _loadUnitNames(completed);
  }
}

/* Fetch unit names for completed lessons from the pathway API */
async function _loadUnitNames(completedLessons) {
  try {
    var unitIds = [...new Set(completedLessons.map(l => l.unitId).filter(Boolean))];
    if (!unitIds.length) return;

    var token = localStorage.getItem('sn_access_token');
    if (!token) return;

    var res = await fetch('https://api.stemnestacademy.co.uk/api/pathways/units-by-ids?' + unitIds.map(id => 'ids[]=' + id).join('&'), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    var data = await res.json();
    var names = {};
    (data.units || []).forEach(function(u) { names[u.id] = 'Unit ' + u.unit_number + (u.name ? ' — ' + u.name : ''); });
    if (Object.keys(names).length) {
      window._studentUnitNames = names;
      /* Re-render completed tab with real unit names */
      if (_lessonsActiveTab === 'completed') renderLessons('completed');
    }
  } catch(e) { /* silent — unit names are cosmetic */ }
}

function showModules(idx) {
  const l = LESSONS[idx];
  const panel = document.getElementById('modulePanel');
  if (!panel) return;

  // Highlight selected lesson card
  document.querySelectorAll('.lesson-card').forEach((c, i) => {
    c.classList.toggle('lesson-selected', i === idx);
  });

  panel.innerHTML = `
    <div class="module-panel-header">
      <div class="module-panel-title">${l.title}</div>
      <div class="module-panel-sub">${l.date} · ${l.time}</div>
    </div>
    <div class="module-list">
      ${l.modules.map(m => `
        <div class="module-item${m.done ? ' mod-done' : ''}${m.current ? ' mod-current' : ''}">
          <div class="mod-icon">${m.done ? '✅' : m.current ? '▶️' : '⬜'}</div>
          <div class="mod-text">
            <div class="mod-num">Module ${m.num}</div>
            <div class="mod-title">${m.title}</div>
          </div>
          ${m.current ? '<span class="mod-badge">Current</span>' : ''}
          ${m.done    ? '<span class="mod-badge mod-done-badge">Done</span>' : ''}
        </div>
      `).join('')}
    </div>`;
}

/* ══════════════════════════════════════════════════════
   PROJECTS TAB — Toggle sections with pagination
══════════════════════════════════════════════════════ */
const PROJ_PAGE_SIZE = 10;
const _projPage = { pending: 0, submitted: 0, reviewed: 0 };

function showProjectSection(section) {
  ['pending','submitted','reviewed'].forEach(s => {
    const sec = document.getElementById('projSection-' + s);
    const btn = document.getElementById('projToggle-' + s);
    if (sec) sec.style.display = s === section ? 'block' : 'none';
    if (btn) {
      btn.classList.toggle('proj-toggle-active', s === section);
      // Fix count badge color
      const span = btn.querySelector('span');
      if (span) span.style.background = s === section ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.08)';
    }
  });
  _projPage[section] = 0;
  renderProjectSection(section);
}

function renderProjectSection(section) {
  if (section === 'pending')   renderPendingProjects();
  if (section === 'submitted') renderSubmittedProjects();
  if (section === 'reviewed')  renderReviewedProjects();
}

function loadMoreProjects(section) {
  _projPage[section]++;
  renderProjectSection(section);
}

function renderPendingProjects() {
  const el = document.getElementById('pendingProjects');
  const moreEl = document.getElementById('pendingLoadMore');
  const countEl = document.getElementById('projPendingCount');
  if (!el) return;

  if (countEl) countEl.textContent = pendingProjects.length;
  const badge = document.getElementById('projBadge');
  if (badge) badge.textContent = pendingProjects.length;

  if (pendingProjects.length === 0) {
    el.innerHTML = '<div class="empty-state">🎉 All projects submitted! Great work.</div>';
    if (moreEl) moreEl.style.display = 'none';
    return;
  }

  const page  = _projPage.pending || 0;
  const slice = pendingProjects.slice(0, (page + 1) * PROJ_PAGE_SIZE);
  el.innerHTML = slice.map(p => `
    <div class="student-proj-card" onclick="openProjectModal(${p.id})">
      <div class="spc-emoji">${p.emoji}</div>
      <div class="spc-info">
        <div class="spc-title">${p.title}</div>
        <div class="spc-meta">${p.course} &nbsp;·&nbsp; Due: ${p.due}</div>
      </div>
      <div class="spc-arrow">›</div>
    </div>
  `).join('');

  if (moreEl) moreEl.style.display = slice.length < pendingProjects.length ? 'block' : 'none';
}

function renderSubmittedProjects() {
  const el = document.getElementById('submittedProjects');
  const moreEl = document.getElementById('submittedLoadMore');
  const countEl = document.getElementById('projSubmittedCount');
  if (!el) return;

  if (countEl) countEl.textContent = submittedProjects.length;

  if (submittedProjects.length === 0) {
    el.innerHTML = '<div class="empty-state" style="color:var(--light);">No submissions yet.</div>';
    if (moreEl) moreEl.style.display = 'none';
    return;
  }

  const page  = _projPage.submitted || 0;
  const slice = submittedProjects.slice(0, (page + 1) * PROJ_PAGE_SIZE);
  el.innerHTML = slice.map(p => `
    <div class="student-proj-card submitted-card">
      <div class="spc-emoji">${p.emoji}</div>
      <div class="spc-info">
        <div class="spc-title">${p.title}</div>
        <div class="spc-meta">${p.course} &nbsp;·&nbsp; Submitted ✓</div>
      </div>
      <span class="proj-badge pb-reviewed">Submitted ✓</span>
    </div>
  `).join('');

  if (moreEl) moreEl.style.display = slice.length < submittedProjects.length ? 'block' : 'none';
}

function renderReviewedProjects() {
  const el = document.getElementById('reviewedProjects');
  const moreEl = document.getElementById('reviewedLoadMore');
  const countEl = document.getElementById('projReviewedCount');
  if (!el) return;

  if (countEl) countEl.textContent = reviewedProjects.length;

  if (reviewedProjects.length === 0) {
    el.innerHTML = '<div class="empty-state" style="color:var(--light);">No reviewed projects yet.</div>';
    if (moreEl) moreEl.style.display = 'none';
    return;
  }

  const page  = _projPage.reviewed || 0;
  const slice = reviewedProjects.slice(0, (page + 1) * PROJ_PAGE_SIZE);
  el.innerHTML = slice.map(p => `
    <div class="student-proj-card reviewed-card" style="border-left:4px solid var(--green);">
      <div class="spc-emoji">${p.emoji}</div>
      <div class="spc-info">
        <div class="spc-title">${p.title}</div>
        <div class="spc-meta">${p.course} &nbsp;·&nbsp; Reviewed by ${p.reviewedBy || 'Tutor'}</div>
        ${p.remarks ? `<div style="font-size:12px;color:var(--mid);margin-top:4px;font-style:italic;">"${p.remarks}"</div>` : ''}
        ${p.score !== undefined ? `<div style="font-size:12px;font-weight:900;color:var(--green);margin-top:4px;">Score: ${p.score}/100 &nbsp;·&nbsp; +${p.score} pts</div>` : ''}
      </div>
      <span class="proj-badge" style="background:var(--green-light);color:var(--green-dark);">⭐ Reviewed</span>
    </div>
  `).join('');

  if (moreEl) moreEl.style.display = slice.length < reviewedProjects.length ? 'block' : 'none';
}

/* ── PROJECT MODAL ── */
let activeProjectId = null;

function openProjectModal(id) {
  const p = pendingProjects.find(x => x.id === id);
  if (!p) return;
  activeProjectId = id;

  document.getElementById('projModalTitle').textContent = `${p.emoji} ${p.title}`;
  document.getElementById('projModalMeta').innerHTML =
    `<span>📚 ${p.course}</span><span>📅 Due: ${p.due}</span>`;
  document.getElementById('projModalBrief').innerHTML =
    `<div class="proj-brief-label">📋 Project Brief</div><p>${p.brief}</p>`;
  document.getElementById('projModalSteps').innerHTML = `
    <div class="proj-brief-label">🪜 How to Approach This</div>
    <ol class="proj-steps-list">
      ${p.steps.map(s => `<li>${s}</li>`).join('')}
    </ol>`;
  document.getElementById('projSubmitText').value = '';
  document.getElementById('projectModalOverlay').classList.add('open');
}

function closeProjectModal() {
  document.getElementById('projectModalOverlay').classList.remove('open');
  activeProjectId = null;
}

function submitProject() {
  const text = document.getElementById('projSubmitText').value.trim();
  if (!text) { showToast('Please write your submission before submitting.', 'error'); return; }

  const idx = pendingProjects.findIndex(x => x.id === activeProjectId);
  if (idx === -1) return;

  const project = pendingProjects.splice(idx, 1)[0];
  submittedProjects.push({ ...project, submission: text, submittedAt: new Date().toISOString() });

  // Submit to API
  const token = localStorage.getItem('sn_access_token');
  if (token && project.id) {
    fetch('https://api.stemnestacademy.co.uk/api/projects/' + project.id + '/submit', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ submission: text })
    }).catch(e => console.warn('[Student] Project submit API failed:', e.message));
  }

  closeProjectModal();
  renderPendingProjects();
  renderSubmittedProjects();
  showToast('✅ Project submitted! Your tutor will review it soon.');
}

/* ══════════════════════════════════════════════════════
   QUIZZES TAB
══════════════════════════════════════════════════════ */
function renderPendingQuizzes() {
  const el = document.getElementById('pendingQuizzes');
  if (!el) return;
  if (pendingQuizzes.length === 0) {
    el.innerHTML = '<div class="empty-state">🎉 No pending quizzes right now. Complete more lessons to unlock unit quizzes!</div>';
    const badge = document.getElementById('quizBadge');
    if (badge) badge.textContent = '0';
    return;
  }
  el.innerHTML = pendingQuizzes.map(q => `
    <div class="quiz-card" onclick="openQuiz('${q.id}')">
      <div class="qc-emoji">🧠</div>
      <div class="qc-info">
        <div class="qc-title">${q.title}</div>
        <div class="qc-meta">${q.pathway || '—'} · Grade ${q.grade || '—'} · ${q.total || 40} questions · Pass: ${q.passScore || 70}%</div>
      </div>
      <button class="btn btn-blue" style="font-size:13px;padding:8px 18px;" onclick="event.stopPropagation();openQuiz('${q.id}')">Start Quiz →</button>
    </div>
  `).join('');
  const badge = document.getElementById('quizBadge');
  if (badge) badge.textContent = pendingQuizzes.length;
}

function renderCompletedQuizzes() {
  const el = document.getElementById('completedQuizzes');
  if (!el) return;
  if (completedQuizzes.length === 0) {
    el.innerHTML = '<div class="empty-state" style="color:var(--light);">No completed quizzes yet.</div>';
    return;
  }
  el.innerHTML = completedQuizzes.map(q => {
    const pct   = parseFloat(q.percentage || 0);
    const color = pct >= 90 ? '#0e9f6e' : pct >= (q.passScore || 70) ? '#1a56db' : '#e65100';
    const label = pct >= 90 ? '🌟 Excellent' : pct >= (q.passScore || 70) ? '✅ Passed' : '❌ Not Passed';
    const date  = q.submittedAt ? new Date(q.submittedAt).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '—';
    return `
      <div class="quiz-card completed-quiz">
        <div class="qc-emoji">🏆</div>
        <div class="qc-info">
          <div class="qc-title">${q.title}</div>
          <div class="qc-meta">${q.pathway || '—'} · Grade ${q.grade || '—'} · ${date}</div>
        </div>
        <div class="qc-score">
          <div class="qc-score-val" style="color:${color};">${q.score}/${q.total}</div>
          <div class="qc-score-label">${pct.toFixed(0)}% · ${label}</div>
        </div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════
   QUIZ PORTAL — Gamified, API-driven
   Loads questions from /api/quizzes/:id
   Submits answers to /api/quizzes/:id/attempt
══════════════════════════════════════════════════════ */
let activeQuizId    = null;
let quizQuestions   = [];   // full questions from API (no answers)
let currentQuestion = 0;
let quizAnswers     = [];
let quizStartTime   = null;

async function openQuiz(quizId) {
  activeQuizId = quizId;
  const token = localStorage.getItem('sn_access_token');

  /* Show loading state */
  const portal = document.getElementById('quizPortal');
  if (portal) portal.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">⏳ Loading quiz…</div>';
  document.getElementById('quizModalTitle').textContent = '🧠 Loading Quiz…';
  document.getElementById('quizModalOverlay').classList.add('open');

  try {
    const res  = await fetch('https://api.stemnestacademy.co.uk/api/quizzes/' + quizId, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const data = await res.json();
    if (!data.success) {
      if (portal) portal.innerHTML = '<div style="text-align:center;padding:40px;color:#c53030;font-weight:700;">⚠️ Could not load quiz. Please try again.</div>';
      return;
    }

    const quiz = data.quiz;

    /* If already attempted, show previous score */
    if (quiz.already_attempted && quiz.previous_attempt) {
      const prev = quiz.previous_attempt;
      const pct  = parseFloat(prev.percentage || 0);
      if (portal) portal.innerHTML = `
        <div style="text-align:center;padding:32px 20px;">
          <div style="font-size:56px;margin-bottom:12px;">${pct >= (quiz.pass_score || 70) ? '🏆' : '💪'}</div>
          <div style="font-family:'Fredoka One',cursive;font-size:24px;color:var(--dark);margin-bottom:8px;">You already completed this quiz</div>
          <div style="font-size:15px;color:var(--mid);margin-bottom:20px;">
            Your score: <strong>${prev.score}/${prev.total} (${pct.toFixed(0)}%)</strong> ·
            ${pct >= (quiz.pass_score || 70) ? '<span style="color:#0e9f6e;font-weight:800;">✅ Passed</span>' : '<span style="color:#e65100;font-weight:800;">Retry available</span>'}
          </div>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-outline" onclick="closeQuizModal()">Close</button>
            <button class="btn btn-primary" onclick="_startQuiz(${JSON.stringify(quiz).replace(/"/g,'&quot;')})">🔄 Retake Quiz</button>
          </div>
        </div>`;
      document.getElementById('quizModalTitle').textContent = '🧠 ' + (quiz.unit_name || 'Quiz');
      return;
    }

    _startQuiz(quiz);
  } catch (e) {
    if (portal) portal.innerHTML = '<div style="text-align:center;padding:40px;color:#c53030;font-weight:700;">⚠️ Network error. Please check your connection.</div>';
  }
}

function _startQuiz(quiz) {
  quizQuestions   = quiz.questions || [];
  currentQuestion = 0;
  quizAnswers     = new Array(quizQuestions.length).fill(null);
  quizStartTime   = Date.now();
  document.getElementById('quizModalTitle').textContent = '🧠 ' + (quiz.unit_name || 'Quiz') + ' (' + quizQuestions.length + ' questions)';
  _renderQuestion();
}

function closeQuizModal() {
  document.getElementById('quizModalOverlay').classList.remove('open');
  activeQuizId = null;
}

function _renderQuestion() {
  const total = quizQuestions.length;
  const q     = quizQuestions[currentQuestion];
  const pct   = Math.round(((currentQuestion + 1) / total) * 100);
  const answered = quizAnswers.filter(a => a !== null).length;

  const portal = document.getElementById('quizPortal');
  if (!portal || !q) return;

  /* Progress bar */
  const progText = document.getElementById('quizProgressText');
  const progFill = document.getElementById('quizProgressFill');
  if (progText) progText.textContent = `Q ${currentQuestion + 1} / ${total}  ·  ${answered} answered`;
  if (progFill)  progFill.style.width = pct + '%';

  const letters = ['A', 'B', 'C', 'D'];
  portal.innerHTML = `
    <div style="margin-bottom:8px;">
      <div style="font-size:12px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Question ${currentQuestion + 1} of ${total}</div>
    </div>
    <div style="font-size:17px;font-weight:800;color:var(--dark);line-height:1.6;margin-bottom:24px;min-height:60px;">${q.q}</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px;">
      ${(q.options || []).map((opt, i) => {
        const selected = quizAnswers[currentQuestion] === i;
        return `<button onclick="selectAnswer(${i})"
          style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:12px;
                 border:2px solid ${selected ? 'var(--blue)' : '#e8eaf0'};
                 background:${selected ? 'var(--blue-light)' : 'var(--white)'};
                 cursor:pointer;text-align:left;font-family:'Nunito',sans-serif;
                 font-size:14px;font-weight:${selected ? '800' : '600'};color:var(--dark);
                 transition:.15s;"
          onmouseover="if(${!selected}){this.style.borderColor='var(--blue)';this.style.background='#f0f4ff';}"
          onmouseout="if(${!selected}){this.style.borderColor='#e8eaf0';this.style.background='var(--white)';}">
          <span style="width:28px;height:28px;border-radius:8px;background:${selected ? 'var(--blue)' : 'var(--bg)'};
                       color:${selected ? '#fff' : 'var(--mid)'};font-weight:900;font-size:13px;
                       display:flex;align-items:center;justify-content:center;flex-shrink:0;">${letters[i]}</span>
          ${opt}
        </button>`;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <button class="btn btn-outline" onclick="quizNav(-1)" ${currentQuestion === 0 ? 'disabled style="opacity:.4;"' : ''}>← Back</button>
      <span style="font-size:12px;color:var(--light);font-weight:700;">${answered}/${total} answered</span>
      ${currentQuestion < total - 1
        ? `<button class="btn btn-blue" onclick="quizNav(1)">Next →</button>`
        : `<button class="btn btn-primary" onclick="submitQuiz()" style="background:var(--green);">Submit Quiz ✦</button>`}
    </div>`;
}

function selectAnswer(optIdx) {
  quizAnswers[currentQuestion] = optIdx;
  _renderQuestion();
}

function quizNav(dir) {
  const next = currentQuestion + dir;
  if (next >= 0 && next < quizQuestions.length) {
    currentQuestion = next;
    _renderQuestion();
  }
}

async function submitQuiz() {
  const unanswered = quizAnswers.filter(a => a === null).length;
  if (unanswered > 0) {
    showToast(`${unanswered} question${unanswered > 1 ? 's' : ''} still unanswered. Please answer all ${quizQuestions.length} questions before submitting.`, 'error');
    return;
  }

  const token  = localStorage.getItem('sn_access_token');
  const portal = document.getElementById('quizPortal');
  if (portal) portal.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">⏳ Submitting your answers…</div>';

  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/quizzes/' + activeQuizId + '/attempt', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ answers: quizAnswers }),
    });
    const data = await res.json();
    if (!data.success) {
      showToast('Could not save quiz result. Please try again.', 'error');
      if (portal) portal.innerHTML = ''; _renderQuestion();
      return;
    }

    const r      = data.result;
    const pct    = parseFloat(r.percentage || 0);
    const passed = r.passed;
    const emoji  = pct >= 90 ? '🌟' : pct >= 70 ? '🏆' : pct >= 50 ? '👍' : '💪';
    const msg    = pct >= 90 ? 'Outstanding!' : pct >= 70 ? 'Well done!' : pct >= 50 ? 'Good effort!' : 'Keep practising!';

    /* Show gamified results screen */
    if (portal) portal.innerHTML = `
      <div style="text-align:center;padding:20px 16px;">
        <div style="font-size:64px;margin-bottom:8px;animation:pulse 1s ease-in-out infinite;">${emoji}</div>
        <div style="font-family:'Fredoka One',cursive;font-size:28px;color:var(--dark);margin-bottom:4px;">${msg}</div>
        <div style="font-size:16px;color:var(--mid);margin-bottom:20px;">
          ${passed
            ? '<span style="color:#0e9f6e;font-weight:900;font-size:18px;">✅ PASSED</span>'
            : '<span style="color:#e65100;font-weight:900;font-size:18px;">Try again to pass</span>'}
        </div>
        <div style="background:var(--bg);border-radius:20px;padding:24px;margin-bottom:20px;display:inline-block;min-width:200px;">
          <div style="font-family:'Fredoka One',cursive;font-size:52px;color:${passed ? '#0e9f6e' : '#e65100'};line-height:1;">${r.score}</div>
          <div style="font-size:15px;color:var(--mid);font-weight:700;">out of ${r.total} correct</div>
          <div style="font-size:22px;font-weight:900;color:var(--dark);margin-top:8px;">${pct.toFixed(0)}%</div>
        </div>

        <!-- Per-question breakdown (collapsible) -->
        <details style="text-align:left;margin-bottom:20px;">
          <summary style="cursor:pointer;font-weight:800;color:var(--blue);font-size:14px;padding:8px 0;">📋 See question breakdown</summary>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;">
            ${(r.breakdown || []).map((b, i) => `
              <div style="background:${b.isRight ? '#f0fdf4' : '#fff5f5'};border-radius:10px;padding:10px 14px;font-size:13px;border-left:3px solid ${b.isRight ? '#0e9f6e' : '#c53030'};">
                <div style="font-weight:800;color:var(--dark);margin-bottom:4px;">${i + 1}. ${b.q}</div>
                <div style="color:${b.isRight ? '#065f46' : '#c53030'};font-weight:700;">
                  ${b.isRight ? '✅ Correct' : '❌ Your answer: ' + (b.options[b.selected] || '—') + ' · Correct: ' + (b.options[b.correct] || '—')}
                </div>
              </div>`).join('')}
          </div>
        </details>

        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-outline" onclick="closeQuizModal()">Close</button>
          ${!passed ? `<button class="btn btn-primary" onclick="openQuiz('${activeQuizId}')">🔄 Retake</button>` : ''}
        </div>
      </div>`;

    /* Update local completed quizzes list */
    const attempt = {
      id:          activeQuizId,
      title:       document.getElementById('quizModalTitle').textContent.replace('🧠 ', '').split(' (')[0],
      pathway:     '—',
      score:       r.score,
      total:       r.total,
      percentage:  r.percentage,
      passed:      r.passed,
      submittedAt: r.submitted_at,
    };
    const existIdx = completedQuizzes.findIndex(q => q.id === activeQuizId);
    if (existIdx !== -1) completedQuizzes[existIdx] = attempt;
    else completedQuizzes.unshift(attempt);

    renderCompletedQuizzes();
  } catch (e) {
    showToast('Network error while submitting quiz.', 'error');
  }
}

/* ══════════════════════════════════════════════════════
   CERTIFICATES TAB
══════════════════════════════════════════════════════ */
function renderCertificates() {
  const grid  = document.getElementById('certGrid');
  const empty = document.getElementById('certEmpty');
  const count = document.getElementById('certCount');
  if (!grid) return;

  if (!CERTIFICATES || CERTIFICATES.length === 0) {
    if (grid)  grid.style.display  = 'none';
    if (empty) empty.style.display = 'block';
    if (count) count.textContent   = '0 earned';
    return;
  }

  if (grid)  grid.style.display  = '';
  if (empty) empty.style.display = 'none';
  if (count) count.textContent   = CERTIFICATES.length + ' earned';

  grid.innerHTML = CERTIFICATES.map(c => {
    const issued = c.issuedAt
      ? new Date(c.issuedAt).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'})
      : '—';
    return `
      <div class="cert-card" style="border:2px solid #e8eaf0;border-radius:20px;overflow:hidden;background:var(--white);box-shadow:0 4px 20px rgba(0,0,0,.07);transition:.2s;"
           onmouseover="this.style.borderColor='var(--blue)';this.style.transform='translateY(-4px)'"
           onmouseout="this.style.borderColor='#e8eaf0';this.style.transform=''">
        <div style="background:linear-gradient(135deg,#1a56db,#0e9f6e);padding:28px 24px;text-align:center;">
          <div style="font-size:48px;margin-bottom:8px;">🏆</div>
          <div style="font-size:11px;font-weight:900;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1px;">Certificate of Completion</div>
        </div>
        <div style="padding:20px 22px;text-align:center;">
          <div style="font-family:'Fredoka One',cursive;font-size:17px;color:var(--dark);margin-bottom:4px;">${c.title}</div>
          <div style="font-size:13px;font-weight:800;color:var(--blue);margin-bottom:4px;">${c.gradeName || ('Grade ' + c.grade)}</div>
          <div style="font-size:11px;color:var(--light);font-weight:700;margin-bottom:16px;">Issued: ${issued}</div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button onclick="previewCert('${c.id}')"
              style="background:var(--bg);border:1.5px solid #e8eaf0;border-radius:10px;padding:8px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;color:var(--mid);">
              👁 Preview
            </button>
            <button onclick="downloadCertById('${c.id}')"
              style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
              ⬇ Download
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ── CERTIFICATE PREVIEW MODAL ── */
let activeCertId = null;

function previewCert(id) {
  activeCertId = id;
  const c = CERTIFICATES.find(x => x.id === id);
  if (!c) return;
  renderCertDoc(c);
  document.getElementById('certModalOverlay').classList.add('open');
}

function closeCertModal() {
  document.getElementById('certModalOverlay').classList.remove('open');
  activeCertId = null;
}

function renderCertDoc(c) {
  const issued  = c.issuedAt
    ? new Date(c.issuedAt).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'})
    : new Date().toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});
  const bgUrl   = '../assets/images/certificate-bg.png';
  const certId  = c.id ? c.id.slice(0, 8).toUpperCase() : '——';

  document.getElementById('certificateDoc').innerHTML = `
    <div id="certPrintArea" style="
      position:relative;
      width:100%;
      aspect-ratio:1414/1000;
      background:url('${bgUrl}') center/cover no-repeat;
      border-radius:12px;
      overflow:hidden;
      font-family:'Nunito',sans-serif;
    ">
      <!-- Overlay text — positioned over the template -->
      <div style="
        position:absolute;
        inset:0;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        text-align:center;
        padding:6% 12%;
      ">
        <!-- Student name — large, prominent -->
        <div style="
          font-family:'Fredoka One',cursive;
          font-size:clamp(22px,4vw,44px);
          color:#1a3a6b;
          margin-bottom:1.5%;
          letter-spacing:1px;
        ">${STUDENT.name}</div>

        <!-- "has successfully completed" -->
        <div style="
          font-size:clamp(10px,1.6vw,18px);
          color:#4a5568;
          font-weight:600;
          margin-bottom:1%;
        ">has successfully completed</div>

        <!-- Pathway + Grade -->
        <div style="
          font-family:'Fredoka One',cursive;
          font-size:clamp(14px,2.2vw,26px);
          color:#1a56db;
          margin-bottom:0.6%;
        ">${c.title || 'STEMNest Pathway'}</div>
        <div style="
          font-size:clamp(10px,1.4vw,16px);
          color:#4a5568;
          font-weight:700;
          margin-bottom:2.5%;
        ">${c.gradeName || ('Grade ' + c.grade)}</div>

        <!-- Issued date -->
        <div style="
          font-size:clamp(9px,1.2vw,14px);
          color:#718096;
          font-weight:700;
        ">Issued: ${issued} &nbsp;·&nbsp; Certificate ID: ${certId}</div>

        <!-- Student ID -->
        <div style="
          font-size:clamp(8px,1vw,12px);
          color:#a0aec0;
          font-weight:700;
          margin-top:0.6%;
        ">Student ID: ${STUDENT.id || '—'} &nbsp;·&nbsp; StemNest Academy Ltd · Registered in England &amp; Wales</div>
      </div>
    </div>`;
}

function downloadCert() {
  if (activeCertId) downloadCertById(activeCertId);
}

function downloadCertById(id) {
  const c = CERTIFICATES.find(x => x.id === id);
  if (!c) return;

  renderCertDoc(c);
  document.getElementById('certModalOverlay').classList.add('open');

  showToast('📄 Opening print dialog — choose "Save as PDF"');
  setTimeout(() => {
    const issued  = c.issuedAt
      ? new Date(c.issuedAt).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'})
      : new Date().toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});
    const certId  = c.id ? c.id.slice(0, 8).toUpperCase() : '——';
    const bgUrl   = window.location.origin + '/assets/images/certificate-bg.png';

    const printWin = window.open('', '_blank', 'width=1100,height=800');
    printWin.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Certificate — ${STUDENT.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; }
  body {
    font-family:'Nunito',sans-serif;
    background:#fff;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:0;
  }
  .cert-wrap {
    position:relative;
    width:100vw;
    height:100vh;
    background:url('${bgUrl}') center/cover no-repeat;
  }
  .cert-overlay {
    position:absolute;
    inset:0;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    text-align:center;
    padding:6% 12%;
  }
  .cert-name   { font-family:'Fredoka One',cursive; font-size:48px; color:#1a3a6b; margin-bottom:14px; letter-spacing:1px; }
  .cert-sub    { font-size:18px; color:#4a5568; font-weight:600; margin-bottom:10px; }
  .cert-course { font-family:'Fredoka One',cursive; font-size:28px; color:#1a56db; margin-bottom:6px; }
  .cert-grade  { font-size:16px; color:#4a5568; font-weight:700; margin-bottom:22px; }
  .cert-meta   { font-size:13px; color:#718096; font-weight:700; }
  .cert-id     { font-size:11px; color:#a0aec0; font-weight:700; margin-top:6px; }
  @media print {
    body { padding:0; }
    .cert-wrap { width:100vw; height:100vh; page-break-after:avoid; }
    @page { size:A4 landscape; margin:0; }
  }
</style>
</head><body>
  <div class="cert-wrap">
    <div class="cert-overlay">
      <div class="cert-name">${STUDENT.name}</div>
      <div class="cert-sub">has successfully completed</div>
      <div class="cert-course">${c.title || 'STEMNest Pathway'}</div>
      <div class="cert-grade">${c.gradeName || ('Grade ' + c.grade)}</div>
      <div class="cert-meta">Issued: ${issued} &nbsp;·&nbsp; Certificate ID: ${certId}</div>
      <div class="cert-id">Student ID: ${STUDENT.id || '—'} &nbsp;·&nbsp; StemNest Academy Ltd · Registered in England &amp; Wales</div>
    </div>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 800);
    };
  </script>
</body></html>`);
    printWin.document.close();
  }, 300);
}

function getCertPrintStyles() {
  return `
    .cert-doc-inner{width:100%;max-width:800px;margin:0 auto;}
    .cert-doc-border{border:8px double #1a56db;border-radius:16px;padding:40px;background:#fff;position:relative;}
    .cert-doc-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #e8eaf0;}
    .cert-doc-logo{display:flex;align-items:center;gap:12px;}
    .logo-icon{width:52px;height:52px;background:linear-gradient(135deg,#1a56db,#0e9f6e);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Fredoka One',cursive;font-size:24px;}
    .cert-doc-seal{font-size:48px;}
    .cert-doc-body{text-align:center;padding:20px 0 32px;}
    .cert-doc-label{font-family:'Fredoka One',cursive;font-size:32px;color:#1a56db;margin-bottom:20px;letter-spacing:1px;}
    .cert-doc-presented{font-size:16px;color:#718096;margin-bottom:8px;}
    .cert-doc-name{font-family:'Fredoka One',cursive;font-size:42px;color:#1a202c;margin:12px 0;border-bottom:2px solid #1a56db;display:inline-block;padding-bottom:4px;}
    .cert-doc-course{font-family:'Fredoka One',cursive;font-size:26px;color:#ff6b35;margin:16px 0;}
    .cert-doc-grade-row{display:flex;justify-content:center;gap:40px;margin-top:16px;font-size:15px;font-weight:700;color:#4a5568;}
    .cert-doc-sigs{display:flex;align-items:flex-end;justify-content:space-between;padding-top:32px;border-top:1px solid #e8eaf0;margin-top:8px;}
    .cert-doc-sig{text-align:center;flex:1;}
    .cert-sig-line{width:160px;height:2px;background:#1a202c;margin:0 auto 8px;}
    .cert-sig-name{font-weight:800;font-size:14px;color:#1a202c;}
    .cert-sig-role{font-size:12px;color:#718096;margin-top:2px;}
    .cert-doc-seal-center{text-align:center;font-size:40px;flex-shrink:0;padding:0 20px;}
    .cert-doc-footer{text-align:center;font-size:11px;color:#a0aec0;margin-top:24px;padding-top:16px;border-top:1px solid #e8eaf0;}
  `;
}

/* ══════════════════════════════════════════════════════
   PROFILE MODAL
══════════════════════════════════════════════════════ */
function openProfileModal() {
  /* Populate modal fields from live API data */
  const s = window.STUDENT_DATA?.profile;
  if (s) {
    const nameEl    = document.getElementById('pmFieldName');
    const emailEl   = document.getElementById('pmFieldEmail');
    const gradeEl   = document.getElementById('pmFieldGrade');
    const dobEl     = document.getElementById('pmDob');
    const avatarEl  = document.getElementById('pmAvatarInitials');
    const nameDisp  = document.getElementById('pmDisplayName');
    const idDisp    = document.getElementById('pmDisplayId');

    if (nameEl)   nameEl.value   = s.name  || '';
    if (emailEl)  emailEl.value  = s.email || '';
    if (dobEl && s.date_of_birth) dobEl.value = s.date_of_birth.split('T')[0];

    /* Set grade selector */
    if (gradeEl && s.grade) {
      for (let i = 0; i < gradeEl.options.length; i++) {
        if (gradeEl.options[i].value === s.grade || gradeEl.options[i].text === s.grade) {
          gradeEl.selectedIndex = i; break;
        }
      }
    }

    const initials = (s.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    if (avatarEl)  avatarEl.textContent  = initials || '—';
    if (nameDisp)  nameDisp.textContent  = s.name   || '—';
    if (idDisp)    idDisp.textContent    = 'Student ID: ' + (s.staff_id || STUDENT.id || '—');
  }
  document.getElementById('profileModalOverlay').classList.add('open');
}

function closeProfileModal() {
  document.getElementById('profileModalOverlay').classList.remove('open');
}

async function saveProfile() {
  const token = localStorage.getItem('sn_access_token');
  const s     = window.STUDENT_DATA?.profile;
  if (!s || !token) { showToast('Not logged in.', 'error'); return; }

  const name  = document.getElementById('pmFieldName')?.value.trim()  || s.name;
  const dob   = document.getElementById('pmDob')?.value               || '';
  const grade = document.getElementById('pmFieldGrade')?.value        || s.grade;

  /* Check password change */
  const currPw = document.getElementById('pmCurrentPw')?.value?.trim();
  const newPw  = document.getElementById('pmNewPw')?.value?.trim();
  const confPw = document.getElementById('pmConfirmPw')?.value?.trim();

  /* Save profile fields */
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/users/' + s.id, {
      method:  'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, date_of_birth: dob || undefined }),
    });
    const data = await res.json();
    if (!data.success) {
      showToast('Could not save profile: ' + (data.error || 'error'), 'error');
      return;
    }
    /* Update local state */
    if (window.STUDENT_DATA.profile) {
      window.STUDENT_DATA.profile.name = name;
      window.STUDENT_DATA.profile.date_of_birth = dob;
    }
    STUDENT.name = name;
    STUDENT.initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const nameEl = document.getElementById('sidebarName');
    if (nameEl) nameEl.textContent = name;
  } catch (e) {
    showToast('Network error saving profile.', 'error');
    return;
  }

  /* Change password if fields are filled */
  if (currPw || newPw || confPw) {
    if (!currPw || !newPw || !confPw) {
      showToast('Fill in all 3 password fields to change your password.', 'error');
      return;
    }
    if (newPw !== confPw) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    if (newPw.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }
    try {
      const pwRes = await fetch('https://api.stemnestacademy.co.uk/api/users/' + s.id + '/password', {
        method:  'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currentPassword: currPw, newPassword: newPw }),
      });
      const pwData = await pwRes.json();
      if (!pwData.success) {
        showToast('Password change failed: ' + (pwData.error || 'error'), 'error');
        return;
      }
      /* Clear password fields */
      ['pmCurrentPw','pmNewPw','pmConfirmPw'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      showToast('✅ Profile and password updated!');
    } catch (e) {
      showToast('Network error changing password.', 'error');
      return;
    }
  } else {
    showToast('✅ Profile saved successfully!');
  }

  closeProfileModal();
}

/* ── Extend tab switching for new tabs ── */
const _origShowTab = showTab;
showTab = function(tab) {
  const extraTabs = ['nest','chat','refer'];
  extraTabs.forEach(t => { const el = document.getElementById('tab-' + t); if (el) el.style.display = 'none'; });
  _origShowTab(tab);
  if (extraTabs.includes(tab)) {
    ALL_TABS.forEach(t => { const el = document.getElementById('tab-' + t); if (el) el.style.display = 'none'; });
    const el = document.getElementById('tab-' + tab);
    if (el) el.style.display = 'block';
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
    if (tab === 'nest') renderLearningNest();
    if (tab === 'chat') { initChat(); loadChatMessages(); }
    if (tab === 'refer') loadMyReferrals();
  }
};

/* ══════════════════════════════════════════════════════
   REFER & EARN
   Student submits referral → POST /api/enrollments/referral
   Loads past referrals → GET /api/enrollments/referrals (own)
══════════════════════════════════════════════════════ */
async function submitReferral() {
  const name         = document.getElementById('ref-name')?.value.trim();
  const grade        = document.getElementById('ref-grade')?.value.trim();
  const age          = document.getElementById('ref-age')?.value.trim();
  const email        = document.getElementById('ref-email')?.value.trim();
  const phone        = document.getElementById('ref-phone')?.value.trim();
  const relationship = document.getElementById('ref-relationship')?.value.trim();
  const needsDemo    = document.querySelector('input[name="ref-demo"]:checked')?.value !== 'no';

  if (!name) { showToast('Please enter the student\'s name.', 'error'); return; }
  if (!email && !phone) { showToast('Please enter parent email or WhatsApp number.', 'error'); return; }

  const btn = document.querySelector('#tab-refer button[onclick="submitReferral()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending...'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) throw new Error('Not logged in');

    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/referral', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName:  name,
        grade:        grade || null,
        age:          age ? parseInt(age) : null,
        parentEmail:  email || null,
        parentPhone:  phone || null,
        relationship: relationship || null,
        needsDemo:    needsDemo,
      })
    });
    const data = await res.json();

    if (btn) { btn.disabled = false; btn.textContent = '🎁 Send Referral'; }

    if (data.success) {
      /* Show success message */
      const msg = document.getElementById('referralSuccessMsg');
      if (msg) msg.style.display = 'block';
      /* Clear form */
      ['ref-name','ref-grade','ref-age','ref-email','ref-phone','ref-relationship'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const demoYes = document.getElementById('ref-demo-yes');
      if (demoYes) demoYes.checked = true;
      /* Reload referrals list — don't let this failure affect the success message */
      loadMyReferrals().catch(() => {});
      showToast('✅ Referral sent! Credits will be added when they enroll.');
    } else {
      showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '🎁 Send Referral'; }
    showToast('Error: ' + e.message, 'error');
  }
}

async function loadMyReferrals() {
  const el = document.getElementById('myReferralsList');
  if (!el) return;

  el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--light);font-weight:700;">⏳ Loading...</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) { el.innerHTML = '<div style="padding:16px;color:var(--light);font-weight:700;">Log in to see your referrals.</div>'; return; }

    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/referrals', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) {
      el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">Your referrals will appear here once submitted.</div>';
      return;
    }

    const data = await res.json();
    /* Filter to only this student's referrals */
    const profile = window.STUDENT_DATA?.profile;
    const myId = profile?.id || profile?.user_id;
    const referrals = (data.referrals || []).filter(r => !myId || r.referrer_id === myId);

    if (!referrals.length) {
      el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--light);font-weight:700;">You haven\'t referred anyone yet. Use the form above to get started!</div>';
      return;
    }

    const statusColor = { pending: '#e65100', demo_booked: '#1a56db', postsales: '#7c3aed', enrolled: '#0e9f6e' };
    const statusLabel = { pending: '⏳ Pending', demo_booked: '📅 Demo Booked', postsales: '💼 In Enrollment', enrolled: '✅ Enrolled' };

    el.innerHTML = `
      <div style="display:grid;gap:12px;">
        ${referrals.map(r => `
          <div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:14px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="font-weight:800;color:var(--dark);font-size:15px;">${r.student_name || '—'}</div>
              <div style="font-size:12px;color:var(--light);font-weight:700;margin-top:2px;">
                ${r.grade ? r.grade + ' · ' : ''}${r.age ? 'Age ' + r.age + ' · ' : ''}
                Referred ${r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}
              </div>
            </div>
            <span style="background:${statusColor[r.status]||'#e8eaf0'}22;color:${statusColor[r.status]||'var(--light)'};font-size:12px;font-weight:900;padding:4px 14px;border-radius:50px;border:1.5px solid ${statusColor[r.status]||'#e8eaf0'}44;">
              ${statusLabel[r.status] || r.status || '⏳ Pending'}
            </span>
          </div>`).join('')}
      </div>
      <div style="margin-top:10px;font-size:12px;font-weight:700;color:var(--light);text-align:right;">${referrals.length} referral${referrals.length!==1?'s':''}</div>`;
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--light);font-weight:700;">Your referrals will appear here once submitted.</div>';
  }
}
