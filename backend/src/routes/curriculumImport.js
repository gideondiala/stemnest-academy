/**
 * Curriculum import (admin) — one grade per request:
 *   POST /api/curriculum-import/preview  { pathway: slug, grade: n, units: {u: name}, lessons: [...] }
 *   POST /api/curriculum-import/apply    (same body)
 *
 * "Fill gaps" rules:
 *  - a lesson that does not exist yet (grade + lesson number) is created with everything;
 *  - an existing lesson only gets the fields that are EMPTY on the platform today;
 *  - lessons marked override (the revamped AI & Automation Grade 4) replace existing content;
 *  - units are created when missing, and named when their name is empty.
 * The grade's total_lessons is updated to its number of active lessons.
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'super_admin'));

const FIELDS = ['learning_objectives', 'warm_up', 'project_briefing', 'concept_discovery', 'task1_description', 'task1_link',
                'task2_description', 'task2_link', 'debrief', 'homework1', 'homework2', 'portfolio_save', 'what_comes_next', 'teacher_notes'];
const MAXLEN = 60000;

function str(v) { return typeof v === 'string' ? v.slice(0, MAXLEN) : null; }
function empty(v) { return v === null || v === undefined || String(v).trim() === ''; }

async function run(client, body, apply) {
  const slug = String(body.pathway || '');
  const gradeNo = parseInt(body.grade, 10);
  const lessons = Array.isArray(body.lessons) ? body.lessons : [];
  const units = body.units && typeof body.units === 'object' ? body.units : {};
  const out = { pathway: slug, grade: gradeNo, unitsCreated: 0, unitsNamed: 0, lessonsCreated: 0, lessonsUpdated: 0,
                fieldsFilled: 0, lessonsReplaced: 0, unchanged: 0, skipped: null };

  const g = (await client.query(
    `SELECT g.id, p.name FROM pathway_grades g JOIN pathways p ON p.id = g.pathway_id WHERE p.slug = $1 AND g.grade_number = $2`,
    [slug, gradeNo])).rows[0];
  if (!g) { out.skipped = `No ${slug} Grade ${gradeNo} on the platform`; return out; }
  out.pathwayName = g.name;

  /* Units */
  const unitIds = {};
  for (const r of (await client.query(`SELECT id, unit_number, name FROM pathway_units WHERE grade_id = $1`, [g.id])).rows) {
    unitIds[r.unit_number] = { id: r.id, name: r.name };
  }
  for (const [uKey, uName] of Object.entries(units)) {
    const u = parseInt(uKey, 10);
    if (!(u >= 1)) continue;
    if (!unitIds[u]) {
      out.unitsCreated++;
      if (apply) {
        const r = await client.query(
          `INSERT INTO pathway_units (grade_id, unit_number, name, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id`,
          [g.id, u, String(uName || `Unit ${u}`).slice(0, 200)]);
        unitIds[u] = { id: r.rows[0].id, name: uName };
      } else unitIds[u] = { id: null, name: uName };
    } else if (empty(unitIds[u].name) && !empty(uName)) {
      out.unitsNamed++;
      if (apply) await client.query(`UPDATE pathway_units SET name = $1 WHERE id = $2`, [String(uName).slice(0, 200), unitIds[u].id]);
    }
  }

  /* Lessons */
  const existing = {};
  for (const r of (await client.query(`SELECT * FROM pathway_lessons WHERE grade_id = $1`, [g.id])).rows) existing[r.lesson_number] = r;
  const firstInUnit = {};
  for (const L of lessons) {
    if (L.unit && (!firstInUnit[L.unit] || L.number < firstInUnit[L.unit])) firstInUnit[L.unit] = L.number;
  }

  for (const L of lessons) {
    const n = parseInt(L.number, 10);
    if (!(n >= 1)) continue;
    const unit = L.unit && unitIds[L.unit] ? unitIds[L.unit] : null;
    const cur = existing[n];
    if (!cur) {
      out.lessonsCreated++;
      if (apply) {
        const cols = ['grade_id', 'unit_id', 'lesson_number', 'lesson_number_in_unit', 'title', 'is_active'];
        const vals = [g.id, unit ? unit.id : null, n, L.unit && firstInUnit[L.unit] ? n - firstInUnit[L.unit] + 1 : null,
                      String(L.title || `Lesson ${n}`).slice(0, 250), true];
        for (const f of FIELDS) if (!empty(L[f])) { cols.push(f); vals.push(str(L[f])); }
        await client.query(
          `INSERT INTO pathway_lessons (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
      }
      continue;
    }
    const sets = [], vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    let filled = 0;
    for (const f of FIELDS) {
      if (empty(L[f])) continue;
      if (L.override ? String(cur[f] || '') !== String(L[f]) : empty(cur[f])) { set(f, str(L[f])); filled++; }
    }
    if ((empty(cur.title) || L.override) && !empty(L.title) && cur.title !== L.title) set('title', String(L.title).slice(0, 250));
    if (!cur.unit_id && unit && unit.id) set('unit_id', unit.id);
    if (!sets.length) { out.unchanged++; continue; }
    out.lessonsUpdated++; out.fieldsFilled += filled;
    if (L.override) out.lessonsReplaced++;
    if (apply) {
      vals.push(cur.id);
      await client.query(`UPDATE pathway_lessons SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
    }
  }

  if (apply) {
    await client.query(
      `UPDATE pathway_grades SET total_lessons = (SELECT COUNT(*) FROM pathway_lessons WHERE grade_id = $1 AND is_active = TRUE)
       WHERE id = $1`, [g.id]);
  }
  return out;
}

async function handler(req, res, next, apply) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await run(client, req.body || {}, apply);
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    if (apply && !out.skipped) logger.info(`[CURRICULUM] ${out.pathway} G${out.grade}: +${out.lessonsCreated} lessons, ${out.lessonsUpdated} updated (${out.fieldsFilled} fields, ${out.lessonsReplaced} replaced), +${out.unitsCreated} units — by ${req.user.email}`);
    res.json({ success: true, ...out });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

router.post('/preview', (req, res, next) => handler(req, res, next, false));
router.post('/apply',   (req, res, next) => handler(req, res, next, true));

module.exports = router;
