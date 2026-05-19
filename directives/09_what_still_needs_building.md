# Directive: What Still Needs Building

This document lists features that are partially built, not yet built, or need improvement. Work through these in order of priority.

---

## Priority 1 — Core Platform Gaps

### 1.1 Student Quizzes (not yet API-driven)
- `pendingQuizzes` and `completedQuizzes` arrays are always empty
- No `quizzes` table in the DB schema
- **To build:** Add `quizzes` and `quiz_attempts` tables, add to student sync endpoint, populate in `student-dashboard.js`

### 1.2 Student Certificates (not yet API-driven)
- `CERTIFICATES` array is always empty
- No `certificates` table in the DB schema
- **To build:** Add `certificates` table (awarded when course completed), add to student sync endpoint

### 1.3 Course Enrolment Flow
- Students can be created with a `course` field but no `enrolments` record is created
- The student dashboard courses tab will always be empty until enrolments are created
- **To build:** When onboarding a student, also insert into `enrolments` table with `student_id`, `course_id`, `tutor_id`, `start_date`, `total_lessons`

### 1.4 Lesson Tracking
- `COURSES` progress is always 0% — no lesson completion tracking
- **To build:** Add `lesson_completions` table, update progress when tutor submits class report

---

## Priority 2 — Payments

### 2.1 Stripe Integration
- Payment links are generated manually (stored in localStorage)
- No Stripe webhook handler to confirm payments
- **To build:** Implement `POST /api/payments/webhook` for Stripe, update `payments` table on success, add credits to student

### 2.2 Payment Links in DB
- Currently stored in `localStorage.sn_payment_links`
- **To build:** Add `payment_links` table, store/retrieve from DB

---

## Priority 3 — Operations

### 3.1 Late Join API
- Late joins are logged via `POST /api/sync/late-joins`
- The operations dashboard reads from `GET /api/sync/dashboard/operations`
- **Status:** Backend complete, frontend needs verification

### 3.2 Absent Teacher Notifications
- Auto-absent watcher marks booking as `teacher_absent` in-memory
- **To build:** Call `PUT /api/bookings/:id/status` with `status: 'teacher_absent'` to persist to DB

---

## Priority 4 — HR

### 4.1 Job Applications
- Applications from `teach-with-us.html` form go to `POST /api/applications`
- HR dashboard reads from `GET /api/sync/dashboard/hr`
- **Status:** Appears complete — verify end-to-end

---

## Priority 5 — Blog

### 5.1 Blog System
- Backend: `GET/POST/PUT/DELETE /api/blogs` — complete
- Frontend: `blog.js`, `blog-post.js`, `admin-blog.js` — connected to API
- **Status:** Complete — verify blog posts can be created from admin

---

## Priority 6 — Quality of Life

### 6.1 Mobile Responsiveness
- Most dashboards are not mobile-optimised
- The public pages (homepage, courses, free-trial) are responsive

### 6.2 Email — Zoho SMTP Password Needs Regenerating
- The email service uses Zoho SMTP (`smtp.zoho.com:465`)
- Current app password `ybKC76bCr1LN` is failing with `535 Authentication Failed`
- **Action needed:** Log into https://accounts.zoho.com → Security → App Passwords → generate new password → update server:
  ```bash
  ssh -i C:\Users\hp\stemnest-key.pem ubuntu@13.40.64.172
  sed -i 's/SMTP_PASS=.*/SMTP_PASS=NEW_PASSWORD/' /home/ubuntu/stemnest-academy/backend/.env
  pm2 reload stemnest-api --update-env
  ```

### 6.3 Password Change for Students/Tutors
- `PUT /api/users/:id/password` endpoint exists
- No UI for it in student or tutor dashboard
- **To build:** Add "Change Password" section to profile modal

### 6.4 Tutor Availability Sync to DB
- Tutor availability is stored in `localStorage.sn_tutor_avail_<staffId>`
- Should be stored in `tutor_availability` table in DB
- **To build:** On availability save, also call `POST /api/tutor-availability` to persist

### 6.5 Sales Dashboard
- `sales-dashboard.js` — verify it loads pipeline from API correctly
- Should use `GET /api/sync/dashboard/sales`

### 6.6 Quizzes & Assignments — Recommended Approach
See `10_quizzes_and_assignments.md` for the full design.

---

## ✅ Completed Since Last Update (May 2026)

- Auto-refresh on all dashboards (60s interval) — no cache clearing needed
- Tutor overview cards: demo/paid distinction, phone copy button, join/end buttons
- Calendar popup: full details, phone copy, class material link, join/end/reschedule
- Presales 403 fix: revoked 133 stale tokens, all staff must re-login once
- Email service: fixed SMTP port to 465 for Zoho SSL
- Student dashboard: projects from API, time display fix, clean state for new students
- Post-sales: removed localStorage writes, loads teachers/courses from API
