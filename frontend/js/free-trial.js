/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — FREE TRIAL LANDING PAGE JS
   Two-step booking form: Step 1 saves immediately, Step 2 completes.
═══════════════════════════════════════════════════════ */

const TIME_SLOTS = []; // Legacy
let selectedTime   = '';
let step2SelectedTime = '';
let _partialBookingId = null; // ID returned after Step 1 saves

/* ── Timezone mapping — global so flag picker and backend logic can use it ── */
const TZ_MAP = {
  AF:'Asia/Kabul', AL:'Europe/Tirane', DZ:'Africa/Algiers', AD:'Europe/Andorra',
  AO:'Africa/Luanda', AR:'America/Argentina/Buenos_Aires', AM:'Asia/Yerevan',
  AU:'Australia/Sydney', AT:'Europe/Vienna', AZ:'Asia/Baku', BH:'Asia/Bahrain',
  BD:'Asia/Dhaka', BY:'Europe/Minsk', BE:'Europe/Brussels', BZ:'America/Belize',
  BJ:'Africa/Porto-Novo', BT:'Asia/Thimphu', BO:'America/La_Paz',
  BA:'Europe/Sarajevo', BW:'Africa/Gaborone', BR:'America/Sao_Paulo',
  BN:'Asia/Brunei', BG:'Europe/Sofia', BF:'Africa/Ouagadougou',
  BI:'Africa/Bujumbura', KH:'Asia/Phnom_Penh', CM:'Africa/Douala',
  CA:'America/Toronto', CV:'Atlantic/Cape_Verde', CF:'Africa/Bangui',
  TD:'Africa/Ndjamena', CL:'America/Santiago', CN:'Asia/Shanghai',
  CO:'America/Bogota', KM:'Indian/Comoro', CG:'Africa/Brazzaville',
  CD:'Africa/Kinshasa', CR:'America/Costa_Rica', HR:'Europe/Zagreb',
  CU:'America/Havana', CY:'Asia/Nicosia', CZ:'Europe/Prague',
  DK:'Europe/Copenhagen', DJ:'Africa/Djibouti', DO:'America/Santo_Domingo',
  EC:'America/Guayaquil', EG:'Africa/Cairo', SV:'America/El_Salvador',
  ER:'Africa/Asmara', EE:'Europe/Tallinn', ET:'Africa/Addis_Ababa',
  FI:'Europe/Helsinki', FR:'Europe/Paris', GA:'Africa/Libreville',
  GM:'Africa/Banjul', GE:'Asia/Tbilisi', DE:'Europe/Berlin',
  GH:'Africa/Accra', GR:'Europe/Athens', GT:'America/Guatemala',
  GN:'Africa/Conakry', GW:'Africa/Bissau', GY:'America/Guyana',
  HT:'America/Port-au-Prince', HN:'America/Tegucigalpa', HU:'Europe/Budapest',
  IS:'Atlantic/Reykjavik', IN:'Asia/Kolkata', ID:'Asia/Jakarta',
  IR:'Asia/Tehran', IQ:'Asia/Baghdad', IE:'Europe/Dublin',
  IL:'Asia/Jerusalem', IT:'Europe/Rome', CI:'Africa/Abidjan',
  JM:'America/Jamaica', JP:'Asia/Tokyo', JO:'Asia/Amman',
  KZ:'Asia/Almaty', KE:'Africa/Nairobi', KW:'Asia/Kuwait',
  KG:'Asia/Bishkek', LA:'Asia/Vientiane', LV:'Europe/Riga',
  LB:'Asia/Beirut', LS:'Africa/Maseru', LR:'Africa/Monrovia',
  LY:'Africa/Tripoli', LT:'Europe/Vilnius', LU:'Europe/Luxembourg',
  MG:'Indian/Antananarivo', MW:'Africa/Blantyre', MY:'Asia/Kuala_Lumpur',
  MV:'Indian/Maldives', ML:'Africa/Bamako', MT:'Europe/Malta',
  MR:'Africa/Nouakchott', MU:'Indian/Mauritius', MX:'America/Mexico_City',
  MD:'Europe/Chisinau', MC:'Europe/Monaco', MN:'Asia/Ulaanbaatar',
  ME:'Europe/Podgorica', MA:'Africa/Casablanca', MZ:'Africa/Maputo',
  MM:'Asia/Rangoon', NA:'Africa/Windhoek', NP:'Asia/Kathmandu',
  NL:'Europe/Amsterdam', NZ:'Pacific/Auckland', NI:'America/Managua',
  NE:'Africa/Niamey', NG:'Africa/Lagos', MK:'Europe/Skopje',
  NO:'Europe/Oslo', OM:'Asia/Muscat', PK:'Asia/Karachi',
  PS:'Asia/Gaza', PA:'America/Panama', PG:'Pacific/Port_Moresby',
  PY:'America/Asuncion', PE:'America/Lima', PH:'Asia/Manila',
  PL:'Europe/Warsaw', PT:'Europe/Lisbon', QA:'Asia/Qatar',
  RO:'Europe/Bucharest', RU:'Europe/Moscow', RW:'Africa/Kigali',
  SA:'Asia/Riyadh', SN:'Africa/Dakar', RS:'Europe/Belgrade',
  SL:'Africa/Freetown', SG:'Asia/Singapore', SK:'Europe/Bratislava',
  SI:'Europe/Ljubljana', SO:'Africa/Mogadishu', ZA:'Africa/Johannesburg',
  KR:'Asia/Seoul', SS:'Africa/Juba', ES:'Europe/Madrid',
  LK:'Asia/Colombo', SD:'Africa/Khartoum', SR:'America/Paramaribo',
  SE:'Europe/Stockholm', CH:'Europe/Zurich', SY:'Asia/Damascus',
  TW:'Asia/Taipei', TJ:'Asia/Dushanbe', TZ:'Africa/Dar_es_Salaam',
  TH:'Asia/Bangkok', TG:'Africa/Lome', TT:'America/Port_of_Spain',
  TN:'Africa/Tunis', TR:'Europe/Istanbul', TM:'Asia/Ashgabat',
  UG:'Africa/Kampala', UA:'Europe/Kiev', AE:'Asia/Dubai',
  GB:'Europe/London', US:'America/New_York', UY:'America/Montevideo',
  UZ:'Asia/Tashkent', VE:'America/Caracas', VN:'Asia/Ho_Chi_Minh',
  YE:'Asia/Aden', ZM:'Africa/Lusaka', ZW:'Africa/Harare',
};

