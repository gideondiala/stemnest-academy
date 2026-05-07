/**
 * Auth routes
 * POST /api/auth/login
 * POST /api/auth/logout
 * POST /api/auth/refresh
 * POST /api/auth/forgot-password
 * POST /api/auth/reset-password
 * POST /api/auth/verify-email
 * GET  /api/auth/me
 */

require('dotenv').config();
const express   = require('express');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const { z }     = require('zod');
const rateLimit = require('express-rate-limit');

const pool       = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const emailSvc   = require('../services/emailService');
const waSvc      = require('../services/whatsappService');
const logger     = require('../utils/logger');

const router = express.Router();

/* ── Stricter rate limit for auth (10 attempts / 15 min) ── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many attempts — try again in 15 minutes' },
});

/* ── Validation schemas ── */
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token:    z.string().min(10),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/* ── Token helpers ── */
function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, staffId: user.staff_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/* ══════════════════════════════════════════════
   POST /api/auth/login
══════════════════════════════════════════════ */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    /* Look up user */
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE',
      [email]
    );
    const user = result.rows[0];

    if (!user) {
      /* Constant-time response to prevent user enumeration */
      await bcrypt.compare(password, '$2b$12$invalidhashpadding000000000000000000000000000000000000');
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    /* Update last login */
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    /* Issue tokens */
    const accessToken  = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    /* Store hashed refresh token */
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashToken(refreshToken), expiresAt]
    );

    logger.info(`[LOGIN] ${user.email} (${user.role})`);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id:      user.id,
        name:    user.name,
        email:   user.email,
        role:    user.role,
        staffId: user.staff_id,
        photo:   user.photo_url,
      },
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ══════════════════════════════════════════════
   POST /api/auth/refresh
══════════════════════════════════════════════ */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'Refresh token required' });
    }

    /* Verify JWT signature */
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ success: false, error: 'Invalid token type' });
    }

    /* Check token exists in DB and is not revoked */
    const stored = await pool.query(
      `SELECT * FROM refresh_tokens
       WHERE user_id = $1 AND token_hash = $2
         AND revoked_at IS NULL AND expires_at > NOW()`,
      [decoded.id, hashToken(refreshToken)]
    );

    if (!stored.rows.length) {
      return res.status(401).json({ success: false, error: 'Token revoked or expired' });
    }

    /* Get fresh user data */
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = TRUE',
      [decoded.id]
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    /* Rotate: revoke old, issue new */
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND token_hash = $2',
      [decoded.id, hashToken(refreshToken)]
    );

    const newAccess  = signAccessToken(user);
    const newRefresh = signRefreshToken(user);
    const expiresAt  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashToken(newRefresh), expiresAt]
    );

    res.json({ success: true, accessToken: newAccess, refreshToken: newRefresh });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════
   POST /api/auth/logout
══════════════════════════════════════════════ */
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND token_hash = $2',
        [req.user.id, hashToken(refreshToken)]
      );
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════
   POST /api/auth/forgot-password
══════════════════════════════════════════════ */
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = forgotSchema.parse(req.body);

    /* Always return 200 — never reveal if email exists */
    const result = await pool.query(
      'SELECT id, name, email, phone FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE',
      [email]
    );

    if (result.rows.length) {
      const user = result.rows[0];

      /* Generate secure random token */
      const rawToken  = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + (parseInt(process.env.RESET_TOKEN_EXPIRES_MINS) || 30) * 60 * 1000);

      /* Invalidate any existing reset tokens for this user */
      await pool.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );

      /* Store new token */
      await pool.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokenHash, expiresAt]
      );

      const resetUrl = `${process.env.APP_URL}/pages/login.html?reset=${rawToken}`;

      /* Send email */
      await emailSvc.sendPasswordResetEmail({
        to: user.email, name: user.name, resetUrl,
      }).catch(e => logger.error('Reset email failed:', e.message));

      /* Send WhatsApp if phone available */
      if (user.phone) {
        await waSvc.sendPasswordResetWA({ to: user.phone, name: user.name, resetUrl })
          .catch(e => logger.error('Reset WA failed:', e.message));
      }

      logger.info(`[FORGOT PASSWORD] Reset link sent to ${email}`);
    }

    /* Always same response */
    res.json({
      success: true,
      message: 'If that email is registered, a reset link has been sent.',
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ══════════════════════════════════════════════
   POST /api/auth/reset-password
══════════════════════════════════════════════ */
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { token, password } = resetSchema.parse(req.body);

    const tokenHash = hashToken(token);

    /* Find valid token */
    const result = await pool.query(
      `SELECT prt.*, u.email, u.name
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()`,
      [tokenHash]
    );

    if (!result.rows.length) {
      return res.status(400).json({
        success: false,
        error: 'Reset link is invalid or has expired. Please request a new one.',
      });
    }

    const record = result.rows[0];

    /* Hash new password */
    const passwordHash = await bcrypt.hash(password, 12);

    /* Update password */
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, record.user_id]
    );

    /* Mark token as used */
    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [record.id]
    );

    /* Revoke all refresh tokens (force re-login everywhere) */
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1',
      [record.user_id]
    );

    logger.info(`[RESET PASSWORD] Password reset for ${record.email}`);

    res.json({ success: true, message: 'Password reset successfully. Please log in.' });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/* ══════════════════════════════════════════════
   GET /api/auth/me
══════════════════════════════════════════════ */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.staff_id, u.phone,
              u.whatsapp, u.photo_url, u.bio, u.date_of_birth,
              u.email_verified, u.last_login_at, u.created_at
       FROM users u
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
