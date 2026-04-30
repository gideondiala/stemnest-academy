/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — BLOG LISTING PAGE (blog.js)
   Search, filter by category, pagination.
   Clicking a post navigates to blog-post.html?id=xxx
═══════════════════════════════════════════════════════ */

/* ── SEED DEMO POSTS (once) ── */
function seedDemoPosts() {
  if (localStorage.getItem('sn_blog_seeded')) return;
  const posts = [
    {
      id: 'post-001',
      title: 'How to Build Your First Python Game in 30 Minutes',
      category: 'learn-by-doing',
      tags: ['Python','Beginner','Games','Coding'],
      author: 'Sarah Rahman', authorInitials: 'SR',
      date: '2026-04-10', emoji: '🎮', coverImage: '',
      excerpt: 'Learn how to build a classic number guessing game in Python from scratch. No experience needed — just a computer and curiosity.',
      body: [
        '<h2>What You\'ll Build</h2>',
        '<p>By the end of this tutorial you\'ll have a fully working number guessing game in Python. The computer picks a secret number between 1 and 100, and the player has to guess it. The game gives hints — "Too high!" or "Too low!" — until the player gets it right.</p>',
        '<h2>What You Need</h2>',
        '<ul><li>Python installed on your computer (download from <strong>python.org</strong>)</li><li>A text editor — VS Code is great for beginners</li><li>About 30 minutes of focus</li></ul>',
        '<h2>Step 1 — Import the random module</h2>',
        '<p>Python has a built-in module called <code>random</code> that generates random numbers. Start your file with:</p>',
        '<pre><code>import random</code></pre>',
        '<h2>Step 2 — Generate the secret number</h2>',
        '<pre><code>secret = random.randint(1, 100)\nattempts = 0</code></pre>',
        '<h2>Step 3 — Build the game loop</h2>',
        '<pre><code>while True:\n    guess = int(input("Guess a number between 1 and 100: "))\n    attempts += 1\n    if guess &lt; secret:\n        print("Too low! Try again.")\n    elif guess &gt; secret:\n        print("Too high! Try again.")\n    else:\n        print(f"Correct! You got it in {attempts} attempts.")\n        break</code></pre>',
        '<h2>Step 4 — Run it!</h2>',
        '<p>Save the file as <code>guessing_game.py</code> and run it in your terminal with <code>python guessing_game.py</code>. That is it — your first Python game!</p>',
        '<h2>Challenge: Make it harder</h2>',
        '<p>Try limiting the player to only 7 guesses. If they run out, the game ends and reveals the secret number. Can you add that feature yourself?</p>',
      ].join(''),
      published: true, createdAt: '2026-04-10T09:00:00Z',
    },
    {
      id: 'post-002',
      title: 'Python vs JavaScript — Which Should a Beginner Learn First?',
      category: 'tech-explained',
      tags: ['Python','JavaScript','Beginners','Comparison'],
      author: 'James Okafor', authorInitials: 'JO',
      date: '2026-04-14', emoji: '⚖️', coverImage: '',
      excerpt: 'Two of the most popular programming languages in the world. But which one is right for you as a beginner? We break it down clearly.',
      body: [
        '<h2>The Short Answer</h2>',
        '<p>If you want to build websites, start with <strong>JavaScript</strong>. If you want to learn programming logic, data science, or AI, start with <strong>Python</strong>. For most beginners aged 7–19, we recommend Python first.</p>',
        '<h2>Why Python Wins for Beginners</h2>',
        '<ul><li><strong>Readable syntax</strong> — Python reads almost like English. <code>print("Hello")</code> is all you need to display text.</li><li><strong>Less boilerplate</strong> — No semicolons, curly braces, or type declarations to worry about.</li><li><strong>Versatile</strong> — Used in web development, data science, AI, and automation.</li><li><strong>Huge community</strong> — Millions of tutorials and resources available for free.</li></ul>',
        '<h2>When JavaScript Makes More Sense</h2>',
        '<p>JavaScript is the language of the web. If your goal is to build interactive websites or web apps, JavaScript is unavoidable. It runs in every browser and is the only language that works natively on the front end of the web.</p>',
        '<blockquote>Think of Python as learning to drive in a car park. JavaScript is driving on the motorway — more powerful, but more to manage.</blockquote>',
        '<h2>Our Recommendation at StemNest</h2>',
        '<p>We teach Python first in our Coding programme because it builds strong logical thinking without overwhelming beginners with syntax. Once students are comfortable with Python, picking up JavaScript becomes much easier.</p>',
      ].join(''),
      published: true, createdAt: '2026-04-14T10:00:00Z',
    },
    {
      id: 'post-003',
      title: 'How to Set Up VS Code for Python in 5 Minutes',
      category: 'learn-by-doing',
      tags: ['VS Code','Python','Setup','Tools'],
      author: 'Sarah Rahman', authorInitials: 'SR',
      date: '2026-04-18', emoji: '🛠️', coverImage: '',
      excerpt: 'VS Code is the most popular code editor in the world. Here is how to get it set up for Python development in just 5 minutes.',
      body: [
        '<h2>Why VS Code?</h2>',
        '<p>Visual Studio Code is free, fast, and packed with features. It works on Windows, Mac, and Linux. Most professional developers use it daily.</p>',
        '<h2>Step 1 — Download VS Code</h2>',
        '<p>Go to <strong>code.visualstudio.com</strong> and download the version for your operating system. Run the installer.</p>',
        '<h2>Step 2 — Install the Python Extension</h2>',
        '<p>Open VS Code. Press <code>Ctrl+Shift+X</code> to open the Extensions panel. Search for <strong>Python</strong> and install the one by Microsoft.</p>',
        '<h2>Step 3 — Select Your Python Interpreter</h2>',
        '<p>Press <code>Ctrl+Shift+P</code> and type <strong>Python: Select Interpreter</strong>. Choose the Python version you installed.</p>',
        '<h2>Step 4 — Create Your First File</h2>',
        '<p>Create a new file called <code>hello.py</code> and type:</p>',
        '<pre><code>print("Hello, StemNest!")</code></pre>',
        '<p>Press the Run button at the top right. You should see your message in the terminal below. You are ready to code!</p>',
      ].join(''),
      published: true, createdAt: '2026-04-18T08:00:00Z',
    },
    {
      id: 'post-004',
      title: 'Scratch vs Roblox — Which is Better for Young Coders?',
      category: 'tech-explained',
      tags: ['Scratch','Roblox','Kids','Game Design'],
      author: 'Marcus King', authorInitials: 'MK',
      date: '2026-04-20', emoji: '🕹️', coverImage: '',
      excerpt: 'Both Scratch and Roblox are popular with young coders. But they serve very different purposes. Here is how to choose the right one.',
      body: [
        '<h2>What is Scratch?</h2>',
        '<p>Scratch is a visual programming language developed by MIT. It uses drag-and-drop blocks to teach programming concepts. It is designed for ages 8–16 and is completely free.</p>',
        '<h2>What is Roblox Studio?</h2>',
        '<p>Roblox Studio is the game creation tool for the Roblox platform. It uses a language called Lua and is more complex than Scratch. It is better suited for students aged 12 and above who already have some coding experience.</p>',
        '<h2>Key Differences</h2>',
        '<ul><li><strong>Age range:</strong> Scratch (8–12), Roblox Studio (12+)</li><li><strong>Language:</strong> Scratch uses visual blocks; Roblox uses Lua (text-based)</li><li><strong>Complexity:</strong> Scratch is simpler; Roblox has a steeper learning curve</li><li><strong>Output:</strong> Scratch makes animations and simple games; Roblox makes 3D multiplayer games</li></ul>',
        '<h2>Our Verdict</h2>',
        '<p>Start with Scratch. It teaches the fundamentals — loops, conditions, events — without the frustration of syntax errors. Once a student is comfortable with those concepts, Roblox Studio becomes a natural and exciting next step.</p>',
      ].join(''),
      published: true, createdAt: '2026-04-20T11:00:00Z',
    },
    {
      id: 'post-005',
      title: '5 Python Projects Every Beginner Should Build',
      category: 'learn-by-doing',
      tags: ['Python','Projects','Beginner','Practice'],
      author: 'Sarah Rahman', authorInitials: 'SR',
      date: '2026-04-22', emoji: '🚀', coverImage: '',
      excerpt: 'The best way to learn Python is by building things. Here are 5 beginner-friendly projects that will teach you real skills.',
      body: [
        '<h2>Why Projects Matter</h2>',
        '<p>Reading about Python is useful. But building things is how you actually learn. Each project below teaches a specific set of skills and gets progressively more challenging.</p>',
        '<h2>Project 1 — Number Guessing Game</h2>',
        '<p>Skills: loops, conditionals, user input, random numbers. The perfect starting point.</p>',
        '<h2>Project 2 — Simple Calculator</h2>',
        '<p>Skills: functions, arithmetic operators, input validation. Build a calculator that can add, subtract, multiply, and divide two numbers entered by the user.</p>',
        '<h2>Project 3 — To-Do List App</h2>',
        '<p>Skills: lists, loops, string manipulation, file handling. Build a command-line app where users can add tasks, view them, and mark them as done.</p>',
        '<h2>Project 4 — Password Generator</h2>',
        '<p>Skills: random module, string module, functions. Generate strong random passwords of a chosen length using letters, numbers, and symbols.</p>',
        '<h2>Project 5 — Weather App (with API)</h2>',
        '<p>Skills: APIs, JSON, requests library, error handling. Fetch real weather data from the internet and display it in the terminal. This is your first taste of real-world programming.</p>',
        '<h2>Where to Start</h2>',
        '<p>Pick Project 1 and work your way up. Do not skip ahead — each project builds on the last. Getting stuck is part of learning. Google is your friend.</p>',
      ].join(''),
      published: true, createdAt: '2026-04-22T09:00:00Z',
    },
  ];
  localStorage.setItem('sn_blog_posts', JSON.stringify(posts));
  localStorage.setItem('sn_blog_seeded', '1');
}