/* ── Generate 15-minute time slots (00:00 – 23:45) full 24-hour ── */
function _generateTimeSlots() {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2,'0');
      const mm = String(m).padStart(2,'0');
      const period = h >= 12 ? 'PM' : 'AM';
      const h12    = h % 12 === 0 ? 12 : h % 12;
      const label  = `${hh}:${mm} (${h12}:${mm} ${period})`;
      slots.push({ value: `${hh}:${mm}`, label });
    }
  }
  return slots;
}

/* ── Build time dropdown and refresh available slots based on selected date ── */
function buildTimeGrid() {
  const container = document.getElementById('timeGrid');
  if (!container) return;

  /* Replace the old click-grid with a <select> dropdown */
  container.innerHTML = `
    <select id="f-time-select"
      onchange="selectTime(null, this.value)"
      style="width:100%;padding:14px 16px;border:2px solid #e8eaf0;border-radius:14px;
             font-family:'Nunito',sans-serif;font-size:15px;font-weight:700;color:#1a202c;
             outline:none;background:#fff;cursor:pointer;appearance:none;-webkit-appearance:none;">
      <option value="" disabled selected style="color:#a0aec0;">— Select a time (24-hour) —</option>
    </select>`;

  refreshTimeDropdown();

  /* When date changes, refresh available slots */
  const dateInput = document.getElementById('f-date');
  if (dateInput) {
    dateInput.addEventListener('change', refreshTimeDropdown);
  }
}

function refreshTimeDropdown() {
  const sel = document.getElementById('f-time-select');
  if (!sel) return;

  const dateInput = document.getElementById('f-date');
  const selectedDate = dateInput ? dateInput.value : '';
  const today = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === today;

  /* Current time in minutes from midnight */
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  /* Add 30-min buffer so parent has time to prepare */
  const minMins = currentMins + 30;

  const allSlots = _generateTimeSlots();
  const available = isToday
    ? allSlots.filter(s => {
        const [sh, sm] = s.value.split(':').map(Number);
        return (sh * 60 + sm) > minMins;
      })
    : allSlots;

  const prev = sel.value;
  sel.innerHTML = '<option value="" disabled style="color:#a0aec0;">— Select a time (24-hour) —</option>' +
    available.map(s =>
      `<option value="${s.value}" ${s.value === prev ? 'selected' : ''}>${s.label}</option>`
    ).join('');

  /* If previously selected time is no longer available, clear it */
  if (prev && !available.find(s => s.value === prev)) {
    selectedTime = '';
    sel.value = '';
  }
}

function selectTime(el, time) {
  /* Keep selectedTime in HH:MM 24-hour format for correct WAT conversion */
  selectedTime = time; /* e.g. "20:00" */
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  buildStep1CountryDropdown();
  bindStep1Country();
  buildStep2TimeGrid();
  setStep2MinDate();
  bindScrollReveal();
});

/* ════════════════════════════════════════════
   STEP 1 — Country dropdown + phone code + timezone
════════════════════════════════════════════ */
function buildStep1CountryDropdown() {
  /* Build the flag list — called once on init */
  _buildFlagList('');
}

function _buildFlagList(filter) {
  const list = document.getElementById('s1-flag-list');
  if (!list) return;
  const q = filter.toLowerCase();
  const filtered = COUNTRIES.filter(c =>
    !q || c.name.toLowerCase().includes(q) || c.dial.includes(q)
  );
  list.innerHTML = filtered.slice(0, 80).map(c => {
    const tz = TZ_MAP[c.code] || '';
    return `<div onclick="selectFlag('${c.code}','${c.dial}','${tz}','${_getFlag(c.code)}')"
      style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;color:#1a202c;border-bottom:1px solid #f8f9ff;"
      onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''"
    >
      <span style="font-size:20px;">${_getFlag(c.code)}</span>
      <span style="flex:1;">${c.name}</span>
      <span style="color:#a0aec0;font-size:13px;">${c.dial}</span>
    </div>`;
  }).join('') || '<div style="padding:14px;color:#a0aec0;font-size:13px;text-align:center;">No results</div>';
}

function _getFlag(code) {
  /* Convert 2-letter country code to flag emoji */
  if (!code || code.length !== 2) return '🌍';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + 0x1F1A5));
}

function toggleFlagDropdown() {
  const dd = document.getElementById('s1-flag-dropdown');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => { document.getElementById('s1-flag-search')?.focus(); }, 50);
  }
}

function filterFlagDropdown() {
  const q = document.getElementById('s1-flag-search')?.value || '';
  _buildFlagList(q);
}

