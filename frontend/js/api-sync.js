/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — API SYNC (api-sync.js)
   Syncs real API data into localStorage so all existing
   dashboard JS continues to work without changes.
   Load this after api.js and before dashboard JS files.
═══════════════════════════════════════════════════════ */

/* ── Sync bookings from API into localStorage ── */
async function syncBookingsFromAPI() {
  try {
    if (!Auth.isLoggedIn()) return;
    const data = await Bookings.list({ limit: 500 });
    if (!data.bookings || !data.bookings.length) return;

    const apiBookings = data.bookings.map(b => {
      /* Parse notes JSON if stored there (demo bookings) */
      let notes = {};
      try { notes = typeof b.notes === 'string' ? JSON.parse(b.notes) : (b.notes || {}); } catch {}

      return {
        id:              b.id,
        studentName:     b.student_name || notes.studentName || '—',
        age:             notes.age      || b.grade || '—',
        grade:           b.grade        || notes.grade || '—',
        email:           b.student_email || notes.email || '—',
        whatsapp:        notes.whatsapp  || '—',
        parentName:      notes.parentName || '—',
        subject:         b.subject,
        date:            b.date,
        time:            b.time,
        status:          b.status,
        assignedTutor:   b.tutor_name   || '—',
        assignedTutorId: b.tutor_id     || '',
        assignedSalesId: b.sales_id     || '',
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
        _fromApi:        true,
      };
    });

    /* Merge: API bookings take priority, keep localStorage-only ones */
    const local = JSON.parse(localStorage.getItem('sn_bookings') || '[]');
    const apiIds = new Set(apiBookings.map(b => b.id));
    const localOnly = local.filter(b => !apiIds.has(b.id) && !b._fromApi);
    const merged = [...apiBookings, ...localOnly];
    localStorage.setItem('sn_bookings', JSON.stringify(merged));
  } catch (e) {
    console.warn('[API Sync] Bookings sync failed:', e.message);
  }
}

/* ── Sync courses from API into localStorage ── */
async function syncCoursesFromAPI() {
  try {
    const data = await Courses.list();
    if (!data.courses || !data.courses.length) return;

    const apiCourses = data.courses.map(c => ({
      id:       c.id,
      name:     c.name,
      desc:     c.description,
      subject:  c.subject,
      level:    c.level,
      age:      c.age_range,
      price:    c.price,
      classes:  c.num_classes,
      duration: c.duration,
      rating:   c.rating,
      students: c.students,
      emoji:    c.emoji || '📚',
      color:    c.color || 'blue',
      badge:    c.badge || '',
      _fromApi: true,
    }));

    /* Only replace if API has data */
    if (apiCourses.length > 0) {
      localStorage.setItem('sn_courses', JSON.stringify(apiCourses));
    }
  } catch (e) {
    console.warn('[API Sync] Courses sync failed:', e.message);
  }
}

/* ── Sync teachers from API into localStorage ── */
async function syncTeachersFromAPI() {
  try {
    if (!Auth.isLoggedIn()) return;
    const data = await apiCall('/api/users?role=tutor');
    if (!data.users || !data.users.length) return;

    const apiTeachers = data.users.map(u => ({
      id:           u.staff_id || u.id,
      name:         u.name,
      initials:     u.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(),
      email:        u.email,
      subject:      u.subject || 'Coding',
      courses:      u.courses || [],
      gradeGroups:  u.grade_groups || [],
      availability: u.availability || 'Mon–Fri, 9am–6pm',
      dbs:          u.dbs_checked || 'yes',
      photo:        u.photo_url || null,
      color:        u.color || 'linear-gradient(135deg,#1a56db,#4f87f5)',
      _fromApi:     true,
    }));

    if (apiTeachers.length > 0) {
      /* Merge with local (keep local photo uploads etc.) */
      const local = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
      const apiIds = new Set(apiTeachers.map(t => t.id));
      const localOnly = local.filter(t => !apiIds.has(t.id) && !t._fromApi);
      localStorage.setItem('sn_teachers', JSON.stringify([...apiTeachers, ...localOnly]));
    }
  } catch (e) {
    console.warn('[API Sync] Teachers sync failed:', e.message);
  }
}

/* ── Sync sales persons from API into localStorage ── */
async function syncSalesFromAPI() {
  try {
    if (!Auth.isLoggedIn()) return;
    const data = await apiCall('/api/users?role=sales');
    if (!data.users || !data.users.length) return;

    const apiSales = data.users.map(u => ({
      id:       u.staff_id || u.id,
      name:     u.name,
      initials: u.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(),
      email:    u.email,
      phone:    u.phone || '',
      region:   'Global',
      color:    'linear-gradient(135deg,#ff6b35,#fbbf24)',
      photo:    u.photo_url || null,
      _fromApi: true,
    }));

    if (apiSales.length > 0) {
      localStorage.setItem('sn_sales_persons', JSON.stringify(apiSales));
    }
  } catch (e) {
    console.warn('[API Sync] Sales sync failed:', e.message);
  }
}

/* ── Sync payments from API into localStorage ── */
async function syncPaymentsFromAPI() {
  try {
    if (!Auth.isLoggedIn()) return;
    const user = Auth.getStoredUser();
    if (!user) return;

    let data;
    if (['admin','super_admin','postsales'].includes(user.role)) {
      data = await Payments.list();
    } else if (user.role === 'student') {
      data = await Payments.studentHistory(user.id);
    } else {
      return;
    }

    if (data.payments && data.payments.length) {
      localStorage.setItem('sn_payment_links', JSON.stringify(
        data.payments.map(p => ({
          id:        p.id,
          student:   p.student_name || '—',
          email:     p.student_email || '—',
          course:    p.course_name || '—',
          amount:    p.amount,
          currency:  p.currency,
          credits:   p.credits_purchased,
          status:    p.status,
          createdAt: p.created_at,
          _fromApi:  true,
        }))
      ));
    }
  } catch (e) {
    console.warn('[API Sync] Payments sync failed:', e.message);
  }
}

/* ── Sync notifications from API ── */
async function syncNotificationsFromAPI() {
  try {
    if (!Auth.isLoggedIn()) return;
    const data = await Users.getNotifications();
    if (data.notifications) {
      const unread = data.notifications.filter(n => !n.is_read).length;
      /* Update any notification badge in the UI */
      const badge = document.getElementById('notifBadge');
      if (badge) {
        badge.textContent = unread;
        badge.style.display = unread > 0 ? 'inline-block' : 'none';
      }
      localStorage.setItem('sn_notifications', JSON.stringify(data.notifications));
    }
  } catch (e) { /* silent */ }
}

/* ── Master sync — runs on page load ── */
async function runApiSync() {
  const online = await isApiAvailable();
  if (!online) {
    console.log('[API Sync] API offline — using localStorage');
    return;
  }

  console.log('[API Sync] Syncing from API...');

  /* Run syncs in parallel where possible */
  await Promise.allSettled([
    syncCoursesFromAPI(),
    syncTeachersFromAPI(),
    syncSalesFromAPI(),
  ]);

  /* Bookings and payments need auth */
  if (Auth.isLoggedIn()) {
    await Promise.allSettled([
      syncBookingsFromAPI(),
      syncPaymentsFromAPI(),
      syncNotificationsFromAPI(),
    ]);
  }

  console.log('[API Sync] Sync complete');
}

/* ── Auto-run on page load ── */
document.addEventListener('DOMContentLoaded', () => {
  /* Small delay to let dashboard JS initialise first */
  setTimeout(runApiSync, 500);
});

/* ── Also sync when user logs in ── */
window.addEventListener('sn:login', runApiSync);
