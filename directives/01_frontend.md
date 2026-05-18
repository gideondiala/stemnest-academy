# Directive: Frontend Architecture

## Location
`frontend/`

## Deployment
- Hosted on AWS S3 bucket `stemnest-site` (eu-west-2)
- Served via CloudFront distribution `E3TA4L9WKURJAP`
- Domain: `https://stemnestacademy.co.uk`
- After any change: `aws s3 sync frontend/ s3://stemnest-site --delete` then invalidate CloudFront

---

## File Structure

```
frontend/
├── index.html                    ← Homepage
├── 404.html                      ← CloudFront 404 handler
├── .htaccess                     ← Apache fallback (not used on S3)
├── assets/
│   ├── icons/                    ← Favicon, app icon
│   └── images/                   ← Logo files
├── css/
│   ├── global.css                ← CSS variables, reset, nav, footer, buttons
│   ├── home.css                  ← Homepage styles
│   ├── courses.css               ← Courses page
│   ├── login.css                 ← Login page
│   ├── dashboard.css             ← Tutor dashboard
│   ├── student-dashboard.css     ← Student dashboard
│   ├── admin-dashboard.css       ← Admin dashboard
│   ├── presales-dashboard.css    ← Pre-sales dashboard
│   ├── postsales-dashboard.css   ← Post-sales dashboard
│   ├── sales-dashboard.css       ← Sales dashboard
│   ├── operations-dashboard.css  ← Operations dashboard
│   ├── hr-dashboard.css          ← HR dashboard
│   ├── super-admin.css           ← Founder dashboard
│   ├── join-class.css            ← Public join-class page
│   ├── blog.css                  ← Blog listing
│   └── blog-post.css             ← Blog post detail
├── js/
│   ├── api.js                    ← Auth.login(), apiCall(), token management
│   ├── api-sync.js               ← Sessions.upcoming(), sync helpers
│   ├── utils.js                  ← navigate(), showToast(), isApiAvailable()
│   ├── wa.js                     ← WhatsApp message helpers
│   ├── login.js                  ← Login page logic
│   ├── dashboard.js              ← Tutor dashboard (profile, calendar, bookings)
│   ├── tutor-sessions.js         ← Session lifecycle (join, end, absent watcher)
│   ├── tutor-sessions-v2.js      ← End-class modal, earnings, paysheet
│   ├── tutor-companion.js        ← Companion materials tab
│   ├── course-scheduler.js       ← Course scheduling UI
│   ├── student-dashboard.js      ← Student dashboard (API-driven, no mock data)
│   ├── admin-dashboard.js        ← Admin dashboard (bookings, teachers, courses)
│   ├── presales-dashboard.js     ← Pre-sales (demo scheduling, teacher assign)
│   ├── postsales-dashboard.js    ← Post-sales (onboarding, payments, credits)
│   ├── sales-dashboard.js        ← Sales pipeline
│   ├── operations-dashboard.js   ← Operations (late joins, class reports)
│   ├── hr-dashboard.js           ← HR (applications, interviews, training)
│   ├── super-admin.js            ← Founder dashboard (reports, API-driven)
│   ├── join-class.js             ← Public class lookup by email/phone
│   ├── blog.js                   ← Blog listing (API-driven)
│   ├── blog-post.js              ← Blog post detail (API-driven)
│   └── admin-blog.js             ← Blog management (admin only)
└── pages/
    ├── login.html
    ├── tutor-dashboard.html
    ├── student-dashboard.html
    ├── admin-dashboard.html
    ├── presales-dashboard.html
    ├── postsales-dashboard.html
    ├── sales-dashboard.html
    ├── operations-dashboard.html
    ├── hr-dashboard.html
    ├── super-admin.html
    ├── join-class.html
    ├── free-trial.html
    ├── courses.html
    ├── blog.html
    ├── blog-post.html
    ├── about.html
    ├── team.html
    ├── faq.html
    ├── teach-with-us.html
    └── legal/
        ├── privacy-policy.html
        ├── terms-of-use.html
        ├── refund-policy.html
        ├── disclaimer.html
        └── payment-policy.html
```

---

## Design System

- **Fonts:** Fredoka One (headings), Nunito (body) — Google Fonts
- **Colours:** All defined as CSS variables in `css/global.css` under `:root {}`
- **Key variables:** `--blue`, `--green`, `--orange`, `--purple`, `--dark`, `--mid`, `--light`, `--bg`, `--white`
- **Never hardcode hex colours** — always use the CSS variable

---

## Navigation

All page navigation uses `navigate(pageName)` from `js/utils.js`:

```js
navigate('home')                // → index.html
navigate('login')               // → pages/login.html
navigate('tutor-dashboard')     // → pages/tutor-dashboard.html
navigate('student-dashboard')   // → pages/student-dashboard.html
navigate('admin-dashboard')     // → pages/admin-dashboard.html
navigate('presales-dashboard')  // → pages/presales-dashboard.html
navigate('postsales-dashboard') // → pages/postsales-dashboard.html
navigate('super-admin')         // → pages/super-admin.html
```

---

## API Base URL

All API calls go to `https://api.stemnestacademy.co.uk`.
This is set in `js/api.js` as `const API_URL`.

---

## Auth Token Pattern

Every authenticated API call must include:
```js
headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sn_access_token') }
```

The `apiCall()` helper in `api.js` handles this automatically including token refresh.

---

## localStorage — What Is and Is NOT Allowed

| Key                    | Allowed | Purpose                              |
|------------------------|---------|--------------------------------------|
| `sn_access_token`      | ✅ YES  | JWT access token (7-day expiry)      |
| `sn_refresh_token`     | ✅ YES  | JWT refresh token (30-day expiry)    |
| `sn_logged_in_teacher` | ✅ YES  | Tutor's staff_id (e.g. CT004)        |
| `sn_current_tutor`     | ✅ YES  | Full tutor profile JSON (set at login) |
| `sn_logged_in_student` | ✅ YES  | Student's email (for session)        |
| `sn_teachers`          | ❌ NO   | REMOVED — was hardcoded mock data    |
| `sn_students`          | ❌ NO   | REMOVED — data lives in DB           |
| `sn_bookings`          | ❌ NO   | REMOVED — data lives in DB           |
| `sn_sales_persons`     | ❌ NO   | REMOVED — data lives in DB           |
| `sn_staff`             | ❌ NO   | REMOVED — data lives in DB           |
| Any business data      | ❌ NO   | All business data comes from the API |

---

## Common Patterns

### Loading data on page init
```js
document.addEventListener('DOMContentLoaded', () => {
  _loadXxxFromAPI().then(() => {
    renderUI();
  });
});

async function _loadXxxFromAPI() {
  const token = localStorage.getItem('sn_access_token');
  if (!token) return;
  const res = await fetch('https://api.stemnestacademy.co.uk/api/...', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!res.ok) return;
  const data = await res.json();
  // populate window.XXX_DATA
}
```

### Global data stores (per dashboard)
- Tutor dashboard: `window.TUTOR_DATA = { bookings: [], materials: [] }`
- Admin dashboard: `window.ADMIN_DATA = { bookings: [], tutors: [], courses: [], ... }`
- Presales dashboard: `window.PS_DATA = { bookings: [], teachers: [], sales: [] }`
- Post-sales dashboard: `window.POS_DATA = { bookings: [], students: [], teachers: [] }`
- Super admin: `window.SA_DATA = { bookings: [], tutors: [], sales: [] }`
- Student dashboard: `window.STUDENT_DATA = { profile: null, bookings: [], courses: [], projects: [] }`