function selectFlag(code, dial, tz, flag) {
  const btn      = document.getElementById('s1-flag-btn');
  const codeVal  = document.getElementById('s1-code-value');
  const tzInput  = document.getElementById('s1-tz');
  const tzDisp   = document.getElementById('s1-tz-display');
  const s2TzDisp = document.getElementById('s2-tz-display');
  const flagEmoji= document.getElementById('s1-flag-emoji');
  const flagCode = document.getElementById('s1-flag-code');
  const codeStr  = document.getElementById('s1-country-code-str');

  if (flagEmoji) flagEmoji.textContent = flag;
  if (flagCode)  flagCode.textContent  = dial;
  if (codeVal)   codeVal.value = dial;
  if (tzInput)   tzInput.value = tz;
  if (codeStr)   codeStr.value = code;

  /* Show timezone hint */
  if (tz && tzDisp) {
    try {
      const now = new Date();
      const tzShort = now.toLocaleTimeString('en-GB', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop();
      tzDisp.textContent = `🌍 ${tzShort}`;
      if (s2TzDisp) s2TzDisp.innerHTML = `🌍 <strong>${tz.replace('_',' ')}</strong> (${tzShort}) — auto-detected`;
    } catch { tzDisp.textContent = ''; }
  } else if (tzDisp) { tzDisp.textContent = ''; }

  /* Close dropdown */
  const dd = document.getElementById('s1-flag-dropdown');
  if (dd) dd.style.display = 'none';

  /* Focus phone input */
  document.getElementById('s1-phone')?.focus();
}

/* Close flag dropdown when clicking outside */
document.addEventListener('click', e => {
  const btn = document.getElementById('s1-flag-btn');
  const dd  = document.getElementById('s1-flag-dropdown');
  if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = 'none';
  }
});

function bindStep1Country() { /* No-op — replaced by flag picker */ }

/* ── STEP 1 SUBMIT ── */
async function submitStep1() {
  const name    = document.getElementById('s1-name')?.value.trim();
  const grade   = document.getElementById('s1-grade')?.value;
  const phone   = document.getElementById('s1-phone')?.value.trim();
  const code    = document.getElementById('s1-code-value')?.value || '+44';
  const tz      = document.getElementById('s1-tz')?.value || '';
  const ccode   = document.getElementById('s1-country-code-str')?.value || 'GB';
  const flag    = document.getElementById('s1-flag-emoji')?.textContent || '🌍';

  if (!name)    { shakeField('s1-name');    showToast("Please enter the student's name.", 'error'); return; }
  if (!grade)   { shakeField('s1-grade');   showToast('Please select a grade.', 'error'); return; }
  if (!phone)   { shakeField('s1-phone');   showToast('Please enter your WhatsApp number.', 'error'); return; }

  const btn = document.getElementById('nextBtn');
  const btnText = document.getElementById('nextBtnText');
  if (btn) { btn.disabled = true; }
  if (btnText) btnText.textContent = '⏳ Saving...';

  /* Resolve country name from code */
  const countryObj = COUNTRIES.find(c => c.code === ccode);
  const countryName = countryObj ? countryObj.name : ccode;
  const fullPhone   = `${code} ${phone}`.trim();

  try {
    const res = await fetch('https://api.stemnestacademy.co.uk/api/bookings/partial', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName: name, grade, whatsapp: phone, countryCode: code, country: ccode, countryName, timezone: tz }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Save failed');
    _partialBookingId = data.bookingId;
  } catch (err) {
    /* Non-blocking — proceed even if partial save fails */
    console.warn('[STEP1] Partial save failed:', err.message);
    _partialBookingId = 'LOCAL-' + Date.now().toString(36).toUpperCase();
  }

  /* Show Step 2 */
  document.getElementById('formStep1').style.display = 'none';
  const step2 = document.getElementById('formStep2');
  step2.style.display = 'block';
  step2.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* Pre-fill summary */
  const summary = document.getElementById('step2Summary');
  if (summary) summary.innerHTML = `👦 <strong>${name}</strong> · ${grade} · 📱 ${fullPhone}`;

  /* Store Step 1 data for final submission */
  window._step1Data = { name, grade, phone: fullPhone, countryCode: code, countryName, timezone: tz };

  if (btn)     { btn.disabled = false; }
  if (btnText) btnText.textContent = 'Next → (2 more questions)';
}

