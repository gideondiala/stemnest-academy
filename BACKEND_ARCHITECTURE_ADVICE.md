# StemNest Academy — Backend Architecture & Deployment Strategy
## Expert Recommendation | Written: May 2026

---

## 1. BEST BACKEND TECHNOLOGY FOR THIS SYSTEM

### Recommended Stack: Node.js + Express + PostgreSQL

**Why Node.js / Express?**
- The entire frontend is already JavaScript. Your team only needs to know one language across the full stack.
- The existing `backend/` folder is already scaffolded with Express — no rewrite needed, just build on what's there.
- Node.js handles many concurrent connections efficiently — perfect for a platform where multiple teachers, students, and staff are online simultaneously.
- Massive ecosystem: libraries for email (Nodemailer), WhatsApp (Twilio), payments (Stripe), video (Whereby), file uploads (Multer), and more.
- Runs natively on AWS EC2, Elastic Beanstalk, and Lambda.

**Why PostgreSQL as the database?**
- Relational database — perfect for StemNest's data model (students have bookings, bookings have teachers, teachers have sessions, sessions have credits, etc.)
- All the localStorage data you've built maps cleanly to PostgreSQL tables.
- Supports JSON columns — so any flexible data (like settings, pitch notes, session logs) can stay as JSON without forcing rigid schemas.
- Free and open source. AWS RDS (Relational Database Service) hosts PostgreSQL with automatic backups, failover, and scaling.
- Battle-tested for EdTech platforms at scale.

**Alternative considered: MongoDB**
- MongoDB (NoSQL) was considered but rejected because StemNest's data is highly relational (credits, bookings, payments, users all link to each other). A relational database enforces data integrity better.

### Full Recommended Stack

```
Frontend:     HTML / CSS / Vanilla JS (already built)
Backend API:  Node.js + Express.js
Database:     PostgreSQL (via AWS RDS)
File Storage: AWS S3 (for certificates, recordings, profile photos)
Email:        AWS SES (Simple Email Service) or Nodemailer + Gmail SMTP
WhatsApp:     Twilio API or WhatsApp Business API
Payments:     Stripe (supports UK, Nigeria, Ghana, UAE, global)
Video:        Whereby Embedded API (see section 3)
Auth:         JWT (JSON Web Tokens) for session management
Hosting:      AWS EC2 (backend) + AWS S3/CloudFront (frontend)
```

---

## 2. HOW TO UPDATE THE SYSTEM ON AWS WITHOUT DOWNTIME

### The Answer: CI/CD Pipeline with Zero-Downtime Deployment

This is called **Continuous Integration / Continuous Deployment (CI/CD)**. Here's the exact setup:

### Step-by-Step Setup

**Step 1 — Use Git (GitHub or GitLab)**
- All code lives in a Git repository (GitHub recommended).
- You work locally, make changes, then push to GitHub.
- GitHub becomes the single source of truth.

**Step 2 — Set up GitHub Actions (free CI/CD)**
Create a file `.github/workflows/deploy.yml` in your repo. When you push to the `main` branch, it automatically:
1. Runs tests (if any)
2. Builds the project
3. Deploys to AWS without downtime

**Step 3 — Zero-Downtime Deployment Strategy**

For the **frontend** (static files on S3 + CloudFront):
- Upload new files to S3
- Invalidate CloudFront cache
- New version is live in seconds — no downtime at all

For the **backend** (Node.js on EC2):
- Use **PM2** (process manager) with cluster mode
- PM2 does a "rolling restart" — it restarts one instance at a time while others keep serving traffic
- Zero downtime, zero dropped connections

```bash
# On your EC2 server, PM2 handles restarts gracefully:
pm2 reload stemnest-api --update-env
```

**Step 4 — Blue/Green Deployment (advanced, for later)**
When you're at scale, use two identical environments (Blue = live, Green = new version). Switch traffic from Blue to Green instantly. If anything breaks, switch back in seconds.

### The Workflow in Practice

```
You make a change locally
        ↓
git add . && git commit -m "Fix: student credit display"
        ↓
git push origin main
        ↓
GitHub Actions automatically:
  1. Deploys frontend to S3 (30 seconds)
  2. SSH into EC2, pulls new code, runs pm2 reload (10 seconds)
        ↓
Website is updated. Zero downtime. Students never notice.
```

---

## 3. SWITCHING TO WHEREBY EMBEDDED (VIDEO IN-PLATFORM)

### Yes — 100% possible while the website is live.

