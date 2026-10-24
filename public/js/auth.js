/* =========================================================================
   AuthService — email + OTP authentication against /api/auth.
   The server emails a 6-digit code; verifying it sets an httpOnly session
   cookie (valid for 24 hours), so the browser never holds
   the session token itself. init() restores the user from that cookie on
   page load. Every call site only talks to AuthService / requireAuth().
   ========================================================================= */

const AuthService = (() => {
  let user = null;
  let version = 0;
  let logoutTask = null;

  async function init() {
    try { setUser((await Api.get("/auth/me")).user); } catch (e) { setUser(null); }
    return user;
  }

  function isAuthenticated() { return !!user; }
  function getUser() { return user; }
  function setUser(next) { user = next; version++; }
  function sessionVersion() { return version; }

  function invalidateSession(expectedVersion = version) {
    // Ignore a late 401 belonging to a previous login, and coalesce failures
    // from simultaneous private requests into one anonymous-state refresh.
    if (!user || expectedVersion !== version) return;
    setUser(null);
    if (typeof ChatService !== 'undefined') ChatService.disconnect();
    Promise.resolve(onAuthStateChanged()).catch((err) => console.error('Session UI refresh failed:', err));
  }

  function sendOtp(email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Promise.reject(new Error("Enter a valid email address"));
    return Api.post("/auth/send-otp", { email });
  }

  async function verifyOtp(email, code) {
    setUser((await Api.post("/auth/verify-otp", { email, code })).user);
    return user;
  }

  function logout() {
    if (logoutTask) return logoutTask;
    const startedVersion = version;
    logoutTask = Api.post("/auth/logout").then(() => {
      if (version === startedVersion) setUser(null);
    }).finally(() => { logoutTask = null; });
    return logoutTask;
  }

  // The core progressive-auth primitive: run `action` now if logged in,
  // otherwise open the login modal and run `action` once login succeeds.
  // Every Save / Connect / Chat / Join-community call site should go
  // through this instead of calling its handler directly.
  function requireAuth(action) {
    if (isAuthenticated()) { if (typeof action === 'function') action(); return true; }
    openAuthModal(action);
    return false;
  }

  return { init, isAuthenticated, getUser, setUser, sessionVersion, invalidateSession, sendOtp, verifyOtp, logout, requireAuth };
})();

/* ---------------- login modal UI (talks only to AuthService above) ---------------- */
let _authPendingAction = null;
let _authEmail = "";
let _authTimerId = null;
let _authVerifyTask = null;
let _authOpen = false;
let _authOpener = null;
let _authFocusTimer = null;
const _authBackground = new Map();

