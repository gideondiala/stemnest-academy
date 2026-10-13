const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

/* Optional publish time for scheduling. Returns an ISO string, null (not given) or false (invalid). */
function parsePublishAt(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return false;
  return d.toISOString();
}

/* ?all=true (drafts and scheduled posts) is for admins only */
function adminForAll(req, res, next) {
  if (req.query.all !== 'true') return next();
  requireAuth(req, res, () => requireRole('admin', 'super_admin')(req, res, next));
}

/**
 * GET /api/blogs
 * Public: published posts whose publish time has come.
 * Admin (?all=true): every post, including drafts and scheduled ones.
 */
router.get('/', adminForAll, async (req, res, next) => {
  try {
    const all = req.query.all === 'true';
    const { rows } = await pool.query(`
      SELECT id, slug, title, excerpt, content, author_id, author_name,
             category, tags, cover_image, is_published, published_at, created_at, updated_at
      FROM blog_posts
      ${all ? '' : 'WHERE is_published = true AND (published_at IS NULL OR published_at <= NOW())'}
      ORDER BY created_at DESC`);
    res.json({ success: true, posts: rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/blogs/:slug
 * Public: one published post
 */
router.get('/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, slug, title, excerpt, content, author_id, author_name,
             category, tags, cover_image, is_published, published_at, created_at, updated_at
      FROM blog_posts
      WHERE slug = $1 AND is_published = true AND (published_at IS NULL OR published_at <= NOW())
    `, [req.params.slug]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }
    res.json({ success: true, post: rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/blogs
 * Admin: create a post. With is_published and a future published_at, it is scheduled.
 */
router.post('/', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { title, slug, excerpt, content, category, tags, cover_image, is_published } = req.body;
    const publishAt = parsePublishAt(req.body.published_at);
    if (publishAt === false) return res.status(400).json({ success: false, error: 'Publish date is not a valid date' });

    // Auto-generate slug if not provided
    const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const { rows } = await pool.query(`
      INSERT INTO blog_posts (
        title, slug, excerpt, content, author_id, author_name,
        category, tags, cover_image, is_published, published_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        CASE WHEN $10 = true THEN COALESCE($11::timestamptz, NOW()) ELSE NULL END
      ) RETURNING *
    `, [
      title, finalSlug, excerpt, content, req.user.id, req.user.name,
      category, tags || [], cover_image, is_published || false, publishAt
    ]);

    res.status(201).json({ success: true, post: rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/blogs/:id
 * Admin: update a post. published_at (with is_published) sets or changes its publish time.
 */
router.put('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, slug, excerpt, content, category, tags, cover_image, is_published } = req.body;
    const publishAt = parsePublishAt(req.body.published_at);
    if (publishAt === false) return res.status(400).json({ success: false, error: 'Publish date is not a valid date' });

    const { rows: existing } = await pool.query(`SELECT is_published FROM blog_posts WHERE id = $1`, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }

    /* published_at: the chosen time, NOW() when first published, cleared when unpublished, else unchanged */
    const wasPublished = existing[0].is_published;
    let publishClause = '';
    if (is_published === true && publishAt) publishClause = `, published_at = $10::timestamptz`;
    else if (is_published === true && !wasPublished) publishClause = `, published_at = NOW()`;
    else if (is_published === false) publishClause = `, published_at = NULL`;

    const params = [title, slug, excerpt, content, category, tags, cover_image, is_published, id];
    if (publishClause.includes('$10')) params.push(publishAt);
    const { rows } = await pool.query(`
      UPDATE blog_posts SET
        title = COALESCE($1, title),
        slug = COALESCE($2, slug),
        excerpt = COALESCE($3, excerpt),
        content = COALESCE($4, content),
        category = COALESCE($5, category),
        tags = COALESCE($6, tags),
        cover_image = COALESCE($7, cover_image),
        is_published = COALESCE($8, is_published),
        updated_at = NOW()
        ${publishClause}
      WHERE id = $9
      RETURNING *
    `, params);

    res.json({ success: true, post: rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/blogs/:id
 * Admin: Delete a blog post
 */
router.delete('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(`DELETE FROM blog_posts WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }
    res.json({ success: true, message: 'Blog post deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
