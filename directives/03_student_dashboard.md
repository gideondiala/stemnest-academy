# Directive: Student Dashboard

## Files
- `frontend/pages/student-dashboard.html`
- `frontend/js/student-dashboard.js`
- `frontend/css/student-dashboard.css`

## Status: ✅ COMPLETE — API-driven, no mock data

---

## How It Works

The student dashboard is **100% real-time**. On every page load it calls `GET /api/sync/dashboard/student` and populates all UI from the response. There is no hardcoded data.

### Init flow
```js
document.addEventListener('DOMContentLoaded', () => {
  _loadStudentFromAPI().then(() => {
    renderProgressBars();
    renderUpcomingPreview();
    renderLessons();
    renderProjectSection('pending');
    renderPendingQuizzes();
    renderCertificates();
    showTab('overview');
  });
});
```

### API call
```js
GET /api/sync/dashboard/student
Authorization: Bearer <token>

Response:
{
  success: true,
  students: [{ id, name, email, grade, age, credits, staff_id, ... }],
  bookings: [{ id, subject, date, time, status, tutor_name, class_link, ... }],
  courses:  [{ id, name, num_lessons, ... }],
  projects: [{ id, title, status, brief, due_date, course_name, ... }],
  payments: [{ id, amount, credits_purchased, created_at, ... }]
}
```

---

## Data Mapping

| API field         | UI variable       | Notes                                      |
|-------------------|-------------------|--------------------------------------------|
| `students[0]`     | `STUDENT` object  | Name, grade, id, initials                  |
| `bookings`        | `LESSONS` array   | Only `status === 'scheduled'` shown        |
| `courses`         | `COURSES` array   | Progress starts at 0 (no lesson tracking yet) |
| `projects`        | `pendingProjects` / `submittedProjects` / `reviewedProjects` | Split by `status` field |
| `payments`        | `window.STUDENT_DATA.payments` | Shown in payments tab |

---

## Tabs

| Tab           | Content                                      |
|---------------|----------------------------------------------|
| Overview      | Progress bars, upcoming lessons preview, credits |
| Lessons       | All scheduled bookings as lesson cards       |
| Projects      | Pending / Submitted / Reviewed project cards |
| Quizzes       | Pending and completed quizzes (empty for new students) |
| Certificates  | Earned certificates (empty for new students) |
| Payments      | Payment/top-up history                       |

---

## Clean State for New Students

A newly onboarded student sees:
- **Overview:** "No active courses." and "No upcoming lessons."
- **Lessons:** "No lessons scheduled."
- **Projects:** "All projects submitted! Great work." (empty pending)
- **Quizzes:** "All quizzes completed!"
- **Certificates:** Empty state with encouragement message
- **Payments:** Empty

This is correct behaviour — the dashboard is clean and ready for use.

---

## Time Display Fix

PostgreSQL returns time as `"14:00:00"`. The dashboard strips seconds:
```js
let timeStr = (b.time || '—').replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
```
Always apply this when displaying time from the API.

---

## Student Profile Object

After API load, `STUDENT` is populated:
```js
STUDENT.name     = s.name
STUDENT.year     = s.grade
STUDENT.id       = 'S-' + numericPart.padStart(4, '0')  // or staff_id
STUDENT.initials = first letters of name
```

---

## Project Submission

When a student submits a project, it calls:
```
PUT /api/projects/:id/submit
Body: { submission: "text" }
Authorization: Bearer <token>
```

No localStorage write. The submission is saved to the DB.

---

## Onboarding a Student (Post-Sales flow)

1. Post-Sales staff logs into `postsales-dashboard.html`
2. Finds the converted demo booking
3. Clicks "Onboard Student" → fills name, email, password, grade, age, credits, course
4. Calls `POST /api/users` with `role: 'student'`
5. Backend creates `users` record + `student_profiles` record
6. Sends onboarding email with login credentials
7. Student can immediately log in and see their clean dashboard

---

## Demo Login

For demos and testing:
- **Email:** `demo.student@stemnestacademy.co.uk`
- **Password:** `StemNest2026!`
- **URL:** https://stemnestacademy.co.uk/pages/login.html (select "I'm a Student")
