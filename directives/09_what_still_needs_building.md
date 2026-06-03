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

### 6.2 Email — PENDING FIX (Zoho SMTP not available on free plan)
- **Status:** ⚠️ Blocked — Zoho free plan does not support SMTP
- **Current behaviour:** Emails are simulated (logged but not sent). AWS SES is configured but in sandbox mode (can only send to verified addresses).
- **Options to fix:**
  1. **Resend.com** (recommended) — free tier 3,000 emails/month, no sandbox, 5-min setup. Sign up at https://resend.com, verify domain `stemnestacademy.co.uk`, get API key, update `emailService.js`
  2. **Upgrade Zoho Mail** to paid plan (~£1/month) — enables SMTP on port 465
  3. **Re-apply for AWS SES production access** with stronger justification
- **When ready:** Tell the developer "fix email" and implement Resend.com integration in `backend/src/services/emailService.js`
- **Impact:** Password reset emails, welcome emails, and demo confirmation emails are not being delivered to real users

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

## ✅ Completed — Career Pathways Implementation (June 2026)

### Phase 1 — Database
- Tables created: `pathways`, `pathway_grades`, `pathway_units`, `pathway_lessons`, `pathway_quizzes`, `pathway_quiz_questions`
- Columns added to: `enrollment_requests` (pathway_id, grade_number, has_device, expected_start), `enrolments` (pathway_id, current_grade, current_unit, lessons_completed, frequency_per_week), `bookings` (pathway_lesson_id, lesson_number_in_grade, content_released)

### Phase 2 — Backend API (`/api/pathways`)
- Full CRUD: Pathway → Grade → Unit → Lesson (12 fields) → Quiz (optional, 20 questions)
- `GET /api/pathways/public` — public endpoint for courses page
- `GET /api/pathways/for-onboarding` — postsales/admin selector
- `GET /api/pathways/promotions/pending` — students ready for grade promotion
- `POST /api/pathways/promotions/:id/promote` — promote student to next grade
- `POST /api/pathways/teacher-change` — reassign future bookings to new teacher from chosen lesson

### Phase 3 — Admin Dashboard
- Career Pathways section in sidebar
- Create/edit/delete pathways (all fields editable)
- Drill-down: Pathway → Grades → Units → Lessons → Quiz
- Teacher change modal with lesson number picker

### Phase 4 — Public Courses Page
- Two tabs: Tech Career Pathways + Courses (Maths/Sciences)
- Pathway cards with "Learn More" slide-in panel (full content per pathway)
- Enrolment form: grade dropdown, device check (Yes/No), start date picker
- Submits to Post-Sales Enrollment Requests

### Phase 5 — Post-Sales Onboarding
- Pathway → Grade selector in both onboard modals (from demo + manual)
- Loads live from API, pre-fills from enrollment request data

### Phase 6 — Student Dashboard
- Pathway progress banner on overview (pathway name, grade, unit, % complete)
- Progress bar shows grade completion
- Lessons list shows "View Details" button on completed lessons
- Lesson content modal: learning objectives, concept discovery, Task 1 link, Task 2 link, debrief, what comes next
- Homework 1 & 2 auto-appear in Pending Projects after class completion

### Phase 7 — Tutor Dashboard
- Projects tab replaced with real API-driven list
- Pending Projects / Reviewed Projects filter buttons
- Review modal: feedback + score → notifies student

### Phase 8 — Auto-Promotion
- Grade Promotions tab in Post-Sales dashboard
- Shows students who completed all 72 lessons
- One-click "Promote to Grade X" button

### Phase 9 — Teacher Change
- Admin can open teacher change modal from student records
- Select new teacher + starting lesson number
- All future bookings reassigned automatically

### Key Rules (add to gotchas)
- Lesson content is HIDDEN from student until `content_released = TRUE` or `status = 'completed'`
- Task 1 and Task 2 links (not generic class links) are shown to student after completion
- Homework 1 & 2 auto-create project cards — student can resubmit until teacher reviews
- Quiz is optional at creation — admin can add later
- Grade courses are NEVER shown on the public courses page

### Presales Dashboard
- **Scheduled tab** now shows Teacher name AND Learning Advisor (sales person) name on every record
- **Incoming Referrals tab** added — fetches from `GET /api/enrollments/referrals?status=pending`
  - "Book Demo" button pre-fills schedule modal with referral data, creates a real booking
  - "Enroll" button moves referral to postsales (`PUT /api/enrollments/referrals/:id` with `status: postsales`)
- **Enrolments tab** rebuilt — now shows students marked paid by Learning Advisor (from pipeline), with "Enroll" button that moves them to postsales paid students

### Post-Sales Dashboard
- **Enrollment Requests tab** added — fetches from `GET /api/enrollments/requests`
  - Post-Sales pastes payment link, saves it, sets Payment Status dropdown (Pending/Received)
  - Proceed button activates only when status = Received; moves student to Paid Students
- **Incoming Referrals tab** added — fetches from `GET /api/enrollments/referrals?status=postsales`
  - Same payment link + status + Proceed flow as enrollment requests
  - "Send" button opens WhatsApp with payment link
- **Website Enquiries tab** now reads from `/api/enrollments/requests` (not old payments endpoint)

### Student Dashboard
- **Refer & Earn tab** added to sidebar and main content
  - Form: student name, grade, age, parent email, parent WhatsApp, relationship, needs demo?
  - Submits to `POST /api/enrollments/referral` (authenticated)
  - Shows past referrals with status badges (Pending / Demo Booked / In Enrollment / Enrolled)

