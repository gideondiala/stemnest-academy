# StemNest Academy — Backend Setup Guide
## From Zero to Production on AWS

---

## WHAT WAS BUILT

```
backend/
├── src/
│   ├── index.js                    ← Main server (Express + security)
│   ├── config/
│   │   └── db.js                   ← PostgreSQL connection pool
│   ├── middleware/
│   │   ├── auth.js                 ← JWT auth + role guard
│   │   └── errorHandler.js         ← Global error handler
│   ├── routes/
│   │   ├── auth.js                 ← Login, logout, forgot/reset password
│   │   ├── users.js                ← User profiles, notifications
│   │   ├── bookings.js             ← Demo bookings, assign, reports
│   │   ├── courses.js              ← Course catalogue + lessons
│   │   ├── sessions.js             ← Enrolments, availability calendar
│   │   ├── projects.js             ← Student projects + reviews
│   │   └── payments.js             ← Stripe payment links + webhooks
│   ├── services/
│   │   ├── emailService.js         ← AWS SES emails (all templates)
│   │   ├── whatsappService.js      ← Twilio WhatsApp (all templates)
│   │   └── notificationService.js  ← Orchestrates email + WA together
│   ├── db/
│   │   ├── schema.sql              ← Full PostgreSQL schema
│   │   └── migrate.js              ← Migration runner
│   └── utils/
│       └── logger.js               ← Winston structured logging
├── ecosystem.config.js             ← PM2 cluster config
└── package.json                    ← All dependencies
```

---

## STEP 1 — SET UP AWS RDS (PostgreSQL Database)

1. Go to **AWS Console → RDS → Create database**
2. Choose:
   - Engine: **PostgreSQL 16**
   - Template: **Free tier** (for now)
   - DB instance: `db.t3.micro`
   - DB name: `stemnest`
   - Username: `stemnest_user`
   - Password: (create a strong one, save it)
   - Region: `eu-west-2` (London)
3. Under **Connectivity**: set "Public access" to **No** (EC2 only)
4. Click **Create database** — takes ~5 minutes
5. Copy the **Endpoint** (looks like `stemnest.xxxxx.eu-west-2.rds.amazonaws.com`)

---

## STEP 2 — SET UP AWS EC2 (Node.js Server)

1. Go to **AWS Console → EC2 → Launch Instance**
2. Choose:
   - AMI: **Ubuntu 24.04 LTS**
   - Instance type: **t3.small** (£12/month)
   - Key pair: create one called `stemnest-key`, download the `.pem` file
   - Security group: allow ports **22** (SSH), **3000** (API), **80**, **443**
3. Launch the instance
4. Copy the **Public IP address**

### Connect and set up the server:

```bash
# Connect via SSH (replace with your IP and key path)
ssh -i stemnest-key.pem ubuntu@YOUR_EC2_IP

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Git
sudo apt-get install -y git

# Clone your repo
git clone https://github.com/YOUR_USERNAME/stemnest-academy.git
cd stemnest-academy/backend

# Install dependencies
npm ci --omit=dev

# Create .env file
nano .env
# (paste your environment variables — see .env.example)

# Run database migrations
npm run migrate

# Start the API with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # follow the printed command to auto-start on reboot
```

---

## STEP 3 — CONFIGURE ENVIRONMENT VARIABLES

Create `backend/.env` with these values:

```env
PORT=3000
NODE_ENV=production

# Your RDS endpoint from Step 1
DATABASE_URL=postgresql://stemnest_user:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/stemnest

# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_64_char_random_string
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

RESET_TOKEN_EXPIRES_MINS=30

# AWS (same credentials as your stemnest-admin IAM user)
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=stemnest-site

# AWS SES SMTP (get from AWS Console → SES → SMTP Settings)
AWS_SES_SMTP_USER=your_ses_smtp_user
AWS_SES_SMTP_PASS=your_ses_smtp_pass
EMAIL_FROM=no-reply@stemnestacademy.co.uk
EMAIL_FROM_NAME=StemNest Academy

# Twilio (sign up at twilio.com)
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Stripe (sign up at stripe.com)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

FRONTEND_URL=https://stemnestacademy.co.uk
APP_URL=https://stemnestacademy.co.uk
```

---

## STEP 4 — SET UP AWS SES (Email)

1. Go to **AWS Console → SES → Verified identities**
2. Click **Create identity → Email address**
3. Enter: `no-reply@stemnestacademy.co.uk`
4. Verify the email (click the link AWS sends)
5. Also verify your domain: `stemnestacademy.co.uk`
6. Go to **SES → SMTP Settings → Create SMTP credentials**
7. Copy the SMTP username and password into your `.env`
8. **Request production access** (removes the sandbox limit of 200 emails/day)

---

## STEP 5 — SET UP TWILIO WHATSAPP

1. Sign up at **twilio.com**
2. Go to **Messaging → Try it out → Send a WhatsApp message**
3. Follow the sandbox setup (for testing)
4. For production: apply for **WhatsApp Business API** through Twilio
5. Copy your Account SID and Auth Token into `.env`

---

