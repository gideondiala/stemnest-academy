/**
 * StemNest Academy — Quiz Routes
 *
 * POST /api/quizzes/upload         — admin uploads JSON quiz file
 * GET  /api/quizzes/:id            — get a quiz (questions without correct answers for students)
 * GET  /api/quizzes/unit/:pathwayId/:grade/:unit — get quiz by unit
 * POST /api/quizzes/:id/attempt    — student submits answers
 * GET  /api/quizzes/my-attempts    — student gets their own attempt history
 * GET  /api/quizzes                — admin lists all quizzes
 * DELETE /api/quizzes/:id          — admin deletes a quiz
 */

const express = require('express');
const { z }   = require('zod');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();

/* ══════════════════════════════════════════════════════
   POST /api/quizzes/upload
   Admin uploads a parsed JSON quiz (as request body).
   Frontend reads the .json file and sends the object.
══════════════════════════════════════════════════════ */
router.post('/upload', requireAuth, requireRole('admin','super_admin'), async (req, res, next) => {
  try {
    const { pathway_id, grade_number, unit_number, unit_name, pass_score, questions } = req.body;

    if (!pathway_id)   return res.status(400).json({ success: false, error: 'pathway_id required' });
    if (!grade_number) return res.status(400).json({ success: false, error: 'grade_number required' });
    if (!unit_number)  return res.status(400).json({ success: false, error: 'unit_number required' });
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: 'questions array required' });
    }

    /* Validate each question has required fields */
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.q || !q.q.trim()) {
        return res.status(400).json({ success: false, error: `Question ${i + 1} missing "q" (question text)` });
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return res.status(400).json({ success: false, error: `Question ${i + 1} must have exactly 4 options` });
      }
      if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) {
        return res.status(400).json({ success: false, error: `Question ${i + 1} "answer" must be 0–3` });
      }
    }

    /* Upsert quiz — replace if already exists for this pathway/grade/unit */
    const result = await pool.query(
      `INSERT INTO unit_quizzes
         (pathway_id, grade_number, unit_number, unit_name, total_questions, questions, pass_score, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (pathway_id, grade_number, unit_number)
       DO UPDATE SET
         unit_name       = EXCLUDED.unit_name,
         total_questions = EXCLUDED.total_questions,
         questions       = EXCLUDED.questions,
         pass_score      = EXCLUDED.pass_score,
         updated_at      = NOW()
       RETURNING id, pathway_id, grade_number, unit_number, unit_name, total_questions, pass_score`,
      [pathway_id, grade_number, unit_number, unit_name || null,
       questions.length, JSON.stringify(questions),
       pass_score || 70, req.user.id]
    );

    logger.info(`[QUIZ] Uploaded ${questions.length} questions for pathway=${pathway_id} grade=${grade_number} unit=${unit_number} by ${req.user.email}`);
    res.json({ success: true, quiz: result.rows[0] });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   GET /api/quizzes
   Admin: list all quizzes
