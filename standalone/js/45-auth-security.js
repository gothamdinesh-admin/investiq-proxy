// ═══════════════════════════════════════════════════════════════════════
// 45-auth-security.js — 2FA (TOTP) + auth reliability layer (v0.18.1)
//
// Adds on top of 40-auth.js:
//   - TOTP two-factor enrolment + management (Settings → Account)
//   - 2FA challenge step at login
//   - Friendlier error-message mapping
//   - Forgot-password / reset flow
//   - Show/hide password toggle
//   - Resend-confirmation helper
//
// Uses Supabase Auth MFA API (supabase.auth.mfa.*). All factors are
// stored server-side by Supabase; we never persist secrets locally.
//
// Depends on: _supabase, _supaUser, toast, showFormModal, showConfirm,
//             closeModal, openModal.
// ═══════════════════════════════════════════════════════════════════════

// ── Friendly error mapping ──────────────────────────────────────────────
// Supabase returns terse / technical errors. Map the common ones to
// plain-English guidance so users aren't left guessing.
function friendlyAuthError(raw) {
  if (!raw) return 'Something went wrong. Please try again.';
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email or password is incorrect. Check both and try again.';
  if (m.includes('email not confirmed'))       return 'Please confirm your email first — check your inbox for the verification link.';
  if (m.includes('user already registered'))   return 'An account with this email already exists. Try signing in instead.';
  if (m.includes('password should be at least')) return 'Password too short — use at least 6 characters (longer is better).';
  if (m.includes('rate limit') || m.includes('too many'))  return 'Too many attempts. Wait about a minute, then try again.';
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('timeout')) return 'Network problem reaching the server. Check your connection and retry.';
  if (m.includes('aal2') || m.includes('mfa'))  return 'Two-factor authentication required — enter your authenticator code.';
  if (m.includes('invalid totp') || m.includes('invalid code')) return 'That code didn\'t match. Codes refresh every 30s — try the current one.';
  if (m.includes('user not found'))             return 'No account found with that email.';
  if (m.includes('email address') && m.includes('invalid')) return 'That email address doesn\'t look valid.';
  // Fall back to the raw message but capitalised
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ── Show / hide password on the gate ────────────────────────────────────
function _toggleGatePassword() {
  const inp = document.getElementById('gatePassword');
  const tog = document.getElementById('gatePwToggle');
  const inp2 = document.getElementById('gatePassword2');
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if (inp2) inp2.type = show ? 'text' : 'password';
  if (tog) tog.innerHTML = show ? '<i class="fas fa-eye-slash"></i> Hide' : '<i class="fas fa-eye"></i> Show';
}

// ── Forgot password ─────────────────────────────────────────────────────
async function gateForgotPassword() {
  const errEl = document.getElementById('gateError');
  const okEl  = document.getElementById('gateSuccess');
  const email = document.getElementById('gateEmail')?.value?.trim();
  if (errEl) errEl.style.display = 'none';
  if (okEl)  okEl.style.display  = 'none';
  if (!email) {
    if (errEl) { errEl.textContent = 'Enter your email above first, then click Forgot password.'; errEl.style.display = 'block'; }
    return;
  }
  if (!_supabase) { if (errEl) { errEl.textContent = 'Supabase not configured.'; errEl.style.display = 'block'; } return; }
  try {
    const redirectTo = window.location.origin + window.location.pathname + '?reset=1';
    const { error } = await _supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      if (errEl) { errEl.textContent = friendlyAuthError(error.message); errEl.style.display = 'block'; }
      return;
    }
    if (okEl) { okEl.innerHTML = `✓ Password reset link sent to <b>${email}</b>. Check your inbox (and spam).`; okEl.style.display = 'block'; }
  } catch(e) {
    if (errEl) { errEl.textContent = friendlyAuthError(e.message); errEl.style.display = 'block'; }
  }
}

