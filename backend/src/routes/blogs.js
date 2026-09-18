const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

/**
 * GET /api/blogs
 * Public: Get all published blog posts (or all if admin requested)
 */
router.get('/', async (req, res, next) => {
  try {
    const { all } = req.query;
    let query = `
      SELECT id, slug, title, excerpt, content, author_id, author_name, 
             category, tags, cover_image, is_published, published_at, created_at, updated_at
      FROM blog_posts
    `;
    const params = [];
    
    // If not requesting all (admin), only show published
    if (all !== 'true') {
      query += ` WHERE is_published = true `;
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const { rows } = await pool.query(query, params);
    res.json({ success: true, posts: rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/blogs/:slug
 * Public: Get a single blog post by slug
 */
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { rows } = await pool.query(`
      SELECT id, slug, title, excerpt, content, author_id, author_name, 
             category, tags, cover_image, is_published, published_at, created_at, updated_at
      FROM blog_posts
      WHERE slug = $1
    `, [slug]);
    
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
 * Admin: Create a new blog post
 */
router.post('/', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { title, slug, excerpt, content, category, tags, cover_image, is_published } = req.body;
    
    // Auto-generate slug if not provided
    const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    
    const { rows } = await pool.query(`
      INSERT INTO blog_posts (
        title, slug, excerpt, content, author_id, author_name, 
        category, tags, cover_image, is_published, published_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        CASE WHEN $10 = true THEN NOW() ELSE NULL END
      ) RETURNING *
    `, [
      title, finalSlug, excerpt, content, req.user.id, req.user.name,
      category, tags || [], cover_image, is_published || false
    ]);
    
    res.status(201).json({ success: true, post: rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/blogs/:id
 * Admin: Update an existing blog post
 */
router.put('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, slug, excerpt, content, category, tags, cover_image, is_published } = req.body;
    
    const { rows: existing } = await pool.query(`SELECT is_published FROM blog_posts WHERE id = $1`, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }
    
    // If it's being published for the first time, set published_at
    const wasPublished = existing[0].is_published;
    let publishClause = '';
    if (is_published === true && !wasPublished) {
      publishClause = `, published_at = NOW()`;
    } else if (is_published === false) {
      publishClause = `, published_at = NULL`;
    }
    
    const { rows } = await pool.query(`
      UPDATE blog_posts SET
        title = COALESCE($1, title),
        slug = COALESCE($2, slug),
        excerpt = COALESCE($3, excerpt),
        content = COALESCE($4, content),
        category = COALESCE($5, category),
        tags = COALESCE($6, tags),
        cover_image = COALESCE($7, cover_image),
        is_published = COALESCE($8, is_published)
        ${publishClause}
      WHERE id = $9
      RETURNING *
    `, [title, slug, excerpt, content, category, tags, cover_image, is_published, id]);
    
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