## STEP 6 — SET UP STRIPE PAYMENTS

1. Sign up at **stripe.com**
2. Go to **Developers → API keys**
3. Copy your **Secret key** (starts with `sk_live_`) into `.env`
4. Go to **Developers → Webhooks → Add endpoint**
5. URL: `https://api.stemnestacademy.co.uk/api/payments/webhook`
6. Events to listen for: `checkout.session.completed`
7. Copy the **Signing secret** (`whsec_...`) into `.env`

---

## STEP 7 — SET UP GITHUB ACTIONS (CI/CD)

1. Push your code to GitHub
2. Go to **GitHub → Settings → Secrets and variables → Actions**
3. Add these secrets:
   - `AWS_ACCESS_KEY_ID` — your IAM key
   - `AWS_SECRET_ACCESS_KEY` — your IAM secret
   - `S3_BUCKET` — `stemnest-site`
   - `CLOUDFRONT_DISTRIBUTION_ID` — `E3TA4L9WKURJAP`
   - `EC2_HOST` — your EC2 public IP
   - `EC2_USER` — `ubuntu`
   - `EC2_SSH_KEY` — contents of your `stemnest-key.pem` file

4. Every time you push to `main`:
   - Frontend deploys to S3 automatically (30 seconds)
   - Backend deploys to EC2 with zero downtime (10 seconds)

---

## STEP 8 — POINT API DOMAIN

Add a subdomain for the API:

1. Go to **Route 53 → Hosted zones → stemnestacademy.co.uk**
2. Create a new A record:
   - Name: `api`
   - Type: A
   - Value: your EC2 public IP
3. Your API will be at: `https://api.stemnestacademy.co.uk`

### Install SSL on EC2 (free with Let's Encrypt):

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Create nginx config
sudo nano /etc/nginx/sites-available/stemnest-api

# Paste:
server {
    server_name api.stemnestacademy.co.uk;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}

sudo ln -s /etc/nginx/sites-available/stemnest-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get SSL certificate (free)
sudo certbot --nginx -d api.stemnestacademy.co.uk
```

---

## STEP 9 — CONNECT FRONTEND TO BACKEND

Once the API is live, update the frontend to call the API instead of localStorage.

In `frontend/js/utils.js`, add:

```javascript
const API_URL = 'https://api.stemnestacademy.co.uk';

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('sn_access_token');
  const res = await fetch(API_URL + endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data;
}
```

Then swap localStorage calls one by one — login first, then bookings, then sessions, etc.

---

## API ENDPOINTS SUMMARY

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/login | Public | Login |
| POST | /api/auth/logout | JWT | Logout |
| POST | /api/auth/refresh | Public | Refresh token |
| POST | /api/auth/forgot-password | Public | Send reset link |
| POST | /api/auth/reset-password | Public | Set new password |
| GET  | /api/auth/me | JWT | Get own profile |
| GET  | /api/users | Admin | List all users |
| POST | /api/users | Admin | Create user |
| GET  | /api/users/:id | JWT | Get user |
| PUT  | /api/users/:id | JWT | Update user |
| PUT  | /api/users/:id/password | JWT | Change password |
| GET  | /api/courses | Public | List courses |
| GET  | /api/courses/:id | Public | Course + lessons |
| POST | /api/courses | Admin | Create course |
| PUT  | /api/courses/:id | Admin | Update course |
| POST | /api/courses/:id/lessons | Admin | Save lessons |
| GET  | /api/bookings | JWT | List bookings |
| POST | /api/bookings | Public | Create demo booking |
| PUT  | /api/bookings/:id/assign | Admin | Assign tutor |
| POST | /api/bookings/:id/report | Tutor | End-of-class report |
| GET  | /api/sessions/upcoming | JWT | Upcoming sessions |
| GET  | /api/sessions/availability/:id | JWT | Tutor availability |
| POST | /api/sessions/availability | Tutor | Set availability |
| POST | /api/sessions/enrol | Admin | Enrol student |
| GET  | /api/projects | JWT | List projects |
| POST | /api/projects | Tutor | Assign project |
| PUT  | /api/projects/:id/submit | Student | Submit project |
| PUT  | /api/projects/:id/review | Tutor | Review project |
| POST | /api/payments/create-link | Admin | Generate payment link |
| POST | /api/payments/webhook | Stripe | Auto-confirm payment |
| GET  | /api/payments | Admin | List payments |

---

## NEXT STEPS (in order)

1. ✅ Backend code — **DONE**
2. ⬜ Set up RDS database (Step 1)
3. ⬜ Set up EC2 server (Step 2)
4. ⬜ Configure environment variables (Step 3)
5. ⬜ Set up SES email (Step 4)
6. ⬜ Set up Twilio WhatsApp (Step 5)
7. ⬜ Set up Stripe (Step 6)
8. ⬜ Set up GitHub Actions (Step 7)
9. ⬜ Point API domain (Step 8)
10. ⬜ Connect frontend to API (Step 9)

---

*Backend built May 2026. Stack: Node.js + Express + PostgreSQL + AWS SES + Twilio + Stripe.*
