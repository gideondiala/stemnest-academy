/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — COURSES.JS
   Public course catalogue — read-only.
   All add/edit/delete is handled in the Admin Dashboard.
   Courses are stored in localStorage (sn_courses).
═══════════════════════════════════════════════════════ */

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

/* Default courses — used only if admin hasn't saved any yet */
const DEFAULT_COURSES = [
  {
    id:'CRS001', name:'Python for Beginners', desc:'Learn to code from scratch with Python — variables, loops, functions and your first real programs.',
    subject:'coding', age:'Ages 10–14', price:99, classes:24, rating:4.9, students:312, emoji:'💻', color:'blue', badge:'popular', level:'Beginner', duration:'6 months',
    lessons:[
      {number:1,  name:'Welcome & Dev Tools Setup'},
      {number:2,  name:'Your First Python Program'},
      {number:3,  name:'Variables & Data Types'},
      {number:4,  name:'String Operations'},
      {number:5,  name:'Numbers & Arithmetic'},
      {number:6,  name:'Getting User Input'},
      {number:7,  name:'If / Else Statements'},
      {number:8,  name:'Nested Conditionals'},
      {number:9,  name:'While Loops'},
      {number:10, name:'For Loops'},
      {number:11, name:'Loop Control: break & continue'},
      {number:12, name:'Lists & Indexing'},
      {number:13, name:'List Methods'},
      {number:14, name:'Tuples & Sets'},
      {number:15, name:'Dictionaries'},
      {number:16, name:'Functions: Defining & Calling'},
      {number:17, name:'Function Parameters & Return'},
      {number:18, name:'Scope & Global Variables'},
      {number:19, name:'File Reading & Writing'},
      {number:20, name:'Error Handling with Try/Except'},
      {number:21, name:'Modules & Imports'},
      {number:22, name:'Mini Project: Number Guessing Game'},
      {number:23, name:'Mini Project: To-Do List App'},
      {number:24, name:'Final Project Showcase & Review'},
    ]
  },
  {
    id:'CRS002', name:'Scratch & Game Design', desc:'Build fun interactive games using Scratch. Perfect intro to computational thinking.',
    subject:'coding', age:'Ages 7–10', price:79, classes:16, rating:4.8, students:245, emoji:'🎮', color:'purple', badge:'', level:'Beginner', duration:'4 months',
    lessons:[
      {number:1,  name:'Welcome to Scratch — Interface Tour'},
      {number:2,  name:'Sprites, Costumes & Backdrops'},
      {number:3,  name:'Motion Blocks — Moving Your Sprite'},
      {number:4,  name:'Events & Triggers'},
      {number:5,  name:'Looks & Sound Blocks'},
      {number:6,  name:'Loops in Scratch'},
      {number:7,  name:'If/Else Conditions'},
      {number:8,  name:'Variables & Score Keeping'},
      {number:9,  name:'User Input & Sensing'},
      {number:10, name:'Cloning Sprites'},
      {number:11, name:'Project: Catch the Falling Stars'},
      {number:12, name:'Project: Maze Game'},
      {number:13, name:'Project: Pong Game'},
      {number:14, name:'Adding Sound & Music'},
      {number:15, name:'Sharing & Presenting Your Game'},
      {number:16, name:'Final Game Showcase'},
    ]
  },
  {
    id:'CRS003', name:'Web Dev: HTML, CSS & JS', desc:'Design and build real websites from zero. HTML structure, CSS styling and JavaScript interactivity.',
    subject:'coding', age:'Ages 13–19', price:129, classes:32, rating:4.9, students:178, emoji:'📱', color:'blue', badge:'new', level:'Intermediate', duration:'8 months',
    lessons:[
      {number:1,  name:'How the Web Works'},
      {number:2,  name:'HTML Structure & Tags'},
      {number:3,  name:'Headings, Paragraphs & Links'},
      {number:4,  name:'Images, Lists & Tables'},
      {number:5,  name:'HTML Forms'},
      {number:6,  name:'Semantic HTML5'},
      {number:7,  name:'Intro to CSS — Selectors & Properties'},
      {number:8,  name:'Box Model: Margin, Padding, Border'},
      {number:9,  name:'Colours, Fonts & Text Styling'},
      {number:10, name:'Flexbox Layout'},
      {number:11, name:'CSS Grid'},
      {number:12, name:'Responsive Design & Media Queries'},
      {number:13, name:'CSS Animations & Transitions'},
      {number:14, name:'Project: Personal Portfolio Page'},
      {number:15, name:'Intro to JavaScript'},
      {number:16, name:'Variables, Data Types & Operators'},
      {number:17, name:'Functions in JavaScript'},
      {number:18, name:'DOM Manipulation'},
      {number:19, name:'Events & Event Listeners'},
      {number:20, name:'Conditionals & Loops in JS'},
      {number:21, name:'Arrays & Objects'},
      {number:22, name:'Fetch API & JSON'},
      {number:23, name:'Local Storage'},
      {number:24, name:'Form Validation with JS'},
      {number:25, name:'Project: Interactive Quiz App'},
      {number:26, name:'Project: Weather App'},
      {number:27, name:'Intro to Git & GitHub'},
      {number:28, name:'Deploying a Website'},
      {number:29, name:'Code Review & Debugging'},
      {number:30, name:'Accessibility & Best Practices'},
      {number:31, name:'Final Project Build'},
      {number:32, name:'Final Project Showcase'},
    ]
  },
  {
    id:'CRS004', name:'GCSE Maths Prep', desc:'Targeted support aligned to the GCSE syllabus. Master number, algebra, geometry and statistics.',
    subject:'maths', age:'Ages 14–16', price:109, classes:28, rating:4.9, students:401, emoji:'📐', color:'green', badge:'popular', level:'Intermediate', duration:'7 months',
    lessons:[
      {number:1,  name:'Number: Integers & Decimals'},
      {number:2,  name:'Fractions, Percentages & Ratios'},
      {number:3,  name:'Powers, Roots & Standard Form'},
      {number:4,  name:'Algebra: Simplifying Expressions'},
      {number:5,  name:'Solving Linear Equations'},
      {number:6,  name:'Inequalities'},
      {number:7,  name:'Simultaneous Equations'},
      {number:8,  name:'Quadratic Equations'},
      {number:9,  name:'Sequences & nth Term'},
      {number:10, name:'Straight Line Graphs'},
      {number:11, name:'Quadratic & Other Graphs'},
      {number:12, name:'Geometry: Angles & Polygons'},
      {number:13, name:'Area & Perimeter'},
      {number:14, name:'Volume & Surface Area'},
      {number:15, name:'Circles & Arcs'},
      {number:16, name:'Transformations'},
      {number:17, name:'Pythagoras Theorem'},
      {number:18, name:'Trigonometry: SOH CAH TOA'},
      {number:19, name:'Vectors'},
      {number:20, name:'Statistics: Mean, Median, Mode'},
      {number:21, name:'Frequency Tables & Histograms'},
      {number:22, name:'Probability'},
      {number:23, name:'Scatter Graphs & Correlation'},
      {number:24, name:'Mock Paper 1 — Non-Calculator'},
      {number:25, name:'Mock Paper 2 — Calculator'},
      {number:26, name:'Exam Technique & Timing'},
      {number:27, name:'Revision: Weak Areas'},
      {number:28, name:'Final Mock & Feedback'},
    ]
  },
  {
    id:'CRS005', name:'Primary Maths Boost', desc:'Build strong foundations in numbers, fractions, times tables and problem solving for KS2 learners.',
    subject:'maths', age:'Ages 7–11', price:79, classes:20, rating:4.8, students:293, emoji:'📊', color:'teal', badge:'', level:'Beginner', duration:'5 months',
    lessons:[
      {number:1,  name:'Counting & Place Value'},
      {number:2,  name:'Addition & Subtraction'},
      {number:3,  name:'Multiplication Tables (2, 5, 10)'},
      {number:4,  name:'Multiplication Tables (3, 4, 6)'},
      {number:5,  name:'Multiplication Tables (7, 8, 9)'},
      {number:6,  name:'Division Basics'},
      {number:7,  name:'Fractions: Halves & Quarters'},
      {number:8,  name:'Fractions: Thirds & Fifths'},
      {number:9,  name:'Comparing & Ordering Fractions'},
      {number:10, name:'Decimals & Money'},
      {number:11, name:'Percentages Introduction'},
      {number:12, name:'Measurement: Length & Mass'},
      {number:13, name:'Measurement: Time & Volume'},
      {number:14, name:'Shapes: 2D Properties'},
      {number:15, name:'Shapes: 3D Properties'},
      {number:16, name:'Perimeter & Area'},
      {number:17, name:'Data: Bar Charts & Pictograms'},
      {number:18, name:'Word Problems & Reasoning'},
      {number:19, name:'SATs Practice Paper'},
      {number:20, name:'Review & Celebration'},
    ]
  },
  {
    id:'CRS006', name:'A-Level Maths Mastery', desc:'Deep-dive into pure maths, statistics and mechanics for A-Level students aiming for top grades.',
    subject:'maths', age:'Ages 16–19', price:149, classes:40, rating:4.9, students:134, emoji:'🧠', color:'green', badge:'', level:'Advanced', duration:'10 months',
    lessons:[
      {number:1,  name:'Algebra & Functions Review'},
      {number:2,  name:'Quadratics & Discriminant'},
      {number:3,  name:'Equations & Inequalities'},
      {number:4,  name:'Graphs & Transformations'},
      {number:5,  name:'Straight Lines & Circles'},
      {number:6,  name:'Binomial Expansion'},
      {number:7,  name:'Trigonometry: Radians & Exact Values'},
      {number:8,  name:'Trigonometric Identities'},
      {number:9,  name:'Differentiation: First Principles'},
      {number:10, name:'Differentiation: Rules & Applications'},
      {number:11, name:'Integration: Indefinite'},
      {number:12, name:'Integration: Definite & Area'},
      {number:13, name:'Exponentials & Logarithms'},
      {number:14, name:'Sequences & Series'},
      {number:15, name:'Proof by Induction'},
      {number:16, name:'Vectors in 2D & 3D'},
      {number:17, name:'Further Differentiation'},
      {number:18, name:'Further Integration'},
      {number:19, name:'Differential Equations'},
      {number:20, name:'Numerical Methods'},
      {number:21, name:'Statistics: Data Representation'},
      {number:22, name:'Probability Distributions'},
      {number:23, name:'Normal Distribution'},
      {number:24, name:'Hypothesis Testing'},
      {number:25, name:'Correlation & Regression'},
      {number:26, name:'Mechanics: Kinematics'},
      {number:27, name:'Mechanics: Forces & Newton\'s Laws'},
      {number:28, name:'Mechanics: Moments'},
      {number:29, name:'Mechanics: Projectiles'},
      {number:30, name:'Mechanics: Friction'},
      {number:31, name:'Mock Paper 1 — Pure'},
      {number:32, name:'Mock Paper 2 — Statistics'},
      {number:33, name:'Mock Paper 3 — Mechanics'},
      {number:34, name:'Exam Technique Workshop'},
      {number:35, name:'Revision: Pure Weak Areas'},
      {number:36, name:'Revision: Statistics Weak Areas'},
      {number:37, name:'Revision: Mechanics Weak Areas'},
      {number:38, name:'Full Mock Exam'},
      {number:39, name:'Mock Feedback & Corrections'},
      {number:40, name:'Final Revision & Exam Prep'},
    ]
  },
  {
    id:'CRS007', name:'GCSE Biology', desc:'Cells, genetics, ecosystems and the human body — expert-led sessions covering the full GCSE spec.',
    subject:'sciences', age:'Ages 14–16', price:109, classes:28, rating:4.7, students:221, emoji:'🧬', color:'orange', badge:'', level:'Intermediate', duration:'7 months',
    lessons:[
      {number:1,  name:'Cell Structure & Organisation'},
      {number:2,  name:'Cell Division: Mitosis & Meiosis'},
      {number:3,  name:'Transport in Cells'},
      {number:4,  name:'Enzymes & Digestion'},
      {number:5,  name:'The Circulatory System'},
      {number:6,  name:'Respiration: Aerobic & Anaerobic'},
      {number:7,  name:'Photosynthesis'},
      {number:8,  name:'The Nervous System'},
      {number:9,  name:'Hormones & Homeostasis'},
      {number:10, name:'Reproduction & Fertilisation'},
      {number:11, name:'Genetics: DNA & Inheritance'},
      {number:12, name:'Genetic Disorders'},
      {number:13, name:'Evolution & Natural Selection'},
      {number:14, name:'Ecosystems & Food Webs'},
      {number:15, name:'Biodiversity & Conservation'},
      {number:16, name:'The Carbon & Nitrogen Cycle'},
      {number:17, name:'Disease & Immunity'},
      {number:18, name:'Drugs & Medicine'},
      {number:19, name:'Plant Biology'},
      {number:20, name:'Biotechnology & Genetic Engineering'},
      {number:21, name:'Required Practicals Review'},
      {number:22, name:'Mock Paper 1'},
      {number:23, name:'Mock Paper 2'},
      {number:24, name:'Mock Paper 3'},
      {number:25, name:'Exam Technique & Command Words'},
      {number:26, name:'Revision: Cells & Genetics'},
      {number:27, name:'Revision: Ecology & Disease'},
      {number:28, name:'Final Mock & Feedback'},
    ]
  },
  {
    id:'CRS008', name:'GCSE Chemistry', desc:'From atomic structure to organic chemistry — build exam confidence with a specialist chemistry tutor.',
    subject:'sciences', age:'Ages 14–16', price:109, classes:28, rating:4.8, students:198, emoji:'⚗️', color:'orange', badge:'', level:'Intermediate', duration:'7 months',
    lessons:[
      {number:1,  name:'Atomic Structure & the Periodic Table'},
      {number:2,  name:'Bonding: Ionic, Covalent & Metallic'},
      {number:3,  name:'Structure & Properties of Matter'},
      {number:4,  name:'Chemical Quantities & Moles'},
      {number:5,  name:'Chemical Changes: Acids & Bases'},
      {number:6,  name:'Electrolysis'},
      {number:7,  name:'Energy Changes in Reactions'},
      {number:8,  name:'Rate of Reaction'},
      {number:9,  name:'Equilibrium & Le Chatelier\'s Principle'},
      {number:10, name:'Crude Oil & Hydrocarbons'},
      {number:11, name:'Organic Chemistry: Alkanes & Alkenes'},
      {number:12, name:'Alcohols, Carboxylic Acids & Esters'},
      {number:13, name:'Polymers & Plastics'},
      {number:14, name:'Chemical Analysis'},
      {number:15, name:'The Atmosphere & Climate Change'},
      {number:16, name:'Using Resources Sustainably'},
      {number:17, name:'Metals & Extraction'},
      {number:18, name:'Transition Metals'},
      {number:19, name:'Required Practicals Review'},
      {number:20, name:'Calculations: Yield & Atom Economy'},
      {number:21, name:'Calculations: Concentration & Titration'},
      {number:22, name:'Mock Paper 1'},
      {number:23, name:'Mock Paper 2'},
      {number:24, name:'Mock Paper 3'},
      {number:25, name:'Exam Technique Workshop'},
      {number:26, name:'Revision: Atomic Structure & Bonding'},
      {number:27, name:'Revision: Organic Chemistry'},
      {number:28, name:'Final Mock & Feedback'},
    ]
  },
  {
    id:'CRS009', name:'A-Level Physics', desc:'Mechanics, waves, electricity and modern physics — for students pushing for top university offers.',
    subject:'sciences', age:'Ages 16–19', price:149, classes:40, rating:4.9, students:97, emoji:'🛰️', color:'teal', badge:'new', level:'Advanced', duration:'10 months',
    lessons:[
      {number:1,  name:'Measurements & Uncertainties'},
      {number:2,  name:'Kinematics: Motion Graphs'},
      {number:3,  name:'Dynamics: Newton\'s Laws'},
      {number:4,  name:'Work, Energy & Power'},
      {number:5,  name:'Momentum & Collisions'},
      {number:6,  name:'Circular Motion'},
      {number:7,  name:'Gravitational Fields'},
      {number:8,  name:'Simple Harmonic Motion'},
      {number:9,  name:'Waves: Properties & Types'},
      {number:10, name:'Superposition & Interference'},
      {number:11, name:'Diffraction & Young\'s Slits'},
      {number:12, name:'Refraction & Optical Fibres'},
      {number:13, name:'Electric Fields'},
      {number:14, name:'Current, Voltage & Resistance'},
      {number:15, name:'DC Circuits & Kirchhoff\'s Laws'},
      {number:16, name:'Capacitors'},
      {number:17, name:'Magnetic Fields & Forces'},
      {number:18, name:'Electromagnetic Induction'},
      {number:19, name:'Alternating Current'},
      {number:20, name:'Quantum Physics: Photoelectric Effect'},
      {number:21, name:'Wave-Particle Duality'},
      {number:22, name:'Atomic Models & Spectra'},
      {number:23, name:'Radioactivity & Nuclear Decay'},
      {number:24, name:'Nuclear Fission & Fusion'},
      {number:25, name:'Medical Physics (optional)'},
      {number:26, name:'Astrophysics: Stars & Galaxies'},
      {number:27, name:'Cosmology & the Big Bang'},
      {number:28, name:'Required Practicals Review'},
      {number:29, name:'Data Analysis & Graphs'},
      {number:30, name:'Mock Paper 1 — Mechanics'},
      {number:31, name:'Mock Paper 2 — Electricity & Waves'},
      {number:32, name:'Mock Paper 3 — Modern Physics'},
      {number:33, name:'Exam Technique Workshop'},
      {number:34, name:'Revision: Mechanics & Fields'},
      {number:35, name:'Revision: Waves & Electricity'},
      {number:36, name:'Revision: Quantum & Nuclear'},
      {number:37, name:'Full Mock Exam'},
      {number:38, name:'Mock Feedback & Corrections'},
      {number:39, name:'Final Revision Sprint'},
      {number:40, name:'Exam Prep & Confidence Session'},
    ]
  },
];

/* ── Load courses from localStorage (admin-managed) ── */
function getCourses() {
  try {
    const stored = JSON.parse(localStorage.getItem('sn_courses') || '[]');
    // If stored courses don't have lesson data yet, refresh with defaults
    if (stored.length === 0 || !stored[0].lessons) {
      localStorage.setItem('sn_courses', JSON.stringify(DEFAULT_COURSES));
      return DEFAULT_COURSES;
    }
    return stored;
  } catch { return DEFAULT_COURSES; }
}

let courses      = [];
let activeFilter = 'all';
let activeSort   = 'default';

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  courses = getCourses();
  renderGrid();
  bindFilterTabs();
  bindSortSelect();
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
    grid.innerHTML = '<div class="no-results"><p>No courses in this category yet.</p></div>';
    return;
  }
  list.forEach(c => grid.appendChild(buildCard(c)));
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
      <div class="card-id-pill">ID: ${c.id}</div>
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
        <a href="free-trial.html" class="enroll-btn">Enrol Now →</a>
      </div>
    </div>`;

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
