# StemNest Academy — Deployment Guide
## Updated: May 2026

---

## OVERVIEW — TWO DEPLOYMENT PHASES

### Phase 1: Frontend-Only UAT (Available NOW)
Deploy the frontend to AWS S3. All data runs in each user's browser (localStorage).
Perfect for User Acceptance Testing with real teachers, students, and staff before the backend is built.

### Phase 2: Full Stack Production (After Backend is Built)
Deploy Node.js API + PostgreSQL database. All users share real data across devices.
This is the permanent production setup described in `BACKEND_ARCHITECTURE_ADVICE.md`.

---

## PHASE 1 — FRONTEND UAT ON AWS S3

### What works in this mode
- All dashboards: teacher, student, sales, pre-sales, post-sales, operations, HR, admin, founder
- Booking flow, scheduling, calendar, session cards
- End class dialogs, credit system, payment records
- Blog, join-class page, free-trial booking
- All UI flows and user journeys

### What does NOT work yet (needs backend)
- Real email/WhatsApp notifications (currently simulated in browser console)
- Data shared between users on different devices (each browser is isolated)
- Forgot password via real email
- Whereby embedded video

---

## STEP-BY-STEP: DEPLOY TO AWS S3

### Step 1 — Create an S3 Bucket

1. Log in to AWS Console → go to **S3**
2. Click **Create bucket**
3. Bucket name: `stemnest-frontend` (or your domain name)
4. Region: `eu-west-2` (London — closest to UK users)
5. Uncheck **Block all public access**
6. Click **Create bucket**

### Step 2 — Enable Static Website Hosting

1. Click your bucket → **Properties** tab
2. Scroll to **Static website hosting** → click **Edit**
3. Enable it. Index document: `index.html`. Error document: `404.html`
4. Click **Save**

### Step 3 — Set Bucket Policy (make it public)

Go to **Permissions** tab → **Bucket policy** → **Edit** and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::stemnest-frontend/*"
    }
  ]
}
```

Replace `stemnest-frontend` with your actual bucket name. Click **Save changes**.

### Step 4 — Upload Your Files

Upload the **contents** of your `frontend/` folder (not the folder itself). The root of the bucket should contain:

```
index.html
404.html
.htaccess
css/
js/
pages/
assets/
```

**Fastest method — AWS CLI:**
```bash
aws s3 sync frontend/ s3://stemnest-frontend --delete
```

### Step 5 — Add CloudFront (HTTPS + Fast Global Delivery)

1. Go to **CloudFront** → **Create distribution**
2. Origin domain: select your S3 bucket
3. Viewer protocol policy: **Redirect HTTP to HTTPS**
4. Default root object: `index.html`
5. Click **Create distribution** → wait ~10 minutes
6. Your site is live at: `https://xxxxxxxx.cloudfront.net`

### Step 6 — Point Your Domain

In Route 53 or Namecheap DNS, add a CNAME:
- Name: `app` (or `@` for root domain)
- Value: your CloudFront URL

In CloudFront, add your domain as an **Alternate domain name** and request a free SSL certificate via **ACM (Certificate Manager)**.

---

## STEP-BY-STEP: DEPLOY TO NAMECHEAP (Alternative)

If you prefer to use your existing Namecheap shared hosting for Phase 1:

1. Log in to Namecheap → Hosting → cPanel
2. File Manager → navigate to your subdomain folder
3. Enable **Show Hidden Files** in Settings
4. Upload all contents of `frontend/` to the subdomain root
5. cPanel → SSL/TLS → Run AutoSSL for HTTPS

See the original Namecheap guide in git history if needed.

---

## UPDATING THE SITE (Zero Downtime)

### Manual update:
```bash
# Upload changed files
aws s3 sync frontend/ s3://stemnest-frontend --delete

# Clear CloudFront cache so users see the new version immediately
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### Automated update (CI/CD with GitHub Actions):
Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS S3

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to S3
        run: aws s3 sync frontend/ s3://stemnest-frontend --delete
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: eu-west-2
      - name: Invalidate CloudFront
        run: aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DIST_ID }} --paths "/*"
```

With this in place: push to GitHub → site updates automatically in under 60 seconds. Zero downtime.

---

## UAT TESTING — CREDENTIALS

Give each tester their credentials from `TEST_CREDENTIALS.txt`:

| Role | Email | Password |
|---|---|---|
| Founder | founder@stemnest.co.uk | Founder2024! |
| Admin | admin@stemnest.co.uk | admin123 |
| Teacher (Coding) | sarah.rahman@stemnest.co.uk | StemNest2024! |
| Teacher (Maths) | james.okafor@stemnest.co.uk | StemNest2024! |
| Sales | alex.johnson@stemnest.co.uk | StemNest2024! |
| Pre-Sales | presales@stemnest.co.uk | StemNest2024! |
| Post-Sales | postsales@stemnest.co.uk | StemNest2024! |
| Operations | ops@stemnest.co.uk | StemNest2024! |
| HR | hr@stemnest.co.uk | StemNest2024! |
| Student | any email + any password | — |

**Important:** Each tester uses their own device/browser. Data is stored locally in each browser — users cannot see each other's data yet. That comes in Phase 2 with the backend.

---

## PURGING TEST DATA AFTER UAT

### Phase 1 (localStorage — browser-based):
Each tester simply clears their browser storage:
- Chrome: Settings → Privacy → Clear browsing data → Cached images and files + Cookies
- Or open DevTools (F12) → Application → Storage → Clear site data

For the seeded default data (teachers, staff), it resets automatically on next login.

### Phase 2 (PostgreSQL — after backend):
One command wipes all test data while keeping the schema intact:

```sql
-- Wipe all test users and data, reset ID sequences
TRUNCATE TABLE users, bookings, sessions, payments, credits, leads
  RESTART IDENTITY CASCADE;
```

This takes under 1 second. The database structure stays. You start fresh with real users.

---

## PHASE 2 — FULL PRODUCTION DEPLOYMENT

When the backend is ready, refer to `BACKEND_ARCHITECTURE_ADVICE.md` for the full AWS architecture.

Summary:
- **Frontend**: S3 + CloudFront (same as Phase 1, no changes needed)
- **Backend API**: AWS EC2 (Node.js + Express) with PM2 for zero-downtime restarts
- **Database**: AWS RDS (PostgreSQL) with daily automatic backups
- **File Storage**: AWS S3 bucket (certificates, recordings, profile photos)
- **Email**: AWS SES
- **Video**: Whereby Embedded API
- **Payments**: Stripe

The frontend code needs **zero changes** for Phase 2 — we just swap localStorage calls for API fetch() calls in the JS files.

---

## COST SUMMARY

| Phase | Infrastructure | Est. Monthly Cost |
|---|---|---|
| Phase 1 (S3 + CloudFront) | Static hosting only | ~£2–5/month |
| Phase 2 (Full stack) | EC2 + RDS + S3 + CloudFront | ~£35–40/month |

AWS Free Tier covers Phase 1 entirely for 12 months, and most of Phase 2 for the first year.
