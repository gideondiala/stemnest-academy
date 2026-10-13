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
};
const ROOT = __dirname, OUT = path.join(ROOT, 'dist');

/* ── helpers ── */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const isoDate = d => new Date(d).toISOString();
const niceDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const words = html => String(html).replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
function write(rel, content) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}
function categoryKey(c) {
  const k = slugify(c || '');
  if (CATEGORIES[k]) return k;
  return /how|build|make|tutorial|learn/i.test(c || '') ? 'learn-by-doing' : 'tech-explained';
}

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
function loadRepoPosts() {
  const dir = path.join(ROOT, 'content', 'posts');
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const { data, body } = parseFrontMatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    const { html, toc } = renderMarkdown(body);
    const slug = data.slug || f.replace(/\.md$/, '');
    if (!data.title || !data.description || !data.date) throw new Error(`${f}: title, description and date are required`);
    if (data.draft === 'true') return null;
    return {
      slug, title: data.title, description: data.description, html, toc,
      category: categoryKey(data.category), tags: data.tags || [], emoji: data.emoji,
      level: data.level, age: data.age, author: data.author || 'StemNest Academy Team',
      date: data.date, updated: data.updated || data.date, source: 'repo',
    };
  }).filter(Boolean);
}

async function loadApiPosts() {
  if (process.env.SKIP_API) return [];
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(SITE.api, { signal: ctl.signal }); clearTimeout(t);
    const d = await r.json();
    return (d.posts || []).filter(p => p.is_published && p.slug && p.title && p.content).map(p => {
      const { html, toc } = cleanAdminHtml(p.content);
      return {
        slug: slugify(p.slug), title: p.title, description: p.excerpt || String(p.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 155),
        html, toc, category: categoryKey(p.category), tags: p.tags || [], emoji: null,
        image: /^https:\/\//.test(p.cover_image || '') ? p.cover_image : null,
        author: p.author_name || 'StemNest Academy Team',
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
<script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.ga}');</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="${esc(SITE.name)} home"><img src="/logo.png" alt="StemNest Academy" width="150" height="50"><span>Learning Hub</span></a>
    <nav aria-label="Main">
      <a href="/category/learn-by-doing/">Learn by Doing</a>
      <a href="/category/tech-explained/">Tech Explained</a>
      <a class="hide-sm" href="/about/">About</a>
      <a class="nav-cta" href="${SITE.trialUrl}">Free trial<span class="hide-sm"> class</span></a>
    </nav>
  </div>
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
      <a href="/category/learn-by-doing/">Learn by Doing</a>
      <a href="/category/tech-explained/">Tech Explained</a>
      <a href="/rss.xml">RSS feed</a>
    </div>
    <div>
      <h2>StemNest</h2>
      <a href="/about/">About the Learning Hub</a>
      <a href="/contact/">Contact</a>
      <a href="/privacy/">Privacy policy</a>
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

function trialBox() {
  return `<section class="trial-box">
    <div class="trial-emoji">🚀</div>
    <h2>New to StemNest?</h2>
    <p>Book a free trial class and learn coding and AI live with our friendly tutors.</p>
    <a class="btn" href="${SITE.trialUrl}">Book a free trial</a>
  </section>`;
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
    const body = `
<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Learning Hub</a> › <a href="/category/${p.category}/">${esc(c.name)}</a></nav>
</div>
<article class="wrap post-layout">
  <div class="post-main">
    <header class="post-head">
      <a class="chip chip-${p.category}" href="/category/${p.category}/">${c.emoji} ${esc(c.name)}</a>
      <h1>${esc(p.title)}</h1>
      <p class="lede">${esc(p.description)}</p>
      <div class="meta">By ${esc(p.author)} · <time datetime="${isoDate(p.date)}">${esc(niceDate(p.date))}</time>${p.updated && p.updated !== p.date ? ` · Updated <time datetime="${isoDate(p.updated)}">${esc(niceDate(p.updated))}</time>` : ''} · ${p.minutes} min read${p.level ? ` · ${esc(p.level)}` : ''}${p.age ? ` · Ages ${esc(p.age)}` : ''}</div>
    </header>
    <div class="post-cover">${cover(p, true)}</div>
    ${toc.length >= 3 ? `<details class="toc-mobile"><summary>In this guide</summary><ol>${toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></details>` : ''}
    <div class="prose">
${p.html}
    </div>
    ${trialBox().replace('trial-box', 'trial-box trial-wide')}
    ${p.tags.length ? `<div class="tags">${p.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="share">Share: <a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(p.title + ' ' + url)}">WhatsApp</a> · <a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a> · <a target="_blank" rel="noopener" href="https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(p.title)}">X</a> · <a target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}">LinkedIn</a></div>
  </div>
  <aside class="post-side">
    ${toc.length >= 3 ? `<nav class="toc" aria-label="In this guide"><h2>In this guide</h2><ol>${toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></nav>` : ''}
    ${trialBox()}
  </aside>
</article>
${related.length ? `<section class="wrap related"><h2>Keep learning</h2><div class="grid">${related.map(card).join('')}</div></section>` : ''}`;
    write(`${p.slug}/index.html`, page({
      title: p.title, description: p.description, canonical: url, body, ogType: 'article', published: p.date, modified: p.updated,
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description,
          datePublished: isoDate(p.date), dateModified: isoDate(p.updated || p.date), inLanguage: 'en-GB',
          author: { '@type': 'Organization', name: p.author === 'StemNest Academy Team' ? 'StemNest Academy' : p.author, url: SITE.mainUrl },
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
<div class="wrap with-side">
  <section aria-labelledby="latest">
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
  <section>${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : '<p>New guides are on the way.</p>'}</section>
  ${sidebar(posts, k)}
</div>`;
    write(`category/${k}/index.html`, page({
      title: `${c.name}: coding and tech guides`, description: c.blurb, canonical: `${SITE.url}/category/${k}/`, body,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.name, url: `${SITE.url}/category/${k}/`, isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url + '/' } }],
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
    ...Object.keys(CATEGORIES).map(k => ({ loc: `${SITE.url}/category/${k}/`, lastmod: newest })),
    ...posts.map(p => ({ loc: `${SITE.url}/${p.slug}/`, lastmod: p.updated })),
    ...staticPages.map(s => ({ loc: `${SITE.url}/${s.slug}/`, lastmod: s.updated })),
  ];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${isoDate(u.lastmod).slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}
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

  console.log(`Built ${posts.length} articles (${repo.length} from the repo, ${posts.length - repo.length} from Admin), ${staticPages.length} pages → dist/`);
})().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });
