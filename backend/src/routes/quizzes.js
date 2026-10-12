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
const learning = require('../services/learningService');
const logger  = require('../utils/logger');
const crypto  = require('crypto');

/* ── Shuffling: every attempt shows the questions, and each question's
   options, in a different order. The order comes from the student, the
   quiz and the attempt number, so it is the same when the page is
   reloaded and the server can map answers back without storing it. ── */
function _rng(seed) {
  let h = crypto.createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {            /* mulberry32 */
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _shuffled(n, rnd) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** order[d] = original question shown at position d; opts[d][k] = original option shown as option k */
function quizLayout(quiz, studentId, attemptNo) {
  const qs = quiz.questions || [];
  const rnd = _rng(`${studentId}:${quiz.id}:${attemptNo}`);
  const order = _shuffled(qs.length, rnd);
  const opts = order.map(oi => _shuffled((qs[oi].options || []).length, rnd));
  return { order, opts };
}
async function _nextAttemptNo(quizId, studentId) {
  const r = await pool.query(`SELECT attempts_used FROM quiz_assignments WHERE quiz_id = $1 AND student_id = $2`, [quizId, studentId]);
  return (r.rows[0] ? Number(r.rows[0].attempts_used) || 0 : 0) + 1;
}
async function _studentQuestions(quiz, studentId) {
  const qs = quiz.questions || [];
  const { order, opts } = quizLayout(quiz, studentId, await _nextAttemptNo(quiz.id, studentId));
  return order.map((oi, d) => ({ idx: d, q: qs[oi].q, options: opts[d].map(k => qs[oi].options[k]) }));
}

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
       pass_score || learning.DEFAULT_PASS, req.user.id]
    );

    /* Everyone who has finished this unit — whenever that was — gets the quiz */
    const backfilled = (await learning.catchUp({ quizId: result.rows[0].id })).quizzes;

    logger.info(`[QUIZ] Uploaded ${questions.length} questions for pathway=${pathway_id} grade=${grade_number} unit=${unit_number} by ${req.user.email}; assigned to ${backfilled} student(s) who finished the unit`);
    res.json({ success: true, quiz: result.rows[0], assignedTo: backfilled });
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
   GET /api/quizzes/units-map  (admin)
   Every curriculum unit with its title and whether it has a quiz —
   used by the bulk upload to match quiz files to units.
