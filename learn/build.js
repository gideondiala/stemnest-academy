/**
 * Static site generator for learn.stemnestacademy.co.uk, the StemNest
 * Student Learning Hub.
 *
 * Content comes from two places:
 *   1. content/posts/*.md   articles kept in the repo (front matter + Markdown)
 *   2. the StemNest API     posts published in Admin → Blog (HTML body),
 *                             fetched at build time (skipped if unreachable)
 *
 * Output (dist/): one folder per article (pretty URLs), category pages,
 * About / Contact / Privacy, 404, sitemap.xml, robots.txt, rss.xml,
 * search-index.json and Cloudflare _headers. Every page is plain HTML so
 * search engines can read it without running JavaScript.
 *
 *   node build.js            build into dist/
 *   SKIP_API=1 node build.js repo articles only (offline)
 */
const fs = require('fs');
const path = require('path');
const { Marked } = require('marked');
const hljs = require('highlight.js');

const SITE = {
  url: 'https://learn.stemnestacademy.co.uk',
  name: 'StemNest Learning Hub',
  tagline: 'Coding, AI and tech skills for young learners, step by step.',
  mainUrl: 'https://stemnestacademy.co.uk',
  trialUrl: 'https://stemnestacademy.co.uk/pages/free-trial',
  api: process.env.LEARN_API || 'https://api.stemnestacademy.co.uk/api/blogs',
  email: 'hello@stemnestacademy.co.uk',
  ga: 'G-WB62B0P5KG',
};
const CATEGORIES = {
  'learn-by-doing': { name: 'Learn by Doing', emoji: '🛠️', blurb: 'Step-by-step tutorials: build games, websites, apps and AI projects yourself.', colors: ['#1a56db', '#3b82f6'] },
  'tech-explained': { name: 'Tech Explained', emoji: '💡', blurb: 'Clear answers and honest comparisons to help students and parents choose well.', colors: ['#7c3aed', '#a78bfa'] },
  'parents-corner': { name: "Parents' Corner", emoji: '👨‍👩‍👧', blurb: 'Practical, plain-English guides for parents supporting a young coder at home.', colors: ['#0e9f6e', '#34d399'] },
  'study-tips': { name: 'Study Tips', emoji: '✏️', blurb: 'Simple study habits and revision tricks that help students learn more in less time.', colors: ['#ea580c', '#fbbf24'] },
  'edtech-news': { name: 'EdTech News', emoji: '📰', blurb: 'What is changing in education and technology, and what it means for students and parents.', colors: ['#334155', '#64748b'] },
};
/* Admin → Blog uses short keys for some categories */
const CATEGORY_ALIASES = { news: 'edtech-news', tips: 'study-tips', parents: 'parents-corner' };
const ROOT = __dirname, OUT = path.join(ROOT, 'dist');

/* ── helpers ── */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const isoDate = d => new Date(d).toISOString();
/* Front matter dates are Nigeria time (UTC+1). "2026-10-17" means 00:00, "2026-10-17 09:00" means 9am. */
function publishTime(v) {
  const m = String(v || '').trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return new Date(v);
  return new Date(`${m[1]}T${String(m[2] || '00').padStart(2, '0')}:${m[3] || '00'}:00+01:00`);
}
const NOW = process.env.PUBLISH_ALL ? new Date('2999-01-01') : new Date();
const niceDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
/* Cut text at a word boundary for meta descriptions */
const shortText = (t, n) => { t = String(t); if (t.length <= n) return t; const c = t.slice(0, n - 1); return c.slice(0, c.lastIndexOf(' ')).replace(/[,;:.]$/, '') + '…'; };
/* YYYY-MM-DD in Nigeria time (sitemap) */
const watDay = d => new Date(new Date(d).getTime() + 3600e3).toISOString().slice(0, 10);
const words = html => String(html).replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
function write(rel, content) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}
function categoryKey(c) {
  const k = slugify(c || '');
  if (CATEGORIES[k]) return k;
  if (CATEGORY_ALIASES[k]) return CATEGORY_ALIASES[k];
  return /how|build|make|tutorial|learn/i.test(c || '') ? 'learn-by-doing' : 'tech-explained';
}

/* Authors: content/authors.json. Posts name one with "author: <slug>"; Admin posts match by name. */
const AUTHORS = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'authors.json'), 'utf8'));
const DEFAULT_AUTHOR = AUTHORS[0].slug;
function findAuthor(v) {
  const k = slugify(v || '');
  return AUTHORS.find(a => a.slug === k || slugify(a.name) === k) ||
    (v ? { slug: null, name: String(v), role: '', bio: '' } : AUTHORS.find(a => a.slug === DEFAULT_AUTHOR));
}

