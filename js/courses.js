/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — COURSES.JS
   Course data store, grid rendering, filter/sort,
   add-course modal, right-click delete.
═══════════════════════════════════════════════════════ */

/* ── DATA ── */
const EMOJIS = ['💻','📐','🔬','⚗️','🧬','🧪','🤖','🧠','📊','📡','🎮','🌍','🏗️','✏️','📱','🛰️'];

const COLORS = [
  { id:'blue',   bg:'linear-gradient(135deg,#1a56db22,#1a56db44)', hex:'#1a56db' },
  { id:'green',  bg:'linear-gradient(135deg,#0e9f6e22,#0e9f6e44)', hex:'#0e9f6e' },
  { id:'orange', bg:'linear-gradient(135deg,#ff6b3522,#ff6b3544)', hex:'#ff6b35' },
  { id:'purple', bg:'linear-gradient(135deg,#7c3aed22,#7c3aed44)', hex:'#7c3aed' },
  { id:'teal',   bg:'linear-gradient(135deg,#0694a222,#0694a244)', hex:'#0694a2' },
  { id:'pink',   bg:'linear-gradient(135deg,#e6338722,#e6338744)', hex:'#e63387' },
];

const TAG_MAP = {
  coding:   { cls:'tag-b', label:'Coding & Tech'  },
  maths:    { cls:'tag-g', label:'Mathematics'    },
  sciences: { cls:'tag-o', label:'Sciences'       },
};

let courses = [
  { id:1,  name:'Python for Beginners',        desc:'Learn to code from scratch with Python — variables, loops, functions and your first real programs.',                                    subject:'coding',   age:'Ages 10–14', price:99,  classes:24, rating:4.9, students:312, emoji:'💻', color:'blue',   badge:'popular' },
  { id:2,  name:'Scratch & Game Design',       desc:'Build fun interactive games using Scratch. Perfect intro to computational thinking.',                                                  subject:'coding',   age:'Ages 7–10',  price:79,  classes:16, rating:4.8, students:245, emoji:'🎮', color:'purple', badge:''        },
  { id:3,  name:'Web Dev: HTML, CSS & JS',     desc:'Design and build real websites from zero. HTML structure, CSS styling and JavaScript interactivity.',                                   subject:'coding',   age:'Ages 13–19', price:129, classes:32, rating:4.9, students:178, emoji:'📱', color:'blue',   badge:'new'     },
  { id:4,  name:'GCSE Maths Prep',             desc:'Targeted support aligned to the GCSE syllabus. Master number, algebra, geometry and statistics.',                                      subject:'maths',    age:'Ages 14–16', price:109, classes:28, rating:4.9, students:401, emoji:'📐', color:'green',  badge:'popular' },
  { id:5,  name:'Primary Maths Boost',         desc:'Build strong foundations in numbers, fractions, times tables and problem solving for KS2 learners.',                                   subject:'maths',    age:'Ages 7–11',  price:79,  classes:20, rating:4.8, students:293, emoji:'📊', color:'teal',   badge:''        },
  { id:6,  name:'A-Level Maths Mastery',       desc:'Deep-dive into pure maths, statistics and mechanics for A-Level students aiming for top grades.',                                      subject:'maths',    age:'Ages 16–19', price:149, classes:40, rating:4.9, students:134, emoji:'🧠', color:'green',  badge:''        },
  { id:7,  name:'GCSE Biology',                desc:'Cells, genetics, ecosystems and the human body — expert-led sessions covering the full GCSE spec.',                                    subject:'sciences', age:'Ages 14–16', price:109, classes:28, rating:4.7, students:221, emoji:'🧬', color:'orange', badge:''        },
  { id:8,  name:'GCSE Chemistry',              desc:'From atomic structure to organic chemistry — build exam confidence with a specialist chemistry tutor.',                                 subject:'sciences', age:'Ages 14–16', price:109, classes:28, rating:4.8, students:198, emoji:'⚗️', color:'orange', badge:''        },
  { id:9,  name:'A-Level Physics',             desc:'Mechanics, waves, electricity and modern physics — for students pushing for top university offers.',                                    subject:'sciences', age:'Ages 16–19', price:149, classes:40, rating:4.9, students:97,  emoji:'🛰️', color:'teal',   badge:'new'     },
];

