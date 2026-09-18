# Directive: Career Pathways — Full Specification & Implementation Guide

**Status:** IN PROGRESS — Implementation started June 2026

---

## What This Is

StemNest is replacing its "Coding" course category with **Career Pathways** — structured 12-year learning journeys (Grade 1–12) for Tech programmes. Maths and Sciences remain as standard courses.

---

## The Five Tech Career Pathways

1. Data Science & Analytics
2. Website Development
3. Mobile & App Development
4. Game Development
5. AI & Automation

---

## Data Hierarchy

```
Career Pathway
└── Grade (1–12)
    ├── Unit 1–8 (each: 8 lessons + optional 20-question quiz)
    ├── Flex Session 1 (after Lesson 20) — created as a lesson
    ├── Flex Session 2 (after Lesson 36) — created as a lesson
    ├── Flex Session 3 (after Lesson 53) — created as a lesson
    ├── Review Session 1 (covers Units 1–4) — created as a lesson
    ├── Review Session 2 (covers Units 5–8) — created as a lesson
    ├── Capstone Project Session 1 — created as a lesson
    ├── Capstone Project Session 2 — created as a lesson
    └── Capstone Project Session 3 — created as a lesson
```

**Total per grade: 72 sessions**
- 8 units × 8 lessons = 64 lessons
- 3 flex sessions + 2 review sessions + 3 capstone sessions = 8 special sessions
- 64 + 8 = 72 ✅

---

## Lesson Fields (12 fields per lesson)

1. Lesson Title
2. Learning Objectives
3. Warm Up
4. Project Briefing
5. Concept Discovery
6. Task 1 (Guided) — includes a URL link field
7. Task 2 (Independent) — includes a URL link field
8. DeBrief
9. Homework 1
10. Homework 2
11. What Comes Next
12. Additional Notes for Teachers

---

## Unit Quiz

- 20 questions per unit
- Created by admin at pathway creation
- **Optional** — admin can save without quiz and add later
- Appears on student dashboard after all 8 lessons in the unit are completed

---

## Database Tables Required

```sql
-- New tables needed:
pathways              -- pathway metadata (name, description, price, etc.)
pathway_grades        -- grade 1-12 under each pathway
pathway_units         -- 8 units per grade
pathway_lessons       -- lessons per unit (+ flex/review/capstone as lessons)
pathway_quizzes       -- optional quiz per unit (20 questions)
pathway_quiz_questions -- individual questions per quiz
```

**Existing tables that need changes:**
- `courses` — add `pathway_id`, `grade_number`, `unit_number` columns
- `enrollment_requests` — add `pathway_id`, `grade_number`, `has_device`, `expected_start_date`
- `enrolments` — add `pathway_id`, `current_grade`, `current_unit`, `lessons_completed`
- `bookings` — add `pathway_lesson_id`, `lesson_number_in_grade`

---

## Implementation Order (Priority)

### Phase 1 — Database Foundation (DO FIRST)
1. Create `pathways` table
2. Create `pathway_grades` table
3. Create `pathway_units` table
4. Create `pathway_lessons` table
5. Create `pathway_quizzes` and `pathway_quiz_questions` tables
6. Add columns to existing tables
7. Delete existing courses from DB (clean slate)

### Phase 2 — Backend API
1. `GET/POST/PUT/DELETE /api/pathways` — pathway CRUD
2. `GET/POST/PUT/DELETE /api/pathways/:id/grades` — grade CRUD
3. `GET/POST/PUT/DELETE /api/pathways/:id/grades/:grade/units` — unit CRUD
4. `GET/POST/PUT/DELETE /api/pathways/:id/grades/:grade/units/:unit/lessons` — lesson CRUD
5. `GET/POST/PUT/DELETE /api/pathways/:id/grades/:grade/units/:unit/quiz` — quiz CRUD
6. `GET /api/pathways/public` — public endpoint (no auth) for courses page

### Phase 3 — Admin Dashboard
1. Pathway list + create/edit/delete
2. Grade management under a pathway
3. Unit management under a grade
4. Lesson creation form (all 12 fields)
5. Quiz creation (optional, 20 questions)
6. Flex/Review/Capstone session creation

