// ═══════════════════════════════════════════════════════════════════════
// 88-onboarding-tour.js — First-time welcome tour (v0.17.1)
//
// Hand-rolled 6-step overlay tour. No external dependency (Shepherd.js
// would add ~50KB). Lives entirely in this module.
//
// Triggered automatically after first sign-in IF state.settings
// .onboardingTourDone is unset. Also replayable from Help & FAQ modal
// via window.replayOnboardingTour().
//
// Each step: { selector | targetSection, title, body, position, after }
//   - selector → CSS selector of element to highlight
//   - targetSection → showSection() first, then highlight
//   - position → 'bottom' | 'top' | 'left' | 'right' | 'center'
// ═══════════════════════════════════════════════════════════════════════

// Two tour tracks: DESKTOP points at sidebar nav links; MOBILE points
// at different elements (hamburger, bottom tab bar, FAB drawer) because
// the sidebar is hidden < 768px and would all collapse to the same icon.

const _IS_MOBILE = () => window.matchMedia && window.matchMedia('(max-width: 768px)').matches;

// MOBILE TOUR — uses elements that are actually visible on phones.
const _TOUR_STEPS_MOBILE = [
  {
    selector: null,
    title: '👋 Welcome to InvestIQ',
    body: 'Quick 5-step phone tour. <b>Skip</b> any time, replay from <b>Help & FAQ</b>.',
    position: 'center'
  },
  {
    selector: '#overviewGreeting',
    selectorFallback: 'main',
    title: 'Your portfolio at a glance',
    body: 'Greeting · total value · today\'s move. Scroll down for the full breakdown — Total Value · Return · Day Change · Diversification (all tappable).',
    position: 'bottom'
  },
  {
    selector: '#mobileDrawerBtn',
    title: '☰ Full menu',
    body: 'Tap here to reach every section: Holdings · Performance · Market · AI Insights · News · Tax · Dividends · Calendar · Reports · Goals · Family · TraderIQ.',
    position: 'bottom'
  },
  {
    selector: '#mobileTabBar',
    title: 'Bottom bar — quick jumps',
    body: 'Five most-used sections at the bottom: Overview · Holdings · Performance · Market · AI Insights. Everything else lives in the menu.',
    position: 'top'
  },
  {
    selector: '#mobileTabBar .mob-tab[data-section="insights"]',
    selectorFallback: '#mobileTabBar',
    title: '🧠 AI Insights',
    body: 'The centrepiece. Four Claude agents analyse your portfolio in parallel and produce a prioritised action plan with severity tags.',
    position: 'top',
    finalCta: true
  }
];

// DESKTOP TOUR — points at SIDEBAR NAV ITEMS (always present, never
// transient). Jumping between sections caused 'highlighting empty
// boxes' because sections need time to render after a switch.
const _TOUR_STEPS_DESKTOP = [
  {
    selector: null,
    title: '👋 Welcome to InvestIQ',
    body: 'Two-minute tour. I\'ll point at the things that matter most — they all live on this page. <b>Skip</b> at any time. You can replay this from <b>Help & FAQ</b>.',
    position: 'center'
  },
  {
    targetSection: 'overview',
    selector: '#overviewGreeting',
    selectorFallback: 'main',
    title: 'Your portfolio summary',
    body: 'Greeting · total value · today\'s move · all-time return. This is your "how am I doing right now" view. The 4 tiles below it (Total Value · Return · Day Change · Diversification) are all <b>clickable shortcuts</b> to the right section.',
    position: 'bottom'
  },
  {
    selector: '#navLinkInsights',
    selectorFallback: '#mobileDrawerBtn',
    title: '🧠 AI Insights — the centrepiece',
    body: 'This nav link opens the four-agent analysis. Health · Sentiment · Risk · Opportunity Scout — each gives a separate read on your portfolio, then a Senior Advisor synthesises prioritised action items with severity tags (Critical / High / Medium / Low / Watch).',
    position: 'right'
  },
  {
    selector: '#navLinkGoals',
    selectorFallback: '#mobileDrawerBtn',
    title: '🎯 Goals — what you\'re aiming for',
    body: 'Set targets like <b>"$100k by 2030"</b>. The projection factors current value + monthly contributions + expected return. If you\'re off-track, it tells you the catch-up monthly.',
    position: 'right'
  },
  {
    selector: '#navLinkTrader',
    selectorFallback: '#mobileDrawerBtn',
    title: '📈 TraderIQ — for active investors',
    body: 'Sibling app, same login. Trade journal · win rate · expectancy · profit factor · equity curve. The AI Coach reads your closed trades and surfaces patterns: "your Breakout setup wins 71% but you only took 7 — scale this up".',
    position: 'right'
  },
  {
    selector: '#fab',
    selectorFallback: '#mobileDrawerBtn',
    title: 'Quick actions',
    body: 'Floating button bottom-right on desktop. Add Holding · Refresh Prices · Run AI Agents · Export · Backup. <b>That\'s the tour — you\'re set.</b>',
    position: 'left',
    finalCta: true
  }
];

