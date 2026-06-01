/**
 * StemNest Academy — Career Pathways API
 *
 * PUBLIC (no auth):
 *   GET  /api/pathways/public          — list active pathways for courses page
 *
 * ADMIN only:
 *   GET    /api/pathways               — list all pathways
 *   POST   /api/pathways               — create pathway
 *   PUT    /api/pathways/:id           — update pathway
 *   DELETE /api/pathways/:id           — delete pathway
 *
 *   GET    /api/pathways/:id/grades              — list grades
 *   POST   /api/pathways/:id/grades              — create grade
 *   PUT    /api/pathways/:id/grades/:gradeId      — update grade
 *   DELETE /api/pathways/:id/grades/:gradeId      — delete grade
 *
 *   GET    /api/pathways/:id/grades/:gradeId/units              — list units
 *   POST   /api/pathways/:id/grades/:gradeId/units              — create unit
 *   PUT    /api/pathways/:id/grades/:gradeId/units/:unitId       — update unit
 *   DELETE /api/pathways/:id/grades/:gradeId/units/:unitId       — delete unit
 *
 *   GET    /api/pathways/:id/grades/:gradeId/units/:unitId/lessons     — list lessons
 *   POST   /api/pathways/:id/grades/:gradeId/units/:unitId/lessons     — create lesson
 *   PUT    /api/pathways/:id/grades/:gradeId/units/:unitId/lessons/:lid — update lesson
 *   DELETE /api/pathways/:id/grades/:gradeId/units/:unitId/lessons/:lid — delete lesson
 *
 *   GET    /api/pathways/:id/grades/:gradeId/units/:unitId/quiz         — get quiz
 *   POST   /api/pathways/:id/grades/:gradeId/units/:unitId/quiz         — create/replace quiz
 *   PUT    /api/pathways/:id/grades/:gradeId/units/:unitId/quiz         — update quiz
 *   DELETE /api/pathways/:id/grades/:gradeId/units/:unitId/quiz         — delete quiz
 *
 *   GET    /api/pathways/:id/grades/:gradeId/lessons  — all lessons for a grade (flat list)
 *
 * POSTSALES:
 *   GET  /api/pathways/for-onboarding  — pathways + grades for onboarding selector
 */

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];
const STAFF_ROLES = ['admin', 'super_admin', 'postsales', 'presales'];

/* ══════════════════════════════════════════════
   PUBLIC — no auth required
══════════════════════════════════════════════ */

/* GET /api/pathways/public */
router.get('/public', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, slug, name, tagline, intro, description,
              what_you_learn, career_outcomes, graduation_outcome,
              emoji, color, price, sort_order
       FROM pathways
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, name ASC`
    );
    res.json({ success: true, pathways: result.rows });
  } catch (err) { next(err); }
});

/* GET /api/pathways/for-onboarding — postsales/admin */
router.get('/for-onboarding', requireAuth, requireRole(...STAFF_ROLES), async (req, res, next) => {
  try {
    const pathways = await pool.query(
      `SELECT id, name, slug, price FROM pathways WHERE is_active = TRUE ORDER BY name ASC`
    );
    const grades = await pool.query(
      `SELECT pg.id, pg.pathway_id, pg.grade_number, pg.name,
              COUNT(pl.id) AS lesson_count
       FROM pathway_grades pg
       LEFT JOIN pathway_lessons pl ON pl.grade_id = pg.id
       WHERE pg.is_active = TRUE
       GROUP BY pg.id
       ORDER BY pg.pathway_id, pg.grade_number ASC`
    );
    res.json({ success: true, pathways: pathways.rows, grades: grades.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   PATHWAYS CRUD
══════════════════════════════════════════════ */

/* GET /api/pathways */
router.get('/', requireAuth, requireRole(...STAFF_ROLES), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.*,
              COUNT(DISTINCT pg.id) AS grade_count
       FROM pathways p
       LEFT JOIN pathway_grades pg ON pg.pathway_id = p.id
       GROUP BY p.id
       ORDER BY p.sort_order ASC, p.name ASC`
    );
    res.json({ success: true, pathways: result.rows });
  } catch (err) { next(err); }
});