### Phase 4 — Public Courses Page
1. Two tabs: Tech Career Pathways + Courses
2. Pathway cards with "Learn More" + "Enrol Now" buttons
3. "Learn More" slide-in panel (full content per pathway)
4. Updated enrolment form (grade dropdown, device check, start date)

### Phase 5 — Post-Sales Onboarding
1. Pathway → Grade selector in onboarding modal
2. Frequency selector (2x/3x/4x per week)
3. Auto-schedule all 72 sessions on teacher's calendar
4. Enrollment request shows pathway + grade + device + start date

### Phase 6 — Student Dashboard
1. Show pathway name, current grade, current unit, progress
2. Lesson content hidden until class marked complete
3. After completion: show lesson details + Task 1 link + Task 2 link
4. Homework 1 & 2 auto-create project cards in Pending Projects
5. Unit quiz appears after unit completion

### Phase 7 — Teacher Dashboard
1. View Class Details button → lesson content page
2. Pending Projects / Reviewed Projects filter buttons
3. Project review flow

### Phase 8 — Auto-Promotion
1. Detect grade completion
2. Notify post-sales + teacher
3. "Promote to Grade X" button in post-sales
4. Auto-schedule next grade at same frequency

### Phase 9 — Teacher Change / Reschedule
1. Admin picks new teacher + starting lesson number
2. Cancel future lessons with old teacher
3. Book remaining lessons with new teacher

---

## Public Pathway Content (for "Learn More" panels)

### 1. Data Science & Analytics
**Tagline:** Become a Data Scientist and Analytics Expert
**Intro:** Turn curiosity into insights through the power of data.
**Description:** The Data Science & Analytics Pathway takes students on a journey from basic digital literacy and logical thinking to advanced data analysis, machine learning, artificial intelligence, and business intelligence. Students learn how to collect, organize, analyze, visualize, and interpret data to solve real-world problems. Through hands-on projects, students develop skills in statistics, spreadsheets, Python programming, data visualization, machine learning, and predictive analytics.
**What Students Learn:** Data Literacy and Digital Skills · Data Collection and Analysis · Statistics and Mathematical Thinking · Python Programming · Data Visualization and Dashboards · Machine Learning Fundamentals · Artificial Intelligence Applications · Business Intelligence and Decision Making
**Career Outcomes:** Data Scientist · Data Analyst · Machine Learning Engineer · Business Intelligence Analyst · AI Specialist
**Graduation Outcome:** Students graduate with a strong portfolio of real-world projects and the skills required to pursue advanced studies and careers in Data Science, Analytics, and Artificial Intelligence.

### 2. Website Development
**Tagline:** Become a Full-Stack Web Developer
**Intro:** Learn how to design, build, and launch professional websites and web applications.
**Description:** From creating simple web pages in the early grades to developing complete full-stack web applications by graduation, students learn every stage of modern web development. Students gain experience with front-end and back-end technologies while building websites, portfolios, blogs, e-commerce systems, and interactive web applications.
**What Students Learn:** Web Design Principles · HTML & CSS · JavaScript Programming · Responsive Design · Front-End Development · Back-End Development · Databases · Full-Stack Application Development
**Career Outcomes:** Full-Stack Web Developer · Front-End Developer · Back-End Developer · UI Developer · Software Engineer
**Graduation Outcome:** Students graduate as confident Full-Stack Web Developers capable of building and deploying modern web applications.

### 3. Mobile App Development
**Tagline:** Become a Mobile App Developer
**Intro:** Create the next generation of mobile applications that solve real-world problems.
**Description:** Students progress from visual programming and app design concepts to building sophisticated Android and cross-platform mobile applications. Throughout the pathway, learners design, develop, test, and publish mobile apps while mastering programming, UI/UX design, databases, APIs, and mobile software engineering principles.
**What Students Learn:** App Design Fundamentals · Mobile User Interface Design · Programming Concepts · Android Development · Cross-Platform App Development · Database Integration · API Integration · Mobile App Deployment
**Career Outcomes:** Mobile App Developer · Android Developer · Cross-Platform Developer · Software Engineer · Product Developer
**Graduation Outcome:** Students graduate with a portfolio of fully functional mobile applications and industry-relevant development skills.

