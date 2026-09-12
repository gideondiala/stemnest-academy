/**
 * StemNest Academy — Frontend Auth Guard
 * Runs immediately on page load (before any dashboard JS).
 * If the user is not logged in or doesn't have the required role,
 * they are redirected to login immediately.
 *
 * Usage — add to each protected page:
 *   <script src="../js/auth-guard.js" data-roles="admin,super_admin"></script>
 *
 * The data-roles attribute is a comma-separated list of allowed roles.
 * If omitted, any authenticated user is allowed through.
 */
(function () {
  /* ── Read the current script tag's data-roles attribute ── */
  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1]; // last = current
  var allowedRolesAttr = currentScript.getAttribute('data-roles') || '';
  var allowedRoles = allowedRolesAttr
    ? allowedRolesAttr.split(',').map(function (r) { return r.trim(); })
    : [];

  /* ── Read stored auth state ── */
  var token = localStorage.getItem('sn_access_token');
  var userRaw = localStorage.getItem('sn_api_user');
  var user = null;
  try { user = userRaw ? JSON.parse(userRaw) : null; } catch (e) {}

  var loginUrl = '/pages/login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);

  /* ── No token → redirect to login ── */
  if (!token) {
    window.location.replace(loginUrl);
    document.documentElement.style.display = 'none'; // hide flash
    return;
  }

  /* ── Token exists but we can't decode it client-side reliably ── */
  /* Check expiry via the stored user object if available ── */
  /* A simple check: if token looks like a JWT, parse the payload */
  try {
    var parts = token.split('.');
    if (parts.length === 3) {
      var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        /* Token expired — clear and redirect */
        localStorage.removeItem('sn_access_token');
        localStorage.removeItem('sn_api_user');
        window.location.replace(loginUrl);
        document.documentElement.style.display = 'none';
        return;
      }
    }
  } catch (e) { /* token parsing failed — allow through, API will reject */ }

  /* ── Role check — if roles specified, verify user has one ── */
  if (allowedRoles.length > 0) {
    var userRole = user ? (user.role || '') : '';
    if (!userRole || allowedRoles.indexOf(userRole) === -1) {
      /* Logged in but wrong role — redirect to login with message */
      window.location.replace('/pages/login.html?error=unauthorized');
      document.documentElement.style.display = 'none';
      return;
    }
  }

  /* ── Passed all checks — show the page ── */
  document.documentElement.style.display = '';
})();
