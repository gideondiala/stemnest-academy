/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — SINGLE BLOG POST PAGE (blog-post.js)
   Reads ?id= from URL, renders full post + sidebar.
═══════════════════════════════════════════════════════ */

const CATEGORIES = {
  'all':            { label: 'All Posts',      emoji: '📚', color: 'cat-learn' },
  'learn-by-doing': { label: 'Learn by Doing', emoji: '🛠️', color: 'cat-learn' },
  'tech-explained': { label: 'Tech Explained', emoji: '💡', color: 'cat-tech'  },
  'news':           { label: 'EdTech News',    emoji: '📰', color: 'cat-news'  },
  'tips':           { label: 'Study Tips',     emoji: '✏️', color: 'cat-tips'  },
};

/* ── DATA ── */
function getBlogPosts() {
  try { return JSON.parse(localStorage.getItem('sn_blog_posts') || '[]'); } catch { return []; }
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', function() {
  var params = new URLSearchParams(window.location.search);
  var postId = params.get('id');

  if (!postId) {
    showNotFound();
    return;
  }

  var post = getBlogPosts().find(function(p) { return p.id === postId; });

  if (!post || !post.published) {
    showNotFound();
    return;
  }

  renderPost(post);
  renderSidebar(post);

  // Wire up search to go back to blog listing with query
  var searchInput = document.getElementById('blogSearchInput');
  var searchBtn   = document.getElementById('blogSearchBtn');
  if (searchInput) {
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') goSearch();
    });
  }
  if (searchBtn) searchBtn.addEventListener('click', goSearch);
});

function goSearch() {
  var input = document.getElementById('blogSearchInput');
  var q     = input ? input.value.trim() : '';
  if (q) window.location.href = 'blog.html?search=' + encodeURIComponent(q);
  else   window.location.href = 'blog.html';
}

/* ── RENDER POST ── */
function renderPost(post) {
  var cat = CATEGORIES[post.category] || CATEGORIES['learn-by-doing'];

  // Update page title and meta
  document.getElementById('postPageTitle').textContent = post.title + ' – StemNest Academy';
  var descEl = document.getElementById('postPageDesc');
  if (descEl) descEl.setAttribute('content', post.excerpt || '');

  var heroImg = post.coverImage
    ? '<img src="' + post.coverImage + '" alt="' + post.title + '" style="width:100%;height:100%;object-fit:cover;border-radius:20px;">'
    : '<span style="font-size:80px;">' + (post.emoji || '📝') + '</span>';

  var tagsHtml = (post.tags || []).map(function(t) {
    return '<span class="post-tag">#' + t + '</span>';
  }).join('');

  var html =
    '<button class="post-back-btn" onclick="window.location.href=\'blog.html\'">← Back to Blog</button>' +

    '<div class="post-hero-img">' + heroImg + '</div>' +

    '<div class="post-title">' + post.title + '</div>' +

    '<div class="post-meta-bar">' +
      '<div class="post-author-chip">' +
        '<div class="post-author-av">' + (post.authorInitials || post.author.slice(0,2).toUpperCase()) + '</div>' +
        '<span>' + post.author + '</span>' +
      '</div>' +
      '<span>📅 ' + formatBlogDate(post.date) + '</span>' +
      '<span>⏱ ' + readTime(post.body) + ' min read</span>' +
      '<span class="blog-card-cat ' + cat.color + '" style="margin:0;">' + cat.emoji + ' ' + cat.label + '</span>' +
    '</div>' +

    '<div class="post-body">' + post.body + '</div>' +

    (tagsHtml ? '<div class="post-tags">' + tagsHtml + '</div>' : '') +

    '<div class="post-cta-banner">' +
      '<div class="post-cta-text">' +
        '<h3>🎓 New to StemNest Academy?</h3>' +
        '<p>Book a completely free demo class and learn with the best tutors — no commitment, no card required.</p>' +
      '</div>' +
      '<a href="free-trial.html" class="post-cta-btn">Book a Free Trial →</a>' +
    '</div>' +

    '<div id="relatedPostsSection" style="margin-top:40px;">' +
      '<div style="font-family:\'Fredoka One\',cursive;font-size:22px;color:var(--dark);margin-bottom:20px;">📚 Related Posts</div>' +
      '<div class="related-posts-grid" id="relatedPosts"></div>' +
    '</div>';

  var container = document.getElementById('postContent');
  if (container) container.innerHTML = html;

  // Render related posts
  var related = getBlogPosts()
    .filter(function(p) { return p.published && p.id !== post.id && p.category === post.category; })
    .slice(0, 3);

  var relEl = document.getElementById('relatedPosts');
  if (relEl) {
    if (related.length) {
      relEl.innerHTML = related.map(function(p) {
        var thumb = p.coverImage
          ? '<img src="' + p.coverImage + '" alt="">'
          : '<span style="font-size:40px;">' + (p.emoji || '📝') + '</span>';
        return '<div class="blog-card" onclick="window.location.href=\'blog-post.html?id=' + p.id + '\'">' +
          '<div class="blog-card-img" style="height:140px;">' + thumb + '</div>' +
          '<div class="blog-card-body">' +
            '<div class="blog-card-title" style="font-size:15px;">' + p.title + '</div>' +
            '<div class="blog-card-meta" style="margin-top:8px;"><span>📅 ' + formatBlogDate(p.date) + '</span></div>' +
          '</div>' +
        '</div>';
      }).join('');
    } else {
      relEl.innerHTML = '<div style="color:var(--light);font-size:14px;font-weight:700;">No related posts yet.</div>';
    }
  }
}

