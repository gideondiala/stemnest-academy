/**
 * Family logins.
 *
 * A parent account (role 'parent') is linked to one or more student
 * accounts through parent_children. The parent logs in with their real
 * email and switches between children; each child can also log in on
 * their own with their student ID (S-0012) and password.
 *
 * A child whose login email moves to the parent account gets a
 * placeholder address on a reserved, undeliverable domain — emails are
 * never sent there (see emailService.sendEmail); they go to the parent.
 */

const CHILD_LOGIN_DOMAIN = 'login.stemnest.invalid';

function aliasEmailFor(staffId) {
  return `${String(staffId || 'student').toLowerCase()}@${CHILD_LOGIN_DOMAIN}`;
}

function isAliasEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@' + CHILD_LOGIN_DOMAIN);
}

/** Normalise a phone number to its last 9 digits — the same with or without country code or leading 0. */
function phoneKey(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-9) : null;
}

/**
 * Link a child to a parent and point the child's emails at the parent.
 * Idempotent.
 */
async function linkChild(client, { parentId, studentId, byUserId = null, via = 'postsales' }) {
  const p = await client.query(`SELECT id, name, email FROM users WHERE id = $1 AND role = 'parent'`, [parentId]);
  if (!p.rows.length) throw Object.assign(new Error('Parent account not found'), { status: 404 });
  const s = await client.query(`SELECT id, name FROM users WHERE id = $1 AND role = 'student'`, [studentId]);
  if (!s.rows.length) throw Object.assign(new Error('Student not found'), { status: 404 });

  await client.query(
    `INSERT INTO parent_children (parent_id, student_id, linked_by, linked_via)
     VALUES ($1, $2, $3, $4) ON CONFLICT (parent_id, student_id) DO NOTHING`,
    [parentId, studentId, byUserId, via]
  );
  await client.query(
    `INSERT INTO student_profiles (user_id, parent_email, parent_name) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET parent_email = $2,
       parent_name = COALESCE(NULLIF(student_profiles.parent_name, ''), $3)`,
    [studentId, p.rows[0].email, p.rows[0].name]
  );
  return { parent: p.rows[0], student: s.rows[0] };
}

/**
 * Move a child off an email login so the address can belong to the parent.
 * The child keeps their password and logs in with their student ID.
 */
async function convertChildToIdLogin(client, studentId) {
  const r = await client.query(`SELECT staff_id, email FROM users WHERE id = $1 AND role = 'student' FOR UPDATE`, [studentId]);
  if (!r.rows.length) throw Object.assign(new Error('Student not found'), { status: 404 });
  if (!r.rows[0].staff_id) throw Object.assign(new Error('Student has no student ID'), { status: 400 });
  if (isAliasEmail(r.rows[0].email)) return r.rows[0].email;
  const alias = aliasEmailFor(r.rows[0].staff_id);
  await client.query(`UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2`, [alias, studentId]);
  return alias;
}

/** Children of a parent, with what the switcher needs. */
async function childrenOf(db, parentId) {
  const r = await db.query(
    `SELECT u.id, u.name, u.staff_id AS "staffId", sp.credits,
            COALESCE(sp.class_paused, FALSE) AS paused, sp.pause_kind AS "pauseKind"
     FROM parent_children pc
     JOIN users u ON u.id = pc.student_id AND u.is_active = TRUE
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE pc.parent_id = $1
     ORDER BY u.name`,
    [parentId]
  );
  return r.rows;
}

const crypto = require('crypto');

function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'SN' + Array.from(crypto.randomBytes(8), b => chars[b % chars.length]).join('');
}

async function sendFamilyLoginEmail({ to, parentName, password, children }) {
  const emailSvc = require('../services/emailService');
  const appUrl = process.env.APP_URL || 'https://stemnestacademy.co.uk';
  const list = children.map(c => `<li><strong>${c.name}</strong> — student ID ${c.staff_id || c.staffId || ''}</li>`).join('');
  await emailSvc.sendEmail({
    to,
    subject: '👨‍👩‍👧 Your StemNest family login',
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;line-height:1.6;color:#1a202c;">
      <h2 style="color:#1a56db;">Your family login is ready</h2>
      <p>Hi ${parentName || 'there'},</p>
      <p>You can now see all your children's classes, credits and progress from one login.</p>
      <div style="background:#f0f4ff;border-left:4px solid #1a56db;border-radius:10px;padding:16px 20px;margin:16px 0;font-family:monospace;">
        <strong>Email:</strong> ${to}<br>
        ${password ? `<strong>Temporary password:</strong> ${password}<br>` : ''}
      </div>
      <p>Children on this login:</p><ul>${list}</ul>
      <p>Each child can still log in on their own computer with their <strong>student ID</strong> and their usual password.</p>
      <a href="${appUrl}/pages/login.html" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 28px;border-radius:50px;font-weight:700;">Log in →</a>
      ${password ? '<p style="font-size:13px;color:#718096;">Please change your password after logging in.</p>' : ''}
    </div>`,
    template: 'family_login',
  });
}


module.exports = {
  tempPassword, sendFamilyLoginEmail,
  CHILD_LOGIN_DOMAIN, aliasEmailFor, isAliasEmail, phoneKey,
  linkChild, convertChildToIdLogin, childrenOf,
};
