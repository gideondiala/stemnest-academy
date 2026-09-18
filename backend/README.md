# StemNest Academy — Backend API

Express REST API for StemNest Academy.

## Setup

```bash
cd backend
npm install
cp ../.env.example .env   # fill in your values
npm run dev
```

API runs at `http://localhost:3000`.
Health check: `GET /api/health`

## Endpoints

| Method | Path                  | Auth     | Description           |
|--------|-----------------------|----------|-----------------------|
| GET    | /api/health           | —        | Health check          |
| POST   | /api/auth/login       | —        | Login                 |
| POST   | /api/auth/register    | —        | Register              |
| GET    | /api/auth/me          | JWT      | Current user          |
| GET    | /api/courses          | —        | List courses          |
| POST   | /api/courses          | tutor    | Create course         |
| PUT    | /api/courses/:id      | tutor    | Update course         |
| DELETE | /api/courses/:id      | admin    | Delete course         |
| GET    | /api/sessions         | JWT      | List sessions         |
| POST   | /api/sessions         | tutor    | Schedule session      |
| GET    | /api/users/:id        | JWT      | Get profile           |
| PUT    | /api/users/:id        | JWT      | Update profile        |
| GET    | /api/projects         | JWT      | List projects         |
| POST   | /api/projects         | student  | Submit project        |
| PUT    | /api/projects/:id     | tutor    | Review project        |

## Notes
- DB queries are stubbed with `TODO` comments — connect PostgreSQL via `DATABASE_URL` in `.env`
- Auth uses JWT — set `JWT_SECRET` in `.env`
- See `directives/02_backend.md` for full architecture notes