let nextId         = 10;
let selectedEmoji  = '💻';
let selectedColor  = 'blue';
let activeFilter   = 'all';
let activeSort     = 'default';

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  renderGrid();
  bindFilterTabs();
  bindSortSelect();
  bindModalClose();
});

/* ── RENDER ── */
function renderGrid() {
  const grid = document.getElementById('coursesGrid');
  if (!grid) return;

  let list = [...courses];

  if (activeFilter !== 'all') list = list.filter(c => c.subject === activeFilter);

  if      (activeSort === 'price-low')  list.sort((a, b) => a.price - b.price);
  else if (activeSort === 'price-high') list.sort((a, b) => b.price - a.price);
  else if (activeSort === 'rating')     list.sort((a, b) => b.rating - a.rating);
  else if (activeSort === 'popular')    list.sort((a, b) => b.students - a.students);

  const counter = document.getElementById('countNum');
  if (counter) counter.textContent = list.length;

  grid.innerHTML = '';
  if (list.length === 0) {
    grid.innerHTML = '<div class="no-results"><p>No courses in this category yet. Add the first one! 🚀</p></div>';
  } else {
    list.forEach(c => grid.appendChild(buildCard(c)));
  }
  grid.appendChild(buildAddCard());
}

function buildCard(c) {
  const tag = TAG_MAP[c.subject] || { cls:'tag-b', label: c.subject };
  const col = COLORS.find(x => x.id === c.color) || COLORS[0];

  const badge = c.badge === 'popular'
    ? '<div class="badge-popular">🔥 Popular</div>'
    : c.badge === 'new'
    ? '<div class="badge-new">✨ New</div>'
    : '';

  const starsFull  = '★'.repeat(Math.floor(c.rating));
  const starsEmpty = '☆'.repeat(5 - Math.floor(c.rating));

  const div = document.createElement('div');
  div.className = 'course-card';
  div.addEventListener('mouseenter', () => div.style.borderColor = col.hex);
  div.addEventListener('mouseleave', () => div.style.borderColor = 'transparent');

  div.innerHTML = `
    <div class="card-banner" style="background:${col.bg}">
      ${badge}
      <span style="filter:drop-shadow(0 4px 8px rgba(0,0,0,.15))">${c.emoji}</span>
    </div>
    <div class="card-body">
      <div class="card-meta-top">
        <span class="subject-tag ${tag.cls}">${tag.label}</span>
        <span class="age-pill">${c.age}</span>
      </div>
      <div class="card-title">${c.name}</div>
      <div class="card-desc">${c.desc}</div>
      <div class="card-stats">
        <div class="cstat"><div class="cstat-val">${c.classes}</div><div class="cstat-label">Classes</div></div>
        <div class="cstat"><div class="cstat-val">${c.students.toLocaleString()}</div><div class="cstat-label">Students</div></div>
        <div class="cstat"><div class="cstat-val">${c.rating}</div><div class="cstat-label">Rating</div></div>
      </div>
      <div class="card-rating">
        <span class="stars">${starsFull}${starsEmpty}</span>
        <span class="rating-val">${c.rating}</span>
        <span class="rating-count">(${c.students.toLocaleString()} students)</span>
      </div>
      <div class="card-footer">
        <div>
          <div class="course-price">£${c.price}<span style="font-size:14px;color:var(--light);font-family:'Nunito',sans-serif;">/mo</span></div>
          <div class="price-note">1-on-1 live sessions</div>
        </div>
        <button class="enroll-btn">Enrol Now →</button>
      </div>
    </div>`;

  // Right-click to delete
  div.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (confirm(`Remove "${c.name}" from the course list?`)) {
      courses = courses.filter(x => x.id !== c.id);
      renderGrid();
    }
  });

  return div;
}