function goBackStep1() {
  document.getElementById('formStep2').style.display = 'none';
  document.getElementById('formStep1').style.display = 'block';
  document.getElementById('formStep1').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ════════════════════════════════════════════
   STEP 2 — Time grid, date, submit
════════════════════════════════════════════ */
function setStep2MinDate() {
  const dateInput = document.getElementById('s2-date');
  if (!dateInput) return;
  const today = new Date().toISOString().split('T')[0];
  dateInput.min   = today;
  dateInput.value = today;
  dateInput.addEventListener('change', refreshStep2TimeDropdown);
}

function buildStep2TimeGrid() {
  const container = document.getElementById('s2-timeGrid');
  if (!container) return;
  container.innerHTML = `
    <select id="s2-time-select"
      onchange="step2SelectTime(this.value)"
      style="width:100%;padding:12px 14px;border:2px solid #e8eaf0;border-radius:12px;
             font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;color:#1a202c;
             outline:none;background:#fff;cursor:pointer;appearance:none;-webkit-appearance:none;">
      <option value="" disabled selected style="color:#a0aec0;">— Select a time (24-hour) —</option>
    </select>`;
  refreshStep2TimeDropdown();
}

function refreshStep2TimeDropdown() {
  const sel = document.getElementById('s2-time-select');
  if (!sel) return;
  const dateInput = document.getElementById('s2-date');
  const selectedDate = dateInput ? dateInput.value : '';
  const today = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === today;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes() + 30;
  const allSlots = _generateTimeSlots();
  const available = isToday ? allSlots.filter(s => {
    const [sh, sm] = s.value.split(':').map(Number);
    return (sh * 60 + sm) > currentMins;
  }) : allSlots;
  const prev = sel.value;
  sel.innerHTML = '<option value="" disabled style="color:#a0aec0;">— Select a time (24-hour) —</option>' +
    available.map(s => `<option value="${s.value}" ${s.value === prev ? 'selected' : ''}>${s.label}</option>`).join('');
  if (prev && !available.find(s => s.value === prev)) { step2SelectedTime = ''; sel.value = ''; }
}

function step2SelectTime(time) { step2SelectedTime = time; }

/* ── STEP 2 SUBMIT ── */
async function submitStep2() {
  const email      = document.getElementById('s2-email')?.value.trim();
  const parentName = document.getElementById('s2-parent-name')?.value.trim();
  const device     = document.querySelector('input[name="s2-device"]:checked')?.value;
  const date       = document.getElementById('s2-date')?.value;

  if (!email || !email.includes('@')) { shakeField('s2-email'); showToast('Please enter a valid email address.', 'error'); return; }
  if (!device) { showToast('Please select Laptop or Desktop.', 'error'); return; }
  if (!date)   { shakeField('s2-date'); showToast('Please select a preferred date.', 'error'); return; }
  if (!step2SelectedTime) { showToast('Please select a preferred time.', 'error'); return; }

  const btn     = document.getElementById('submitBtn');
  const btnText = document.getElementById('submitBtnText');
  if (btn) { btn.disabled = true; }
  if (btnText) btnText.textContent = '⏳ Confirming your class...';

  const step1 = window._step1Data || {};
  const tz    = step1.timezone || '';

  /* Fire TikTok pixel */
  if (typeof ttq !== 'undefined') { try { ttq.track('SubmitForm'); } catch {} }

  try {
    let bookingId = _partialBookingId;

    if (bookingId && !bookingId.startsWith('LOCAL-')) {
      /* Complete the existing partial booking */
      const res = await fetch(`https://api.stemnestacademy.co.uk/api/bookings/${bookingId}/complete`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, parentName: parentName || '', device, date, time: step2SelectedTime }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Completion failed');
    } else {
      /* Fallback: submit as a full booking if partial save failed */
      const res = await fetch('https://api.stemnestacademy.co.uk/api/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: step1.name || '',
          age:         '',
          grade:       step1.grade || '',
          email,
          whatsapp:    step1.phone || '',
          parentName:  parentName || '',
          country:     step1.countryName || '',
          subject:     'Coding',
          device,
          timezone:    tz,
          date,
          time:        step2SelectedTime,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Booking failed');
      bookingId = data.bookingId;
    }

    /* Fire Meta Pixel Lead event */
    if (typeof fbq === 'function') { fbq('track', 'Lead', { content_name: 'Free Demo Booking', content_category: 'Coding' }); }

    /* Redirect to dedicated thank-you page with booking details as URL params */
    var confirmParams = new URLSearchParams({
      ref:     bookingId || '',
      name:    step1.name || '',
      grade:   step1.grade || '',
      subject: 'Coding',
      date:    date || '',
      time:    (step2SelectedTime || '') + (tz ? ' (' + tz + ')' : ''),
      email:   email || '',
      phone:   step1.phone || '',
      parent:  parentName || '',
    });
    window.location.href = 'booking-confirmed.html?' + confirmParams.toString();

  } catch (err) {
    if (btn)     { btn.disabled = false; }
    if (btnText) btnText.textContent = 'Book My FREE Demo Class →';
    showToast('Could not submit. Please check your connection and try again.', 'error');
    console.error('[STEP2] Submit error:', err.message);
  }
}

/* ── Legacy aliases kept for compatibility ── */
function selectTime(el, time) { step2SelectedTime = time; }
function submitBooking() { submitStep2(); }

/* ── Scroll reveal ── */
function bindScrollReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ── Set minimum date to today, default to today ── */
function setMinDate() {
  const dateInput = document.getElementById('f-date');
  if (!dateInput) return;
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;
  dateInput.value = today;
}
function bindTimezoneChange() {
  const sel = document.getElementById('f-timezone');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const display = document.getElementById('tzDisplay');
    if (!display) return;
    const tz = sel.value;
    if (!tz) { display.textContent = ''; return; }
    try {
      const now = new Date();
      const label = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      display.textContent = `Your local time: ${label}`;
    } catch(e) {
      display.textContent = '';
    }
  });
}

/* ── Subject card visual highlight ── */
function bindSubjectHighlight() {
  document.querySelectorAll('.lp-subject-opt input').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.lp-subj-card').forEach(c => {
        c.style.borderColor = '';
        c.style.background  = '';
      });
    });
  });
}

