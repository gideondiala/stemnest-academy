# StemNest Academy — Project Master Reference
## Last Updated: May 2026 | Built with Kiro AI

---

## 1. WHAT IS STEMNEST ACADEMY?

StemNest Academy is a UK-registered EdTech company providing live 1-on-1 online tutoring in Coding, Mathematics, and Sciences to students aged 7–19. The platform serves students globally — UK, Nigeria, Ghana, UAE, and beyond.

**Business Model:**
- Parents book a FREE demo class
- After the demo, a Sales/Academic Counselor pitches a paid course
- Student is enrolled, credits are purchased, recurring classes are scheduled
- Teachers deliver classes, earn per session
- Operations team monitors quality and attendance

---

## 2. TECH STACK

### Frontend
- **Pure HTML / CSS / Vanilla JavaScript** — no frameworks
- Hosted on **AWS S3 + CloudFront** (CDN)
- Domain: `stemnestacademy.co.uk` (Route 53)
- Fonts: Fredoka One (headings), Nunito (body)
- CSS variables in `frontend/css/global.css`

### Backend
- **Node.js + Express.js** (already scaffolded)
- **PostgreSQL** on AWS RDS
- **PM2** cluster mode (zero-downtime restarts)
- **Nginx** reverse proxy on EC2
- **SSL** via Let's Encrypt (Certbot) — auto-renews

### Email
- **Zoho SMTP** (current — active) via `support@stemnestacademy.co.uk`
- **AWS SES** (future — pending production access approval)
- Switch: change `SMTP_HOST` in `.env` on server

### Infrastructure (AWS)
| Service | Details |
|---|---|
| EC2 | `i-0f713df9b0b3a93e4` · t3.small · Ubuntu 24.04 · `13.40.64.172` |
| RDS | `stemnest-db.cfk6s86i4abg.eu-west-2.rds.amazonaws.com` · PostgreSQL 16.13 |
| S3 | `stemnest-site` (eu-west-2) |
| CloudFront | `E3TA4L9WKURJAP` · `d3a06a39b96tdt.cloudfront.net` |
| Route 53 | Hosted Zone `Z08476331L9X7QC8ZGOKS` |
| ACM (SSL) | `arn:aws:acm:us-east-1:350202660449:certificate/aa54d7a9-664e-4964-96df-11130cf5b121` · Valid until Nov 2026 |
| IAM User | `stemnest-admin` · Account `350202660449` |

---

## 3. REPOSITORY

- **GitHub:** `https://github.com/gideondiala/stemnest-academy`
- **Branch:** `main`
- **SSH Key:** `C:\Users\hp\stemnest-key.pem`

### Connect to server:
```bash
ssh -i C:\Users\hp\stemnest-key.pem ubuntu@13.40.64.172
```

### Deploy frontend:
```bash
aws s3 sync frontend/ s3://stemnest-site --delete
aws cloudfront create-invalidation --distribution-id E3TA4L9WKURJAP --paths "/*"
```

### Deploy backend (on server):
```bash
cd /home/ubuntu/stemnest-academy && git pull origin main
cd backend && npm ci --omit=dev && pm2 reload stemnest-api --update-env
```

---

## 4. PROJECT STRUCTURE