/* POST /api/pathways */
router.post('/', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      name, tagline, intro, description, what_you_learn, career_outcomes,
      graduation_outcome, emoji, color, price, sort_order, slug
    } = req.body;

    if (!name) return res.status(400).json({ success: false, error: 'name required' });

    const autoSlug = (slug || name).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const result = await pool.query(
      `INSERT INTO pathways
         (slug, name, tagline, intro, description, what_you_learn, career_outcomes,
          graduation_outcome, emoji, color, price, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [autoSlug, name, tagline||null, intro||null, description||null,
       what_you_learn||[], career_outcomes||[],
       graduation_outcome||null, emoji||'🚀', color||'blue',
       parseFloat(price)||80.00, parseInt(sort_order)||0]
    );

    logger.info(`[PATHWAY] Created: ${name}`);
    res.status(201).json({ success: true, pathway: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'A pathway with this name already exists' });
    next(err);
  }
});

/* PUT /api/pathways/:id */
router.put('/:id', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      name, tagline, intro, description, what_you_learn, career_outcomes,
      graduation_outcome, emoji, color, price, sort_order, is_active
    } = req.body;

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined)               { fields.push(`name = $${i++}`);               values.push(name); }
    if (tagline !== undefined)            { fields.push(`tagline = $${i++}`);             values.push(tagline); }
    if (intro !== undefined)              { fields.push(`intro = $${i++}`);               values.push(intro); }
    if (description !== undefined)        { fields.push(`description = $${i++}`);         values.push(description); }
    if (what_you_learn !== undefined)     { fields.push(`what_you_learn = $${i++}`);      values.push(what_you_learn); }
    if (career_outcomes !== undefined)    { fields.push(`career_outcomes = $${i++}`);     values.push(career_outcomes); }
    if (graduation_outcome !== undefined) { fields.push(`graduation_outcome = $${i++}`);  values.push(graduation_outcome); }
    if (emoji !== undefined)              { fields.push(`emoji = $${i++}`);               values.push(emoji); }
    if (color !== undefined)              { fields.push(`color = $${i++}`);               values.push(color); }
    if (price !== undefined)              { fields.push(`price = $${i++}`);               values.push(parseFloat(price)); }
    if (sort_order !== undefined)         { fields.push(`sort_order = $${i++}`);          values.push(parseInt(sort_order)); }
    if (is_active !== undefined)          { fields.push(`is_active = $${i++}`);           values.push(is_active); }

    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE pathways SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values
    );

    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Pathway not found' });
    res.json({ success: true, pathway: result.rows[0] });
  } catch (err) { next(err); }
});

/* DELETE /api/pathways/:id */
router.delete('/:id', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM pathways WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   GRADES CRUD
══════════════════════════════════════════════ */

/* GET /api/pathways/:id/grades */
router.get('/:id/grades', requireAuth, requireRole(...STAFF_ROLES), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT pg.*,
              COUNT(DISTINCT pu.id) AS unit_count,
              COUNT(DISTINCT pl.id) AS lesson_count
       FROM pathway_grades pg
       LEFT JOIN pathway_units pu ON pu.grade_id = pg.id
       LEFT JOIN pathway_lessons pl ON pl.grade_id = pg.id
       WHERE pg.pathway_id = $1
       GROUP BY pg.id
       ORDER BY pg.grade_number ASC`,
      [req.params.id]
    );
    res.json({ success: true, grades: result.rows });
  } catch (err) { next(err); }
});

/* POST /api/pathways/:id/grades */
router.post('/:id/grades', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { grade_number, name, description } = req.body;
    if (!grade_number) return res.status(400).json({ success: false, error: 'grade_number required' });

    const result = await pool.query(
      `INSERT INTO pathway_grades (pathway_id, grade_number, name, description)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, parseInt(grade_number), name||`Grade ${grade_number}`, description||null]
    );
    res.status(201).json({ success: true, grade: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'Grade already exists for this pathway' });
    next(err);
  }
});

/* PUT /api/pathways/:id/grades/:gradeId */
router.put('/:id/grades/:gradeId', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, description, is_active } = req.body;
    const fields = []; const values = []; let i = 1;
    if (name !== undefined)      { fields.push(`name = $${i++}`);      values.push(name); }
    if (description !== undefined){ fields.push(`description = $${i++}`); values.push(description); }
    if (is_active !== undefined)  { fields.push(`is_active = $${i++}`);  values.push(is_active); }
    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });
    values.push(req.params.gradeId);
    const result = await pool.query(
      `UPDATE pathway_grades SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Grade not found' });
    res.json({ success: true, grade: result.rows[0] });
  } catch (err) { next(err); }
});

