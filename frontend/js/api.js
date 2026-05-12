/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — API CLIENT (api.js)
   Central utility for all backend API calls.
   Handles auth tokens, refresh, and errors.
   Load this before any dashboard JS file.
═══════════════════════════════════════════════════════ */

const API_URL = 'https://api.stemnestacademy.co.uk';

/* ── Token helpers ── */
function getAccessToken()  { return localStorage.getItem('sn_access_token'); }
function getRefreshToken() { return localStorage.getItem('sn_refresh_token'); }
function setTokens(access, refresh) {
  localStorage.setItem('sn_access_token',  access);
  if (refresh) localStorage.setItem('sn_refresh_token', refresh);
}
function clearTokens() {
  localStorage.removeItem('sn_access_token');
  localStorage.removeItem('sn_refresh_token');
  localStorage.removeItem('sn_api_user');
}

/* ── Core fetch wrapper ── */
async function apiCall(endpoint, options = {}) {
  const token = getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
    ...(options.headers || {}),
  };

  let res = await fetch(API_URL + endpoint, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  /* Auto-refresh if 401 */
  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await _refreshTokens();
    if (refreshed) {
      headers['Authorization'] = 'Bearer ' + getAccessToken();
      res = await fetch(API_URL + endpoint, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } else {
      clearTokens();
      window.location.href = '/pages/login.html';
      return;
    }
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

async function _refreshTokens() {
  try {
    const res = await fetch(API_URL + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: getRefreshToken() }),
    });
    const data = await res.json();
    if (data.success) {
      setTokens(data.accessToken, data.refreshToken);
      return true;
    }
    return false;
  } catch { return false; }
}

/* ── Auth API ── */
const Auth = {
  async login(email, password) {
    const data = await apiCall('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setTokens(data.accessToken, data.refreshToken);
    /* Store user with both id and staffId for dashboard compatibility */
    const user = { ...data.user, staffId: data.user.staffId || data.user.staff_id };
    localStorage.setItem('sn_api_user', JSON.stringify(user));
    return user;
  },

  async logout() {
    try {
      await apiCall('/api/auth/logout', {
        method: 'POST',
        body: { refreshToken: getRefreshToken() },
      });
    } catch { /* silent */ }
    clearTokens();
  },

  async me() {
    return apiCall('/api/auth/me');
  },

  async forgotPassword(email) {
    return apiCall('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },

  async resetPassword(token, password) {
    return apiCall('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password },
    });
  },

  getStoredUser() {
    try { return JSON.parse(localStorage.getItem('sn_api_user') || 'null'); }
    catch { return null; }
  },

  isLoggedIn() {
    return !!getAccessToken();
  },
};

/* ── Users API ── */
const Users = {
  async get(id)         { return apiCall('/api/users/' + id); },
  async update(id, data){ return apiCall('/api/users/' + id, { method:'PUT', body:data }); },
  async changePassword(id, currentPassword, newPassword) {
    return apiCall('/api/users/' + id + '/password', {
      method: 'PUT',
      body: { currentPassword, newPassword },
    });
  },
  async getNotifications() { return apiCall('/api/users/me/notifications'); },
  async markNotificationRead(id) {
    return apiCall('/api/users/me/notifications/' + id + '/read', { method:'PUT' });
  },
};

/* ── Courses API ── */
const Courses = {
  async list(subject)   { return apiCall('/api/courses' + (subject ? '?subject=' + subject : '')); },
  async get(id)         { return apiCall('/api/courses/' + id); },
  async create(data)    { return apiCall('/api/courses', { method:'POST', body:data }); },
  async update(id, data){ return apiCall('/api/courses/' + id, { method:'PUT', body:data }); },
  async saveLessons(courseId, lessons) {
    return apiCall('/api/courses/' + courseId + '/lessons', {
      method: 'POST',
      body: { lessons },
    });
  },
};

/* ── Bookings API ── */
const Bookings = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiCall('/api/bookings' + (q ? '?' + q : ''));
  },
  async get(id)    { return apiCall('/api/bookings/' + id); },
  async create(data) {
    return apiCall('/api/bookings', { method:'POST', body:data });
  },
  async assign(id, data) {
    return apiCall('/api/bookings/' + id + '/assign', { method:'PUT', body:data });
  },
  async submitReport(id, data) {
    return apiCall('/api/bookings/' + id + '/report', { method:'POST', body:data });
  },
};

/* ── Sessions API ── */
const Sessions = {
  async upcoming()          { return apiCall('/api/sessions/upcoming'); },
  async enrolments()        { return apiCall('/api/sessions/enrolments'); },
  async enrol(data)         { return apiCall('/api/sessions/enrol', { method:'POST', body:data }); },
  async getAvailability(tutorId, from, to) {
    const q = new URLSearchParams({ ...(from?{from}:{}), ...(to?{to}:{}) }).toString();
    return apiCall('/api/sessions/availability/' + tutorId + (q ? '?' + q : ''));
  },
  async setAvailability(slots) {
    return apiCall('/api/sessions/availability', { method:'POST', body:{ slots } });
  },
  async clearAvailability(date) {
    return apiCall('/api/sessions/availability', { method:'DELETE', body:{ date } });
  },
};

/* ── Projects API ── */
const Projects = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiCall('/api/projects' + (q ? '?' + q : ''));
  },
  async create(data)       { return apiCall('/api/projects', { method:'POST', body:data }); },
  async submit(id, submission) {
    return apiCall('/api/projects/' + id + '/submit', { method:'PUT', body:{ submission } });
  },
  async review(id, remarks, score) {
    return apiCall('/api/projects/' + id + '/review', { method:'PUT', body:{ remarks, score } });
  },
};

/* ── Payments API ── */
const Payments = {
  async createLink(data)  { return apiCall('/api/payments/create-link', { method:'POST', body:data }); },
  async list()            { return apiCall('/api/payments'); },
  async studentHistory(id){ return apiCall('/api/payments/student/' + id); },
};

/* ── Check if API is reachable, fall back to localStorage ── */
let _apiAvailable = null;
async function isApiAvailable() {
  if (_apiAvailable !== null) return _apiAvailable;
  try {
    const res = await fetch(API_URL + '/api/health', { signal: AbortSignal.timeout(3000) });
    _apiAvailable = res.ok;
  } catch {
    _apiAvailable = false;
  }
  return _apiAvailable;
}
