# Directive: Frontend

## Location
`frontend/`

## Structure
```
frontend/
├── index.html              ← Homepage (entry point)
├── assets/
│   ├── icons/              ← SVGs, favicon
│   └── images/             ← Hero illustrations, tutor photos
├── css/
│   ├── global.css          ← Variables, reset, nav, buttons, footer, animations
│   ├── home.css            ← Hero, stats, course preview, how-it-works, reviews, CTA
│   ├── courses.css         ← Filter bar, course cards, add-course modal
│   ├── login.css           ← Role switcher, login form, brand panel
│   └── dashboard.css       ← Sidebar, stats, sessions, projects, calendar
├── js/
│   ├── utils.js            ← navigate(), scrollToSection(), showToast(), setActiveNav()
│   ├── home.js             ← Word rotation, scroll reveal
│   ├── courses.js          ← Course data, renderGrid, filter/sort, add/delete modal
│   ├── login.js            ← loginConfig, switchRole, togglePw, handleLogin
│   └── dashboard.js        ← Tab switching, calendar, profile modal, greeting
└── pages/
    ├── courses.html
    ├── login.html
    ├── tutor-dashboard.html
    └── student-dashboard.html  ← 🔲 Not started
```

## Design system
- Fonts: Fredoka One (headings), Nunito (body) — loaded from Google Fonts
- All colour tokens and spacing live in `css/global.css` under `:root {}`
- To change a colour site-wide, update the CSS variable — it cascades everywhere

## Navigation
All page navigation uses `navigate(pageName)` from `js/utils.js`.
It resolves relative paths automatically whether called from root or `/pages/`.

```js
navigate('home')              // → index.html
navigate('courses')           // → pages/courses.html
navigate('login')             // → pages/login.html
navigate('tutor-dashboard')   // → pages/tutor-dashboard.html
```

## Current known issues
- No hamburger menu on mobile (nav links hidden at <900px)
- Courses reset on page refresh (no localStorage persistence yet)
- Login uses simulated auth — needs real API call to backend
- Student login redirect is a placeholder (→ home)

## Next tasks
1. Build `pages/student-dashboard.html` (see `directives/03_student_dashboard.md`)
2. Wire login form to real backend auth endpoint
3. Persist courses to localStorage as interim solution
4. Add mobile hamburger menu
