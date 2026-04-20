/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — UTILS.JS
   Shared helpers used across every page.
═══════════════════════════════════════════════════════ */

/**
 * Navigate to another page.
 * Automatically resolves paths whether called from root or /pages/.
 */
function navigate(page) {
  const inPages = window.location.pathname.includes('/pages/');
  const root    = inPages ? '../' : './';
  const map = {
    home:               inPages ? '../index.html' : 'index.html',
    courses:            root + 'pages/courses.html',
    login:              root + 'pages/login.html',
    'tutor-dashboard':  root + 'pages/tutor-dashboard.html',
    'student-dashboard': root + 'pages/student-dashboard.html',
    'free-trial':       root + 'pages/free-trial.html',
    'join-class':       root + 'pages/join-class.html',
    'admin-dashboard':  root + 'pages/admin-dashboard.html',
  };
  if (map[page]) window.location.href = map[page];
}

/**
 * Smooth-scroll to a section ID on the current page.
 * If the section isn't here, navigate home first then scroll.
 */
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    // Not on home page – go home and hash-scroll
    const inPages = window.location.pathname.includes('/pages/');
    window.location.href = (inPages ? '../index.html' : 'index.html') + '#' + id;
  }
}

/**
 * Show a floating toast notification.
 * @param {string} msg  - The message to show
 * @param {string} type - 'success' | 'error' | 'info'
 */
function showToast(msg, type = 'success') {
  const colours = {
    success: '#1a202c',
    error:   '#c53030',
    info:    '#1a56db',
  };
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `
    position:fixed; bottom:32px; left:50%;
    transform:translateX(-50%) translateY(20px);
    opacity:0;
    background:${colours[type] || colours.success};
    color:#fff; padding:12px 28px; border-radius:50px;
    font-family:'Nunito',sans-serif; font-weight:800; font-size:14px;
    box-shadow:0 8px 24px rgba(0,0,0,.25); z-index:9999;
    transition:all .3s ease; white-space:nowrap;
  `;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity  = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

/**
 * Set the active state on nav links that have a data-page attribute.
 * Call on every page with the current page name.
 * @param {string} currentPage - e.g. 'home', 'courses', 'login'
 */
function setActiveNav(currentPage) {
  document.querySelectorAll('.nav-links a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === currentPage);
  });
}

/**
 * On page load: if there's a #hash in the URL, scroll to that section.
 * Useful when navigating from another page via scrollToSection().
 */
document.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }
});