function authFocusables() {
  return [...document.querySelectorAll('#authOverlay button:not([disabled]), #authOverlay input:not([disabled]), #authOverlay a[href], #authOverlay [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.closest('[hidden]') && node.getClientRects().length);
}

const otpBoxes = () => [...document.querySelectorAll("#authOtpBoxes input")];
function clearOtpBoxes() {
  const boxes = otpBoxes();
  boxes.forEach((b) => (b.value = ""));
  boxes[0].focus();
}

function openAuthModal(pendingAction) {
  _authPendingAction = pendingAction || null;
  if (_authOpen) return;
  _authOpen = true;
  _authOpener = document.activeElement;
  const overlay = document.getElementById("authOverlay");
  for (const child of document.body.children) {
    if (child === overlay) continue;
    _authBackground.set(child, child.inert);
    child.inert = true;
  }
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add("open");
  lockScroll(true);
  document.getElementById("authStepPhone").hidden = false;
  document.getElementById("authStepOtp").hidden = true;
  document.getElementById("authPhoneError").textContent = "";
  const input = document.getElementById("authPhoneInput");
  input.value = "";
  _authFocusTimer = setTimeout(() => { if (_authOpen) input.focus(); }, 50);
}
function closeAuthModal() {
  if (!_authOpen) return;
  _authOpen = false;
  clearTimeout(_authFocusTimer);
  const overlay = document.getElementById("authOverlay");
  overlay.classList.remove("open");
  overlay.setAttribute('aria-hidden', 'true');
  for (const [child, wasInert] of _authBackground) child.inert = wasInert;
  _authBackground.clear();
  lockScroll(false);
  clearInterval(_authTimerId);
  _authPendingAction = null;
  const target = _authOpener?.isConnected && !_authOpener.closest('[hidden]') ? _authOpener : document.getElementById('navLoginBtn');
  _authOpener = null;
  if (target && !target.hidden) target.focus();
}

document.addEventListener('keydown', (event) => {
  if (!_authOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeAuthModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const items = authFocusables();
  if (!items.length) { event.preventDefault(); return; }
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && (document.activeElement === first || !document.getElementById('authOverlay').contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !document.getElementById('authOverlay').contains(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
}, true);
document.addEventListener('focusin', (event) => {
  if (_authOpen && !document.getElementById('authOverlay').contains(event.target)) {
    authFocusables()[0]?.focus();
  }
}, true);
function submitPhoneStep() {
  const email = document.getElementById("authPhoneInput").value.trim().toLowerCase();
  const errEl = document.getElementById("authPhoneError");
  errEl.textContent = "";
  const sendButton = document.querySelector('#authStepPhone button');
  if (sendButton.disabled) return;
  sendButton.disabled = true;
  sendButton.textContent = 'Sending…';
  AuthService.sendOtp(email)
    .then((res) => {
      _authEmail = email;
      document.getElementById("authStepPhone").hidden = true;
      document.getElementById("authStepOtp").hidden = false;
      document.getElementById("authPhoneDisplay").textContent = email;
      document.getElementById("authOtpError").textContent = "";
      clearOtpBoxes();
      startOtpTimers(res);
    })
    .catch((err) => { errEl.textContent = err.message; })
    .finally(() => { sendButton.disabled = false; sendButton.textContent = 'Send code'; });
}
function submitOtpStep() {
  if (_authVerifyTask) return _authVerifyTask;
  const code = otpBoxes().map((b) => b.value).join("");
  const errEl = document.getElementById("authOtpError");
  errEl.textContent = "";
  if (code.length < 6) { errEl.textContent = "Enter the full 6-digit code"; return; }
  _authVerifyTask = AuthService.verifyOtp(_authEmail, code)
    .then((user) => {
      const action = _authPendingAction; // capture before closeAuthModal() clears it
      closeAuthModal();
      toast("Logged in successfully");
      onAuthStateChanged();
      const accountButton = document.getElementById('avatarBtn');
      if (accountButton?.hidden === false) accountButton.focus();
      // First login: set up a profile before doing whatever needed the login.
      Platform.onboard(action).catch((error) => toast(error.message));
    })
    .catch((err) => { errEl.textContent = err.message; })
    .finally(() => { _authVerifyTask = null; });
  return _authVerifyTask;
}
function resendOtp() {
  document.getElementById("authOtpError").textContent = "";
  clearOtpBoxes();
  AuthService.sendOtp(_authEmail)
    .then((res) => { toast("New code sent"); startOtpTimers(res); })
    .catch((err) => { document.getElementById("authOtpError").textContent = err.message; });
}
// Two countdowns in one tick: how long the code is valid (shown in the hint)
// and when Resend unlocks.
function startOtpTimers({ expiresIn = 60, resendIn = 60 } = {}) {
  clearInterval(_authTimerId);
  const expiresAt = Date.now() + expiresIn * 1000;
  const resendAt = Date.now() + resendIn * 1000;
  const hint = document.getElementById("authDemoHint");
  const timerEl = document.getElementById("authResendTimer");
  const btn = document.getElementById("authResendBtn");
  const tick = () => {
    const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    const resendLeft = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    hint.classList.toggle("expired", left === 0);
    hint.textContent = left
      ? `Use the code from the newest email (check spam too). Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`
      : "This code has expired — tap Resend code for a new one.";
    timerEl.hidden = resendLeft === 0;
    timerEl.textContent = `Resend code in ${resendLeft}s`;
    btn.hidden = btn.disabled = resendLeft > 0;
    if (!left && !resendLeft) clearInterval(_authTimerId);
  };
  tick();
  _authTimerId = setInterval(tick, 1000);
}
function wireOtpBoxAutoAdvance() {
  const boxes = otpBoxes();
  boxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      box.value = box.value.replace(/\D/g, "").slice(0, 1);
      if (box.value && boxes[i + 1]) boxes[i + 1].focus();
      if (boxes.every((b) => b.value)) submitOtpStep();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && boxes[i - 1]) boxes[i - 1].focus();
      if (e.key === "Enter") submitOtpStep();
    });
    // Pasting the whole code from the email fills every box.
    box.addEventListener("paste", (e) => {
      const digits = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, boxes.length);
      if (digits.length < 2) return;
      e.preventDefault();
      boxes.forEach((b, j) => (b.value = digits[j] || ""));
      boxes[Math.min(digits.length, boxes.length - 1)].focus();
      if (digits.length === boxes.length) submitOtpStep();
    });
  });
}
function requireAuth(action) { return AuthService.requireAuth(action); }
let _logoutTask = null;
function logout() {
  if (_logoutTask) return _logoutTask;
  _logoutTask = (async () => {
    try {
      await AuthService.logout();
    } catch (err) {
      toast("Couldn't log out. Your session may still be active. " + err.message);
      return false;
    }
    toast("Logged out");
    await Promise.resolve(onAuthStateChanged()).catch((err) => console.error('Logout UI refresh failed:', err));
    showView("home");
    return true;
  })().finally(() => { _logoutTask = null; });
  return _logoutTask;
}
/* Overridden by app.js's boot() once it defines the views that need
   refreshing on login/logout (avatar initial, My Profile gate, etc.) — kept
   as a no-op here so auth.js has no hard dependency on app.js load order. */
function onAuthStateChanged() {}

document.getElementById('authPhoneInput')?.addEventListener?.('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitPhoneStep();
  }
});
document.getElementById('authSendOtpBtn')?.addEventListener?.('click', submitPhoneStep);
document.getElementById('authVerifyBtn')?.addEventListener?.('click', submitOtpStep);
document.getElementById('authResendBtn')?.addEventListener?.('click', resendOtp);

wireOtpBoxAutoAdvance();