### 4. Game Development
**Tagline:** Become a Game Developer and Interactive Media Creator
**Intro:** Turn creativity into immersive gaming experiences.
**Description:** Students begin by creating simple games using block-based programming before advancing to professional game design, programming, animation, storytelling, and game engine development. They learn how to design, build, test, and publish engaging games while developing creativity, logical thinking, and technical expertise.
**What Students Learn:** Game Design Principles · Storytelling and Character Design · Animation and Interactive Media · Programming for Games · Physics and Game Mechanics · 2D and 3D Game Development · User Experience Design · Game Publishing
**Career Outcomes:** Game Developer · Game Designer · Interactive Media Creator · Software Developer · Digital Animator
**Graduation Outcome:** Students graduate with a portfolio of playable games and the skills required for further studies or careers in game development.

### 5. AI & Automation
**Tagline:** Become an AI Innovator and Automation Engineer
**Intro:** Prepare for the future by mastering Artificial Intelligence and Automation technologies.
**Description:** Students learn how intelligent systems work, how machines make decisions, and how technology can automate tasks and solve complex problems. Beginning with computational thinking and progressing through robotics, AI concepts, machine learning, automation workflows, and intelligent systems, students gain exposure to the technologies shaping the future.
**What Students Learn:** Computational Thinking · Robotics Fundamentals · Artificial Intelligence Concepts · Machine Learning Foundations · Automation Tools and Workflows · Intelligent Systems Design · Problem Solving with AI · Future Technologies
**Career Outcomes:** AI Engineer · Automation Specialist · Robotics Engineer · Machine Learning Engineer · Technology Innovator
**Graduation Outcome:** Students graduate with practical AI and automation skills, preparing them for advanced studies and future technology careers.

---

## All Pathway Panels Include at Bottom

- ✅ Live Instructor-Led Classes
- ✅ Hands-On Projects
- ✅ Progress Tracking
- ✅ Certificates
- ✅ STEMNest Learning Portal Access
- ✅ Portfolio Development
- ✅ Student Progress Reports

---

## Enrolment Form Fields

1. Student Name (required)
2. Current Grade — dropdown Grade 1–12 (required)
3. Age / Year Group
4. Parent Email
5. Parent WhatsApp
6. Country / Timezone (required)
7. Has a laptop or desktop? — Yes/No radio (required) — if No: show warning
8. Expected start date — date picker (required)
9. Additional Notes

---

## Key Rules

- Grade courses are NEVER shown publicly — internal admin/postsales only
- Lesson content is HIDDEN from student until teacher marks class as completed
- After class complete: student sees lesson details + Task 1 link + Task 2 link (NOT generic class material links)
- Homework 1 & 2 auto-create as project cards in student Pending Projects after class completion
- Student can resubmit a project until teacher reviews it — after review, resubmit is permanently disabled
- Quiz is optional at creation — admin can add later
- Price is fixed for all pathways but admin can edit it at any time
- Price change applies to new enrollments only

---

## Files That Will Be Modified

**Backend:**
- `backend/src/db/schema.sql` — new tables
- `backend/src/routes/pathways.js` — new file
- `backend/src/index.js` — register new route
- `backend/src/routes/enrollments.js` — add pathway fields

**Frontend:**
- `frontend/js/courses.js` — pathway tabs + cards + panels + enrolment form
- `frontend/pages/courses.html` — tab structure update
- `frontend/js/admin-dashboard.js` — pathway/grade/unit/lesson/quiz CRUD
- `frontend/pages/admin-dashboard.html` — new pathway management UI
- `frontend/js/postsales-dashboard.js` — pathway → grade onboarding selector
- `frontend/js/student-dashboard.js` — pathway progress, lesson reveal, homework projects
- `frontend/pages/student-dashboard.html` — pathway progress display

---

## What NOT to Touch

- Do NOT modify existing bookings, users, or student data
- Do NOT change the demo booking flow
- Do NOT change the presales dashboard booking/scheduling flow
- The `enrolments` table (British spelling) must stay as-is — only add columns
