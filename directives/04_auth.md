# Directive: Authentication

## Goal
Replace the simulated login in `frontend/js/login.js` with real JWT-based auth
backed by the Express API.

## Frontend changes (`frontend/js/login.js`)

### Current behaviour
`handleLogin()` fakes a 1.6s delay then redirects. No real API call.

### Target behaviour
```js
async function handleLogin() {
  // 1. Validate inputs (non-empty)
  // 2. POST to /api/auth/login with { email, password, role }
  // 3. On success: store JWT in localStorage, redirect by role
  // 4. On failure: show error toast, shake button
}
```

### Token storage
Store as `localStorage.setItem('sn_token', token)`.
Include on all subsequent API requests: `Authorization: Bearer <token>`.

### Redirect after login
- Tutor  → `pages/tutor-dashboard.html`
- Student → `pages/student-dashboard.html`

## Backend changes (`backend/src/routes/auth.js`)

### POST /api/auth/login
Input:  `{ email, password, role }`
Output: `{ success: true, token, user: { id, name, email, role } }`
Errors: 401 if credentials invalid, 400 if missing fields

### POST /api/auth/register
Input:  `{ name, email, password, role }`
Output: `{ success: true, token, user }`
Errors: 409 if email already exists

### GET /api/auth/me
Header: `Authorization: Bearer <token>`
Output: `{ success: true, user: { id, name, email, role } }`
Errors: 401 if token missing or invalid

## JWT middleware (`backend/src/middleware/auth.js`)
- Reads `Authorization` header
- Verifies token with `JWT_SECRET` from `.env`
- Attaches `req.user` for downstream handlers
- Returns 401 on failure

## Password rules
- Minimum 8 characters
- Hashed with bcrypt (salt rounds: 12)
- Never stored or logged in plaintext

## Edge cases
- Expired token → 401, frontend clears localStorage and redirects to login
- Wrong role (tutor token used on student route) → 403
- Rate limiting: max 10 login attempts per IP per 15 minutes (use `express-rate-limit`)
