/* Tiny JSON client for /api. Sends the session cookie automatically and
   turns any error response into a thrown Error carrying the server's message. */
const Api = (() => {
  const pendingGets = new Map();
  async function request(method, path, body) {
    const authVersion = typeof AuthService !== 'undefined' ? AuthService.sessionVersion() : null;
    const opts = { method, credentials: "same-origin", headers: {} };
    if (method !== "GET") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body || {});
    }
    const controller = new AbortController();
    opts.signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), 35000);
    let res, data;
    try {
      res = await fetch("/api" + path, opts);
      data = await res.json().catch(() => ({}));
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('The server took too long to respond. Please try again shortly.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      if (res.status === 401 && typeof AuthService !== 'undefined') {
        pendingGets.clear();
        AuthService.invalidateSession(authVersion);
      }
      const err = new Error(data.error || "Something went wrong — try again");
      err.status = res.status;
      throw err;
    }
    return data;
  }
  function mutate(method, path, body) {
    pendingGets.clear();
    return request(method, path, body).finally(() => pendingGets.clear());
  }
  return {
    get: (path) => {
      if (pendingGets.has(path)) return pendingGets.get(path);
      const pending = request("GET", path).finally(() => {
        if (pendingGets.get(path) === pending) pendingGets.delete(path);
      });
      pendingGets.set(path, pending);
      return pending;
    },
    post: (path, body) => mutate("POST", path, body),
    put: (path, body) => mutate("PUT", path, body),
    del: (path) => mutate("DELETE", path),
  };
})();
