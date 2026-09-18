# StemNest Academy — Complete AWS Deployment Guide
## For: stemnestacademy.co.uk | Written: May 2026
## Audience: First-time AWS user

---

## WHAT WE ARE BUILDING

By the end of this guide, your website will be:
- Live at **https://stemnestacademy.co.uk**
- Hosted on AWS S3 (file storage)
- Delivered globally via CloudFront (fast loading everywhere)
- Secured with a free SSL certificate (the padlock in the browser)
- Automatically updated when you push code changes

**Time required:** About 1–2 hours for a first-time setup.

---

## BEFORE YOU START — CHECKLIST

- [ ] You have an AWS account (create one at aws.amazon.com if not)
- [ ] You have purchased `stemnestacademy.co.uk` on AWS Route 53
- [ ] You have the `frontend/` folder on your computer (the website files)
- [ ] You have AWS CLI installed on your computer (we will install it below)

---

## PART 1 — SET UP YOUR AWS ACCOUNT

### 1.1 Create an AWS Account (skip if you already have one)

1. Go to **https://aws.amazon.com**
2. Click **Create an AWS Account**
3. Enter your email address and choose an account name (e.g. "StemNest Academy")
4. Enter your payment card details (you will not be charged for what we are doing — it falls under the free tier)
5. Verify your phone number
6. Choose the **Basic Support** plan (free)
7. You are now logged in to the AWS Console

### 1.2 Set Your Region

1. In the top-right corner of the AWS Console, click the region dropdown (it may say "N. Virginia" or similar)
2. Select **EU (London) eu-west-2**
3. This ensures your website is hosted in the UK for faster loading

### 1.3 Create an IAM User (for security — do not use root account)

The root account is like the master key. We create a separate user for daily work.

1. In the search bar at the top, type **IAM** and click it
2. Click **Users** in the left sidebar
3. Click **Create user**
4. Username: `stemnest-admin`
5. Check **Provide user access to the AWS Management Console**
6. Select **I want to create an IAM user**
7. Set a password (write it down)
8. Click **Next**
9. Click **Attach policies directly**
10. Search for and check these policies:
    - `AmazonS3FullAccess`
    - `CloudFrontFullAccess`
    - `AmazonRoute53FullAccess`
    - `AWSCertificateManagerFullAccess`
11. Click **Next** → **Create user**
12. **IMPORTANT:** Download the CSV file with the credentials — you will need this
13. Sign out and sign back in using the new IAM user credentials

---

## PART 2 — INSTALL AWS CLI ON YOUR COMPUTER

The AWS CLI lets you upload files from your computer to AWS with one command.

### 2.1 Install AWS CLI

**On Windows:**
1. Go to: https://aws.amazon.com/cli/
2. Click **Download AWS CLI** → download the Windows installer (.msi file)
3. Run the installer, click through all the defaults
4. Open **Command Prompt** (press Windows key, type `cmd`, press Enter)
5. Type: `aws --version`
6. You should see something like: `aws-cli/2.x.x`

### 2.2 Configure AWS CLI

1. Open Command Prompt
2. Type: `aws configure`
3. It will ask for 4 things:
   - **AWS Access Key ID**: found in the CSV you downloaded in step 1.3
   - **AWS Secret Access Key**: also in the CSV
   - **Default region name**: type `eu-west-2`
   - **Default output format**: type `json`
4. Press Enter after each one

You are now connected to AWS from your computer.

---

## PART 3 — CREATE AN S3 BUCKET

S3 is Amazon's file storage. We will store your website files here.

### 3.1 Create the Bucket

1. In the AWS Console search bar, type **S3** and click it
2. Click **Create bucket**
3. Fill in:
   - **Bucket name**: `stemnestacademy.co.uk` (use your exact domain name)
   - **AWS Region**: EU (London) eu-west-2
4. Scroll down to **Block Public Access settings**
5. **Uncheck** "Block all public access"
6. A warning will appear — check the box that says "I acknowledge..."
7. Leave everything else as default
8. Click **Create bucket**

### 3.2 Enable Static Website Hosting

1. Click on your new bucket `stemnestacademy.co.uk`
2. Click the **Properties** tab
3. Scroll all the way down to **Static website hosting**
4. Click **Edit**
5. Select **Enable**
6. Index document: type `index.html`
7. Error document: type `404.html`
8. Click **Save changes**
9. Scroll back down to Static website hosting — you will see a **Bucket website endpoint** URL. Copy it and save it somewhere (you will need it later).

### 3.3 Set the Bucket Policy (make files publicly readable)

