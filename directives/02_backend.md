# Directive: Backend API

## Location
`backend/`

## Stack
- Runtime: Node.js v18+
- Framework: Express
- Database: PostgreSQL (AWS RDS) via `pg` pool
- Auth: JWT (jsonwebtoken) + bcrypt (12 rounds)
- Validation: Zod
- Email: Zoho SMTP via Nodemailer
- Process manager: PM2 (cluster mode, 2 instances)

## Server
- IP: `13.40.64.172`
- SSH: `ssh -i C:\Users\hp\stemnest-key.pem ubuntu@13.40.64.172`
- App path: `/home/ubuntu/stemnest-academy/backend`
- Logs: `/home/ubuntu/stemnest-academy/backend/logs/`
- Reload: `pm2 reload stemnest-api --update-env`

---

## File Structure

```
backend/src/
├── index.js              ← Express app entry point, route mounting
├── config/
│   └── db.js             ← PostgreSQL pool (uses DATABASE_URL from .env)
├── middleware/
│   ├── auth.js           ← requireAuth, requireRole middleware
│   └── errorHandler.js   ← Global error handler → { success: false, error: "..." }
├── routes/
│   ├── auth.js           ← /api/auth/* (login, logout, refresh, me, forgot/reset password)
│   ├── users.js          ← /api/users (create, list, get, update, delete)
│   ├── bookings.js       ← /api/bookings (CRUD, assign, report, cancel, reschedule, lookup)
│   ├── courses.js        ← /api/courses (CRUD)
│   ├── sessions.js       ← /api/sessions (tutor upcoming sessions)
│   ├── sync.js           ← /api/sync/dashboard/:role (bulk data for each dashboard)
│   ├── payments.js       ← /api/payments (Stripe webhooks, payment links)
│   ├── projects.js       ← /api/projects (student project submissions)
│   ├── blogs.js          ← /api/blogs (CRUD, public read)
│   ├── applications.js   ← /api/applications (HR job applications)
│   └── sync.js           ← /api/sync/* (class reports, pipeline, credits, dashboard data)
├── services/
│   ├── emailService.js   ← sendWelcomeEmail, sendOnboardingEmail, sendPasswordResetEmail
│   ├── notificationService.js ← notifyDemoConfirmed, notifyClassAssigned, notifyLowCredits
│   └── whatsappService.js ← WhatsApp message helpers
└── utils/
    └── logger.js         ← Winston logger
```

---

## Environment Variables (backend/.env)

```
DATABASE_URL=postgresql://stemnest_user:...@stemnest-db...rds.amazonaws.com:5432/stemnest
JWT_SECRET=...
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
APP_URL=https://stemnestacademy.co.uk
PORT=3000
NODE_ENV=production
EMAIL_HOST=smtp.zoho.com
EMAIL_PORT=465
EMAIL_USER=support@stemnestacademy.co.uk
EMAIL_PASS=...
```

---

## API Endpoints Reference

### Auth — `/api/auth`
| Method | Path                    | Auth | Description                        |
|--------|-------------------------|------|------------------------------------|
| POST   | /login                  | No   | Login → returns accessToken + refreshToken |
| POST   | /logout                 | Yes  | Revoke refresh token               |
| POST   | /refresh                | No   | Rotate tokens using refreshToken   |
| GET    | /me                     | Yes  | Get current user profile           |
| POST   | /forgot-password        | No   | Send reset email                   |
| POST   | /reset-password         | No   | Reset password with token          |

### Users — `/api/users`
| Method | Path                    | Auth         | Description                        |
|--------|-------------------------|--------------|------------------------------------|
| GET    | /                       | Yes (staff)  | List users by role (admin gets all, presales/postsales get tutors/sales only) |
| POST   | /                       | Yes (any staff) | Create user (student/tutor/staff) |
| GET    | /:id                    | Yes          | Get user profile + tutor/student profile |
| PUT    | /:id                    | Yes          | Update profile                     |
| PUT    | /:id/password           | Yes (own)    | Change password                    |
| DELETE | /:id                    | Yes (admin)  | Soft-delete (sets is_active=false) |
| GET    | /me/notifications       | Yes          | Get notifications                  |
| PUT    | /me/notifications/:id/read | Yes       | Mark notification read             |

**Important:** `POST /api/users` auto-increments `staff_id` if the requested one is already taken. E.g. if CT001 exists, it creates CT002 automatically.