```
stemnest-academy/
├── frontend/                    ← Static website (S3)
│   ├── index.html               ← Homepage
│   ├── assets/icons/icon.png    ← Favicon (StemNest icon)
│   ├── assets/images/           ← logo.png (nav), logo2.png (footer)
│   ├── css/
│   │   ├── global.css           ← CSS variables, shared styles
│   │   ├── dashboard.css        ← All dashboard layouts
│   │   └── [page].css           ← Page-specific styles
│   ├── js/
│   │   ├── api.js               ← API client (Auth, Bookings, etc.)
│   │   ├── api-sync.js          ← Syncs API data → localStorage (30s refresh)
│   │   ├── wa.js                ← WhatsApp click-to-send buttons
│   │   ├── utils.js             ← navigate(), showToast(), seedRegistries()
│   │   ├── login.js             ← Multi-role auth (API first, localStorage fallback)
│   │   ├── dashboard.js         ← Tutor dashboard + availability calendar
│   │   ├── tutor-sessions.js    ← Teacher session lifecycle (join, absent watcher)
│   │   ├── tutor-sessions-v2.js ← Upcoming cards, end-class dialogs
│   │   ├── tutor-companion.js   ← Leaderboard, KYC, earnings
│   │   ├── student-dashboard.js ← Student portal
│   │   ├── student-upgrades.js  ← Chat, Learning Nest, payment link
│   │   ├── admin-dashboard.js   ← Admin portal
│   │   ├── super-admin.js       ← Founder reports, settings
│   │   ├── sales-dashboard.js   ← Academic counselor portal
│   │   ├── presales-dashboard.js← Demo scheduling, incoming bookings
│   │   ├── postsales-dashboard.js← Payments, onboarding, credits
│   │   ├── hr-dashboard.js      ← Applications, interviews, training
│   │   ├── operations-dashboard.js← Late joins, class log, absent teachers
│   │   ├── course-scheduler.js  ← Recurring course enrolment + reschedule
│   │   └── mail-system.js       ← Bulk email system
│   └── pages/
│       ├── login.html
│       ├── tutor-dashboard.html
│       ├── student-dashboard.html
│       ├── admin-dashboard.html
│       ├── super-admin.html
│       ├── sales-dashboard.html
│       ├── presales-dashboard.html
│       ├── postsales-dashboard.html
│       ├── hr-dashboard.html
│       ├── operations-dashboard.html
│       ├── free-trial.html      ← Public demo booking form
│       ├── join-class.html      ← Student class join page
│       ├── teach-with-us.html   ← Tutor application form
│       └── legal/               ← 5 legal pages
│
├── backend/                     ← Node.js API (EC2)
│   ├── src/
│   │   ├── index.js             ← Express server entry point
│   │   ├── config/db.js         ← PostgreSQL connection pool
│   │   ├── middleware/
│   │   │   ├── auth.js          ← JWT auth + role guard
│   │   │   └── errorHandler.js  ← Global error handler
│   │   ├── routes/
│   │   │   ├── auth.js          ← Login, logout, forgot/reset password
│   │   │   ├── users.js         ← User profiles, notifications
│   │   │   ├── bookings.js      ← Demo bookings, assign, reports
│   │   │   ├── courses.js       ← Course catalogue + lessons
│   │   │   ├── sessions.js      ← Enrolments, availability calendar
│   │   │   ├── projects.js      ← Student projects + reviews
│   │   │   ├── payments.js      ← Stripe payment links + webhooks
│   │   │   ├── applications.js  ← Tutor job applications
│   │   │   └── sync.js          ← Bulk data sync endpoints
│   │   ├── services/
│   │   │   ├── emailService.js  ← Zoho SMTP / AWS SES emails
│   │   │   ├── whatsappService.js← Twilio WhatsApp (future)
│   │   │   └── notificationService.js← Orchestrates email + WA
│   │   └── db/
│   │       ├── schema.sql       ← Full PostgreSQL schema (15 tables)
│   │       ├── migrate.js       ← Run: npm run migrate
│   │       └── seed.js          ← Run: npm run seed
│   ├── ecosystem.config.js      ← PM2 cluster config
│   ├── test-email.js            ← Email test script
│   └── .env                     ← Server environment variables (NOT in git)
│
├── .github/workflows/deploy.yml ← GitHub Actions CI/CD
├── PROJECT_MASTER.md            ← This file
├── TEST_CREDENTIALS.txt         ← All login credentials
├── BACKEND_SETUP_GUIDE.md       ← Step-by-step AWS setup guide
├── BACKEND_ARCHITECTURE_ADVICE.md← Tech stack decisions
├── FUTURE_FEATURES_QA.md        ← Group classes, Paywise, etc.
├── AWS_DEPLOYMENT_GUIDE.md      ← Frontend deployment guide
└── TASK_PLAN.md                 ← Feature implementation plan
```

