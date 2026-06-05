/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — COURSES PAGE: PATHWAYS EXTENSION
   Handles Career Pathways tab, Learn More panel,
   and Pathway Enrolment form.
   Loaded after courses.js on courses.html
═══════════════════════════════════════════════════════ */

/* ── Pathway content (hardcoded for public display) ── */
const PATHWAY_CONTENT = {
  'data-science-analytics': {
    emoji: '📊', color: '#1a56db',
    name: 'Data Science & Analytics',
    tagline: 'Become a Data Scientist and Analytics Expert',
    intro: 'Turn curiosity into insights through the power of data.',
    description: 'The Data Science & Analytics Pathway takes students on a journey from basic digital literacy and logical thinking to advanced data analysis, machine learning, artificial intelligence, and business intelligence. Students learn how to collect, organize, analyze, visualize, and interpret data to solve real-world problems. Through hands-on projects, students develop skills in statistics, spreadsheets, Python programming, data visualization, machine learning, and predictive analytics.',
    learn: ['Data Literacy and Digital Skills','Data Collection and Analysis','Statistics and Mathematical Thinking','Python Programming','Data Visualization and Dashboards','Machine Learning Fundamentals','Artificial Intelligence Applications','Business Intelligence and Decision Making'],
    outcomes: ['Data Scientist','Data Analyst','Machine Learning Engineer','Business Intelligence Analyst','AI Specialist'],
    graduation: 'Students graduate with a strong portfolio of real-world projects and the skills required to pursue advanced studies and careers in Data Science, Analytics, and Artificial Intelligence.',
  },
  'website-development': {
    emoji: '🌐', color: '#0e9f6e',
    name: 'Website Development',
    tagline: 'Become a Full-Stack Web Developer',
    intro: 'Learn how to design, build, and launch professional websites and web applications.',
    description: 'From creating simple web pages in the early grades to developing complete full-stack web applications by graduation, students learn every stage of modern web development. Students gain experience with front-end and back-end technologies while building websites, portfolios, blogs, e-commerce systems, and interactive web applications.',
    learn: ['Web Design Principles','HTML & CSS','JavaScript Programming','Responsive Design','Front-End Development','Back-End Development','Databases','Full-Stack Application Development'],
    outcomes: ['Full-Stack Web Developer','Front-End Developer','Back-End Developer','UI Developer','Software Engineer'],
    graduation: 'Students graduate as confident Full-Stack Web Developers capable of building and deploying modern web applications.',
  },
  'mobile-app-development': {
    emoji: '📱', color: '#7c3aed',
    name: 'Mobile App Development',
    tagline: 'Become a Mobile App Developer',
    intro: 'Create the next generation of mobile applications that solve real-world problems.',
    description: 'Students progress from visual programming and app design concepts to building sophisticated Android and cross-platform mobile applications. Throughout the pathway, learners design, develop, test, and publish mobile apps while mastering programming, UI/UX design, databases, APIs, and mobile software engineering principles.',
    learn: ['App Design Fundamentals','Mobile User Interface Design','Programming Concepts','Android Development','Cross-Platform App Development','Database Integration','API Integration','Mobile App Deployment'],
    outcomes: ['Mobile App Developer','Android Developer','Cross-Platform Developer','Software Engineer','Product Developer'],
    graduation: 'Students graduate with a portfolio of fully functional mobile applications and industry-relevant development skills.',
  },
  'game-development': {
    emoji: '🎮', color: '#ff6b35',
    name: 'Game Development',
    tagline: 'Become a Game Developer and Interactive Media Creator',
    intro: 'Turn creativity into immersive gaming experiences.',
    description: 'Students begin by creating simple games using block-based programming before advancing to professional game design, programming, animation, storytelling, and game engine development. They learn how to design, build, test, and publish engaging games while developing creativity, logical thinking, and technical expertise.',
    learn: ['Game Design Principles','Storytelling and Character Design','Animation and Interactive Media','Programming for Games','Physics and Game Mechanics','2D and 3D Game Development','User Experience Design','Game Publishing'],
    outcomes: ['Game Developer','Game Designer','Interactive Media Creator','Software Developer','Digital Animator'],
    graduation: 'Students graduate with a portfolio of playable games and the skills required for further studies or careers in game development.',
  },
  'ai-automation': {
    emoji: '🤖', color: '#0694a2',
    name: 'AI & Automation',
    tagline: 'Become an AI Innovator and Automation Engineer',
    intro: 'Prepare for the future by mastering Artificial Intelligence and Automation technologies.',
    description: 'Students learn how intelligent systems work, how machines make decisions, and how technology can automate tasks and solve complex problems. Beginning with computational thinking and progressing through robotics, AI concepts, machine learning, automation workflows, and intelligent systems, students gain exposure to the technologies shaping the future.',
    learn: ['Computational Thinking','Robotics Fundamentals','Artificial Intelligence Concepts','Machine Learning Foundations','Automation Tools and Workflows','Intelligent Systems Design','Problem Solving with AI','Future Technologies'],
    outcomes: ['AI Engineer','Automation Specialist','Robotics Engineer','Machine Learning Engineer','Technology Innovator'],
    graduation: 'Students graduate with practical AI and automation skills, preparing them for advanced studies and future technology careers.',
  },
};

