/* STEMNEST ACADEMY — ADMIN BLOG MANAGER */
function getBlogPosts(){try{return JSON.parse(localStorage.getItem('sn_blog_posts')||'[]');}catch{return[];}}
function saveBlogPosts(p){localStorage.setItem('sn_blog_posts',JSON.stringify(p));updateBlogBadge();}
function updateBlogBadge(){var el=document.getElementById('blogBadge');if(el)el.textContent=getBlogPosts().filter(function(p){return p.published;}).length;}

function injectBlogTabs(){
  var dashMain=document.querySelector('.dash-main');
  if(!dashMain||document.getElementById('tab-blog-posts'))return;
  var html='<div id="tab-blog-posts" style="display:none;">'
    +'<div class="dash-section-header"><div class="dash-section-title">✍️ Blog Posts</div>'
    +'<button class="btn btn-primary" style="font-size:13px;padding:9px 20px;" onclick="showAdminTab(\'blog-new\')">➕ New Post</button></div>'
    +'<div id="adminBlogList"></div></div>'

    +'<div id="tab-blog-new" style="display:none;">'
    +'<div class="dash-section-header"><div class="dash-section-title" id="blogEditorTitle">✍️ New Blog Post</div>'
    +'<button class="btn btn-outline" style="font-size:13px;" onclick="showAdminTab(\'blog-posts\')">← All Posts</button></div>'
    +'<div class="add-teacher-form-wrap"><form class="add-teacher-form" onsubmit="return false;">'
    +'<div class="atf-section-title">📝 Post Details</div>'
    +'<input type="hidden" id="bp-id">'
    +'<div class="atf-grid">'
    +'<div class="atf-field atf-full"><label>Post Title <span class="req">*</span></label><input type="text" id="bp-title" placeholder="e.g. How to Build Your First Python Game"></div>'
    +'<div class="atf-field"><label>Category <span class="req">*</span></label><select id="bp-category">'
    +'<option value="learn-by-doing">🛠️ Learn by Doing</option>'
    +'<option value="tech-explained">💡 Tech Explained</option>'
    +'<option value="news">📰 EdTech News</option>'
    +'<option value="tips">✏️ Study Tips</option>'
    +'</select></div>'
    +'<div class="atf-field"><label>Author Name <span class="req">*</span></label><input type="text" id="bp-author" placeholder="e.g. Sarah Rahman"></div>'
    +'<div class="atf-field"><label>Publish Date</label><input type="date" id="bp-date"></div>'
    +'<div class="atf-field"><label>Cover Image URL (optional)</label><input type="url" id="bp-image" placeholder="https://... or leave blank for emoji"></div>'
    +'<div class="atf-field"><label>Post Emoji (shown if no image)</label><input type="text" id="bp-emoji" placeholder="e.g. 🎮" maxlength="4"></div>'
    +'<div class="atf-field atf-full"><label>Tags (comma-separated)</label><input type="text" id="bp-tags" placeholder="e.g. Python, Beginner, Games"></div>'
    +'<div class="atf-field atf-full"><label>Excerpt / Summary <span class="req">*</span></label>'
    +'<textarea id="bp-excerpt" style="min-height:70px;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:\'Nunito\',sans-serif;font-size:14px;width:100%;outline:none;" placeholder="A short 1-2 sentence summary shown on the blog listing page..."></textarea></div>'
    +'</div>'
    +'<div class="atf-divider"></div>'
    +'<div class="atf-section-title">📄 Post Body (HTML supported)</div>'
    +'<div style="margin-bottom:8px;font-size:12px;color:var(--light);font-weight:700;">Use h2, h3, p, ul, li, strong, code, pre, blockquote tags.</div>'
    +'<textarea id="bp-body" style="min-height:320px;padding:14px;border:2px solid #e8eaf0;border-radius:12px;font-family:\'Courier New\',monospace;font-size:13px;width:100%;outline:none;line-height:1.7;resize:vertical;" placeholder="&lt;h2&gt;Introduction&lt;/h2&gt;&#10;&lt;p&gt;Your post content here...&lt;/p&gt;"></textarea>'
    +'<div class="atf-divider"></div>'
    +'<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:var(--dark);cursor:pointer;">'
    +'<input type="checkbox" id="bp-published" style="width:18px;height:18px;accent-color:var(--green);">'
    +'Publish immediately (visible on blog)</label></div>'
    +'<div class="atf-actions">'
    +'<button type="button" class="btn btn-outline" onclick="clearBlogForm()">Clear</button>'
    +'<button type="button" class="btn btn-outline" onclick="saveBlogPost(false)">💾 Save Draft</button>'
    +'<button type="button" class="btn btn-primary" onclick="saveBlogPost(true)">🚀 Publish Post</button>'
    +'</div></form></div></div>';
  dashMain.insertAdjacentHTML('beforeend',html);
}

