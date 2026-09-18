# 🪺 StemNest Academy — Web Project

> Expert 1-on-1 online tutoring in Coding, Maths and Sciences for students aged 7–19.
> UK-based. Globally accessible.

---

## 📁 Project Structure

```
stemnest-academy/
│
├── index.html                   ← Homepage (entry point)
│
├── pages/
│   ├── courses.html             ← Full courses catalogue with filter/sort/add
│   ├── login.html               ← Tutor & Student login page
│   ├── tutor-dashboard.html     ← Tutor portal (sessions, projects, calendar, profile)
│   └── student-dashboard.html  ← [COMING SOON] Student portal
│
├── css/
│   ├── global.css               ← Variables, reset, nav, buttons, footer, animations
│   ├── home.css                 ← Hero, stats bar, course preview, how-it-works, why, reviews, CTA
│   ├── courses.css              ← Filter bar, course cards, add-course modal
│   ├── login.css                ← Role switcher, login form, brand panel
│   └── dashboard.css            ← Sidebar, stats, sessions, projects, calendar, profile modal
│
├── js/
│   ├── utils.js                 ← navigate(), scrollToSection(), showToast(), setActiveNav()
│   ├── home.js                  ← Word rotation, scroll reveal
│   ├── courses.js               ← Course data, renderGrid, filter/sort, add/delete modal
│   ├── login.js                 ← loginConfig, switchRole, togglePw, handleLogin
│   └── dashboard.js             ← Tab switching, calendar, profile modal, greeting
│
├── assets/
│   ├── images/                  ← Site images (hero illustrations, tutor photos, etc.)
│   └── icons/                   ← Custom SVG icons and favicon
│
├── README.md                    ← This file
└── PROGRESS.md                  ← Page-by-page build tracker
```

---

## 🎨 Brand & Design System

### Colours
| Name    | Hex       | Usage                              |
|---------|-----------|------------------------------------|
| Blue    | `#1a56db` | Primary — nav, CTAs, headings      |
| Green   | `#0e9f6e` | Success, student theme, sciences   |
| Orange  | `#ff6b35` | Accent, enrol buttons, CTA         |
| Purple  | `#7c3aed` | Course tags, dashboard accents     |
| Dark    | `#1a202c` | Body text, stats bar, footer       |
| Light   | `#718096` | Subtext, labels, hints             |
| BG      | `#f7f9ff` | Page background                    |

### Typography
| Font          | Weight      | Usage                          |
|---------------|-------------|--------------------------------|
| Fredoka One   | 400         | All headings, logo, card titles |
| Nunito        | 400–900     | Body, buttons, labels, nav     |

### CSS Variables
All design tokens live in `css/global.css` under `:root {}`.
To change a colour site-wide, update the variable — it cascades everywhere.

---

## 🔗 Page Navigation Map

```
index.html
  ├── → pages/courses.html         (nav + course cards)
  ├── → pages/login.html           (Log In button)
  └── → #sections (hash scroll)    (How It Works, Tutors, Reviews, CTA)

pages/courses.html
  ├── → ../index.html              (Home nav link)
  └── → login.html                 (Log In button)

pages/login.html
  ├── Tutor login  → tutor-dashboard.html   (on successful login)
  ├── Student login → index.html            (student dashboard — coming soon)
  └── → courses.html / ../index.html        (nav links)

pages/tutor-dashboard.html
  └── → login.html                 (Log Out)
```

---

## ⚙️ How JS Navigation Works

All page navigation uses `navigate(pageName)` from `js/utils.js`.
It automatically resolves relative paths whether called from root or `/pages/`.

```js
navigate('home')             // → index.html
navigate('courses')          // → pages/courses.html
navigate('login')            // → pages/login.html
navigate('tutor-dashboard')  // → pages/tutor-dashboard.html
```

---

## 🚀 Getting Started

No build tools or dependencies needed. Pure HTML, CSS and JavaScript.

1. Clone or download the project folder
2. Open `index.html` in any modern browser
3. All pages link to each other — just click through

> **Tip:** Use VS Code with the **Live Server** extension for hot-reload during development.

---

## 🧪 Test Credentials (Demo)

The login page currently uses a simulated auth (no real backend yet).
Any non-empty email + password will work for demo purposes.

| Role    | Redirect after login         |
|---------|------------------------------|
| Tutor   | `tutor-dashboard.html`       |
| Student | `index.html` (placeholder)   |

---

## 📦 Tech Stack

| Layer      | Technology                  |
|------------|-----------------------------|
| Markup     | HTML5 (semantic)            |
| Styling    | CSS3 (custom properties, grid, flexbox) |
| Scripting  | Vanilla JavaScript (ES6+)   |
| Fonts      | Google Fonts (Fredoka One + Nunito) |
| Icons      | Emoji (native, no library)  |
| Hosting    | Any static host (Netlify, Vercel, GitHub Pages) |

---

## 🗺️ Upcoming Pages (Roadmap)

See `PROGRESS.md` for full status.

| Page                    | Status       |
|-------------------------|--------------|
| Homepage                | ✅ Complete   |
| Courses Page            | ✅ Complete   |
| Login Page              | ✅ Complete   |
| Tutor Dashboard         | ✅ Complete   |
| Student Dashboard       | 🔲 Next up   |
| About Us                | 🔲 Planned   |
| Individual Course Page  | 🔲 Planned   |
| Booking / Free Trial    | 🔲 Planned   |
| Blog / Resources        | 🔲 Planned   |
| Admin Panel             | 🔲 Planned   |

---

## 👥 Team

| Name                | Role                    |
|---------------------|-------------------------|
| StemNest Founders   | Product & Content       |
| Development         | In progress             |

---

*© 2025 StemNest Academy Ltd. Registered in England & Wales.*