const PATHWAY_INCLUDES = [
  '✅ Live Instructor-Led Classes',
  '✅ Hands-On Projects',
  '✅ Progress Tracking',
  '✅ Certificates',
  '✅ STEMNest Learning Portal Access',
  '✅ Portfolio Development',
  '✅ Student Progress Reports',
];

/* ── State ── */
let _pathways = [];
let _activeCategory = 'pathways';
let _currentPathwayId = null;
let _currentPathwaySlug = null;

/* ── Category switching ── */
function switchCategory(cat) {
  _activeCategory = cat;
  document.querySelectorAll('#categoryTabs .filter-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.category === cat);
  });
  const pathSec = document.getElementById('section-pathways');
  const courSec = document.getElementById('section-courses');
  if (pathSec) pathSec.style.display = cat === 'pathways' ? 'block' : 'none';
  if (courSec) courSec.style.display = cat === 'courses'  ? 'block' : 'none';
  if (cat === 'pathways') renderPathwayCards();
  if (cat === 'courses')  renderGrid();
}

/* ── Load pathways from API, fall back to hardcoded content ── */
async function loadPathwaysForPage() {
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/pathways/public');
    if (res.ok) {
      const data = await res.json();
      if (data.pathways && data.pathways.length > 0) {
        _pathways = data.pathways;
        return;
      }
    }
  } catch(e) { console.warn('[Pathways] API load failed, using defaults'); }
  /* Fallback: build from hardcoded content */
  _pathways = Object.entries(PATHWAY_CONTENT).map(([slug, p], i) => ({
    id: slug, slug, name: p.name, tagline: p.tagline, intro: p.intro,
    description: p.description, what_you_learn: p.learn, career_outcomes: p.outcomes,
    graduation_outcome: p.graduation, emoji: p.emoji, color: 'blue', price: 80,
    sort_order: i,
  }));
}

