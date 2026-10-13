/* STEMNEST ACADEMY — ADMIN BLOG MANAGER */
let adminBlogPosts = [];
var BLOG_API = 'https://api.stemnestacademy.co.uk/api';
function blogEsc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function blogAuth(){var t=localStorage.getItem('sn_access_token');return t?{'Authorization':'Bearer '+t}:{};}
/* Old category values used before the Learning Hub categories were renamed */
var BLOG_CAT_ALIAS={'news':'edtech-news','tips':'study-tips','parents':'parents-corner'};
function isScheduled(p){return !!(p.is_published && p.published_at && new Date(p.published_at) > new Date());}
/* yyyy-mm-ddThh:mm in the browser's local time, for <input type="datetime-local"> */
function toLocalInput(iso){var d=new Date(iso);if(isNaN(d))return '';var z=function(n){return String(n).padStart(2,'0');};
  return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+'T'+z(d.getHours())+':'+z(d.getMinutes());}
function fmtWhen(iso){return new Date(iso).toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}

async function fetchAdminBlogPosts() {
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/blogs?all=true', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
    const data = await res.json();
    if (data.success) {
      adminBlogPosts = data.posts;
      updateBlogBadge();
      renderAdminBlogList();
    }
  } catch(e) {
    console.error('Failed to fetch admin blogs', e);
  }
}

function updateBlogBadge(){
  var el = document.getElementById('blogBadge');
  if(el) el.textContent = adminBlogPosts.filter(function(p){return p.is_published || p.published;}).length;
}

