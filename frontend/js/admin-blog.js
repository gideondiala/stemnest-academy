/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — ADMIN BLOG MANAGER (admin-blog.js)
   Post creator, editor, publisher, ad settings.
   Hooks into the existing showAdminTab() system.
═══════════════════════════════════════════════════════ */

/* ── DATA HELPERS ── */
function getBlogPosts()   { try { return JSON.parse(localStorage.getItem("sn_blog_posts") || "[]"); } catch { return []; } }
function saveBlogPosts(p) { localStorage.setItem("sn_blog_posts", JSON.stringify(p)); updateBlogBadge(); }
function getBlogSettings()   { try { return JSON.parse(localStorage.getItem("sn_blog_settings") || "{}"); } catch { return {}; } }
function saveBlogSettings(s) { localStorage.setItem("sn_blog_settings", JSON.stringify(s)); }

function updateBlogBadge() {
  const el = document.getElementById("blogBadge");
  if (el) el.textContent = getBlogPosts().filter(p => p.published).length;
}

/* ── INJECT BLOG TABS INTO DASH-MAIN ── */
function injectBlogTabs() {
  const dashMain = document.querySelector(".dash-main");
  if (!dashMain || document.getElementById("tab-blog-posts")) return;

  const html = `
    <!-- BLOG: ALL POSTS -->
    <div id="tab-blog-posts" style="display:none;">
      <div class="dash-section-header">
        <div class="dash-section-title">✍️ Blog Posts</div>
        <button class="btn btn-primary" style="font-size:13px;padding:9px 20px;" onclick="showAdminTab('blog-new')">➕ New Post</button>
      </div>
      <div id="adminBlogList"></div>
    </div>

    <!-- BLOG: NEW / EDIT POST -->
    <div id="tab-blog-new" style="display:none;">
      <div class="dash-section-header">
        <div class="dash-section-title" id="blogEditorTitle">✍️ New Blog Post</div>
        <button class="btn btn-outline" style="font-size:13px;" onclick="showAdminTab('blog-posts')">← All Posts</button>
      </div>
      <div class="add-teacher-form-wrap">
        <form class="add-teacher-form" onsubmit="return false;" id="blogPostForm">

          <div class="atf-section-title">📝 Post Details</div>
          <input type="hidden" id="bp-id">
          <div class="atf-grid">
            <div class="atf-field atf-full">
              <label>Post Title <span class="req">*</span></label>
              <input type="text" id="bp-title" placeholder="e.g. How to Build Your First Python Game">
            </div>
            <div class="atf-field">
              <label>Category <span class="req">*</span></label>
              <select id="bp-category">
                <option value="learn-by-doing">🛠️ Learn by Doing</option>
                <option value="tech-explained">💡 Tech Explained</option>
                <option value="news">📰 EdTech News</option>
                <option value="tips">✏️ Study Tips</option>
              </select>
            </div>
            <div class="atf-field">
              <label>Author Name <span class="req">*</span></label>
              <input type="text" id="bp-author" placeholder="e.g. Sarah Rahman">
            </div>
            <div class="atf-field">
              <label>Publish Date</label>
              <input type="date" id="bp-date">
            </div>
            <div class="atf-field">
              <label>Cover Image URL (optional)</label>
              <input type="url" id="bp-image" placeholder="https://... or leave blank for emoji">
            </div>
            <div class="atf-field">
              <label>Post Emoji (shown if no image)</label>
              <input type="text" id="bp-emoji" placeholder="e.g. 🎮" maxlength="4">
            </div>
            <div class="atf-field atf-full">
              <label>Tags (comma-separated)</label>
              <input type="text" id="bp-tags" placeholder="e.g. Python, Beginner, Games">
            </div>
            <div class="atf-field atf-full">
              <label>Excerpt / Summary <span class="req">*</span></label>
              <textarea id="bp-excerpt" style="min-height:70px;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;width:100%;outline:none;" placeholder="A short 1–2 sentence summary shown on the blog listing page..."></textarea>
            </div>
          </div>

          <div class="atf-divider"></div>
          <div class="atf-section-title">📄 Post Body (HTML supported)</div>
          <div style="margin-bottom:8px;font-size:12px;color:var(--light);font-weight:700;">
            Use &lt;h2&gt;, &lt;h3&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt;, &lt;code&gt;, &lt;pre&gt;&lt;code&gt;, &lt;blockquote&gt;, &lt;img&gt; tags.
          </div>
          <textarea id="bp-body" style="min-height:320px;padding:14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Courier New',monospace;font-size:13px;width:100%;outline:none;line-height:1.7;resize:vertical;" placeholder="&lt;h2&gt;Introduction&lt;/h2&gt;&#10;&lt;p&gt;Your post content here...&lt;/p&gt;"></textarea>

          <div class="atf-divider"></div>
          <div class="atf-section-title">📢 Ad Code (In-Body)</div>
          <div style="margin-bottom:8px;font-size:12px;color:var(--light);font-weight:700;">
            Paste your Google AdSense or custom ad code here. It will appear mid-way through the post body.
          </div>
          <textarea id="bp-ad-body" style="min-height:80px;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Courier New',monospace;font-size:12px;width:100%;outline:none;resize:vertical;" placeholder="&lt;!-- AdSense code --&gt;&#10;&lt;ins class=&quot;adsbygoogle&quot; ...&gt;&lt;/ins&gt;"></textarea>

          <div class="atf-divider"></div>
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:var(--dark);cursor:pointer;">
              <input type="checkbox" id="bp-published" style="width:18px;height:18px;accent-color:var(--green);">
              Publish immediately (visible on blog)
            </label>
          </div>

          <div class="atf-actions">
            <button type="button" class="btn btn-outline" onclick="clearBlogForm()">Clear</button>
            <button type="button" class="btn btn-outline" onclick="saveBlogPost(false)">💾 Save Draft</button>
            <button type="button" class="btn btn-primary" onclick="saveBlogPost(true)">🚀 Publish Post</button>
          </div>
        </form>
      </div>
    </div>

    <!-- BLOG: AD SETTINGS -->
    <div id="tab-blog-settings" style="display:none;">
      <div class="dash-section-header">
        <div class="dash-section-title">⚙️ Blog Ad Settings</div>
      </div>
      <div class="add-teacher-form-wrap">
        <form class="add-teacher-form" onsubmit="return false;">
          <div class="atf-section-title">📢 Global Ad Slots</div>
          <p style="font-size:13px;color:var(--light);font-weight:700;margin-bottom:20px;">
            Paste your Google AdSense or custom ad HTML into each slot. Leave blank to show a placeholder.
          </p>

          <div class="atf-field atf-full" style="margin-bottom:20px;">
            <label>🔝 Header Banner (728×90 — appears above post list and top of each post)</label>
            <textarea id="ad-header" style="min-height:80px;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Courier New',monospace;font-size:12px;width:100%;outline:none;resize:vertical;" placeholder="&lt;!-- Header AdSense code --&gt;"></textarea>
          </div>

          <div class="atf-field atf-full" style="margin-bottom:20px;">
            <label>📰 In-Feed Banner (728×90 — appears between posts in the listing grid)</label>
            <textarea id="ad-inline" style="min-height:80px;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Courier New',monospace;font-size:12px;width:100%;outline:none;resize:vertical;" placeholder="&lt;!-- In-feed AdSense code --&gt;"></textarea>
          </div>

          <div class="atf-field atf-full" style="margin-bottom:20px;">
            <label>📌 Sidebar Ad (300×250 — appears in the blog sidebar)</label>
            <textarea id="ad-sidebar" style="min-height:80px;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Courier New',monospace;font-size:12px;width:100%;outline:none;resize:vertical;" placeholder="&lt;!-- Sidebar AdSense code --&gt;"></textarea>
          </div>

          <div class="atf-field atf-full" style="margin-bottom:20px;">
            <label>🔚 Post Footer Banner (728×90 — appears at the bottom of every post)</label>
            <textarea id="ad-footer" style="min-height:80px;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Courier New',monospace;font-size:12px;width:100%;outline:none;resize:vertical;" placeholder="&lt;!-- Footer AdSense code --&gt;"></textarea>
          </div>

          <div class="atf-divider"></div>
          <div class="atf-section-title">🔑 AdSense Publisher ID</div>
          <div class="atf-field atf-full" style="margin-bottom:20px;">
            <label>Publisher ID (ca-pub-XXXXXXXXXXXXXXXX)</label>
            <input type="text" id="ad-pub-id" placeholder="ca-pub-1234567890123456">
            <div style="font-size:11px;color:var(--light);font-weight:700;margin-top:4px;">
              Found in your Google AdSense account under Account → Account information.
            </div>
          </div>

          <div class="atf-actions">
            <button type="button" class="btn btn-primary" onclick="saveAdSettings()">💾 Save Ad Settings</button>
          </div>
        </form>
      </div>
    </div>`;

  dashMain.insertAdjacentHTML("beforeend", html);
}