### Sales Dashboard
- `renderLeads()` now builds leads from completed demo bookings fetched from API (no localStorage)
- When Learning Advisor marks a lead as "paid" → saves converted pipeline record to DB → appears in presales Enrolments tab

### Backend — Deployed to Production
- `backend/src/routes/enrollments.js` — live on server at `/api/enrollments`
- `backend/src/index.js` — route registered
- DB tables created: `enrollment_requests`, `referrals`
- `GET /api/enrollments/referrals` — students see only their own referrals; staff see all
- **Bug fixed**: Student role was getting 403 on GET referrals — now returns own records only

### Copyright
- All 15 public pages updated from © 2025 → © 2026 (company registered 2026)

---

## ✅ Completed Since Last Update (May 2026)

- Auto-refresh on all dashboards (60s interval) — no cache clearing needed
- Tutor overview cards: demo/paid distinction, phone copy button, join/end buttons
- Calendar popup: full details, phone copy, class material link, join/end/reschedule
- Presales 403 fix: revoked 133 stale tokens, all staff must re-login once
- Email service: fixed SMTP port to 465 for Zoho SSL
- Student dashboard: projects from API, time display fix, clean state for new students
- Post-sales: removed localStorage writes, loads teachers/courses from API
- **Free trial date defaults to today** (not tomorrow)
- **Email OR phone required** (not both) on free trial form
- **Duplicate booking**: same parent + different kids = allowed with notice; exact duplicate = blocked
- **Timezone display**: student local time + WAT shown in presales incoming/scheduled tables
- **Teacher earnings persist**: loaded from DB via API, not reset on refresh
- **Completed classes tab**: now loads from API, shows all completed/incomplete/partial with recording link
- **Paysheet download**: reads from API data, generates CSV with correct earnings
- **Teacher regions**: DB column added, admin form has region checkboxes, stored in tutor_profiles.regions

---

## ✅ Completed — Additional Fixes & Features (June 2026)

### Career Pathways — Bug Fixes & Enhancements
- **Pathway Edit bug fixed**: `editPathway()` now correctly updates existing pathway (was creating new ones). Root cause: `showAdminTab` was calling `resetPathwayForm()` which cleared the hidden `pw-id` field before save.
- **"Add Pathway" explicitly resets form** before tab switch; "Edit Pathway" does not.
- **Courses page modal**: "Learn More" panel changed from side-panel to centered modal (desktop fix).
- **Grade dropdown**: Fixed broken template literal `${Array.from(...)}` — replaced with plain HTML `<option>` tags.
- **Enrolment form layout**: Fixed grid alignment with `flex-direction:column` on each cell.
- **Grey payment modal UUID fix**: `r.id` is a UUID — onclick now quotes it as `'${r.id}'` to prevent JS math eval error.
- **Grey DB column type**: `grey_payment_references.enrollment_request_id` changed INTEGER → TEXT.
- **"Copy All Payment Details" button**: Uses `window._greyPaymentCopyData` global (not inline JSON params). Dual clipboard fallback. Visual "✅ Copied!" feedback on button.

### Grade 1-3 Lesson Form Modifications
- **"Warm Up" renamed to "NOVA Moment - The Story Beat"** for Grade 1-3 lessons only
- **"Portfolio Save" field added** between Homework 2 and What Comes Next, Grade 1-3 only
- Grade 4-12 lesson forms unchanged
- `portfolio_save` TEXT column added to `pathway_lessons` table (safe `ADD COLUMN IF NOT EXISTS`)
- Backend POST and PUT endpoints updated to accept and save `portfolio_save`

### Email Service (Resend.com) — LIVE
- DNS records added to Route 53 for `stemnestacademy.co.uk`
- Resend domain verified, API key in server .env
- All transactional emails now delivered to real inboxes

### Grey Finance Payment Integration — LIVE
- Lead Bank USD: Account 218292502181, Routing 101019644
- Webhook endpoint: `POST /api/payments/grey-webhook`
- Payment reference format: `SN-YYYY-XXXXX`
- "Copy All Payment Details" generates formatted text block for WhatsApp/email

### Audit Status (June 2026)
- **52/52 checks passing** across syntax, API, and structural checks
- No broken files, no missing route registrations, no localStorage business data

---

## 🔄 What Still Needs Building (Priority Order)

### High Priority
1. **Student profile modal** — currently placeholder (hardcoded "James Okafor"). Need to load real data from API and save changes. Password change UI also missing.
2. **Onboarding creates enrolment record** — `confirmOnboard()` creates the user but doesn't insert into `enrolments` table. Students see zero courses on dashboard until fixed.
3. **Course progress tracking** — `progress` and `done` are hardcoded to 0. Need `lesson_completions` table and tracking when tutor submits class report.
4. **Student quizzes** — `pendingQuizzes` always empty. No `quizzes` table yet.
5. **Student certificates** — `CERTIFICATES` always empty. No `certificates` table yet.

### Medium Priority
6. **Sales dashboard completed demos tab** — completed demos surface in Demo Leads but no clean dedicated view
7. **Grey webhook live test** — built and deployed but not yet tested with a real payment
8. **Nigerian subsidiary / Paystack** — when CAC registration done, integrate Paystack for card payments

### Low Priority
9. **Mobile responsiveness** — dashboards are desktop-only
10. **Password change UI** — backend endpoint exists, no frontend form
