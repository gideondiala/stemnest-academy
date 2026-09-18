# 📋 StemNest Academy — Build Progress Tracker

> Last updated: April 2026
> Track every page, feature and task as the project grows.

---

## ✅ Legend
| Symbol | Meaning              |
|--------|----------------------|
| ✅     | Complete             |
| 🔄     | In Progress          |
| 🔲     | Not Started          |
| 🐛     | Bug / Fix Needed     |
| 💡     | Idea / Enhancement   |

---

## 📄 PAGE STATUS

---

### 1. 🏠 Homepage (`index.html`)
**Status: ✅ Complete**

| Section              | Status | Notes                                      |
|----------------------|--------|--------------------------------------------|
| Navbar               | ✅     | Sticky, logo, nav links, Log In + CTA      |
| Hero Section         | ✅     | Animated word rotation, floating cards     |
| Stats Bar            | ✅     | 500+ students, ratings, age range          |
| Courses Preview      | ✅     | 3 subject cards linking to courses page    |
| How It Works         | ✅     | 3-step process                             |
| Why StemNest         | ✅     | Full company description + 6 feature cards |
| Tutors Section       | ✅     | 4 tutor cards                              |
| Reviews Section      | ✅     | 3 parent reviews                           |
| CTA Banner           | ✅     | Free trial prompt                          |
| Footer               | ✅     | 4-column with social links                 |
| Scroll Reveal        | ✅     | Intersection Observer animations           |
| Mobile Responsive    | ✅     | Nav hidden, hero stacked, footer stacked   |

**Next improvements:**
- 💡 Add mobile hamburger menu
- 💡 Add real booking form to CTA section
- 💡 Add partner/trust logos strip (e.g. Ofsted, CPD, etc.)
- 💡 Add FAQ section

---

### 2. 📚 Courses Page (`pages/courses.html`)
**Status: ✅ Complete**

| Feature                    | Status | Notes                                      |
|----------------------------|--------|--------------------------------------------|
| Page hero                  | ✅     | Breadcrumb, title, stats                   |
| Filter tabs                | ✅     | All / Coding / Maths / Sciences            |
| Sort dropdown              | ✅     | Default, price, rating, popularity         |
| Course count               | ✅     | Updates live on filter/sort                |
| Course cards               | ✅     | Banner, stats, rating, price, enrol btn    |
| Popular / New badges       | ✅     | Orange and green pill badges               |
| Add Course (admin)         | ✅     | Modal with emoji, colour picker, all fields|
| Delete Course              | ✅     | Right-click to remove                      |
| 9 pre-loaded courses       | ✅     | Coding (3), Maths (3), Sciences (3)        |
| Mobile responsive          | ✅     | Filter bar stacks, cards wrap              |

**Next improvements:**
- 💡 Individual course detail pages (click through)
- 💡 Persist courses to localStorage so additions survive refresh
- 💡 Edit existing course (right-click → edit option)
- 💡 "Enrol Now" button links to booking/checkout flow
- 💡 Add Robotics and AI as new subjects/filter tabs

---

### 3. 🔐 Login Page (`pages/login.html`)
**Status: ✅ Complete**

| Feature                    | Status | Notes                                      |
|----------------------------|--------|--------------------------------------------|
| Tutor / Student role toggle| ✅     | Blue theme for tutor, green for student    |
| Dynamic welcome text       | ✅     | Changes per role                           |
| Dynamic brand panel        | ✅     | Right panel changes per role               |
| Email + password fields    | ✅     | With icons                                 |
| Show/hide password         | ✅     | Toggle button                              |
| Remember me checkbox       | ✅     |                                            |
| Forgot password link       | ✅     | Placeholder (no backend yet)               |
| Shake on empty submit      | ✅     | CSS animation                              |
| Login loading state        | ✅     | Button disables, shows spinner text        |
| Redirect after login       | ✅     | Tutor → dashboard, Student → TBD          |
| CTA swap by role           | ✅     | Tutor sees "Join Us", Student sees "Trial" |
| Trust badges               | ✅     | Secure, UK-based, DBS Verified             |
| Mobile responsive          | ✅     | Brand panel hidden on mobile               |

**Next improvements:**
- 💡 Connect to real authentication backend (Node.js / Firebase / Supabase)
- 💡 Add Google / Microsoft SSO for tutors
- 💡 Forgot password flow (email reset)
- 💡 Student login → Student dashboard page
- 💡 Add "Sign Up as a Tutor" registration form

---

### 4. 🎓 Tutor Dashboard (`pages/tutor-dashboard.html`)
**Status: ✅ Complete**