// Pick the right step set based on the current viewport. Re-evaluated
// at tour start so rotating a tablet mid-flight doesn't trap the user
// in the wrong track.
function _activeSteps() {
  return _IS_MOBILE() ? _TOUR_STEPS_MOBILE : _TOUR_STEPS_DESKTOP;
}

let _tourStep = 0;
let _tourActive = false;

function startOnboardingTour(force) {
  if (_tourActive) return;
  if (!force && state?.settings?.onboardingTourDone) return;
  _tourStep = 0;
  _tourActive = true;
  _renderTourStep();
}

function _renderTourStep() {
  if (!_tourActive) return;
  if (_tourStep >= _activeSteps().length) return _endTour(true);
  const step = _activeSteps()[_tourStep];

  // Navigate to the target section first
  if (step.targetSection && typeof showSection === 'function') {
    try { showSection(step.targetSection); } catch(e) {}
  }

  // Try to find the target element. If it's not in the DOM yet (because
  // the section just opened and is still rendering), poll for up to 1.5s.
  _waitForTarget(step.selector, step.selectorFallback).then(target => {
    if (!_tourActive) return;
    // Scroll target into view FIRST. The 'instant' option (Chrome 120+)
    // means we don't have to wait for smooth-scroll animation before
    // measuring rects. Falls back to smooth on older browsers.
    if (target) {
      try {
        target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      } catch(e) {
        try { target.scrollIntoView(); } catch(e2) {}
      }
    }
    // One frame later, measure + paint. Two RAFs is safest after a scroll.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!_tourActive) return;
      _paintTourStep(step, target);
    }));
  });
}

// Wait for a selector to be present + visible. Polls every 80ms up to ~1.5s.
function _waitForTarget(selector, fallbackSelector) {
  return new Promise(resolve => {
    if (!selector) return resolve(null);
    const tries = 20;
    let n = 0;
    const tick = () => {
      const el = document.querySelector(selector) || (fallbackSelector ? document.querySelector(fallbackSelector) : null);
      if (el && _isVisible(el)) return resolve(el);
      if (++n >= tries) return resolve(el || null); // give up gracefully
      setTimeout(tick, 80);
    };
    tick();
  });
}

function _isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return true;
}

