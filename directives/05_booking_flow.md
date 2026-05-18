# Directive: Booking Flow — End to End

## Status: ✅ COMPLETE — fully real-time

This document describes the complete lifecycle of a booking from a parent booking a free trial to the student being onboarded.

---

## Step 1: Parent Books a Free Trial

**Page:** `https://stemnestacademy.co.uk/pages/free-trial.html`

- Parent fills in: student name, age, year group, subject, preferred date/time, email, WhatsApp, device
- Form submits to `POST /api/bookings` (no auth required)
- Backend saves to `bookings` table with `status: 'pending'`, `is_demo: true`
- Student info stored in `notes` JSON column (no student account yet)
- Confirmation email sent to parent via `notifyDemoConfirmed()`
- Booking appears immediately in Pre-Sales dashboard

---

## Step 2: Pre-Sales Schedules the Demo

**Dashboard:** `https://stemnestacademy.co.uk/pages/presales-dashboard.html`
**Login:** `presales@stemnestacademy.co.uk` / `StemNest2024!`

- Pre-Sales sees booking in "Incoming" tab
- Clicks "Schedule Class" → modal opens
- Selects teacher (dropdown populated from `GET /api/users?role=tutor`)
- Sets date, time, Google Meet link
- Clicks "Confirm & Schedule"
- Calls `PUT /api/bookings/:id/assign` with:
  ```json
  {
    "tutorId": "<UUID>",      ← Must be UUID, NOT staff_id
    "classLink": "https://meet.google.com/...",
    "date": "2026-05-20",
    "time": "14:00"
  }
  ```
- Backend updates booking: `status → 'scheduled'`, sets `tutor_id`, `class_link`, `date`, `time`
- Booking moves from "Incoming" to "Scheduled" tab
- Tutor receives email notification

**Critical:** The `tutorId` sent to the assign endpoint must be the tutor's **UUID** (from `u.id`), not their staff_id (CT004). The presales dashboard stores `{ id: u.id, staffId: u.staff_id }` and uses `t.id` (UUID) in the dropdown value.

---

## Step 3: Teacher Sees the Booking

**Dashboard:** `https://stemnestacademy.co.uk/pages/tutor-dashboard.html`

- Teacher logs in → `_loadTutorFromAPI()` fetches `GET /api/bookings?limit=500`
- Bookings filtered by `tutor_id` on the backend (role-based)
- Booking appears in:
  - **Overview tab:** "Upcoming Sessions" cards with Join button
  - **Sessions tab:** Full session list
  - **Calendar tab:** Coloured block at the correct date/time slot

**Time display:** DB returns `"14:00:00"` — frontend strips seconds to `"14:00"` before display.

**Booking matching:** The tutor dashboard matches bookings by both `staff_id` AND `UUID`:
```js
(myStaffId && bid === myStaffId) ||
(myDbId    && bid === myDbId)    ||
(myStaffId && b.tutor_staff_id === myStaffId) ||
(myDbId    && b.tutor_id === myDbId)
```

---

## Step 4: Student Finds Their Class

**Page:** `https://stemnestacademy.co.uk/pages/join-class.html`

- Student/parent enters email or WhatsApp number
- Calls `GET /api/bookings/lookup?q=<email or phone>` (public endpoint)
- Backend searches `notes` JSON column for matching email/phone
- Returns matching bookings
- If booking has `class_link` and `status === 'scheduled'` → shows "Join Class Now" button
- If not yet scheduled → shows "Your class is being scheduled" message

---

## Step 5: Teacher Runs the Class

1. Teacher clicks "🚀 Join" on their dashboard → opens class link in new tab
2. `teacherJoinClass(bookingId, classLink)` is called
3. Session marked as joined in `joinedSessions` Set (in-memory)
4. "End Class" button becomes active immediately
5. Auto-absent watcher starts: if teacher doesn't join within 15 mins of class time, booking is marked `teacher_absent`

---

## Step 6: Teacher Ends the Class

1. Teacher clicks "🔴 End Demo" or "🔴 End Class"
2. Modal opens: select outcome (completed / incomplete / partially completed)
3. For incomplete: enter reason
4. For completed: enter recording link (optional), pay amount
5. Submits → `POST /api/sync/class-reports` or `POST /api/bookings/:id/report`
6. Booking status updated in DB
7. Student credit deducted (if paid class)
8. Tutor earnings updated

---

## Step 7: Sales Pitches the Student

**Dashboard:** `https://stemnestacademy.co.uk/pages/sales-dashboard.html`

- Sales person assigned to the booking sees it in their pipeline
- Logs pitch outcome, interest level, purchasing power
- Saves to `pipeline` table via `POST /api/sync/pipeline`

---

## Step 8: Post-Sales Onboards the Student

**Dashboard:** `https://stemnestacademy.co.uk/pages/postsales-dashboard.html`
**Login:** `postsales@stemnestacademy.co.uk` / `StemNest2024!`

1. Post-Sales sees converted student in pipeline
2. Clicks "Onboard Student" → fills form
3. Calls `POST /api/users` with `role: 'student'`
4. Backend creates `users` + `student_profiles` records
5. Sends onboarding email with login credentials
6. Student can log in immediately

---

## Booking Status Flow

```
pending → scheduled → completed
                   ↘ incomplete
                   ↘ teacher_absent
         ↘ cancelled
```

---

## Key Constraints

- A booking's `tutorId` in the assign call must be a **UUID** — the backend also accepts staff_id as a fallback but UUID is preferred
- `salesId` is optional in the assign call — if no sales users exist, omit it
- The `notes` column stores a JSON object with student contact info for demo bookings (since demo students don't have accounts yet)