---

## 5. DATABASE SCHEMA (PostgreSQL)

15 tables in the `stemnest` database:

| Table | Purpose |
|---|---|
| `users` | All users (students, tutors, admin, sales, etc.) |
| `tutor_profiles` | Extended tutor data (subject, courses, earnings) |
| `student_profiles` | Extended student data (grade, credits) |
| `courses` | Course catalogue |
| `lessons` | Per-lesson data (name, activity link, slides link) |
| `enrolments` | Student enrolled in a course with weekly schedule |
| `bookings` | Individual class slots (demo + paid) |
| `class_reports` | Teacher end-of-class reports |
| `tutor_availability` | Teacher calendar slots |
| `credit_transactions` | Append-only credit audit trail |
| `payments` | Payment records + Stripe sessions |
| `pipeline` | Sales pitch records |
| `projects` | Student projects + tutor reviews |
| `notifications` | In-app notifications |
| `email_log` | All sent emails (audit trail) |
| `late_joins` | Teacher late join records |
| `applications` | Tutor job applications |
| `blog_posts` | Blog content |
| `password_reset_tokens` | Forgot password tokens |
| `refresh_tokens` | JWT refresh token store |

---

## 6. USER ROLES & DASHBOARDS

| Role | Email | Dashboard URL |
|---|---|---|
| `super_admin` | founder@stemnestacademy.co.uk | /pages/super-admin |
| `admin` | admin@stemnestacademy.co.uk | /pages/admin-dashboard |
| `tutor` | sarah.rahman@stemnestacademy.co.uk (CT001) | /pages/tutor-dashboard |
| `tutor` | james.okafor@stemnestacademy.co.uk (MT001) | /pages/tutor-dashboard |
| `tutor` | lisa.patel@stemnestacademy.co.uk (ST001) | /pages/tutor-dashboard |
| `tutor` | marcus.king@stemnestacademy.co.uk (CT002) | /pages/tutor-dashboard |
| `sales` | alex.johnson@stemnestacademy.co.uk (SP001) | /pages/sales-dashboard |
| `operations` | ops@stemnestacademy.co.uk | /pages/operations-dashboard |
| `presales` | presales@stemnestacademy.co.uk | /pages/presales-dashboard |
| `postsales` | postsales@stemnestacademy.co.uk | /pages/postsales-dashboard |
| `hr` | hr@stemnestacademy.co.uk | /pages/hr-dashboard |
| `student` | (created on onboarding) | /pages/student-dashboard |

**All passwords:** `StemNest2024!` (except admin: `admin123`, founder: `Founder2024!`)

---

## 7. KEY FLOWS

### Demo Booking Flow
1. Parent books at `/pages/free-trial` → saved to DB → confirmation email sent
2. Pre-Sales sees booking in Incoming Demos → schedules with teacher + sales person
3. Teacher sees booking on dashboard → joins class → ends class with report
4. Completed demo → lead goes to Sales dashboard
5. Sales pitches course → marks as converted → goes to Post-Sales
6. Post-Sales confirms payment → onboards student → schedules recurring classes

### Student Onboarding Flow
1. Post-Sales clicks "Onboard" on paid student
2. System creates user in PostgreSQL via API
3. Credential file downloaded (name, email, password, login guide)
4. Welcome email sent to parent via Zoho SMTP
5. Student logs in at `/pages/login` → selects "I'm a Student"

### Teacher Calendar Flow
1. Teacher marks availability slots on calendar
2. Pre-Sales/Post-Sales assigns class → slot marked as booked
3. Teacher sees booked slot (blue=paid, orange=demo) with student name
4. Click slot → popup shows student details, Join Class, End Class buttons
5. End Class → 15-min rule → outcome dialog → report saved to DB

---

## 8. DATA SYNC ARCHITECTURE

