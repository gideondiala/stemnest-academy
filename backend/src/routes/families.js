/**
 * Family login routes
 *
 * Parent (role 'parent'):
 *   GET  /api/families/me                 — my children
 *   POST /api/families/switch             — { studentId } → a dashboard token for that child
 *   POST /api/families/claim              — { studentLogin, password } add a child I can prove is mine
 * Public:
 *   POST /api/families/register           — set up a family login with a first child's login
 * Post-Sales / admin:
 *   GET  /api/families/suggestions        — children who look like one family (shared phone)
 *   POST /api/families/suggestions/:key/dismiss
 *   GET  /api/families                    — existing families
 *   POST /api/families                    — { parentName, parentEmail, parentPhone, studentIds[] }
 *   POST   /api/families/:parentId/children            — { studentId }
 *   DELETE /api/families/:parentId/children/:studentId
 */

const express   = require('express');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z }     = require('zod');

const pool   = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const family = require('../services/familyService');

const router = express.Router();
const STAFF = ['admin', 'super_admin', 'postsales'];

const familyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many attempts — try again in 15 minutes' },
});

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

async function tx(res, next, fn, okStatus = 200) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const body = await fn(client);
    await client.query('COMMIT');
    res.status(okStatus).json(body);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: err.errors[0].message });
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'That email is already in use' });
    next(err);
  } finally {
    client.release();
  }
}

/** Find a student by student ID (S-0012) or login email and check their password. */
async function verifyStudentLogin(db, login, password) {
  const id = String(login || '').trim();
  const r = await db.query(
    /^S-\d+$/i.test(id)
      ? `SELECT id, name, email, password_hash, staff_id FROM users WHERE UPPER(staff_id) = UPPER($1) AND role = 'student' AND is_active = TRUE`
      : `SELECT id, name, email, password_hash, staff_id FROM users WHERE LOWER(email) = LOWER($1) AND role = 'student' AND is_active = TRUE`,
    [id]
  );
  const s = r.rows[0];
  const ok = s ? await bcrypt.compare(String(password || ''), s.password_hash) : false;
  if (!ok) throw httpError(401, "That student ID / email and password don't match");
  return s;
}

/* ══════════════ Parent ══════════════ */

router.get('/me', requireAuth, requireRole('parent'), async (req, res, next) => {
  try {
    res.json({ success: true, children: await family.childrenOf(pool, req.user.id) });
  } catch (err) { next(err); }
});

