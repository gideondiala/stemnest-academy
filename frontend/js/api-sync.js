/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — API SYNC (api-sync.js)
   Bidirectional sync between localStorage and real API.
   - On page load: pulls real data from API into localStorage
   - On data write: pushes to API in background
   Load this after api.js and before dashboard JS files.
═══════════════════════════════════════════════════════ */

const API_BASE = 'https://api.stemnestacademy.co.uk';

/* ── Auth token helper ── */
function _authHeader() {
  const token = localStorage.getItem('sn_access_token');
  return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

/* ── Convert API time "HH:MM:SS" to "H:MM AM/PM" display format ── */
function _formatApiTime(t) {
  if (!t) return '—';
  /* Already in 12h format */
  if (/AM|PM/i.test(t)) return t;
  /* Convert HH:MM or HH:MM:SS to 12h */
  const parts = t.split(':');
  let h = parseInt(parts[0]);
  const m = parts[1] || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + period;
}

/* ── Fire-and-forget API push ── */
async function _push(endpoint, data) {
  try {
    const token = localStorage.getItem('sn_access_token');
    if (!token) return;
    await fetch(API_BASE + endpoint, {
      method:  'POST',
      headers: _authHeader(),
      body:    JSON.stringify(data),
    });
  } catch (e) { /* silent — localStorage is the fallback */ }
}

/* ─────────────────────────────────────────────
   PULL: Sync from API into localStorage
───────────────────────────────────────────── */

async function syncBookingsFromAPI() {
  try {
    if (!Auth.isLoggedIn()) return;
    const data = await Bookings.list({ limit: 500 });
    if (!data.bookings || !data.bookings.length) return;

    const apiBookings = data.bookings.map(b => {
      /* Parse notes — may be JSON object, JSON string, or plain text */
      let notes = {};
      if (b.notes) {
        if (typeof b.notes === 'object') {
          notes = b.notes;
        } else {
          try { notes = JSON.parse(b.notes); } catch { notes = {}; }
        }
      }

      /* Student name: try multiple sources */
      const studentName = b.student_name ||
                          notes.studentName ||
                          b.lesson_name ||   /* we store studentName in lesson_name for demo bookings */
                          '—';

      /* Phone: try multiple sources */
      const whatsapp = notes.whatsapp || b.student_phone || '—';
      const email    = b.student_email || notes.email || '—';

      return {
        id:              b.id,
        studentName:     studentName,
        age:             notes.age      || b.grade || '—',
        grade:           b.grade        || notes.grade || '—',
        email:           email,
        whatsapp:        whatsapp,
        parentName:      notes.parentName || '—',
        subject:         b.subject,
        date:            typeof b.date === 'string' ? b.date.split('T')[0] : b.date,
        time:            _formatApiTime(b.time),
        status:          b.status,
        assignedTutor:   b.tutor_name   || '—',
        /* CRITICAL: use staff_id (CT001) not UUID so tutor dashboard filter works */
        assignedTutorId: b.tutor_staff_id || b.tutor_id || '',
        assignedSalesId: b.sales_staff_id || b.sales_id || '',
        classLink:       b.class_link   || '',
        lessonName:      b.lesson_name_full || b.lesson_name || '',
        lessonNumber:    b.lesson_number,
        totalLessons:    b.total_lessons,
        activityLink:    b.lesson_activity || b.activity_link || '',
        slidesLink:      b.lesson_slides   || b.slides_link  || '',
        courseName:      b.course_name || '',
        isDemoClass:     b.is_demo,
        isRecurring:     b.is_recurring,
        paymentAmount:   b.payment_amount,
        bookedAt:        b.booked_at || b.created_at,
        scheduledAt:     b.scheduled_at,
        completedAt:     b.completed_at,
        salesStatus:     b.status === 'completed' ? 'converted' : undefined,
        device:          notes.device || '—',
        timezone:        notes.timezone || '—',
        dbId:            b.id,
        _fromApi:        true,
      };
    });

    const local = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    const apiIds = new Set(apiBookings.map(b => b.id));
    const localOnly = local.filter(b => !apiIds.has(b.id) && !b._fromApi);
    localStorage.setItem('sn_bookings', JSON.stringify([...apiBookings, ...localOnly]));
  } catch (e) { console.warn('[API Sync] Bookings sync failed:', e.message); }
}

async function syncCoursesFromAPI() {
  try {
    const data = await Courses.list();
    if (!data.courses || !data.courses.length) return;
    const apiCourses = data.courses.map(c => ({
      id: c.id, name: c.name, desc: c.description, subject: c.subject,
      level: c.level, age: c.age_range, price: c.price, classes: c.num_classes,
      duration: c.duration, rating: c.rating, students: c.students,
      emoji: c.emoji || '📚', color: c.color || 'blue', badge: c.badge || '',
      _fromApi: true,
    }));
    if (apiCourses.length > 0) localStorage.setItem('sn_courses', JSON.stringify(apiCourses));
  } catch (e) { console.warn('[API Sync] Courses sync failed:', e.message); }
}

async function syncTeachersFromAPI() {
  try {
    if (!Auth.isLoggedIn()) return;
    const data = await apiCall('/api/users?role=tutor');
    if (!data.users || !data.users.length) return;
    const apiTeachers = data.users.map(u => ({
      id: u.staff_id || u.id, name: u.name,
      initials: u.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(),
      email: u.email, subject: u.subject || 'Coding',
      courses: u.courses || [], gradeGroups: u.grade_groups || [],
      availability: u.availability || 'Mon–Fri, 9am–6pm',
      dbs: u.dbs_checked || 'yes', photo: u.photo_url || null,
      color: u.color || 'linear-gradient(135deg,#1a56db,#4f87f5)', _fromApi: true,
    }));
    if (apiTeachers.length > 0) {
      const local = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
      const apiIds = new Set(apiTeachers.map(t => t.id));
      const localOnly = local.filter(t => !apiIds.has(t.id) && !t._fromApi);
      localStorage.setItem('sn_teachers', JSON.stringify([...apiTeachers, ...localOnly]));
    }
  } catch (e) { console.warn('[API Sync] Teachers sync failed:', e.message); }
}

async function syncSalesFromAPI() {
  try {
    if (!Auth.isLoggedIn()) return;
    const data = await apiCall('/api/users?role=sales');
    if (!data.users || !data.users.length) return;
    const apiSales = data.users.map(u => ({
      id: u.staff_id || u.id, name: u.name,
      initials: u.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(),
      email: u.email, phone: u.phone || '', region: 'Global',
      color: 'linear-gradient(135deg,#ff6b35,#fbbf24)', photo: u.photo_url || null, _fromApi: true,
    }));
    if (apiSales.length > 0) localStorage.setItem('sn_sales_persons', JSON.stringify(apiSales));
  } catch (e) { console.warn('[API Sync] Sales sync failed:', e.message); }
}

async function syncDashboardData() {
  try {
    if (!Auth.isLoggedIn()) return;
    const user = Auth.getStoredUser();
    if (!user) return;

    const role = user.role;
    if (!['operations','sales','presales','postsales'].includes(role)) return;

    const token = localStorage.getItem('sn_access_token');
    const res = await fetch(API_BASE + '/api/sync/dashboard/' + role, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (!res.ok) return;
    const data = await res.json();

    /* Operations */
    if (data.lateJoins) {
      const mapped = data.lateJoins.map(l => ({
        tutorId:   l.tutor_id, tutorName: l.tutor_name || '—',
        sessionId: l.booking_id, joinTime: l.join_time,
        month:     l.created_at ? new Date(l.created_at).getFullYear() + '-' + (new Date(l.created_at).getMonth() + 1) : '',
        date:      l.created_at, penalty: l.penalty || 0, pardoned: l.pardoned,
        _fromApi:  true,
      }));
      localStorage.setItem('sn_late_joins', JSON.stringify(mapped));
    }
    if (data.classReports) {
      const mapped = data.classReports.map(r => ({
        bookingId: r.booking_id, tutorName: r.tutor_name || '—',
        outcome: r.outcome, classQuality: r.class_quality,
        studentInterest: r.student_interest, incompleteReason: r.incomplete_reason,
        notes: r.notes, recordingLink: r.recording_link,
        date: r.date, time: r.time, subject: r.subject, _fromApi: true,
      }));
      localStorage.setItem('sn_class_reports', JSON.stringify(mapped));
    }
    if (data.absentTeachers) {
      localStorage.setItem('sn_absent_teachers', JSON.stringify(data.absentTeachers));
    }

    /* Sales pipeline */
    if (data.pipeline) {
      const salesId = user.staffId || user.id;
      const mapped = data.pipeline.map(p => ({
        bookingId: p.booking_id, studentName: p.student_name || '—',
        subject: p.subject, date: p.date, email: p.student_email || '—',
        course: p.course_pitched, status: p.status,
        interest: p.interest_level, purchasingPower: p.purchasing_power,
        paymentAmount: p.payment_amount, notes: p.notes, _fromApi: true,
      }));
      localStorage.setItem('sn_pipeline_' + salesId, JSON.stringify(mapped));
    }

    /* Postsales students */
    if (data.students) {
      const existing = JSON.parse(localStorage.getItem('sn_students') || '[]');
      const apiEmails = new Set(data.students.map(s => s.email));
      const localOnly = existing.filter(s => !apiEmails.has(s.email) && !s._fromApi);
      const apiStudents = data.students.map(s => ({
        id: s.id, name: s.name, email: s.email, phone: s.phone || '',
        grade: s.grade || '', credits: s.credits || 0, _fromApi: true,
      }));
      localStorage.setItem('sn_students', JSON.stringify([...apiStudents, ...localOnly]));
    }

  } catch (e) { console.warn('[API Sync] Dashboard sync failed:', e.message); }
}

async function syncNotificationsFromAPI() {
  try {
    if (!Auth.isLoggedIn()) return;
    const data = await Users.getNotifications();
    if (data.notifications) {
      const unread = data.notifications.filter(n => !n.is_read).length;
      const badge = document.getElementById('notifBadge');
      if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'inline-block' : 'none'; }
      localStorage.setItem('sn_notifications', JSON.stringify(data.notifications));
    }
  } catch (e) { /* silent */ }
}

/* ─────────────────────────────────────────────
   PUSH: Send data to API when written locally
───────────────────────────────────────────── */

/** Call after a class report is saved locally */
function pushClassReport(bookingId, reportData) {
  _push('/api/sync/class-reports', { bookingId, ...reportData });
}

/** Call after a pitch record is saved locally */
function pushPipelineRecord(record) {
  _push('/api/sync/pipeline', record);
}

/** Call after a late join is logged locally */
function pushLateJoin(data) {
  _push('/api/sync/late-joins', data);
}

/** Call after student credits change */
function pushCreditsUpdate(studentEmail, credits, type, description, bookingId) {
  _push('/api/sync/credits', { studentEmail, credits, type, description, bookingId });
}

/* ─────────────────────────────────────────────
   MASTER SYNC — runs on page load
───────────────────────────────────────────── */
async function runApiSync() {
  const online = await isApiAvailable();
  if (!online) { console.log('[API Sync] API offline — using localStorage'); return; }

  console.log('[API Sync] Syncing from API...');

  await Promise.allSettled([
    syncCoursesFromAPI(),
    syncTeachersFromAPI(),
    syncSalesFromAPI(),
  ]);

  if (Auth.isLoggedIn()) {
    await Promise.allSettled([
      syncBookingsFromAPI(),
      syncDashboardData(),
      syncNotificationsFromAPI(),
    ]);
  }

  console.log('[API Sync] Sync complete');
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(runApiSync, 500);

  /* ── Auto-refresh every 30 seconds for real-time data ── */
  setInterval(async () => {
    if (!Auth.isLoggedIn()) return;
    const online = await isApiAvailable();
    if (!online) return;

    /* Silently refresh bookings and dashboard data */
    await Promise.allSettled([
      syncBookingsFromAPI(),
      syncDashboardData(),
    ]);

    /* Re-render the active tab if a render function exists */
    const user = Auth.getStoredUser();
    if (!user) return;

    /* Presales — re-render incoming if visible */
    if (typeof renderIncoming === 'function' && document.getElementById('tab-incoming')?.style.display !== 'none') {
      renderIncoming();
      if (typeof updatePSStats === 'function') updatePSStats();
    }
    /* Admin — re-render bookings if visible */
    if (typeof loadBookings === 'function' && document.getElementById('tab-bookings')?.style.display !== 'none') {
      loadBookings();
    }
    /* Tutor — re-render upcoming cards */
    if (typeof renderUpcomingCards === 'function') {
      renderUpcomingCards();
    }
    /* Sales — re-render overview */
    if (typeof renderOverview === 'function' && document.getElementById('tab-overview')?.style.display !== 'none') {
      renderOverview();
      if (typeof updateStats === 'function') updateStats();
    }
    /* HR — re-render applications */
    if (typeof renderApplications === 'function' && document.getElementById('tab-applications')?.style.display !== 'none') {
      renderApplications();
    }
  }, 30000); /* 30 seconds */
});

window.addEventListener('sn:login', runApiSync);
