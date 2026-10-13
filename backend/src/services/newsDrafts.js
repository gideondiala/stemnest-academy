/**
 * EdTech news drafts for the Learning Hub (category "EdTech News").
 *
 * Once a day: read trusted education-technology RSS feeds, keep stories
 * from the last few days that we haven't seen, and ask Claude to choose up
 * to two that matter to parents and students and write an ORIGINAL short
 * article about each (what happened, why it matters, what families can do,
 * StemNest's view) with a credit and link to the source.
 *
 * Results are saved in Admin → Blog as DRAFTS. Nothing is published until a
 * person reviews it, which keeps the site safe with Google and AdSense
 * (no copied or mass-produced articles) and avoids copyright problems.
 *
 * Needs ANTHROPIC_API_KEY on the server; without it the job does nothing.
 */
const pool = require('../config/db');
const logger = require('../utils/logger');

const SOURCES = [
  { name: 'EdSurge', url: 'https://www.edsurge.com/articles_rss' },
  { name: 'eSchool News', url: 'https://www.eschoolnews.com/feed/' },
  { name: 'Tech & Learning', url: 'https://www.techlearning.com/feeds/all' },
  { name: 'THE Journal', url: 'https://thejournal.com/rss-feeds/news.aspx' },
  { name: 'Google for Education', url: 'https://blog.google/outreach-initiatives/education/rss/' },
  { name: 'BBC News Education', url: 'https://feeds.bbci.co.uk/news/education/rss.xml' },
  { name: 'The Hechinger Report', url: 'https://hechingerreport.org/feed/' },
  { name: 'Getting Smart', url: 'https://www.gettingsmart.com/feed/' },
];
const MODEL = 'claude-opus-5-5';
const MAX_DRAFTS = 2;          // per run
const MAX_AGE_DAYS = 4;        // only fresh stories
const UA = 'Mozilla/5.0 (compatible; StemNestNewsBot/1.0; +https://learn.stemnestacademy.co.uk)';

/* ── Feeds ── */
const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
  .replace(/<[^>]+>/g, ' ')            // feeds often escape their HTML (&lt;p&gt;), so strip again once unescaped
  .replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };

/** RSS <item> and Atom <entry> → [{ title, link, summary, published }] */
function parseFeed(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
    const b = m[0];
    let link = decode(tag(b, 'link'));
    if (!link) { const a = b.match(/<link[^>]*href="([^"]+)"/i); link = a ? a[1] : ''; }
    const title = decode(tag(b, 'title'));
    const summary = decode(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content')).slice(0, 600);
    const when = new Date(decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')));
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, summary, published: isNaN(when) ? null : when });
  }
  return out;
}

async function fetchText(url, ms = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

/** Fresh, unseen stories from all sources. */
async function collectStories() {
  const since = Date.now() - MAX_AGE_DAYS * 86400e3;
  const all = [];
  for (const s of SOURCES) {
    try {
      const items = parseFeed(await fetchText(s.url)).filter(i => !i.published || i.published.getTime() >= since).slice(0, 15);
      items.forEach(i => all.push({ ...i, source: s.name }));
    } catch (e) { logger.warn(`[NEWS] ${s.name} feed failed: ${e.message}`); }
  }
  if (!all.length) return [];
  const seen = new Set((await pool.query(`SELECT url FROM news_seen WHERE url = ANY($1::text[])`, [all.map(a => a.link)])).rows.map(r => r.url));
  return all.filter(a => !seen.has(a.link)).sort((a, b) => (b.published || 0) - (a.published || 0)).slice(0, 40);
}

/** Readable text from an article page, so the draft rests on the facts it reports. */
async function articleText(url) {
  try {
    const html = await fetchText(url, 12000);
    const body = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0]
      .replace(/<(script|style|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');
    return decode(body).slice(0, 7000);
  } catch { return ''; }
}

/* ── Claude ── */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['articles'],
  properties: {
    articles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['story', 'title', 'excerpt', 'tags', 'body_html'],
        properties: {
          story: { type: 'integer', description: 'Number of the story this article is about' },
          title: { type: 'string', description: 'Original headline, under 70 characters' },
          excerpt: { type: 'string', description: '120 to 155 character summary for search results' },
          tags: { type: 'array', items: { type: 'string' } },
          body_html: { type: 'string', description: 'Article body as simple HTML: <h2>, <p>, <ul>, <li>, <strong>, <a>' },
        },
      },
    },
  },
};