/* Challenges: content/challenges.json. Each step is one published article with a mission. */
const CHALLENGES = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'challenges.json'), 'utf8'));

/* Minimal front matter: key: value, and lists as [a, b, c] */
function parseFrontMatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error('missing front matter');
  const data = {};
  m[1].split(/\r?\n/).forEach(line => {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) return;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    else v = v.replace(/^["']|["']$/g, '');
    data[kv[1]] = v;
  });
  return { data, body: m[2] };
}

/* Markdown → HTML with highlighted code, heading ids (for the contents list), safe links */
function renderMarkdown(md) {
  const toc = [];
  const used = {};
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(text, level, raw) {
        let id = slugify(raw) || 'section';
        if (used[id]) id += '-' + (++used[id]); else used[id] = 1;
        if (level === 2 || level === 3) toc.push({ level, id, text: raw.replace(/[*_`]/g, '') });
        return `<h${level} id="${id}">${text}</h${level}>\n`;
      },
      code(code, lang) {
        const language = lang && hljs.getLanguage(lang) ? lang : null;
        const html = language ? hljs.highlight(code, { language }).value : esc(code);
        const label = { html: 'HTML', css: 'CSS', js: 'JavaScript', javascript: 'JavaScript', python: 'Python', scratch: 'Scratch blocks', text: 'Text', bash: 'Terminal', lua: 'Lua' }[lang] || (lang || 'Code');
        return `<div class="code"><div class="code-bar"><span>${esc(label)}</span><button type="button" class="copy" aria-label="Copy code">Copy</button></div><pre><code class="hljs${language ? ' language-' + language : ''}">${html}</code></pre></div>\n`;
      },
      link(href, title, text) {
        const ext = /^https?:\/\//.test(href) && !href.startsWith(SITE.url);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
      },
      image(href, title, text) {
        return `<img src="${esc(href)}" alt="${esc(text)}" loading="lazy"${title ? ` title="${esc(title)}"` : ''}>`;
      },
      table(header, body) {
        return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`;
      },
    },
  });
  return { html: marked.parse(md), toc };
}

/* Posts written in Admin → Blog are HTML: drop scripts/handlers, collect headings for the contents list */
function cleanAdminHtml(html) {
  const toc = [];
  const used = {};
  let out = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(iframe|object|embed)[\s\S]*?(<\/\1>|\/>)/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  out = out.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (m, lvl, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    let id = slugify(text) || 'section';
    if (used[id]) id += '-' + (++used[id]); else used[id] = 1;
    toc.push({ level: Number(lvl), id, text });
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });
  return { html: out, toc };
}

/* Simple illustrated cover (no image files needed) */
function cover(post, big) {
  if (post.image) return `<img class="cover" src="${esc(post.image)}" alt="${esc(post.title)}" loading="${big ? 'eager' : 'lazy'}">`;
  const c = CATEGORIES[post.category];
  const id = 'g' + post.slug.replace(/[^a-z0-9]/g, '').slice(0, 20) + (big ? 'b' : '');
  return `<svg class="cover" viewBox="0 0 640 ${big ? 280 : 300}" role="img" aria-label="${esc(post.title)}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.colors[0]}"/><stop offset="1" stop-color="${c.colors[1]}"/></linearGradient></defs>
<rect width="640" height="300" fill="url(#${id})"/>
<circle cx="560" cy="40" r="90" fill="#fff" opacity=".08"/><circle cx="80" cy="280" r="120" fill="#fff" opacity=".07"/>
<text x="50%" y="${big ? 52 : 50}%" text-anchor="middle" dominant-baseline="middle" font-size="${big ? 110 : 120}">${esc(post.emoji || c.emoji)}</text>
</svg>`;
}

/* ── load content ── */
const SCHEDULED = [];
function loadRepoPosts() {
  const dir = path.join(ROOT, 'content', 'posts');
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const { data, body } = parseFrontMatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    const { html, toc } = renderMarkdown(body);
    const slug = data.slug || f.replace(/\.md$/, '');
    if (!data.title || !data.description || !data.date) throw new Error(`${f}: title, description and date are required`);
    if (data.draft === 'true') return null;
    const date = publishTime(data.date);
    if (date > NOW) { SCHEDULED.push({ slug, title: data.title, date }); return null; }
    return {
      slug, title: data.title, description: data.description, html, toc,
      category: categoryKey(data.category), tags: data.tags || [], emoji: data.emoji,
      level: data.level, age: data.age, author: findAuthor(data.author || DEFAULT_AUTHOR),
      date: date.toISOString(), updated: data.updated ? publishTime(data.updated).toISOString() : date.toISOString(), source: 'repo',
    };
  }).filter(Boolean);
}

