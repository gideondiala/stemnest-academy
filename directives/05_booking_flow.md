# Directive: Booking Flow — End to End

## Status: ✅ COMPLETE — fully real-time, two-step form

This document describes the complete lifecycle of a booking from a parent booking a free trial to the student being onboarded.

---

## Step 1: Parent Books a Free Trial — TWO-STEP FORM

**Page:** `https://stemnestacademy.co.uk/pages/free-trial.html`

### Step 1 of 2 — Quick Start (3 fields)
Parent fills in:
- Student Name
- Grade (1–12)
- Country (auto-fills calling code + timezone)
- WhatsApp number (with country code prefix)

On clicking **Next**:
- Calls `POST /api/bookings/partial` (public, no auth)
- Creates a booking with `status: 'pending'`, `is_demo: true`, `notes.partial: true`
- Returns `bookingId` stored in browser memory as `_partialBookingId`
- Booking appears **immediately** in Presales Incoming tab (partial fields blank)
- Presales can see and call the parent even if Step 2 is never completed

### Step 2 of 2 — Complete Booking
Parent fills in:
- Email (required)
- Preferred date + time (required)
- Device — Laptop or Desktop (required)
- Parent name (optional)

On clicking **Book My FREE Demo Class**:
- If `_partialBookingId` exists: calls `PUT /api/bookings/:id/complete`
- If partial save had failed: falls back to `POST /api/bookings` (full submission)
- WAT conversion runs on the backend
- Parent receives confirmation email
- Operations team notified
- Booking fully visible in Presales with all details

### Partial Booking Display in Presales
- Partial bookings appear in Incoming with blank email/date/time fields
- Each booking row has an **✏️ Edit Details** button
- Clicking opens a modal to fill any missing fields
- Calls `PUT /api/bookings/:id/edit-fields` (presales auth required)

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
    "tutorId": "<UUID>",
    "classLink": "https://meet.google.com/...",
    "date": "2026-05-20",
    "time": "14:00"
  }
  ```
- Backend updates booking: `status → 'scheduled'`, sets `tutor_id`, `class_link`, `date`, `time`
- Booking moves from "Incoming" to "Scheduled" tab
- Tutor receives email notification
- Parent receives congratulatory email with join link

**Critical:** The `tutorId` sent to the assign endpoint must be the tutor's **UUID** (from `u.id`), not their staff_id (CT004).

---

## Step 3: Teacher Sees the Booking

**Dashboard:** `https://stemnestacademy.co.uk/pages/tutor-dashboard.html`

- Teacher logs in → `_loadTutorFromAPI()` fetches `GET /api/bookings?limit=500`
- Bookings filtered by `tutor_id` on the backend (role-based)
- Booking appears in:
  - **Overview tab:** "Upcoming Sessions" cards with Join button
  - **Sessions tab:** Full session list
  - **Calendar tab:** Coloured block at the correct date/time slot

---

## Step 4: Student Finds Their Class

**Page:** `https://stemnestacademy.co.uk/pages/join-class.html`

- Student/parent enters email or WhatsApp number
- Calls `GET /api/bookings/lookup?q=<email or phone>` (public endpoint)
- If booking has `class_link` and `status === 'scheduled'` → shows "Join Class Now" button

---

## Step 5–8: Teacher Class, Sales Pitch, Onboarding

See previous stages — unchanged from original flow.

---

## Booking Status Flow

```
pending (partial) → pending (complete) → scheduled → completed
                                                   ↘ incomplete
                                                   ↘ teacher_absent
                                      ↘ cancelled
```

---

## Key API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/bookings/partial` | None | Save Step 1 immediately |
| PUT | `/api/bookings/:id/complete` | None | Append Step 2 data |
| PUT | `/api/bookings/:id/edit-fields` | Presales | Edit any field manually |
| PUT | `/api/bookings/:id/assign` | Presales | Assign teacher + schedule |
| POST | `/api/bookings/:id/report` | Tutor | End-of-class report |

---

## Key Constraints

- A booking's `tutorId` in the assign call must be a **UUID**
- `salesId` is optional in the assign call
- The `notes` column stores a JSON object with all student contact info
- `notes.partial: true` flags Step 1-only bookings for presales visibility
- WAT conversion uses the noon-UTC reference method (stable across all timezones including India UTC+5:30 and Australia UTC+10)

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