router.post('/switch', requireAuth, requireRole('parent'), async (req, res, next) => {
  try {
    const { studentId } = req.body || {};
    const r = await pool.query(
      `SELECT u.id, u.name, u.email, u.staff_id, u.timezone
       FROM parent_children pc JOIN users u ON u.id = pc.student_id
       WHERE pc.parent_id = $1 AND pc.student_id = $2 AND u.is_active = TRUE`,
      [req.user.id, studentId]
    );
    if (!r.rows.length) return res.status(403).json({ success: false, error: 'This child is not on your family login' });
    const c = r.rows[0];
    const token = jwt.sign(
      { id: c.id, email: c.email, role: 'student', staffId: c.staff_id, parentId: req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({
      success: true,
      token,
      user: { id: c.id, name: c.name, email: c.email, role: 'student', staffId: c.staff_id, timezone: c.timezone, parentId: req.user.id },
    });
  } catch (err) { next(err); }
});

router.post('/claim', familyLimiter, requireAuth, requireRole('parent'), (req, res, next) => {
  tx(res, next, async (client) => {
    const s = await verifyStudentLogin(client, req.body && req.body.studentLogin, req.body && req.body.password);
    await family.linkChild(client, { parentId: req.user.id, studentId: s.id, byUserId: req.user.id, via: 'parent' });
    logger.info(`[FAMILY] Parent ${req.user.email} added ${s.name} (${s.staff_id})`);
    return { success: true, child: { id: s.id, name: s.name, staffId: s.staff_id } };
  });
});

/* ══════════════ Public: set up a family login ══════════════ */

const registerSchema = z.object({
  parentName:      z.string().trim().min(2, 'Please enter your name'),
  email:           z.string().trim().email('Please enter a valid email'),
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  phone:           z.string().trim().optional().nullable(),
  studentLogin:    z.string().trim().min(1, "Please enter your child's student ID or login email"),
  studentPassword: z.string().min(1, "Please enter your child's password"),
});

router.post('/register', familyLimiter, (req, res, next) => {
  tx(res, next, async (client) => {
    const d = registerSchema.parse(req.body || {});
    const child = await verifyStudentLogin(client, d.studentLogin, d.studentPassword);

    const existing = await client.query(`SELECT id, role FROM users WHERE LOWER(email) = LOWER($1) FOR UPDATE`, [d.email]);
    if (existing.rows.length) {
      const e = existing.rows[0];
      if (e.role === 'parent') throw httpError(409, 'You already have a family login with this email — log in and use "Add a child"');
      if (e.id !== child.id) throw httpError(409, "This email is another student's login. Use a different email, or ask StemNest to set up your family.");
      /* The parent's email was this child's login — the child moves to their student ID */
      await family.convertChildToIdLogin(client, child.id);
    }

    const hash = await bcrypt.hash(d.password, 12);
    const p = await client.query(
      `INSERT INTO users (name, email, password_hash, role, phone, is_active)
       VALUES ($1, $2, $3, 'parent', $4, TRUE) RETURNING id`,
      [d.parentName, d.email, hash, d.phone || null]
    );
    await family.linkChild(client, { parentId: p.rows[0].id, studentId: child.id, via: 'parent' });
    logger.info(`[FAMILY] Self-registered family login ${d.email} with ${child.name} (${child.staff_id})`);
    return {
      success: true,
      childMovedToStudentId: existing.rows.length > 0,
      child: { name: child.name, staffId: child.staff_id },
    };
  }, 201);
});

/* ══════════════ Post-Sales ══════════════ */

/** Children who share a parent phone number and are not yet all on one family login. */
router.get('/suggestions', requireAuth, requireRole(...STAFF), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.whatsapp, u.staff_id AS "staffId",
              sp.parent_name AS "parentName", sp.parent_email AS "parentEmail",
              (SELECT pc.parent_id FROM parent_children pc WHERE pc.student_id = u.id LIMIT 1) AS "parentId"
       FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'student' AND u.is_active = TRUE`
    );
    const dismissed = new Set((await pool.query(`SELECT group_key FROM family_suggestions_dismissed`)).rows.map(x => x.group_key));

    const groups = {};
    for (const s of r.rows) {
      const key = family.phoneKey(s.phone) || family.phoneKey(s.whatsapp);
      if (!key) continue;
      (groups[key] = groups[key] || []).push(s);
    }
    const out = Object.entries(groups)
      .filter(([key, kids]) => kids.length > 1 && !dismissed.has(key))
      .filter(([, kids]) => !(kids[0].parentId && kids.every(k => k.parentId === kids[0].parentId)))
      .map(([key, kids]) => ({
        key,
        phone: kids[0].phone || kids[0].whatsapp,
        parentName: (kids.find(k => k.parentName) || {}).parentName || '',
        existingParentId: (kids.find(k => k.parentId) || {}).parentId || null,
        emails: [...new Set(kids.map(k => k.parentEmail).concat(kids.map(k => k.email))
                   .filter(e => e && !family.isAliasEmail(e)))],
        children: kids.map(k => ({ id: k.id, name: k.name, staffId: k.staffId, email: family.isAliasEmail(k.email) ? null : k.email, linked: !!k.parentId })),
      }))
      .sort((a, b) => b.children.length - a.children.length);
    res.json({ success: true, suggestions: out });
  } catch (err) { next(err); }
});

router.post('/suggestions/:key/dismiss', requireAuth, requireRole(...STAFF), async (req, res, next) => {
  try {
    await pool.query(
      `INSERT INTO family_suggestions_dismissed (group_key, dismissed_by) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [String(req.params.key).slice(0, 40), req.user.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/', requireAuth, requireRole(...STAFF), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT p.id, p.name, p.email, p.phone, p.created_at AS "createdAt", p.last_login_at AS "lastLoginAt",
              COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'staffId', u.staff_id)
                       ORDER BY u.name) FILTER (WHERE u.id IS NOT NULL), '[]') AS children
       FROM users p
       LEFT JOIN parent_children pc ON pc.parent_id = p.id
       LEFT JOIN users u ON u.id = pc.student_id
       WHERE p.role = 'parent'
       GROUP BY p.id ORDER BY p.created_at DESC`
    );
    res.json({ success: true, families: r.rows });
  } catch (err) { next(err); }
});

const createFamilySchema = z.object({
  parentName:  z.string().trim().min(2, "Please enter the parent's name"),
  parentEmail: z.string().trim().email('Please enter a valid parent email'),
  parentPhone: z.string().trim().optional().nullable(),
  studentIds:  z.array(z.string().uuid()).min(1, 'Choose at least one child'),
  sendEmail:   z.boolean().optional(),
});

/**
 * Create (or extend) a family login. If the parent email is currently one
 * of these children's logins, that child moves to their student ID.
 */
router.post('/', requireAuth, requireRole(...STAFF), (req, res, next) => {
  let emailJob = null;
  tx(res, next, async (client) => {
    const d = createFamilySchema.parse(req.body || {});
    const ids = [...new Set(d.studentIds)];

    const kids = (await client.query(
      `SELECT id, name, email, staff_id FROM users WHERE id = ANY($1::uuid[]) AND role = 'student'`, [ids])).rows;
    if (kids.length !== ids.length) throw httpError(404, 'One or more children were not found');

    let parentId, password = null, created = false;
    const movedToId = [];
    const existing = (await client.query(
      `SELECT id, role, name FROM users WHERE LOWER(email) = LOWER($1) FOR UPDATE`, [d.parentEmail])).rows[0];

    if (existing && existing.role === 'parent') {
      parentId = existing.id;                 // add the children to the existing family
    } else {
      if (existing) {
        const kid = kids.find(k => k.id === existing.id);
        if (!kid) throw httpError(409, `${d.parentEmail} is the login of ${existing.name}, who is not in this family. Use another email or include them.`);
        await family.convertChildToIdLogin(client, kid.id);
        movedToId.push({ name: kid.name, staffId: kid.staff_id });
      }
      password = family.tempPassword();
      const p = await client.query(
        `INSERT INTO users (name, email, password_hash, role, phone, is_active, timezone)
         VALUES ($1, $2, $3, 'parent', $4, TRUE, (SELECT timezone FROM users WHERE id = $5))
         RETURNING id`,
        [d.parentName, d.parentEmail, await bcrypt.hash(password, 12), d.parentPhone || null, ids[0]]
      );
      parentId = p.rows[0].id;
      created = true;
    }

    for (const k of kids) {
      await family.linkChild(client, { parentId, studentId: k.id, byUserId: req.user.id, via: 'postsales' });
    }
    const children = await family.childrenOf(client, parentId);
    if (d.sendEmail !== false) {
      emailJob = () => family.sendFamilyLoginEmail({ to: d.parentEmail, parentName: d.parentName, password, children });
    }
    logger.info(`[FAMILY] ${created ? 'Created' : 'Extended'} family ${d.parentEmail} (${children.length} children) by ${req.user.email}`);
    return { success: true, parentId, created, children, movedToStudentId: movedToId, tempPassword: password };
  }, 201);
  /* email after the response is sent (and only if the transaction committed) */
  res.on('finish', () => {
    if (emailJob && res.statusCode < 300) emailJob().catch(e => logger.warn('[FAMILY] Login email failed: ' + e.message));
  });
});

router.post('/:parentId/children', requireAuth, requireRole(...STAFF), (req, res, next) => {
  tx(res, next, async (client) => {
    await family.linkChild(client, { parentId: req.params.parentId, studentId: req.body && req.body.studentId, byUserId: req.user.id });
    return { success: true, children: await family.childrenOf(client, req.params.parentId) };
  });
});

router.delete('/:parentId/children/:studentId', requireAuth, requireRole(...STAFF), async (req, res, next) => {
  try {
    const r = await pool.query(
      `DELETE FROM parent_children WHERE parent_id = $1 AND student_id = $2 RETURNING id`,
      [req.params.parentId, req.params.studentId]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Not linked' });
    logger.info(`[FAMILY] Unlinked ${req.params.studentId} from ${req.params.parentId} by ${req.user.email}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