/* ── Scroll reveal ── */
function bindScrollReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ── Country list with calling codes ── */
const COUNTRIES = [
  { name: 'Afghanistan', code: 'AF', dial: '+93' },
  { name: 'Albania', code: 'AL', dial: '+355' },
  { name: 'Algeria', code: 'DZ', dial: '+213' },
  { name: 'Andorra', code: 'AD', dial: '+376' },
  { name: 'Angola', code: 'AO', dial: '+244' },
  { name: 'Argentina', code: 'AR', dial: '+54' },
  { name: 'Armenia', code: 'AM', dial: '+374' },
  { name: 'Australia', code: 'AU', dial: '+61' },
  { name: 'Austria', code: 'AT', dial: '+43' },
  { name: 'Azerbaijan', code: 'AZ', dial: '+994' },
  { name: 'Bahrain', code: 'BH', dial: '+973' },
  { name: 'Bangladesh', code: 'BD', dial: '+880' },
  { name: 'Belarus', code: 'BY', dial: '+375' },
  { name: 'Belgium', code: 'BE', dial: '+32' },
  { name: 'Belize', code: 'BZ', dial: '+501' },
  { name: 'Benin', code: 'BJ', dial: '+229' },
  { name: 'Bhutan', code: 'BT', dial: '+975' },
  { name: 'Bolivia', code: 'BO', dial: '+591' },
  { name: 'Bosnia and Herzegovina', code: 'BA', dial: '+387' },
  { name: 'Botswana', code: 'BW', dial: '+267' },
  { name: 'Brazil', code: 'BR', dial: '+55' },
  { name: 'Brunei', code: 'BN', dial: '+673' },
  { name: 'Bulgaria', code: 'BG', dial: '+359' },
  { name: 'Burkina Faso', code: 'BF', dial: '+226' },
  { name: 'Burundi', code: 'BI', dial: '+257' },
  { name: 'Cambodia', code: 'KH', dial: '+855' },
  { name: 'Cameroon', code: 'CM', dial: '+237' },
  { name: 'Canada', code: 'CA', dial: '+1' },
  { name: 'Cape Verde', code: 'CV', dial: '+238' },
  { name: 'Central African Republic', code: 'CF', dial: '+236' },
  { name: 'Chad', code: 'TD', dial: '+235' },
  { name: 'Chile', code: 'CL', dial: '+56' },
  { name: 'China', code: 'CN', dial: '+86' },
  { name: 'Colombia', code: 'CO', dial: '+57' },
  { name: 'Comoros', code: 'KM', dial: '+269' },
  { name: 'Congo (Brazzaville)', code: 'CG', dial: '+242' },
  { name: 'Congo (DRC)', code: 'CD', dial: '+243' },
  { name: 'Costa Rica', code: 'CR', dial: '+506' },
  { name: 'Croatia', code: 'HR', dial: '+385' },
  { name: 'Cuba', code: 'CU', dial: '+53' },
  { name: 'Cyprus', code: 'CY', dial: '+357' },
  { name: 'Czech Republic', code: 'CZ', dial: '+420' },
  { name: 'Denmark', code: 'DK', dial: '+45' },
  { name: 'Djibouti', code: 'DJ', dial: '+253' },
  { name: 'Dominican Republic', code: 'DO', dial: '+1' },
  { name: 'Ecuador', code: 'EC', dial: '+593' },
  { name: 'Egypt', code: 'EG', dial: '+20' },
  { name: 'El Salvador', code: 'SV', dial: '+503' },
  { name: 'Eritrea', code: 'ER', dial: '+291' },
  { name: 'Estonia', code: 'EE', dial: '+372' },
  { name: 'Ethiopia', code: 'ET', dial: '+251' },
  { name: 'Finland', code: 'FI', dial: '+358' },
  { name: 'France', code: 'FR', dial: '+33' },
  { name: 'Gabon', code: 'GA', dial: '+241' },
  { name: 'Gambia', code: 'GM', dial: '+220' },
  { name: 'Georgia', code: 'GE', dial: '+995' },
  { name: 'Germany', code: 'DE', dial: '+49' },
  { name: 'Ghana', code: 'GH', dial: '+233' },
  { name: 'Greece', code: 'GR', dial: '+30' },
  { name: 'Guatemala', code: 'GT', dial: '+502' },
  { name: 'Guinea', code: 'GN', dial: '+224' },
  { name: 'Guinea-Bissau', code: 'GW', dial: '+245' },
  { name: 'Guyana', code: 'GY', dial: '+592' },
  { name: 'Haiti', code: 'HT', dial: '+509' },
  { name: 'Honduras', code: 'HN', dial: '+504' },
  { name: 'Hungary', code: 'HU', dial: '+36' },
  { name: 'Iceland', code: 'IS', dial: '+354' },
  { name: 'India', code: 'IN', dial: '+91' },
  { name: 'Indonesia', code: 'ID', dial: '+62' },
  { name: 'Iran', code: 'IR', dial: '+98' },
  { name: 'Iraq', code: 'IQ', dial: '+964' },
  { name: 'Ireland', code: 'IE', dial: '+353' },
  { name: 'Israel', code: 'IL', dial: '+972' },
  { name: 'Italy', code: 'IT', dial: '+39' },
  { name: 'Ivory Coast', code: 'CI', dial: '+225' },
  { name: 'Jamaica', code: 'JM', dial: '+1' },
  { name: 'Japan', code: 'JP', dial: '+81' },
  { name: 'Jordan', code: 'JO', dial: '+962' },
  { name: 'Kazakhstan', code: 'KZ', dial: '+7' },
  { name: 'Kenya', code: 'KE', dial: '+254' },
  { name: 'Kuwait', code: 'KW', dial: '+965' },
  { name: 'Kyrgyzstan', code: 'KG', dial: '+996' },
  { name: 'Laos', code: 'LA', dial: '+856' },
  { name: 'Latvia', code: 'LV', dial: '+371' },
  { name: 'Lebanon', code: 'LB', dial: '+961' },
  { name: 'Lesotho', code: 'LS', dial: '+266' },
  { name: 'Liberia', code: 'LR', dial: '+231' },
  { name: 'Libya', code: 'LY', dial: '+218' },
  { name: 'Lithuania', code: 'LT', dial: '+370' },
  { name: 'Luxembourg', code: 'LU', dial: '+352' },
  { name: 'Madagascar', code: 'MG', dial: '+261' },
  { name: 'Malawi', code: 'MW', dial: '+265' },
  { name: 'Malaysia', code: 'MY', dial: '+60' },
  { name: 'Maldives', code: 'MV', dial: '+960' },
  { name: 'Mali', code: 'ML', dial: '+223' },
  { name: 'Malta', code: 'MT', dial: '+356' },
  { name: 'Mauritania', code: 'MR', dial: '+222' },
  { name: 'Mauritius', code: 'MU', dial: '+230' },
  { name: 'Mexico', code: 'MX', dial: '+52' },
  { name: 'Moldova', code: 'MD', dial: '+373' },
  { name: 'Monaco', code: 'MC', dial: '+377' },
  { name: 'Mongolia', code: 'MN', dial: '+976' },
  { name: 'Montenegro', code: 'ME', dial: '+382' },
  { name: 'Morocco', code: 'MA', dial: '+212' },
  { name: 'Mozambique', code: 'MZ', dial: '+258' },
  { name: 'Myanmar', code: 'MM', dial: '+95' },
  { name: 'Namibia', code: 'NA', dial: '+264' },
  { name: 'Nepal', code: 'NP', dial: '+977' },
  { name: 'Netherlands', code: 'NL', dial: '+31' },
  { name: 'New Zealand', code: 'NZ', dial: '+64' },
  { name: 'Nicaragua', code: 'NI', dial: '+505' },
  { name: 'Niger', code: 'NE', dial: '+227' },
  { name: 'Nigeria', code: 'NG', dial: '+234' },
  { name: 'North Macedonia', code: 'MK', dial: '+389' },
  { name: 'Norway', code: 'NO', dial: '+47' },
  { name: 'Oman', code: 'OM', dial: '+968' },
  { name: 'Pakistan', code: 'PK', dial: '+92' },
  { name: 'Palestine', code: 'PS', dial: '+970' },
  { name: 'Panama', code: 'PA', dial: '+507' },
  { name: 'Papua New Guinea', code: 'PG', dial: '+675' },
  { name: 'Paraguay', code: 'PY', dial: '+595' },
  { name: 'Peru', code: 'PE', dial: '+51' },
  { name: 'Philippines', code: 'PH', dial: '+63' },
  { name: 'Poland', code: 'PL', dial: '+48' },
  { name: 'Portugal', code: 'PT', dial: '+351' },
  { name: 'Qatar', code: 'QA', dial: '+974' },
  { name: 'Romania', code: 'RO', dial: '+40' },
  { name: 'Russia', code: 'RU', dial: '+7' },
  { name: 'Rwanda', code: 'RW', dial: '+250' },
  { name: 'Saudi Arabia', code: 'SA', dial: '+966' },
  { name: 'Senegal', code: 'SN', dial: '+221' },
  { name: 'Serbia', code: 'RS', dial: '+381' },
  { name: 'Sierra Leone', code: 'SL', dial: '+232' },
  { name: 'Singapore', code: 'SG', dial: '+65' },
  { name: 'Slovakia', code: 'SK', dial: '+421' },
  { name: 'Slovenia', code: 'SI', dial: '+386' },
  { name: 'Somalia', code: 'SO', dial: '+252' },
  { name: 'South Africa', code: 'ZA', dial: '+27' },
  { name: 'South Korea', code: 'KR', dial: '+82' },
  { name: 'South Sudan', code: 'SS', dial: '+211' },
  { name: 'Spain', code: 'ES', dial: '+34' },
  { name: 'Sri Lanka', code: 'LK', dial: '+94' },
  { name: 'Sudan', code: 'SD', dial: '+249' },
  { name: 'Suriname', code: 'SR', dial: '+597' },
  { name: 'Sweden', code: 'SE', dial: '+46' },
  { name: 'Switzerland', code: 'CH', dial: '+41' },
  { name: 'Syria', code: 'SY', dial: '+963' },
  { name: 'Taiwan', code: 'TW', dial: '+886' },
  { name: 'Tajikistan', code: 'TJ', dial: '+992' },
  { name: 'Tanzania', code: 'TZ', dial: '+255' },
  { name: 'Thailand', code: 'TH', dial: '+66' },
  { name: 'Togo', code: 'TG', dial: '+228' },
  { name: 'Trinidad and Tobago', code: 'TT', dial: '+1' },
  { name: 'Tunisia', code: 'TN', dial: '+216' },
  { name: 'Turkey', code: 'TR', dial: '+90' },
  { name: 'Turkmenistan', code: 'TM', dial: '+993' },
  { name: 'Uganda', code: 'UG', dial: '+256' },
  { name: 'Ukraine', code: 'UA', dial: '+380' },
  { name: 'United Arab Emirates', code: 'AE', dial: '+971' },
  { name: 'United Kingdom', code: 'GB', dial: '+44' },
  { name: 'United States', code: 'US', dial: '+1' },
  { name: 'Uruguay', code: 'UY', dial: '+598' },
  { name: 'Uzbekistan', code: 'UZ', dial: '+998' },
  { name: 'Venezuela', code: 'VE', dial: '+58' },
  { name: 'Vietnam', code: 'VN', dial: '+84' },
  { name: 'Yemen', code: 'YE', dial: '+967' },
  { name: 'Zambia', code: 'ZM', dial: '+260' },
  { name: 'Zimbabwe', code: 'ZW', dial: '+263' },
];