/* ── DATA ── */
function getBlogPosts() {
  try { return JSON.parse(localStorage.getItem('sn_blog_posts') || '[]'); } catch { return []; }
}

/* ── STATE ── */
let currentCategory = 'all';
let currentSearch   = '';
let currentPage     = 1;
const POSTS_PER_PAGE = 6;

const CATEGORIES = {
  'all':            { label: 'All Posts',      emoji: '📚', color: 'cat-learn' },
  'learn-by-doing': { label: 'Learn by Doing', emoji: '🛠️', color: 'cat-learn' },
  'tech-explained': { label: 'Tech Explained', emoji: '💡', color: 'cat-tech'  },
  'news':           { label: 'EdTech News',    emoji: '📰', color: 'cat-news'  },
  'tips':           { label: 'Study Tips',     emoji: '✏️', color: 'cat-tips'  },
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  seedDemoPosts();
  renderBlogList();
  renderSidebar();
  bindSearch();
});

/* ── FILTERED POSTS ── */
function getFilteredPosts() {
  let posts = getBlogPosts().filter(p => p.published);
  if (currentCategory !== 'all') posts = posts.filter(p => p.category === currentCategory);
  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase();
    posts = posts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
      p.author.toLowerCase().includes(q)
    );
  }
  return posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* ── RENDER LIST ── */