/* ── SIDEBAR ── */
function renderSidebar(currentPost) {
  renderSidebarCategories();
  renderSidebarRecent(currentPost ? currentPost.id : null);
  renderSidebarTags();
}

function renderSidebarCategories() {
  var el    = document.getElementById('sidebarCats');
  if (!el) return;
  var posts = getBlogPosts().filter(function(p) { return p.published; });
  el.innerHTML = Object.entries(CATEGORIES).map(function(entry) {
    var key   = entry[0];
    var cat   = entry[1];
    var count = key === 'all' ? posts.length : posts.filter(function(p) { return p.category === key; }).length;
    var href  = 'blog.html' + (key !== 'all' ? '?cat=' + key : '');
    return '<div class="sidebar-cat-item" onclick="window.location.href=\'' + href + '\'">' +
      '<span>' + cat.emoji + ' ' + cat.label + '</span>' +
      '<span class="sidebar-cat-count">' + count + '</span>' +
    '</div>';
  }).join('');
}

function renderSidebarRecent(currentId) {
  var el = document.getElementById('sidebarRecent');
  if (!el) return;
  var recent = getBlogPosts()
    .filter(function(p) { return p.published && p.id !== currentId; })
    .sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
    .slice(0, 4);
  el.innerHTML = recent.map(function(p) {
    var thumb = p.coverImage
      ? '<img src="' + p.coverImage + '" alt="">'
      : (p.emoji || '📝');
    return '<div class="sidebar-recent-item" onclick="window.location.href=\'blog-post.html?id=' + p.id + '\'">' +
      '<div class="sidebar-recent-thumb">' + thumb + '</div>' +
      '<div><div class="sidebar-recent-title">' + p.title + '</div>' +
      '<div class="sidebar-recent-date">📅 ' + formatBlogDate(p.date) + '</div></div>' +
    '</div>';
  }).join('');
}

function renderSidebarTags() {
  var el = document.getElementById('sidebarTags');
  if (!el) return;
  var allTags = getBlogPosts()
    .filter(function(p) { return p.published; })
    .reduce(function(acc, p) { return acc.concat(p.tags || []); }, []);
  var unique = allTags.filter(function(t, i) { return allTags.indexOf(t) === i; }).slice(0, 20);
  el.innerHTML = unique.map(function(t) {
    return '<span class="sidebar-tag" onclick="window.location.href=\'blog.html?search=' + encodeURIComponent(t) + '\'">' + t + '</span>';
  }).join('');
}

/* ── NOT FOUND ── */
function showNotFound() {
  var container = document.getElementById('postContent');
  if (container) {
    container.innerHTML =
      '<div style="text-align:center;padding:80px 20px;">' +
        '<div style="font-size:64px;margin-bottom:20px;">😕</div>' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:28px;color:var(--dark);margin-bottom:12px;">Post not found</div>' +
        '<div style="font-size:15px;color:var(--light);margin-bottom:28px;">This post may have been removed or the link is incorrect.</div>' +
        '<a href="blog.html" class="btn btn-blue">← Back to Blog</a>' +
      '</div>';
  }
}

/* ── HELPERS ── */
function formatBlogDate(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch(e) { return dateStr; }
}

function readTime(body) {
  if (!body) return 1;
  var words = body.replace(/<[^>]+>/g, '').split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
