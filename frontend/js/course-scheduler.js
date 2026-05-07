/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — COURSE SCHEDULER (course-scheduler.js)
   Handles recurring lesson generation and rescheduling.
   ─────────────────────────────────────────────────────
   KEY CONCEPTS:
   - An "enrolment" links a student to a course + teacher
     with a fixed weekly schedule (e.g. Mon 18:00 + Wed 16:00)
   - On enrolment, ALL lesson bookings are auto-generated
     and written to sn_bookings + teacher calendar
   - Rescheduling one lesson shifts it + all future lessons
     forward by one learning day in the weekly pattern
═══════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────
   STORAGE HELPERS
───────────────────────────────────────────────────── */
function getEnrolments() {
  try { return JSON.parse(localStorage.getItem('sn_enrolments') || '[]'); } catch { return []; }
}
function saveEnrolments(list) { localStorage.setItem('sn_enrolments', JSON.stringify(list)); }

function getAllBookings() {
  try { return JSON.parse(localStorage.getItem('sn_bookings') || '[]'); } catch { return []; }
}
function saveAllBookings(list) { localStorage.setItem('sn_bookings', JSON.stringify(list)); }

function getCourseList() {
  try {
    const stored = JSON.parse(localStorage.getItem('sn_courses') || '[]');
    return stored.length ? stored : (typeof DEFAULT_COURSES !== 'undefined' ? DEFAULT_COURSES : []);
  } catch { return []; }
}

/* ─────────────────────────────────────────────────────
   DATE UTILITIES
───────────────────────────────────────────────────── */

