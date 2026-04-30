# StemNest Academy — Namecheap Deployment Guide

## What You're Uploading
The entire `frontend/` folder is your website. Everything inside it is plain HTML, CSS, and JavaScript — no build step needed.

---

## Step 1 — Add Your Domain to Namecheap Hosting

1. Log in to **Namecheap.com** → go to **Dashboard**
2. Click **Manage** next to your hosting plan
3. Click **cPanel** (the green button)
4. In cPanel, scroll to **Domains** → click **Addon Domains**
5. Enter your domain (e.g. `stemnest.co.uk`)
6. Namecheap will auto-fill the **Document Root** — change it to `public_html/stemnest` (or just `public_html` if this is your main domain)
7. Click **Add Domain**

> **If stemnest.co.uk is your main domain**, skip the above — just use `public_html` as the root.

---

## Step 2 — Point Your Domain's DNS to Namecheap

If your domain is registered at Namecheap:
1. Go to **Domain List** → click **Manage** next to your domain
2. Click the **Advanced DNS** tab
3. Set these records:

| Type | Host | Value |
|------|------|-------|
| A Record | @ | *(your Namecheap hosting IP — found in cPanel → General Information)* |
| A Record | www | *(same IP)* |
| CNAME | www | @ |

DNS changes take **up to 24 hours** to propagate (usually under 2 hours).

---

## Step 3 — Upload Your Files

### Option A — File Manager (easiest, no software needed)

1. In cPanel, click **File Manager**
2. Navigate to your document root folder (e.g. `public_html/stemnest` or `public_html`)
3. Click **Upload** (top toolbar)
4. Upload all files from your local `frontend/` folder

**Important:** Upload the *contents* of `frontend/`, not the folder itself. Your server root should contain:
```
index.html
404.html
.htaccess
css/
js/
pages/
assets/
```

### Option B — FTP (faster for large uploads)

1. In cPanel → **FTP Accounts** → create an FTP account
2. Download **FileZilla** (free) from filezilla-project.org
3. Open FileZilla → File → Site Manager → New Site
   - Host: `ftp.yourdomain.com`
   - Port: `21`
   - Protocol: `FTP`
   - Logon Type: `Normal`
   - User/Password: the FTP account you just created
4. Connect → drag your `frontend/` folder contents to the right panel (server root)

---

## Step 4 — Enable Free SSL (HTTPS)

1. In cPanel → scroll to **Security** → click **SSL/TLS Status**
2. Find your domain → click **Run AutoSSL**
3. Wait 2–5 minutes → your site will have a padlock 🔒

The `.htaccess` file already forces all traffic to HTTPS automatically.

---

## Step 5 — Test Your Site

Open your browser and visit:
- `https://stemnest.co.uk` → Homepage
- `https://stemnest.co.uk/pages/login.html` → Login
- `https://stemnest.co.uk/pages/blog.html` → Blog
- `https://stemnest.co.uk/pages/free-trial.html` → Book Trial

---

## Step 6 — Test All Login Credentials

Use the credentials in `TEST_CREDENTIALS.txt` to verify every dashboard works.

---

## Common Issues & Fixes

| Problem | Fix |
|---------|-----|
| Blank page / CSS not loading | Make sure you uploaded the *contents* of `frontend/`, not the folder itself |
| 404 on all pages | Check `.htaccess` was uploaded (it's a hidden file — enable "Show Hidden Files" in File Manager) |
| HTTP instead of HTTPS | Wait for AutoSSL to complete, then hard-refresh (Ctrl+Shift+R) |
| Images not showing | Check file names are lowercase — Linux servers are case-sensitive |
| Login not working | This is expected — all data is in localStorage, which is per-browser |

---

## File Structure on Server

After upload, your server root should look like this:
```
public_html/          (or public_html/stemnest/)
├── index.html        ← Homepage
├── 404.html          ← Custom error page
├── .htaccess         ← Apache config (HTTPS, caching, security)
├── css/
│   ├── global.css
│   ├── blog.css
│   └── ... (all other CSS files)
├── js/
│   ├── utils.js
│   ├── blog.js
│   └── ... (all other JS files)
├── pages/
│   ├── login.html
│   ├── blog.html
│   ├── blog-post.html
│   ├── free-trial.html
│   └── ... (all other pages)
│   └── legal/
│       ├── privacy-policy.html
│       └── ... (legal pages)
└── assets/
    ├── icons/
    └── images/
```

---

## Important Notes

- **All data is stored in the visitor's browser (localStorage)**. This means each device/browser has its own data. This is fine for testing and demos.
- **The backend** (`backend/` folder) is NOT uploaded — it requires a Node.js server which shared hosting doesn't support. This will be connected later when you upgrade to a VPS.
- **Test credentials** work on any device — they are seeded automatically on first login.

---

## When You're Ready for the Backend

When the Node.js backend is ready to connect, you'll need:
- **Namecheap VPS** (~£6/mo) — upgrade from shared hosting
- Or **Railway.app** (free tier) for the API + keep frontend on Namecheap

The frontend will just need one small change: swap `localStorage` calls for `fetch()` API calls to your backend URL.