const SYSTEM = `You write the "EdTech News" section of the StemNest Learning Hub, the free learning site of StemNest Academy, an online school that teaches children and teenagers coding, game development, web and app development, data science and AI.

Readers are parents and students (roughly 8 to 17). Choose stories that genuinely matter to them: AI and technology in schools, coding and computing education, digital safety, new learning tools, research on how children learn. Skip stories that are only about school administration, funding politics, higher-education finance or company sales announcements. It is fine to choose fewer than the maximum, or none.

For each chosen story write an ORIGINAL article, 450 to 650 words:
- Use only facts stated in the story material provided. Never invent numbers, quotes, names or details. If a detail is unclear, leave it out.
- Do not copy sentences from the source. Explain it in your own words.
- Structure with <h2> headings: what happened; why it matters for students and parents; practical things families can do; StemNest's view (a short, balanced take).
- Warm, clear British English. Short paragraphs. Explain any technical term.
- Never use em dashes or en dashes. Use commas, full stops or colons instead.
- Avoid stock phrases such as "delve", "dive into", "game-changer", "unlock", "in today's fast-paced world", "in conclusion".
- End with: <p class="source">Source: <a href="URL">Original headline</a>, Publication name.</p>
- Where it fits naturally, you may link to one of these StemNest guides: https://learn.stemnestacademy.co.uk/how-do-ai-chatbots-work-explained/ , https://learn.stemnestacademy.co.uk/coding-or-ai-what-should-kids-learn-in-2026/ , https://learn.stemnestacademy.co.uk/how-to-teach-kids-to-code-parents-guide/ , https://learn.stemnestacademy.co.uk/what-is-machine-learning-explained-for-kids/`;

let _client = null;
function client() {
  if (!_client) { const Anthropic = require('@anthropic-ai/sdk'); _client = new (Anthropic.default || Anthropic)(); }
  return _client;
}

