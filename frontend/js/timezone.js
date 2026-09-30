/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — TIMEZONE HELPERS (timezone.js)

   Booking date + time are stored in WAT (Africa/Lagos, UTC+1,
   no daylight saving). These helpers show that moment in the
   viewer's own timezone, e.g. 5:00 PM WAT → 7:00 PM EAT in Nairobi.

   Load before any dashboard JS that displays class times.
   Mirrors backend/src/utils/timezone.js.
═══════════════════════════════════════════════════════ */

(function () {
  var PLATFORM_TZ = 'Africa/Lagos';
  var PLATFORM_OFFSET_MINS = 60; // WAT = UTC+1

  var TZ_ABBR = {
    'Africa/Lagos': 'WAT', 'Africa/Douala': 'WAT', 'Africa/Kinshasa': 'WAT', 'Africa/Luanda': 'WAT',
    'Africa/Nairobi': 'EAT', 'Africa/Kampala': 'EAT', 'Africa/Dar_es_Salaam': 'EAT', 'Africa/Addis_Ababa': 'EAT',
    'Africa/Johannesburg': 'SAST',
    'Africa/Harare': 'CAT', 'Africa/Lusaka': 'CAT', 'Africa/Maputo': 'CAT', 'Africa/Kigali': 'CAT',
    'Africa/Cairo': 'EET',
    'Asia/Kolkata': 'IST', 'Asia/Calcutta': 'IST'
  };

  function isValidTimeZone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
    catch (e) { return false; }
  }

  /** The viewer's browser timezone, e.g. 'Africa/Nairobi'. */
  function viewerTZ() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return isValidTimeZone(tz) ? tz : PLATFORM_TZ;
    } catch (e) { return PLATFORM_TZ; }
  }

  /** '2026-10-06', '2026-10-06T00:00:00.000Z' or Date → '2026-10-06'. */
  function toDateStr(date) {
    if (!date) return null;
    if (date instanceof Date) return isNaN(date) ? null : date.toISOString().split('T')[0];
    var s = String(date).split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  /** '17:00', '17:00:00' or '5:00 PM' → { h, m }. */
  function parseTime(time) {
    var s = String(time || '').trim();
    var ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      var h = parseInt(ampm[1], 10);
      var p = ampm[3].toUpperCase();
      if (p === 'PM' && h !== 12) h += 12;
      if (p === 'AM' && h === 12) h = 0;
      return { h: h, m: parseInt(ampm[2], 10) };
    }
    var hm = s.match(/^(\d{1,2}):(\d{2})/);
    if (!hm) return null;
    return { h: parseInt(hm[1], 10), m: parseInt(hm[2], 10) };
  }

  /** Stored (WAT) date + time → real instant (Date), or null. */
  function platformToInstant(date, time) {
    var ds = toDateStr(date);
    var t  = parseTime(time);
    if (!ds || !t) return null;
    var p = ds.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2], t.h, t.m) - PLATFORM_OFFSET_MINS * 60000);
  }

  /** Instant → { date: 'YYYY-MM-DD', time: 'HH:MM' } in WAT. */
  function instantToPlatform(instant) {
    var iso = new Date(instant.getTime() + PLATFORM_OFFSET_MINS * 60000).toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  }

  function _offsetMins(instant, tz) {
    var parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(instant).forEach(function (p) { parts[p.type] = p.value; });
    var asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
    return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
  }

  /** Date + time typed in `tz` (default: viewer's) → { date, time } in WAT for saving. */
  function localToPlatform(date, time, tz) {
    var ds = toDateStr(date);
    var t  = parseTime(time);
    if (!ds || !t) return null;
    tz = isValidTimeZone(tz) ? tz : viewerTZ();
    var p = ds.split('-').map(Number);
    var wallAsUtc = Date.UTC(p[0], p[1] - 1, p[2], t.h, t.m);
    var instant = wallAsUtc - _offsetMins(new Date(wallAsUtc), tz) * 60000;
    instant = wallAsUtc - _offsetMins(new Date(instant), tz) * 60000;
    return instantToPlatform(new Date(instant));
  }

  /** Short zone label: 'WAT', 'EAT', 'BST', 'GMT'… */
  function tzAbbr(tz, instant) {
    tz = isValidTimeZone(tz) ? tz : viewerTZ();
    instant = instant || new Date();
    function read(locale) {
      try {
        var part = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' })
          .formatToParts(instant).filter(function (p) { return p.type === 'timeZoneName'; })[0];
        return part ? part.value : '';
      } catch (e) { return ''; }
    }
    var abbr = read('en-US');
    if (/^GMT[+-]/.test(abbr)) abbr = read('en-GB');
    if (/^GMT[+-]/.test(abbr) && TZ_ABBR[tz]) abbr = TZ_ABBR[tz];
    return abbr;
  }

  /**
   * Format a stored (WAT) booking date + time for the viewer (or `tz`).
   * Returns null if the value can't be parsed, otherwise:
   *   { instant, dateKey: 'YYYY-MM-DD', date: 'Tue, 6 Oct 2026', shortDate: 'Tue 6 Oct',
   *     longDate: 'Tuesday, 6 October 2026', time: '7:00 PM', abbr: 'EAT', timeWithZone: '7:00 PM EAT' }
   */
  function formatClassTime(date, time, tz) {
    var instant = platformToInstant(date, time);
    if (!instant) return null;
    tz = isValidTimeZone(tz) ? tz : viewerTZ();
    var keyParts = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(instant).forEach(function (p) { keyParts[p.type] = p.value; });
    var t    = instant.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    var abbr = tzAbbr(tz, instant);
    return {
      instant:      instant,
      dateKey:      keyParts.year + '-' + keyParts.month + '-' + keyParts.day,
      date:         instant.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      shortDate:    instant.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }),
      longDate:     instant.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      time:         t,
      abbr:         abbr,
      timeWithZone: (t + ' ' + abbr).trim()
    };
  }

  /**
   * Keep the logged-in user's saved timezone in step with their device
   * so emails show their local time. Runs at most once per session.
   */
  function syncUserTimezone() {
    try {
      var token = localStorage.getItem('sn_access_token');
      if (!token) return;
      var tz = viewerTZ();
      if (sessionStorage.getItem('sn_tz_synced') === tz) return;
      var user = null;
      try { user = JSON.parse(localStorage.getItem('sn_api_user') || 'null'); } catch (e) {}
      if (user && user.timezone === tz) { sessionStorage.setItem('sn_tz_synced', tz); return; }
      var base = (typeof API_URL !== 'undefined') ? API_URL : 'https://api.stemnestacademy.co.uk';
      fetch(base + '/api/users/me/timezone', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz })
      }).then(function (r) {
        if (!r.ok) return;
        sessionStorage.setItem('sn_tz_synced', tz);
        if (user) { user.timezone = tz; localStorage.setItem('sn_api_user', JSON.stringify(user)); }
      }).catch(function () {});
    } catch (e) { /* storage unavailable — ignore */ }
  }

  window.SNTime = {
    PLATFORM_TZ: PLATFORM_TZ,
    isValidTimeZone: isValidTimeZone,
    viewerTZ: viewerTZ,
    toDateStr: toDateStr,
    parseTime: parseTime,
    platformToInstant: platformToInstant,
    instantToPlatform: instantToPlatform,
    localToPlatform: localToPlatform,
    tzAbbr: tzAbbr,
    formatClassTime: formatClassTime,
    syncUserTimezone: syncUserTimezone
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncUserTimezone);
  else syncUserTimezone();
})();
