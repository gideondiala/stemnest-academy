/**
 * EdTech news drafts (services/newsDrafts.js) — admin only.
 *   GET  /api/blog-news/status   last run, sources, whether the Claude key is set
 *   POST /api/blog-news/run      fetch news and write drafts now
 */
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const news = require('../services/newsDrafts');
const logger = require('../utils/logger');

const router = express.Router();
let running = false;

router.get('/status', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try { res.json({ success: true, ...(await news.status()), running }); } catch (err) { next(err); }
});

router.post('/run', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  if (running) return res.status(409).json({ success: false, error: 'News drafts are already being prepared. Check back in a minute.' });
  running = true;
  try {
    const out = await news.run({ force: true });
    if (out.skipped) return res.status(400).json({ success: false, error: out.skipped });
    res.json({ success: true, ...out });
  } catch (e) {
    logger.warn('[NEWS] manual run failed: ' + e.message);
    res.status(502).json({ success: false, error: 'Could not prepare news drafts: ' + e.message });
  } finally { running = false; }
});

module.exports = router;