// Handle the ?reset=1 deep-link — Supabase fires a PASSWORD_RECOVERY auth
// event; we prompt for a new password. Polls for _supabase to be ready
// (initSupabase runs in the main init() which may fire after this module).
async function _handlePasswordRecovery() {
  if (!_supabase) {
    // Retry for up to ~10s while Supabase initialises
    let n = 0;
    const wait = setInterval(() => {
      if (_supabase) { clearInterval(wait); _handlePasswordRecovery(); }
      else if (++n > 50) clearInterval(wait);
    }, 200);
    return;
  }
  _supabase.auth.onAuthStateChange(async (event) => {
    if (event === 'PASSWORD_RECOVERY') {
      const result = await showFormModal({
        title: 'Set a new password',
        icon: 'fa-key', iconColor: 'var(--accent)',
        description: 'Enter a new password for your account.',
        fields: [
          { name: 'pw',  type: 'password', label: 'New password', required: true, hint: 'At least 6 characters.' },
          { name: 'pw2', type: 'password', label: 'Confirm new password', required: true }
        ],
        submitLabel: 'Update password', submitVariant: 'primary'
      });
      if (!result) return;
      if (result.pw !== result.pw2) { toast.error('Passwords don\'t match.'); return; }
      const { error } = await _supabase.auth.updateUser({ password: result.pw });
      if (error) { toast.error(friendlyAuthError(error.message)); return; }
      toast.success('Password updated — you\'re signed in.');
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 2FA / TOTP
// ─────────────────────────────────────────────────────────────────────────

// Render the 2FA status block inside Settings → Account. Called when the
// settings modal opens (if signed in).
async function renderTwoFactorStatus() {
  const wrap = document.getElementById('twoFactorStatus');
  if (!wrap || !_supabase || !_supaUser) return;
  wrap.innerHTML = '<div class="text-xs neutral"><i class="fas fa-spinner fa-spin mr-1"></i>Checking 2FA status…</div>';
  try {
    const { data, error } = await _supabase.auth.mfa.listFactors();
    if (error) throw error;
    const totp = (data?.totp || []).filter(f => f.status === 'verified');
    if (totp.length) {
      wrap.innerHTML = `
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <i class="fas fa-shield-halved" style="color:var(--color-green);"></i>
            <span class="text-sm" style="color:var(--text-primary);">Two-factor authentication is <b style="color:var(--color-green);">on</b></span>
          </div>
          <button onclick="disableTwoFactor('${totp[0].id}')" class="btn btn-sm btn-secondary" style="font-size:11px;color:var(--color-red);border-color:var(--color-red);">Turn off</button>
        </div>
        <div class="text-xs neutral mt-2">You'll be asked for an authenticator code each time you sign in. ${totp.length > 1 ? `(${totp.length} factors enrolled)` : ''}</div>`;
    } else {
      wrap.innerHTML = `
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <i class="fas fa-shield-halved" style="color:var(--text-muted);"></i>
            <span class="text-sm" style="color:var(--text-primary);">Two-factor authentication is <b>off</b></span>
          </div>
          <button onclick="enableTwoFactor()" class="btn btn-sm btn-primary" style="font-size:11px;">Turn on</button>
        </div>
        <div class="text-xs neutral mt-2">Add a second layer — an authenticator app code on top of your password. Strongly recommended.</div>`;
    }
  } catch(e) {
    wrap.innerHTML = `<div class="text-xs" style="color:var(--color-amber);">Couldn't load 2FA status: ${friendlyAuthError(e.message)}</div>`;
  }
}

// Begin TOTP enrolment — shows QR + secret, then verifies the first code.
async function enableTwoFactor() {
  if (!_supabase || !_supaUser) return;
  try {
    // Clean up any unverified factor first (Supabase rejects a 2nd unverified enroll)
    try {
      const { data: existing } = await _supabase.auth.mfa.listFactors();
      const unverified = (existing?.all || existing?.totp || []).filter(f => f.status === 'unverified');
      for (const f of unverified) { await _supabase.auth.mfa.unenroll({ factorId: f.id }); }
    } catch(e) {}

    const { data, error } = await _supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'InvestIQ ' + new Date().toISOString().slice(0,10) });
    if (error) throw error;
    const factorId = data.id;
    const qr  = data.totp?.qr_code;   // SVG data URI
    const secret = data.totp?.secret; // manual-entry fallback

    const result = await showFormModal({
      title: 'Set up two-factor authentication',
      icon: 'fa-shield-halved', iconColor: 'var(--accent)',
      description: '1. Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, Microsoft Authenticator).<br>2. Enter the 6-digit code it shows.',
      fields: [
        { name: '_qr', type: 'static', style: 'text-align:center;background:transparent;border:none;padding:0;', html: `
          <div style="text-align:center;margin:0 0 8px;">
            <div style="display:inline-block;background:#fff;padding:10px;border-radius:10px;">${qr ? `<img src="${qr}" alt="2FA QR code" style="width:180px;height:180px;display:block;">` : '<div style="color:#0B1220;padding:40px;">QR unavailable</div>'}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:10px;">Can't scan? Enter this key manually:</div>
            <div class="mono" style="font-size:11px;color:var(--text-primary);word-break:break-all;margin-top:4px;user-select:all;">${secret || '—'}</div>
          </div>` },
        { name: 'code', type: 'text', label: '6-digit code', required: true, placeholder: '123456', hint: 'From your authenticator app.' }
      ],
      submitLabel: 'Verify & enable', submitVariant: 'primary'
    });
    if (!result || !result.code) {
      // user cancelled — clean up the unverified factor
      try { await _supabase.auth.mfa.unenroll({ factorId }); } catch(e) {}
      return;
    }
    // Challenge + verify
    const { data: ch, error: chErr } = await _supabase.auth.mfa.challenge({ factorId });
    if (chErr) throw chErr;
    const { error: vErr } = await _supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: result.code.trim() });
    if (vErr) {
      toast.error(friendlyAuthError(vErr.message));
      // leave factor unverified so they can retry from the status block
      return;
    }
    try { logActivity('2fa_enabled', {}); } catch(e) {}
    toast.success('Two-factor authentication enabled.');
    renderTwoFactorStatus();
  } catch(e) {
    toast.error(friendlyAuthError(e.message));
  }
}

