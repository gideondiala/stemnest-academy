/**
 * Timezone helpers.
 *
 * Every booking's `date` + `time` columns are stored in PLATFORM time
 * (WAT — Africa/Lagos, UTC+1, no daylight saving). All tutors are in
 * Nigeria and every existing record was entered in WAT.
 *
 * Because WAT is a fixed offset, a stored date+time maps to exactly one
 * real instant. These helpers convert that instant into whatever
 * timezone a viewer / email recipient is in.
 */

const PLATFORM_TZ = 'Africa/Lagos';
const PLATFORM_OFFSET_MINS = 60; // WAT = UTC+1, no DST

/* Friendly abbreviations for zones Intl only reports as "GMT+X" */
const TZ_ABBR = {
  'Africa/Lagos': 'WAT', 'Africa/Douala': 'WAT', 'Africa/Kinshasa': 'WAT', 'Africa/Luanda': 'WAT',
  'Africa/Nairobi': 'EAT', 'Africa/Kampala': 'EAT', 'Africa/Dar_es_Salaam': 'EAT', 'Africa/Addis_Ababa': 'EAT',
  'Africa/Johannesburg': 'SAST',
  'Africa/Harare': 'CAT', 'Africa/Lusaka': 'CAT', 'Africa/Maputo': 'CAT', 'Africa/Kigali': 'CAT',
  'Africa/Cairo': 'EET',
  'Asia/Kolkata': 'IST', 'Asia/Calcutta': 'IST',
};

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
  catch { return false; }
}

/** Normalise a DB/JS date value to 'YYYY-MM-DD'. */
function toDateStr(date) {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString().split('T')[0];
  return String(date).split('T')[0];
}

/** Normalise '17:00', '17:00:00' or '5:00 PM' to { h, m }. */
function parseTime(time) {
  const s = String(time || '').trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const p = ampm[3].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return { h, m: parseInt(ampm[2], 10) };
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (!hm) return null;
  return { h: parseInt(hm[1], 10), m: parseInt(hm[2], 10) };
}

/** Stored (WAT) date + time → real instant (Date). Returns null if unparseable. */
function platformToInstant(date, time) {
  const ds = toDateStr(date);
  const t  = parseTime(time);
  if (!ds || !t) return null;
  const [y, mo, d] = ds.split('-').map(Number);
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d, t.h, t.m) - PLATFORM_OFFSET_MINS * 60000);
}

/** Instant → { date: 'YYYY-MM-DD', time: 'HH:MM' } in platform time (WAT). */
function instantToPlatform(instant) {
  const shifted = new Date(instant.getTime() + PLATFORM_OFFSET_MINS * 60000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Local date + time in `tz` → { date, time } in platform time (WAT). */
function localToPlatform(date, time, tz) {
  const ds = toDateStr(date);
  const t  = parseTime(time);
  if (!ds || !t) return null;
  if (!isValidTimeZone(tz)) tz = PLATFORM_TZ;
  const [y, mo, d] = ds.split('-').map(Number);
  /* Treat the wall-clock value as UTC, then correct by the zone's offset
     at that moment (re-checked once to handle DST boundaries). */
  const wallAsUtc = Date.UTC(y, mo - 1, d, t.h, t.m);
  let instant = wallAsUtc - _offsetMins(new Date(wallAsUtc), tz) * 60000;
  instant = wallAsUtc - _offsetMins(new Date(instant), tz) * 60000;
  return instantToPlatform(new Date(instant));
}

/** Offset of `tz` from UTC at `instant`, in minutes. */
function _offsetMins(instant, tz) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instant).forEach(p => { parts[p.type] = p.value; });
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/** Short zone label, e.g. 'WAT', 'EAT', 'BST', 'GMT'. */
function tzAbbr(tz, instant = new Date()) {
  if (!isValidTimeZone(tz)) tz = PLATFORM_TZ;
  const read = locale => new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(instant).find(p => p.type === 'timeZoneName')?.value || '';
  let abbr = read('en-US');
  if (/^GMT[+-]/.test(abbr)) abbr = read('en-GB');
  if (/^GMT[+-]/.test(abbr) && TZ_ABBR[tz]) abbr = TZ_ABBR[tz];
  return abbr;
}

/**
 * Format a stored (WAT) booking date + time for someone in `tz`.
 * Returns { date: 'Monday, 6 October 2026', shortDate: 'Mon 6 Oct', time: '7:00 PM', abbr: 'EAT', full: '...' }
 */
function formatForTimeZone(date, time, tz) {
  const instant = platformToInstant(date, time);
  if (!instant) return null;
  if (!isValidTimeZone(tz)) tz = PLATFORM_TZ;
  const longDate  = instant.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = instant.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr   = instant.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const abbr      = tzAbbr(tz, instant);
  return { date: longDate, shortDate, time: timeStr, abbr, full: `${longDate} at ${timeStr} ${abbr}`.trim(), instant };
}

module.exports = {
  PLATFORM_TZ,
  isValidTimeZone,
  toDateStr,
  parseTime,
  platformToInstant,
  instantToPlatform,
  localToPlatform,
  tzAbbr,
  formatForTimeZone,
};
