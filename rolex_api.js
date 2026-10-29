/**
 * Shared Rolex frontend API helper.
 * Resolves API base URL and shows a clear banner when the backend isn't reachable.
 */
(function (global) {
  const TRADER_PORT = '3000';
  const TRADER_ORIGIN = `http://localhost:${TRADER_PORT}`;

  function resolveApiBase() {
    if (global.location.protocol === 'file:') return TRADER_ORIGIN;
    const port = global.location.port;
    if (port && port !== TRADER_PORT) return TRADER_ORIGIN;
    return '';
  }

  const API_BASE = resolveApiBase();
  const TOKEN_KEY = 'quant_jwt';

  function getToken() {
    return global.localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    if (token) global.localStorage.setItem(TOKEN_KEY, token);
    else global.localStorage.removeItem(TOKEN_KEY);
  }

  function clearToken() {
    global.localStorage.removeItem(TOKEN_KEY);
  }

  /** @param {boolean|undefined} json - pass false to omit Content-Type */
  /** @param {boolean|undefined} auth - pass false to omit Authorization (login/register) */
  function hdr(json, auth) {
    const h = {};
    if (json !== false) h['Content-Type'] = 'application/json';
    if (auth !== false) {
      const token = getToken();
      if (token) h.Authorization = 'Bearer ' + token;
    }
    return h;
  }

  function hdrPublic(json) {
    return hdr(json, false);
  }

  async function api(path, opt) {
    const r = await fetch(API_BASE + path, opt || {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 404 && path.startsWith('/api/')) {
        throw new Error(
          'API not found. Start the server with `npm start` or `npm run trader`, then open ' +
          TRADER_ORIGIN + '/RolexHome.html'
        );
      }
      const err = new Error(j.error || r.statusText || 'Request failed');
      err.status = r.status;
      throw err;
    }
    return j;
  }

  /** Validate stored JWT; clears token only on auth failure (401/403). */
  async function restoreSession() {
    const token = getToken();
    if (!token) return null;
    try {
      return await api('/api/quant/me', { headers: hdr(false) });
    } catch (e) {
      if (e.status === 401 || e.status === 403) clearToken();
      return null;
    }
  }

  function ensureBanner() {
    let el = document.getElementById('rolexServerBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rolexServerBanner';
      el.style.cssText =
        'display:none;position:fixed;top:0;left:0;right:0;z-index:9999;' +
        'background:#2a1018;border-bottom:1px solid rgba(255,23,68,.45);' +
        'color:#ffb4c0;padding:12px 18px;font:13px/1.6 Inter,sans-serif;text-align:center';
      document.body.prepend(el);
    }
    return el;
  }

  function showServerBanner(html) {
    const el = ensureBanner();
    el.style.display = 'block';
    el.innerHTML = html;
    document.body.style.paddingTop = (el.offsetHeight || 52) + 'px';
  }

  async function checkServer() {
    if (API_BASE && global.location.protocol !== 'file:') {
      showServerBanner(
        'Rolex API runs on <b>' + TRADER_ORIGIN + '</b>. ' +
        '<a href="' + TRADER_ORIGIN + global.location.pathname + '" style="color:#64ffda">Open on the correct port →</a>'
      );
    }
    try {
      const r = await fetch(API_BASE + '/api/health', { cache: 'no-store' });
      if (!r.ok) throw new Error('health failed');
      const el = document.getElementById('rolexServerBanner');
      if (el) el.style.display = 'none';
      return true;
    } catch {
      showServerBanner(
        'Rolex backend is not running. In the project folder run <code style="background:rgba(0,0,0,.35);padding:2px 6px;border-radius:4px">npm start</code> ' +
        'or <code style="background:rgba(0,0,0,.35);padding:2px 6px;border-radius:4px">npm run trader</code>, ' +
        'then open <a href="' + TRADER_ORIGIN + '/RolexHome.html" style="color:#64ffda">' + TRADER_ORIGIN + '/RolexHome.html</a>'
      );
      return false;
    }
  }

  global.RolexAPI = {
    API_BASE,
    TRADER_ORIGIN,
    TOKEN_KEY,
    getToken,
    setToken,
    clearToken,
    hdr,
    hdrPublic,
    api,
    restoreSession,
    checkServer,
    showServerBanner,
  };
})(window);