function injectBlogTabs(){
  var dashMain=document.querySelector('.dash-main');
  if(!dashMain||document.getElementById('tab-blog-posts'))return;
  var html='<div id="tab-blog-posts" style="display:none;">'
    +'<div class="dash-section-header"><div class="dash-section-title">✍️ Blog Posts</div>'
    +'<button class="btn btn-primary" style="font-size:13px;padding:9px 20px;" onclick="showAdminTab(\'blog-new\')">➕ New Post</button></div>'
    +'<div id="newsPanel" style="margin-bottom:18px;"></div>'
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
    +'<option value="parents-corner">👪 Parents\' Corner</option>'
    +'<option value="study-tips">✏️ Study Tips</option>'
    +'<option value="edtech-news">📰 EdTech News</option>'
    +'</select></div>'
    +'<div class="atf-field"><label>Cover Image URL (optional)</label><input type="url" id="bp-image" placeholder="https://... or leave blank"></div>'
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
    +'Publish (visible on the Learning Hub)</label></div>'
    +'<div class="atf-field" style="max-width:340px;margin-bottom:20px;"><label>Publish date and time (optional)</label>'
    +'<input type="datetime-local" id="bp-publish-at">'
    +'<div style="font-size:12px;color:var(--light);font-weight:700;margin-top:6px;">Leave blank to publish straight away. Pick a future time to schedule it. The Learning Hub updates every hour.</div></div>'
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
  var posts = adminBlogPosts.sort(function(a,b){return new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt);});
  if(!posts.length){
    el.innerHTML='<div style="text-align:center;padding:60px 20px;"><div style="font-size:48px;margin-bottom:12px;">✍️</div>'
      +'<div style="font-family:\'Fredoka One\',cursive;font-size:20px;color:var(--dark);">No posts yet</div>'
      +'<div style="font-size:14px;color:var(--light);margin-top:6px;">Click "New Post" to write your first blog post.</div></div>';
    return;
  }
  var catLabel={'learn-by-doing':'🛠️ Learn by Doing','tech-explained':'💡 Tech Explained','parents-corner':'👪 Parents\' Corner','study-tips':'✏️ Study Tips','edtech-news':'📰 EdTech News','news':'📰 EdTech News','tips':'✏️ Study Tips'};
  var rows=posts.map(function(p,i){
    var bg=i%2===0?'':'background:#fafbff;';
    var isPub = p.is_published || p.published;
    var status=isScheduled(p)
      ?'<span style="background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">⏰ Scheduled</span><div style="font-size:11px;color:var(--light);font-weight:700;margin-top:4px;">'+blogEsc(fmtWhen(p.published_at))+'</div>'
      :isPub
      ?'<span style="background:var(--green-light);color:var(--green-dark);font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">✅ Published</span>'
      :'<span style="background:#fff3e0;color:#e65100;font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">📝 Draft</span>';
    var pubBtnBg=isPub?'#fde8e8':'var(--green-light)';
    var pubBtnColor=isPub?'#c53030':'var(--green-dark)';
    var pubBtnLabel=isPub?'⬇ Unpublish':'🚀 Publish';
    return '<tr style="border-bottom:1px solid #f0f2f8;'+bg+'">'
      +'<td style="padding:14px 16px;"><div style="font-weight:800;color:var(--dark);max-width:300px;">'+blogEsc(p.title)+'</div>'
      +'<div style="font-size:11px;color:var(--light);font-weight:700;margin-top:2px;">'+p.id+'</div></td>'
      +'<td style="padding:14px 16px;font-weight:700;color:var(--mid);">'+(catLabel[p.category]||blogEsc(p.category))+'</td>'
      +'<td style="padding:14px 16px;font-weight:700;color:var(--mid);">'+blogEsc(p.author_name || p.author)+'</td>'
      +'<td style="padding:14px 16px;font-size:12px;color:var(--light);font-weight:700;">'+((p.created_at || p.createdAt || '').split('T')[0]||'—')+'</td>'
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

async function saveBlogPost(publish){
  var title=document.getElementById('bp-title')?.value.trim();
  var excerpt=document.getElementById('bp-excerpt')?.value.trim();
  var body=document.getElementById('bp-body')?.value.trim();
  if(!title){showToast('Please enter a post title.','error');return;}
  if(!excerpt){showToast('Please enter an excerpt.','error');return;}
  if(!body){showToast('Please write the post body.','error');return;}
  
  var existingId=document.getElementById('bp-id')?.value;
  var tagsRaw=document.getElementById('bp-tags')?.value||'';
  var tags=tagsRaw.split(',').map(function(t){return t.trim();}).filter(Boolean);
  var isPublished = publish || document.getElementById('bp-published')?.checked || false;
  var whenRaw = document.getElementById('bp-publish-at')?.value || '';
  var publishAt = whenRaw ? new Date(whenRaw) : null;
  if (publishAt && isNaN(publishAt)) { showToast('Please pick a valid publish date.','error'); return; }

  var payload = {
    title: title,
    category: document.getElementById('bp-category')?.value||'learn-by-doing',
    tags: tags,
    cover_image: document.getElementById('bp-image')?.value.trim()||'',
    excerpt: excerpt,
    content: body,
    is_published: isPublished
  };
  if (isPublished && publishAt) payload.published_at = publishAt.toISOString();
  var scheduled = isPublished && publishAt && publishAt > new Date();

  try {
    const token = localStorage.getItem('sn_access_token');
    let url = 'https://api.stemnestacademy.co.uk/api/blogs';
    let method = 'POST';
    if (existingId) {
      url += '/' + existingId;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method,
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.success) {
      clearBlogForm();
      showAdminTab('blog-posts');
      showToast(scheduled ? '⏰ Scheduled for ' + fmtWhen(publishAt) : isPublished ? '🚀 Post published! It appears on the Learning Hub within the hour.' : '💾 Draft saved!', 'success');
      fetchAdminBlogPosts();
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch(e) {
    showToast('Failed to save post', 'error');
  }
}

function editBlogPost(postId){
  var post = adminBlogPosts.find(function(p){return p.id===postId;});
  if(!post)return;
  showAdminTab('blog-new');
  var titleEl=document.getElementById('blogEditorTitle');
  if(titleEl)titleEl.textContent='✏️ Edit Post';
  var set=function(id,val){var el=document.getElementById(id);if(el)el.value=val||'';};
  set('bp-id',post.id); 
  set('bp-title',post.title); 
  set('bp-category',BLOG_CAT_ALIAS[post.category]||post.category);
  set('bp-image',post.cover_image || post.coverImage);
  set('bp-tags',(post.tags||[]).join(', '));
  set('bp-excerpt',post.excerpt); 
  set('bp-body',post.content || post.body);
  var pubEl=document.getElementById('bp-published');
  if(pubEl)pubEl.checked=!!(post.is_published || post.published);
  set('bp-publish-at', isScheduled(post) ? toLocalInput(post.published_at) : '');
}

async function togglePublish(postId){
  var post = adminBlogPosts.find(function(p){return p.id===postId;});
  if(!post)return;
  
  try {
    const token = localStorage.getItem('sn_access_token');
    const isPub = !(post.is_published || post.published);
    const res = await fetch('https://api.stemnestacademy.co.uk/api/blogs/' + postId, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      body: JSON.stringify({ is_published: isPub })
    });
    const data = await res.json();
    if (data.success) {
      showToast(isPub ? '🚀 Post published!' : 'Post unpublished.', 'success');
      fetchAdminBlogPosts();
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch(e) {
    showToast('Failed to toggle publish', 'error');
  }
}

async function deleteBlogPost(postId){
  if(!confirm('Delete this post? This cannot be undone.'))return;
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/blogs/' + postId, {
      method: 'DELETE',
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
    const data = await res.json();
    if (data.success) {
      showToast('Post deleted.', 'success');
      fetchAdminBlogPosts();
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch(e) {
    showToast('Failed to delete post', 'error');
  }
}

function clearBlogForm(){
  ['bp-id','bp-title','bp-image','bp-tags','bp-excerpt','bp-body','bp-publish-at'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  var catEl=document.getElementById('bp-category');if(catEl)catEl.value='learn-by-doing';
  var pubEl=document.getElementById('bp-published');if(pubEl)pubEl.checked=false;
  var titleEl=document.getElementById('blogEditorTitle');if(titleEl)titleEl.textContent='✍️ New Blog Post';
}

/* Hook into showAdminTab */
document.addEventListener('DOMContentLoaded',function(){
  injectBlogTabs();
  fetchAdminBlogPosts();
  loadNewsStatus();
  
  var _orig=window.showAdminTab;
  if (typeof _orig === 'function') {
    window.showAdminTab=function(tab){
      _orig(tab);
      if(tab==='blog-posts') renderAdminBlogList();
    };
  }
});


/* ── EdTech news drafts (backend services/newsDrafts.js) ── */
async function loadNewsStatus(){
  var el=document.getElementById('newsPanel');
  if(!el)return;
  try{
    var res=await fetch(BLOG_API+'/blog-news/status',{headers:blogAuth()});
    var d=await res.json();
    if(!d.success){el.innerHTML='';return;}
    renderNewsPanel(d);
  }catch(e){el.innerHTML='';}
}

function renderNewsPanel(d){
  var el=document.getElementById('newsPanel');
  if(!el)return;
  var last=d.last, line;
  if(!d.configured) line='Not switched on yet: the Claude API key has not been added to the server.';
  else if(!last) line='No run yet. It runs every morning at about 6am (Nigeria time), or click the button.';
  else if(last.error) line='Last run '+blogEsc(fmtWhen(last.at))+' failed: '+blogEsc(last.error);
  else line='Last run '+blogEsc(fmtWhen(last.at))+': '+last.considered+' new stor'+(last.considered===1?'y':'ies')+' checked, '+last.drafts+' draft'+(last.drafts===1?'':'s')+' written.'
    +(last.titles&&last.titles.length?' <span style="color:var(--mid);">('+last.titles.map(blogEsc).join(' · ')+')</span>':'');
  el.innerHTML='<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;padding:14px 18px;">'
    +'<div style="font-size:26px;">📰</div>'
    +'<div style="flex:1;min-width:220px;"><div style="font-weight:900;color:var(--dark);">EdTech news drafts</div>'
    +'<div style="font-size:12.5px;color:var(--light);font-weight:700;margin-top:3px;">'+line+'</div>'
    +'<div style="font-size:12px;color:var(--light);font-weight:700;margin-top:3px;">Drafts are never published on their own. Read each one, check it against the source link at the bottom, then Publish or schedule it.</div></div>'
    +'<button type="button" class="btn btn-outline" id="newsRunBtn" style="font-size:13px;" '+(d.configured&&!d.running?'':'disabled ')+'onclick="runNewsNow()">'+(d.running?'⏳ Working...':'🔄 Fetch news now')+'</button>'
    +'</div>';
}

async function runNewsNow(){
  var btn=document.getElementById('newsRunBtn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Reading the news... (about a minute)';}
  try{
    var res=await fetch(BLOG_API+'/blog-news/run',{method:'POST',headers:blogAuth()});
    var d=await res.json();
    if(d.success){
      var n=(d.drafts||[]).length;
      showToast(n?('📰 '+n+' new draft'+(n===1?'':'s')+' ready to review'):'No suitable new stories today.','success');
      fetchAdminBlogPosts();
    }else showToast('Error: '+d.error,'error');
  }catch(e){showToast('Could not reach the server','error');}
  loadNewsStatus();
}
