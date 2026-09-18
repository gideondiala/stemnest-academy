# StemNest Academy — Task Plan (from Task.txt)
## Authored by: Kiro | Date: April 2026

---

## OVERVIEW
This document breaks down every feature described in Task.txt into discrete, ordered implementation tasks. Each section maps to a specific dashboard or system. Work proceeds top-down.

---

## FEATURE GROUP 1 — DEMO CLASS LIFECYCLE (Teacher + Pre-Sales + Sales)

### 1A. Teacher Dashboard — Join Class + End Demo Controls
- [ ] Demo class slot on calendar shows **Join Class** button
- [ ] **End Demo** button is DISABLED until 15 mins after class start time
- [ ] If teacher has NOT clicked Join Class within 15 mins of start → system auto-marks session as **Absent** and sends details to Operations dashboard (new "No-Show" section)
- [ ] End Demo dialog: "Demo Completed?" or "Incomplete?"
  - **Incomplete** → teacher enters reason → student returns to Pre-Sales dashboard under new **Incomplete Demos** sidebar section
  - **Completed** → teacher enters recording link → lead goes to Sales dashboard

### 1B. Teacher Dashboard — End Class for Paid Students
- [ ] Same 15-min rule applies to paid class End Class button
- [ ] Auto-absent logic same as demo
- [ ] Teacher submits recording link on class completion

### 1C. Pre-Sales Dashboard — New Sections
- [ ] **Incomplete Demos** section (left sidebar) — shows students whose demo was marked incomplete, with teacher's reason appended
- [ ] **Rebook Demo** button on each incomplete demo record
- [ ] **Cancelled Classes** section — shows student-cancelled demos with reason
- [ ] **Reschedule Requests** section — shows student reschedule requests with preferred date/time
- [ ] All sections sortable by date, searchable by name or email

### 1D. Sales Dashboard — Lead Management After Demo
- [ ] Completed demos flow into Sales dashboard as leads
- [ ] Lead status options: **Paid | Parent Promising | Low Interest | Lost**
- [ ] Each lead shows: student name, subject, demo date, **Lead Owner** (sales person or teacher who ran the demo)
- [ ] Status update saves and reflects across dashboards

---

## FEATURE GROUP 2 — DEMO STUDENT SELF-SERVICE (Student Dashboard)

### 2A. Cancel Class
- [ ] "Cancel Class" button on student dashboard overview
- [ ] Triple-confirmation dialog (3 steps: "Are you sure?" → "Really sure?" → "Final confirmation")
- [ ] Student enters cancellation reason
- [ ] Cancellation appears in Pre-Sales **Cancelled Classes** section

### 2B. Reschedule Class
- [ ] "Reschedule" button on student dashboard
- [ ] Prompts student to pick preferred date + time
- [ ] Request appears in Pre-Sales **Reschedule Requests** section with student details + preferred slot

---

## FEATURE GROUP 3 — PAYMENT & CREDIT SYSTEM (Post-Sales)

### 3A. Converted Student Flow
- [ ] When sales/teacher marks a student as converted → student details auto-sent to Post-Sales dashboard
- [ ] Post-Sales **Paid Students** section shows: student name, amount paid, credits, course, sales person

### 3B. Student Onboarding (Post-Sales)
- [ ] "Onboard Student" button on each paid student record
- [ ] Confirmation dialog: verify name, email, phone, age, course, credits
- [ ] On confirm → student dashboard is created (localStorage entry with login credentials)
- [ ] System generates a **text file** with: username, password, phone, short login guide
- [ ] Simulated email send of login details to parent

### 3C. Forgot Password
- [ ] "Forgot Password?" link on login page
- [ ] Student/teacher enters registered email
- [ ] System finds the account, simulates sending a reset email with new temp password
- [ ] User can then log in and change password

---

## FEATURE GROUP 4 — SUPER ADMIN PASSWORD CHART

- [ ] Super Admin dashboard → new **User Credentials** tab (strictly founder-only)
- [ ] Table showing ALL platform users: name, role, email, current password
- [ ] Updates in real-time whenever any user changes their password
- [ ] Clearly marked as confidential, not accessible from any other role

---

## FEATURE GROUP 5 — CHAT SYSTEM IMPROVEMENTS

- [ ] Chat messages show clear **sent / delivered / read** indicators
- [ ] Teacher side shows student name clearly on each message
- [ ] Chat icon in sidebar shows **unread message count badge**
- [ ] Messages visually distinct: student messages right-aligned (blue), teacher messages left-aligned (grey)
- [ ] Timestamp on every message

---

## FEATURE GROUP 6 — MAILING SYSTEM

### 6A. Transactional Emails (Simulated — ready for real SMTP later)
- [ ] Demo booked → email to teacher (student details, time, brief note)
- [ ] Demo cancelled → email to teacher
- [ ] Student onboarded → login details email to parent
- [ ] All emails logged in a `sn_email_log` localStorage store for admin review

### 6B. Bulk Email System (Admin / Operations / Founders)
- [ ] New **Bulk Email** section in Admin and Super Admin dashboards
- [ ] Recipient filter options:
  - All Staff
  - All Coding Teachers
  - All Maths Teachers
  - All Sciences Teachers
  - All Students
  - All Coding Students
  - All Maths Students
  - All Sciences Students
  - Students by Country (Nigeria, UK, Ghana, UAE, etc.)
- [ ] Compose: Subject + Body (rich text area)
- [ ] Send button → logs email to `sn_email_log`, shows preview of recipients
- [ ] Email log viewable by Admin and Founders

---

## FEATURE GROUP 7 — OPERATIONS DASHBOARD — ABSENT TEACHERS

- [ ] New **No-Show / Absent** section in Operations dashboard
- [ ] Auto-populated when teacher misses 15-min join window
- [ ] Shows: teacher name, ID, student name, class date/time, subject
- [ ] Exportable to CSV

---

## FEATURE GROUP 8 — CALENDAR IMPROVEMENTS (Already partially done)

- [ ] Demo class slots: **orange** border/background
- [ ] Paid class slots: **blue** border/background
- [ ] Clicking a booked slot shows student details + Join Class button
- [ ] Slot appears on teacher calendar immediately when booked by Pre-Sales or Post-Sales

---

## IMPLEMENTATION ORDER

| Priority | Feature | Estimated Complexity |
|---|---|---|
| 1 | Teacher End Demo / End Class 15-min rule + auto-absent | Medium |
| 2 | Pre-Sales new sections (Incomplete, Cancelled, Reschedule) | Medium |
| 3 | Sales lead status management | Low |
| 4 | Student cancel/reschedule flow | Medium |
| 5 | Post-Sales student onboarding + credential file | Medium |
| 6 | Forgot password | Low |
| 7 | Super Admin credentials chart | Low |
| 8 | Chat improvements | Low |
| 9 | Mailing system (transactional + bulk) | High |
| 10 | Operations absent section | Low |

---

## NOTES
- All data remains in localStorage until backend is connected
- Every new localStorage key follows the `sn_` prefix convention
- Forward compatibility: all data structures use flexible objects (no rigid schemas) so fields can be added without breaking existing records
- No data is ever deleted — cancelled/incomplete records are flagged, not removed
- All simulated emails are logged to `sn_email_log` for future real SMTP wiring
