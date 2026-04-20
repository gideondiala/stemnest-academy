# Directive: Student Dashboard

## File
`frontend/pages/student-dashboard.html`
`frontend/js/student-dashboard.js`
`frontend/css/dashboard.css` (reuse existing, extend if needed)

## Status
🔲 Not started — next page to build

## Goal
Give students a personal portal to join live classes, track progress,
view homework, and see their enrolled courses.

## Sections to build

### 1. Top nav (reuse global nav pattern)
- Logo + nav links
- "Back to Website" link
- Student name + online status
- Log Out button

### 2. Sidebar
- Student avatar (initials)
- Name, year group, role badge
- Nav links: Overview, My Classes, Homework, Projects, Progress, Profile

### 3. Stat cards (top of main area)
- Classes completed
- Homework due
- Current streak (days)
- Overall progress %

### 4. Join Live Class (prominent CTA)
- Big card at top of overview
- Shows: subject, tutor name, time
- "Join Now →" button (links to meeting URL)
- Only visible when a session is active/imminent

### 5. My Courses
- Enrolled courses with progress bars
- Subject tag, tutor name, next session date

### 6. Homework / Tasks
- List of pending tasks with due dates
- Mark as done interaction

### 7. My Projects
- Submitted work history
- Status: Submitted / Under Review / Reviewed ✓

### 8. Progress Report
- Sessions completed (bar or line chart — use Chart.js or CSS-only bars)
- Milestones reached

### 9. Update Profile modal
- Name, email, year group, subjects
- Parent/guardian contact info

## Design notes
- Student theme: green (`--green`) as primary accent (mirrors login page student mode)
- Reuse `.dash-wrap`, `.dash-sidebar`, `.dash-main`, `.dash-stats` patterns from tutor dashboard
- Keep it consistent — same card styles, same tab switching pattern

## JS file: `student-dashboard.js`
Functions to build:
- `setGreeting()` — time-aware greeting
- `showStudentTab(tab)` — tab switching
- `buildProgressBars()` — render course progress
- `openProfileModal()` / `closeProfileModal()` / `saveProfile()`
- `markHomeworkDone(id)` — toggle homework item

## Edge cases
- No active session: hide "Join Live Class" card, show "No session today"
- No homework: show empty state with encouraging message
- No projects: show "Submit your first project" prompt