/* ── Build searchable country dropdown ── */
function buildCountryDropdown() {
  const sel = document.getElementById('f-country');
  if (!sel) return;

  sel.innerHTML = '<option value="">— Select your country —</option>' +
    COUNTRIES.map(c => {
      const tz = TZ_MAP[c.code] || '';
      return `<option value="${c.code}" data-dial="${c.dial}" data-tz="${tz}">${c.name}</option>`;
    }).join('');
}

/* ── Auto-fill phone country code AND timezone when country is selected ── */
function bindCountryPhoneCode() {
  const countrySel = document.getElementById('f-country');
  const codeDisplay = document.getElementById('f-phone-code-display');
  const codeInput   = document.getElementById('f-country-code');
  const tzHidden    = document.getElementById('f-timezone');
  const tzDisplay   = document.getElementById('tzDetectedDisplay');
  if (!countrySel) return;

  countrySel.addEventListener('change', () => {
    const selected = countrySel.options[countrySel.selectedIndex];
    const dial = selected ? selected.getAttribute('data-dial') : '';
    const tz   = selected ? (selected.getAttribute('data-tz') || '') : '';

    if (dial) {
      if (codeInput)   codeInput.value = dial;
      if (codeDisplay) codeDisplay.textContent = dial;
    }

    if (tz && tzHidden) {
      tzHidden.value = tz;
      /* Show timezone label */
      if (tzDisplay) {
        try {
          const now = new Date();
          const tzLabel = now.toLocaleTimeString('en-GB', { timeZone: tz, timeZoneName: 'long' })
            .split(' ').slice(2).join(' ');
          const tzShort = now.toLocaleTimeString('en-GB', { timeZone: tz, timeZoneName: 'short' })
            .split(' ').pop();
          tzDisplay.innerHTML = `🌍 <strong>${tzLabel}</strong> (${tzShort}) — detected from your country`;
          tzDisplay.style.color = '#065f46';
          tzDisplay.style.background = '#f0fdf4';
          tzDisplay.style.borderColor = '#86efac';
        } catch {
          tzDisplay.textContent = `🌍 Timezone: ${tz}`;
        }
      }
    } else if (tzDisplay) {
      tzDisplay.textContent = '🌍 Select your country above — timezone will be detected automatically';
      tzDisplay.style.color = '#1a56db';
      tzDisplay.style.background = '#f0f4ff';
      tzDisplay.style.borderColor = '#dbeafe';
      if (tzHidden) tzHidden.value = '';
    }
  });
}