/* DELETE /api/pathways/:id/grades/:gradeId */
router.delete('/:id/grades/:gradeId', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM pathway_grades WHERE id = $1', [req.params.gradeId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   UNITS CRUD
══════════════════════════════════════════════ */

/* GET /api/pathways/:id/grades/:gradeId/units */
router.get('/:id/grades/:gradeId/units', requireAuth, requireRole(...STAFF_ROLES), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT pu.*,
              COUNT(DISTINCT pl.id) AS lesson_count,
              pq.id AS quiz_id, pq.title AS quiz_title
       FROM pathway_units pu
       LEFT JOIN pathway_lessons pl ON pl.unit_id = pu.id
       LEFT JOIN pathway_quizzes pq ON pq.unit_id = pu.id
       WHERE pu.grade_id = $1
       GROUP BY pu.id, pq.id, pq.title
       ORDER BY pu.unit_number ASC`,
      [req.params.gradeId]
    );
    res.json({ success: true, units: result.rows });
  } catch (err) { next(err); }
});

/* POST /api/pathways/:id/grades/:gradeId/units */
router.post('/:id/grades/:gradeId/units', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { unit_number, name, description } = req.body;
    if (!unit_number) return res.status(400).json({ success: false, error: 'unit_number required' });
    const result = await pool.query(
      `INSERT INTO pathway_units (grade_id, unit_number, name, description)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.gradeId, parseInt(unit_number), name||`Unit ${unit_number}`, description||null]
    );
    res.status(201).json({ success: true, unit: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'Unit already exists for this grade' });
    next(err);
  }
});

/* PUT /api/pathways/:id/grades/:gradeId/units/:unitId */
router.put('/:id/grades/:gradeId/units/:unitId', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, description, is_active } = req.body;
    const fields = []; const values = []; let i = 1;
    if (name !== undefined)       { fields.push(`name = $${i++}`);       values.push(name); }
    if (description !== undefined){ fields.push(`description = $${i++}`); values.push(description); }
    if (is_active !== undefined)  { fields.push(`is_active = $${i++}`);  values.push(is_active); }
    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });
    values.push(req.params.unitId);
    const result = await pool.query(
      `UPDATE pathway_units SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Unit not found' });
    res.json({ success: true, unit: result.rows[0] });
  } catch (err) { next(err); }
});

/* DELETE /api/pathways/:id/grades/:gradeId/units/:unitId */
router.delete('/:id/grades/:gradeId/units/:unitId', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM pathway_units WHERE id = $1', [req.params.unitId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   LESSONS CRUD
══════════════════════════════════════════════ */

/* GET /api/pathways/:id/grades/:gradeId/units/:unitId/lessons */
router.get('/:id/grades/:gradeId/units/:unitId/lessons', requireAuth, requireRole(...STAFF_ROLES), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM pathway_lessons WHERE unit_id = $1 ORDER BY lesson_number_in_unit ASC`,
      [req.params.unitId]
    );
    res.json({ success: true, lessons: result.rows });
  } catch (err) { next(err); }
});

/* GET /api/pathways/:id/grades/:gradeId/lessons — all lessons for a grade (flat) */
router.get('/:id/grades/:gradeId/lessons', requireAuth, requireRole(...STAFF_ROLES), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT pl.*, pu.unit_number, pu.name AS unit_name
       FROM pathway_lessons pl
       LEFT JOIN pathway_units pu ON pu.id = pl.unit_id
       WHERE pl.grade_id = $1
       ORDER BY pl.lesson_number ASC`,
      [req.params.gradeId]
    );
    res.json({ success: true, lessons: result.rows });
  } catch (err) { next(err); }
});

/* POST /api/pathways/:id/grades/:gradeId/units/:unitId/lessons */
router.post('/:id/grades/:gradeId/units/:unitId/lessons', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      lesson_number, lesson_number_in_unit, session_type, title,
      learning_objectives, warm_up, project_briefing, concept_discovery,
      task1_description, task1_link, task2_description, task2_link,
      debrief, homework1, homework2, what_comes_next, teacher_notes
    } = req.body;

    if (!title) return res.status(400).json({ success: false, error: 'title required' });
    if (!lesson_number) return res.status(400).json({ success: false, error: 'lesson_number required' });

    const result = await pool.query(
      `INSERT INTO pathway_lessons
         (unit_id, grade_id, lesson_number, lesson_number_in_unit, session_type, title,
          learning_objectives, warm_up, project_briefing, concept_discovery,
          task1_description, task1_link, task2_description, task2_link,
          debrief, homework1, homework2, what_comes_next, teacher_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [req.params.unitId, req.params.gradeId,
       parseInt(lesson_number), lesson_number_in_unit ? parseInt(lesson_number_in_unit) : null,
       session_type||'lesson', title,
       learning_objectives||null, warm_up||null, project_briefing||null, concept_discovery||null,
       task1_description||null, task1_link||null, task2_description||null, task2_link||null,
       debrief||null, homework1||null, homework2||null, what_comes_next||null, teacher_notes||null]
    );
    res.status(201).json({ success: true, lesson: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'Lesson number already exists for this grade' });
    next(err);
  }
});

