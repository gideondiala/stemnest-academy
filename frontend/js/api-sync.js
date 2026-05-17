/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — LIVE SYNC TRIGGER (api-sync.js)
   Re-triggers dashboard render functions every 30 seconds
   to keep data fresh directly from the PostgreSQL API.
═══════════════════════════════════════════════════════ */

/* ── Convert API time "HH:MM:SS" to "H:MM AM/PM" display format ── */
function _formatApiTime(t) {
  if (!t) return '—';
  /* Already in 12h format */
  if (/AM|PM/i.test(t)) return t;
  /* Convert HH:MM or HH:MM:SS to 12h */
  const parts = t.split(':');
  let h = parseInt(parts[0]);
  const m = parts[1] || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + period;
}

/* ── Legacy push wrappers (deprecated in favour of direct api.js calls) ── */
async function pushClassReport(bookingId, reportData) {
  return Sync.classReport({ bookingId, ...reportData });
}
async function pushPipelineRecord(record) {
  return Sync.pipeline(record);
}
async function pushLateJoin(data) {
  return Sync.lateJoin(data);
}
async function pushCreditsUpdate(studentEmail, credits, type, description, bookingId) {
  return Sync.credits({ studentEmail, credits, type, description, bookingId });
}

/* ─────────────────────────────────────────────
   MASTER SYNC — triggers dashboard updates
───────────────────────────────────────────── */
async function triggerDashboardRefresh() {
  if (!Auth.isLoggedIn()) return;
  const online = await isApiAvailable();
  if (!online) return;

  const user = Auth.getStoredUser();
  if (!user) return;

  /* Re-render the active tab if a render function exists */

  /* Presales — re-render incoming if visible */
  if (typeof renderIncoming === 'function' && document.getElementById('tab-incoming')?.style.display !== 'none') {
    renderIncoming();
    if (typeof updatePSStats === 'function') updatePSStats();
  }
  /* Admin — re-render bookings if visible */
  if (typeof loadBookings === 'function' && document.getElementById('tab-bookings')?.style.display !== 'none') {
    loadBookings();
  }
  /* Tutor — re-render upcoming cards */
  if (typeof renderUpcomingCards === 'function') {
    renderUpcomingCards();
  }
  /* Sales — re-render overview */
  if (typeof renderOverview === 'function' && document.getElementById('tab-overview')?.style.display !== 'none') {
    renderOverview();
    if (typeof updateStats === 'function') updateStats();
  }
  /* HR — re-render applications */
  if (typeof renderApplications === 'function' && document.getElementById('tab-applications')?.style.display !== 'none') {
    renderApplications();
  }
  
  /* Notifications */
  try {
    const data = await Users.getNotifications();
    if (data && data.notifications) {
      const unread = data.notifications.filter(n => !n.is_read).length;
      const badge = document.getElementById('notifBadge');
      if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'inline-block' : 'none'; }
    }
  } catch(e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  /* ── Auto-refresh every 30 seconds for real-time data ── */
  setInterval(triggerDashboardRefresh, 30000);
});

window.addEventListener('sn:login', triggerDashboardRefresh);