async function loadApiPosts() {
  if (process.env.SKIP_API) return [];
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(SITE.api, { signal: ctl.signal }); clearTimeout(t);
    const d = await r.json();
    return (d.posts || []).filter(p => p.is_published && p.slug && p.title && p.content)
      .filter(p => { const t = new Date(p.published_at || p.created_at); if (t > NOW) { SCHEDULED.push({ slug: p.slug, title: p.title, date: t }); return false; } return true; })
      .map(p => {
      const { html, toc } = cleanAdminHtml(p.content);
      return {
        slug: slugify(p.slug), title: p.title, description: p.excerpt || String(p.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 155),
        html, toc, category: categoryKey(p.category), tags: p.tags || [], emoji: null,
        image: /^https:\/\//.test(p.cover_image || '') ? p.cover_image : null,
        author: findAuthor(p.author_name || DEFAULT_AUTHOR),
        date: p.published_at || p.created_at, updated: p.updated_at || p.published_at || p.created_at, source: 'admin',
      };
    });
  } catch (e) {
    console.warn('! Admin posts not loaded (' + e.message + '), building repo articles only');
    return [];
  }
}

/* ── page shell ── */
function page({ title, description, canonical, body, jsonld = [], ogType = 'website', noindex = false, published, modified }) {
  const full = title === SITE.name ? title : `${title} | ${SITE.name}`;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE.url}/og-default.png">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