async function disableTwoFactor(factorId) {
  if (!_supabase) return;
  const ok = await showConfirm({
    title: 'Turn off two-factor authentication?',
    message: 'Your account will be protected by password only. You can re-enable 2FA any time. Continue?',
    confirmLabel: 'Turn off 2FA', cancelLabel: 'Keep it on', variant: 'danger'
  });
  if (!ok) return;
  try {
    const { error } = await _supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    try { logActivity('2fa_disabled', {}); } catch(e) {}
    toast.success('Two-factor authentication turned off.');
    renderTwoFactorStatus();
  } catch(e) {
    toast.error(friendlyAuthError(e.message));
  }
}

// ── 2FA challenge at login ──────────────────────────────────────────────
// After a successful password sign-in, check if the account needs AAL2.
// If so, show the code field on the gate and pause until verified.
let _pendingMfaFactorId = null;

async function checkMfaRequired() {
  if (!_supabase) return false;
  try {
    // Confirm a real session token exists BEFORE touching any mfa endpoint.
    // Calling mfa methods without a settled session is what produced
    // 'This endpoint requires a valid Bearer token' on login.
    const { data: sess } = await _supabase.auth.getSession();
    if (!sess?.session?.access_token) return false;

    // Probe enrolled factors. If the project has MFA disabled, or the call
    // errors for ANY reason, treat it as 'no MFA' and let login proceed —
    // never block sign-in over a 2FA probe.
    let factorsResp;
    try {
      factorsResp = await _supabase.auth.mfa.listFactors();
    } catch(e) {
      console.warn('[mfa] listFactors threw — skipping MFA:', e.message);
      return false;
    }
    if (factorsResp?.error) { console.warn('[mfa] listFactors error — skipping MFA:', factorsResp.error.message); return false; }
    const totp = (factorsResp?.data?.totp || []).filter(f => f.status === 'verified');
    if (!totp.length) return false; // no verified 2FA → normal login

    // Only NOW consult AAL — we know the account has a verified factor.
    let aal;
    try {
      const r = await _supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      aal = r?.data;
      if (r?.error) return false;
    } catch(e) {
      console.warn('[mfa] AAL check threw — skipping MFA:', e.message);
      return false;
    }
    if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
      _pendingMfaFactorId = totp[0].id;
      return true;
    }
  } catch(e) {
    console.warn('[mfa] checkMfaRequired failed — proceeding without MFA:', e.message);
  }
  return false;
}

// Switch the gate into the clean 2FA step: hide the whole credential
// block (email + password + tab toggle + forgot link) and show ONLY the
// authenticator-code field + Verify button. No more all-three-at-once.
function _setDisplay(id, val) { const el = document.getElementById(id); if (el) el.style.display = val; }

