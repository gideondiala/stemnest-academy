# Directive: Authentication

## Status: ✅ COMPLETE — JWT auth fully implemented

---

## How Login Works

1. User visits `https://stemnestacademy.co.uk/pages/login.html`
2. Selects role tab: "I'm a Tutor" (for all staff) or "I'm a Student"
3. Enters email + password → `handleLogin()` in `login.js`
4. Calls `Auth.login(email, password)` from `api.js`
5. API returns `{ accessToken, refreshToken, user: { id, name, email, role, staffId } }`
6. Tokens stored in localStorage: `sn_access_token`, `sn_refresh_token`
7. Role-specific data stored:
   - Tutor: `sn_logged_in_teacher` (staff_id), `sn_current_tutor` (full profile JSON)
   - Student: `sn_logged_in_student` (email)
8. Redirected to the correct dashboard by role

---

## Role → Dashboard Routing

| Role         | Dashboard URL                          |
|--------------|----------------------------------------|
| `tutor`      | `/pages/tutor-dashboard.html`          |
| `student`    | `/pages/student-dashboard.html`        |
| `sales`      | `/pages/sales-dashboard.html`          |
| `presales`   | `/pages/presales-dashboard.html`       |
| `postsales`  | `/pages/postsales-dashboard.html`      |
| `operations` | `/pages/operations-dashboard.html`     |
| `hr`         | `/pages/hr-dashboard.html`             |
| `admin`      | `/pages/admin-dashboard.html`          |
| `super_admin`| `/pages/super-admin.html`              |

---

## Token Lifecycle

| Token         | Expiry  | Storage key          | Purpose                    |
|---------------|---------|----------------------|----------------------------|
| Access token  | 7 days  | `sn_access_token`    | Sent with every API request |
| Refresh token | 30 days | `sn_refresh_token`   | Used to get new access token |

When the access token expires, `apiCall()` in `api.js` automatically calls `POST /api/auth/refresh` and retries the original request.

---

## JWT Payload

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "tutor",
  "staffId": "CT004",
  "iat": 1234567890,
  "exp": 1234567890
}
```

---

## Middleware

```js
// backend/src/middleware/auth.js
requireAuth      // Verifies JWT, attaches req.user
requireRole(...) // Checks req.user.role against allowed roles
```

Usage:
```js
router.get('/admin-only', requireAuth, requireRole('admin', 'super_admin'), handler);
router.get('/staff',      requireAuth, requireRole('admin', 'super_admin', 'presales', 'postsales'), handler);
```

---

## `sn_current_tutor` — Critical for Tutor Dashboard

When a tutor logs in, `login.js` stores their full profile:
```js
localStorage.setItem('sn_current_tutor', JSON.stringify({
  id:      user.staffId,   // e.g. "CT004"
  dbId:    user.id,        // UUID
  name:    user.name,
  email:   user.email,
  role:    'tutor',
  initials: ...,
}));
```

`dashboard.js` reads this on load via `getLoggedInTutor()`. Then `_loadTutorFromAPI()` fetches the full profile from `GET /api/auth/me` + `GET /api/users/:id` and updates `sn_current_tutor` with subject, courses, grade groups, etc.

**Never read from `sn_teachers` localStorage** — that key is dead and must not be used.

---

## Password Reset Flow

1. User clicks "Forgot Password" on login page
2. Enters email → `POST /api/auth/forgot-password`
3. Backend generates a secure token, stores hash in `password_reset_tokens` table
4. Sends email with reset link: `https://stemnestacademy.co.uk/pages/login.html?reset=<token>`
5. User clicks link → frontend detects `?reset=` param → shows reset form
6. User enters new password → `POST /api/auth/reset-password` with `{ token, password }`
7. Backend verifies token, updates password, revokes all refresh tokens (forces re-login everywhere)

---

## Security Notes

- Passwords hashed with bcrypt (12 rounds) — never stored in plaintext
- `POST /api/users` requires `requireAuth` — only logged-in staff can create accounts
- Rate limiting on auth routes: 10 attempts per 15 minutes per IP
- Refresh tokens stored as SHA-256 hashes in the DB — raw token never stored
- `POST /api/bookings` (demo booking) is public — no auth needed (students book without accounts)
- `PUT /api/bookings/:id/cancel` and `POST /api/bookings/:id/reschedule` are public — booking UUID acts as auth