══════════════════════════════════════════════════════ */
router.get('/', requireAuth, requireRole('admin','super_admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT uq.id, uq.grade_number, uq.unit_number, uq.unit_name,
              uq.total_questions, uq.pass_score, uq.created_at,
              p.name AS pathway_name
       FROM unit_quizzes uq
       LEFT JOIN pathways p ON p.id = uq.pathway_id
       ORDER BY p.name, uq.grade_number, uq.unit_number`
    );
    res.json({ success: true, quizzes: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   GET /api/quizzes/my-attempts
   Student gets their own quiz attempt history
══════════════════════════════════════════════════════ */
router.get('/my-attempts', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT qa.id, qa.score, qa.total, qa.percentage, qa.passed,
              qa.submitted_at, uq.unit_name, uq.grade_number, uq.unit_number,
              p.name AS pathway_name
       FROM quiz_attempts qa
       JOIN unit_quizzes uq ON uq.id = qa.quiz_id
       LEFT JOIN pathways p ON p.id = uq.pathway_id
       WHERE qa.student_id = $1
       ORDER BY qa.submitted_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, attempts: result.rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   GET /api/quizzes/unit/:pathwayId/:grade/:unit
   Get quiz by pathway/grade/unit — used when student
   navigates to a unit quiz. Returns questions WITHOUT
   correct answers.
══════════════════════════════════════════════════════ */
router.get('/unit/:pathwayId/:grade/:unit', requireAuth, async (req, res, next) => {
  try {
    const { pathwayId, grade, unit } = req.params;
    const result = await pool.query(
      `SELECT uq.id, uq.unit_name, uq.total_questions, uq.pass_score,
              uq.grade_number, uq.unit_number, uq.questions, uq.pathway_id
       FROM unit_quizzes uq
       WHERE uq.pathway_id = $1 AND uq.grade_number = $2 AND uq.unit_number = $3`,
      [pathwayId, grade, unit]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'No quiz found for this unit' });
    }

    const quiz = result.rows[0];

    /* Check if student already attempted this quiz */
    let existingAttempt = null;
    if (req.user.role === 'student') {
      const att = await pool.query(
        'SELECT id, score, total, percentage, passed, submitted_at FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2',
        [quiz.id, req.user.id]
      );
      existingAttempt = att.rows[0] || null;
    }

    /* Strip correct answers from questions before sending to student */
    const questionsForStudent = (quiz.questions || []).map((q, idx) => ({
      idx,
      q:       q.q,
      options: q.options,
      /* Do NOT include q.answer */
    }));

    res.json({
      success: true,
      quiz: {
        id:               quiz.id,
        unit_name:        quiz.unit_name,
        total_questions:  quiz.total_questions,
        pass_score:       quiz.pass_score,
        grade_number:     quiz.grade_number,
        unit_number:      quiz.unit_number,
        questions:        questionsForStudent,
        already_attempted: !!existingAttempt,
        previous_attempt: existingAttempt,
      }
    });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   GET /api/quizzes/:id
   Get a specific quiz by ID (answers stripped for students)
══════════════════════════════════════════════════════ */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT uq.*, p.name AS pathway_name FROM unit_quizzes uq
       LEFT JOIN pathways p ON p.id = uq.pathway_id
       WHERE uq.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Quiz not found' });
    }

    const quiz = result.rows[0];
    const isAdmin = ['admin','super_admin'].includes(req.user.role);

    /* Admin sees full questions including answers; students do not */
    const questions = isAdmin
      ? quiz.questions
      : (quiz.questions || []).map((q, idx) => ({ idx, q: q.q, options: q.options }));

    res.json({ success: true, quiz: { ...quiz, questions } });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   POST /api/quizzes/:id/attempt
   Student submits their answers. Auto-graded instantly.
   answers = [0, 2, 1, 3, ...] — one index per question
══════════════════════════════════════════════════════ */
router.post('/:id/attempt', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { answers } = req.body; // array of selected option indices

    if (!Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: 'answers must be an array' });
    }

    /* Fetch quiz with correct answers */
    const quizResult = await pool.query(
      'SELECT * FROM unit_quizzes WHERE id = $1',
      [req.params.id]
    );
    if (!quizResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Quiz not found' });
    }
    const quiz = quizResult.rows[0];
    const questions = quiz.questions || [];

    /* Grade it */
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.answer) correct++;
    });

    const total      = questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100 * 100) / 100 : 0;
    const passed     = percentage >= (quiz.pass_score || 70);

    /* Save or update attempt */
    const result = await pool.query(
      `INSERT INTO quiz_attempts
         (quiz_id, student_id, answers, score, total, percentage, passed, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (quiz_id, student_id)
       DO UPDATE SET
         answers = EXCLUDED.answers,
         score = EXCLUDED.score,
         percentage = EXCLUDED.percentage,
         passed = EXCLUDED.passed,
         submitted_at = NOW()
       RETURNING id, score, total, percentage, passed, submitted_at`,
      [req.params.id, req.user.id, JSON.stringify(answers), correct, total, percentage, passed]
    );

    const attempt = result.rows[0];

    logger.info(`[QUIZ] Student ${req.user.email} scored ${correct}/${total} (${percentage}%) on quiz ${req.params.id} — ${passed ? 'PASSED' : 'FAILED'}`);

    /* Return result with per-question breakdown */
    const breakdown = questions.map((q, i) => ({
      idx:      i,
      q:        q.q,
      options:  q.options,
      selected: answers[i],
      correct:  q.answer,
      isRight:  answers[i] === q.answer,
    }));

    res.json({
      success: true,
      result: {
        score:      correct,
        total,
        percentage,
        passed,
        breakdown,
        attempt_id: attempt.id,
        submitted_at: attempt.submitted_at,
      }
    });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════
   DELETE /api/quizzes/:id  (admin only)
══════════════════════════════════════════════════════ */
router.delete('/:id', requireAuth, requireRole('admin','super_admin'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM unit_quizzes WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Quiz deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