function renderBlogList() {
  const posts     = getFilteredPosts();
  const total     = posts.length;
  const start     = (currentPage - 1) * POSTS_PER_PAGE;
  const pagePosts = posts.slice(start, start + POSTS_PER_PAGE);

  const countEl = document.getElementById('blogResultsCount');
  if (countEl) {
    countEl.textContent =
      total + ' post' + (total !== 1 ? 's' : '') +
      (currentSearch ? ' for "' + currentSearch + '"' : '') +
      (currentCategory !== 'all' ? ' in ' + (CATEGORIES[currentCategory]?.label || '') : '');
  }

  const gridEl = document.getElementById('blogPostGrid');
  if (!gridEl) return;

  if (!pagePosts.length) {
    gridEl.innerHTML = '<div class="blog-empty"><div class="blog-empty-icon">🔍</div><div class="blog-empty-title">No posts found</div><div class="blog-empty-sub">Try a different search term or category.</div></div>';
    const pag = document.getElementById('blogPagination');
    if (pag) pag.innerHTML = '';
    return;
  }

  gridEl.innerHTML = pagePosts.map(function(post, i) {
    const cat     = CATEGORIES[post.category] || CATEGORIES['learn-by-doing'];
    const isFirst = i === 0 && currentPage === 1 && !currentSearch && currentCategory === 'all';
    const thumb   = post.coverImage
      ? '<img src="' + post.coverImage + '" alt="' + post.title + '">'
      : '<span style="font-size:56px;">' + (post.emoji || '📝') + '</span>';
    return '<div class="blog-card' + (isFirst ? ' blog-card-featured' : '') + '" onclick="goToPost(\'' + post.id + '\')">' +
      '<div class="blog-card-img">' + thumb + '</div>' +
      '<div class="blog-card-body">' +
        '<span class="blog-card-cat ' + cat.color + '">' + cat.emoji + ' ' + cat.label + '</span>' +
        '<div class="blog-card-title">' + post.title + '</div>' +
        '<div class="blog-card-excerpt">' + post.excerpt + '</div>' +
        '<div class="blog-card-meta">' +
          '<div class="blog-card-author"><div class="blog-card-avatar">' + (post.authorInitials || post.author.slice(0,2).toUpperCase()) + '</div><span>' + post.author + '</span></div>' +
          '<span>📅 ' + formatBlogDate(post.date) + '</span>' +
          '<span>⏱ ' + readTime(post.body) + ' min read</span>' +
        '</div>' +
        '<div class="blog-card-read-more">Read more →</div>' +
      '</div>' +
    '</div>';
  }).join('');

  renderPagination(total);
}

/* ── NAVIGATE TO POST ── */
function goToPost(postId) {
  window.location.href = 'blog-post.html?id=' + postId;
}