function renderAdminBlogList(){
  var el=document.getElementById('adminBlogList');
  if(!el)return;
  var posts=getBlogPosts().sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt);});
  if(!posts.length){
    el.innerHTML='<div style="text-align:center;padding:60px 20px;"><div style="font-size:48px;margin-bottom:12px;">✍️</div>'
      +'<div style="font-family:\'Fredoka One\',cursive;font-size:20px;color:var(--dark);">No posts yet</div>'
      +'<div style="font-size:14px;color:var(--light);margin-top:6px;">Click "New Post" to write your first blog post.</div></div>';
    return;
  }
  var catLabel={'learn-by-doing':'🛠️ Learn by Doing','tech-explained':'💡 Tech Explained','news':'📰 EdTech News','tips':'✏️ Study Tips'};
  var rows=posts.map(function(p,i){
    var bg=i%2===0?'':'background:#fafbff;';
    var status=p.published
      ?'<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Published</span>'
      :'<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">📝 Draft</span>';
    var pubBtnBg=p.published?'#fde8e8':'var(--green-light)';
    var pubBtnColor=p.published?'#c53030':'var(--green-dark)';
    var pubBtnLabel=p.published?'⬇ Unpublish':'🚀 Publish';
    return '<tr style="border-bottom:1px solid #f0f2f8;'+bg+'">'
      +'<td style="padding:14px 16px;"><div style="font-weight:800;color:var(--dark);max-width:300px;">'+(p.emoji||'')+' '+p.title+'</div>'
      +'<div style="font-size:11px;color:var(--light);font-weight:700;margin-top:2px;">'+p.id+'</div></td>'
      +'<td style="padding:14px 16px;font-weight:700;color:var(--mid);">'+(catLabel[p.category]||p.category)+'</td>'
      +'<td style="padding:14px 16px;font-weight:700;color:var(--mid);">'+p.author+'</td>'
      +'<td style="padding:14px 16px;font-size:12px;color:var(--light);font-weight:700;">'+(p.date||'—')+'</td>'
      +'<td style="padding:14px 16px;text-align:center;">'+status+'</td>'
      +'<td style="padding:14px 16px;text-align:center;">'
      +'<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">'
      +'<button onclick="editBlogPost(\''+p.id+'\')" style="background:var(--blue-light);color:var(--blue);border:none;border-radius:8px;padding:6px 12px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">✏️ Edit</button>'
      +'<button onclick="togglePublish(\''+p.id+'\')" style="background:'+pubBtnBg+';color:'+pubBtnColor+';border:none;border-radius:8px;padding:6px 12px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">'+pubBtnLabel+'</button>'
      +'<button onclick="deleteBlogPost(\''+p.id+'\')" style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:6px 12px;font-family:\'Nunito\',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">🗑</button>'
      +'</div></td></tr>';
  }).join('');
  var th='padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
  el.innerHTML='<div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">'
    +'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<thead><tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">'
    +'<th style="'+th+'">Title</th><th style="'+th+'">Category</th><th style="'+th+'">Author</th>'
    +'<th style="'+th+'">Date</th><th style="'+th+';text-align:center;">Status</th><th style="'+th+';text-align:center;">Actions</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function saveBlogPost(publish){
  var title=document.getElementById('bp-title')?.value.trim();
  var excerpt=document.getElementById('bp-excerpt')?.value.trim();
  var body=document.getElementById('bp-body')?.value.trim();
  var author=document.getElementById('bp-author')?.value.trim();
  if(!title){showToast('Please enter a post title.','error');return;}
  if(!excerpt){showToast('Please enter an excerpt.','error');return;}
  if(!body){showToast('Please write the post body.','error');return;}
  if(!author){showToast('Please enter the author name.','error');return;}
  var existingId=document.getElementById('bp-id')?.value;
  var posts=getBlogPosts();
  var tagsRaw=document.getElementById('bp-tags')?.value||'';
  var tags=tagsRaw.split(',').map(function(t){return t.trim();}).filter(Boolean);
  var post={
    id:existingId||'post-'+Date.now().toString(36),
    title:title,
    category:document.getElementById('bp-category')?.value||'learn-by-doing',
    tags:tags,
    author:author,
    authorInitials:author.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase(),
    date:document.getElementById('bp-date')?.value||new Date().toISOString().split('T')[0],
    emoji:document.getElementById('bp-emoji')?.value||'📝',
    coverImage:document.getElementById('bp-image')?.value.trim()||'',
    excerpt:excerpt,
    body:body,
    published:publish||document.getElementById('bp-published')?.checked||false,
    createdAt:existingId?(posts.find(function(p){return p.id===existingId;})||{}).createdAt||new Date().toISOString():new Date().toISOString(),
    updatedAt:new Date().toISOString(),
  };
  if(existingId){
    var idx=posts.findIndex(function(p){return p.id===existingId;});
    if(idx!==-1)posts[idx]=post; else posts.unshift(post);
  } else {
    posts.unshift(post);
  }
  saveBlogPosts(posts);
  clearBlogForm();
  showAdminTab('blog-posts');
  showToast(publish?'🚀 Post published!':'💾 Draft saved!');
}

