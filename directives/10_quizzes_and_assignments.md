# Directive: Quizzes & Assignments — Design & Implementation Plan

## What Task2 Asked For
> "Each class should have a quiz and assignment. We should be able to set that from the admin at the point of course creation. As we are entering the course and lesson topics it should ask also for quizzes and assignment to be set."

---

## Recommended Architecture

### Database Tables Needed

```sql
-- Quiz attached to a lesson
CREATE TABLE quizzes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id    UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id    VARCHAR(20) REFERENCES courses(id),
  title        VARCHAR(200) NOT NULL,
  time_limit   INTEGER DEFAULT 10,  -- minutes
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Individual quiz questions
CREATE TABLE quiz_questions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id      UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  option_a     TEXT NOT NULL,
  option_b     TEXT NOT NULL,
  option_c     TEXT,
  option_d     TEXT,
  correct_ans  CHAR(1) NOT NULL CHECK (correct_ans IN ('A','B','C','D')),
  order_num    INTEGER DEFAULT 0
);

-- Student quiz attempts
CREATE TABLE quiz_attempts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id      UUID NOT NULL REFERENCES quizzes(id),
  student_id   UUID NOT NULL REFERENCES users(id),
  score        INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  answers      JSONB,  -- { "q_id": "A", ... }
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assignment attached to a lesson
CREATE TABLE assignments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id    UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id    VARCHAR(20) REFERENCES courses(id),
  title        VARCHAR(200) NOT NULL,
  brief        TEXT NOT NULL,
  steps        JSONB,  -- ["Step 1: ...", "Step 2: ..."]
  due_days     INTEGER DEFAULT 7,  -- days after class to submit
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Student assignment submissions
CREATE TABLE assignment_submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id   UUID NOT NULL REFERENCES assignments(id),
  student_id      UUID NOT NULL REFERENCES users(id),
  submission_text TEXT,
  submission_url  TEXT,
  status          VARCHAR(20) DEFAULT 'submitted',  -- submitted, reviewed
  remarks         TEXT,
  score           INTEGER,
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ
);
```

---

## Admin Course Creation Flow (Updated)

When admin creates a course and adds lessons, each lesson form should have:

```
Lesson N: [Title input]
  ├── Quiz (optional toggle)
  │   ├── Quiz title
  │   ├── Time limit (minutes)
  │   └── Questions (add up to 10):
  │       ├── Question text
  │       ├── Option A, B, C, D
  │       └── Correct answer (A/B/C/D)
  └── Assignment (optional toggle)
      ├── Assignment title
      ├── Brief (what to do)
      ├── Steps (numbered list)
      └── Due in X days after class
```

---

## API Endpoints to Build

```
POST   /api/courses/:id/lessons/:lessonId/quiz        — create quiz for lesson
POST   /api/quizzes/:id/questions                     — add questions to quiz
GET    /api/quizzes/:id                               — get quiz with questions
POST   /api/quizzes/:id/attempt                       — student submits attempt
GET    /api/quizzes/:id/attempts/:studentId           — get student's attempt

POST   /api/courses/:id/lessons/:lessonId/assignment  — create assignment
GET    /api/assignments/:id                           — get assignment
POST   /api/assignments/:id/submit                    — student submits
PUT    /api/assignments/:id/submissions/:subId/review — tutor reviews
```

---

## Student Dashboard Integration

After a class is completed, the student sees:
- **Quizzes tab:** Quiz card for the completed lesson → "Start Quiz →"
- **Projects tab:** Assignment card → "Submit Work →"

The student sync endpoint (`GET /api/sync/dashboard/student`) should return:
```json
{
  "quizzes": [{ "id", "title", "lesson_title", "time_limit", "attempted": false }],
  "assignments": [{ "id", "title", "brief", "due_date", "status" }]
}
```

---

## Tutor Dashboard Integration

After ending a class, the tutor sees in the completed sessions:
- Link to view student's quiz score
- Link to review student's assignment submission

---

## Implementation Order

1. **Run the SQL** to create the 5 new tables on the RDS database
2. **Update admin course creation form** to include quiz/assignment fields per lesson
3. **Build the API endpoints** (quiz CRUD, assignment CRUD, attempt/submission)
4. **Update student sync endpoint** to return quizzes and assignments
5. **Update student dashboard** to render quiz cards and assignment cards from API
6. **Update tutor dashboard** to show quiz results and assignment submissions

---

## Notes

- Quizzes are auto-assigned to a student when their booking for that lesson is marked `completed`
- Assignments are auto-assigned similarly
- A student can only attempt a quiz once (or set a max attempts limit)
- Quiz scores are stored in `quiz_attempts` — never recalculated
- Assignment submissions are reviewed by the tutor, not auto-graded
