# Directive: Project Overview — StemNest Academy

## What this project is
StemNest Academy is a UK-based online tutoring platform for students aged 7–19.
Subjects: Coding, Maths, Sciences. Delivery: live 1-on-1 sessions.

## Architecture
The project is split into two top-level folders:

```
stemnest-academy/
├── frontend/        ← Pure HTML/CSS/JS (no build tool yet)
├── backend/         ← Node.js + Express REST API (to be built)
├── directives/      ← SOPs for every feature area (you are here)
├── execution/       ← Deterministic Python/Node scripts
├── .tmp/            ← Intermediates — never commit
├── .env             ← Secrets — never commit
└── .env.example     ← Template — always commit
```

## Current status (April 2026)
| Page                  | Status        |
|-----------------------|---------------|
| Homepage              | ✅ Complete    |
| Courses page          | ✅ Complete    |
| Login page            | ✅ Complete    |
| Tutor Dashboard       | ✅ Complete    |
| Student Dashboard     | 🔲 Next up    |
| Backend API           | 🔲 Not started |
| Auth (JWT)            | 🔲 Not started |
| Database              | 🔲 Not started |

## Tech stack
| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | HTML5, CSS3, Vanilla JS (ES6+)      |
| Backend    | Node.js + Express                   |
| Database   | PostgreSQL (planned)                |
| Auth       | JWT (planned)                       |
| Payments   | Stripe (planned)                    |
| Hosting    | Netlify (frontend) + Railway/Render (backend) |

## How to run (current)
Frontend: open `frontend/index.html` in a browser or use VS Code Live Server.
Backend: `cd backend && npm install && npm run dev` (once scaffolded).

## Agent operating rules
- Always check `execution/` for existing scripts before writing new ones.
- Update this directive and relevant feature directives when you learn something new.
- Secrets live in `.env` only — never hardcode them.
- `.tmp/` is disposable. Never reference it as a source of truth.