/* ══════════════════════════════════════════════════════
   FORM SUBMISSION — handled by submitStep1() and submitStep2() above
   Legacy alias kept for compatibility
══════════════════════════════════════════════════════ */

function shakeField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake .4s ease';
  el.style.borderColor = 'var(--orange)';
  setTimeout(() => { el.style.borderColor = ''; el.style.animation = ''; }, 1000);
}

/* ── localStorage helpers ── */
function getBookings() {
  try { return JSON.parse(localStorage.getItem('sn_bookings') || '[]'); } catch { return []; }
}
function saveBooking(booking) {
  const all = getBookings();
  all.unshift(booking); // newest first
  localStorage.setItem('sn_bookings', JSON.stringify(all));
}
function generateId() {
  return 'SN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5).toUpperCase();
}

/* ── Simulate email + WhatsApp (console log — replace with real API) ── */
function simulateConfirmations(b) {
  const joinUrl = `${window.location.origin}/frontend/pages/join-class.html`;
  const emailBody = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STEMNEST ACADEMY — Demo Class Confirmed ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hi ${b.parentName !== '—' ? b.parentName : 'there'},

Great news! ${b.studentName}'s FREE demo class has been confirmed.

📚 Subject:  ${b.subject}
📅 Date:     ${formatDate(b.date)}
🕐 Time:     ${b.time} (${b.timezone})
🎓 Student:  ${b.studentName} (${b.grade}, Age ${b.age})
🖥️ Device:   ${b.device}
🆔 Booking:  ${b.id}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  HOW TO JOIN YOUR CLASS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Visit: ${joinUrl}
2. Enter your Gmail (${b.email}) or WhatsApp number
3. Click "Find My Class" to see your Join button
4. Click "Join Class" at your scheduled time

TIPS FOR A GREAT CLASS:
✅ Use a laptop or desktop (not a phone)
✅ Find a quiet spot with good lighting
✅ Test your camera and microphone beforehand
✅ Have a pen and notebook ready
✅ Join 2–3 minutes early

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REMINDER CALLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You will receive an automated reminder call:
📞 30 minutes before your class
📞 10 minutes before your class

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Questions? Reply to this email or WhatsApp us.
Website: https://stemnestacademy.co.uk

StemNest Academy Ltd · Registered in England & Wales
  `;

  const whatsappMsg = `
🎉 *Demo Class Confirmed — StemNest Academy!*

Hi${b.parentName !== '—' ? ' ' + b.parentName : ''}! ${b.studentName}'s FREE demo class is booked ✅

📚 *Subject:* ${b.subject}
📅 *Date:* ${formatDate(b.date)}
🕐 *Time:* ${b.time}
🆔 *Booking ID:* ${b.id}

*To join the class:*
👉 ${joinUrl}
Enter: ${b.email}

You'll get reminder calls 30 mins & 10 mins before class 📞

See you soon! 🚀 — StemNest Academy
  `;

  // In production: POST to /api/notifications/send with { email, whatsapp, emailBody, whatsappMsg }
  console.log('📧 EMAIL TO:', b.email);
  console.log(emailBody);
  console.log('💬 WHATSAPP TO:', b.whatsapp);
  console.log(whatsappMsg);
}

/* ── Success screen — permanent confirmation, no auto-redirect ── */
function showSuccessScreen(b) {
  /* Fire Meta Pixel Lead event */
  if (typeof fbq === 'function') {
    fbq('track', 'Lead', { content_name: 'Free Demo Booking', content_category: b.subject || 'Demo' });
  }

  /* Replace the entire page content with a clean confirmation screen */
  document.body.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Nunito', sans-serif; background: #f4f6fb; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
      .confirm-wrap { max-width: 600px; width: 100%; }
      .confirm-card { background: #fff; border-radius: 24px; padding: 48px 40px; box-shadow: 0 8px 40px rgba(0,0,0,.10); text-align: center; }
      .confirm-icon { font-size: 72px; margin-bottom: 16px; }
      .confirm-title { font-family: 'Fredoka One', cursive; font-size: 32px; color: #1a202c; margin-bottom: 8px; }
      .confirm-sub { font-size: 16px; color: #718096; font-weight: 700; margin-bottom: 32px; line-height: 1.6; }
      .confirm-ref { background: linear-gradient(135deg, #1a56db, #0e9f6e); border-radius: 16px; padding: 24px; margin-bottom: 28px; color: #fff; }
      .confirm-ref-label { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; opacity: .8; margin-bottom: 6px; }
      .confirm-ref-id { font-family: 'Fredoka One', cursive; font-size: 28px; letter-spacing: 2px; margin-bottom: 4px; }
      .confirm-ref-hint { font-size: 12px; opacity: .8; font-weight: 700; }
      .confirm-details { background: #f7f9ff; border-radius: 14px; padding: 20px 24px; margin-bottom: 28px; text-align: left; }
      .confirm-row { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; color: #4a5568; padding: 6px 0; border-bottom: 1px solid #edf2f7; }
      .confirm-row:last-child { border-bottom: none; }
      .confirm-row span:first-child { font-size: 18px; width: 28px; flex-shrink: 0; }
      .confirm-copy-btn { background: #f7f9ff; border: 2px solid #e8eaf0; border-radius: 10px; padding: 8px 16px; font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 13px; cursor: pointer; color: #4a5568; margin-top: 4px; transition: .15s; }
      .confirm-copy-btn:hover { background: #1a56db; color: #fff; border-color: #1a56db; }
      .confirm-checklist { background: #f0fdf4; border-radius: 14px; padding: 20px 24px; margin-bottom: 28px; text-align: left; }
      .confirm-checklist-title { font-weight: 900; color: #065f46; font-size: 14px; margin-bottom: 12px; }
      .confirm-check { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #374151; font-weight: 700; margin-bottom: 8px; }
      .confirm-check:last-child { margin-bottom: 0; }
      .confirm-home-btn { display: block; background: #1a56db; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 50px; font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 15px; margin: 0 auto; transition: .15s; border: none; cursor: pointer; }
      .confirm-home-btn:hover { background: #1140b0; }
      .confirm-footer { margin-top: 24px; font-size: 12px; color: #a0aec0; font-weight: 700; }
    </style>

    <div class="confirm-wrap">
      <div class="confirm-card">
        <div class="confirm-icon">🎉</div>
        <div class="confirm-title">Your demo class is confirmed!</div>
        <div class="confirm-sub">
          ${b.parentName && b.parentName !== '—' ? 'Hi <strong>' + b.parentName + '</strong>! ' : ''}
          We're so excited to meet <strong>${b.studentName}</strong>.<br>
          Check your email and WhatsApp for your confirmation.
        </div>

        <!-- Booking reference — screenshot this -->
        <div class="confirm-ref">
          <div class="confirm-ref-label">📋 Your Booking Reference</div>
          <div class="confirm-ref-id" id="bookingRefDisplay">${b.dbId || b.id}</div>
          <div class="confirm-ref-hint">Screenshot this or copy it — you'll need it to find your class</div>
          <button class="confirm-copy-btn" style="margin-top:12px;background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.4);color:#fff;"
            onclick="navigator.clipboard.writeText('${b.dbId || b.id}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>this.textContent='📋 Copy Reference',2000)})">
            📋 Copy Reference
          </button>
        </div>

        <!-- Booking details -->
        <div class="confirm-details">
          <div class="confirm-row"><span>🎓</span><span><strong>${b.studentName}</strong> · ${b.grade} · Age ${b.age}</span></div>
          <div class="confirm-row"><span>${b.subject === 'Coding' ? '💻' : b.subject === 'Maths' ? '📐' : '🔬'}</span><span><strong>${b.subject}</strong></span></div>
          <div class="confirm-row"><span>📅</span><span>${formatDate(b.date)}</span></div>
          <div class="confirm-row"><span>🕐</span><span>${b.time} (${b.timezone})</span></div>
          ${b.email ? `<div class="confirm-row"><span>📧</span><span>${b.email}</span></div>` : ''}
          ${b.whatsapp && b.whatsapp !== '' ? `<div class="confirm-row"><span>📱</span><span>${b.whatsapp}</span></div>` : ''}
        </div>

        <!-- What to prepare -->
        <div class="confirm-checklist">
          <div class="confirm-checklist-title">✅ What to prepare before your class:</div>
          <div class="confirm-check"><span>💻</span><span>Make sure you have a <strong>laptop or desktop</strong> ready — phones and tablets are not supported</span></div>
          <div class="confirm-check"><span>🎧</span><span>Test your <strong>camera and microphone</strong> in advance</span></div>
          <div class="confirm-check"><span>📶</span><span>Find a quiet spot with a <strong>stable internet connection</strong></span></div>
          <div class="confirm-check"><span>⏰</span><span>Join <strong>2–3 minutes early</strong> — your teacher will be waiting</span></div>
          <div class="confirm-check"><span>📧</span><span>Check your email for the <strong>class joining link</strong> and full instructions</span></div>
        </div>

        <button class="confirm-home-btn" onclick="window.location.href='https://stemnestacademy.co.uk'">
          Back to StemNest Academy →
        </button>

        <div class="confirm-footer">
          🔒 Your details are safe with us · StemNest Academy Ltd · Registered in England & Wales
        </div>
      </div>
    </div>`;
}

/* ── Helpers ── */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
