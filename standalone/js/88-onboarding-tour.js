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

const _TOUR_STEPS = [
  {
    targetSection: 'overview',
    selector: '#section-overview .grid.grid-cols-2.lg\\:grid-cols-4',
    title: '👋 Welcome to InvestIQ',
    body: 'This is your Overview — portfolio total, return, day change, and diversification score. Every tile is <b>clickable</b> — jumps to the relevant section.',
    position: 'bottom'
  },
  {
    targetSection: 'overview',
    selector: '.sidebar nav',
    title: 'Your map',
    body: 'Holdings, Performance, Market, AI Insights, News, Tax, Dividends, Calendar, Reports, Goals, Family, TraderIQ — all reachable here. On mobile, the hamburger ☰ at the top opens the same drawer.',
    position: 'right'
  },
  {
    targetSection: 'insights',
    selector: '#section-insights',
    title: '🧠 AI Insights — the centrepiece',
    body: 'Four specialist Claude agents analyse your portfolio in parallel: Health · Sentiment · Risk · Opportunity. Then a senior advisor synthesises into prioritised action items with severity tags. Best-in-class for NZ retail.',
    position: 'center'
  },
  {
    targetSection: 'holdings',
    selector: '#section-holdings .card',
    title: 'Holdings — your full ledger',
    body: 'Search, filter, sort. <b>Refresh funds</b> auto-pulls NZ managed fund unit prices. Upload a CSV or add holdings one-by-one. Click any row for a full detail page with AI deep-dive.',
    position: 'top'
  },
  {
    targetSection: 'goals',
    selector: '#section-goals',
    title: '🎯 Set a goal',
    body: 'Turn "I should save more" into "$100k by 2030 · on track". The projection factors current value, planned monthly contributions, and expected return — and tells you the catch-up monthly if you\'re off-track.',
    position: 'center'
  },
  {
    targetSection: 'overview',
    selector: '#fab',
    title: 'Quick actions',
    body: 'The floating button (bottom-right on desktop, drawer on mobile) gets you to Add Holding, Refresh Prices, Run AI Agents, Export, Backup. Done — you\'re set.',
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

  // Navigate to the target section if needed
  if (step.targetSection && typeof showSection === 'function') {
    try { showSection(step.targetSection); } catch(e) {}
  }
  // Wait a beat for section to render before placing the spotlight
  setTimeout(() => _paintTourStep(step), 220);
}

function _paintTourStep(step) {
  _clearTourOverlay();

  // Create a full-screen translucent overlay with a cut-out around target
  const target = step.selector ? document.querySelector(step.selector) : null;
  const rect = target ? target.getBoundingClientRect() : null;

  const overlay = document.createElement('div');
  overlay.id = 'tourOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9990;pointer-events:none;';
  overlay.innerHTML = `<svg width="100%" height="100%" style="position:absolute;inset:0;">
    <defs>
      <mask id="tourMask">
        <rect width="100%" height="100%" fill="white"/>
        ${rect ? `<rect x="${rect.left - 6}" y="${rect.top - 6}" width="${rect.width + 12}" height="${rect.height + 12}" rx="10" fill="black"/>` : ''}
      </mask>
    </defs>
    <rect width="100%" height="100%" fill="rgba(7,17,31,0.78)" mask="url(#tourMask)"/>
  </svg>`;
  document.body.appendChild(overlay);

  // Highlight ring around the target
  if (rect) {
    const ring = document.createElement('div');
    ring.id = 'tourRing';
    ring.style.cssText = `position:fixed;left:${rect.left - 6}px;top:${rect.top - 6}px;width:${rect.width + 12}px;height:${rect.height + 12}px;border:2px solid var(--accent);border-radius:10px;box-shadow:0 0 0 4px rgba(96,165,250,0.25),0 0 24px rgba(96,165,250,0.4);z-index:9991;pointer-events:none;animation:tourPulse 1.6s ease-in-out infinite;`;
    document.body.appendChild(ring);
    if (target.scrollIntoView) {
      try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e) {}
    }
  }

  // Tooltip card
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
    <div class="flex items-center justify-between mt-4 gap-2">
      <button onclick="skipOnboardingTour()" class="btn btn-sm btn-secondary" style="font-size:11px;padding:5px 11px;">Skip tour</button>
      <div class="flex items-center gap-2">
        ${_tourStep > 0 ? `<button onclick="prevTourStep()" class="btn btn-sm btn-secondary" style="font-size:11px;padding:5px 11px;">Back</button>` : ''}
        <button onclick="nextTourStep()" class="btn btn-primary btn-sm" style="font-size:11px;padding:5px 14px;">${step.finalCta ? 'Finish' : 'Next'}</button>
      </div>
    </div>`;
  document.body.appendChild(card);

  // Position the card
  _positionTourCard(card, rect, step.position);
}

function _positionTourCard(card, rect, position) {
  const cw = card.offsetWidth, ch = card.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left, top;
  if (!rect || position === 'center') {
    left = (vw - cw) / 2;
    top  = (vh - ch) / 2;
  } else if (position === 'bottom') {
    left = rect.left + rect.width / 2 - cw / 2;
    top  = rect.bottom + 16;
  } else if (position === 'top') {
    left = rect.left + rect.width / 2 - cw / 2;
    top  = rect.top - ch - 16;
  } else if (position === 'right') {
    left = rect.right + 16;
    top  = rect.top + rect.height / 2 - ch / 2;
  } else if (position === 'left') {
    left = rect.left - cw - 16;
    top  = rect.top + rect.height / 2 - ch / 2;
  }
  // Clamp to viewport
  left = Math.max(12, Math.min(vw - cw - 12, left));
  top  = Math.max(12, Math.min(vh - ch - 12, top));
  card.style.left = left + 'px';
  card.style.top  = top + 'px';
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
