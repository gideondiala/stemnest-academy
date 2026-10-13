/**
 * Learning Hub comments (learn.stemnestacademy.co.uk)
 *
 * Public:
 *   GET  /api/blog-comments?slug=…&offset=0&limit=5   approved comments, newest first, with staff replies
 *   POST /api/blog-comments                            { slug, name, body, website, elapsed } → held for approval
 * Moderators (admin, super_admin):
 *   GET    /api/blog-comments/moderation?status=pending|approved|hidden
 *   PUT    /api/blog-comments/:id/status               { status: 'approved' | 'hidden' }
 *   POST   /api/blog-comments/:id/reply                { body } → published straight away as the author's reply
 *   DELETE /api/blog-comments/:id
 *
 * Many readers are children, so nothing a visitor writes is shown until a
 * moderator approves it. Spam protection: a hidden field bots fill in, a
 * minimum time on the form, a link limit, and a per-IP rate limit.
 */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const logger = require('../utils/logger');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const MODERATORS = ['admin', 'super_admin'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const postLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 4, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'You have posted a few comments already. Please wait a few minutes and try again.' },
});

const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
const ipHash = ip => crypto.createHash('sha256').update(String(ip || '') + (process.env.JWT_SECRET || '')).digest('hex').slice(0, 32);

function shape(r) {
  return { id: r.id, name: r.name, body: r.body, isStaff: r.is_staff, createdAt: r.created_at };
}

/* ── Public: approved comments for one article ── */
router.get('/', async (req, res, next) => {
  try {
    const slug = String(req.query.slug || '');
    if (!SLUG_RE.test(slug) || slug.length > 160) return res.status(400).json({ success: false, error: 'Unknown article' });
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const total = Number((await pool.query(
      `SELECT COUNT(*) FROM blog_comments WHERE post_slug = $1 AND parent_id IS NULL AND status = 'approved'`, [slug])).rows[0].count);
    const top = (await pool.query(
      `SELECT id, name, body, is_staff, created_at FROM blog_comments
       WHERE post_slug = $1 AND parent_id IS NULL AND status = 'approved'
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [slug, limit, offset])).rows;
    const replies = top.length ? (await pool.query(
      `SELECT id, parent_id, name, body, is_staff, created_at FROM blog_comments
       WHERE parent_id = ANY($1::uuid[]) AND status = 'approved' ORDER BY created_at ASC`, [top.map(t => t.id)])).rows : [];
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true, total,
      comments: top.map(t => ({ ...shape(t), replies: replies.filter(r => r.parent_id === t.id).map(shape) })),
    });
  } catch (err) { next(err); }
});

/* ── Public: post a comment (held for approval) ── */
router.post('/', postLimiter, async (req, res, next) => {
  try {
    const { slug, website, elapsed } = req.body || {};
    const name = clean(req.body && req.body.name).replace(/\s+/g, ' ');
    const body = clean(req.body && req.body.body).replace(/\n{3,}/g, '\n\n');
    /* Bots: the hidden "website" field is filled, or the form was sent in under 3 seconds. Pretend it worked. */
    if (website || (Number(elapsed) || 0) < 3000) {
      logger.info('[BLOG COMMENTS] spam blocked');
      return res.json({ success: true, pending: true });
    }
    if (!SLUG_RE.test(String(slug || '')) || String(slug).length > 160) return res.status(400).json({ success: false, error: 'Unknown article' });
    if (name.length < 2 || name.length > 40) return res.status(400).json({ success: false, error: 'Please enter a name (2 to 40 characters). A first name is enough.' });
    if (body.length < 3 || body.length > 1500) return res.status(400).json({ success: false, error: 'Comments must be between 3 and 1,500 characters.' });
    if ((body.match(/https?:\/\/|www\./gi) || []).length > 1) return res.status(400).json({ success: false, error: 'Please include at most one link.' });
    const r = await pool.query(
      `INSERT INTO blog_comments (post_slug, name, body, ip_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [slug, name, body, ipHash(req.ip)]);
    logger.info(`[BLOG COMMENTS] new comment ${r.rows[0].id} on ${slug} awaiting approval`);
    /* Let moderators know (in-app notification; never blocks the reply) */
    pool.query(`SELECT id FROM users WHERE role = ANY($1::text[]) AND is_active = TRUE`, [MODERATORS]).then(m => {
      const notify = require('../services/notificationService');
      m.rows.forEach(u => notify.saveNotification(u.id, 'blog_comment', 'New blog comment to review', `${name} commented on "${slug}".`));
    }).catch(() => {});
    res.json({ success: true, pending: true });
  } catch (err) { next(err); }
});

/* ── Moderation ── */
router.get('/moderation', requireAuth, requireRole(...MODERATORS), async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'hidden'].includes(req.query.status) ? req.query.status : 'pending';
    const rows = (await pool.query(
      `SELECT c.id, c.post_slug, c.parent_id, c.name, c.body, c.status, c.is_staff, c.created_at,
              (SELECT COUNT(*)::int FROM blog_comments r WHERE r.parent_id = c.id AND r.is_staff) AS staff_replies,
              (SELECT json_agg(json_build_object('name', r.name, 'body', r.body, 'createdAt', r.created_at) ORDER BY r.created_at)
                 FROM blog_comments r WHERE r.parent_id = c.id AND r.is_staff) AS replies
       FROM blog_comments c
       WHERE c.status = $1 AND c.parent_id IS NULL
       ORDER BY c.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`, [status])).rows;
    const counts = (await pool.query(
      `SELECT status, COUNT(*)::int AS n FROM blog_comments WHERE parent_id IS NULL GROUP BY status`)).rows;
    res.json({ success: true, comments: rows, counts: Object.fromEntries(counts.map(c => [c.status, c.n])) });
  } catch (err) { next(err); }
});