The frontend uses a **dual-layer data strategy**:

```
API (PostgreSQL) ←→ api-sync.js ←→ localStorage ←→ Dashboard JS
```

- **On page load:** `api-sync.js` fetches from API → writes to localStorage
- **Every 30 seconds:** Silent background refresh
- **On write:** Dashboard JS writes to localStorage → pushes to API in background
- **Fallback:** If API is offline, localStorage data is used

This means all dashboards work offline AND sync across devices.

**Key localStorage keys:**
- `sn_bookings` — all bookings
- `sn_teachers` — teacher registry
- `sn_students` — student registry
- `sn_sales_persons` — sales team
- `sn_courses` — course catalogue
- `sn_pipeline_SP001` — sales pipeline per person
- `sn_class_sessions_CT001` — class records per tutor
- `sn_incomplete_demos` — incomplete demo records
- `sn_completed_demos` — completed demo records
- `sn_sales_leads` — leads from completed demos
- `sn_late_joins` — late join records
- `sn_absent_teachers` — absent teacher records
- `sn_access_token` — JWT access token
- `sn_refresh_token` — JWT refresh token
- `sn_api_user` — logged-in user object

---

## 9. EMAIL SYSTEM

### Current Setup (Zoho SMTP)
- **From:** `support@stemnestacademy.co.uk`
- **SMTP:** `smtp.zoho.com:587`
- **App Password:** stored in server `.env`

### Future Setup (AWS SES — pending approval)
- **From:** `no-reply@stemnestacademy.co.uk`
- **Domain verified:** DKIM active
- **Switch:** Remove `SMTP_HOST` from `.env`, SES SDK activates automatically

### Email Templates (in `emailService.js`)
1. Welcome / Onboarding
2. Password Reset (30-min expiry token)
3. Demo Class Confirmed (to parent)
4. Class Assigned (to teacher)
5. Class Reminder (15 mins before)
6. Payment Link
7. Low Credits Warning (≤2 credits)
8. Birthday Greeting
9. Sales Notification

### WhatsApp (click-to-send — free)
- `wa.js` generates `wa.me` links with pre-filled messages
- Staff click → WhatsApp opens on their phone → they send manually
- No API cost — works immediately

---

## 10. ZOHO MAIL SETUP

5 mailboxes on `stemnestacademy.co.uk`:
- `info@stemnestacademy.co.uk`
- `support@stemnestacademy.co.uk`
- `founder@stemnestacademy.co.uk`
- `hr@stemnestacademy.co.uk`
- `tutors@stemnestacademy.co.uk`

**Access:** https://mail.zoho.com
**DNS records added to Route 53:** MX, SPF, DKIM, TXT verification

---

## 11. STRIPE SETUP

- **Billing domain:** `billing.stemnestacademy.co.uk` → CNAME → `hosted-checkout.stripecdn.com`
- **ACME challenge:** TXT record added for SSL verification
- **Backend:** Stripe SDK in `payments.js` — add `STRIPE_SECRET_KEY` to `.env` to activate

---

## 12. CLOUDFRONT URL REWRITE

A CloudFront Function (`stemnest-url-rewrite`) handles clean URLs:
- `stemnestacademy.co.uk/pages/login` → serves `login.html` (no .html in URL)
- `stemnestacademy.co.uk/pages/login.html` → redirects to `/pages/login`

---

## 13. PENDING / TODO

### Immediate
- [ ] AWS SES production access — appeal submitted, awaiting approval
- [ ] Test booking confirmation email end-to-end after Zoho SMTP fix
- [ ] Verify paid class sessions appear on teacher dashboard after postsales scheduling

### Short Term
- [ ] Connect Stripe for real payment links (add `STRIPE_SECRET_KEY` to `.env`)
- [ ] Set up Namecheap email MX records for `stemnestacademy.com` (separate domain)
- [ ] Upgrade Node.js on EC2 to v22 (warning in logs)