/* ── PAGINATION ── */
function renderPagination(total) {
  const pages = Math.ceil(total / POSTS_PER_PAGE);
  const el    = document.getElementById('blogPagination');
  if (!el || pages <= 1) { if (el) el.innerHTML = ''; return; }
  let html = '';
  if (currentPage > 1) html += '<button class="blog-page-btn" onclick="goPage(' + (currentPage - 1) + ')">‹</button>';
  for (let p = 1; p <= pages; p++) {
    html += '<button class="blog-page-btn' + (p === currentPage ? ' active' : '') + '" onclick="goPage(' + p + ')">' + p + '</button>';
  }
  if (currentPage < pages) html += '<button class="blog-page-btn" onclick="goPage(' + (currentPage + 1) + ')">›</button>';
  el.innerHTML = html;
}

function goPage(p) {
  currentPage = p;
  renderBlogList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── CATEGORY FILTER ── */
function filterByCategory(cat) {
  currentCategory = cat;
  currentPage     = 1;
  renderBlogList();
  renderSidebarCategories();
  document.querySelectorAll('.blog-cat-pill').forEach(function(el) {
    el.classList.toggle('active', el.dataset.cat === cat);
  });
}

/* ── SEARCH ── */
function bindSearch() {
  const input = document.getElementById('blogSearchInput');
  const btn   = document.getElementById('blogSearchBtn');
  if (input) input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSearch(); });
  if (btn)   btn.addEventListener('click', doSearch);
}

function doSearch() {
  const input     = document.getElementById('blogSearchInput');
  currentSearch   = input ? input.value.trim() : '';
  currentPage     = 1;
  currentCategory = 'all';
  document.querySelectorAll('.blog-cat-pill').forEach(function(el) { el.classList.remove('active'); });
  const allPill = document.querySelector('.blog-cat-pill[data-cat="all"]');
  if (allPill) allPill.classList.add('active');
  renderBlogList();
  renderSidebarCategories();
  const layout = document.getElementById('blogLayout');
  if (layout) layout.scrollIntoView({ behavior: 'smooth' });
}

function searchTag(tag) {
  const input = document.getElementById('blogSearchInput');
  if (input) input.value = tag;
  currentSearch   = tag;
  currentPage     = 1;
  currentCategory = 'all';
  renderBlogList();
  renderSidebarCategories();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── SIDEBAR ── */
function renderSidebar() {
  renderSidebarCategories();
  renderSidebarRecent();
  renderSidebarTags();
}

function renderSidebarCategories() {
  const el    = document.getElementById('sidebarCats');
  if (!el) return;
  const posts = getBlogPosts().filter(function(p) { return p.published; });
  el.innerHTML = Object.entries(CATEGORIES).map(function(entry) {
    const key   = entry[0];
    const cat   = entry[1];
    const count = key === 'all' ? posts.length : posts.filter(function(p) { return p.category === key; }).length;
    return '<div class="sidebar-cat-item' + (currentCategory === key ? ' active' : '') + '" onclick="filterByCategory(\'' + key + '\')">' +
      '<span>' + cat.emoji + ' ' + cat.label + '</span>' +
      '<span class="sidebar-cat-count">' + count + '</span>' +
    '</div>';
  }).join('');
}

function renderSidebarRecent() {
  const el = document.getElementById('sidebarRecent');
  if (!el) return;
  const recent = getBlogPosts()
    .filter(function(p) { return p.published; })
    .sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
    .slice(0, 4);
  el.innerHTML = recent.map(function(p) {
    const thumb = p.coverImage
      ? '<img src="' + p.coverImage + '" alt="">'
      : (p.emoji || '📝');
    return '<div class="sidebar-recent-item" onclick="goToPost(\'' + p.id + '\')">' +
      '<div class="sidebar-recent-thumb">' + thumb + '</div>' +
      '<div><div class="sidebar-recent-title">' + p.title + '</div>' +
      '<div class="sidebar-recent-date">📅 ' + formatBlogDate(p.date) + '</div></div>' +
    '</div>';
  }).join('');
}

function renderSidebarTags() {
  const el = document.getElementById('sidebarTags');
  if (!el) return;
  const allTags = getBlogPosts()
    .filter(function(p) { return p.published; })
    .reduce(function(acc, p) { return acc.concat(p.tags || []); }, []);
  const unique = allTags.filter(function(t, i) { return allTags.indexOf(t) === i; }).slice(0, 20);
  el.innerHTML = unique.map(function(t) {
    return '<span class="sidebar-tag" onclick="searchTag(\'' + t + '\')">' + t + '</span>';
  }).join('');
}

/* ── HELPERS ── */
function formatBlogDate(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch(e) { return dateStr; }
}

function readTime(body) {
  if (!body) return 1;
  const words = body.replace(/<[^>]+>/g, '').split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