### Bookings — `/api/bookings`
| Method | Path                    | Auth         | Description                        |
|--------|-------------------------|--------------|------------------------------------|
| GET    | /lookup                 | No (public)  | Find booking by email or phone     |
| GET    | /                       | Yes          | List bookings (filtered by role)   |
| POST   | /                       | No (public)  | Create demo booking (free trial form) |
| GET    | /:id                    | Yes          | Get single booking                 |
| PUT    | /:id/assign             | Yes (presales/admin) | Assign tutor + sales, set date/time/link |
| PUT    | /:id/status             | Yes (admin/tutor) | Update booking status          |
| POST   | /:id/report             | Yes (tutor)  | Submit end-of-class report         |
| PUT    | /:id/cancel             | No (public)  | Cancel booking (UUID is auth)      |
| POST   | /:id/reschedule         | No (public)  | Request reschedule                 |

**Role-based filtering on GET /api/bookings:**
- `tutor` → only their assigned bookings
- `student` → only their bookings
- `sales` → only their sales bookings
- `presales`, `admin`, `super_admin` → all bookings

### Sync — `/api/sync/dashboard/:role`
Returns all data needed for a dashboard in one call. Roles: `presales`, `postsales`, `sales`, `operations`, `hr`, `admin`, `student`.

| Role       | Returns                                                    |
|------------|------------------------------------------------------------|
| presales   | All demo bookings                                          |
| postsales  | Payments + all students                                    |
| sales      | Pipeline + scheduled bookings for this sales person        |
| operations | Late joins + class reports + absent teachers               |
| hr         | Applications + interviews + trainings + job adverts        |
| admin      | Bookings + class reports + pipeline + courses + tutors + sales |
| student    | Own bookings + payments + enrolled courses + projects      |

### Courses — `/api/courses`
| Method | Path   | Auth         | Description        |
|--------|--------|--------------|--------------------|
| GET    | /      | No           | List all courses   |
| POST   | /      | Yes (admin)  | Create course      |
| PUT    | /:id   | Yes (admin)  | Update course      |
| DELETE | /:id   | Yes (admin)  | Delete course      |

### Blogs — `/api/blogs`
| Method | Path      | Auth         | Description              |
|--------|-----------|--------------|--------------------------|
| GET    | /         | No           | List published posts     |
| GET    | /:slug    | No           | Get post by slug         |
| POST   | /         | Yes (admin)  | Create post              |
| PUT    | /:id      | Yes (admin)  | Update post              |
| DELETE | /:id      | Yes (admin)  | Delete post              |

---

## Database Schema Key Tables

```sql
users              -- All roles in one table (role column)
tutor_profiles     -- Extends users for tutors (subject, courses, availability)
student_profiles   -- Extends users for students (grade, age, credits)
bookings           -- All class bookings (demo + paid)
courses            -- Course catalogue
enrolments         -- Student enrolled in a course (note: British spelling)
lessons            -- Lessons within a course
projects           -- Student project submissions
payments           -- Payment records
pipeline           -- Sales pipeline records
class_reports      -- Tutor end-of-class reports
notifications      -- In-app notifications
refresh_tokens     -- JWT refresh token store
blog_posts         -- Blog content
applications       -- HR job applications
interviews         -- HR interview records
trainings          -- HR training records
job_adverts        -- HR job postings
late_joins         -- Operations late join log
credit_transactions -- Student credit audit trail
```

**Critical:** The courses-students join table is `enrolments` (British spelling), NOT `enrollments`. This has caused bugs before.

---

## Auth Middleware

```js
// Protect a route — requires valid JWT
router.get('/protected', requireAuth, handler);

// Protect a route — requires specific role(s)
router.post('/admin-only', requireAuth, requireRole('admin', 'super_admin'), handler);
```

`requireAuth` attaches `req.user = { id, email, role, staffId }` from the JWT payload.

---

## Error Response Format

All errors return:
```json
{ "success": false, "error": "Human-readable message" }
```

HTTP status codes:
- 400 — Bad request / validation error
- 401 — Not authenticated
- 403 — Authenticated but not authorised
- 404 — Not found
- 409 — Conflict (duplicate email, duplicate staff_id)
- 500 — Internal server error (should never reach client in production)

---

## Staff ID Auto-Increment

When creating a user with a `staff_id` that already exists, the backend automatically finds the next available ID:
- CT001 taken → tries CT002, CT003, etc.
- Works for all prefixes: CT (Coding Tutor), MT (Maths Tutor), ST (Sciences Tutor), S- (Student), SP (Sales Person)

---

## Known Issues / Watch Out For

1. **`enrollments` vs `enrolments`** — The DB table is `enrolments` (British). Always use this spelling in SQL queries.
2. **Time format from DB** — PostgreSQL returns time as `"14:00:00"` (with seconds). Frontend must strip seconds: `time.replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1')`.
3. **UUID vs staff_id** — The assign endpoint accepts UUID for tutorId. Never pass staff_id (e.g. CT004) directly to endpoints that expect UUID.
4. **companion_materials table** — Does not exist in the DB. The admin sync query was updated to return `materials: []` safely.
