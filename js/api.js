/* Tiny JSON client for backend API. Sends the session cookie automatically
   (supports both same-origin and cross-origin through credentials: "include")
   and turns any error response into a thrown Error carrying the server's message. */
const Api = (() => {
  function getBaseUrl() {
    return (window.CONFIG && window.CONFIG.API_BASE_URL) ? window.CONFIG.API_BASE_URL.replace(/\/+$/, '') : '/api';
  }

  function getFullUrl(path) {
    const base = getBaseUrl();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  async function request(method, path, body) {
    const opts = { method, credentials: 'include', headers: {} };
    if (method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body || {});
    }

    const url = getFullUrl(path);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong — try again');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path),
    getBaseUrl,
    getFullUrl,
  };
})();