/* ── Render pathway cards ── */
function renderPathwayCards() {
  const grid = document.getElementById('pathwaysGrid');
  if (!grid) return;
  if (!_pathways.length) {
    grid.innerHTML = '<div style="text-align:center;padding:60px;color:var(--light);font-weight:700;">Loading pathways...</div>';
    return;
  }
  const colorMap = { blue:'#1a56db', green:'#0e9f6e', orange:'#ff6b35', purple:'#7c3aed', teal:'#0694a2', pink:'#e63387' };
  grid.innerHTML = _pathways.map(p => {
    const hex = colorMap[p.color] || '#1a56db';
    const content = PATHWAY_CONTENT[p.slug] || {};
    return `
      <div class="course-card" style="border:2px solid transparent;transition:.2s;"
           onmouseenter="this.style.borderColor='${hex}'" onmouseleave="this.style.borderColor='transparent'">
        <div class="card-banner" style="background:linear-gradient(135deg,${hex}22,${hex}44);min-height:100px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;">
          <span style="font-size:52px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.15))">${p.emoji || '🚀'}</span>
          <span style="background:${hex};color:#fff;font-size:11px;font-weight:900;padding:3px 12px;border-radius:50px;letter-spacing:.5px;">CAREER PATHWAY</span>
        </div>
        <div class="card-body">
          <div class="card-title" style="font-size:18px;">${p.name}</div>
          <div style="font-size:13px;font-weight:700;color:${hex};margin-bottom:8px;">${p.tagline || ''}</div>
          <div class="card-desc">${p.intro || p.description || ''}</div>
          <div style="margin:12px 0;display:flex;flex-wrap:wrap;gap:6px;">
            ${(p.career_outcomes || content.outcomes || []).slice(0,3).map(o =>
              `<span style="background:${hex}18;color:${hex};font-size:11px;font-weight:800;padding:3px 10px;border-radius:50px;">${o}</span>`
            ).join('')}
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--light);margin-bottom:12px;">📅 Grades 1–12 &nbsp;·&nbsp; 72 sessions per grade</div>
          <div class="card-footer" style="flex-direction:column;gap:10px;align-items:stretch;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div class="course-price" style="color:${hex};">£${parseFloat(p.price||80).toFixed(0)}<span style="font-size:14px;color:var(--light);font-family:'Nunito',sans-serif;">/mo</span></div>
                <div class="price-note">1-on-1 live sessions</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button onclick="openPathwayPanel('${p.slug || p.id}')"
                style="flex:1;background:var(--bg);color:var(--dark);border:2px solid #e8eaf0;border-radius:12px;padding:10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:13px;cursor:pointer;transition:.15s;"
                onmouseover="this.style.borderColor='${hex}';this.style.color='${hex}'"
                onmouseout="this.style.borderColor='#e8eaf0';this.style.color='var(--dark)'">
                📖 Learn More
              </button>
              <button onclick="openPathwayEnrol('${p.id}','${p.slug || p.id}','${p.name.replace(/'/g,'')}')"
                style="flex:1;background:${hex};color:#fff;border:none;border-radius:12px;padding:10px;font-family:'Nunito',sans-serif;font-weight:900;font-size:13px;cursor:pointer;transition:.15s;"
                onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
                🚀 Enrol Now
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ── Learn More panel ── */
function openPathwayPanel(slug) {
  const p = _pathways.find(x => x.slug === slug || x.id === slug);
  const content = PATHWAY_CONTENT[slug] || {};
  const name     = p ? p.name : content.name || slug;
  const tagline  = p ? p.tagline : content.tagline || '';
  const intro    = p ? p.intro : content.intro || '';
  const desc     = p ? p.description : content.description || '';
  const learn    = p ? (p.what_you_learn || []) : (content.learn || []);
  const outcomes = p ? (p.career_outcomes || []) : (content.outcomes || []);
  const grad     = p ? p.graduation_outcome : content.graduation || '';
  const price    = p ? parseFloat(p.price || 80) : 80;
  const emoji    = p ? (p.emoji || '🚀') : (content.emoji || '🚀');
  const hex      = content.color || '#1a56db';

  document.getElementById('panelTitle').textContent = `${emoji} ${name}`;
  document.getElementById('panelBody').innerHTML = `
    <div style="background:linear-gradient(135deg,${hex},${hex}cc);border-radius:16px;padding:24px 28px;margin-bottom:24px;color:#fff;">
      <div style="font-family:'Fredoka One',cursive;font-size:22px;margin-bottom:6px;">${tagline}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.7;">${intro}</div>
    </div>
    <div style="font-size:15px;color:var(--mid);line-height:1.8;margin-bottom:24px;">${desc}</div>
    <div style="margin-bottom:24px;">
      <div style="font-family:'Fredoka One',cursive;font-size:18px;color:var(--dark);margin-bottom:12px;">What Students Will Learn</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${learn.map(item => `<div style="display:flex;align-items:flex-start;gap:8px;font-size:14px;font-weight:700;color:var(--mid);"><span style="color:${hex};font-size:16px;flex-shrink:0;">✔</span>${item}</div>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:24px;">
      <div style="font-family:'Fredoka One',cursive;font-size:18px;color:var(--dark);margin-bottom:12px;">Career Outcomes</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${outcomes.map(o => `<span style="background:${hex}18;color:${hex};font-size:13px;font-weight:800;padding:6px 16px;border-radius:50px;border:1.5px solid ${hex}33;">${o}</span>`).join('')}
      </div>
    </div>
    <div style="background:var(--bg);border-radius:14px;padding:18px 22px;margin-bottom:24px;">
      <div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:8px;">Graduation Outcome</div>
      <div style="font-size:14px;color:var(--mid);line-height:1.7;">${grad}</div>
    </div>
    <div style="margin-bottom:24px;">
      <div style="font-family:'Fredoka One',cursive;font-size:16px;color:var(--dark);margin-bottom:10px;">What's Included</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        ${PATHWAY_INCLUDES.map(item => `<div style="font-size:13px;font-weight:700;color:var(--mid);">${item}</div>`).join('')}
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;background:${hex}11;border-radius:14px;padding:18px 22px;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-family:'Fredoka One',cursive;font-size:28px;color:${hex};">£${price.toFixed(0)}<span style="font-size:16px;color:var(--light);font-family:'Nunito',sans-serif;">/month</span></div>
        <div style="font-size:13px;font-weight:700;color:var(--light);">Grades 1–12 · 72 sessions per grade</div>
      </div>
      <button onclick="closePathwayPanel();openPathwayEnrol('${p ? p.id : slug}','${slug}','${name.replace(/'/g,'')}')"
        style="background:${hex};color:#fff;border:none;border-radius:14px;padding:14px 28px;font-family:'Nunito',sans-serif;font-weight:900;font-size:15px;cursor:pointer;">
        🚀 Enrol Now →
      </button>
    </div>`;

  const overlay = document.getElementById('pathwayPanelOverlay');
  const panel   = document.getElementById('pathwayPanel');
  if (overlay) overlay.style.display = 'block';
  if (panel)   panel.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closePathwayPanel() {
  const overlay = document.getElementById('pathwayPanelOverlay');
  const panel   = document.getElementById('pathwayPanel');
  if (overlay) overlay.style.display = 'none';
  if (panel)   panel.style.display = 'none';
  document.body.style.overflow = '';
}

/* ── Enrolment form ── */
function openPathwayEnrol(pathwayId, slug, pathwayName) {
  _currentPathwayId   = pathwayId;
  _currentPathwaySlug = slug;
  const p = _pathways.find(x => x.id === pathwayId || x.slug === slug);
  const price = p ? parseFloat(p.price || 80) : 80;
  const summary = document.getElementById('pathwayEnrolSummary');
  if (summary) summary.innerHTML = `
    <div style="font-weight:900;font-size:16px;color:#1a202c;">${pathwayName}</div>
    <div style="font-size:13px;color:#4a5568;margin-top:4px;">1-on-1 live sessions · UK-certified tutor · Grades 1–12</div>
    <div style="font-family:'Fredoka One',cursive;font-size:22px;color:#1a56db;margin-top:8px;">£${price.toFixed(0)}<span style="font-size:14px;color:#718096;font-family:'Nunito',sans-serif;">/month</span></div>`;

  /* Set min date to today */
  const dateEl = document.getElementById('pe-startdate');
  if (dateEl) dateEl.min = new Date().toISOString().split('T')[0];

  /* Wire device warning */
  document.querySelectorAll('input[name="pe-device"]').forEach(r => {
    r.onchange = () => {
      const warn = document.getElementById('pe-device-warning');
      if (warn) warn.style.display = r.value === 'no' ? 'block' : 'none';
    };
  });

  const overlay = document.getElementById('pathwayEnrolOverlay');
  if (overlay) { overlay.style.display = 'flex'; }
}

function closePathwayEnrol() {
  const overlay = document.getElementById('pathwayEnrolOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function submitPathwayEnrol() {
  const student   = document.getElementById('pe-student')?.value.trim();
  const grade     = document.getElementById('pe-grade')?.value;
  const email     = document.getElementById('pe-email')?.value.trim();
  const phone     = document.getElementById('pe-phone')?.value.trim();
  const timezone  = document.getElementById('pe-timezone')?.value;
  const device    = document.querySelector('input[name="pe-device"]:checked')?.value;
  const startDate = document.getElementById('pe-startdate')?.value;
  const notes     = document.getElementById('pe-notes')?.value.trim();

  if (!student)   { showToast('Please enter the student\'s name.', 'error'); return; }
  if (!grade)     { showToast('Please select the student\'s current grade.', 'error'); return; }
  if (!email && !phone) { showToast('Please enter at least an email or WhatsApp number.', 'error'); return; }
  if (!timezone)  { showToast('Please select your country/timezone.', 'error'); return; }
  if (!device)    { showToast('Please answer whether your child has a laptop or desktop.', 'error'); return; }
  if (!startDate) { showToast('Please select an expected start date.', 'error'); return; }

  const btn = document.getElementById('pe-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Submitting...'; }

  try {
    const p = _pathways.find(x => x.id === _currentPathwayId || x.slug === _currentPathwaySlug);
    /* Fire Meta Pixel Lead event */
    if (typeof fbq === 'function') {
      fbq('track', 'Lead', { content_name: 'Pathway Enrolment Request', content_category: p ? p.name : 'Pathway' });
    }
    const res = await fetch('https://api.stemnestacademy.co.uk/api/enrollments/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName:  student,
        age:          grade ? `Grade ${grade}` : '',
        email:        email || null,
        phone:        phone || null,
        timezone,
        notes,
        courseId:     null,
        courseName:   p ? p.name : _currentPathwaySlug,
        coursePrice:  p ? p.price : 80,
        source:       'website',
        pathway_id:   _currentPathwayId,
        pathway_name: p ? p.name : _currentPathwaySlug,
        grade_number: parseInt(grade),
        has_device:   device === 'yes',
        expected_start: startDate,
      })
    });
    const data = await res.json();
    if (btn) { btn.disabled = false; btn.textContent = '✅ Request Enrolment →'; }
    closePathwayEnrol();
    _showEnrolSuccess(student, p ? p.name : 'the pathway', email || phone);
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Request Enrolment →'; }
    closePathwayEnrol();
    _showEnrolSuccess(student, '', email || phone);
  }
}

function _showEnrolSuccess(studentName, pathwayName, contact) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px;padding:48px 40px;max-width:460px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.3);">
      <div style="font-size:64px;margin-bottom:16px;">🎉</div>
      <div style="font-family:'Fredoka One',cursive;font-size:26px;color:#1a202c;margin-bottom:10px;">Enrolment Request Received!</div>
      <div style="font-size:15px;color:#4a5568;line-height:1.7;margin-bottom:24px;">
        Thank you! We've received your enrolment request for <strong>${studentName}</strong>${pathwayName ? ` in <strong>${pathwayName}</strong>` : ''}.<br><br>
        Our team will contact you at <strong>${contact}</strong> within <strong>24 hours</strong> to arrange payment and schedule the first class.
      </div>
      <button onclick="this.closest('div[style]').remove()" style="background:#1a56db;color:#fff;border:none;border-radius:50px;padding:14px 36px;font-family:'Nunito',sans-serif;font-weight:900;font-size:15px;cursor:pointer;">
        Done ✓
      </button>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/* ── Init on page load ── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadPathwaysForPage();
  switchCategory('pathways');
});
