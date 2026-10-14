/* =========================================================================
   AuthService — email + OTP authentication against /api/auth.
   The server emails a 6-digit code; verifying it sets an httpOnly session
   cookie (valid a year, renewed while in use), so the browser never holds
   the session token itself. init() restores the user from that cookie on
   page load. Every call site only talks to AuthService / requireAuth().
   ========================================================================= */

const AuthService = (() => {
  let user = null;

  async function init() {
    try { user = (await Api.get("/auth/me")).user; } catch (e) { user = null; }
    return user;
  }

  function isAuthenticated() { return !!user; }
  function getUser() { return user; }
  function setUser(next) { user = next; }

  function sendOtp(email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Promise.reject(new Error("Enter a valid email address"));
    return Api.post("/auth/send-otp", { email });
  }

  async function verifyOtp(email, code) {
    user = (await Api.post("/auth/verify-otp", { email, code })).user;
    return user;
  }

  async function logout() {
    try { await Api.post("/auth/logout"); } catch (e) {}
    user = null;
  }

  // The core progressive-auth primitive: run `action` now if logged in,
  // otherwise open the login modal and run `action` once login succeeds.
  // Every Save / Connect / Chat / Join-community call site should go
  // through this instead of calling its handler directly.
  function requireAuth(action) {
    if (isAuthenticated()) { action(); return true; }
    openAuthModal(action);
    return false;
  }

  return { init, isAuthenticated, getUser, setUser, sendOtp, verifyOtp, logout, requireAuth };
})();

/* ---------------- login modal UI (talks only to AuthService above) ---------------- */
let _authPendingAction = null;
let _authEmail = "";
let _authTimerId = null;

const otpBoxes = () => [...document.querySelectorAll("#authOtpBoxes input")];
function clearOtpBoxes() {
  const boxes = otpBoxes();
  boxes.forEach((b) => (b.value = ""));
  boxes[0].focus();
}

function openAuthModal(pendingAction) {
  _authPendingAction = pendingAction || null;
  document.getElementById("authOverlay").classList.add("open");
  document.getElementById("authStepPhone").hidden = false;
  document.getElementById("authStepOtp").hidden = true;
  document.getElementById("authPhoneError").textContent = "";
  const input = document.getElementById("authPhoneInput");
  input.value = "";
  setTimeout(() => input.focus(), 50);
}
function closeAuthModal() {
  document.getElementById("authOverlay").classList.remove("open");
  clearInterval(_authTimerId);
  _authPendingAction = null;
}
function submitPhoneStep() {
  const email = document.getElementById("authPhoneInput").value.trim().toLowerCase();
  const errEl = document.getElementById("authPhoneError");
  errEl.textContent = "";
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
    .catch((err) => { errEl.textContent = err.message; });
}
function submitOtpStep() {
  const code = otpBoxes().map((b) => b.value).join("");
  const errEl = document.getElementById("authOtpError");
  errEl.textContent = "";
  if (code.length < 6) { errEl.textContent = "Enter the full 6-digit code"; return; }
  AuthService.verifyOtp(_authEmail, code)
    .then((user) => {
      const action = _authPendingAction; // capture before closeAuthModal() clears it
      closeAuthModal();
      toast("Logged in successfully");
      onAuthStateChanged();
      // First login: set up a profile before doing whatever needed the login.
      if (!user.profileComplete && typeof openProfileForm === "function") openProfileForm({ firstTime: true, then: action });
      else if (action) action();
    })
    .catch((err) => { errEl.textContent = err.message; });
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
      ? `Use the code from the newest email (check spam too). Expires in 0:${String(left).padStart(2, "0")}`
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
async function logout() {
  await AuthService.logout();
  toast("Logged out");
  onAuthStateChanged();
  showView("home");
}
/* Overridden by app.js's boot() once it defines the views that need
   refreshing on login/logout (avatar initial, My Profile gate, etc.) — kept
   as a no-op here so auth.js has no hard dependency on app.js load order. */
function onAuthStateChanged() {}

wireOtpBoxAutoAdvance();
