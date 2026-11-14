# Moving the API server from AWS to Hetzner

Step-by-step plan for moving the StemNest backend (the API at `api.stemnestacademy.co.uk`) from AWS EC2 to a Hetzner Cloud server.

## What moves and what doesn't

| Part | Where it is | Changes? |
|---|---|---|
| Website pages | Cloudflare Pages | No |
| Database (all students, classes, payments) | Supabase | **No: nothing is copied or at risk** |
| Emails | Resend | No |
| Domain and DNS | Cloudflare | One record changes |
| API server (logins, dashboards, jobs) | AWS EC2, London | **Moves to Hetzner** |

The new server is built alongside the old one and tested before anyone is sent to it. The old one stays on as a fallback for a week.

## Time needed

| Part | When | Hands-on time | Site affected? |
|---|---|---|---|
| A. Accounts and keys | Any day before | 30 min (Hetzner may take up to a day to verify a new account) | No |
| B. Build and test the new server | Migration day | 30–40 min | No |
| C. Switch over | Migration day | 20 min | No downtime expected |
| D. Point deploys at the new server | Migration day | 10 min | No |
| E. Checks | Migration day | 15 min | No |
| F. Shut down AWS | 7 days later | 20 min | No |

**About 2 hours on the day.** The best window is **a weekday morning, 9am to 1pm WAT**: there are no classes then. Avoid weekends, which are busy with classes.

---

## Part A: before migration day

**A1. Deploy the job switch.** The commit that adds `RUN_JOBS` (backend/src/index.js) and the two `Migrate` workflows must be on `main`. Claude pushes this when you say so. It also stops the reminders that were occasionally sent twice.

**A2. Create the Hetzner account** at hetzner.com → Cloud → Sign up. Use the company details and a company card. If they ask for ID, upload it. Wait for the "account activated" email. If Hetzner refuses the account, stop here and tell Claude: the same scripts work on AWS Lightsail.

**A3. Make an SSH key** (the password the deploy robot uses to log in to the server). On the office Windows PC, open PowerShell and run:

```
ssh-keygen -t ed25519 -f $HOME\.ssh\stemnest-hetzner -C stemnest-deploy -N '""'
```

This makes two files in `C:\Users\<you>\.ssh\`:

- `stemnest-hetzner.pub`: the public half. It is safe to paste into Hetzner.
- `stemnest-hetzner`: the private half. It goes **only** into GitHub secrets. Never email or WhatsApp it.

---

## Part B: build and test the new server (migration day, site unaffected)

**B1. Create the server.** Hetzner Cloud Console → New project "StemNest" → **Add Server**:

| Setting | Choose |
|---|---|
| Location | Nuremberg or Falkenstein (Germany) |
| Image | **Ubuntu 24.04** |
| Type | **Shared vCPU, x86 (Intel/AMD)**, 2 vCPU, 4 GB RAM (the cheapest "CX" plan with 4 GB) |
| Networking | Public IPv4 **on**, Public IPv6 on |
| SSH keys | Add SSH key → paste the whole contents of `stemnest-hetzner.pub` |
| Firewalls | Create firewall "stemnest-api": inbound TCP **22, 80, 443** and ICMP |
| Backups | **Tick** (adds about 20%; a daily copy of the whole server) |
| Name | `stemnest-api` |

Click Create, then copy the server's **IPv4 address**.

**B2. Add two GitHub secrets.** GitHub → the repository → Settings → Secrets and variables → Actions → New repository secret:

- `NEW_SERVER_HOST`: the IPv4 address
- `NEW_SERVER_SSH_KEY`: open `stemnest-hetzner` (the file **without** .pub) in Notepad and paste everything, including the `-----BEGIN` and `-----END` lines

Do **not** change the `EC2_...` secrets yet.

**B3. Run "Migrate 1: prepare the new server".** GitHub → Actions → Migrate 1 → Run workflow. It takes about 10 minutes and:

- installs and secures the server (security updates, firewall, key-only login)
- copies the API settings, HTTPS certificate and database backups across from the old server
- starts the API with background jobs **off**
- tests it over HTTPS

A green tick and **READY** at the end mean Part B is done. A red cross means stop and send Claude the log: nothing on the live site has changed.

---

## Part C: switch over (no downtime expected)

**C1. Change one DNS record.** Cloudflare → stemnestacademy.co.uk → DNS → Records → the **A** record named **api** → Edit:

- IPv4 address: the new server's IPv4
- Proxy status: leave **DNS only** (grey cloud)
- TTL: leave as it is

Save.

**C2. Run "Migrate 2: switch over to the new server".** Type `SWITCH` and run it. It takes about 10 minutes:

- waits until the internet sees the new address, plus 6 minutes for old caches to expire
- checks the live API answers from the new server
- turns background jobs off on the old server and on on the new one

The old server keeps answering anyone whose phone or ISP still remembers the old address. Both servers use the same database, so nothing is lost or doubled.

---

## Part D: point deploys at the new server

Change three existing secrets (GitHub → Settings → Secrets → Actions):

| Secret | New value |
|---|---|
| `EC2_HOST` | the new server's IPv4 (same as `NEW_SERVER_HOST`) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | the same private key as `NEW_SERVER_SSH_KEY` |

Then Actions → the latest **Deploy StemNest Academy** run → **Re-run all jobs**. The green tick confirms deploys now reach the new server. The names still say "EC2"; they are just labels, and every workflow (deploy, keys, database password, backups, diagnostics) keeps working unchanged.

---

## Part E: checks (15 minutes)

1. Actions → **Server diagnostics** → Run. Every database line should say OK.
2. Log in as admin, a tutor and a parent. Open the dashboards, the calendar and Finance.
3. Make a small test payment, or check that the next real payment shows as paid. The payment providers already call `api.stemnestacademy.co.uk`, so nothing changes on their side.
4. The next morning, check that class reminder emails went out once, not twice.
5. On Sunday, check that **Weekly database backup** ran green on the new server.

**If anything is wrong:** in Cloudflare, put the api record back to the old address, then tell Claude. The old server is still running with all its data access, so this is a two-minute rollback. Its jobs are off, so Claude turns them back on.

---

## Part F: shut down AWS (7 days later, if all is well)

In the AWS console, region **Europe (London) eu-west-2**:

1. EC2 → Instances → the old server → Instance state → **Stop**. Wait a day and check nothing complains.
2. Then → **Terminate**.
3. EC2 → Volumes and Snapshots: delete any left over.
4. EC2 → Elastic IPs: **release** any address (they bill even when unused).
5. Route 53 → Hosted zones: delete the stemnestacademy.co.uk zone. It is not used: the domain's DNS is at Cloudflare. This saves $0.50 a month.
6. S3: if a backup bucket exists, either keep it (it costs cents) or empty and delete it.
7. Billing → Budgets: create a **$1 monthly budget alert**, so any forgotten item emails you.
8. Billing → Bills: next month's bill should be about $0.

---

## Monthly cost after the move

| Item | Approx. |
|---|---|
| Hetzner server, 2 vCPU, 4 GB | $6–7 |
| Public IPv4 | under $1 |
| Server backups (20%) | about $1.30 |
| **Total** | **about $8–9 a month** (was about $40) |