### Medium Term
- [ ] Meta Cloud API for WhatsApp automation (free 1,000 conversations/month)
- [ ] Whereby Embedded for in-platform video (replace Google Meet links)
- [ ] Group classes feature (2–4 students per session)
- [ ] GitHub Actions CI/CD (auto-deploy on push to main)

### Long Term
- [ ] Connect all remaining localStorage features to real API
- [ ] Mobile app (React Native)
- [ ] Parent portal

---

## 14. HOW TO MAKE CHANGES

### Frontend change:
1. Edit files in `frontend/`
2. Test locally (open HTML files in browser)
3. `git add -A && git commit -m "description" && git push origin main`
4. `aws s3 sync frontend/ s3://stemnest-site --delete`
5. `aws cloudfront create-invalidation --distribution-id E3TA4L9WKURJAP --paths "/*"`

### Backend change:
1. Edit files in `backend/src/`
2. `git add -A && git commit -m "description" && git push origin main`
3. SSH to server: `ssh -i C:\Users\hp\stemnest-key.pem ubuntu@13.40.64.172`
4. `cd /home/ubuntu/stemnest-academy && git pull origin main && cd backend && pm2 reload stemnest-api --update-env`

### Database change:
1. Write SQL migration in `backend/src/db/`
2. Run on server: `psql postgresql://stemnest_user:StemNestDB2024Secure@stemnest-db.cfk6s86i4abg.eu-west-2.rds.amazonaws.com:5432/stemnest -f backend/src/db/your-migration.sql`

### Add new email address:
1. Log into Zoho Mail → Add User
2. (Free plan: max 5 users — upgrade if needed)

### Add new DNS record:
1. Create a JSON file with the record
2. `aws route53 change-resource-record-sets --hosted-zone-id Z08476331L9X7QC8ZGOKS --change-batch file://your-record.json`

---

## 15. IMPORTANT NOTES FOR DEVELOPERS

1. **No build tools** — pure HTML/CSS/JS. No webpack, no npm for frontend.
2. **localStorage is the fallback** — all dashboard JS reads from localStorage. The API syncs data into localStorage. Never break the localStorage keys.
3. **Staff IDs matter** — tutors use `CT001`, `MT001` etc. as their ID. The DB stores UUIDs. The `api-sync.js` maps `tutor_staff_id` → `assignedTutorId` so the tutor dashboard filter works.
4. **Date format** — API returns `2026-05-12T00:00:00.000Z`. The `_formatApiTime()` function in `api-sync.js` converts to `H:MM AM/PM`. Always strip the timestamp: `b.date.split('T')[0]`.
5. **Completed classes** — once a class is marked completed/incomplete, `api-sync.js` preserves that status and won't overwrite it from the API. This prevents the 30s sync from resurrecting ended classes.
6. **CORS** — the API allows both `stemnestacademy.co.uk` and `www.stemnestacademy.co.uk`. If you add a new domain, update `FRONTEND_URL` in `.env`.
7. **JWT tokens** — access token expires in 7 days, refresh token in 30 days. The `api.js` client auto-refreshes on 401 responses.
8. **Passwords** — hashed with bcrypt (12 rounds) in the DB. Never store plain text passwords in the DB.
9. **Forward compatibility** — all data structures use flexible objects. Add new fields without breaking existing records.

---

## 16. CONTACT & ACCOUNTS

| Service | Account | Notes |
|---|---|---|
| AWS | Account `350202660449` | IAM user: `stemnest-admin` |
| GitHub | `gideondiala` | Repo: `gideondiala/stemnest-academy` |
| Zoho Mail | `founder@stemnestacademy.co.uk` | 5 mailboxes |
| Stripe | (set up in progress) | Billing domain configured |
| Domain (.co.uk) | AWS Route 53 | `stemnestacademy.co.uk` |
| Domain (.com) | Namecheap | `stemnestacademy.com` (separate) |

---

*This document should be updated whenever significant changes are made to the platform.*
*Last updated by: Kiro AI | May 2026*
