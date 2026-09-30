# StemNest Academy — Session Log

This file tracks every development session: what was worked on, what was fixed, and what files were changed.
It exists so that any future agent or developer can instantly understand where we are and what was done last.

---

## Session: 18 September 2026

**Started:** ~09:00 WAT  
**Power cut disruption:** ~09:15 WAT — Kiro session lost. Resumed at ~10:00 WAT.  
**Completed:** ~14:00 WAT

### Context
Power outage caused the Kiro IDE session to drop. The previous session had been actively writing `postsales-dashboard.js` when the cut happened — the file was saved as 0 bytes. Full recovery was done by reading all reference documents (STEMNEST V2 SYSTEM.md, LESSON_SCHEDULING_SPEC.md, directives) and examining git status (no commits had ever been made).

### What Was Fixed

#### 1. `postsales-dashboard.js` — Rebuilt from scratch (was 0 bytes / wiped by power cut)
- Full JS for all Post-Sales dashboard tabs written:
  - Paid Students (with all columns: ID, name, email, phone, DOB/age, grade, pathway, enrolled date, amount paid, credits, actions)
  - Students Needing Top-Up
  - Scheduled Classes (with Pathway column, First Class Date column, Invalid Date fix)
  - Converted Students (full table: ID, name, DOB, gender, country/city, grade, pathway, parent name, email, phone, service type, schedule, teacher, converted date)
  - Website Enquiries (filtered to `source = 'website'` only)
  - Enrollment Requests
  - Incoming Referrals
  - Grade Promotions
  - Pause & Resume
  - Group Batches (create, detail, reschedule, pause/resume, delete)
  - Payment Link generator
  - Manual Onboard modal
  - Schedule modal
  - Reschedule modal
  - Change Tutor modal
  - Manual Top-Up

#### 2. `backend/src/routes/sync.js` — Postsales dashboard query rewritten
- **Before:** Only fetched `id, name, email, phone, credits, grade` for students
- **After:** Full query with `DISTINCT` join to `enrolments → pathways → pathway_grades → users (tutor)` plus sub-selects for `amountPaid` and `amountCurrency` from the `payments` table
- **New data returned:** `staffId`, `dateOfBirth`, `enrolledAt`, `parentName`, `parentEmail`, `pathwayName`, `gradeNumber`, `currentGrade`, `lessonsCompleted`, `tutorName`, `amountPaid`, `amountCurrency`, `creditsSuspended`, `classPaused`
- **Added:** `scheduledStudents` — one row per student with future paid classes, includes `pathway`, `firstClassDate`, `firstClassTime`, correct date columns
- **Added:** `convertedStudents` — full pipeline records where `status IN ('converted','paid')` joined to booking, student_profiles, enrolments, pathways, tutor, class_reports, and booking notes JSONB for country/city/gender

#### 3. `frontend/js/presales-dashboard.js` — Website Enquiries routing bug fixed
- **Bug:** The presales "Enrol" button (`confirmEnrolment()`) was calling `POST /api/enrollments/request` — the same public endpoint used by the website "Enrol Now" button
- **Fix:** Changed to call `PUT /api/bookings/:id/status` with `{ status: 'converted' }` — the correct flow for presales handing off a completed demo student to Post-Sales
- **Effect:** Website Enquiries tab now only shows records from `enrollment_requests` where `source = 'website'`. Presales hand-offs no longer pollute this tab.

#### 4. `frontend/pages/postsales-dashboard.html` — Cache buster updated
- Script tag version: `?v=202609180902` → `?v=202609181400` to force browser to load the new JS

### Files Modified
| File | Change |
|---|---|
| `frontend/js/postsales-dashboard.js` | Rebuilt from 0 bytes — full ~1,700-line JS |
| `backend/src/routes/sync.js` | Postsales dashboard API query expanded |
| `frontend/js/presales-dashboard.js` | `confirmEnrolment()` routing fix |
| `frontend/pages/postsales-dashboard.html` | Cache buster updated |

### Root Causes Identified
| Issue | Root Cause |
|---|---|
| Paid student pathway/amount showing `---` after 24-72hrs | Sync query never joined `enrolments` or `payments` — data was never fetched, not a caching issue |
| Scheduled classes "Invalid Date" | JS was doing `new Date(dateString)` on a `YYYY-MM-DD` string which is timezone-parsed as UTC midnight, shifting the date back 1 day in WAT/BST. Fix: split string manually `[y,m,d] = str.split('-')` |
| Converted Students table empty | `convertedStudents` was never included in the postsales sync API response |
| Website Enquiries showing presales students | `confirmEnrolment()` called the wrong API endpoint (`/api/enrollments/request`) |

---

## Session: [Previous — exact date unknown, pre-power-cut Sep 18]

### What Was Being Built (in progress when power cut)
- Group Batches feature (backend `batches.js` route was complete)
- `postsales-dashboard.js` was being written to wire the frontend to the batches API
- The file was in the process of being written when the power cut occurred

