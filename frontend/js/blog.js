/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — BLOG LISTING PAGE (blog.js)
   Search, filter by category, pagination.
   Clicking a post navigates to blog-post.html?id=xxx
═══════════════════════════════════════════════════════ */

/* ── STATE ── */
let allBlogPosts    = [];
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
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/blogs');
    const data = await res.json();
    if (data.success) {
      allBlogPosts = data.posts;
    }
  } catch(e) {
    console.error('Failed to load blogs:', e);
  }
  
  renderBlogList();
  renderSidebar();
  bindSearch();
});

/* ── FILTERED POSTS ── */
function getFilteredPosts() {
  let posts = allBlogPosts.filter(p => p.is_published || p.published);
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
          '<div class="blog-card-author"><div class="blog-card-avatar">' + (post.authorInitials || post.author_name.slice(0,2).toUpperCase()) + '</div><span>' + post.author_name + '</span></div>' +
          '<span>📅 ' + formatBlogDate(post.published_at || post.date) + '</span>' +
          '<span>⏱ ' + readTime(post.content || post.body) + ' min read</span>' +
        '</div>' +
        '<div class="blog-card-read-more">Read more →</div>' +
      '</div>' +
    '</div>';
  }).join('');

  renderPagination(total);
}

/* ── NAVIGATE TO POST ── */
function goToPost(postSlug) {
  window.location.href = 'blog-post.html?slug=' + postSlug;
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
  const posts = allBlogPosts.filter(function(p) { return p.is_published || p.published; });
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
  const recent = allBlogPosts
    .filter(function(p) { return p.is_published || p.published; })
    .sort(function(a, b) { return new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt); })
    .slice(0, 4);
  el.innerHTML = recent.map(function(p) {
    const thumb = p.coverImage
      ? '<img src="' + p.coverImage + '" alt="">'
      : (p.emoji || '📝');
    return '<div class="sidebar-recent-item" onclick="goToPost(\'' + (p.slug || p.id) + '\')">' +
      '<div class="sidebar-recent-thumb">' + thumb + '</div>' +
      '<div><div class="sidebar-recent-title">' + p.title + '</div>' +
      '<div class="sidebar-recent-date">📅 ' + formatBlogDate(p.published_at || p.date) + '</div></div>' +
    '</div>';
  }).join('');
}

function renderSidebarTags() {
  const el = document.getElementById('sidebarTags');
  if (!el) return;
  const allTags = allBlogPosts
    .filter(function(p) { return p.is_published || p.published; })
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