/** Format a Date as "YYYY-MM-DD" */
function _fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** Format a Date as "Mon 5 May 2026" */
function _fmtDateDisplay(d) {
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

/** Convert "HH:MM" 24h to "H:MM AM/PM" */
function _to12h(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return h12 + ':' + String(m).padStart(2, '0') + ' ' + period;
}

/**
 * Given a start date and an array of weekday numbers (0=Sun…6=Sat),
 * generate the next N dates that fall on those weekdays, in order.
 * e.g. startDate=Mon, weekdays=[1,3] (Mon+Wed), count=6
 *   → Mon, Wed, Mon, Wed, Mon, Wed
 */
function generateLessonDates(startDate, weekdays, count) {
  const sorted = [...weekdays].sort((a, b) => a - b);
  const dates  = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  while (dates.length < count) {
    const dow = cursor.getDay();
    if (sorted.includes(dow)) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Given a date and a weekly schedule (array of {weekday, time}),
 * find the NEXT occurrence after that date in the schedule.
 * Used for rescheduling.
 */
function nextLearningDay(afterDate, schedule) {
  // schedule = [{weekday: 1, time: '18:00'}, {weekday: 3, time: '16:00'}]
  const sorted = [...schedule].sort((a, b) => a.weekday - b.weekday);
  const cursor = new Date(afterDate);
  cursor.setDate(cursor.getDate() + 1); // start from the day AFTER
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) { // search up to 2 weeks ahead
    const dow = cursor.getDay();
    const match = sorted.find(s => s.weekday === dow);
    if (match) return { date: new Date(cursor), time: match.time };
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

/* ─────────────────────────────────────────────────────
   WRITE CALENDAR SLOT (mirrors presales-dashboard.js)
───────────────────────────────────────────────────── */
function _writeCalendarSlot(teacherId, dateKey, timeKey, bookingId) {
  try {
    const allAvail   = JSON.parse(localStorage.getItem('sn_all_tutor_avail') || '{}');
    const teachers   = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
    const tutorEntry = allAvail[teacherId] || { tutor: teachers.find(t => t.id === teacherId) || {}, slots: {} };
    const slots      = tutorEntry.slots || {};

    slots[dateKey + '|' + timeKey] = { booked: true, bookingId };
    const [h, m] = timeKey.split(':').map(Number);
    const nextKey = m === 0 ? h + ':30' : (h + 1) + ':00';
    slots[dateKey + '|' + nextKey] = { booked: true, bookingId };

    tutorEntry.slots = slots;
    allAvail[teacherId] = tutorEntry;
    localStorage.setItem('sn_all_tutor_avail', JSON.stringify(allAvail));

    const personal = JSON.parse(localStorage.getItem('sn_tutor_avail_' + teacherId) || '{}');
    personal[dateKey + '|' + timeKey] = { booked: true, bookingId };
    personal[dateKey + '|' + nextKey] = { booked: true, bookingId };
    localStorage.setItem('sn_tutor_avail_' + teacherId, JSON.stringify(personal));
  } catch (e) { console.warn('_writeCalendarSlot error:', e); }
}

/** Remove a calendar slot (used when rescheduling) */
function _clearCalendarSlot(teacherId, dateKey, timeKey) {
  try {
    const allAvail = JSON.parse(localStorage.getItem('sn_all_tutor_avail') || '{}');
    const slots    = (allAvail[teacherId] && allAvail[teacherId].slots) || {};
    delete slots[dateKey + '|' + timeKey];
    const [h, m] = timeKey.split(':').map(Number);
    const nextKey = m === 0 ? h + ':30' : (h + 1) + ':00';
    delete slots[dateKey + '|' + nextKey];
    if (allAvail[teacherId]) allAvail[teacherId].slots = slots;
    localStorage.setItem('sn_all_tutor_avail', JSON.stringify(allAvail));

    const personal = JSON.parse(localStorage.getItem('sn_tutor_avail_' + teacherId) || '{}');
    delete personal[dateKey + '|' + timeKey];
    delete personal[dateKey + '|' + nextKey];
    localStorage.setItem('sn_tutor_avail_' + teacherId, JSON.stringify(personal));
  } catch (e) { console.warn('_clearCalendarSlot error:', e); }
}

/* ─────────────────────────────────────────────────────
   CORE: CREATE ENROLMENT + GENERATE ALL LESSONS
───────────────────────────────────────────────────── */

/**
 * Creates an enrolment and generates all lesson bookings.
 *
 * @param {object} opts
 *   studentName, studentEmail, studentWhatsapp, studentId,
 *   grade, age, courseId, teacherId, teacherName,
 *   schedule: [{weekday:1, time:'18:00'}, {weekday:3, time:'16:00'}],
 *   startDate: Date,
 *   classLink: string,
 *   salesId: string
 * @returns {string} enrolmentId
 */
function createEnrolment(opts) {
  const course = getCourseList().find(c => c.id === opts.courseId);
  if (!course) throw new Error('Course not found: ' + opts.courseId);

  const lessons  = course.lessons || [];
  const total    = lessons.length || course.classes || 24;
  const enrolId  = 'ENR-' + Date.now().toString(36).toUpperCase();

  // Build weekday array from schedule
  const weekdays = opts.schedule.map(s => s.weekday);

  // Generate all lesson dates
  const dates = generateLessonDates(opts.startDate, weekdays, total);

  // Map each date to its time slot from the schedule
  const bookings = [];
  dates.forEach(function(date, idx) {
    const dow     = date.getDay();
    const slot    = opts.schedule.find(s => s.weekday === dow) || opts.schedule[0];
    const lesson  = lessons[idx] || { number: idx + 1, name: 'Lesson ' + (idx + 1) };
    const dateKey = _fmtDate(date);
    const bId     = 'BK-' + enrolId + '-L' + String(idx + 1).padStart(3, '0');

    const booking = {
      id:              bId,
      enrolmentId:     enrolId,
      courseId:        opts.courseId,
      courseName:      course.name,
      lessonNumber:    lesson.number || idx + 1,
      lessonName:      lesson.name   || 'Lesson ' + (idx + 1),
      totalLessons:    total,
      activityLink:    lesson.activityLink || '',
      slidesLink:      lesson.slidesLink   || '',
      studentName:     opts.studentName,
      studentId:       opts.studentId || '',
      email:           opts.studentEmail,
      whatsapp:        opts.studentWhatsapp || '',
      grade:           opts.grade || '',
      age:             opts.age   || '',
      subject:         course.subject || '',
      topic:           lesson.name || '',
      assignedTutor:   opts.teacherName,
      assignedTutorId: opts.teacherId,
      assignedSalesId: opts.salesId || '',
      classLink:       opts.classLink || '',
      date:            dateKey,
      time:            _to12h(slot.time),
      timeRaw:         slot.time,
      status:          'scheduled',
      isDemoClass:     false,
      paymentAmount:   course.price || 0,
      isRecurring:     true,
      bookedAt:        new Date().toISOString(),
      scheduledAt:     new Date().toISOString(),
    };

    bookings.push(booking);
    _writeCalendarSlot(opts.teacherId, dateKey, slot.time, bId);
  });

  // Save all bookings
  const existing = getAllBookings();
  saveAllBookings(existing.concat(bookings));

  // Save enrolment record
  const enrolment = {
    id:           enrolId,
    courseId:     opts.courseId,
    courseName:   course.name,
    studentName:  opts.studentName,
    studentEmail: opts.studentEmail,
    studentId:    opts.studentId || '',
    grade:        opts.grade || '',
    teacherId:    opts.teacherId,
    teacherName:  opts.teacherName,
    schedule:     opts.schedule,
    startDate:    _fmtDate(opts.startDate),
    classLink:    opts.classLink || '',
    totalLessons: total,
    createdAt:    new Date().toISOString(),
    status:       'active',
  };
  const enrolments = getEnrolments();
  enrolments.push(enrolment);
  saveEnrolments(enrolments);

  console.log('[Scheduler] Enrolment created:', enrolId, '| Lessons generated:', bookings.length);
  return enrolId;
}

/* ─────────────────────────────────────────────────────
   RESCHEDULE: shift one lesson + all future lessons
───────────────────────────────────────────────────── */

/**
 * Reschedules a single lesson booking and shifts all subsequent
 * lessons in the same enrolment forward by one learning day.
 *
 * @param {string} bookingId  - the booking to reschedule
 * @param {string} reason     - reason for reschedule
 */
function rescheduleLessonAndShift(bookingId, reason) {
  const allBookings = getAllBookings();
  const target = allBookings.find(b => b.id === bookingId);
  if (!target) { console.warn('Booking not found:', bookingId); return false; }
  if (!target.enrolmentId) { console.warn('Not a recurring booking:', bookingId); return false; }

  // Get the enrolment to know the weekly schedule
  const enrolment = getEnrolments().find(e => e.id === target.enrolmentId);
  if (!enrolment) { console.warn('Enrolment not found:', target.enrolmentId); return false; }

  // Get all future lessons in this enrolment (including the target), sorted by date
  const futureLessons = allBookings
    .filter(b => b.enrolmentId === target.enrolmentId &&
                 b.status === 'scheduled' &&
                 b.date >= target.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!futureLessons.length) return false;

  // Shift each future lesson forward by one learning day
  futureLessons.forEach(function(lesson, idx) {
    const currentDate = new Date(lesson.date + 'T12:00:00');
    const next = nextLearningDay(currentDate, enrolment.schedule);
    if (!next) return;

    const newDateKey = _fmtDate(next.date);
    const newTime    = next.time;

    // Clear old calendar slot
    _clearCalendarSlot(lesson.assignedTutorId, lesson.date, lesson.timeRaw || _time12to24(lesson.time));

    // Update booking
    const bi = allBookings.findIndex(b => b.id === lesson.id);
    if (bi !== -1) {
      allBookings[bi].date            = newDateKey;
      allBookings[bi].time            = _to12h(newTime);
      allBookings[bi].timeRaw         = newTime;
      allBookings[bi].rescheduledAt   = new Date().toISOString();
      if (idx === 0) {
        allBookings[bi].rescheduleReason = reason || 'Rescheduled';
        allBookings[bi].rescheduledFrom  = lesson.date;
      }
    }

    // Write new calendar slot
    _writeCalendarSlot(lesson.assignedTutorId, newDateKey, newTime, lesson.id);
  });

  saveAllBookings(allBookings);
  console.log('[Scheduler] Rescheduled', futureLessons.length, 'lessons from booking', bookingId);
  return true;
}

/** Convert "H:MM AM/PM" back to "HH:MM" 24h */
function _time12to24(t) {
  if (!t) return '00:00';
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return t;
  let h = parseInt(m[1]);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + m[2];
}

/* ─────────────────────────────────────────────────────
   ENROLMENT MODAL — UI CONTROLLER
   Called from presales-dashboard.js
───────────────────────────────────────────────────── */

let _enrolBookingId = null; // the completed-demo booking being converted

function openEnrolmentModal(bookingId) {
  _enrolBookingId = bookingId;

  // Find the original booking (completed demo)
  const allBookings = getAllBookings();
  const demo = allBookings.find(b => b.id === bookingId);

  // Pre-fill student info
  const infoEl = document.getElementById('enrol-student-info');
  if (infoEl && demo) {
    infoEl.innerHTML =
      '<strong>' + (demo.studentName || '—') + '</strong>' +
      ' &nbsp;·&nbsp; ' + (demo.grade || '—') +
      ' &nbsp;·&nbsp; Age ' + (demo.age || '—') +
      '<br>📧 ' + (demo.email || '—') +
      ' &nbsp;·&nbsp; 📱 ' + (demo.whatsapp || '—');
  }

  // Populate course dropdown
  _populateEnrolCourseDropdown(demo ? demo.subject : '');

  // Populate teacher dropdown
  _populateEnrolTeacherDropdown(demo ? demo.subject : '');

  // Set start date min to today
  const startEl = document.getElementById('enrol-start-date');
  if (startEl) startEl.min = new Date().toISOString().split('T')[0];

  // Reset schedule rows
  _resetScheduleRows();

  // Show modal
  const overlay = document.getElementById('enrolmentModalOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeEnrolmentModal() {
  const overlay = document.getElementById('enrolmentModalOverlay');
  if (overlay) overlay.classList.remove('open');
  _enrolBookingId = null;
}

function _populateEnrolCourseDropdown(subjectHint) {
  const sel = document.getElementById('enrol-course');
  if (!sel) return;
  const courses = getCourseList();
  let filtered = courses;
  if (subjectHint) {
    const sub = subjectHint.toLowerCase();
    filtered = courses.filter(c => c.subject && c.subject.toLowerCase().includes(sub));
    if (!filtered.length) filtered = courses;
  }
  sel.innerHTML = '<option value="">— Select a course —</option>' +
    filtered.map(c =>
      '<option value="' + c.id + '">' + c.name + ' (' + (c.lessons ? c.lessons.length : c.classes) + ' lessons)</option>'
    ).join('');
}

function _populateEnrolTeacherDropdown(subjectHint) {
  const sel = document.getElementById('enrol-teacher');
  if (!sel) return;
  try {
    let teachers = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
    if (subjectHint) {
      const sub = subjectHint.toLowerCase();
      const filtered = teachers.filter(t => t.subject && t.subject.toLowerCase().includes(sub));
      if (filtered.length) teachers = filtered;
    }
    sel.innerHTML = '<option value="">— Select a teacher —</option>' +
      teachers.map(t => '<option value="' + t.id + '">' + t.name + ' (' + t.id + ') · ' + t.subject + '</option>').join('');
  } catch (e) { /* silent */ }
}

function _resetScheduleRows() {
  const container = document.getElementById('enrol-schedule-rows');
  if (!container) return;
  container.innerHTML = _buildScheduleRow(0) + _buildScheduleRow(1);
}

function _buildScheduleRow(idx) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return '<div class="enrol-schedule-row" id="enrol-row-' + idx + '" style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">' +
    '<select id="enrol-day-' + idx + '" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:\'Nunito\',sans-serif;font-size:14px;font-weight:700;color:var(--dark,#1a202c);outline:none;background:#fff;">' +
    '<option value="">— Day —</option>' +
    days.map((d, i) => '<option value="' + i + '">' + d + '</option>').join('') +
    '</select>' +
    '<input type="time" id="enrol-time-' + idx + '" style="flex:1;padding:10px 12px;border:2px solid #e8eaf0;border-radius:12px;font-family:\'Nunito\',sans-serif;font-size:14px;font-weight:700;color:var(--dark,#1a202c);outline:none;">' +
    (idx > 0
      ? '<button type="button" onclick="removeScheduleRow(' + idx + ')" style="background:#fde8e8;color:#c53030;border:none;border-radius:10px;padding:8px 12px;font-size:18px;cursor:pointer;font-weight:900;line-height:1;">×</button>'
      : '<div style="width:40px;"></div>') +
    '</div>';
}

function addScheduleRow() {
  const container = document.getElementById('enrol-schedule-rows');
  if (!container) return;
  const existing = container.querySelectorAll('.enrol-schedule-row').length;
  if (existing >= 5) { if (typeof showToast === 'function') showToast('Maximum 5 days per week.', 'error'); return; }
  const div = document.createElement('div');
  div.innerHTML = _buildScheduleRow(existing);
  container.appendChild(div.firstChild);
}

function removeScheduleRow(idx) {
  const row = document.getElementById('enrol-row-' + idx);
  if (row) row.remove();
}

function confirmEnrolment() {
  // Gather form values
  const courseId   = document.getElementById('enrol-course')?.value;
  const teacherId  = document.getElementById('enrol-teacher')?.value;
  const startDateV = document.getElementById('enrol-start-date')?.value;
  const classLink  = document.getElementById('enrol-class-link')?.value?.trim();

  if (!courseId)   { if (typeof showToast === 'function') showToast('Please select a course.', 'error'); return; }
  if (!teacherId)  { if (typeof showToast === 'function') showToast('Please select a teacher.', 'error'); return; }
  if (!startDateV) { if (typeof showToast === 'function') showToast('Please select a start date.', 'error'); return; }
  if (!classLink)  { if (typeof showToast === 'function') showToast('Please enter a class link.', 'error'); return; }

  // Gather schedule rows
  const schedule = [];
  const rows = document.querySelectorAll('.enrol-schedule-row');
  rows.forEach(function(row) {
    const dayEl  = row.querySelector('select[id^="enrol-day-"]');
    const timeEl = row.querySelector('input[type="time"]');
    if (dayEl && timeEl && dayEl.value !== '' && timeEl.value) {
      schedule.push({ weekday: parseInt(dayEl.value), time: timeEl.value });
    }
  });

  if (!schedule.length) { if (typeof showToast === 'function') showToast('Please set at least one weekly day and time.', 'error'); return; }

  // Get student info from original demo booking
  const allBookings = getAllBookings();
  const demo = _enrolBookingId ? allBookings.find(b => b.id === _enrolBookingId) : null;

  const teachers = JSON.parse(localStorage.getItem('sn_teachers') || '[]');
  const teacher  = teachers.find(t => t.id === teacherId);

  try {
    const enrolId = createEnrolment({
      studentName:     demo ? demo.studentName : 'Student',
      studentEmail:    demo ? demo.email       : '',
      studentWhatsapp: demo ? demo.whatsapp    : '',
      studentId:       demo ? (demo.studentId || demo.email) : '',
      grade:           demo ? demo.grade       : '',
      age:             demo ? demo.age         : '',
      courseId:        courseId,
      teacherId:       teacherId,
      teacherName:     teacher ? teacher.name  : teacherId,
      schedule:        schedule,
      startDate:       new Date(startDateV + 'T12:00:00'),
      classLink:       classLink,
      salesId:         demo ? demo.assignedSalesId : '',
    });

    closeEnrolmentModal();

    const course = getCourseList().find(c => c.id === courseId);
    const total  = course ? (course.lessons ? course.lessons.length : course.classes) : '?';
    if (typeof showToast === 'function') {
      showToast('✅ Enrolment created! ' + total + ' lessons scheduled for ' + (demo ? demo.studentName : 'student') + '.', 'success');
    }

    // Refresh any open tabs
    if (typeof renderScheduled === 'function') renderScheduled();
    if (typeof updatePSStats   === 'function') updatePSStats();

  } catch (err) {
    console.error('Enrolment error:', err);
    if (typeof showToast === 'function') showToast('Error creating enrolment: ' + err.message, 'error');
  }
}

/* ─────────────────────────────────────────────────────
   RESCHEDULE MODAL — UI CONTROLLER
   Called from tutor calendar when clicking a booked slot
───────────────────────────────────────────────────── */

function openRescheduleModal(bookingId) {
  const allBookings = getAllBookings();
  const booking = allBookings.find(b => b.id === bookingId);
  if (!booking) return;
  if (!booking.isRecurring) {
    if (typeof showToast === 'function') showToast('Only recurring course lessons can be rescheduled here.', 'error');
    return;
  }

  // Count future lessons
  const futureLessons = allBookings.filter(b =>
    b.enrolmentId === booking.enrolmentId &&
    b.status === 'scheduled' &&
    b.date >= booking.date
  ).length;

  const infoEl = document.getElementById('reschedule-lesson-info');
  if (infoEl) {
    infoEl.innerHTML =
      '<strong>Lesson ' + booking.lessonNumber + ' of ' + booking.totalLessons + '</strong>' +
      ': ' + (booking.lessonName || booking.topic || '—') +
      '<br>📅 ' + booking.date + ' at ' + booking.time +
      '<br>🎓 ' + (booking.studentName || '—') + ' · ' + (booking.courseName || '—') +
      '<br><span style="color:#e65100;font-weight:800;">⚠️ This will shift ' + futureLessons + ' lesson(s) forward by one learning day.</span>';
  }

  const reasonEl = document.getElementById('reschedule-reason');
  if (reasonEl) reasonEl.value = '';

  const overlay = document.getElementById('rescheduleModalOverlay');
  if (overlay) {
    overlay.dataset.bookingId = bookingId;
    overlay.classList.add('open');
  }
}

function closeRescheduleModal() {
  const overlay = document.getElementById('rescheduleModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

function confirmReschedule() {
  const overlay = document.getElementById('rescheduleModalOverlay');
  const bookingId = overlay ? overlay.dataset.bookingId : null;
  if (!bookingId) return;

  const reason = document.getElementById('reschedule-reason')?.value?.trim();
  if (!reason) { if (typeof showToast === 'function') showToast('Please enter a reason for rescheduling.', 'error'); return; }

  const success = rescheduleLessonAndShift(bookingId, reason);
  closeRescheduleModal();

  if (success) {
    if (typeof showToast === 'function') showToast('✅ Lesson rescheduled. All future lessons shifted forward.', 'success');
    // Refresh calendar if visible
    if (typeof renderWeeklyCalendar === 'function') renderWeeklyCalendar();
    if (typeof renderUpcomingCards  === 'function') renderUpcomingCards();
  } else {
    if (typeof showToast === 'function') showToast('Could not reschedule — lesson not found or not a recurring booking.', 'error');
  }
}