### Previously Completed Work (from STEMNEST V2 SYSTEM.md — Last Updated August 2026)
- Career Pathways full implementation (admin → student → tutor)
- 15-min End Class enforcement on Overview cards
- Lesson-linked bulk scheduling (72 lessons per grade, pathway-linked)
- Student credit ladder (3 → 1 → 0 → -1 → -2 → suspension)
- Fincra webhook payment confirmation + auto-onboarding
- Grey Finance USD bank transfer payment method
- Auto class reminders (24hr / 30min / 10min)
- Post-class summary emails
- Retention & re-enrolment automation (Day 3 / Day 7 / Day 14)
- Teacher regions
- Booking extension job (auto-generates bookings to always keep 8+ weeks ahead)
- Pause & Resume student classes
- Grade Promotions
- Refer & Earn (student referral system)
- Email service via Resend.com (live)
- Free-trial form: two-stage form, country code auto-fill, timezone detection
- Presales dashboard: timezone display (local + WAT), edit fields on bookings

---

## Open Items / Known Issues (as of Sep 18 session end)

1. **No git commits have ever been made** — all code exists only locally and on the EC2 server. Git was set up but `git commit` was never run. First commit needed.
2. **Student quizzes** — `pendingQuizzes` always empty. No `quizzes` table yet.
3. **Student certificates** — `CERTIFICATES` always empty. No `certificates` table yet.
4. **Student profile modal** — still shows hardcoded "James Okafor". Needs to load from API.
5. **Course enrolment records** — manual onboard creates `users` but doesn't always insert into `enrolments` table. Students may see zero courses.
6. **Mobile responsiveness** — dashboards are desktop-only.
7. **Password change UI** — backend endpoint exists (`PUT /api/users/:id/password`), no frontend form.

---

*This log should be updated at the end of every development session.*
*Format: one entry per session, describing what was done, what files changed, and any known issues.*

---

## Session: 30 September 2026

**Started:** ~09:00 WAT
**Completed:** ~13:00 WAT

### Context
New PC — old PC was lost. Project pulled fresh from GitHub. Previous session had been mid-way through migrating the database from Neon to Supabase when the PC was lost.

### What Was Done

#### 1. Supabase project restored
- Project `stemnest-academy` (ID: `foentsgwrcazaehkbdqv`) was paused due to 7 days inactivity
- Restored from Supabase dashboard

#### 2. Fresh Supabase schema applied
- Created `backend/src/db/supabase-setup.sql` — full schema for all tables
- Created `backend/src/db/supabase-seed.sql` — staff accounts using pgcrypto
- Both run via Supabase SQL Editor (Run without RLS)

#### 3. Full data migration from Neon → Supabase
- Neon had: 56 users, 3,002 bookings, 36 students, 11 tutors, 13 payments + more
- Installed Node.js v24, ran `npm ci` on backend
- Created `backend/migrate-to-supabase.js` — automated migration script
- Used Supabase **Session Pooler** connection (IPv4) since direct connection is IPv6 only
- Migration result: **4,945 rows inserted** across 25 tables
- 50 bookings skipped (orphaned foreign keys in Neon — already corrupted data)

#### 4. EC2 server updated to point to Supabase
- Installed AWS CLI v2 on new PC
- Created new IAM access keys: `AKIAVDCNUQZQS547F73V`
- Created new EC2 key pair `stemnest-key-new` saved at `C:\Users\Diala\stemnest-key-new.pem`
- Used EC2 Instance Connect (browser terminal) to access server
- Updated `DATABASE_URL` in `/home/ubuntu/stemnest-academy/backend/.env`
- New URL: `postgresql://postgres.foentsgwrcazaehkbdqv:***@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`
- Ran `pm2 reload stemnest-api --update-env` — both instances reloaded successfully

#### 5. Verified working
- `GET /api/health` → `{"success":true,"message":"StemNest API is running 🚀"}`
- `POST /api/auth/login` with presales credentials → JWT token returned from Supabase ✅

### Files Created/Modified
| File | Change |
|---|---|
| `backend/src/db/supabase-setup.sql` | New — full Supabase schema |
| `backend/src/db/supabase-seed.sql` | New — staff seed using pgcrypto |
| `backend/migrate-to-supabase.js` | New — Neon→Supabase migration script |

### Current Database
- **Provider:** Supabase (project ID: `foentsgwrcazaehkbdqv`)
- **Connection:** Session pooler (IPv4) — `aws-1-eu-west-1.pooler.supabase.com:5432`
- **Free tier:** 500MB (was on Neon 5MB — now 100x more space)

### Important Notes
- SSH key for EC2 is now `C:\Users\Diala\stemnest-key-new.pem`
- EC2 IP is currently `13.40.169.73` (may change on restart — consider Elastic IP)
- Supabase project will pause again after 7 days inactivity on free tier
  - **To prevent:** log into Supabase dashboard at least once a week, OR upgrade to Pro ($25/month)
- AWS access keys stored in AWS CLI config on this PC

### Open Items
1. Supabase auto-pause risk — set a reminder to log in weekly or upgrade to Pro
2. EC2 IP is not static — add an Elastic IP to prevent it changing on restart
3. `tutor_earnings_log`, `batch_members`, `referrals` tables exist in Neon but not in Supabase schema yet — add if needed
4. Test all dashboards end-to-end now that DB is on Supabase