1. Click the **Permissions** tab
2. Scroll to **Bucket policy**
3. Click **Edit**
4. Delete anything in the box and paste this exactly:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::stemnestacademy.co.uk/*"
        }
    ]
}
```

5. Click **Save changes**

---

## PART 4 — UPLOAD YOUR WEBSITE FILES

### 4.1 Prepare Your Files

Make sure your `frontend/` folder contains:
```
frontend/
├── index.html
├── 404.html
├── .htaccess
├── css/
├── js/
├── pages/
└── assets/
```

### 4.2 Upload Using AWS CLI (Recommended — uploads everything at once)

1. Open Command Prompt
2. Navigate to your project folder. For example:
   ```
   cd C:\Users\YourName\Documents\stemnest-academy
   ```
3. Run this command:
   ```
   aws s3 sync frontend/ s3://stemnestacademy.co.uk --delete
   ```
4. You will see files uploading one by one. Wait for it to finish.
5. When done, it will return to the command prompt with no errors.

### 4.3 Verify the Upload

1. Go back to the AWS Console → S3 → your bucket
2. Click the **Objects** tab
3. You should see `index.html`, `404.html`, and all your folders
4. Click on `index.html` → click the **Object URL** link
5. Your website should open in the browser (it will be HTTP for now, not HTTPS — we fix that next)

---

## PART 5 — GET A FREE SSL CERTIFICATE

SSL gives you the padlock and HTTPS. AWS provides this for free.

### 5.1 Request a Certificate

1. In the AWS Console search bar, type **Certificate Manager** and click it
2. **IMPORTANT:** In the top-right corner, change your region to **US East (N. Virginia) us-east-1**
   - CloudFront requires certificates to be in us-east-1 — this is an AWS requirement
3. Click **Request a certificate**
4. Select **Request a public certificate** → click **Next**
5. Under **Fully qualified domain name**, type: `stemnestacademy.co.uk`
6. Click **Add another name to this certificate**
7. Type: `www.stemnestacademy.co.uk`
8. Validation method: select **DNS validation**
9. Click **Request**

### 5.2 Validate the Certificate

1. Click on your new certificate (it will say "Pending validation")
2. You will see two CNAME records that need to be added to your DNS
3. Click **Create records in Route 53** (since your domain is in Route 53, AWS can do this automatically)
4. Click **Create records**
5. Wait 5–10 minutes. Refresh the page.
6. The status will change from "Pending validation" to **Issued**
7. Copy the **Certificate ARN** (it looks like `arn:aws:acm:us-east-1:...`) — you will need it in the next step

---

## PART 6 — SET UP CLOUDFRONT (HTTPS + FAST GLOBAL DELIVERY)

CloudFront is Amazon's CDN (Content Delivery Network). It makes your website load fast for users anywhere in the world and enables HTTPS.

### 6.1 Create a CloudFront Distribution

1. In the AWS Console search bar, type **CloudFront** and click it
2. Click **Create a CloudFront distribution**
3. Fill in the settings:

**Origin section:**
- **Origin domain**: Click the dropdown and select your S3 bucket website endpoint (it ends in `.s3-website.eu-west-2.amazonaws.com`)
- Do NOT select the S3 bucket directly — select the website endpoint
- **Origin path**: leave blank
- **Name**: leave as auto-filled

**Default cache behavior:**
- **Viewer protocol policy**: select **Redirect HTTP to HTTPS**
- **Allowed HTTP methods**: GET, HEAD
- **Cache policy**: select **CachingOptimized**

**Settings section:**
- **Alternate domain names (CNAMEs)**: click **Add item** and type `stemnestacademy.co.uk`
- Click **Add item** again and type `www.stemnestacademy.co.uk`
- **Custom SSL certificate**: click the dropdown and select the certificate you created in Part 5
- **Default root object**: type `index.html`

4. Scroll down and click **Create distribution**
5. Wait 10–15 minutes for the distribution to deploy (status changes from "Deploying" to "Enabled")
6. Copy your **Distribution domain name** — it looks like `d1234abcd.cloudfront.net`

### 6.2 Test CloudFront

1. Open a browser and go to: `https://d1234abcd.cloudfront.net` (use your actual distribution domain)
2. Your website should load with HTTPS (padlock in the browser)

---

## PART 7 — CONNECT YOUR DOMAIN

Now we point `stemnestacademy.co.uk` to your CloudFront distribution.

### 7.1 Update Route 53 DNS Records

1. In the AWS Console search bar, type **Route 53** and click it
2. Click **Hosted zones**
3. Click on `stemnestacademy.co.uk`
4. You will see existing DNS records. We need to add/update two records.

**Record 1 — Root domain (stemnestacademy.co.uk):**
1. Click **Create record**
2. Leave the **Record name** blank (this is the root domain)
3. **Record type**: A
4. Toggle on **Alias**
5. **Route traffic to**: select **Alias to CloudFront distribution**
6. Select your CloudFront distribution from the dropdown
7. Click **Create records**

**Record 2 — www subdomain (www.stemnestacademy.co.uk):**
1. Click **Create record**
2. **Record name**: type `www`
3. **Record type**: A
4. Toggle on **Alias**
5. **Route traffic to**: select **Alias to CloudFront distribution**
6. Select the same CloudFront distribution
7. Click **Create records**

### 7.2 Wait for DNS to Propagate

DNS changes take between 5 minutes and 48 hours to propagate worldwide. Usually it is under 30 minutes.

To check if it has propagated:
1. Go to: https://dnschecker.org
2. Type `stemnestacademy.co.uk` and click **Search**
3. When you see green ticks appearing around the world, your domain is live

### 7.3 Test Your Live Website

1. Open a browser and go to: **https://stemnestacademy.co.uk**
2. You should see your StemNest Academy website with the padlock
3. Try: **https://www.stemnestacademy.co.uk** — it should also work

---

## PART 8 — UPDATING YOUR WEBSITE

Every time you make changes to the code, run these two commands to push the update live:

```bash
# Step 1: Upload changed files to S3
aws s3 sync frontend/ s3://stemnestacademy.co.uk --delete

# Step 2: Clear the CloudFront cache so visitors see the new version
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

Replace `YOUR_DISTRIBUTION_ID` with your actual CloudFront distribution ID (found in the CloudFront console, looks like `E1234ABCDEF`).

**The website updates in under 60 seconds. Zero downtime.**

---

## PART 9 — TROUBLESHOOTING

### Website shows "Access Denied"
- The bucket policy was not saved correctly. Go back to Part 3.3 and re-paste the policy.

### Website shows old content after update
- Run the CloudFront invalidation command from Part 8.
- Wait 2–3 minutes and hard-refresh your browser (Ctrl+Shift+R).

### HTTPS not working / certificate error
- Make sure your certificate was created in **us-east-1** (N. Virginia), not eu-west-2.
- Make sure the certificate status is **Issued** (not Pending).
- Make sure the certificate is attached to your CloudFront distribution.

### Domain not resolving
- DNS propagation can take up to 48 hours. Check dnschecker.org.
- Make sure you created A records (not CNAME) for the root domain.

### Pages other than index.html show 404
- In CloudFront, go to your distribution → **Error pages** tab
- Click **Create custom error response**
- HTTP error code: 403 → Response page path: `/index.html` → HTTP response code: 200
- Repeat for error code 404
- This fixes the issue where refreshing a page shows a 404

---

## PART 10 — COST SUMMARY

Everything we set up falls under the **AWS Free Tier** for the first 12 months:

| Service | Free Tier | What you get |
|---|---|---|
| S3 | 5 GB storage, 20,000 GET requests/month | More than enough for the frontend |
| CloudFront | 1 TB data transfer/month | Handles thousands of visitors |
| Route 53 | $0.50/month per hosted zone | ~£0.40/month — not free but very cheap |
| ACM (SSL) | Always free | Free SSL certificate |
| **Total** | | **~£0.40/month for the first year** |

After the free tier expires (12 months), expect ~£2–5/month for this setup.

---

## PART 11 — WHAT'S NEXT

Once the website is live and tested:

1. **Run UAT** — give testers their credentials from `TEST_CREDENTIALS.txt`
2. **Collect feedback** — note all bugs and issues
3. **Fix and redeploy** — use the `aws s3 sync` command to push fixes
4. **Purge test data** — each tester clears their browser storage when done
5. **Build the backend** — follow `BACKEND_ARCHITECTURE_ADVICE.md` when ready

---

## QUICK REFERENCE — COMMANDS YOU WILL USE OFTEN

```bash
# Upload all files to S3
aws s3 sync frontend/ s3://stemnestacademy.co.uk --delete

# Clear CloudFront cache (replace with your distribution ID)
aws cloudfront create-invalidation --distribution-id E1234ABCDEF --paths "/*"

# Upload a single changed file
aws s3 cp frontend/pages/login.html s3://stemnestacademy.co.uk/pages/login.html

# Check what is in your S3 bucket
aws s3 ls s3://stemnestacademy.co.uk
```

---

*Guide written for StemNest Academy. Domain: stemnestacademy.co.uk. Hosting: AWS S3 + CloudFront.*
