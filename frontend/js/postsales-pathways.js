/**
 * postsales-pathways.js — a student can take several pathways at once,
 * each with its own tutor, schedule and class link.
 *
 *  • 🧭 Pathways panel (Paid Students): every pathway with its tutor and
 *    classes; Reschedule / Change tutor for one pathway; link older classes
 *    that are not tied to a pathway yet; ➕ Add a pathway.
 *  • The Reschedule and Change Tutor forms get a "Which pathway?" picker
 *    when the student has more than one.
 * Loaded after postsales-dashboard.js.
 */
(function () {
  'use strict';

  var API_BASE = 'https://api.stemnestacademy.co.uk';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function day(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'; }
  async function api(path, opts) {
    var r = await fetch(API_BASE + path, Object.assign({ headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sn_access_token'), 'Content-Type': 'application/json' } }, opts || {}));
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok || d.success === false) throw Object.assign(new Error(d.error || 'Request failed'), { data: d });
    return d;
  }
  function trackLabel(t) {
    var who = t.tutorName ? ' · ' + t.tutorName : '';
    if (t.linked) return (t.pathwayName || 'Pathway') + who + ' (' + t.upcoming + ' upcoming)';
    return 'Not linked' + (t.lessonPathway ? ' — looks like ' + t.lessonPathway : '') + who + ' (' + t.upcoming + ' upcoming)';
  }

  /* ══════════════ "Which pathway?" picker in the two forms ══════════════ */
  var FORMS = { rs: { overlay: 'rescheduleStudentOverlay', info: 'reschedule-student-info' },
                ct: { overlay: 'changeTutorOverlay',       info: 'change-tutor-student-info' } };

  window.snShowTrackPicker = function (prefix, tracks, selected) {
    var f = FORMS[prefix]; if (!f) return;
    var info = document.getElementById(f.info); if (!info) return;
    var box = document.getElementById(prefix + '-track-box');
    var list = (tracks || []).filter(function (t) { return t.upcoming > 0; });
    if (list.length <= 1) { if (box) box.remove(); window._snTrack = list[0] ? list[0].key : null; return; }
    if (!box) {
      box = document.createElement('div');
      box.id = prefix + '-track-box';
      box.style.cssText = 'margin:-4px 0 16px;';
      info.parentNode.insertBefore(box, info.nextSibling);
    }
    box.innerHTML = '<label style="font-size:12px;font-weight:900;color:var(--mid);display:block;margin-bottom:6px;">Which pathway? *</label>' +
      '<select id="' + prefix + '-track" style="width:100%;padding:11px 14px;border:2px solid #f59e0b;border-radius:12px;font-family:Nunito,sans-serif;font-size:14px;font-weight:800;background:#fffbeb;">' +
      '<option value="">— Choose the pathway —</option>' +
      list.map(function (t) { return '<option value="' + esc(t.key) + '"' + (t.key === selected ? ' selected' : '') + '>' + esc(trackLabel(t)) + '</option>'; }).join('') +
      '</select><div style="font-size:11px;font-weight:700;color:var(--light);margin-top:4px;">Only this pathway\'s classes change — the student\'s other pathways stay as they are.</div>';
    var sel = document.getElementById(prefix + '-track');
    window._snTrack = sel.value || null;
    sel.onchange = function () { window._snTrack = sel.value || null; };
  };

  async function preparePicker(prefix, studentId, selected) {
    window._snTrack = selected || null;
    var old = document.getElementById(prefix + '-track-box'); if (old) old.remove();
    try {
      var d = await api('/api/enrollments/students/' + studentId + '/tracks');
      window.snShowTrackPicker(prefix, d.tracks, selected);
    } catch (e) { /* the server still asks if a pathway must be chosen */ }
  }

  var origRS = window.openRescheduleStudentModal;
  window.openRescheduleStudentModal = function (studentId, studentName, studentEmail, track) {
    origRS(studentId, studentName, studentEmail);
    preparePicker('rs', studentId, track);
  };
  var origCT = window.openChangeTutorModal;
  window.openChangeTutorModal = function (studentId, studentName, track) {
    origCT(studentId, studentName);
    preparePicker('ct', studentId, track);
  };

  /* ══════════════ 🧭 Pathways panel ══════════════ */
  var panel = { studentId: null, name: '', email: '', tracks: [] };

  window.openPathwaysPanel = async function (studentId, name, email) {
    panel = { studentId: studentId, name: name, email: email, tracks: [] };
    var ov = document.getElementById('snPathwaysOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'snPathwaysOverlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
      ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = '<div style="background:#fff;border-radius:20px;padding:24px;width:100%;max-width:620px;max-height:90vh;overflow-y:auto;font-family:Nunito,sans-serif;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><div style="font-family:\'Fredoka One\',cursive;font-size:21px;">🧭 Pathways — ' + esc(name) + '</div>' +
      '<button onclick="document.getElementById(\'snPathwaysOverlay\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--light);">✕</button></div>' +
      '<div style="font-size:12px;font-weight:700;color:var(--light);margin-bottom:14px;">Each pathway has its own tutor, days and class link. Credits are shared: every completed class uses 1 credit, whatever the pathway.</div>' +
      '<div id="snPwList"><div style="padding:20px;text-align:center;color:var(--light);font-weight:800;">⏳ Loading…</div></div>' +
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">' +
        '<button onclick="snAddPathway()" style="flex:1;background:var(--blue);color:#fff;border:none;border-radius:12px;padding:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;">➕ Add a pathway</button>' +
        '<button onclick="document.getElementById(\'snPathwaysOverlay\').remove()" style="flex:1;background:var(--bg);border:1.5px solid #e8eaf0;border-radius:12px;padding:12px;font-weight:800;cursor:pointer;font-family:Nunito,sans-serif;">Close</button>' +
      '</div></div>';
    await loadTracks();
  };

  async function loadTracks() {
    var el = document.getElementById('snPwList'); if (!el) return;
    try {
      var d = await api('/api/enrollments/students/' + panel.studentId + '/tracks');
      panel.tracks = d.tracks.filter(function (t) { return t.linked || t.upcoming > 0 || t.completed > 0; });
      el.innerHTML = panel.tracks.length ? panel.tracks.map(card).join('') :
        '<div style="padding:18px;text-align:center;color:var(--light);font-weight:800;border:1.5px dashed #e8eaf0;border-radius:14px;">No pathways yet — use ➕ Add a pathway.</div>';
    } catch (e) { el.innerHTML = '<div style="color:#c53030;font-weight:800;">' + esc(e.message) + '</div>'; }
  }

  function card(t, i) {
    var meta = '👩‍🏫 ' + esc(t.tutorName || '—') + ' · ' + t.upcoming + ' upcoming' + (t.nextDate ? ' (next ' + day(t.nextDate) + ')' : '') + ' · ' + t.completed + ' done';
    var btns = t.upcoming > 0
      ? '<button onclick="snTrackAction(' + i + ',\'rs\')" style="background:#eef4ff;color:var(--blue);border:1.5px solid #c7d7fe;border-radius:10px;padding:7px 12px;font-weight:800;font-size:12px;cursor:pointer;font-family:Nunito,sans-serif;">🔄 Reschedule</button>' +
        '<button onclick="snTrackAction(' + i + ',\'ct\')" style="background:#eef4ff;color:var(--blue);border:1.5px solid #c7d7fe;border-radius:10px;padding:7px 12px;font-weight:800;font-size:12px;cursor:pointer;font-family:Nunito,sans-serif;">👩‍🏫 Change tutor</button>'
      : '';
    if (t.linked) {
      return '<div style="border:1.5px solid #e8eaf0;border-radius:14px;padding:14px;margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;">' +
          '<div style="font-weight:900;font-size:15px;">📚 ' + esc(t.pathwayName || 'Pathway') + (t.grade ? ' <span style="color:var(--light);font-size:12px;">Grade ' + t.grade + ' · ' + (t.lessonsCompleted || 0) + ' lessons done</span>' : '') +
            (t.status === 'paused' ? ' <span style="background:#fff7ed;color:#c2410c;border-radius:50px;padding:1px 8px;font-size:11px;">paused</span>' : '') + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + btns + '</div></div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--mid);margin-top:6px;">' + meta + '</div></div>';
    }
    var opts = ((typeof _allPathways !== 'undefined' && _allPathways) || []).map(function (p) { return '<option value="' + esc(p.id) + '"' + (t.lessonPathway && p.name === t.lessonPathway ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    return '<div style="border:1.5px solid #fdba74;background:#fffbeb;border-radius:14px;padding:14px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;">' +
        '<div style="font-weight:900;font-size:14px;color:#9a3412;">⚠ Classes not linked to a pathway</div><div style="display:flex;gap:6px;flex-wrap:wrap;">' + btns + '</div></div>' +
      '<div style="font-size:12px;font-weight:700;color:var(--mid);margin:6px 0 10px;">' + meta + (t.classLink ? ' · ' + esc(t.classLink) : '') + '</div>' +
      '<div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end;">' +
        '<div><div style="font-size:11px;font-weight:900;color:var(--mid);margin-bottom:4px;">Pathway</div><select id="snLinkPw' + i + '" style="width:100%;padding:9px;border:2px solid #e8eaf0;border-radius:10px;font-family:Nunito,sans-serif;font-weight:700;"><option value="">— Pathway —</option>' + opts + '</select></div>' +
        '<div><div style="font-size:11px;font-weight:900;color:var(--mid);margin-bottom:4px;">Grade</div><input id="snLinkGr' + i + '" type="number" min="1" max="12" placeholder="e.g. 4" style="width:100%;box-sizing:border-box;padding:9px;border:2px solid #e8eaf0;border-radius:10px;font-family:Nunito,sans-serif;font-weight:700;"></div>' +
        '<div><div style="font-size:11px;font-weight:900;color:var(--mid);margin-bottom:4px;">Lessons done</div><input id="snLinkDone' + i + '" type="number" min="0" placeholder="' + t.completed + '" style="width:100%;box-sizing:border-box;padding:9px;border:2px solid #e8eaf0;border-radius:10px;font-family:Nunito,sans-serif;font-weight:700;"></div>' +
        '<button onclick="snLinkTrack(' + i + ')" style="background:#0e9f6e;color:#fff;border:none;border-radius:10px;padding:10px 14px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;">🔗 Link</button>' +
      '</div></div>';
  }

  window.snTrackAction = function (i, kind) {
    var t = panel.tracks[i]; if (!t) return;
    document.getElementById('snPathwaysOverlay').remove();
    if (kind === 'rs') window.openRescheduleStudentModal(panel.studentId, panel.name, panel.email, t.key);
    else window.openChangeTutorModal(panel.studentId, panel.name, t.key);
  };

  window.snLinkTrack = async function (i) {
    var t = panel.tracks[i]; if (!t) return;
    var pathwayId = document.getElementById('snLinkPw' + i).value;
    var grade = document.getElementById('snLinkGr' + i).value;
    var done = document.getElementById('snLinkDone' + i).value;
    if (!pathwayId) { showToast('Choose the pathway these classes belong to.', 'warning'); return; }
    try {
      var d = await api('/api/enrollments/students/' + panel.studentId + '/link-track', {
        method: 'POST', body: JSON.stringify({ track: t.key, pathwayId: pathwayId, gradeNumber: grade || undefined, lessonsCompleted: done === '' ? undefined : done }),
      });
      showToast('🔗 ' + d.linked + ' classes linked to ' + d.pathwayName + '.');
      await loadTracks();
      if (typeof loadDashboard === 'function') loadDashboard();
    } catch (e) { showToast('⚠️ ' + e.message, 'error'); }
  };

  window.snAddPathway = function () {
    document.getElementById('snPathwaysOverlay').remove();
    if (typeof openPOSScheduleModal !== 'function') return;
    openPOSScheduleModal(panel.studentId, panel.name, panel.email);
    var sel = document.getElementById('pos-sm-pathway');
    if (sel) { sel.value = ''; if (typeof onPOSPathwayChange === 'function') onPOSPathwayChange(); }
    var info = document.getElementById('pos-sm-info');
    if (info) info.insertAdjacentHTML('afterbegin', '<div style="font-weight:900;color:#0e9f6e;margin-bottom:4px;">➕ Adding a new pathway — choose it below, with its own tutor, days and class link.</div>');
  };

  /* Forms closed → forget the chosen pathway */
  ['closeRescheduleStudentModal', 'closeChangeTutorModal'].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig === 'function') window[fn] = function () { window._snTrack = null; return orig.apply(this, arguments); };
  });
})();