router.put('/:id/status', requireAuth, requireRole(...MODERATORS), async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ success: false, error: 'Comment not found' });
    const status = req.body && req.body.status;
    if (!['approved', 'hidden', 'pending'].includes(status)) return res.status(400).json({ success: false, error: 'Unknown status' });
    const r = await pool.query(
      `UPDATE blog_comments SET status = $2, moderated_at = NOW(), moderated_by = $3 WHERE id = $1 RETURNING id`,
      [req.params.id, status, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Comment not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/reply', requireAuth, requireRole(...MODERATORS), async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ success: false, error: 'Comment not found' });
    const body = clean(req.body && req.body.body);
    if (body.length < 2 || body.length > 2000) return res.status(400).json({ success: false, error: 'Please write a reply (up to 2,000 characters).' });
    const parent = (await pool.query(`SELECT id, post_slug, parent_id FROM blog_comments WHERE id = $1`, [req.params.id])).rows[0];
    if (!parent || parent.parent_id) return res.status(404).json({ success: false, error: 'Comment not found' });
    const name = clean(req.body && req.body.name) || (req.user.name ? req.user.name.split(' ')[0] + ' (StemNest)' : 'StemNest Academy');
    /* Replying to a comment approves it, so the conversation appears together */
    await pool.query(`UPDATE blog_comments SET status = 'approved', moderated_at = COALESCE(moderated_at, NOW()), moderated_by = COALESCE(moderated_by, $2) WHERE id = $1 AND status = 'pending'`, [parent.id, req.user.id]);
    const r = await pool.query(
      `INSERT INTO blog_comments (post_slug, parent_id, name, body, status, is_staff, staff_id, moderated_at, moderated_by)
       VALUES ($1, $2, $3, $4, 'approved', TRUE, $5, NOW(), $5) RETURNING id`,
      [parent.post_slug, parent.id, name.slice(0, 60), body, req.user.id]);
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireRole(...MODERATORS), async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ success: false, error: 'Comment not found' });
    const r = await pool.query(`DELETE FROM blog_comments WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Comment not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