function editBlogPost(postId){
  var post=getBlogPosts().find(function(p){return p.id===postId;});
  if(!post)return;
  showAdminTab('blog-new');
  var titleEl=document.getElementById('blogEditorTitle');
  if(titleEl)titleEl.textContent='✏️ Edit Post';
  var set=function(id,val){var el=document.getElementById(id);if(el)el.value=val||'';};
  set('bp-id',post.id); set('bp-title',post.title); set('bp-category',post.category);
  set('bp-author',post.author); set('bp-date',post.date); set('bp-image',post.coverImage);
  set('bp-emoji',post.emoji); set('bp-tags',(post.tags||[]).join(', '));
  set('bp-excerpt',post.excerpt); set('bp-body',post.body);
  var pubEl=document.getElementById('bp-published');
  if(pubEl)pubEl.checked=!!post.published;
}

function togglePublish(postId){
  var posts=getBlogPosts();
  var idx=posts.findIndex(function(p){return p.id===postId;});
  if(idx===-1)return;
  posts[idx].published=!posts[idx].published;
  saveBlogPosts(posts);
  renderAdminBlogList();
  showToast(posts[idx].published?'🚀 Post published!':'Post unpublished.');
}

function deleteBlogPost(postId){
  if(!confirm('Delete this post? This cannot be undone.'))return;
  saveBlogPosts(getBlogPosts().filter(function(p){return p.id!==postId;}));
  renderAdminBlogList();
  showToast('Post deleted.');
}

function clearBlogForm(){
  ['bp-id','bp-title','bp-author','bp-date','bp-image','bp-emoji','bp-tags','bp-excerpt','bp-body'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  var catEl=document.getElementById('bp-category');if(catEl)catEl.value='learn-by-doing';
  var pubEl=document.getElementById('bp-published');if(pubEl)pubEl.checked=false;
  var titleEl=document.getElementById('blogEditorTitle');if(titleEl)titleEl.textContent='✍️ New Blog Post';
}

/* Hook into showAdminTab */
document.addEventListener('DOMContentLoaded',function(){
  injectBlogTabs();
  updateBlogBadge();
  var _orig=window.showAdminTab;
  window.showAdminTab=function(tab){
    _orig(tab);
    if(tab==='blog-posts')renderAdminBlogList();
  };
});
