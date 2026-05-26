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

// Each step targets a SPECIFIC small element (not a whole section) so the
// spotlight is meaningful + the tooltip can sit beside it. `targetSection`
// runs showSection() first; `selector` finds the element to ring; `position`
// hints where to place the tooltip.
const _TOUR_STEPS = [
  {
    targetSection: 'overview',
    selector: null, // Show centered welcome card with no target
    title: '👋 Welcome to InvestIQ',
    body: 'Two-minute tour. I\'ll point at the 6 things that matter most. <b>Skip</b> at any time — you can replay this from <b>Help & FAQ</b>.',
    position: 'center'
  },
  {
    targetSection: 'overview',
    selector: '#totalValue',
    title: 'Your portfolio at a glance',
    body: 'Total Value, Return, Day Change, Diversification — and every tile is <b>clickable</b>. Click Total Value to jump to Holdings, Total Return to Performance, etc.',
    position: 'bottom'
  },
  {
    targetSection: 'overview',
    selector: '.sidebar nav .nav-link.active',
    title: 'Your map',
    body: 'All sections live in the sidebar — Holdings, Performance, Market, AI Insights, News, Tax, Dividends, Calendar, Reports, Goals, Family, TraderIQ. On mobile, the hamburger ☰ at the top opens the same menu.',
    position: 'right'
  },
  {
    targetSection: 'insights',
    selector: '#section-insights h2',
    title: '🧠 AI Insights — the centrepiece',
    body: 'Four specialist Claude agents analyse your portfolio in parallel — Health · Sentiment · Risk · Opportunity — then a senior advisor synthesises prioritised action items with severity tags.',
    position: 'bottom'
  },
  {
    targetSection: 'goals',
    selector: '#section-goals h2',
    title: '🎯 Goals & Targets',
    body: 'Turn "I should save more" into "$100k by 2030 · on track". The projection factors current value, planned monthly contributions, and expected return — and tells you the catch-up monthly if you\'re off-track.',
    position: 'bottom'
  },
  {
    targetSection: 'overview',
    selector: '#fab .fab-btn',
    selectorFallback: '#mobileDrawerBtn',
    title: 'Quick actions — anywhere',
    body: 'Floating button bottom-right on desktop, hamburger menu on mobile. Gets you to Add Holding, Refresh Prices, Run AI Agents, Export, Backup. <b>Done — you\'re set.</b>',
    position: 'left',
    finalCta: true
  }
];

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
  if (_tourStep >= _TOUR_STEPS.length) return _endTour(true);
  const step = _TOUR_STEPS[_tourStep];

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

  // Cap the highlighted region size so very large targets (whole sections)
  // don't create a useless rectangle covering everything.
  let rect = target ? target.getBoundingClientRect() : null;
  if (rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const MAX_W = Math.min(vw * 0.8, 640);
    const MAX_H = Math.min(vh * 0.5, 280);
    if (rect.width > MAX_W) {
      const cx = rect.left + rect.width / 2;
      rect = { ...rect, left: cx - MAX_W / 2, width: MAX_W, right: cx + MAX_W / 2 };
    }
    if (rect.height > MAX_H) {
      const cy = rect.top + rect.height / 2;
      rect = { ...rect, top: cy - MAX_H / 2, height: MAX_H, bottom: cy + MAX_H / 2 };
    }
  }

  const overlay = document.createElement('div');
  overlay.id = 'tourOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9990;pointer-events:auto;cursor:default;';
  overlay.innerHTML = `<svg width="100%" height="100%" style="position:absolute;inset:0;pointer-events:none;">
    <defs>
      <mask id="tourMask">
        <rect width="100%" height="100%" fill="white"/>
        ${rect ? `<rect x="${rect.left - 6}" y="${rect.top - 6}" width="${rect.width + 12}" height="${rect.height + 12}" rx="10" fill="black"/>` : ''}
      </mask>
    </defs>
    <rect width="100%" height="100%" fill="rgba(7,17,31,0.72)" mask="url(#tourMask)"/>
  </svg>`;
  // Click outside the spotlight + tooltip dismisses the tour
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'tourOverlay') {
      // ignore — keep open so user can read; require explicit Skip / Esc
    }
  });
  document.body.appendChild(overlay);

  if (rect) {
    const ring = document.createElement('div');
    ring.id = 'tourRing';
    ring.style.cssText = `position:fixed;left:${rect.left - 6}px;top:${rect.top - 6}px;width:${rect.width + 12}px;height:${rect.height + 12}px;border:2px solid var(--accent);border-radius:10px;box-shadow:0 0 0 4px rgba(96,165,250,0.25),0 0 24px rgba(96,165,250,0.4);z-index:9991;pointer-events:none;animation:tourPulse 1.6s ease-in-out infinite;`;
    document.body.appendChild(ring);
  }

  const card = document.createElement('div');
  card.id = 'tourCard';
  card.style.cssText = 'position:fixed;z-index:9992;max-width:380px;padding:20px 22px;background:var(--bg-panel);border:1px solid var(--accent-soft-2);border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,0.5);';
  const total = _TOUR_STEPS.length;
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
  const GAP = 16;
  let left, top;

  if (!rect || position === 'center') {
    left = (vw - cw) / 2;
    top  = (vh - ch) / 2;
  } else {
    // Auto-pick the best side if 'auto' or if requested side doesn't fit
    const room = {
      top:    rect.top - GAP,
      bottom: vh - rect.bottom - GAP,
      left:   rect.left - GAP,
      right:  vw - rect.right - GAP
    };
    let pos = position;
    // Re-pick if the requested side doesn't have enough space
    const needV = ch + GAP;
    const needH = cw + GAP;
    if ((pos === 'bottom' && room.bottom < needV) ||
        (pos === 'top'    && room.top    < needV) ||
        (pos === 'right'  && room.right  < needH) ||
        (pos === 'left'   && room.left   < needH)) {
      const best = Object.entries(room).sort((a, b) => b[1] - a[1])[0][0];
      pos = best;
    }
    if (pos === 'bottom') { left = rect.left + rect.width/2 - cw/2; top  = rect.bottom + GAP; }
    if (pos === 'top')    { left = rect.left + rect.width/2 - cw/2; top  = rect.top - ch - GAP; }
    if (pos === 'right')  { left = rect.right + GAP;                top  = rect.top + rect.height/2 - ch/2; }
    if (pos === 'left')   { left = rect.left - cw - GAP;            top  = rect.top + rect.height/2 - ch/2; }
  }

  // Clamp to viewport with breathing margin
  left = Math.max(12, Math.min(vw - cw - 12, left));
  top  = Math.max(12, Math.min(vh - ch - 12, top));
  card.style.left = left + 'px';
  card.style.top  = top + 'px';
}

// Live re-positioning on resize + scroll keeps everything aligned even if
// the user resizes the window mid-tour (common during a Loom demo).
function _onTourResize() {
  if (!_tourActive) return;
  // Re-render the current step against the new viewport
  const step = _TOUR_STEPS[_tourStep];
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
    0%,100% { box-shadow: 0 0 0 4px rgba(96,165,250,0.25), 0 0 24px rgba(96,165,250,0.4); }
    50%     { box-shadow: 0 0 0 8px rgba(96,165,250,0.18), 0 0 32px rgba(96,165,250,0.55); }
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