${published ? `<meta property="article:published_time" content="${isoDate(published)}">\n<meta property="article:modified_time" content="${isoDate(modified || published)}">` : ''}
<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="${esc(SITE.name)}" href="/rss.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css?v=${BUILD_ID}">
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
var snConsent=null;try{snConsent=localStorage.getItem('sn_consent');}catch(e){}
gtag('consent','default',{analytics_storage:snConsent==='granted'?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
gtag('js',new Date());gtag('config','${SITE.ga}');
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="${esc(SITE.name)} home"><img src="/logo.png" alt="StemNest Academy" width="150" height="50"><span>Learning Hub</span></a>
    <nav aria-label="Main">
      <a class="hide-sm" href="/about/">About</a>
      <a class="nav-cta" href="${SITE.trialUrl}">Free trial<span class="hide-sm"> class</span></a>
    </nav>
  </div>
  <nav class="cat-bar" aria-label="Categories"><div class="wrap cat-row">
    <a href="/challenges/">🏆 Challenges</a>
    ${Object.entries(CATEGORIES).map(([k, c]) => `<a href="/category/${k}/">${c.emoji} ${esc(c.name)}</a>`).join('')}
  </div></nav>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <img src="/logo.png" alt="StemNest Academy" width="150" height="50" loading="lazy">
      <p>${esc(SITE.tagline)} Free guides from the tutors at <a href="${SITE.mainUrl}">StemNest Academy</a>.</p>
    </div>
    <div>
      <h2>Explore</h2>
      <a href="/challenges/">Challenges</a>
      ${Object.entries(CATEGORIES).map(([k, c]) => `<a href="/category/${k}/">${esc(c.name)}</a>`).join('')}
      <a href="/rss.xml">RSS feed</a>
    </div>
    <div>
      <h2>StemNest</h2>
      <a href="/about/">About the Learning Hub</a>
      <a href="/contact/">Contact</a>
      <a href="/privacy/">Privacy policy</a>
      <button type="button" class="link-btn" id="cookie-settings">Cookie settings</button>
      <a href="${SITE.mainUrl}">stemnestacademy.co.uk</a>
    </div>
  </div>
  <div class="wrap copyright">© ${new Date().getFullYear()} StemNest Academy. All rights reserved.</div>
</footer>
<script src="/app.js?v=${BUILD_ID}" defer></script>
</body>
</html>
`;
}

const ORG = { '@type': 'Organization', name: 'StemNest Academy', url: SITE.mainUrl, logo: { '@type': 'ImageObject', url: SITE.url + '/logo.png' } };

function card(p) {
  const c = CATEGORIES[p.category];
  return `<article class="card">
  <a href="/${p.slug}/" class="card-link" aria-label="${esc(p.title)}">${cover(p)}</a>
  <div class="card-body">
    <a class="chip chip-${p.category}" href="/category/${p.category}/">${c.emoji} ${esc(c.name)}</a>
    <h3><a href="/${p.slug}/">${esc(p.title)}</a></h3>
    <p>${esc(p.description)}</p>
    <div class="meta">${esc(niceDate(p.date))} · ${p.minutes} min read${p.level ? ' · ' + esc(p.level) : ''}</div>
  </div>
</article>`;
}

function authorLink(a) {
  return a.slug ? `<a href="/author/${a.slug}/">${esc(a.name)}</a>` : esc(a.name);
}
function authorAvatar(a, size) {
  return a.photo
    ? `<img class="avatar" src="${esc(a.photo)}" alt="${esc(a.name)}" width="${size}" height="${size}" loading="lazy">`
    : `<span class="avatar avatar-text" style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px">${esc(a.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span>`;
}
function authorBox(a) {
  if (!a.bio) return '';
  return `<aside class="author-box">${authorAvatar(a, 64)}<div><div class="author-label">About the author</div>
    <div class="author-name">${authorLink(a)}${a.role ? ` <span>${esc(a.role)}</span>` : ''}</div><p>${esc(a.bio)}</p></div></aside>`;
}
function authorLd(a) {
  return a.slug === DEFAULT_AUTHOR || !a.slug
    ? { '@type': 'Organization', name: 'StemNest Academy', url: SITE.mainUrl }
    : { '@type': 'Person', name: a.name, jobTitle: a.role || undefined, url: `${SITE.url}/author/${a.slug}/`, image: a.photo ? SITE.url + a.photo : undefined, knowsAbout: a.subjects, worksFor: { '@type': 'Organization', name: 'StemNest Academy' } };
}

function sidebar(posts, current) {
  const counts = Object.keys(CATEGORIES).map(k => [k, posts.filter(p => p.category === k).length]);
  return `<aside class="sidebar">
  <section class="side-box">
    <h2>Categories</h2>
    ${counts.map(([k, n]) => `<a class="side-cat${current === k ? ' on' : ''}" href="/category/${k}/"><span>${CATEGORIES[k].emoji} ${esc(CATEGORIES[k].name)}</span><span class="count">${n}</span></a>`).join('')}
  </section>
  ${trialBox()}
</aside>`;
}

const CTA_DEFAULT = { emoji: '🚀', title: 'New to StemNest?', text: 'Book a free trial class and learn coding and AI live with our friendly tutors.' };
/* Checked in order: the first match decides what an article's booking box says */
const CTAS = [
  { category: 'parents-corner', emoji: '👨‍👩‍👧', title: 'Curious how your child would get on?', text: 'Book a free one-on-one class with an expert tutor and see for yourself.' },
  { category: 'study-tips', emoji: '🎯', title: 'Want one-on-one support?', text: 'An expert tutor can work with you at your own pace. Your first class is free.' },
  { tags: ['roblox'], emoji: '🎮', title: 'Want to build bigger games?', text: 'Keep going with an expert tutor in a free one-on-one class.' },
  { tags: ['scratch'], emoji: '🐱', title: 'Stuck on your Scratch project?', text: 'Build your next one with an expert tutor in a free one-on-one class.' },
  { tags: ['python'], emoji: '🐍', title: 'Want a Python tutor by your side?', text: 'Get unstuck faster with an expert tutor in a free one-on-one class.' },
  { tags: ['html', 'css', 'javascript', 'web development'], emoji: '💻', title: 'Want to build real websites?', text: 'Learn with an expert tutor in a free one-on-one class.' },
  { tags: ['apps', 'app inventor'], emoji: '📱', title: 'Got an app idea?', text: 'Build it with an expert tutor in a free one-on-one class.' },
  { tags: ['ai', 'machine learning', 'data science'], emoji: '🤖', title: 'Curious about AI?', text: 'Explore it with an expert tutor in a free one-on-one class.' },
];
function ctaFor(p) {
  return CTAS.find(c => c.category === p.category || (c.tags || []).some(t => p.tags.includes(t))) ||
    { emoji: '🚀', title: 'Want a one-on-one lesson with an expert tutor?', text: 'Your first class is free.' };
}
function trialBox(cta = CTA_DEFAULT, extraClass = '') {
  return `<section class="trial-box${extraClass ? ' ' + extraClass : ''}">
    <div class="trial-emoji">${cta.emoji}</div>
    <h2>${esc(cta.title)}</h2>
    <p>${esc(cta.text)}</p>
    <a class="btn" href="${SITE.trialUrl}">Book a free trial class</a>
  </section>`;
}

/* The challenge step an article belongs to, if any */
function challengeStep(slug) {
  for (const ch of CHALLENGES) {
    const i = ch.steps.findIndex(s => s.post === slug);
    if (i >= 0) return { ch, i, step: ch.steps[i], next: ch.steps[i + 1] };
  }
  return null;
}
function challengeStrip(s) {
  return `<a class="ch-strip" href="/challenges/${s.ch.slug}/" data-challenge="${s.ch.slug}">${s.ch.emoji} Step ${s.i + 1} of ${s.ch.steps.length} in the ${esc(s.ch.title)}</a>`;
}
function challengeMission(s) {
  const nextHref = s.next ? `/${s.next.post}/` : `/challenges/${s.ch.slug}/`;
  return `<section class="ch-mission" data-challenge="${s.ch.slug}" data-title="${esc(s.ch.title)}" data-post="${s.step.post}" data-total="${s.ch.steps.length}">
    <div class="author-label">${s.ch.emoji} Your mission, step ${s.i + 1} of ${s.ch.steps.length}</div>
    <h2>${esc(s.step.name)}</h2>
    <p>${esc(s.step.mission)}</p>
    <div class="ch-actions"><button type="button" class="btn ch-finish" hidden>I finished this step</button>
    <a class="ch-next" href="${nextHref}">${s.next ? esc('Next: ' + s.next.name) : 'Back to the challenge'}</a></div>
  </section>`;
}
function continueBox() {
  return '<div id="continue" class="continue" hidden></div>';
}
function challengeCard(ch) {
  return `<article class="card ch-card" data-challenge="${ch.slug}">
    <div class="card-body">
      <div class="ch-emoji">${ch.emoji}</div>
      <h3><a href="/challenges/${ch.slug}/">${esc(ch.title)}</a></h3>
      <p>${esc(ch.intro)}</p>
      <div class="meta">Ages ${esc(ch.age)} · ${ch.steps.length} steps</div>
    </div>
  </article>`;
}

function searchBox() {
  return `<form class="search" role="search" action="/" onsubmit="return false">
    <label for="q" class="sr">Search the Learning Hub</label>
    <input id="q" type="search" placeholder="Search tutorials, e.g. Scratch game, navbar, Python…" autocomplete="off">
    <div id="results" class="results" hidden></div>
  </form>`;
}

/* ── build ── */
/* Version for the CSS/JS links: changes only when those files change */
const BUILD_ID = require('crypto').createHash('sha1')
  .update(fs.readFileSync(path.join(ROOT, 'static', 'style.css'))).update(fs.readFileSync(path.join(ROOT, 'static', 'app.js')))
  .digest('hex').slice(0, 10);

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const repo = loadRepoPosts();
  const api = await loadApiPosts();
  const seen = new Set(repo.map(p => p.slug));
  const posts = repo.concat(api.filter(p => !seen.has(p.slug)))
    .map(p => ({ ...p, minutes: Math.max(1, Math.round(words(p.html) / 200)) }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  /* Articles */
  for (const p of posts) {
    const c = CATEGORIES[p.category];
    const url = `${SITE.url}/${p.slug}/`;
    const related = posts.filter(x => x.slug !== p.slug)
      .map(x => ({ x, score: (x.category === p.category ? 2 : 0) + x.tags.filter(t => p.tags.includes(t)).length * 3 }))
      .sort((a, b) => b.score - a.score || new Date(b.x.date) - new Date(a.x.date)).slice(0, 3).map(r => r.x);
    const toc = p.toc.filter(t => t.level === 2);
    const cta = ctaFor(p), inChallenge = challengeStep(p.slug);
    const body = `
<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Learning Hub</a> › <a href="/category/${p.category}/">${esc(c.name)}</a></nav>
</div>
<article class="wrap post-layout">
  <div class="post-main">
    <header class="post-head">
      <a class="chip chip-${p.category}" href="/category/${p.category}/">${c.emoji} ${esc(c.name)}</a>
      ${inChallenge ? challengeStrip(inChallenge) : ''}
      <h1>${esc(p.title)}</h1>
      <p class="lede">${esc(p.description)}</p>
      <div class="meta">${p.author.photo ? authorAvatar(p.author, 28) + ' ' : ''}By ${authorLink(p.author)} · <time datetime="${isoDate(p.date)}">${esc(niceDate(p.date))}</time>${p.updated && p.updated !== p.date ? ` · Updated <time datetime="${isoDate(p.updated)}">${esc(niceDate(p.updated))}</time>` : ''} · ${p.minutes} min read${p.level ? ` · ${esc(p.level)}` : ''}${p.age ? ` · Ages ${esc(p.age)}` : ''}</div>
    </header>
    <div class="post-cover">${cover(p, true)}</div>
    ${toc.length >= 3 ? `<details class="toc-mobile"><summary>In this guide</summary><ol>${toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></details>` : ''}
    <div class="prose">
${p.html}
    </div>
    ${inChallenge ? challengeMission(inChallenge) : ''}
    ${trialBox(cta, 'trial-wide')}
    ${authorBox(p.author)}
    <section class="comments" id="comments" data-slug="${esc(p.slug)}" aria-labelledby="comments-title"></section>
    ${p.tags.length ? `<div class="tags">${p.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="share">Share: <a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(p.title + ' ' + url)}">WhatsApp</a> · <a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a> · <a target="_blank" rel="noopener" href="https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(p.title)}">X</a> · <a target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}">LinkedIn</a></div>
  </div>
  <aside class="post-side">
    ${toc.length >= 3 ? `<nav class="toc" aria-label="In this guide"><h2>In this guide</h2><ol>${toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></nav>` : ''}
    ${trialBox(cta)}
  </aside>
</article>
${related.length ? `<section class="wrap related"><h2>Keep learning</h2><div class="grid">${related.map(card).join('')}</div></section>` : ''}`;
    write(`${p.slug}/index.html`, page({
      title: p.title, description: p.description, canonical: url, body, ogType: 'article', published: p.date, modified: p.updated,
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description,
          datePublished: isoDate(p.date), dateModified: isoDate(p.updated || p.date), inLanguage: 'en-GB',
          author: authorLd(p.author),
          publisher: ORG, mainEntityOfPage: { '@type': 'WebPage', '@id': url }, image: SITE.url + '/og-default.png',
          articleSection: c.name, keywords: p.tags.join(', '), wordCount: words(p.html) },
        { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Learning Hub', item: SITE.url + '/' },
          { '@type': 'ListItem', position: 2, name: c.name, item: `${SITE.url}/category/${p.category}/` },
          { '@type': 'ListItem', position: 3, name: p.title, item: url } ] },
      ],
    }));
  }

  /* Home */
  const home = `
<section class="hero">
  <div class="wrap">
    <p class="eyebrow">StemNest Academy</p>
    <h1>Student Learning Hub</h1>
    <p class="hero-sub">A place where our students and young coders learn beyond the classroom. Free, step-by-step guides to coding, games, websites and AI.</p>
    ${searchBox()}
    <div class="hero-cats">${Object.entries(CATEGORIES).map(([k, c]) => `<a class="chip chip-${k}" href="/category/${k}/">${c.emoji} ${esc(c.name)}</a>`).join('')}</div>
  </div>
</section>
<div class="wrap">${continueBox()}</div>
<div class="wrap with-side">
  <section aria-labelledby="latest">
    <h2 class="section-title"><a class="title-link" href="/challenges/">🏆 Take a challenge</a></h2>
    <div class="grid">${CHALLENGES.map(challengeCard).join('')}</div>
    <h2 id="latest" class="section-title">Latest guides</h2>
    <div class="grid">${posts.map(card).join('')}</div>
  </section>
  ${sidebar(posts)}
</div>`;
  write('index.html', page({
    title: SITE.name, description: 'Free step-by-step coding, AI and tech guides for kids, teens and parents from StemNest Academy: Scratch games, websites, Python, machine learning and more.',
    canonical: SITE.url + '/', body: home,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url + '/', inLanguage: 'en-GB', publisher: ORG }],
  }));

  /* Category pages */
  for (const [k, c] of Object.entries(CATEGORIES)) {
    const list = posts.filter(p => p.category === k);
    const body = `
<section class="hero hero-small">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Learning Hub</a> › ${esc(c.name)}</nav>
    <h1>${c.emoji} ${esc(c.name)}</h1>
    <p class="hero-sub">${esc(c.blurb)}</p>
  </div>
</section>
<div class="wrap with-side">
  <section>${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : '<p class="empty">New articles are on the way. Check back soon!</p>'}</section>
  ${sidebar(posts, k)}
</div>`;
    write(`category/${k}/index.html`, page({
      title: `${c.name}: coding and tech guides`, description: c.blurb, canonical: `${SITE.url}/category/${k}/`, body, noindex: !list.length,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.name, url: `${SITE.url}/category/${k}/`, isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url + '/' } }],
    }));
  }

  /* Challenges */
  const bySlug = Object.fromEntries(posts.map(p => [p.slug, p]));
  for (const ch of CHALLENGES) for (const s of ch.steps) if (!bySlug[s.post]) throw new Error(`${ch.slug}: "${s.post}" is not a published article`);
  write('challenges/index.html', page({
    title: 'Coding Challenges for Kids and Teens', description: 'Free coding challenges for ages 7 and up. Pick Scratch, Python or web development, work through the steps and save your progress as you go.',
    canonical: `${SITE.url}/challenges/`,
    body: `<section class="hero hero-small"><div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Learning Hub</a> › Challenges</nav>
      <h1>🏆 Coding challenges</h1><p class="hero-sub">Pick a challenge for your age, finish each mission, and come back any time to carry on.</p></div></section>
      <div class="wrap">${continueBox()}</div>
      <div class="wrap with-side"><section><div class="grid">${CHALLENGES.map(challengeCard).join('')}</div></section>${sidebar(posts)}</div>`,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Coding challenges', url: `${SITE.url}/challenges/`, isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url + '/' } }],
  }));
  for (const ch of CHALLENGES) {
    const url = `${SITE.url}/challenges/${ch.slug}/`;
    write(`challenges/${ch.slug}/index.html`, page({
      title: `${ch.title} (Ages ${ch.age})`, description: ch.description, canonical: url,
      body: `<section class="hero hero-small"><div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Learning Hub</a> › <a href="/challenges/">Challenges</a></nav>
        <h1>${ch.emoji} ${esc(ch.title)}</h1><p class="hero-sub">${esc(ch.intro)}</p>
        <div class="meta ch-meta">Ages ${esc(ch.age)} · ${ch.steps.length} steps · Free</div></div></section>
        <div class="wrap with-side"><section class="ch-page" data-challenge="${ch.slug}" data-title="${esc(ch.title)}" data-total="${ch.steps.length}">
          <div class="ch-bar-wrap"><div class="ch-progress-text" aria-live="polite"></div><div class="ch-bar" hidden><span></span></div>
          <button type="button" class="btn ch-start" hidden>Start the challenge</button></div>
          <ol class="ch-steps">${ch.steps.map((s, i) => {
            const p = bySlug[s.post];
            return `<li class="ch-step" data-post="${s.post}"><div class="ch-num" aria-hidden="true">${i + 1}</div><div>
              <h2><a href="/${s.post}/">${esc(s.name)}</a></h2>
              <p>${esc(s.mission)}</p>
              <div class="meta">${esc(p.title)} · ${p.minutes} min read${p.level ? ' · ' + esc(p.level) : ''}</div>
              <button type="button" class="ch-tick" hidden aria-pressed="false">Mark as finished</button></div></li>`;
          }).join('')}</ol>
          <p class="ch-note">No sign-up needed. Your progress is saved only in this browser, on this device. We never see it. <button type="button" class="link-btn ch-reset" hidden>Clear my progress</button></p>
          ${trialBox({ emoji: ch.emoji, title: 'Want a tutor to help you finish?', text: 'Work through it with an expert tutor in a free one-on-one class.' }, 'trial-wide')}
        </section>${sidebar(posts)}</div>`,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: ch.title, itemListOrder: 'https://schema.org/ItemListOrderAscending', numberOfItems: ch.steps.length,
        itemListElement: ch.steps.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${SITE.url}/${s.post}/` })) }],
    }));
  }

  /* Author pages */
  for (const a of AUTHORS) {
    const list = posts.filter(p => p.author.slug === a.slug);
    if (!list.length) continue;
    write(`author/${a.slug}/index.html`, page({
      title: `${a.name}${a.role ? ', ' + a.role : ''}`, description: shortText(a.bio || `Articles by ${a.name}`, 158), canonical: `${SITE.url}/author/${a.slug}/`,
      body: `<section class="hero hero-small"><div class="wrap author-hero">${authorAvatar(a, 88)}<div>
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Learning Hub</a> › Authors</nav>
        <h1>${esc(a.name)}</h1>${a.role ? `<p class="hero-sub">${esc(a.role)}</p>` : ''}</div></div></section>
        <div class="wrap with-side"><section>${a.bio ? `<p class="author-bio">${esc(a.bio)}</p>` : ''}
        <h2 class="section-title">Articles by ${esc(a.name)} (${list.length})</h2><div class="grid">${list.map(card).join('')}</div></section>${sidebar(posts)}</div>`,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: authorLd(a) }],
    }));
  }

  /* About / Contact / Privacy */
  const pagesDir = path.join(ROOT, 'content', 'pages');
  const staticPages = [];
  for (const f of fs.readdirSync(pagesDir).filter(f => f.endsWith('.md'))) {
    const { data, body } = parseFrontMatter(fs.readFileSync(path.join(pagesDir, f), 'utf8'));
    const slug = f.replace(/\.md$/, '');
    const html = renderMarkdown(body.replace(/\{\{email\}\}/g, SITE.email).replace(/\{\{trial\}\}/g, SITE.trialUrl).replace(/\{\{main\}\}/g, SITE.mainUrl)).html;
    staticPages.push({ slug, updated: data.updated });
    write(`${slug}/index.html`, page({
      title: data.title, description: data.description, canonical: `${SITE.url}/${slug}/`,
      body: `<div class="wrap narrow"><h1 class="page-title">${esc(data.title)}</h1>${data.updated ? `<p class="meta">Last updated ${esc(niceDate(data.updated))}</p>` : ''}<div class="prose">${html}</div></div>`,
    }));
  }

  /* 404 */
  write('404.html', page({
    title: 'Page not found', description: 'This page could not be found.', canonical: SITE.url + '/', noindex: true,
    body: `<div class="wrap narrow center"><h1 class="page-title">Page not found 🧭</h1><p>That page has moved or never existed. Try searching, or start from the latest guides.</p>${searchBox()}<p><a class="btn" href="/">Go to the Learning Hub</a></p></div>`,
  }));

  /* Search index, sitemap, robots, RSS */
  write('search-index.json', JSON.stringify(posts.map(p => ({
    t: p.title, d: p.description, u: `/${p.slug}/`, c: CATEGORIES[p.category].name, k: p.tags.join(' '),
    h: p.toc.map(x => x.text).join(' '),
  }))));
  const newest = posts.length ? posts.reduce((m, p) => new Date(p.updated) > new Date(m) ? p.updated : m, posts[0].updated) : new Date();
  const urls = [
    { loc: SITE.url + '/', lastmod: newest },
    { loc: `${SITE.url}/challenges/`, lastmod: newest },
    ...CHALLENGES.map(ch => ({ loc: `${SITE.url}/challenges/${ch.slug}/`, lastmod: newest })),
    ...Object.keys(CATEGORIES).filter(k => posts.some(p => p.category === k)).map(k => ({ loc: `${SITE.url}/category/${k}/`, lastmod: newest })),
    ...AUTHORS.filter(a => posts.some(p => p.author.slug === a.slug)).map(a => ({ loc: `${SITE.url}/author/${a.slug}/`, lastmod: newest })),
    ...posts.map(p => ({ loc: `${SITE.url}/${p.slug}/`, lastmod: p.updated })),
    ...staticPages.map(s => ({ loc: `${SITE.url}/${s.slug}/`, lastmod: s.updated })),
  ];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${watDay(u.lastmod)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
  write('rss.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(SITE.name)}</title>
<link>${SITE.url}/</link>
<description>${esc(SITE.tagline)}</description>
<language>en-gb</language>
<atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml"/>
${posts.slice(0, 30).map(p => `<item><title>${esc(p.title)}</title><link>${SITE.url}/${p.slug}/</link><guid>${SITE.url}/${p.slug}/</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`).join('\n')}
</channel>
</rss>
`);
  /* The pages.dev addresses must not compete with the real domain in search results */
  write('_headers', `https://stemnest-learn.pages.dev/*
  X-Robots-Tag: noindex

https://:version.stemnest-learn.pages.dev/*
  X-Robots-Tag: noindex

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/*.css
  Cache-Control: public, max-age=31536000, immutable
/*.js
  Cache-Control: public, max-age=31536000, immutable
/*.png
  Cache-Control: public, max-age=604800
`);

  /* Static assets */
  for (const f of fs.readdirSync(path.join(ROOT, 'static'))) fs.copyFileSync(path.join(ROOT, 'static', f), path.join(OUT, f));

  /* Fingerprint of the whole site: the deploy skips publishing when it matches the live one */
  const h = require('crypto').createHash('sha256');
  (function walk(d) {
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p); else { h.update(path.relative(OUT, p)); h.update(fs.readFileSync(p)); }
    }
  })(OUT);
  write('build-hash.txt', h.digest('hex'));

  if (SCHEDULED.length) {
    console.log('Scheduled (not published yet):');
    SCHEDULED.sort((a, b) => a.date - b.date).forEach(x => console.log(`  ${x.date.toISOString().slice(0, 16).replace('T', ' ')} UTC  ${x.slug}`));
  }
  console.log(`Built ${posts.length} articles (${repo.length} from the repo, ${posts.length - repo.length} from Admin), ${staticPages.length} pages → dist/`);
})().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });
