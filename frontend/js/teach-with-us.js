/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — TEACH WITH US JS
   Open roles, multi-step form, FAQ accordion.
═══════════════════════════════════════════════════════ */

const OPEN_ROLES = [
  { id:'R001', emoji:'💻', subject:'coding',   title:'Coding Tutor — Python & Scratch',  badge:'urgent', badgeLabel:'🔥 Urgent', tags:['Remote','Part-time','Ages 7–14','Beginner'],        desc:'Teach Python fundamentals and Scratch game design to primary and secondary students. Project-based approach. Curriculum provided.',  pay:'£28–35' },
  { id:'R002', emoji:'🌐', subject:'coding',   title:'Web Development Tutor',            badge:'open',   badgeLabel:'✅ Open',   tags:['Remote','Part-time','Ages 13–19','Intermediate'],   desc:'Teach HTML, CSS and JavaScript to teens building real websites. Strong front-end knowledge required.',                                pay:'£30–40' },
  { id:'R003', emoji:'🤖', subject:'coding',   title:'AI & Computer Science Tutor',      badge:'new',    badgeLabel:'✨ New',    tags:['Remote','Part-time','Ages 14–19','Advanced'],       desc:'Teach A-Level Computer Science and AI literacy. Ideal for candidates with a CS degree or industry background.',                       pay:'£35–45' },
  { id:'R004', emoji:'📐', subject:'maths',    title:'GCSE Maths Tutor',                 badge:'urgent', badgeLabel:'🔥 Urgent', tags:['Remote','Part-time','Ages 14–16','GCSE'],           desc:'Support students preparing for GCSE Maths. Strong exam technique and ability to explain concepts clearly essential.',                 pay:'£25–35' },
  { id:'R005', emoji:'🧮', subject:'maths',    title:'Primary Maths Tutor',              badge:'open',   badgeLabel:'✅ Open',   tags:['Remote','Part-time','Ages 7–11','KS2'],             desc:'Build number confidence and problem-solving skills in younger learners. Patient, encouraging teaching style required.',               pay:'£25–30' },
  { id:'R006', emoji:'📊', subject:'maths',    title:'A-Level Maths Tutor',              badge:'open',   badgeLabel:'✅ Open',   tags:['Remote','Part-time','Ages 16–19','A-Level'],        desc:'Teach pure maths, statistics and mechanics to sixth-form students. Degree in Mathematics or related field required.',                 pay:'£35–45' },
  { id:'R007', emoji:'🧬', subject:'sciences', title:'Biology Tutor — GCSE & A-Level',   badge:'open',   badgeLabel:'✅ Open',   tags:['Remote','Part-time','Ages 14–19','GCSE & A-Level'], desc:'Teach cell biology, genetics, ecology and human physiology. Biology degree or equivalent required.',                                 pay:'£28–38' },
  { id:'R008', emoji:'⚗️', subject:'sciences', title:'Chemistry Tutor',                  badge:'new',    badgeLabel:'✨ New',    tags:['Remote','Part-time','Ages 14–19','GCSE & A-Level'], desc:'Cover atomic structure, organic chemistry and quantitative analysis. Strong exam board knowledge preferred.',                        pay:'£28–38' },
  { id:'R009', emoji:'🛰️', subject:'sciences', title:'Physics Tutor — A-Level',          badge:'urgent', badgeLabel:'🔥 Urgent', tags:['Remote','Part-time','Ages 16–19','A-Level'],        desc:'Mechanics, waves, electricity and modern physics for students targeting top university offers. Physics degree required.',              pay:'£35–45' },
];

const FAQS = [
  { q:'Do I need a teaching qualification?',         a:'Not necessarily. We welcome subject experts with strong academic backgrounds. A PGCE or teaching experience is a bonus but not required.' },
  { q:'How many hours do I need to commit?',         a:"A minimum of 5 hours per week. Beyond that it's entirely up to you. Many tutors work 10–25 hours around other commitments." },
  { q:'When do I get paid?',                         a:'Weekly, every Friday. We pay directly to your bank account. No invoicing needed — we handle all the admin.' },
  { q:'Do I need to be based in the UK?',            a:'No. We welcome tutors from anywhere in the world. You do need to be available during UK-friendly hours for at least some sessions.' },
  { q:'What equipment do I need?',                   a:'A laptop or desktop, a reliable internet connection, a webcam and a microphone. We provide the teaching platform and all digital resources.' },
  { q:'Is a DBS check required?',                    a:"Yes, for UK-based tutors working with under-18s. We guide you through the process and cover the cost once you're accepted." },
  { q:'Can I teach multiple subjects?',              a:'Yes, if qualified in more than one area. Many of our tutors teach both Coding and Maths, for example.' },
  { q:'How long does the application process take?', a:'Typically 1–2 weeks from application to first class. We move quickly for strong candidates.' },
];

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  renderRoles('all');
  renderFAQs();
  initScrollReveal();
});

/* ── RENDER ROLES ── */
function renderRoles(filter) {
  const grid = document.getElementById('rolesGrid');
  if (!grid) return;
  const list = filter === 'all' ? OPEN_ROLES : OPEN_ROLES.filter(r => r.subject === filter);

  if (!list.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--light);font-weight:700;">No open roles in this category right now. Check back soon!</div>';
    return;
  }

  const bc = { urgent:'tw-rb-urgent', open:'tw-rb-open', new:'tw-rb-new' };
  grid.innerHTML = list.map(r => `
    <div class="tw-role-card">
      <div class="tw-role-top">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="tw-role-emoji">${r.emoji}</div>
          <div>
            <div class="tw-role-title">${r.title}</div>
            <div style="font-size:11px;font-weight:800;color:var(--light);margin-top:2px;">Role ID: ${r.id}</div>
          </div>
        </div>
        <span class="tw-role-badge ${bc[r.badge]}">${r.badgeLabel}</span>
      </div>
      <div class="tw-role-meta">${r.tags.map(t => `<span class="tw-role-tag">${t}</span>`).join('')}</div>
      <div class="tw-role-desc">${r.desc}</div>
      <div class="tw-role-footer">
        <div>
          <div class="tw-role-pay">${r.pay}</div>
          <div class="tw-role-pay-note">per hour</div>
        </div>
        <a href="#apply" class="tw-role-apply-btn" onclick="prefillRole('${r.id}')">Apply Now →</a>
      </div>
    </div>`).join('');
}

function filterRoles(btn, filter) {
  document.querySelectorAll('.tw-role-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRoles(filter);
}

function prefillRole(roleId) {
  const role = OPEN_ROLES.find(r => r.id === roleId);
  if (!role) return;
  document.querySelectorAll('input[name="ap-subject"]').forEach(cb => {
    if (cb.value.toLowerCase() === role.subject) cb.checked = true;
  });
}

/* ── MULTI-STEP FORM ── */
let currentStep = 1;

function nextStep(step) {
  if (step > currentStep && !validateStep(currentStep)) return;

  document.getElementById('form-step-' + currentStep).style.display = 'none';
  document.getElementById('form-step-' + step).style.display = 'block';

  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById('step-dot-' + i);
    if (!dot) continue;
    dot.classList.remove('active', 'done');
    if (i < step)   dot.classList.add('done');
    if (i === step) dot.classList.add('active');
  }

  currentStep = step;
  document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep(step) {
  if (step === 1) {
    const name    = document.getElementById('ap-name')?.value.trim();
    const email   = document.getElementById('ap-email')?.value.trim();
    const phone   = document.getElementById('ap-phone')?.value.trim();
    const country = document.getElementById('ap-country')?.value;
    const qual    = document.getElementById('ap-qual')?.value;
    if (!name)                        { showToast('Please enter your full name.', 'error');      return false; }
    if (!email || !email.includes('@')){ showToast('Please enter a valid email.', 'error');      return false; }
    if (!phone)                       { showToast('Please enter your phone number.', 'error');   return false; }
    if (!country)                     { showToast('Please select your country.', 'error');       return false; }
    if (!qual)                        { showToast('Please select your qualification.', 'error'); return false; }
  }
  if (step === 2) {
    const subjects = [...document.querySelectorAll('input[name="ap-subject"]:checked')];
    const ages     = [...document.querySelectorAll('input[name="ap-age"]:checked')];
    const topics   = document.getElementById('ap-topics')?.value.trim();
    if (!subjects.length) { showToast('Please select at least one subject.', 'error');    return false; }
    if (!topics)          { showToast('Please enter your specialisms.', 'error');         return false; }
    if (!ages.length)     { showToast('Please select at least one age group.', 'error'); return false; }
  }
  return true;
}

async function submitApplication() {
  const bio   = document.getElementById('ap-bio')?.value.trim();
  const terms = document.getElementById('ap-terms')?.checked;
  if (!bio)   { showToast('Please tell us about yourself.', 'error'); return; }
  if (!terms) { showToast('Please agree to the terms to continue.', 'error'); return; }

  const btn = document.getElementById('applySubmitBtn');
  const txt = document.getElementById('applyBtnText');
  if (btn) btn.disabled = true;
  if (txt) txt.textContent = '⏳ Submitting…';

  const application = {
    id:        'APP-' + Date.now().toString(36).toUpperCase(),
    name:      document.getElementById('ap-name')?.value.trim(),
    email:     document.getElementById('ap-email')?.value.trim(),
    phone:     document.getElementById('ap-phone')?.value.trim(),
    country:   document.getElementById('ap-country')?.value,
    qual:      document.getElementById('ap-qual')?.value,
    exp:       document.getElementById('ap-exp')?.value,
    subjects:  [...document.querySelectorAll('input[name="ap-subject"]:checked')].map(c => c.value),
    topics:    document.getElementById('ap-topics')?.value.trim(),
    ageGroups: [...document.querySelectorAll('input[name="ap-age"]:checked')].map(c => c.value),
    hours:     document.getElementById('ap-hours')?.value,
    times:     document.getElementById('ap-times')?.value,
    device:    document.querySelector('input[name="ap-device"]:checked')?.value,
    bio,
    linkedin:  document.getElementById('ap-linkedin')?.value.trim(),
    source:    document.getElementById('ap-source')?.value,
    appliedAt: new Date().toISOString(),
    status:    'pending',
  };

  /* ── Try real API first ── */
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/applications', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(application),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Submission failed');
    }

    /* Also save to localStorage as backup */
    const all = JSON.parse(localStorage.getItem('sn_applications') || '[]');
    all.unshift({ ...application, dbId: data.applicationId });
    localStorage.setItem('sn_applications', JSON.stringify(all));

    if (btn) btn.disabled = false;
    if (txt) txt.textContent = '✦ Submit Application';
    document.getElementById('applySuccess').classList.add('show');
    return;

  } catch (err) {
    console.warn('[API] Application submit failed, saving locally:', err.message);
  }

  /* ── Fallback: localStorage only ── */
  const all = JSON.parse(localStorage.getItem('sn_applications') || '[]');
  all.unshift(application);
  localStorage.setItem('sn_applications', JSON.stringify(all));

  console.log('📧 CONFIRMATION EMAIL TO:', application.email,
    '\nApplication ID:', application.id,
    '\nSubjects:', application.subjects.join(', '));

  setTimeout(() => {
    if (btn) btn.disabled = false;
    if (txt) txt.textContent = '✦ Submit Application';
    document.getElementById('applySuccess').classList.add('show');
  }, 800);
}

/* ── FAQ ACCORDION ── */
function renderFAQs() {
  const grid = document.getElementById('faqGrid');
  if (!grid) return;
  grid.innerHTML = FAQS.map((f, i) => `
    <div class="tw-faq-item" id="faq-${i}">
      <div class="tw-faq-q" onclick="toggleFAQ(${i})">${f.q}</div>
      <div class="tw-faq-a">${f.a}</div>
    </div>`).join('');
}

function toggleFAQ(i) {
  const item = document.getElementById('faq-' + i);
  if (!item) return;
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.tw-faq-item').forEach(el => el.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

/* ── SCROLL REVEAL ── */
function initScrollReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ── DBS INFO MODAL ── */
function showDBSInfo() {
  const overlay = document.getElementById('dbsInfoOverlay');
  if (overlay) { overlay.style.display = 'flex'; }
}

/* Close DBS modal on overlay click */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('dbsInfoOverlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  }
});