async function askClaude(stories) {
  const material = stories.map((s, i) => `STORY ${i + 1}\nPublication: ${s.source}\nHeadline: ${s.title}\nURL: ${s.link}\nPublished: ${s.published ? s.published.toISOString().slice(0, 10) : 'unknown'}\nSummary: ${s.summary}\n${s.text ? 'Article text:\n' + s.text : ''}`).join('\n\n---\n\n');
  const params = {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Here are today's candidate stories. Choose up to ${MAX_DRAFTS} and write the articles.\n\n${material}` }],
  };
  let res;
  try {
    /* On a policy decline, Anthropic re-runs the request on its recommended fallback model */
    res = await client().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (e) {
    if (e && e.status === 400 && /fallback/i.test(e.message || '')) res = await client().messages.create(params);
    else throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude declined the request' + (res.stop_details && res.stop_details.category ? ` (${res.stop_details.category})` : ''));
  if (res.stop_reason === 'max_tokens') throw new Error('Draft was cut off (max_tokens)');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { data: JSON.parse(text), usage: res.usage };
}

/* ── Saving drafts ── */
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
const tidy = s => String(s || '').replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-').trim();
function cleanHtml(html) {
  return tidy(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/<(iframe|object|embed|style)[\s\S]*?<\/\1>/gi, '');
}

async function uniqueSlug(base) {
  let slug = base || 'edtech-news', n = 1;
  while ((await pool.query('SELECT 1 FROM blog_posts WHERE slug = $1', [slug])).rows.length) slug = `${base}-${++n}`;
  return slug;
}

/**
 * One run. Returns { drafts: [{id, title}], considered, skipped }.
 * `force` ignores the once-a-day guard (Admin "Fetch news now").
 */
async function run({ force = false } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: 'ANTHROPIC_API_KEY is not set on the server', drafts: [], considered: 0 };
  /* Only one server process runs it per day, even with several API instances */
  const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
  if (!force) {
    const won = await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('news_last_run', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW() WHERE settings.value IS DISTINCT FROM EXCLUDED.value
       RETURNING key`, [today]);
    if (!won.rows.length) return { skipped: 'already ran today', drafts: [], considered: 0 };
  }

  const stories = await collectStories();
  if (!stories.length) { await saveStatus({ at: new Date(), drafts: 0, considered: 0, note: 'No new stories' }); return { drafts: [], considered: 0 }; }
  for (const s of stories.slice(0, 12)) s.text = await articleText(s.link);

  let data, usage;
  try { ({ data, usage } = await askClaude(stories)); }
  catch (e) { await saveStatus({ at: new Date(), drafts: 0, considered: stories.length, error: e.message }); throw e; }
  const drafts = [];
  for (const a of (data.articles || []).slice(0, MAX_DRAFTS)) {
    const story = stories[a.story - 1];
    if (!story || !a.title || !a.body_html || a.body_html.length < 800) continue;
    const slug = await uniqueSlug(slugify(tidy(a.title)));
    const body = cleanHtml(a.body_html) + (a.body_html.includes(story.link) ? '' : `<p class="source">Source: <a href="${story.link.replace(/"/g, '%22')}">${story.title.replace(/</g, '&lt;')}</a>, ${story.source}.</p>`);
    const r = await pool.query(
      `INSERT INTO blog_posts (title, slug, excerpt, content, author_name, category, tags, is_published)
       VALUES ($1, $2, $3, $4, 'StemNest Academy Team', 'edtech-news', $5, FALSE) RETURNING id`,
      [tidy(a.title).slice(0, 200), slug, tidy(a.excerpt).slice(0, 300), body, (a.tags || []).slice(0, 6).map(t => tidy(t).toLowerCase())]);
    drafts.push({ id: r.rows[0].id, title: tidy(a.title), source: story.source });
  }
  /* Remember every story we looked at, so tomorrow only brings new ones */
  await pool.query(
    `INSERT INTO news_seen (url, title, source) SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) ON CONFLICT (url) DO NOTHING`,
    [stories.map(s => s.link), stories.map(s => s.title.slice(0, 300)), stories.map(s => s.source)]);

  const status = { at: new Date(), drafts: drafts.length, considered: stories.length, titles: drafts.map(d => d.title), tokens: usage ? (usage.input_tokens || 0) + (usage.output_tokens || 0) : null };
  await saveStatus(status);
  logger.info(`[NEWS] ${drafts.length} draft(s) from ${stories.length} stories`);
  if (drafts.length) {
    const mods = (await pool.query(`SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active = TRUE`)).rows;
    const notify = require('./notificationService');
    mods.forEach(u => notify.saveNotification(u.id, 'news_draft', `${drafts.length} EdTech news draft${drafts.length === 1 ? '' : 's'} to review`,
      drafts.map(d => d.title).join(' · ') + '. Review them in Admin → Blog → All Posts before publishing.'));
  }
  return { drafts, considered: stories.length };
}

async function saveStatus(s) {
  await pool.query(`INSERT INTO settings (key, value, updated_at) VALUES ('news_last_status', $1, NOW())
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(s)]).catch(() => {});
}

async function status() {
  const r = (await pool.query(`SELECT value FROM settings WHERE key = 'news_last_status'`)).rows[0];
  return { configured: !!process.env.ANTHROPIC_API_KEY, sources: SOURCES.map(s => s.name), maxDrafts: MAX_DRAFTS, last: r ? JSON.parse(r.value) : null };
}

/* Daily at about 06:00 Nigeria time (checked hourly; the settings row makes it once a day) */
let _timer = null;
function startNewsJob() {
  if (_timer) return;
  const tick = () => {
    const watHour = new Date(Date.now() + 3600e3).getUTCHours();
    if (watHour === 6) run().catch(e => logger.warn('[NEWS] run failed: ' + e.message));
  };
  _timer = setInterval(tick, 60 * 60 * 1000);
  setTimeout(tick, 5 * 60 * 1000);
}

module.exports = { run, status, startNewsJob, SOURCES, _internals: { parseFeed, collectStories, cleanHtml, tidy, slugify } };
