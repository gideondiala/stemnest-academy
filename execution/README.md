# Execution Scripts

Deterministic scripts for data processing, migrations, seeding, and automation.
These are called by the agent (orchestration layer) — not run manually unless debugging.

## Scripts

| Script                        | Purpose                                      | Status      |
|-------------------------------|----------------------------------------------|-------------|
| `seed_courses.js`             | Seed the DB with the 9 default courses       | 🔲 Planned  |
| `seed_users.js`               | Seed demo tutor + student accounts           | 🔲 Planned  |
| `migrate.js`                  | Run DB migrations                            | 🔲 Planned  |
| `export_courses_to_sheet.py`  | Export course data to Google Sheets          | 🔲 Planned  |

## Rules
- Every script must be idempotent (safe to run multiple times)
- Log clearly: what it's doing, what succeeded, what failed
- Read config from `.env` — never hardcode credentials
- Output intermediates to `.tmp/` — never to `execution/` itself
