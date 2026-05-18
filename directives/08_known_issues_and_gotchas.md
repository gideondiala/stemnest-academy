# Directive: Known Issues, Gotchas & Things That Will Break If You're Not Careful

Read this before making any changes. These are hard-won lessons.

---

## 1. `enrollments` vs `enrolments` (British spelling)

The database table is `enrolments` (British spelling). If you write `enrollments` in any SQL query, it will crash with `relation "enrollments" does not exist`.

**Always use:** `enrolments`, `enrolment_id`

---

## 2. Time Format from PostgreSQL

PostgreSQL returns time columns as `"14:00:00"` (with seconds). The frontend expects `"14:00"`.

**Always strip seconds when displaying time:**
```js
const time = rawTime.replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
```

This affects: tutor calendar, student lessons tab, presales dashboard, join-class page.

---

## 3. UUID vs staff_id in API Calls

The `PUT /api/bookings/:id/assign` endpoint requires `tutorId` to be a **UUID** (e.g. `4ffc95d4-3b38-435c-9d99-1e382e8efb30`), not a staff_id (e.g. `CT004`).

The presales dashboard stores teachers as `{ id: UUID, staffId: "CT004" }` and uses `t.id` (UUID) as the dropdown value.

**Never pass staff_id to endpoints that expect UUID.**

---

## 4. `companion_materials` Table Does Not Exist

The admin sync query originally tried to query `companion_materials` which doesn't exist in the DB. This was fixed by returning `materials: []` directly. Do not add this query back.

---

## 5. `sn_teachers` localStorage Key Is Dead

The old `sn_teachers` localStorage key was used to store a hardcoded list of teachers (Sarah Rahman, Marcus King, etc.). This has been completely removed. Any code that reads from `localStorage.getItem('sn_teachers')` will get `null` and break.

**Never read from `sn_teachers`.** Use `window.ADMIN_DATA.tutors`, `window.PS_DATA.teachers`, or `window.SA_DATA.tutors` instead.

---

## 6. `_getLocalStr` Recursive Bug (Fixed — Don't Revert)

`tutor-sessions.js` and `tutor-sessions-v2.js` had a recursive infinite loop:
```js
// OLD BROKEN CODE — DO NOT USE
function _getLocalStr(key) {
  if (key === 'sn_access_token' || key === 'sn_logged_in_teacher') return _getLocalStr(key); // ← infinite loop
```

This was fixed to:
```js
// CORRECT
function _getLocalStr(key) {
  if (key === 'sn_access_token')      return localStorage.getItem('sn_access_token');
  if (key === 'sn_logged_in_teacher') return localStorage.getItem('sn_logged_in_teacher');
  // ...
}
```

**Do not revert this.**

---

## 7. `seedRegistries()` Has Been Removed

The `login.js` function `seedRegistries()` used to seed hardcoded teachers/staff into localStorage on every login page load. It has been replaced with a no-op. Do not re-add the hardcoded data.

---

## 8. `POST /api/users` Requires Auth

`POST /api/users` has `requireAuth` middleware. Any unauthenticated request will get a 401. The postsales and admin dashboards send the Bearer token with this request.

---

## 9. Browser Cache vs Server Issues

When something "breaks" after a deployment, always check:
1. Hard refresh: `Ctrl+Shift+R`
2. Test in incognito window
3. Check the API directly (not the browser)

CloudFront caches JS files. After deploying, always run:
```bash
aws cloudfront create-invalidation --distribution-id E3TA4L9WKURJAP --paths "/*"
```

---

## 10. `salesId` Is Optional in Assign

The `PUT /api/bookings/:id/assign` endpoint has `salesId` as optional. If no sales users exist, omit it from the request body. The Zod schema accepts `z.string().optional()`.

---

## 11. Staff ID Auto-Increment

When creating a user with a `staff_id` that already exists, the backend auto-increments. But the frontend `nextTeacherId()` function also tries to generate the next ID. If the frontend generates CT001 but CT001 already exists in the DB, the backend will use CT002 instead. The response will contain the actual `staff_id` used — always read it from `data.user.staff_id`.

---

## 12. Presales Loads Bookings from Sync Endpoint

The presales dashboard uses `GET /api/sync/dashboard/presales` (not `GET /api/bookings`). This is intentional — the sync endpoint returns all demo bookings regardless of who is logged in, which is what presales needs.

---

## 13. Admin Password Was Reset

The admin account password was reset to `StemNest2024!` during debugging. The founder password is `Founder2024!`. These are in `TEST_CREDENTIALS.txt`.

---

## 14. Real Customer Bookings Exist

There are real bookings from real customers in the database (Irfaan Sanni, Emaan Sanni, Haneef Sanni from `olatundesanni@gmail.com`). Do not delete these. Do not run `DELETE FROM bookings` without a WHERE clause.

---

## 15. PM2 Cluster Mode

The backend runs as 2 PM2 instances (cluster mode). After any backend change:
```bash
pm2 reload stemnest-api --update-env
```
Both instances (id 0 and 1) must show `✓` for the reload to be complete.

---

## 16. Database SSL

The RDS database requires SSL. The backend `.env` has `DATABASE_URL` with `?sslmode=require`. When running Node scripts directly on the server, set `NODE_TLS_REJECT_UNAUTHORIZED=0` for testing only.

---

## 17. Syntax Check Before Every Deploy

Always run `node --check <file>` on every JS file you modify before deploying. A syntax error in a deployed file will silently break the entire page.

```bash
node --check frontend/js/presales-dashboard.js
node --check backend/src/routes/bookings.js
```

Exit code 0 = clean. Exit code 1 = syntax error.
