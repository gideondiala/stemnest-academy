# StemNest Academy — Project Overview

## What this project is
StemNest Academy is a live UK-based online tutoring platform for students aged 7–19.
Subjects: Coding, Maths, Sciences. Delivery: live 1-on-1 sessions via Google Meet / Zoom.
The platform is **fully live** at https://stemnestacademy.co.uk with real customer bookings.

---

## Architecture

```
stemnest-academy/
├── frontend/        ← Pure HTML/CSS/JS (no build tool — deployed to AWS S3 + CloudFront)
├── backend/         ← Node.js + Express REST API (deployed to AWS EC2 via PM2)
├── directives/      ← Developer SOPs — READ THESE BEFORE TOUCHING ANYTHING
└── .env.example     ← Template for environment variables
```

---

## Infrastructure (LIVE)

| Component       | Technology                          | Details                                      |
|-----------------|-------------------------------------|----------------------------------------------|
| Frontend        | HTML5 / CSS3 / Vanilla JS           | S3 bucket: `stemnest-site`, CloudFront: `E3TA4L9WKURJAP` |
| Backend API     | Node.js + Express                   | EC2: `13.40.64.172`, PM2 cluster (2 instances) |
| Database        | PostgreSQL (AWS RDS)                | `stemnest-db.cfk6s86i4abg.eu-west-2.rds.amazonaws.com` |
| Auth            | JWT (access + refresh tokens)       | 7-day access, 30-day refresh, stored in localStorage |
| Email           | AWS SES / Zoho SMTP                 | `support@stemnestacademy.co.uk` |
| Domain          | Route 53 + CloudFront               | `stemnestacademy.co.uk` + `api.stemnestacademy.co.uk` |
| SSL             | AWS Certificate Manager             | Auto-renewed |

---

## Deploy Commands (run from project root locally)

```bash
# Deploy frontend
aws s3 sync frontend/ s3://stemnest-site --delete
aws cloudfront create-invalidation --distribution-id E3TA4L9WKURJAP --paths "/*"

# Deploy backend
git push origin main
ssh -i C:\Users\hp\stemnest-key.pem ubuntu@13.40.64.172
cd /home/ubuntu/stemnest-academy && git pull origin main
pm2 reload stemnest-api --update-env
```

---

## Current Status (May 2026)

| Feature                          | Status        |
|----------------------------------|---------------|
| Homepage                         | ✅ Live        |
| Courses page                     | ✅ Live        |
| Login page (JWT auth)            | ✅ Live        |
| Free Trial booking form          | ✅ Live        |
| Join Class page (public lookup)  | ✅ Live        |
| Admin Dashboard                  | ✅ Live        |
| Founder / Super Admin Dashboard  | ✅ Live        |
| Pre-Sales Dashboard              | ✅ Live        |
| Post-Sales Dashboard             | ✅ Live        |
| Sales Dashboard                  | ✅ Live        |
| Operations Dashboard             | ✅ Live        |
| HR Dashboard                     | ✅ Live        |
| Tutor Dashboard                  | ✅ Live        |
| Student Dashboard                | ✅ Live        |
| Blog system                      | ✅ Live        |
| Email notifications              | ✅ Live        |
| Real customer bookings           | ✅ Active      |

---

## Golden Rules — READ BEFORE MAKING ANY CHANGE

1. **Everything is real-time and online.** No business data in localStorage. Only `sn_access_token`, `sn_refresh_token`, `sn_logged_in_teacher`, `sn_current_tutor`, and `sn_logged_in_student` (email) are allowed in localStorage.

2. **Never hardcode mock data.** No hardcoded teacher arrays, student arrays, or booking arrays anywhere in the frontend JS.

3. **Always verify syntax before deploying.** Run `node --check <file>` on every JS file you change.

4. **Test the API before assuming the frontend is broken.** Most "broken" UI issues are browser cache — do a hard refresh (`Ctrl+Shift+R`) or test in incognito first.

5. **The database is the source of truth.** All dashboards load from the API on every page load.

6. **Do not touch `seedRegistries()` — it has been removed.** The old function that seeded Sarah Rahman / Marcus King into localStorage no longer exists and must never be re-added.

7. **Real customers are using this platform.** Do not delete bookings, users, or any production data during testing. Use test accounts with `.test` email addresses.

---

## Test Credentials

See `TEST_CREDENTIALS.txt` in the project root for all login details.

Demo student: `demo.student@stemnestacademy.co.uk` / `StemNest2026!`