function buildAddCard() {
  const div = document.createElement('div');
  div.className = 'add-course-card';
  div.onclick   = openModal;
  div.innerHTML = `
    <div class="add-icon">➕</div>
    <div class="add-title">Add a New Course</div>
    <div class="add-sub">Click here to add a course. Fill in the details and it appears instantly.</div>`;
  return div;
}

/* ── FILTER TABS ── */
function bindFilterTabs() {
  document.getElementById('filterTabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    renderGrid();
  });
}

/* ── SORT ── */
function bindSortSelect() {
  document.getElementById('sortSelect')?.addEventListener('change', e => {
    activeSort = e.target.value;
    renderGrid();
  });
}

/* ── MODAL ── */
function openModal() {
  // Build emoji picker
  const eg = document.getElementById('emojiGrid');
  eg.innerHTML = '';
  EMOJIS.forEach(em => {
    const b = document.createElement('button');
    b.type      = 'button';
    b.className = 'emoji-opt' + (em === selectedEmoji ? ' selected' : '');
    b.textContent = em;
    b.onclick = () => {
      selectedEmoji = em;
      document.querySelectorAll('.emoji-opt').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
    };
    eg.appendChild(b);
  });

  // Build colour picker
  const cg = document.getElementById('colorGrid');
  cg.innerHTML = '';
  COLORS.forEach(co => {
    const b = document.createElement('div');
    b.className   = 'color-opt' + (co.id === selectedColor ? ' selected' : '');
    b.style.background = co.hex;
    b.title = co.id;
    b.onclick = () => {
      selectedColor = co.id;
      document.querySelectorAll('.color-opt').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
    };
    cg.appendChild(b);
  });

  // Reset fields
  ['f-name','f-desc','f-age','f-price','f-classes','f-rating','f-students']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const fSub = document.getElementById('f-subject'); if (fSub) fSub.value = 'coding';
  const fBad = document.getElementById('f-badge');   if (fBad) fBad.value = '';

  selectedEmoji = '💻';
  selectedColor = 'blue';

  document.getElementById('modalOverlay')?.classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('open');
}

function bindModalClose() {
  const overlay = document.getElementById('modalOverlay');
  overlay?.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });
}

function saveCourse() {
  const name  = document.getElementById('f-name')?.value.trim();
  const desc  = document.getElementById('f-desc')?.value.trim();
  const price = parseFloat(document.getElementById('f-price')?.value);

  if (!name)             { showToast('Please enter a course name.', 'error'); return; }
  if (!desc)             { showToast('Please enter a description.', 'error'); return; }
  if (!price || isNaN(price)) { showToast('Please enter a valid price.', 'error'); return; }

  courses.push({
    id:       nextId++,
    name,
    desc,
    subject:  document.getElementById('f-subject')?.value || 'coding',
    age:      document.getElementById('f-age')?.value.trim() || 'All Ages',
    price,
    classes:  parseInt(document.getElementById('f-classes')?.value) || 0,
    rating:   parseFloat(document.getElementById('f-rating')?.value) || 5.0,
    students: parseInt(document.getElementById('f-students')?.value) || 0,
    emoji:    selectedEmoji,
    color:    selectedColor,
    badge:    document.getElementById('f-badge')?.value || '',
  });

  closeModal();

  // Reset to show all
  activeFilter = 'all';
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-filter="all"]')?.classList.add('active');

  renderGrid();
  showToast('✅ Course added successfully!');

  // Scroll to new card
  setTimeout(() => {
    const cards = document.querySelectorAll('#coursesGrid .course-card');
    if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior:'smooth', block:'center' });
  }, 100);
}