| Feature                      | Status | Notes                                      |
|------------------------------|--------|--------------------------------------------|
| Sidebar navigation           | ✅     | Active state, badges, logout               |
| Greeting (time-aware)        | ✅     | Good morning / afternoon / evening         |
| Today's date display         | ✅     | Formatted full date                        |
| Stat cards (4)               | ✅     | Sessions, students, projects, rating       |
| Quick Action buttons (4)     | ✅     | Sessions, Projects, Calendar, Profile      |
| Overview tab                 | ✅     | Sessions + projects side by side           |
| Sessions tab                 | ✅     | Today + tomorrow, live/upcoming/done       |
| Projects tab                 | ✅     | 5 pending + 1 reviewed, review button      |
| Calendar tab                 | ✅     | Full monthly calendar, prev/next nav       |
| Calendar session dots        | ✅     | Highlights days with sessions              |
| Weekly strip (overview)      | ✅     | 8-day scroll strip                         |
| Update Profile modal         | ✅     | Name, email, bio, subjects, availability   |
| Save profile toast           | ✅     | Confirmation notification                  |
| Mobile responsive            | ✅     | Sidebar hidden, stacks to single column    |

**Next improvements:**
- 💡 Student Dashboard page (next build)
- 💡 Live session join link (Zoom / Google Meet / custom)
- 💡 Project review modal (view submission + leave feedback)
- 💡 Add/edit/cancel sessions from calendar
- 💡 Notification bell with unread count
- 💡 Earnings / payment section
- 💡 Message inbox (tutor ↔ student/parent)
- 💡 Resource library (upload worksheets, links)

---

### 5. 🧑‍💻 Student Dashboard (`pages/student-dashboard.html`)
**Status: 🔲 Not Started — Next Up**

**Planned features:**
- Join live class button (prominent, top of page)
- Today's session info (tutor name, subject, time)
- My courses (enrolled courses progress bars)
- Homework / tasks due
- My projects (submitted work history)
- Progress report (charts — sessions completed, milestones)
- Parent access section (shareable progress link)
- Achievements / badges earned
- Book next session / reschedule

---

### 6. 📖 Individual Course Page (`pages/course-detail.html`)
**Status: 🔲 Not Started — Planned**

**Planned features:**
- Course banner, title, description
- Curriculum / what you'll learn (accordion)
- Tutor profile assigned to the course
- Price, age range, class count
- Sample session video (placeholder)
- Enrol / Book Free Trial CTA
- Related courses

---

### 7. 📅 Booking / Free Trial Page (`pages/booking.html`)
**Status: 🔲 Not Started — Planned**

**Planned features:**
- Subject selector
- Age / year group picker
- Date + time slot selector (calendar)
- Parent/guardian details form
- Student details form
- Confirmation screen
- Email confirmation (backend)

---

### 8. 👤 About Us Page (`pages/about.html`)
**Status: 🔲 Not Started — Planned**

**Planned features:**
- Full company story
- Founders section
- Mission & values
- Timeline / milestones
- Press mentions / awards
- Partner logos

---

### 9. 🛠️ Admin Panel (`pages/admin/`)
**Status: 🔲 Not Started — Future**

**Planned features:**
- Manage all tutors (approve, suspend, view)
- Manage all students
- Manage all courses
- View all sessions (live + upcoming + history)
- Revenue / payments overview
- Platform analytics

---

## 🐛 KNOWN ISSUES

| Issue                                   | Page             | Priority |
|-----------------------------------------|------------------|----------|
| Courses reset on page refresh           | courses.html     | Medium   |
| Mobile nav has no hamburger menu        | All pages        | Medium   |
| Login has no real auth backend          | login.html       | High     |
| Student login redirect not built yet    | login.html       | High     |
| "Join" buttons on sessions not linked   | tutor-dashboard  | Low      |

---

## 💡 GLOBAL ENHANCEMENTS (Future)

- [ ] Add favicon (`assets/icons/favicon.ico`)
- [ ] Add Open Graph meta tags for social sharing
- [ ] Add mobile hamburger menu (all pages)
- [ ] Add page loading transition animation
- [ ] Integrate backend (Node.js + Express or Firebase)
- [ ] Add database (PostgreSQL / Firestore)
- [ ] Add real authentication (JWT or Firebase Auth)
- [ ] Add payment gateway (Stripe)
- [ ] Deploy to production (Netlify or Vercel)
- [ ] Add Google Analytics
- [ ] Add cookie consent banner
- [ ] SEO: add meta descriptions to all pages
- [ ] Accessibility audit (ARIA labels, keyboard nav)

---

## 📅 BUILD LOG

| Date         | What was built                                         |
|--------------|--------------------------------------------------------|
| April 2026   | Homepage (hero, sections, footer)                      |
| April 2026   | Courses page (filter, sort, add/delete modal)          |
| April 2026   | Login page (dual role, brand panel, redirect)          |
| April 2026   | Tutor dashboard (sidebar, tabs, calendar, profile)     |
| April 2026   | Project restructured into proper folder architecture   |
| —            | Student dashboard — **up next**                        |

---

*Keep building. Keep tracking. 🚀*
