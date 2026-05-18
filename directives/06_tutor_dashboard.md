# Directive: Tutor Dashboard

## Files
- `frontend/pages/tutor-dashboard.html`
- `frontend/js/dashboard.js` — profile, calendar, bookings load
- `frontend/js/tutor-sessions.js` — session lifecycle (join, end, absent)
- `frontend/js/tutor-sessions-v2.js` — end-class modal, earnings, paysheet
- `frontend/js/tutor-companion.js` — companion materials tab
- `frontend/js/course-scheduler.js` — course scheduling

## Status: ✅ COMPLETE — API-driven

---

## Init Flow

```js
document.addEventListener('DOMContentLoaded', () => {
  TUTOR = getLoggedInTutor();   // reads from sn_current_tutor localStorage
  setGreeting();
  renderSidebarProfile();
  _loadTutorFromAPI().then(() => {
    buildCalStrip();
    checkAssignedClasses();
    showDashTab('overview');
  });
});
```

`_loadTutorFromAPI()` does three things:
1. `GET /api/auth/me` → gets user id
2. `GET /api/users/:id` → gets full tutor profile (subject, courses, grade groups)
3. `GET /api/bookings?limit=500` → gets all bookings assigned to this tutor
4. Updates `sn_current_tutor` in localStorage with fresh data

---

## TUTOR Object

```js
TUTOR = {
  id:           "CT004",          // staff_id — used for display and matching
  dbId:         "4ffc95d4-...",   // UUID — used for API calls
  name:         "Diala Gideon",
  initials:     "DG",
  email:        "gideondiala1@gmail.com",
  subject:      "Coding",
  courses:      ["Python for Beginners", ...],
  gradeGroups:  ["Year 7-9", ...],
  availability: "Flexible",
  photo:        null
}
```

---

## Booking Matching

Bookings are matched to the tutor using both staff_id and UUID:
```js
(myStaffId && bid === myStaffId) ||
(myDbId    && bid === myDbId)    ||
(myStaffId && b.tutor_staff_id === myStaffId) ||
(myDbId    && b.tutor_id === myDbId)
```

This handles both old bookings (matched by staff_id) and new bookings (matched by UUID).

---

## Calendar

The weekly calendar (`renderWeeklyCalendar()`) shows:
- **Green blocks:** Tutor's availability slots (set by clicking)
- **Blue/orange blocks:** Booked sessions
- **Grey:** Past slots

**Time parsing:** DB returns `"14:00:00"` — `parseBookingTime()` strips seconds:
```js
const stripped = timeStr.replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
```

Availability is stored in localStorage per tutor: `sn_tutor_avail_<staffId>`.

---

## Session Lifecycle

### Join Class
```js
teacherJoinClass(bookingId, classLink)
```
- Adds bookingId to `joinedSessions` Set (in-memory)
- Opens class link in new tab
- If no class link: shows warning toast but still marks as joined
- Immediately re-renders to enable "End Class" button

### End Class
- Teacher clicks "🔴 End Demo" or "🔴 End Class"
- Modal: select outcome, enter notes/recording link
- Submits to `POST /api/sync/class-reports` or `POST /api/bookings/:id/report`
- Booking status updated, credits deducted, earnings updated

### Auto-Absent
- If teacher doesn't join within 15 minutes of class start time
- Booking marked `teacher_absent`
- Operations dashboard notified

---

## `_getLocalStr` / `_setLocalStr` — Critical Fix

Both `tutor-sessions.js` and `tutor-sessions-v2.js` have helper functions that bridge the old localStorage pattern with the new API pattern. These had a **recursive infinite loop bug** that was fixed:

```js
// CORRECT (fixed version)
function _getLocalStr(key) {
  if (key === 'sn_access_token')      return localStorage.getItem('sn_access_token');
  if (key === 'sn_logged_in_teacher') return localStorage.getItem('sn_logged_in_teacher');
  if (key === 'sn_current_tutor')     return localStorage.getItem('sn_current_tutor');
  let d = _getGlobalData()[key];
  // ...
}
```

**Never revert to the old version** that called `return _getLocalStr(key)` recursively.

---

## Tabs

| Tab       | Content                                          |
|-----------|--------------------------------------------------|
| Overview  | Upcoming sessions (next 4), assigned class banner |
| Sessions  | Full session list with Join + End Class buttons  |
| Projects  | Student project submissions to review            |
| Calendar  | Weekly availability + booked sessions grid       |

---

## Creating a New Teacher (Admin flow)

1. Admin logs into `admin-dashboard.html`
2. Goes to "Add Teacher" tab
3. Fills form: name, email, password, subject, courses, grade groups, availability, DBS
4. Clicks "Create Teacher Account"
5. Calls `POST /api/users` with `role: 'tutor'`
6. Backend creates `users` + `tutor_profiles` records
7. Staff ID auto-generated (CT001, CT002, etc.) — auto-increments if taken
8. Welcome email sent to teacher
9. Teacher can log in immediately with a clean dashboard