/* ── RENDER ALL POSTS TABLE ── */
function renderAdminBlogList() {
  const el = document.getElementById("adminBlogList");
  if (!el) return;
  const posts = getBlogPosts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!posts.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:48px;margin-bottom:12px;">✍️</div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">No posts yet</div>
      <div style="font-size:14px;color:var(--light);margin-top:6px;">Click "New Post" to write your first blog post.</div>
    </div>`;
    return;
  }

  const catLabel = { "learn-by-doing": "🛠️ Learn by Doing", "tech-explained": "💡 Tech Explained", "news": "📰 EdTech News", "tips": "✏️ Study Tips" };

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Title</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Category</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Author</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Date</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Status</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${posts.map((p, i) => `
            <tr style="border-bottom:1px solid #f0f2f8;${i % 2 === 0 ? "" : "background:#fafbff;"}">
              <td style="padding:14px 16px;">
                <div style="font-weight:800;color:var(--dark);max-width:320px;">${p.emoji || ""} ${p.title}</div>
                <div style="font-size:11px;color:var(--light);font-weight:700;margin-top:2px;">${p.id}</div>
              </td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${catLabel[p.category] || p.category}</td>
              <td style="padding:14px 16px;font-weight:700;color:var(--mid);">${p.author}</td>
              <td style="padding:14px 16px;font-size:12px;color:var(--light);font-weight:700;">${p.date || "—"}</td>
              <td style="padding:14px 16px;text-align:center;">
                ${p.published
                  ? `<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Published</span>`
                  : `<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">📝 Draft</span>`}
              </td>
              <td style="padding:14px 16px;text-align:center;">
                <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                  <button onclick="editBlogPost('${p.id}')"
                    style="background:var(--blue-light);color:var(--blue);border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                    ✏️ Edit
                  </button>
                  <button onclick="togglePublish('${p.id}')"
                    style="background:${p.published ? "#fde8e8" : "var(--green-light)"};color:${p.published ? "#c53030" : "var(--green-dark)"};border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                    ${p.published ? "⬇ Unpublish" : "🚀 Publish"}
                  </button>
                  <button onclick="deleteBlogPost('${p.id}')"
                    style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
                    🗑
                  </button>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

/* ── SAVE / PUBLISH POST ── */
function saveBlogPost(publish) {
  const title   = document.getElementById("bp-title")?.value.trim();
  const excerpt = document.getElementById("bp-excerpt")?.value.trim();
  const body    = document.getElementById("bp-body")?.value.trim();
  const author  = document.getElementById("bp-author")?.value.trim();

  if (!title)   { showToast("Please enter a post title.", "error"); return; }
  if (!excerpt) { showToast("Please enter an excerpt.", "error"); return; }
  if (!body)    { showToast("Please write the post body.", "error"); return; }
  if (!author)  { showToast("Please enter the author name.", "error"); return; }

  const existingId = document.getElementById("bp-id")?.value;
  const posts = getBlogPosts();
  const isEdit = !!existingId;

  const tagsRaw = document.getElementById("bp-tags")?.value || "";
  const tags = tagsRaw.split(",").map(t => t.trim()).filter(Boolean);

  const post = {
    id:           existingId || "post-" + Date.now().toString(36),
    title,
    category:     document.getElementById("bp-category")?.value || "learn-by-doing",
    tags,
    author,
    authorInitials: author.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    date:         document.getElementById("bp-date")?.value || new Date().toISOString().split("T")[0],
    emoji:        document.getElementById("bp-emoji")?.value || "📝",
    coverImage:   document.getElementById("bp-image")?.value.trim() || "",
    excerpt,
    body,
    adCodeBody:   document.getElementById("bp-ad-body")?.value.trim() || "",
    published:    publish || document.getElementById("bp-published")?.checked || false,
    createdAt:    isEdit ? (posts.find(p => p.id === existingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };

  if (isEdit) {
    const idx = posts.findIndex(p => p.id === existingId);
    if (idx !== -1) posts[idx] = post;
    else posts.unshift(post);
  } else {
    posts.unshift(post);
  }

  saveBlogPosts(posts);
  clearBlogForm();
  showAdminTab("blog-posts");
  showToast(publish ? "🚀 Post published!" : "💾 Draft saved!");
}

/* ── EDIT POST ── */
function editBlogPost(postId) {
  const post = getBlogPosts().find(p => p.id === postId);
  if (!post) return;

  showAdminTab("blog-new");
  document.getElementById("blogEditorTitle").textContent = "✏️ Edit Post";

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
  set("bp-id",       post.id);
  set("bp-title",    post.title);
  set("bp-category", post.category);
  set("bp-author",   post.author);
  set("bp-date",     post.date);
  set("bp-image",    post.coverImage);
  set("bp-emoji",    post.emoji);
  set("bp-tags",     (post.tags || []).join(", "));
  set("bp-excerpt",  post.excerpt);
  set("bp-body",     post.body);
  set("bp-ad-body",  post.adCodeBody);

  const pubEl = document.getElementById("bp-published");
  if (pubEl) pubEl.checked = !!post.published;
}

/* ── TOGGLE PUBLISH ── */
function togglePublish(postId) {
  const posts = getBlogPosts();
  const idx   = posts.findIndex(p => p.id === postId);
  if (idx === -1) return;
  posts[idx].published = !posts[idx].published;
  saveBlogPosts(posts);
  renderAdminBlogList();
  showToast(posts[idx].published ? "🚀 Post published!" : "Post unpublished.");
}

/* ── DELETE POST ── */
function deleteBlogPost(postId) {
  if (!confirm("Delete this post? This cannot be undone.")) return;
  const posts = getBlogPosts().filter(p => p.id !== postId);
  saveBlogPosts(posts);
  renderAdminBlogList();
  showToast("Post deleted.");
}

/* ── CLEAR FORM ── */
function clearBlogForm() {
  ["bp-id","bp-title","bp-author","bp-date","bp-image","bp-emoji","bp-tags","bp-excerpt","bp-body","bp-ad-body"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  const catEl = document.getElementById("bp-category"); if (catEl) catEl.value = "learn-by-doing";
  const pubEl = document.getElementById("bp-published"); if (pubEl) pubEl.checked = false;
  const titleEl = document.getElementById("blogEditorTitle"); if (titleEl) titleEl.textContent = "✍️ New Blog Post";
}

/* ── AD SETTINGS ── */
function loadAdSettings() {
  const s = getBlogSettings();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
  set("ad-header",  s.adHeader);
  set("ad-inline",  s.adInline);
  set("ad-sidebar", s.adSidebar);
  set("ad-footer",  s.adFooter);
  set("ad-pub-id",  s.adPubId);
}

function saveAdSettings() {
  const s = {
    adHeader:  document.getElementById("ad-header")?.value.trim()  || "",
    adInline:  document.getElementById("ad-inline")?.value.trim()  || "",
    adSidebar: document.getElementById("ad-sidebar")?.value.trim() || "",
    adFooter:  document.getElementById("ad-footer")?.value.trim()  || "",
    adPubId:   document.getElementById("ad-pub-id")?.value.trim()  || "",
  };
  saveBlogSettings(s);
  showToast("✅ Ad settings saved!");
}

/* ── HOOK INTO showAdminTab ── */
document.addEventListener("DOMContentLoaded", () => {
  injectBlogTabs();
  updateBlogBadge();

  // Patch showAdminTab to handle blog tabs
  const _orig = window.showAdminTab;
  window.showAdminTab = function(tab) {
    _orig(tab);
    if (tab === "blog-posts")    renderAdminBlogList();
    if (tab === "blog-settings") loadAdSettings();
  };
});