/* PUT /api/pathways/:id/grades/:gradeId/units/:unitId/lessons/:lessonId */
router.put('/:id/grades/:gradeId/units/:unitId/lessons/:lessonId', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const fields = []; const values = []; let i = 1;
    const updatable = [
      'title','learning_objectives','warm_up','project_briefing','concept_discovery',
      'task1_description','task1_link','task2_description','task2_link',
      'debrief','homework1','homework2','what_comes_next','teacher_notes',
      'session_type','lesson_number','lesson_number_in_unit','is_active'
    ];
    updatable.forEach(key => {
      if (req.body[key] !== undefined) { fields.push(`${key} = $${i++}`); values.push(req.body[key]); }
    });
    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });
    values.push(req.params.lessonId);
    const result = await pool.query(
      `UPDATE pathway_lessons SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, values
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Lesson not found' });
    res.json({ success: true, lesson: result.rows[0] });
  } catch (err) { next(err); }
});

/* DELETE /api/pathways/:id/grades/:gradeId/units/:unitId/lessons/:lessonId */
router.delete('/:id/grades/:gradeId/units/:unitId/lessons/:lessonId', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM pathway_lessons WHERE id = $1', [req.params.lessonId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════
   QUIZ CRUD
══════════════════════════════════════════════ */

/* GET /api/pathways/:id/grades/:gradeId/units/:unitId/quiz */
router.get('/:id/grades/:gradeId/units/:unitId/quiz', requireAuth, requireRole(...STAFF_ROLES), async (req, res, next) => {
  try {
    const quiz = await pool.query(
      `SELECT pq.*, json_agg(pqq.* ORDER BY pqq.question_number) AS questions
       FROM pathway_quizzes pq
       LEFT JOIN pathway_quiz_questions pqq ON pqq.quiz_id = pq.id
       WHERE pq.unit_id = $1
       GROUP BY pq.id`,
      [req.params.unitId]
    );
    if (!quiz.rows.length) return res.json({ success: true, quiz: null });
    res.json({ success: true, quiz: quiz.rows[0] });
  } catch (err) { next(err); }
});

/* POST /api/pathways/:id/grades/:gradeId/units/:unitId/quiz */
router.post('/:id/grades/:gradeId/units/:unitId/quiz', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { title, description, questions } = req.body;

    /* Upsert quiz */
    const existing = await pool.query('SELECT id FROM pathway_quizzes WHERE unit_id = $1', [req.params.unitId]);
    let quizId;

    if (existing.rows.length) {
      quizId = existing.rows[0].id;
      await pool.query(
        `UPDATE pathway_quizzes SET title = $1, description = $2 WHERE id = $3`,
        [title||null, description||null, quizId]
      );
      await pool.query('DELETE FROM pathway_quiz_questions WHERE quiz_id = $1', [quizId]);
    } else {
      const result = await pool.query(
        `INSERT INTO pathway_quizzes (unit_id, title, description) VALUES ($1,$2,$3) RETURNING id`,
        [req.params.unitId, title||null, description||null]
      );
      quizId = result.rows[0].id;
    }

    /* Insert questions */
    if (questions && questions.length) {
      for (const q of questions) {
        await pool.query(
          `INSERT INTO pathway_quiz_questions
             (quiz_id, question_number, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [quizId, q.question_number, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
           q.correct_answer, q.explanation||null]
        );
      }
    }

    res.status(201).json({ success: true, quizId });
  } catch (err) { next(err); }
});

/* DELETE /api/pathways/:id/grades/:gradeId/units/:unitId/quiz */
router.delete('/:id/grades/:gradeId/units/:unitId/quiz', requireAuth, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM pathway_quizzes WHERE unit_id = $1', [req.params.unitId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