Whereby Embedded lets you host video calls inside your own website using an `<iframe>` or their JavaScript SDK. Students and teachers never leave StemNest.

### How it works

```javascript
// Instead of opening an external link:
window.open('https://meet.google.com/xxx', '_blank')

// You embed Whereby directly in the page:
<whereby-embed room="https://stemnest.whereby.com/room-name"></whereby-embed>
```

### Migration Plan (zero disruption)

1. Sign up for Whereby Embedded (paid plan — ~$9.99/month for up to 200 rooms)
2. Use their API to auto-generate a unique room URL when a class is booked
3. Store the Whereby room URL in the booking record (same field as `classLink`)
4. Update the "Join Class" button to open the embedded room instead of an external link
5. The change is a **frontend-only update** — no database changes needed
6. Deploy via the CI/CD pipeline — live in under a minute

### What changes in the code

Only two things change:
- When a class is booked → call Whereby API to create a room → save the URL
- The Join Class button → opens an embedded modal with the Whereby iframe instead of a new tab

Everything else (credits, recordings, session tracking) stays exactly the same.

---

## 4. DATA SAFETY — STUDENT RECORDS STAY INTACT DURING UPDATES

### The Golden Rule: Never touch the database during a frontend update.

Here's how data safety is guaranteed:

**Frontend updates** (HTML/CSS/JS changes):
- These are just static files on S3
- The database is completely separate — updating the frontend never touches the database
- Student records, credits, bookings, payment history — all untouched

**Backend updates** (API changes):
- Use **database migrations** (tools like `node-pg-migrate` or `Knex.js`)
- Migrations only ADD new columns/tables — they never delete existing data
- Example: adding a `recording_link` column to the sessions table doesn't affect any existing rows

**The migration principle:**
```sql
-- SAFE: Adding a new column (existing data untouched)
ALTER TABLE sessions ADD COLUMN recording_link TEXT;

-- NEVER DO THIS in production without a backup:
DROP TABLE sessions;
```

**Backups:**
- AWS RDS automatically backs up your PostgreSQL database every day
- Point-in-time recovery — you can restore to any second in the last 35 days
- Before any major update, take a manual snapshot (one click in AWS console)

**Data migration from localStorage to PostgreSQL:**
When we connect the backend, we'll write a one-time migration script that:
1. Reads all data from localStorage (exported as JSON)
2. Inserts it into the PostgreSQL database
3. Verifies every record transferred correctly
4. Only then switches the frontend to use the API instead of localStorage

No data gets lost. The migration is reversible.

---

## 5. SUMMARY — THE PLAN WHEN READY

| Phase | What happens | Time estimate |
|---|---|---|
| 1. Set up AWS | EC2 + RDS + S3 + CloudFront | 1 day |
| 2. Set up CI/CD | GitHub Actions pipeline | Half day |
| 3. Build API | Express routes for all features | 2–3 weeks |
| 4. Database schema | PostgreSQL tables matching current data | 3 days |
| 5. Data migration | Move localStorage data to PostgreSQL | 1 day |
| 6. Connect frontend | Swap localStorage calls for API fetch() | 1 week |
| 7. Whereby integration | Embed video in-platform | 2 days |
| 8. Testing | Full end-to-end testing | 1 week |
| **Total** | **Full backend live** | **~6 weeks** |

---

## 6. COST ESTIMATE (AWS, monthly)

| Service | Purpose | Est. Cost/month |
|---|---|---|
| EC2 t3.small | Node.js API server | ~£12 |
| RDS db.t3.micro | PostgreSQL database | ~£18 |
| S3 | Frontend + file storage | ~£2 |
| CloudFront | CDN for fast global delivery | ~£3 |
| SES | Email sending | ~£0.10 per 1,000 emails |
| **Total** | | **~£35–40/month** |

AWS Free Tier covers most of this for the first 12 months.

---

## KEY DECISIONS ALREADY MADE

- ✅ Backend language: **Node.js / Express** (already scaffolded)
- ✅ Database: **PostgreSQL on AWS RDS**
- ✅ Deployment: **GitHub Actions CI/CD → AWS EC2 + S3**
- ✅ Video: **Whereby Embedded** (when ready to switch)
- ✅ Payments: **Stripe** (global, supports all target countries)
- ✅ Zero-downtime: **PM2 rolling restart + S3 atomic deploys**
- ✅ Data safety: **Migrations only, daily RDS backups, pre-deploy snapshots**

---

*This document was written before backend development began. Reference it when starting Phase: Backend.*
