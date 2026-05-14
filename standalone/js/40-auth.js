// ═══════════════════════════════════════════════════════════════════════
// 40-auth.js — Auth UI (sign-in/up gate) + idle session timeout.
// Depends on: 00-config.js (IDLE_LIMIT_MS, IDLE_WARNING_MS),
//             20-state.js (state), 30-cloud.js (_supabase, _supaUser).
// Forward refs (resolved lazily at call time, defined inline):
//   signIn(), signUp(), signOut(), updateAdminVisibility(),
//   updateAdminDiagnostics(), toast (global IIFE).
// Functions: updateAuthUI, switchGateTab, submitGateAuth,
//            recordActivity, checkIdle.
// Plus globals: _gateMode, _lastActivity, _idleWarned, _activityThrottle.
// Auto-installs a window-level event listener for click/key/scroll/mouse
// to keep the idle timer fresh.
// ═══════════════════════════════════════════════════════════════════════

function updateAuthUI() {
  const badge       = document.getElementById('supaUserBadge');
  const signInBadge = document.getElementById('supaSignInBadge');
  const gate        = document.getElementById('authGate');
  const accountLink = document.getElementById('accountNavLink');
  const adminBadge  = document.getElementById('adminBadge');
  const adminLink   = document.getElementById('adminNavLink');
  const mobAdminTab = document.getElementById('mobileAdminTab');
  const hasSupaConfig = !!(state.settings.supabaseUrl?.trim() && state.settings.supabaseKey?.trim());

  // ALWAYS hide admin-only UI here. updateAdminVisibility() will re-show them
  // ONLY if checkAdminStatus() confirms admin. Prevents stale badge from a
  // previous admin session flashing in for non-admin users.
  if (adminBadge)  adminBadge.style.display = 'none';
  if (adminLink)   adminLink.style.display  = 'none';
  if (mobAdminTab) mobAdminTab.style.display = 'none';

  if (_supaUser) {
    // Logged in — show email badge, hide gate, show account nav link + sidebar strip
    if (badge)      { badge.style.display = 'flex'; }
    if (signInBadge) signInBadge.style.display = 'none';
    if (gate)       gate.style.display = 'none';
    if (accountLink) accountLink.style.display = '';
    // If we already know admin state (re-render after checkAdminStatus), re-apply it
    if (_isAdmin) updateAdminVisibility();
  } else if (hasSupaConfig) {
    // Supabase configured but not logged in — show gate
    if (badge)      badge.style.display = 'none';
    if (signInBadge) signInBadge.style.display = 'block';
    if (gate)       gate.style.display = 'flex';
    if (accountLink) accountLink.style.display = 'none';
    _isAdmin = false; // reset admin flag on any sign-out / gate show
  } else {
    // No Supabase config — local mode, no gate
    if (badge)      badge.style.display = 'none';
    if (signInBadge) signInBadge.style.display = 'none';
    if (gate)       gate.style.display = 'none';
    if (accountLink) accountLink.style.display = 'none';
    _isAdmin = false;
  }
}

// Auth gate helpers
let _gateMode = 'signin';
function switchGateTab(mode) {
  _gateMode = mode;
  const si = document.getElementById('gateTabSignIn');
  const su = document.getElementById('gateTabSignUp');
  const extra = document.getElementById('gateSignUpFields');
  const label = document.getElementById('gateSubmitLabel');
  const errEl = document.getElementById('gateError');
  const okEl  = document.getElementById('gateSuccess');
  if (errEl) errEl.style.display = 'none';
  if (okEl)  okEl.style.display  = 'none';
  if (mode === 'signin') {
    if (si) { si.style.background='#6366f1'; si.style.color='white'; }
    if (su) { su.style.background='none'; su.style.color='#4a6080'; }
    if (extra) extra.style.display = 'none';
    if (label) label.textContent = 'Sign In';
  } else {
    if (su) { su.style.background='#6366f1'; su.style.color='white'; }
    if (si) { si.style.background='none'; si.style.color='#4a6080'; }
    if (extra) extra.style.display = 'block';
    if (label) label.textContent = 'Create Account';
  }
}

async function submitGateAuth() {
  const errEl = document.getElementById('gateError');
  const okEl  = document.getElementById('gateSuccess');
  const btn   = document.getElementById('gateSubmitBtn');
  if (errEl) errEl.style.display = 'none';
  if (okEl)  okEl.style.display  = 'none';

  const email    = document.getElementById('gateEmail')?.value?.trim();
  const password = document.getElementById('gatePassword')?.value;
  if (!email || !password) {
    if (errEl) { errEl.textContent = 'Email and password are required.'; errEl.style.display = 'block'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Please wait...'; }

  let result;
  if (_gateMode === 'signin') {
    result = await signIn(email, password);
  } else {
    const p2 = document.getElementById('gatePassword2')?.value;
    if (p2 !== password) {
      if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; }
      if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-sign-in-alt mr-2"></i><span id="gateSubmitLabel">Create Account</span>'; }
      return;
    }
    result = await signUp(email, password);
  }

  if (btn) { btn.disabled=false; btn.innerHTML=`<i class="fas fa-sign-in-alt mr-2"></i><span id="gateSubmitLabel">${_gateMode==='signin'?'Sign In':'Create Account'}</span>`; }

  if (result.error) {
    if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
  } else if (result.emailConfirm) {
    if (okEl) { okEl.textContent = '✓ Account created! Check your email to confirm, then sign in.'; okEl.style.display = 'block'; }
    switchGateTab('signin');
  }
  // On success, updateAuthUI() hides the gate automatically
}

// LOCAL_ONLY_SETTINGS, IDLE_LIMIT_MS, IDLE_WARNING_MS moved to js/00-config.js
let _lastActivity = Date.now();
let _idleWarned = false;

// Throttled — mousemove fires ~60Hz, no need to rewrite state on every pixel.
// Once-per-5-second resolution is plenty for a 30-min idle timer.
let _activityThrottle = 0;
function recordActivity() {
  const now = Date.now();
  if (now - _activityThrottle < 5000) return;
  _activityThrottle = now;
  _lastActivity = now;
  _idleWarned = false;
  const w = document.getElementById('idleWarning');
  if (w) w.style.display = 'none';
}

function checkIdle() {
  if (!_supaUser) return; // only relevant when signed in
  const idle = Date.now() - _lastActivity;
  if (idle >= IDLE_LIMIT_MS) {
    console.log('[idle] auto-signing out after', Math.round(idle/60000), 'min idle');
    toast.warning('Signed out due to inactivity', 8000);
    signOut();
    return;
  }
  if (idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS && !_idleWarned) {
    _idleWarned = true;
    const minsLeft = Math.ceil((IDLE_LIMIT_MS - idle) / 60000);
    toast.warning({
      title: 'Session timing out',
      message: `You'll be signed out in ${minsLeft} min for security. Move your mouse to stay signed in.`,
      duration: IDLE_WARNING_MS
    });
  }
}

// Reset idle timer on any meaningful user activity
['click', 'keydown', 'scroll', 'mousemove'].forEach(ev =>
  window.addEventListener(ev, recordActivity, { passive: true })
);