══════════════════════════════════════════════════════ */
router.get('/units-map', requireAuth, requireRole('admin','super_admin'), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT p.id AS "pathwayId", p.name AS pathway, pg.grade_number AS grade, pu.unit_number AS unit, pu.name,
              (uq.id IS NOT NULL) AS "hasQuiz", uq.total_questions AS "quizQuestions"
       FROM pathway_units pu
       JOIN pathway_grades pg ON pg.id = pu.grade_id
       JOIN pathways p ON p.id = pg.pathway_id
       LEFT JOIN unit_quizzes uq ON uq.pathway_id = p.id AND uq.grade_number = pg.grade_number AND uq.unit_number = pu.unit_number
       WHERE pu.is_active IS NOT FALSE
       ORDER BY p.name, pg.grade_number, pu.unit_number`);
    res.json({ success: true, units: r.rows });
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

    /* No correct answers; students get this attempt's shuffled order */
    const questionsForStudent = req.user.role === 'student'
      ? await _studentQuestions(quiz, req.user.id)
      : (quiz.questions || []).map((q, idx) => ({ idx, q: q.q, options: q.options }));

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
      : req.user.role === 'student'
        ? await _studentQuestions(quiz, req.user.id)
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
  const client = await pool.connect();
  try {
    const { answers } = req.body; // array of selected option indices
    if (!Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: 'answers must be an array' });
    }

    await client.query('BEGIN');
    const quizResult = await client.query('SELECT * FROM unit_quizzes WHERE id = $1', [req.params.id]);
    if (!quizResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Quiz not found' });
    }
    const quiz = quizResult.rows[0];
    const questions = quiz.questions || [];

    /* The student's assignment for this quiz (created on the spot for quizzes opened directly) */
    await client.query(
      `INSERT INTO quiz_assignments (student_id, quiz_id, due_at)
       VALUES ($1, $2, NOW() + make_interval(days => $3)) ON CONFLICT (student_id, quiz_id) DO NOTHING`,
      [req.user.id, quiz.id, learning.DUE_DAYS]
    );
    const asg = (await client.query(
      `SELECT * FROM quiz_assignments WHERE student_id = $1 AND quiz_id = $2 FOR UPDATE`, [req.user.id, quiz.id])).rows[0];
    if (asg.attempts_used >= learning.QUIZ_ATTEMPTS) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: `You have used all ${learning.QUIZ_ATTEMPTS} attempts for this quiz` });
    }

    /* answers[] follow this attempt's shuffled order — map them back to the originals */
    const { order, opts } = quizLayout(quiz, req.user.id, asg.attempts_used + 1);
    const original = new Array(questions.length).fill(null);   // original question → original option
    order.forEach((oi, d) => { const k = answers[d]; if (Number.isInteger(k) && opts[d][k] != null) original[oi] = opts[d][k]; });

    /* Grade it */
    let correct = 0;
    questions.forEach((q, i) => { if (original[i] === q.answer) correct++; });
    const total      = questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100 * 100) / 100 : 0;
    const passScore  = quiz.pass_score || learning.DEFAULT_PASS;
    const late       = !!(asg.due_at && new Date() > new Date(asg.due_at));
    const points     = learning.penalised(percentage, late);       // out of 100, halved if late
    const attemptNo  = asg.attempts_used + 1;
    const improved   = asg.points == null || points > Number(asg.points);
    const bestPct    = Math.max(Number(asg.best_percentage || 0), percentage);
    const passedEver = asg.passed || percentage >= passScore;

    await client.query(
      `UPDATE quiz_assignments
       SET attempts_used = $1, last_attempt_at = NOW(), passed = $2, best_percentage = $3,
           best_score = GREATEST(COALESCE(best_score, 0), $4),
           points = GREATEST(COALESCE(points, 0), $5)
       WHERE id = $6`,
      [attemptNo, passedEver, bestPct, correct, points, asg.id]
    );
    /* quiz_attempts keeps the latest attempt (dashboard history) */
    const result = await client.query(
      `INSERT INTO quiz_attempts
         (quiz_id, student_id, answers, score, total, percentage, passed, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (quiz_id, student_id)
       DO UPDATE SET answers = EXCLUDED.answers, score = EXCLUDED.score, total = EXCLUDED.total,
                     percentage = EXCLUDED.percentage, passed = EXCLUDED.passed, submitted_at = NOW()
       RETURNING id, submitted_at`,
      [quiz.id, req.user.id, JSON.stringify(original), correct, total, percentage, percentage >= passScore]
    );
    await client.query('COMMIT');

    const attemptsLeft = learning.QUIZ_ATTEMPTS - attemptNo;
    /* After every attempt the student sees the right answer and the explanation
       for each question, so they can learn from mistakes before trying again */
    const reveal = true;
    const breakdown = order.map((oi, d) => {
      const q = questions[oi];
      return {
        idx: d, q: q.q, options: opts[d].map(k => q.options[k]), selected: answers[d],
        isRight: original[oi] === q.answer,
        correct: opts[d].indexOf(q.answer),
        explanation: q.explanation ? String(q.explanation) : null,
      };
    });

    logger.info(`[QUIZ] ${req.user.email} attempt ${attemptNo}/${learning.QUIZ_ATTEMPTS}: ${correct}/${total} (${percentage}%)${late ? ' late' : ''} on quiz ${quiz.id}`);
    res.json({
      success: true,
      result: {
        score: correct, total, percentage,
        passed: percentage >= passScore, passScore,
        attempt: attemptNo, attemptsLeft, late,
        points, bestPoints: Math.max(Number(asg.points || 0), points), improved,
        answersRevealed: reveal,
        breakdown,
        attempt_id: result.rows[0].id,
        submitted_at: result.rows[0].submitted_at,
      }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
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