function _paintTourStep(step, target) {
  _clearTourOverlay();

  // Measure the target's rect. Cap only the MAX so a giant target
  // doesn't fill the screen. We do NOT pad the rect to look bigger —
  // small elements stay small with the ring exactly on them.
  let rect = target ? target.getBoundingClientRect() : null;
  if (rect && (rect.width === 0 || rect.height === 0)) rect = null;
  if (rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const MAX_W = Math.min(vw * 0.85, 720);
    const MAX_H = Math.min(vh * 0.6, 360);
    if (rect.width > MAX_W) {
      const cx = rect.left + rect.width / 2;
      rect = { left: cx - MAX_W / 2, top: rect.top, width: MAX_W, height: rect.height, right: cx + MAX_W / 2, bottom: rect.bottom };
    }
    if (rect.height > MAX_H) {
      const cy = rect.top + rect.height / 2;
      rect = { left: rect.left, top: cy - MAX_H / 2, width: rect.width, height: MAX_H, right: rect.right, bottom: cy + MAX_H / 2 };
    }
  }

  const overlay = document.createElement('div');
  overlay.id = 'tourOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9990;pointer-events:auto;cursor:default;';
  // Darker overlay so the highlighted element really pops. Adjustable.
  const DIM = 'rgba(7,17,31,0.82)';
  overlay.innerHTML = `<svg width="100%" height="100%" style="position:absolute;inset:0;pointer-events:none;">
    <defs>
      <mask id="tourMask">
        <rect width="100%" height="100%" fill="white"/>
        ${rect ? `<rect x="${rect.left - 8}" y="${rect.top - 8}" width="${rect.width + 16}" height="${rect.height + 16}" rx="12" fill="black"/>` : ''}
      </mask>
    </defs>
    <rect width="100%" height="100%" fill="${DIM}" mask="url(#tourMask)"/>
  </svg>`;
  document.body.appendChild(overlay);

  if (rect) {
    // Bright amber/gold ring — stands out clearly against any background
    const ring = document.createElement('div');
    ring.id = 'tourRing';
    ring.style.cssText = `position:fixed;left:${rect.left - 8}px;top:${rect.top - 8}px;width:${rect.width + 16}px;height:${rect.height + 16}px;border:3px solid #FCD34D;border-radius:12px;box-shadow:0 0 0 6px rgba(252,211,77,0.22),0 0 36px rgba(252,211,77,0.55);z-index:9991;pointer-events:none;animation:tourPulse 1.4s ease-in-out infinite;`;
    document.body.appendChild(ring);

    // Console-debug aid so anything that ever looks 'off' can be inspected
    try { console.debug('[tour]', _tourStep + 1, step.title, '→', step.selector, target, rect); } catch(e) {}
  }

  const card = document.createElement('div');
  card.id = 'tourCard';
  // Card width adapts: 380px max, but clamped to (viewport - 24px margin)
  // so it never overflows narrow phones.
  const cardMaxW = Math.min(380, window.innerWidth - 24);
  card.style.cssText = `position:fixed;z-index:9992;width:${cardMaxW}px;max-width:${cardMaxW}px;padding:18px 20px;background:var(--bg-panel);border:1px solid var(--accent-soft-2);border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,0.5);box-sizing:border-box;`;
  const total = _activeSteps().length;
  card.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <span class="iq-badge">Tour</span>
      <span class="text-xs neutral">${_tourStep + 1} / ${total}</span>
    </div>
    <div class="font-bold text-base mb-2" style="color:var(--text-primary);">${step.title}</div>
    <div class="text-sm" style="color:var(--text-body);line-height:1.55;">${step.body}</div>
    <div class="flex items-center justify-between mt-4 gap-2 flex-wrap">
      <button onclick="skipOnboardingTour()" class="btn btn-sm btn-secondary" style="font-size:11px;padding:5px 11px;">Skip tour</button>
      <div class="flex items-center gap-2">
        ${_tourStep > 0 ? `<button onclick="prevTourStep()" class="btn btn-sm btn-secondary" style="font-size:11px;padding:5px 11px;">Back</button>` : ''}
        <button onclick="nextTourStep()" class="btn btn-primary btn-sm" style="font-size:11px;padding:5px 14px;">${step.finalCta ? '✓ Finish' : 'Next →'}</button>
      </div>
    </div>`;
  document.body.appendChild(card);
  _positionTourCard(card, rect, step.position);
}

function _positionTourCard(card, rect, position) {
  const cw = card.offsetWidth, ch = card.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  const GAP = 14;
  let left, top;
  const mobile = _IS_MOBILE();

  // On mobile we never place the card LEFT or RIGHT — viewport is too
  // narrow. Force top/bottom/center.
  let pos = position;
  if (mobile && (pos === 'left' || pos === 'right')) pos = 'bottom';

  if (!rect || pos === 'center') {
    left = (vw - cw) / 2;
    top  = (vh - ch) / 2;
  } else {
    const room = {
      top:    rect.top - GAP,
      bottom: vh - rect.bottom - GAP,
      left:   rect.left - GAP,
      right:  vw - rect.right - GAP
    };
    const needV = ch + GAP, needH = cw + GAP;
    if ((pos === 'bottom' && room.bottom < needV) ||
        (pos === 'top'    && room.top    < needV) ||
        (pos === 'right'  && room.right  < needH) ||
        (pos === 'left'   && room.left   < needH)) {
      // Pick whichever side has the most room. On mobile only vertical.
      const candidates = mobile
        ? [['bottom', room.bottom], ['top', room.top]]
        : Object.entries(room);
      pos = candidates.sort((a, b) => b[1] - a[1])[0][0];
    }
    if (pos === 'bottom') { left = rect.left + rect.width/2 - cw/2; top  = rect.bottom + GAP; }
    if (pos === 'top')    { left = rect.left + rect.width/2 - cw/2; top  = rect.top - ch - GAP; }
    if (pos === 'right')  { left = rect.right + GAP;                top  = rect.top + rect.height/2 - ch/2; }
    if (pos === 'left')   { left = rect.left - cw - GAP;            top  = rect.top + rect.height/2 - ch/2; }
  }

  // Clamp to viewport with breathing margin. On mobile, account for the
  // mobile tab bar at the bottom (~80px).
  const bottomMargin = mobile ? 96 : 12;
  left = Math.max(12, Math.min(vw - cw - 12, left));
  top  = Math.max(12, Math.min(vh - ch - bottomMargin, top));
  card.style.left = left + 'px';
  card.style.top  = top + 'px';
}

// Live re-positioning on resize + scroll keeps everything aligned even if
// the user resizes the window mid-tour (common during a Loom demo).
function _onTourResize() {
  if (!_tourActive) return;
  // Re-render the current step against the new viewport
  const step = _activeSteps()[_tourStep];
  if (!step) return;
  const target = step.selector ? document.querySelector(step.selector) : null;
  _paintTourStep(step, target && _isVisible(target) ? target : null);
}

function _onTourKey(e) {
  if (!_tourActive) return;
  if (e.key === 'Escape') { skipOnboardingTour(); }
  else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextTourStep(); }
  else if (e.key === 'ArrowLeft') { prevTourStep(); }
}

// Attach listeners once
if (!window._tourListenersAttached) {
  window.addEventListener('resize', () => { if (_tourActive) requestAnimationFrame(_onTourResize); });
  window.addEventListener('scroll', () => { if (_tourActive) requestAnimationFrame(_onTourResize); }, { passive: true });
  window.addEventListener('keydown', _onTourKey);
  window._tourListenersAttached = true;
}

function _clearTourOverlay() {
  ['tourOverlay', 'tourRing', 'tourCard'].forEach(id => {
    const el = document.getElementById(id); if (el) el.remove();
  });
}

function nextTourStep() { _tourStep++; _renderTourStep(); }
function prevTourStep() { _tourStep = Math.max(0, _tourStep - 1); _renderTourStep(); }

function skipOnboardingTour() { _endTour(false); }

function _endTour(completed) {
  _clearTourOverlay();
  _tourActive = false;
  if (state && state.settings) {
    state.settings.onboardingTourDone = true;
    state.settings.onboardingTourCompletedAt = completed ? new Date().toISOString() : null;
    try { saveState(); } catch(e) {}
  }
  if (completed && window.toast) {
    toast.success('Tour complete — you\'re set. Replay anytime via Help & FAQ.');
  }
}

function replayOnboardingTour() { startOnboardingTour(true); }

// Keyframe for the pulse ring
(function injectTourKeyframes() {
  if (document.getElementById('tourKeyframes')) return;
  const st = document.createElement('style');
  st.id = 'tourKeyframes';
  st.textContent = `@keyframes tourPulse {
    0%,100% { box-shadow: 0 0 0 6px rgba(252,211,77,0.22), 0 0 36px rgba(252,211,77,0.55); }
    50%     { box-shadow: 0 0 0 10px rgba(252,211,77,0.14), 0 0 48px rgba(252,211,77,0.7); }
  }`;
  document.head.appendChild(st);
})();

// ─── URL ?section= handler ──────────────────────────────────────────────
// Manifest shortcuts and external links can deep-link straight to a section.
// e.g. /?section=insights opens InvestIQ on the AI Insights tab.
function _handleDeepLinkSection() {
  try {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('section');
    if (target && typeof showSection === 'function') {
      setTimeout(() => { try { showSection(target); } catch(e) {} }, 300);
    }
  } catch(e) {}
}

// Wire to init — fires when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _handleDeepLinkSection, { once: true });
} else {
  _handleDeepLinkSection();
}

// Expose globals
window.startOnboardingTour = startOnboardingTour;
window.skipOnboardingTour = skipOnboardingTour;
window.nextTourStep = nextTourStep;
window.prevTourStep = prevTourStep;
window.replayOnboardingTour = replayOnboardingTour;
