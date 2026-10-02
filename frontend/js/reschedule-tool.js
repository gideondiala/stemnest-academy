/**
 * reschedule-tool.js — Post-Sales Reschedule Tool.
 * Moves one of a student's courses from its current weekly schedule onto a
 * new one, from a chosen start date. Times are entered in WAT with the
 * student's local time shown beside them. Loaded after postsales-dashboard.js.
 */
(function () {
  'use strict';

  var API_RT = 'https://api.stemnestacademy.co.uk/api/reschedule-tool';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

  var st = { data: null, course: null, preview: null, previewSig: null, clockTimer: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function tok() { return localStorage.getItem('sn_access_token'); }
  async function api(path, method, body) {
    var res = await fetch(API_RT + path, {
      method: method || 'GET',
      headers: { 'Authorization': 'Bearer ' + tok(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) { var e = new Error(data.error || 'Request failed'); e.data = data; e.status = res.status; throw e; }
    return data;
  }
  function todayWAT() { return new Date(Date.now() + 3600e3).toISOString().slice(0, 10); }
  function nextDateFor(weekday) {
    var d = todayWAT();
    for (var i = 0; i < 7; i++) {
      var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + i);
      if (x.getUTCDay() === weekday) return x.toISOString().slice(0, 10);
    }
    return d;
  }
  function t12(t) { var p = String(t).split(':'); var h = +p[0], m = +p[1] || 0; return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function studentTz() { return st.data && st.data.student.timezone; }
  /** "6:00 PM WAT · 8:00 PM EAT (student)" for a weekly slot */
  function slotLabel(weekday, time) {
    var wat = DAYS[weekday].slice(0, 3) + ' ' + t12(time) + ' WAT';
    var tz = studentTz();
    if (!tz || tz === 'Africa/Lagos' || !window.SNTime) return wat;
    var f = SNTime.formatClassTime(nextDateFor(weekday), time, tz);
    return f ? wat + ' · ' + f.shortDate.split(' ')[0].replace(',', '') + ' ' + f.timeWithZone + ' (student)' : wat;
  }
  function classLocal(date, time) {
    var tz = studentTz();
    if (!tz || !window.SNTime) return '';
    var f = SNTime.formatClassTime(date, time, tz);
    return f ? f.shortDate + ', ' + f.timeWithZone : '';
  }
  function fmtD(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  function card(title, body, id) {
    return '<div ' + (id ? 'id="' + id + '" ' : '') + 'style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;padding:18px 20px;margin-bottom:16px;">' +
      (title ? '<div style="font-family:\'Fredoka One\',cursive;font-size:17px;color:var(--dark);margin-bottom:12px;">' + title + '</div>' : '') + body + '</div>';
  }
  function kv(k, v) { return '<div><div style="font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.4px;">' + k + '</div><div style="font-size:14px;font-weight:800;color:var(--dark);margin-top:2px;">' + (v == null || v === '' ? '—' : v) + '</div></div>'; }
  var inputCss = 'width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e8eaf0;border-radius:10px;font-family:Nunito,sans-serif;font-size:14px;font-weight:700;outline:none;background:#fff;';
  var btnBlue = 'background:var(--blue);color:#fff;border:none;border-radius:10px;padding:10px 18px;font-family:Nunito,sans-serif;font-weight:900;font-size:13px;cursor:pointer;';

  /* ══════════════ Layout ══════════════ */
  function init(studentId) {
    var root = $('rescheduleToolRoot');
    if (!root) return;
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      root.innerHTML =
        '<div style="background:#fff8e1;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13px;font-weight:700;color:#92400e;line-height:1.6;">' +
        '⚠️ Use this to move a student\'s course to a new weekly schedule from a chosen date (even the same days and times, just from a new date). ' +
        'To move a single class, the teacher uses the Move option on their calendar. Group batches are rescheduled from <strong>Group Batches</strong>.</div>' +
        card('1. Find the student',
          '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
          '<input id="rt-q" placeholder="Student ID (S-0012), name, email or phone" style="' + inputCss + 'flex:1;min-width:220px;" onkeydown="if(event.key===\'Enter\')RescheduleTool.search()">' +
          '<button style="' + btnBlue + '" onclick="RescheduleTool.search()">🔍 Search</button></div>' +
          '<div id="rt-results" style="margin-top:10px;"></div>') +
        '<div id="rt-body"></div>';
    }
    if (studentId) { $('rt-results').innerHTML = ''; load(studentId); }
  }

  async function search() {
    var q = ($('rt-q').value || '').trim();
    var out = $('rt-results');
    if (q.length < 2) { out.innerHTML = '<div style="color:var(--light);font-weight:700;font-size:13px;">Type at least 2 characters.</div>'; return; }
    out.innerHTML = '<div style="color:var(--light);font-weight:700;font-size:13px;">⏳ Searching…</div>';
    try {
      var d = await api('/students?q=' + encodeURIComponent(q));
      if (!d.students.length) { out.innerHTML = '<div style="color:#c53030;font-weight:800;font-size:13px;">No student found.</div>'; return; }
      if (d.students.length === 1) { out.innerHTML = ''; return load(d.students[0].id); }
      out.innerHTML = d.students.map(function (s) {
        return '<div onclick="RescheduleTool.load(\'' + s.id + '\')" style="cursor:pointer;display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border:1.5px solid #e8eaf0;border-radius:10px;margin-bottom:6px;font-size:13px;font-weight:800;">' +
          '<span>' + esc(s.name) + ' <span style="color:var(--blue);">' + esc(s.staffId || '') + '</span>' + (s.isActive ? '' : ' <span style="color:#c53030;">(inactive)</span>') + '</span>' +
          '<span style="color:var(--light);">' + esc(s.parentEmail || s.email || '') + ' · ' + (s.credits == null ? 0 : s.credits) + ' credits</span></div>';
      }).join('');
    } catch (e) { out.innerHTML = '<div style="color:#c53030;font-weight:800;font-size:13px;">' + esc(e.message) + '</div>'; }
  }

  async function load(studentId) {
    var body = $('rt-body');
    body.innerHTML = card('', '<div style="color:var(--light);font-weight:700;">⏳ Loading student…</div>');
    try {
      st.data = await api('/students/' + studentId);
      st.course = st.data.courses.length === 1 ? st.data.courses[0] : null;
      st.preview = null;
      render();
    } catch (e) { body.innerHTML = card('', '<div style="color:#c53030;font-weight:800;">' + esc(e.message) + '</div>'); }
  }

  /* ══════════════ Student + course ══════════════ */
  function render() {
    var d = st.data, s = d.student;
    var status = s.paused
      ? (s.pauseKind === 'credits' ? '<span style="color:#c53030;">⏳ On hold — out of credits</span>' : '<span style="color:#c53030;">⏸️ Paused</span>')
      : (d.courses.length || d.batches.length ? '<span style="color:#065f46;">✅ Active</span>' : '<span style="color:#92400e;">🗓️ No classes booked</span>');
    var credits = '<span style="color:' + ((s.credits || 0) <= 0 ? '#c53030' : (s.credits <= 2 ? '#b45309' : '#065f46')) + ';">' + (s.credits == null ? 0 : s.credits) + '</span>';
    var fam = d.family ? esc(d.family.name) + ' (' + esc(d.family.email) + ')' + (d.family.siblings && d.family.siblings.length ? '<br><span style="font-size:12px;color:var(--mid);">Siblings: ' + d.family.siblings.map(function (x) { return esc(x.name) + ' ' + esc(x.staffId || ''); }).join(', ') + '</span>' : '') : 'No family login';
    var loginEmail = /@login\.stemnest\.invalid$/i.test(s.email || '') ? 'Student ID login (' + esc(s.staffId) + ')' : esc(s.email);

    var html = card('2. Student details',
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px;">' +
      kv('Name', esc(s.name)) + kv('Student ID', esc(s.staffId)) + kv('Grade', esc(s.grade)) + kv('Age', esc(s.age)) +
      kv('Status', status) + kv('Credits', credits) + kv('Country', esc(s.country)) +
      kv('Time zone', esc(s.timezone) + (s.timezoneKnown ? '' : ' <span style="font-size:11px;color:#b45309;">(not known — assumed WAT)</span>')) +
      kv('Student\'s time now', '<span id="rt-clock"></span>') +
      kv('Parent', esc(s.parentName)) + kv('Parent email', esc(s.parentEmail)) + kv('Phone', esc(s.phone || s.whatsapp)) +
      kv('Login', loginEmail + ' <button type="button" onclick="openSetLogin(\'' + s.id + '\',\'' + esc(s.name).replace(/'/g, '') + '\',\'student\')" style="margin-left:4px;background:none;border:1.5px solid #64748b;color:#475569;border-radius:8px;padding:1px 8px;font-family:Nunito,sans-serif;font-weight:800;font-size:11px;cursor:pointer;">🔑 Set login</button>') + kv('Family login', fam) + kv('Joined', s.createdAt ? fmtD(String(s.createdAt).slice(0, 10)) : '') +
      '</div>' +
      (s.paused ? '<div style="margin-top:14px;background:#fed7d7;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:800;color:#c53030;">This student is ' + (s.pauseKind === 'credits' ? 'on hold for credits' : 'paused') + '. Resume them from <a href="#" onclick="showPOSTab(\'pause-resume\');return false;">Pause &amp; Resume</a> (or confirm a payment) instead of rescheduling.</div>' : '') +
      (d.batches.length ? '<div style="margin-top:14px;background:#eef4ff;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:800;color:#1e40af;">👥 Also in group batch ' + d.batches.map(function (b) { return esc(b.batchRef) + ' (' + esc(b.tutorName || '') + ', ' + b.upcoming + ' upcoming)'; }).join(', ') +
        '. Batch classes move for the whole group — use <a href="#" onclick="showPOSTab(\'batches\');return false;">Group Batches → Reschedule</a>.</div>' : '') +
      (d.history.length ? '<details style="margin-top:14px;"><summary style="cursor:pointer;font-size:13px;font-weight:900;color:var(--blue);">🕘 Reschedule history (' + d.history.length + ')</summary>' +
        d.history.map(function (h) {
          return '<div style="border-top:1px solid #f1f3f8;padding:8px 0;font-size:12px;font-weight:700;color:var(--mid);">' +
            '<strong>' + new Date(h.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + '</strong> · requested by ' + esc(h.requestedBy) + ' · by ' + esc(h.performedBy || '') +
            '<br>' + esc(patternText(h.oldSchedule)) + ' → <strong>' + esc(patternText(h.newSchedule)) + '</strong> from ' + esc(String(h.startDate).slice(0, 10)) +
            (h.oldTutor !== h.newTutor ? ' · ' + esc(h.oldTutor) + ' → ' + esc(h.newTutor) : '') +
            '<br><em>' + esc(h.reason) + '</em></div>';
        }).join('') + '</details>' : ''));

    if (!d.courses.length) {
      html += card('3. Course', '<div style="font-size:13px;font-weight:800;color:var(--mid);">This student has no upcoming 1-on-1 classes to reschedule.' +
        (s.paused ? '' : ' To book classes, use <strong>📅 Schedule</strong> on Paid Students.') + '</div>');
    } else {
      html += card('3. Which course?', d.courses.map(function (c) {
        var on = st.course && st.course.key === c.key;
        return '<label style="display:block;cursor:pointer;border:2px solid ' + (on ? 'var(--blue)' : '#e8eaf0') + ';background:' + (on ? 'var(--blue-light)' : '#fff') + ';border-radius:12px;padding:12px 14px;margin-bottom:8px;">' +
          '<input type="radio" name="rt-course" value="' + esc(c.key) + '" ' + (on ? 'checked' : '') + ' onchange="RescheduleTool.pickCourse(this.value)" style="margin-right:8px;">' +
          '<strong>' + esc(c.title) + (c.gradeNumber ? ' · Grade ' + c.gradeNumber : '') + '</strong> — ' + esc(c.tutor ? c.tutor.name : '') +
          '<div style="font-size:12px;font-weight:700;color:var(--mid);margin:4px 0 0 24px;line-height:1.7;">' +
          'Current schedule: <strong>' + esc(c.pattern.map(function (p) { return slotLabel(p.weekday, p.time); }).join(' | ') || '—') + '</strong><br>' +
          c.upcoming + ' upcoming · ' + c.completed + ' completed · lessons ' + c.lessonsCompleted + '/' + c.gradeTotal + ' done' +
          (c.notYetBooked ? ' · <span style="color:#b45309;">' + c.notYetBooked + ' not yet booked</span>' : '') +
          '<br>Next class: ' + esc(fmtD(c.nextClass.date)) + ' ' + esc(t12(c.nextClass.time)) + ' WAT' + (classLocal(c.nextClass.date, c.nextClass.time) ? ' (' + esc(classLocal(c.nextClass.date, c.nextClass.time)) + ' student)' : '') +
          ' · last: ' + esc(fmtD(c.lastClass.date)) +
          (c.lessonsLinked < c.upcoming
            ? '<div style="margin-top:6px;background:#fff8e1;border-radius:8px;padding:6px 10px;color:#92400e;">⚠️ ' + (c.upcoming - c.lessonsLinked) + ' of ' + c.upcoming + ' upcoming classes have no lesson attached — the tutor and student cannot open the lesson details. ' +
              '<button type="button" onclick="event.preventDefault();RescheduleTool.openLink(\'' + esc(c.key) + '\')" style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:4px 10px;font-family:Nunito,sans-serif;font-weight:900;font-size:12px;cursor:pointer;">🔗 Link lessons</button></div>'
            : '<div style="margin-top:4px;color:#065f46;">✅ Lessons linked' + (c.nextLessonNumber ? ' · next class is lesson ' + c.nextLessonNumber : '') + ' <a href="#" onclick="event.preventDefault();RescheduleTool.openLink(\'' + esc(c.key) + '\')" style="color:var(--blue);">change</a></div>') +
          '<div id="rt-link-' + esc(c.key).replace(/[^a-zA-Z0-9]/g, '') + '"></div>' +
          '</div></label>';
      }).join(''));
      if (st.course && !s.paused) html += formHtml();
    }
    $('rt-body').innerHTML = html;
    startClock();
    if (st.course && !s.paused) { fillForm(); }
  }

  function patternText(p) {
    var arr = Array.isArray(p) ? p : [];
    return arr.map(function (x) { return DAYS[x.weekday].slice(0, 3) + ' ' + t12(x.time); }).join(', ') || '—';
  }

  function startClock() {
    clearInterval(st.clockTimer);
    var tick = function () {
      var el = $('rt-clock'); if (!el) { clearInterval(st.clockTimer); return; }
      var tz = studentTz() || 'Africa/Lagos';
      try { el.textContent = new Date().toLocaleString('en-GB', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }); } catch (e) { el.textContent = '—'; }
    };
    tick(); st.clockTimer = setInterval(tick, 30000);
  }

  function pickCourse(key) {
    st.course = st.data.courses.find(function (c) { return c.key === key; });
    st.preview = null;
    render();
  }

  /* ══════════════ Form ══════════════ */
  function formHtml() {
    var c = st.course;
    var tutors = (typeof _allTutors !== 'undefined' ? _allTutors : []).map(function (t) {
      return '<option value="' + esc(t.id) + '" ' + (c.tutor && t.id === c.tutor.id ? 'selected' : '') + '>' + esc(t.name) + (t.staff_id ? ' (' + esc(t.staff_id) + ')' : '') + '</option>';
    }).join('');
    if (c.tutor && !(typeof _allTutors !== 'undefined' ? _allTutors : []).some(function (t) { return t.id === c.tutor.id; })) {
      tutors = '<option value="' + esc(c.tutor.id) + '" selected>' + esc(c.tutor.name) + '</option>' + tutors;
    }
    return card('4. Request details',
        '<div style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Who requested the reschedule? *</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
        [['student', '🎓 Student'], ['parent', '👪 Parent'], ['teacher', '👩‍🏫 Teacher'], ['stemnest', '🏫 StemNest']].map(function (o) {
          return '<label style="cursor:pointer;border:2px solid #e8eaf0;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:800;"><input type="radio" name="rt-who" value="' + o[0] + '" onchange="RescheduleTool.dirty()" style="margin-right:6px;">' + o[1] + '</label>';
        }).join('') + '</div>' +
        '<div style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Reason for reschedule * <span id="rt-reason-count" style="text-transform:none;color:var(--light);"></span></div>' +
        '<textarea id="rt-reason" rows="3" oninput="RescheduleTool.reasonCount()" placeholder="At least one full sentence: who asked and why (minimum 30 characters)." style="' + inputCss + 'resize:vertical;"></textarea>') +
      card('5. Teacher and class link',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><div style="font-size:12px;font-weight:900;color:var(--mid);margin-bottom:6px;">TEACHER</div><select id="rt-tutor" onchange="RescheduleTool.dirty()" style="' + inputCss + '">' + tutors + '</select>' +
        '<div style="font-size:11px;color:var(--light);font-weight:700;margin-top:4px;">Current: ' + esc(c.tutor ? c.tutor.name : '—') + '. Change it to move the student to another teacher.</div></div>' +
        '<div><div style="font-size:12px;font-weight:900;color:var(--mid);margin-bottom:6px;">CLASS LINK</div><input id="rt-link" value="' + esc(c.classLink) + '" oninput="RescheduleTool.dirty()" style="' + inputCss + '"></div>' +
        '</div>') +
      card('6. New schedule',
        '<div style="display:grid;grid-template-columns:220px 1fr;gap:12px;align-items:end;margin-bottom:14px;">' +
        '<div><div style="font-size:12px;font-weight:900;color:var(--mid);margin-bottom:6px;">START DATE (WAT) *</div><input type="date" id="rt-start" min="' + todayWAT() + '" value="' + todayWAT() + '" onchange="RescheduleTool.dirty()" style="' + inputCss + '"></div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--light);">All ' + c.upcoming + ' upcoming classes move onto the new schedule from this date, in lesson order. Current: <strong style="color:var(--mid);">' + esc(c.pattern.map(function (p) { return slotLabel(p.weekday, p.time); }).join(' | ')) + '</strong></div></div>' +
        '<div style="font-size:12px;font-weight:900;color:var(--mid);margin-bottom:8px;">WEEKLY TIME SLOTS (WAT — student\'s time shown beside)</div>' +
        '<div id="rt-rows"></div>' +
        '<button type="button" onclick="RescheduleTool.addRow()" style="background:var(--bg);color:var(--blue);border:2px dashed var(--blue);border-radius:12px;padding:9px 18px;font-family:Nunito,sans-serif;font-weight:800;font-size:13px;cursor:pointer;width:100%;margin-top:4px;">+ Add time slot</button>' +
        (c.notYetBooked ? '<label style="display:flex;gap:8px;align-items:center;margin-top:14px;font-size:13px;font-weight:800;color:#92400e;cursor:pointer;"><input type="checkbox" id="rt-topup" checked onchange="RescheduleTool.dirty()"> Also book the ' + c.notYetBooked + ' lessons of this grade that are not booked yet (full grade on the calendar)</label>' : '') +
        '<div style="display:flex;gap:10px;margin-top:16px;"><button style="' + btnBlue + 'flex:1;" onclick="RescheduleTool.runPreview()">👁 Preview new schedule</button></div>' +
        '<div id="rt-preview" style="margin-top:14px;"></div>');
  }

  function fillForm() {
    var rows = $('rt-rows'); if (!rows) return;
    rows.innerHTML = '';
    (st.course.pattern.length ? st.course.pattern : [{ weekday: 1, time: '16:00' }]).forEach(function (p) { addRow(p.weekday, p.time); });
    reasonCount();
  }

  function addRow(weekday, time) {
    var rows = $('rt-rows');
    var div = document.createElement('div');
    div.className = 'rt-row';
    div.style.cssText = 'display:grid;grid-template-columns:160px 130px 1fr 40px;gap:8px;align-items:center;margin-bottom:8px;';
    div.innerHTML =
      '<select class="rt-day" style="' + inputCss + '">' + DAY_ORDER.map(function (d) { return '<option value="' + d + '" ' + (d === (weekday == null ? 1 : weekday) ? 'selected' : '') + '>' + DAYS[d] + '</option>'; }).join('') + '</select>' +
      '<input type="time" class="rt-time" value="' + (time || '16:00') + '" step="1800" style="' + inputCss + '">' +
      '<div class="rt-local" style="font-size:12px;font-weight:800;color:var(--blue);"></div>' +
      '<button type="button" title="Remove this slot" style="background:#fed7d7;color:#c53030;border:none;border-radius:8px;height:38px;font-size:16px;cursor:pointer;">🗑</button>';
    var upd = function () { updateRowLabel(div); dirty(); };
    div.querySelector('.rt-day').addEventListener('change', upd);
    div.querySelector('.rt-time').addEventListener('input', upd);
    div.querySelector('button').addEventListener('click', function () {
      if (document.querySelectorAll('.rt-row').length <= 1) { showToast('Keep at least one time slot.', 'warning'); return; }
      div.remove(); dirty();
    });
    rows.appendChild(div);
    updateRowLabel(div);
    dirty();
  }

  function updateRowLabel(div) {
    var w = +div.querySelector('.rt-day').value, t = div.querySelector('.rt-time').value;
    var el = div.querySelector('.rt-local');
    var tz = studentTz();
    if (!t) { el.textContent = ''; return; }
    if (!tz || tz === 'Africa/Lagos' || !window.SNTime) { el.textContent = 'Student is on WAT'; return; }
    var f = SNTime.formatClassTime(nextDateFor(w), t, tz);
    el.textContent = f ? '= ' + f.shortDate.split(' ')[0].replace(',', '') + ' ' + f.timeWithZone + ' for the student' : '';
  }

  function collect() {
    var who = document.querySelector('input[name="rt-who"]:checked');
    var topup = $('rt-topup');
    return {
      studentId: st.data.student.id,
      courseKey: st.course.key,
      startDate: $('rt-start').value,
      schedule: Array.prototype.map.call(document.querySelectorAll('.rt-row'), function (r) {
        return { weekday: +r.querySelector('.rt-day').value, time: r.querySelector('.rt-time').value };
      }),
      tutorId: $('rt-tutor').value || undefined,
      classLink: ($('rt-link').value || '').trim(),
      topUp: !!(topup && topup.checked),
      requestedBy: who ? who.value : '',
      reason: ($('rt-reason').value || '').trim(),
    };
  }
  function sigOf(b) { return JSON.stringify([b.startDate, b.schedule, b.tutorId, b.classLink, b.topUp]); }

  function dirty() {
    var p = $('rt-preview');
    if (p && st.preview && st.previewSig && st.data && st.course) {
      if (sigOf(collect()) !== st.previewSig) { st.preview = null; p.innerHTML = '<div style="font-size:12px;font-weight:800;color:var(--light);">Schedule changed — preview again.</div>'; }
    }
  }
  function reasonCount() {
    var n = ($('rt-reason') && $('rt-reason').value.trim().length) || 0;
    var el = $('rt-reason-count'); if (el) { el.textContent = '(' + n + '/30)'; el.style.color = n >= 30 ? '#065f46' : 'var(--light)'; }
  }

  /* ══════════════ Preview + apply ══════════════ */
  async function runPreview() {
    var body = collect();
    var out = $('rt-preview');
    if (!body.startDate) { showToast('Choose the start date.', 'warning'); return; }
    out.innerHTML = '<div style="color:var(--light);font-weight:700;">⏳ Building the preview…</div>';
    try {
      var p = await api('/preview', 'POST', body);
      st.preview = p; st.previewSig = sigOf(body);
      renderPreview(p);
    } catch (e) {
      st.preview = null;
      out.innerHTML = '<div style="background:#fed7d7;border-radius:10px;padding:10px 14px;color:#c53030;font-weight:800;font-size:13px;">' + esc(e.message) + '</div>';
    }
  }

  function renderPreview(p) {
    var out = $('rt-preview');
    var tz = studentTz();
    var showLocal = tz && tz !== 'Africa/Lagos';
    var summary =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:12px;">' +
      kv('Classes moved', p.moved) + kv('Lessons added', p.added) + kv('Teacher', esc(p.tutor.name)) +
      kv('First class', esc(fmtD(p.firstClass.date)) + ' ' + t12(p.firstClass.time) + ' WAT') +
      kv('Last class', esc(fmtD(p.lastClass.date))) +
      kv('Clashes', p.clashes ? '<span style="color:#c53030;">❌ ' + p.clashes + '</span>' : '<span style="color:#065f46;">✅ None</span>') +
      '</div>';

    var sugg = '';
    if (p.clashes) {
      sugg = '<div style="background:#fed7d7;border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:13px;font-weight:800;color:#c53030;">' +
        p.clashes + ' class' + (p.clashes === 1 ? '' : 'es') + ' clash with other classes — the reschedule cannot go ahead until every clash is fixed.' +
        Object.keys(p.suggestions).map(function (k) {
          var parts = k.split('|'), w = +parts[0], t = parts[1];
          var free = p.suggestions[k];
          return '<div style="margin-top:8px;color:var(--dark);">' + DAYS[w] + ' ' + t12(t) + ' WAT clashes. ' +
            (free.length ? 'Free every week at: ' + free.map(function (f) {
              return '<button type="button" onclick="RescheduleTool.useTime(' + w + ',\'' + t + '\',\'' + f + '\')" style="background:#fff;border:1.5px solid var(--blue);color:var(--blue);border-radius:50px;padding:3px 10px;font-family:Nunito,sans-serif;font-weight:900;font-size:12px;cursor:pointer;margin:2px;">' + t12(f) + '</button>';
            }).join('') : 'No free time found on that day between 8 AM and 9 PM — try another day or teacher.') + '</div>';
        }).join('') + '</div>';
    }

    var rows = p.slots.map(function (s, i) {
      return '<tr style="' + (s.clash ? 'background:#fff5f5;' : '') + '">' +
        '<td style="padding:7px 10px;font-size:12px;font-weight:800;color:var(--light);">' + (i + 1) + '</td>' +
        '<td style="padding:7px 10px;font-size:12px;font-weight:800;">' + (s.lessonNumber ? 'L' + s.lessonNumber + ' ' : '') + esc(s.title || '') + (s.isNew ? ' <span style="background:#fef3c7;color:#92400e;border-radius:50px;padding:1px 6px;font-size:10px;">new</span>' : '') + '</td>' +
        '<td style="padding:7px 10px;font-size:12px;font-weight:800;white-space:nowrap;">' + esc(fmtD(s.date)) + ' · ' + t12(s.time) + ' WAT</td>' +
        (showLocal ? '<td style="padding:7px 10px;font-size:12px;font-weight:700;color:var(--blue);white-space:nowrap;">' + esc(classLocal(s.date, s.time)) + '</td>' : '') +
        '<td style="padding:7px 10px;font-size:12px;font-weight:800;">' + (s.clash ? '<span style="color:#c53030;">❌ Clash: ' + (s.clash.withTeacher ? 'teacher has ' : 'student has ') + esc(s.clash.who) + ' at ' + t12(s.clash.time) + '</span>' : '<span style="color:#065f46;">✅</span>') + '</td></tr>';
    }).join('');

    var who = document.querySelector('input[name="rt-who"]:checked');
    var reasonOk = (($('rt-reason').value || '').trim().length >= 30);
    var canApply = !p.clashes;
    out.innerHTML = summary + sugg +
      '<div style="max-height:360px;overflow:auto;border:1.5px solid #e8eaf0;border-radius:12px;"><table style="width:100%;border-collapse:collapse;">' +
      '<thead style="background:var(--bg);position:sticky;top:0;"><tr><th style="padding:8px 10px;font-size:11px;text-align:left;">#</th><th style="padding:8px 10px;font-size:11px;text-align:left;">Lesson</th><th style="padding:8px 10px;font-size:11px;text-align:left;">New date &amp; time</th>' +
      (showLocal ? '<th style="padding:8px 10px;font-size:11px;text-align:left;">Student\'s time</th>' : '') + '<th style="padding:8px 10px;font-size:11px;text-align:left;">Check</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div style="margin-top:14px;">' +
      (canApply
        ? '<button id="rt-apply" onclick="RescheduleTool.apply()" style="background:var(--green);color:#fff;border:none;border-radius:12px;padding:13px 20px;font-family:Nunito,sans-serif;font-weight:900;font-size:14px;cursor:pointer;width:100%;">✅ Reschedule ' + p.total + ' classes now</button>' +
          ((!who || !reasonOk) ? '<div style="font-size:12px;font-weight:800;color:#b45309;margin-top:6px;">Before confirming: choose who requested it and write a reason of at least 30 characters.</div>' : '')
        : '<button disabled style="background:#e2e8f0;color:#718096;border:none;border-radius:12px;padding:13px 20px;font-family:Nunito,sans-serif;font-weight:900;font-size:14px;width:100%;">Fix the clashes to continue</button>') +
      '</div>';
  }

  function useTime(weekday, oldTime, newTime) {
    document.querySelectorAll('.rt-row').forEach(function (r) {
      if (+r.querySelector('.rt-day').value === weekday && r.querySelector('.rt-time').value === oldTime) {
        r.querySelector('.rt-time').value = newTime; updateRowLabel(r);
      }
    });
    runPreview();
  }

  async function apply() {
    var body = collect();
    if (!st.preview || sigOf(body) !== st.previewSig) { showToast('The schedule changed — preview it again first.', 'warning'); return runPreview(); }
    if (!body.requestedBy) { showToast('Choose who requested the reschedule.', 'warning'); return; }
    if (body.reason.length < 30) { showToast('Write a reason of at least 30 characters.', 'warning'); $('rt-reason').focus(); return; }
    if (!confirm('Reschedule ' + st.preview.total + ' classes for ' + st.data.student.name + ' starting ' + fmtD(st.preview.firstClass.date) + '?\n\nThe teacher\'s calendar changes immediately and the parent and teacher are emailed.')) return;
    var btn = $('rt-apply'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Rescheduling…'; }
    try {
      var r = await api('/apply', 'POST', body);
      showToast('✅ ' + st.data.student.name + ' rescheduled — ' + r.moved + ' classes moved' + (r.added ? ', ' + r.added + ' added' : '') + '. First class ' + fmtD(r.firstClass.date) + ' ' + t12(r.firstClass.time) + ' WAT. Parent and teacher emailed.', 'success', 10000);
      if (typeof loadDashboard === 'function') loadDashboard();
      await load(st.data.student.id);
      var hist = document.querySelector('#rt-body details'); if (hist) hist.open = true;
    } catch (e) {
      if (e.status === 409 && e.data && e.data.plan) { st.preview = e.data.plan; renderPreview(e.data.plan); showToast(e.message, 'error', 9000); }
      else showToast('Error: ' + e.message, 'error', 8000);
      if (btn) { btn.disabled = false; btn.textContent = '✅ Reschedule classes now'; }
    }
  }

  /* ══════════════ Link lessons ══════════════ */
  function linkBoxId(key) { return 'rt-link-' + String(key).replace(/[^a-zA-Z0-9]/g, ''); }
  function openLink(key) {
    var c = st.data.courses.find(function (x) { return x.key === key; });
    if (!st.course || st.course.key !== key) { st.course = c; st.preview = null; render(); }
    var box = $(linkBoxId(key)); if (!c || !box) return;
    var pws = (typeof _allPathways !== 'undefined' ? _allPathways : []);
    box.innerHTML = '<div style="margin-top:10px;background:#fff;border:1.5px solid #e8eaf0;border-radius:10px;padding:12px;" onclick="if(event.target===this){event.preventDefault();}event.stopPropagation()">' +
      '<div style="font-size:12px;font-weight:800;color:var(--mid);margin-bottom:8px;">Attach lessons to the ' + c.upcoming + ' upcoming classes, in order. Progress tracking starts from here.</div>' +
      '<div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end;">' +
      '<div><div style="font-size:11px;font-weight:900;color:var(--mid);">PATHWAY</div><select id="rtl-pw" onchange="RescheduleTool.linkGrades()" style="' + inputCss + '"><option value="">— choose —</option>' +
        pws.map(function (p) { return '<option value="' + esc(p.id) + '" ' + (p.id === c.pathwayId ? 'selected' : '') + '>' + esc((p.emoji || '') + ' ' + p.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><div style="font-size:11px;font-weight:900;color:var(--mid);">GRADE</div><select id="rtl-grade" style="' + inputCss + '"></select></div>' +
      '<div><div style="font-size:11px;font-weight:900;color:var(--mid);">NEXT LESSON</div><input id="rtl-next" type="number" min="1" value="' + (c.nextLessonNumber || (c.lessonsCompleted || 0) + 1) + '" style="' + inputCss + '"></div>' +
      '<button type="button" onclick="RescheduleTool.saveLink(\'' + esc(key) + '\')" style="' + btnBlue + '">Save</button></div>' +
      '<div style="font-size:11px;color:var(--light);font-weight:700;margin-top:6px;">"Next lesson" = the lesson the student\'s next class should teach (e.g. 4 if they have done 3).</div></div>';
    linkGrades(c.gradeNumber);
  }
  function linkGrades(preselect) {
    var pw = $('rtl-pw') && $('rtl-pw').value, sel = $('rtl-grade'); if (!sel) return;
    var grades = (typeof _allGrades !== 'undefined' ? _allGrades : []).filter(function (g) { return g.pathway_id === pw; }).sort(function (a, b) { return a.grade_number - b.grade_number; });
    sel.innerHTML = grades.map(function (g) { return '<option value="' + g.grade_number + '" ' + (+preselect === g.grade_number ? 'selected' : '') + '>Grade ' + g.grade_number + (parseInt(g.lesson_count) ? ' (' + g.lesson_count + ')' : '') + '</option>'; }).join('') || '<option value="">—</option>';
  }
  async function saveLink(key) {
    var body = { studentId: st.data.student.id, courseKey: key, pathwayId: $('rtl-pw').value, gradeNumber: $('rtl-grade').value, nextLesson: $('rtl-next').value };
    if (!body.pathwayId) { showToast('Choose the pathway.', 'warning'); return; }
    try {
      var r = await api('/link-lessons', 'POST', body);
      showToast('✅ ' + r.linked + ' classes linked to ' + r.pathway + ' Grade ' + r.gradeNumber + ' (lessons ' + r.fromLesson + '–' + r.toLesson + ').' + (r.beyondGrade ? ' ' + r.beyondGrade + ' classes go past the end of the grade.' : ''), 'success', 9000);
      await load(st.data.student.id);
    } catch (e) { showToast('Error: ' + e.message, 'error', 8000); }
  }

  window.RescheduleTool = {
    openLink: openLink, linkGrades: linkGrades, saveLink: saveLink,
    init: init, search: search, load: load, pickCourse: pickCourse, addRow: addRow,
    dirty: dirty, reasonCount: reasonCount, runPreview: runPreview, useTime: useTime, apply: apply,
  };
  /** Open the tool with a student already loaded (from Scheduled Classes / Overview). */
  window.openRescheduleTool = function (studentId) {
    showPOSTab('reschedule-tool');
    init(studentId);
  };
})();
