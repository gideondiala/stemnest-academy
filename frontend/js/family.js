/**
 * family.js — family logins.
 *
 * A parent logs in with their own email. They then view one child at a
 * time on the normal student dashboard, using a dashboard token issued for
 * that child; the parent's own tokens are kept alongside so they can switch
 * children or add one. Loaded by login.html, student-dashboard.html and
 * family-setup.html (after api.js).
 */
(function () {
  'use strict';

  var API = 'https://api.stemnestacademy.co.uk';
  var K = { token: 'sn_parent_token', refresh: 'sn_parent_refresh', user: 'sn_parent_user' };

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function parentUser() { try { return JSON.parse(get(K.user) || 'null'); } catch (e) { return null; } }
  function currentChild() { try { return JSON.parse(get('sn_api_user') || 'null'); } catch (e) { return null; } }
  function isFamily() { var c = currentChild(); return !!(get(K.token) && c && c.parentId); }

  /** Call the API as the parent, refreshing the parent token once if it expired. */
  async function parentCall(path, method, body) {
    var opts = function () {
      return { method: method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + get(K.token) },
               body: body ? JSON.stringify(body) : undefined };
    };
    var res = await fetch(API + path, opts());
    if (res.status === 401 && get(K.refresh)) {
      var r = await fetch(API + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                      body: JSON.stringify({ refreshToken: get(K.refresh) }) });
      var d = await r.json().catch(function () { return {}; });
      if (d.success) { set(K.token, d.accessToken); set(K.refresh, d.refreshToken); res = await fetch(API + path, opts()); }
    }
    if (res.status === 401) { clear(); window.location.href = '/pages/login.html'; throw new Error('Please log in again'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) throw new Error(data.error || 'Request failed');
    return data;
  }

  function clear() { del(K.token); del(K.refresh); del(K.user); }

  /** Make `studentId` the child shown on the dashboard. */
  async function switchTo(studentId) {
    var d = await parentCall('/api/families/switch', 'POST', { studentId: studentId });
    set('sn_access_token', d.token);
    del('sn_refresh_token');                       // the child token is renewed through the parent
    set('sn_api_user', JSON.stringify(d.user));
    set('sn_logged_in_student', d.user.email);
    set('sn_family_last_child', studentId);
    return d.user;
  }

  /** After a parent logs in: keep their tokens aside and open the first child. */
  async function enter() {
    set(K.token, get('sn_access_token'));
    set(K.refresh, get('sn_refresh_token') || '');
    set(K.user, get('sn_api_user'));
    var d = await parentCall('/api/families/me');
    if (!d.children.length) { window.location.href = '/pages/family-setup.html?add=1'; return; }
    var last = get('sn_family_last_child');
    var pick = d.children.find(function (c) { return c.id === last; }) || d.children[0];
    await switchTo(pick.id);
    window.location.href = '/pages/student-dashboard.html';
  }

  async function addChild(studentLogin, password) {
    return parentCall('/api/families/claim', 'POST', { studentLogin: studentLogin, password: password });
  }

  function logout() {
    clear();
    ['sn_access_token', 'sn_refresh_token', 'sn_api_user', 'sn_logged_in_student'].forEach(del);
    window.location.href = '/pages/login.html';
  }

  /* ── Switcher bar on the student dashboard ── */
  async function renderBar() {
    if (!isFamily()) return;
    var main = document.querySelector('.dash-main') || document.body;
    var bar = document.getElementById('familyBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'familyBar';
      bar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#eef4ff;border:1.5px solid #c7d7fe;border-radius:14px;padding:10px 14px;margin:0 0 16px;font-family:Nunito,sans-serif;';
      main.insertBefore(bar, main.firstChild);
    }
    var me = currentChild();
    var p = parentUser() || {};
    var children = [];
    try { children = (await parentCall('/api/families/me')).children; } catch (e) { return; }

    bar.innerHTML =
      '<span style="font-weight:900;color:#1e40af;font-size:13px;margin-right:4px;">👨‍👩‍👧 ' + esc(p.name || 'Family') + '</span>' +
      children.map(function (c) {
        var active = me && c.id === me.id;
        var hold = c.paused ? (c.pauseKind === 'credits' ? ' · on hold' : ' · paused') : '';
        return '<button type="button" data-child="' + esc(c.id) + '" style="border:none;border-radius:50px;padding:7px 14px;font-family:Nunito,sans-serif;font-weight:800;font-size:13px;cursor:pointer;' +
          (active ? 'background:#1a56db;color:#fff;' : 'background:#fff;color:#1e40af;border:1.5px solid #c7d7fe;') + '">' +
          esc(c.name.split(' ')[0]) + ' <span style="opacity:.75;font-size:11px;">' + esc(c.staffId || '') + ' · ' + (c.credits == null ? 0 : c.credits) + ' credits' + hold + '</span></button>';
      }).join('') +
      '<button type="button" id="familyAddBtn" style="border:1.5px dashed #1a56db;background:transparent;color:#1a56db;border-radius:50px;padding:6px 12px;font-family:Nunito,sans-serif;font-weight:800;font-size:12px;cursor:pointer;">+ Add a child</button>' +
      '<button type="button" id="familyLogoutBtn" style="margin-left:auto;border:none;background:transparent;color:#64748b;font-family:Nunito,sans-serif;font-weight:800;font-size:12px;cursor:pointer;">Log out</button>';

    bar.querySelectorAll('[data-child]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.getAttribute('data-child');
        if (me && id === me.id) return;
        b.textContent = '⏳';
        try { await switchTo(id); window.location.reload(); }
        catch (e) { alert(e.message); }
      });
    });
    document.getElementById('familyAddBtn').addEventListener('click', function () {
      window.location.href = '/pages/family-setup.html?add=1';
    });
    document.getElementById('familyLogoutBtn').addEventListener('click', logout);

    /* The sidebar Log Out button should end the family session too */
    document.querySelectorAll('.logout-btn').forEach(function (btn) {
      btn.onclick = function (e) { e.preventDefault(); logout(); };
    });
  }

  window.SNFamily = {
    isFamily: isFamily, enter: enter, switchTo: switchTo, addChild: addChild,
    parentCall: parentCall, parentUser: parentUser, clear: clear, logout: logout, renderBar: renderBar,
  };

  if (/student-dashboard(\.html)?$/.test(window.location.pathname)) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderBar);
    else renderBar();
  }
})();