function _showGateMfaStep() {
  _setDisplay('gateCredFields', 'none');   // email + password
  _setDisplay('gateTabToggle', 'none');    // Sign In / Create Account tabs
  _setDisplay('gateMfaField', 'block');    // the code field
  _setDisplay('gateMfaBtn', 'block');      // Verify button
  _setDisplay('gateSubmitBtn', 'none');    // hide Sign In button
  const forgot = document.getElementById('gateForgotBtn');
  if (forgot?.parentElement) forgot.parentElement.style.display = 'none';
  // Show which account is being verified
  const emailHint = document.getElementById('gateMfaEmail');
  const email = document.getElementById('gateEmail')?.value?.trim();
  if (emailHint) emailHint.textContent = email ? `Signing in as ${email}` : '';
  // Clear any leftover code + focus
  const codeEl = document.getElementById('gateMfaCode');
  if (codeEl) { codeEl.value = ''; }
  setTimeout(() => codeEl?.focus(), 100);
}

function _resetGateMfaStep() {
  _setDisplay('gateCredFields', '');
  _setDisplay('gateTabToggle', 'flex');
  _setDisplay('gateMfaField', 'none');
  _setDisplay('gateMfaBtn', 'none');
  _setDisplay('gateSubmitBtn', 'block');
  const forgot = document.getElementById('gateForgotBtn');
  if (forgot?.parentElement) forgot.parentElement.style.display = 'block';
  const errEl = document.getElementById('gateError'); if (errEl) errEl.style.display = 'none';
  _pendingMfaFactorId = null;
}

async function submitGateMfa() {
  const errEl = document.getElementById('gateError');
  const code = (document.getElementById('gateMfaCode')?.value || '').trim().replace(/\s/g, '');
  const btn = document.getElementById('gateMfaBtn');
  if (errEl) errEl.style.display = 'none';
  if (!code || !_pendingMfaFactorId) { if (errEl) { errEl.textContent = 'Enter the 6-digit code.'; errEl.style.display = 'block'; } return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verifying…'; }
  try {
    // Confirm the AAL1 session is actually present before calling the MFA
    // endpoints — without it the verify call goes out with no Bearer token
    // and GoTrue rejects with 'requires a valid Bearer token'.
    const { data: sd } = await _supabase.auth.getSession();
    if (!sd?.session?.access_token) {
      throw new Error('Your sign-in session expired. Close this and sign in again.');
    }

    // Use the single-call challengeAndVerify — fewer round-trips, and it's
    // the path Supabase actively maintains. Falls back to challenge+verify
    // if the SDK build doesn't expose it.
    let verifyErr = null;
    if (typeof _supabase.auth.mfa.challengeAndVerify === 'function') {
      const { error } = await _supabase.auth.mfa.challengeAndVerify({ factorId: _pendingMfaFactorId, code });
      verifyErr = error;
    } else {
      const { data: ch, error: chErr } = await _supabase.auth.mfa.challenge({ factorId: _pendingMfaFactorId });
      if (chErr) throw chErr;
      const { error: vErr } = await _supabase.auth.mfa.verify({ factorId: _pendingMfaFactorId, challengeId: ch.id, code });
      verifyErr = vErr;
    }
    if (verifyErr) throw verifyErr;

    // Verified → AAL2 achieved. Finish the sign-in: load portfolio etc.
    _resetGateMfaStep();
    try { logActivity('login_2fa_verified', {}); } catch(e) {}
    if (typeof _finishSignInAfterMfa === 'function') await _finishSignInAfterMfa();
  } catch(e) {
    console.error('[mfa] verify failed:', e);
    if (errEl) {
      errEl.innerHTML = friendlyAuthError(e.message) +
        `<br><span style="color:var(--text-muted);">Locked out? You can remove 2FA from your <a href="https://app.supabase.com" target="_blank" style="color:var(--accent);">Supabase dashboard</a> → Authentication → Users → your user → remove the factor.</span>`;
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shield-halved mr-2"></i>Verify Code'; }
  }
}

// Wire password-recovery listener on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { _handlePasswordRecovery(); } catch(e) {} }, { once: true });
} else {
  try { _handlePasswordRecovery(); } catch(e) {}
}

// Expose globals
window.friendlyAuthError = friendlyAuthError;
window._toggleGatePassword = _toggleGatePassword;
window.gateForgotPassword = gateForgotPassword;
window.renderTwoFactorStatus = renderTwoFactorStatus;
window.enableTwoFactor = enableTwoFactor;
window.disableTwoFactor = disableTwoFactor;
window.checkMfaRequired = checkMfaRequired;
window.submitGateMfa = submitGateMfa;
window._showGateMfaStep = _showGateMfaStep;
window._resetGateMfaStep = _resetGateMfaStep;
