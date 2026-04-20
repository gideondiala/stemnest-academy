# Directive: Backend

## Location
`backend/`

## Stack
- Runtime: Node.js (v18+)
- Framework: Express
- Database: PostgreSQL via `pg` or Prisma ORM
- Auth: JWT (jsonwebtoken) + bcrypt for password hashing
- Validation: zod or express-validator
- Email: Resend or SendGrid
- Payments: Stripe

## Structure
```
backend/
├── src/
│   ├── index.js            ← Entry point — starts Express server
│   ├── config/
│   │   └── db.js           ← Database connection
│   ├── routes/
│   │   ├── auth.js         ← POST /api/auth/login, /register, /logout
│   │   ├── courses.js      ← GET/POST/PUT/DELETE /api/courses
│   │   ├── sessions.js     ← GET/POST /api/sessions
│   │   ├── users.js        ← GET/PUT /api/users/:id
│   │   └── projects.js     ← GET/POST/PUT /api/projects
│   ├── middleware/
│   │   ├── auth.js         ← JWT verification middleware
│   │   └── errorHandler.js ← Global error handler
│   └── models/             ← DB schema / Prisma models (when added)
├── package.json
├── .env                    ← (symlink or copy from root — never commit)
└── README.md
```

## API endpoints (planned)

### Auth
| Method | Endpoint              | Description              |
|--------|-----------------------|--------------------------|
| POST   | /api/auth/login       | Login (tutor or student) |
| POST   | /api/auth/register    | Register new user        |
| POST   | /api/auth/logout      | Invalidate token         |
| GET    | /api/auth/me          | Get current user         |

### Courses
| Method | Endpoint              | Description              |
|--------|-----------------------|--------------------------|
| GET    | /api/courses          | List all courses         |
| GET    | /api/courses/:id      | Get single course        |
| POST   | /api/courses          | Create course (admin)    |
| PUT    | /api/courses/:id      | Update course (admin)    |
| DELETE | /api/courses/:id      | Delete course (admin)    |

### Sessions
| Method | Endpoint              | Description              |
|--------|-----------------------|--------------------------|
| GET    | /api/sessions         | List sessions for user   |
| POST   | /api/sessions         | Schedule a session       |

### Users
| Method | Endpoint              | Description              |
|--------|-----------------------|--------------------------|
| GET    | /api/users/:id        | Get user profile         |
| PUT    | /api/users/:id        | Update user profile      |

## Auth flow
1. Client POSTs email + password + role to `/api/auth/login`
2. Server verifies credentials, returns signed JWT
3. Client stores JWT in `localStorage` (or httpOnly cookie — preferred)
4. All protected routes check JWT via `middleware/auth.js`
5. On logout, client clears token (server-side blacklist optional)

## CORS
Allow requests from `FRONTEND_URL` (set in `.env`).
In development: `http://localhost:5500` (Live Server default).

## Error handling
All errors go through `middleware/errorHandler.js`.
Return consistent shape: `{ success: false, error: "message" }`.

## Next tasks
1. Scaffold `backend/` with `npm init` and install dependencies
2. Build auth routes + JWT middleware
3. Connect to PostgreSQL
4. Replace frontend simulated login with real API call
