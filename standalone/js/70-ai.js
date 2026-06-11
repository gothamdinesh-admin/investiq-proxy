// ═══════════════════════════════════════════════════════════════════════
// 70-ai.js — Multi-agent Claude analysis pipeline + UI helpers.
// Depends on: 00-config.js (PLATFORM_CONFIG, CURRENCY_SYMBOLS),
//             10-helpers.js (fmt, _escape), 20-state.js (state).
// Forward refs (resolved lazily at call time, declared inline):
//   getMetrics(), proxyHeaders(), tryConsumeAiQuota(), saveState(),
//   renderQuickInsights(), logActivity(), toast.
// ═══════════════════════════════════════════════════════════════════════

// Expand or collapse every agent-report <details> card in one click.
function toggleAllAgentReports(open) {
  document.querySelectorAll('.agent-report').forEach(el => { el.open = !!open; });
}

// KPI tile click target — open the matching <details> panel, smooth-scroll
// to it, then pulse-highlight. Panels are <details> elements so this just
// sets the `open` attribute.
function focusAgentReport(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  // If the user keeps clicking the same tile, toggle the panel closed/open
  // so it doesn't feel "stuck". First click opens; same tile clicked again
  // when already open + in view = close. Different tile = always open it.
  const inView = (() => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < window.innerHeight * 0.5;
  })();
  if (el.open && inView) { el.open = false; return; }
  el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('agent-pulse');
  void el.offsetWidth;
  el.classList.add('agent-pulse');
}

// AI Insights — classification-driven dashboard layout (v0.10.5 rework).
// Instead of "wall of text per agent" the user gets:
//   1. KPI strip — four traffic-light tiles (Health / Risk / Sentiment / Opportunities)
//   2. Hero card — score ring + senior advisor's 30-day focus pulled out
//   3. Action Items — Critical/High/Medium/Low/Watch chips parsed from
//      the advisor's prioritised list. The actionable bit, surfaced.
//   4. Collapsible per-agent reports below for users who want the detail.
function renderInsightsSection(results) {
  if (!results) return;
  const score = results.portfolioScore != null ? results.portfolioScore : null;
  const scoreColor = score == null ? 'var(--accent)' : (score >= 70 ? 'var(--color-green)' : score >= 40 ? 'var(--color-amber)' : 'var(--color-red)');
  const scoreLabel = score == null ? 'Analysed' : (score >= 70 ? 'Healthy' : score >= 40 ? 'Moderate' : 'Needs Work');

  // Pull sentiment Bullish/Neutral/Bearish out of the market agent's text
  const sentMatch = (results.marketAnalysis || '').match(/Sentiment(?:\s+Score)?:?\s*\**?(Bullish|Neutral|Bearish)/i);
  const sentiment = sentMatch ? sentMatch[1] : 'Neutral';
  const sentColor = sentiment === 'Bullish' ? 'var(--color-green)' : sentiment === 'Bearish' ? 'var(--color-red)' : 'var(--color-amber)';
  const sentIcon  = sentiment === 'Bullish' ? 'fa-arrow-trend-up' : sentiment === 'Bearish' ? 'fa-arrow-trend-down' : 'fa-equals';

  // Risk Level: Low / Moderate / Elevated / High — parsed from risk agent
  const riskLevel = results.riskLevel
    || ((results.riskAnalysis || '').match(/Risk Level:?\s*\**?(Low|Moderate|Elevated|High)/i) || [])[1]
    || 'Moderate';
  const riskColor = riskLevel === 'Low' ? 'var(--color-green)' : riskLevel === 'Moderate' ? 'var(--color-amber)' : riskLevel === 'Elevated' ? 'var(--color-orange)' : 'var(--color-red)';
  const riskIcon  = riskLevel === 'Low' ? 'fa-shield-halved' : riskLevel === 'Moderate' ? 'fa-shield' : 'fa-triangle-exclamation';

  // Count bullet points in opportunities as a rough "opportunities found" tile
  const oppCount = ((results.opportunities || '').match(/^\s*[•\-\*\d]/gm) || []).length;

  const runAt = results.timestamp ? new Date(results.timestamp) : new Date();
  const ago = (() => {
    const sec = Math.floor((Date.now() - runAt.getTime()) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
    if (sec < 86400) return Math.floor(sec / 3600) + ' hr ago';
    return Math.floor(sec / 86400) + ' days ago';
  })();

  // ── KPI strip (interactive — click a tile to focus that agent's report) ─
  const kpiTile = (label, value, sub, color, icon, targetId) => `
    <button onclick="focusAgentReport('${targetId}')" class="card2 p-4 kpi-tile" style="border-left:3px solid ${color};text-align:left;cursor:pointer;background:var(--bg-panel-2);border-top:1px solid var(--border);border-right:1px solid var(--border);border-bottom:1px solid var(--border);width:100%;transition:transform 0.15s,border-color 0.15s,box-shadow 0.15s;">
      <div class="flex items-center justify-between mb-1">
        <div class="text-xs uppercase neutral font-semibold" style="letter-spacing:0.4px;">${label}</div>
        <i class="fas ${icon}" style="color:${color};font-size:14px;"></i>
      </div>
      <div class="text-2xl font-bold mt-1" style="color:${color};line-height:1.1;">${value}</div>
      <div class="text-xs neutral mt-1">${sub}</div>
    </button>`;
  const kpiStrip = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      ${kpiTile('Portfolio Health',  score != null ? score + '/100' : '–', scoreLabel,                            scoreColor, 'fa-heartbeat',    'agent-report-portfolio')}
      ${kpiTile('Risk Level',        riskLevel,                              'Auto-classified by Risk Watcher',   riskColor,  riskIcon,          'agent-report-risk')}
      ${kpiTile('Market Sentiment',  sentiment,                              'Across your holdings today',        sentColor,  sentIcon,          'agent-report-market')}
      ${kpiTile('Opportunities',     oppCount || '–',                        oppCount ? 'Ideas found by Scout' : 'No gaps flagged', 'var(--color-violet)', 'fa-lightbulb', 'agent-report-opportunity')}
    </div>`;

  // ── Action Items — parse [Tag] prefixed lines out of advisor output ────
  // Advisor was prompted to emit lines like "[High] Trim NVDA below 10%…"
  // We extract those and render as severity-coloured cards. Anything that
  // doesn't match the tag pattern falls through to the synthesis paragraph.
  const advisor = results.finalAdvice || '';
  const tagRegex = /^\s*[•\-\*]?\s*\[(Critical|High|Medium|Low|Watch)\]\s*(.+)$/gim;
  const actionItems = [];
  let m; while ((m = tagRegex.exec(advisor)) !== null) actionItems.push({ tag: m[1], text: m[2].trim() });
  const SEV = {
    Critical: { color: 'var(--color-red)',    icon: 'fa-circle-exclamation', label: 'Critical' },
    High:     { color: 'var(--color-orange)', icon: 'fa-arrow-up',           label: 'High' },
    Medium:   { color: 'var(--color-amber)',  icon: 'fa-minus',              label: 'Medium' },
    Low:      { color: 'var(--color-blue)',   icon: 'fa-arrow-down',         label: 'Low' },
    Watch:    { color: 'var(--color-violet)', icon: 'fa-eye',                label: 'Watch' }
  };
  // Sort by severity so Critical actions are at top
  const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3, Watch: 4 };
  actionItems.sort((a, b) => sevOrder[a.tag] - sevOrder[b.tag]);

  const actionItemHtml = actionItems.length
    ? `<div class="card mb-5 p-5">
         <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
           <div class="flex items-center gap-2">
             <i class="fas fa-list-check" style="color:var(--accent);font-size:16px;"></i>
             <h3 class="font-semibold text-base" style="margin:0;">Prioritised Action Items</h3>
             <span class="iq-badge">IQ</span>
           </div>
           <span class="text-xs neutral">${actionItems.length} action${actionItems.length === 1 ? '' : 's'}</span>
         </div>
         <div class="space-y-2">
           ${actionItems.map(a => {
             const s = SEV[a.tag];
             return `<div class="action-row" style="display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:10px;background:var(--bg-panel-2);border:1px solid ${s.color}33;">
               <div style="flex-shrink:0;width:78px;text-align:center;">
                 <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:9999px;background:${s.color}1f;color:${s.color};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                   <i class="fas ${s.icon}" style="font-size:9px;"></i>${s.label}
                 </div>
               </div>
               <div style="flex:1;color:var(--text-body);font-size:13px;line-height:1.55;">${formatMarkdown(a.text)}</div>
             </div>`;
           }).join('')}
         </div>
       </div>`
    : '';

  // ── Hero — score ring + 30-day focus pulled out of advisor text ────────
  const focusMatch = advisor.match(/30[\s\-]?day focus[:\s\*]+([\s\S]+?)(?:\n\s*\n|$)/i);
  const focusText = focusMatch ? focusMatch[1].trim() : null;
  const heroHtml = `
    <div class="insights-hero card mb-5" style="position:relative;overflow:hidden;padding:24px;border:1px solid var(--accent-soft-2);">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--color-green),var(--color-amber));"></div>
      <div class="flex items-center gap-5 flex-wrap">
        <div style="position:relative;width:104px;height:104px;flex-shrink:0;">
          <svg width="104" height="104" viewBox="0 0 80 80" style="transform:rotate(-90deg);">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border)" stroke-width="6"/>
            <circle cx="40" cy="40" r="32" fill="none" stroke="${scoreColor}" stroke-width="6" stroke-linecap="round"
              stroke-dasharray="201" stroke-dashoffset="${score == null ? 201 : 201 - (score / 100) * 201}"
              style="transition:stroke-dashoffset 1.2s ease, stroke 0.3s;"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <span style="font-size:32px;font-weight:800;color:${scoreColor};line-height:1;">${score != null ? score : '–'}</span>
            <span class="text-xs neutral" style="margin-top:2px;">/100</span>
          </div>
        </div>
        <div style="flex:1;min-width:200px;">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="iq-badge">IQ</span>
            <span class="text-xs neutral">Last run ${ago}</span>
          </div>
          <h3 class="text-2xl font-bold" style="color:${scoreColor};margin:4px 0;">${scoreLabel}</h3>
          ${focusText
            ? `<div class="text-xs uppercase neutral font-semibold mt-2" style="letter-spacing:0.5px;">30-day focus</div>
               <div class="text-sm" style="color:var(--text-body);line-height:1.55;margin-top:4px;">${formatMarkdown(focusText)}</div>`
            : `<div class="text-sm neutral">Synthesised across four specialist agents.</div>`}
        </div>
        <button onclick="openModal('agentsModal')" class="btn btn-primary" style="white-space:nowrap;align-self:flex-start;">
          <i class="fas fa-redo mr-1"></i>Re-run
        </button>
      </div>
    </div>`;

  // ── Per-agent detail — collapsible <details> elements that ALL start
  // closed by default (consistent — no auto-open asymmetry). Click the
  // summary to expand, or click a KPI tile above which programmatically
  // opens its matching panel + scrolls + pulse-highlights. Empty agents
  // show their empty state inline inside the closed panel preview. ──
  const agentCard = (icon, title, color, body, agentKey, anchorId) => {
    const hasBody = !!(body && body.trim());
    const previewBody = hasBody
      ? `<div class="prose-sm pt-3" style="color:var(--text-body);line-height:1.7;font-size:13px;border-top:1px solid var(--border);">${formatMarkdown(body)}</div>`
      : `<div class="text-center py-6" style="border-top:1px solid var(--border);padding-top:18px;margin-top:6px;">
           <i class="${icon}" style="color:${color};font-size:28px;opacity:0.35;"></i>
           <div class="text-sm neutral mt-3 mb-3">No output yet for this agent.</div>
           <button onclick="event.stopPropagation();runSingleAgent('${agentKey}')" class="btn btn-sm" style="background:${color}1f;color:${color};border:1px solid ${color}55;">
             <i class="fas fa-play mr-1"></i>Run only this
           </button>
         </div>`;
    return `<details id="${anchorId}" class="card p-5 agent-report" style="border-left:3px solid ${color};scroll-margin-top:20px;">
      <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div class="flex items-center gap-2" style="min-width:0;">
          <i class="${icon}" style="color:${color};font-size:16px;flex-shrink:0;"></i>
          <span class="font-semibold" style="color:${color};">${title}</span>
          ${!hasBody ? `<span class="text-xs neutral" style="margin-left:6px;font-style:italic;">(empty)</span>` : ''}
        </div>
        <div class="flex items-center gap-2">
          ${hasBody ? `<button onclick="event.stopPropagation();event.preventDefault();runSingleAgent('${agentKey}')" class="btn btn-sm btn-secondary" style="font-size:10px;padding:3px 9px;" title="Re-run only this agent"><i class="fas fa-redo"></i></button>` : ''}
          <i class="fas fa-chevron-down text-xs neutral agent-report-chev"></i>
        </div>
      </summary>
      ${previewBody}
    </details>`;
  };

  // ── Portfolio context banner ──────────────────────────────────────────
  // Insights are generated for ONE portfolio. With multiple portfolios, show
  // which one — and if you've since switched, warn that they're stale.
  const _multiPf  = (typeof listPortfolios === 'function') && listPortfolios().length > 1;
  const _activeId = (typeof state !== 'undefined') ? state.activePortfolioId : null;
  const _activeNm = (typeof getActivePortfolio === 'function') ? getActivePortfolio().name : null;
  const _stale    = results.portfolioId && _activeId && results.portfolioId !== _activeId;
  let portfolioBanner = '';
  if (_stale) {
    portfolioBanner = `<div class="card mb-4 p-4" style="border:1px solid var(--color-amber);background:rgba(251,191,36,0.08);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <i class="fas fa-triangle-exclamation" style="color:var(--color-amber);font-size:16px;"></i>
        <div style="flex:1;min-width:200px;font-size:13px;color:var(--text-body);line-height:1.5;">
          These insights were generated for <b>${_escape(results.portfolioName || 'another portfolio')}</b>, but you're now viewing <b>${_escape(_activeNm || 'this portfolio')}</b>. Re-run for accurate analysis.
        </div>
        <button onclick="runAgents()" class="btn btn-sm" style="background:rgba(251,191,36,0.2);color:var(--color-amber);border:1px solid var(--color-amber);font-size:12px;padding:6px 12px;"><i class="fas fa-rotate mr-1"></i>Re-run for ${_escape(_activeNm || 'this portfolio')}</button>
      </div>`;
  } else if (_multiPf && results.portfolioName) {
    portfolioBanner = `<div class="mb-3" style="font-size:12px;color:var(--text-secondary);"><i class="fas fa-layer-group" style="color:var(--accent);margin-right:6px;"></i>AI analysis for <b>${_escape(results.portfolioName)}</b></div>`;
  }

  document.getElementById('insightsContent').innerHTML = portfolioBanner + kpiStrip + heroHtml + actionItemHtml + `
    <div class="flex items-center justify-between mb-3 mt-4 flex-wrap gap-2">
      <div class="text-xs uppercase neutral font-semibold flex items-center gap-2" style="letter-spacing:0.6px;">
        <i class="fas fa-folder-open" style="color:var(--text-muted);"></i> Detailed agent reports
        <span class="neutral" style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;">tap any card to expand</span>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="toggleAllAgentReports(true)"  class="btn btn-sm btn-secondary" style="font-size:11px;padding:4px 10px;"><i class="fas fa-chevron-down mr-1"></i>Expand all</button>
        <button onclick="toggleAllAgentReports(false)" class="btn btn-sm btn-secondary" style="font-size:11px;padding:4px 10px;"><i class="fas fa-chevron-up mr-1"></i>Collapse all</button>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${agentCard('fas fa-heartbeat',     'Portfolio Health',  'var(--color-green)',  results.healthAnalysis,  'portfolio',   'agent-report-portfolio')}
      ${agentCard('fas fa-chart-line',    'Market Impact',     'var(--color-blue)',   results.marketAnalysis,  'market',      'agent-report-market')}
      ${agentCard('fas fa-shield-halved', 'Risk Watcher',      'var(--color-amber)',  results.riskAnalysis,    'risk',        'agent-report-risk')}
      ${agentCard('fas fa-lightbulb',     'Opportunity Scout', 'var(--color-violet)', results.opportunities,   'opportunity', 'agent-report-opportunity')}
    </div>`;

  if (score != null) updateScoreRing(score);
}

function updateScoreRing(score, source) {
  const circle = document.getElementById('scoreCircle');
  if (!circle) return;
  const circumference = 201;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? 'var(--color-green)' : score >= 40 ? 'var(--color-amber)' : 'var(--color-red)';
  circle.style.strokeDashoffset = offset;
  circle.style.stroke = color;
  const numEl = document.getElementById('scoreNum');
  if (numEl) { numEl.textContent = score; numEl.style.color = color; }
  document.getElementById('scoreLabel').textContent = score >= 70 ? 'Healthy' : score >= 40 ? 'Moderate' : 'Needs Work';
  document.getElementById('scoreHint').textContent = source || 'Based on AI analysis';
}

// Update the sidebar score based on whichever signal is available:
// AI agents (if run) > local diversification calc > empty
function refreshSidebarScore(metrics) {
  const aiScore = state.agentResults?.portfolioScore;
  if (aiScore != null) {
    updateScoreRing(aiScore, 'AI agent analysis');
    return;
  }
  const divScore = calcDiversificationScore(metrics);
  if (divScore != null) {
    updateScoreRing(divScore, 'Diversification score · run AI for deeper analysis');
    return;
  }
  // No holdings yet — show dash
  const num = document.getElementById('scoreNum');
  const label = document.getElementById('scoreLabel');
  const hint = document.getElementById('scoreHint');
  const circle = document.getElementById('scoreCircle');
  if (num) num.textContent = '–';
  if (label) label.textContent = 'Add holdings';
  if (hint) hint.textContent = 'to see your score';
  if (circle) { circle.style.strokeDashoffset = 201; }
}

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*$)/gm, '<div class="font-semibold mt-2 mb-1">$1</div>')
    .replace(/^## (.*$)/gm, '<div class="font-semibold mt-2 mb-1">$1</div>')
    .replace(/^- (.*$)/gm, '<div class="ml-3 mb-1">• $1</div>')
    .replace(/^\d+\. (.*$)/gm, '<div class="ml-3 mb-1">$1</div>')
    .replace(/\n\n/g, '<div class="mb-2"></div>')
    .replace(/\n/g, '<br>');
}

// ===== AI AGENTS =====
// Each agent has its own model tuned to its task:
//   haiku  → fast, structured, data-crunching tasks
//   sonnet → balanced reasoning, market analysis
//   opus   → deep synthesis, strategic advice
// ─── AGENT DEFINITIONS ───
// model:       used when aiProvider='claude' (routed via our proxy)
// modelOpenAI: used when aiProvider='openai-compatible' (LM Studio / Ollama).
//              LM Studio ignores this string and uses whichever model is loaded,
//              but we keep it as a placeholder so the request is well-formed.
//              Override in admin settings if using OpenRouter / Together etc.
const AGENT_DEFS = {
  portfolio: {
    label: '📊 Portfolio Health',
    model: 'claude-haiku-4-5',
    modelOpenAI: 'local-model',
    maxTokens: 800,
    system: `You are a portfolio health specialist. Analyze the provided portfolio data for:
1. Diversification quality (asset types, sectors, geographies)
2. Concentration risks (any single holding >20% weight)
3. Overall performance health

Always start your response with exactly: "Health Score: X/100"
Then give 3-4 specific bullet observations about these actual holdings. Be concise and data-driven.`
  },
  market: {
    label: '🌍 Market Impact',
    // Demoted from sonnet-4-5 to haiku-4-5 to escape the 10k input
    // tokens/min cap that triggers when 3 parallel Sonnet agents run
    // on a 100+ holding portfolio. Haiku's per-minute cap is ~5× higher;
    // analytical quality for "name sectors + sentiment" is comparable.
    model: 'claude-haiku-4-5',
    modelOpenAI: 'local-model',
    maxTokens: 800,
    system: `You are a global macro analyst. Given the portfolio and current market data:
1. Identify the top 3 global market factors affecting THIS specific portfolio right now
2. For each, name which exact holdings are impacted and how (bullish/bearish + why)
3. Give an overall market sentiment score for this portfolio: Bullish / Neutral / Bearish

Reference real market dynamics. Be specific to the actual tickers listed. Under 220 words.`
  },
  opportunity: {
    label: '🔭 Opportunity Scout',
    // Demoted from sonnet-4-5 to haiku-4-5 for the same rate-limit reason
    // as market. Opus advisor still synthesises with the higher model.
    model: 'claude-haiku-4-5',
    modelOpenAI: 'local-model',
    maxTokens: 800,
    system: `You are a strategic investment opportunity analyst. Based on the portfolio:
1. Identify 2-3 specific gaps — sectors, geographies, or asset classes underrepresented
2. For each gap, name a specific, real instrument (ETF ticker, stock, asset class) to fill it
3. Flag one hedging opportunity if there is an obvious unhedged risk

Be concrete. Suggest real tickers where possible. Consider the investor is NZ-based. Under 220 words.`
  },
  risk: {
    label: '🛡️ Risk Watcher',
    model: 'claude-haiku-4-5',
    modelOpenAI: 'local-model',
    maxTokens: 800,
    system: `You are a portfolio risk specialist. Given the portfolio + market data, identify the most material RISKS the investor should be aware of right now. Cover:
1. **Concentration risk** — any single holding or sector >20% weight; name the ticker(s) and weight.
2. **Macro headwind** — current macro/policy/cycle risk most relevant to this portfolio (interest rates, AI bubble, geopolitics, NZD strength, etc.) — be specific.
3. **FX exposure** — for an NZ-based investor, flag if foreign-currency holdings are unusually large or unhedged.
4. **Liquidity / quality** — flag any thinly-traded, speculative, or fundamentally weak holdings.

Always start your response with exactly: "Risk Level: Low" or "Risk Level: Moderate" or "Risk Level: Elevated" or "Risk Level: High".
Then 3-4 bullet observations referencing specific tickers and weights. Under 220 words.`
  },
  advisor: {
    label: '💼 Senior Advisor',
    model: 'claude-opus-4-5',
    modelOpenAI: 'local-model',
    maxTokens: 1200,
    system: `You are a senior personal financial advisor. Your specialist team has produced:
- A Portfolio Health analysis
- A Market Impact analysis
- A Risk Watcher analysis
- An Opportunity Scout analysis

Synthesize all four into a clear, prioritised action plan:
1. **Top 5 Priority Actions** — ranked by importance, specific and actionable. Each action MUST start with one of these severity tags in square brackets so the UI can colour them: [Critical], [High], [Medium], [Low], or [Watch]. Example: "[High] Trim NVDA below 10% portfolio weight to reduce concentration."
2. **One key risk** to watch in the next 30 days
3. **One strong positive** — what is working well
4. **30-day focus** — one single thing the investor should do first

Use the actual portfolio data. Reference specific holdings by ticker. NZ-based investor. Under 320 words.`
  },
  // v0.28 — "Ask IQ" conversational Q&A over the user's own portfolio.
  // FMA-safe: educational analysis only, never personalised buy/sell advice.
  chat: {
    label: '💬 Ask IQ',
    model: 'claude-haiku-4-5',
    modelOpenAI: 'local-model',
    maxTokens: 700,
    system: `You are "Ask IQ", a friendly analyst built into the InvestIQ app. You answer the user's questions about THEIR OWN portfolio using ONLY the PORTFOLIO DATA provided in the message.

Hard rules:
- Educational analysis ONLY — never personalised financial advice. Do NOT tell the user to buy, sell, or hold specific securities. If they ask "should I…", explain the relevant factors (concentration, diversification, FX/currency exposure, sector tilt, tax) and suggest they consult a licensed financial adviser for a personal recommendation. (NZ FMA compliance — this is mandatory.)
- Use ONLY the numbers in the provided data. NEVER invent holdings, prices, weights, or figures. If the data doesn't contain the answer, say so plainly.
- The investor is NZ-based; the base currency is shown in the data. Reference real tickers and weights from the data.
- Be concise (under ~180 words). Plain, warm tone. Use short bullets when they help. No filler preamble ("Certainly", "Great question"). Answer directly.`
  }
};

// ═══════════════════════════════════════════════════════════════════════
// HARBOUR FUND-ANALYSIS AGENTS (v0.31.1) — in the Harbour edition the unit of
// analysis is a FUND, not a personal portfolio: each portfolio holds the
// underlying holdings of one Harbour fund (or an externally-managed sleeve,
// e.g. EPOCH / T. Rowe Price). The agents become asset-class analysts:
// Australasian Equity, Australasian Fixed Interest, Global Equities. Output
// FORMAT CONTRACTS are preserved exactly (GUARDRAILS.md): "Health Score:
// X/100", "Risk Level: …", advisor severity tags — so all UI parsing works
// unchanged. Models/maxTokens unchanged (MODEL_SELECTION.md).
// ═══════════════════════════════════════════════════════════════════════
if (typeof EDITION !== 'undefined' && EDITION.id === 'harbour') {
  const FUND_CONTEXT = `CONTEXT: This is an internal Harbour analyst tool. The "portfolio" provided is the UNDERLYING HOLDINGS of a single fund — the portfolio name identifies the fund / asset class. Funds fall into: Australasian Equity (NZX/ASX), Australasian Fixed Interest (NZ/AU bonds, credit), or Global Equities (often externally managed sleeves, e.g. EPOCH, T. Rowe Price). Infer the asset class from the name + holdings and analyse with that lens. This is analytical research support, not investment advice or a recommendation to trade.`;

  AGENT_DEFS.portfolio.label = '📊 Fund Composition';
  AGENT_DEFS.portfolio.system = `You are a fund composition analyst at an NZ asset manager. ${FUND_CONTEXT}

Assess the fund's composition:
1. Style/mandate consistency — do the holdings look consistent with the inferred asset class (e.g. Australasian Equity: NZX/ASX names; Australasian FI: duration buckets, credit quality mix; Global Equity: regional/sector spread)?
2. Concentration — top-10 weight, any single position >5% (equity) or issuer concentration (FI); name tickers/issuers and weights.
3. Overall composition quality.

Always start your response with exactly: "Health Score: X/100"
Then 3-4 specific bullet observations about these actual holdings. Be concise and data-driven.`;

  AGENT_DEFS.market.label = '🌍 Macro & Market';
  AGENT_DEFS.market.system = `You are a macro strategist at an NZ asset manager. ${FUND_CONTEXT}

Given the fund's holdings and current market data:
1. Identify the top 3 macro/market factors affecting THIS fund right now (e.g. RBNZ/RBA rate path and NZD for Australasian books; global rates, USD, sector rotation for global sleeves).
2. For each, name which actual holdings/issuers are most impacted and how (tailwind/headwind + why).
3. Give an overall market backdrop call for this fund: Supportive / Neutral / Challenging.

Reference real market dynamics. Be specific to the actual tickers/issuers listed. Under 220 words.`;

  AGENT_DEFS.opportunity.label = '🔭 Positioning Scout';
  AGENT_DEFS.opportunity.system = `You are a portfolio-strategy analyst at an NZ asset manager. ${FUND_CONTEXT}

Based on the fund's holdings:
1. Identify 2-3 positioning observations — sectors, durations, regions, or factors where the fund looks under/over-exposed RELATIVE to its inferred mandate.
2. For each, describe what a portfolio manager would typically evaluate (specific instruments, issuers, or exposures worth researching — for discussion, not a trade instruction).
3. Flag one unhedged or under-appreciated exposure if there is an obvious one (FX, duration, single-name).

Be concrete and name real instruments where possible. Under 220 words.`;

  AGENT_DEFS.risk.label = '🛡️ Fund Risk';
  AGENT_DEFS.risk.system = `You are a fund risk analyst at an NZ asset manager. ${FUND_CONTEXT}

Identify the most material RISKS in this fund right now:
1. **Concentration** — single names/issuers or sectors with outsized weight; name them with weights.
2. **Asset-class risk** — equity: valuation/liquidity/factor crowding; fixed interest: duration, credit quality, spread risk; global sleeves: manager concentration and regional tilts.
3. **FX exposure** — unhedged foreign-currency exposure for an NZD-based fund.
4. **Liquidity / quality** — thinly-traded names, small-caps, or low-grade credit.

Always start your response with exactly: "Risk Level: Low" or "Risk Level: Moderate" or "Risk Level: Elevated" or "Risk Level: High".
Then 3-4 bullet observations referencing specific holdings and weights. Under 220 words.`;

  AGENT_DEFS.advisor.label = '💼 Fund Review';
  AGENT_DEFS.advisor.system = `You are a CIO-level reviewer at an NZ asset manager synthesising your analyst team's work on ONE fund. ${FUND_CONTEXT} Your team produced: a Fund Composition analysis, a Macro & Market analysis, a Fund Risk analysis, and a Positioning Scout analysis.

Synthesise them into a whole-of-fund review:
1. **Top 5 Review Points** — ranked by importance, specific and evidence-based. Each point MUST start with one of these severity tags in square brackets so the UI can colour them: [Critical], [High], [Medium], [Low], or [Watch]. Example: "[High] Top-10 concentration at 62% — review single-name limits."
2. **One key risk** to monitor over the next 30 days
3. **One strength** — what the fund is doing well
4. **30-day focus** — the single most valuable piece of analysis to do next

Use the actual holdings data. Reference specific tickers/issuers. Under 320 words. Analytical review for internal discussion — not investment advice.`;

  // Ask IQ speaks fund language too.
  AGENT_DEFS.chat.system = AGENT_DEFS.chat.system.replace(
    'You answer the user\'s questions about THEIR OWN portfolio',
    'You answer questions about a HARBOUR FUND — the data provided is the underlying holdings of one fund (the portfolio name identifies it)'
  ) + `\n- ${FUND_CONTEXT}`;
}

// ═══════════════════════════════════════════════════════════════════════
// ASK IQ (v0.28) — conversational Q&A over the active portfolio. Single
// turn at the API layer (callClaude sends one user message), but we inject a
// compact portfolio snapshot + the last few turns of transcript so follow-ups
// have context. Educational only — the system prompt enforces FMA wording.
// ═══════════════════════════════════════════════════════════════════════
let askIQHistory = []; // [{ role:'user'|'assistant', content }]

// Compact, token-bounded snapshot of the ACTIVE portfolio for the model.
function buildAskIQContext() {
  const m = getMetrics();
  const base = state.settings.currency || 'NZD';
  const sym  = CURRENCY_SYMBOLS[base] || 'NZ$';
  if (!m.holdings.length) return null;

  const sorted = [...m.holdings].sort((a,b) => (b.currentValue||0) - (a.currentValue||0));
  const TOP_N = 25;
  const top = sorted.slice(0, TOP_N).map(h => ({
    symbol: h.symbol, type: h.type,
    sector: h.sector || _typeFallbackSector(h),
    region: h.region || _regionFromSymbol(h),
    platform: h.platform || 'Unknown',
    value: Math.round(h.currentValue || 0),
    weight: +(h.weight || 0).toFixed(1),
    dayPct: (typeof h.dayChangePct === 'number') ? +h.dayChangePct.toFixed(2) : null,
    totalPct: +(h.gainPct || 0).toFixed(1)
  }));

  // Aggregates so questions about exposure work even past the top 25.
  const agg = (keyFn) => {
    const out = {};
    m.holdings.forEach(h => { const k = keyFn(h) || 'Unknown'; out[k] = (out[k] || 0) + (h.currentValue || 0); });
    const tv = m.totalValue || 1;
    return Object.entries(out).sort((a,b)=>b[1]-a[1])
      .map(([k,v]) => ({ name:k, weight:+(v/tv*100).toFixed(1) }));
  };

  return {
    baseCurrency: base, currencySymbol: sym,
    totalValue: Math.round(m.totalValue || 0),
    totalCost: Math.round(m.totalCost || 0),
    totalReturnPct: +(m.totalGainPct || 0).toFixed(1),
    dayChangePct: m.totalCost > 0 ? +(((m.totalDayChange||0)/m.totalValue)*100).toFixed(2) : null,
    holdingsCount: m.holdings.length,
    portfolioName: (typeof isViewingAll === 'function' && isViewingAll()) ? 'All portfolios (combined)'
                   : (typeof getActivePortfolio === 'function' ? (getActivePortfolio()?.name || 'Portfolio') : 'Portfolio'),
    byAssetType: agg(h => _assetTypeLabel ? _assetTypeLabel(h.type) : h.type),
    bySector:    agg(h => h.sector || _typeFallbackSector(h)),
    byRegion:    agg(h => h.region || _regionFromSymbol(h)),
    byPlatform:  agg(h => h.platform || 'Unknown'),
    topHoldings: top
  };
}

async function askIQSend(presetText) {
  const input = document.getElementById('askiqInput');
  const text = (presetText != null ? presetText : (input ? input.value : '')).trim();
  if (!text) return;

  const ctx = buildAskIQContext();
  if (!ctx) {
    renderAskIQError('Add some holdings first — then I can answer questions about your portfolio.');
    return;
  }

  // Each message is an AI call → counts against quota (admins/BYOK skip).
  const allowed = await tryConsumeAiQuota();
  if (!allowed) return; // paywall modal already shown

  if (input) input.value = '';
  askIQHistory.push({ role: 'user', content: text });
  renderAskIQ(true); // true = show a thinking bubble

  // Compose: portfolio snapshot + recent transcript + the current question.
  const recent = askIQHistory.slice(-9, -1) // last few turns, excluding the just-pushed question
    .map(t => `${t.role === 'user' ? 'User' : 'IQ'}: ${t.content}`).join('\n');
  const composed =
`PORTFOLIO DATA (live, base currency ${ctx.currencySymbol}):
${JSON.stringify(ctx)}

${recent ? `CONVERSATION SO FAR:\n${recent}\n\n` : ''}CURRENT QUESTION:
${text}`;

  try {
    const answer = await callClaude('chat', composed);
    askIQHistory.push({ role: 'assistant', content: answer });
    renderAskIQ();
  } catch (e) {
    askIQHistory.push({ role: 'assistant', content: `⚠️ I couldn't answer that just now: ${e.message || 'request failed'}. Try again in a moment.` });
    renderAskIQ();
  }
}

function renderAskIQError(msg) {
  const wrap = document.getElementById('askiqMessages');
  if (wrap) wrap.innerHTML = `<div class="text-sm" style="color:var(--color-amber);padding:12px;">${_escape(msg)}</div>`;
}

function renderAskIQ(thinking) {
  const wrap = document.getElementById('askiqMessages');
  if (!wrap) return;

  if (!askIQHistory.length && !thinking) {
    wrap.innerHTML = `
      <div class="text-center" style="padding:32px 16px;color:var(--text-muted);">
        <i class="fas fa-comments" style="font-size:28px;opacity:0.4;"></i>
        <div class="text-sm mt-3" style="color:var(--text-secondary);">Ask anything about your portfolio.</div>
        <div class="text-xs mt-1">e.g. concentration, currency exposure, sector mix, diversification.</div>
      </div>`;
    return;
  }

  const bubble = (t) => {
    if (t.role === 'user') {
      return `<div style="display:flex;justify-content:flex-end;margin:10px 0;">
        <div style="max-width:80%;background:var(--accent-soft-2);color:var(--text-primary);padding:10px 14px;border-radius:14px 14px 4px 14px;font-size:13px;line-height:1.5;">${_escape(t.content)}</div>
      </div>`;
    }
    return `<div style="display:flex;justify-content:flex-start;margin:10px 0;">
      <div style="max-width:88%;background:var(--bg-panel-2);border:1px solid var(--border);padding:10px 14px;border-radius:14px 14px 14px 4px;font-size:13px;line-height:1.55;">${formatMarkdown(t.content)}</div>
    </div>`;
  };

  let html = askIQHistory.map(bubble).join('');
  if (thinking) {
    html += `<div style="display:flex;justify-content:flex-start;margin:10px 0;">
      <div style="background:var(--bg-panel-2);border:1px solid var(--border);padding:10px 14px;border-radius:14px;font-size:13px;color:var(--text-muted);">
        <span class="spinner" style="width:12px;height:12px;display:inline-block;margin-right:6px;"></span>IQ is thinking…</div>
    </div>`;
  }
  wrap.innerHTML = html;
  wrap.scrollTop = wrap.scrollHeight;
}

function askIQKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askIQSend(); }
}

function askIQClear() {
  askIQHistory = [];
  renderAskIQ();
}

async function callClaude(agentKey, userMessage) {
  const def = AGENT_DEFS[agentKey];

  // Decide which AI provider to use — Claude (via our proxy) or an
  // OpenAI-compatible endpoint (LM Studio / Ollama / etc.)
  const provider  = (state.settings.aiProvider    || PLATFORM_CONFIG.aiProvider    || 'claude').toLowerCase();
  const providerUrl = (state.settings.aiProviderUrl || PLATFORM_CONFIG.aiProviderUrl || '').replace(/\/$/,'');
  const providerKey = (state.settings.aiProviderKey || PLATFORM_CONFIG.aiProviderKey || '');

  // ── OpenAI-compatible path (LM Studio, Ollama, OpenRouter, etc.) ──
  if (provider === 'openai-compatible' && providerUrl) {
    const body = JSON.stringify({
      model: def.modelOpenAI || def.model,
      max_tokens: def.maxTokens || 1024,
      messages: [
        { role: 'system', content: def.system },
        { role: 'user',   content: userMessage }
      ]
    });
    const headers = { 'Content-Type': 'application/json' };
    if (providerKey) headers['Authorization'] = 'Bearer ' + providerKey;
    try {
      const res = await fetch(providerUrl + '/chat/completions', {
        method:'POST', headers, body, signal: AbortSignal.timeout(120000)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`[${res.status}] ${err || 'LM Studio/OpenAI-compat call failed'}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response from local model.';
    } catch(e) {
      throw new Error(`${agentKey} (local ${def.model}): ${e.message}`);
    }
  }

  // ── Default Claude path (via proxy) ──
  const apiKey = state.settings.claudeApiKey || '';
  const body = JSON.stringify({
    model: def.model,
    max_tokens: def.maxTokens || 1024,
    system: def.system,
    messages: [{ role: 'user', content: userMessage }]
  });

  const headers = proxyHeaders({ 'anthropic-version': '2023-06-01' });
  if (apiKey) headers['x-api-key'] = apiKey;

  const webappBase = (state.settings.proxyUrl || PLATFORM_CONFIG.proxyUrl || '').replace(/\/$/, '');
  const endpoints = [];
  if (webappBase) endpoints.push(webappBase + '/v1/messages');
  if (apiKey) endpoints.push('https://api.anthropic.com/v1/messages');

  let lastError = null;
  // Single retry on 429: Anthropic enforces a per-minute sliding window;
  // waiting the suggested time (or 30s default) and trying once more is
  // usually enough to clear it without the user having to re-click.
  let retried429 = false;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method:'POST', headers, body, signal: AbortSignal.timeout(60000) });
      if (res.ok) {
        const data = await res.json();
        return data.content?.[0]?.text || 'No response from agent.';
      }
      // Surface the ACTUAL error from Anthropic / the proxy
      const errText = await res.text();
      let errMsg;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errJson.message || errText;
      } catch { errMsg = errText || `HTTP ${res.status}`; }
      lastError = `[${res.status}] ${errMsg}`;
      console.error(`[${agentKey}] ${url} →`, lastError);
      // 429: Anthropic rate limit. Use the retry-after header if present,
      // else parse the suggested wait from the error body, else 30s. Try
      // once more on the SAME endpoint before falling through to the next.
      if (res.status === 429 && !retried429) {
        retried429 = true;
        const headerWait = parseFloat(res.headers.get('retry-after') || '0');
        const bodyWaitMs = /try again in (\d+)/i.exec(errMsg)?.[1];
        const waitMs = Math.max(15000, Math.min(60000,
          (headerWait * 1000) || (bodyWaitMs * 1000) || 30000));
        console.warn(`[${agentKey}] 429 — waiting ${waitMs}ms then retrying once`);
        await new Promise(r => setTimeout(r, waitMs));
        const res2 = await fetch(url, { method:'POST', headers, body, signal: AbortSignal.timeout(60000) });
        if (res2.ok) {
          const data2 = await res2.json();
          return data2.content?.[0]?.text || 'No response from agent.';
        }
        const err2 = await res2.text();
        lastError = `[${res2.status}] ${err2 || 'retry failed'}`;
      }
      // 400 (bad model / bad request) and 401 (auth) — no point retrying on direct API
      if (res.status === 400 || res.status === 401) {
        throw new Error(`${agentKey} (${def.model}): ${errMsg}`);
      }
    } catch (e) {
      if (e.message?.includes(def.model) || e.message?.includes('API key')) throw e;
      lastError = e.message;
      console.warn(`[${agentKey}] ${url} threw:`, e.message);
      continue;
    }
  }
  throw new Error(`${agentKey} (${def.model}): ${lastError || 'unreachable'}`);
}

function setAgentState(agentKey, state2, text='') {
  const card = document.getElementById('agent-' + agentKey);
  const statusEl = document.getElementById('agent-' + agentKey + '-status');
  const resultEl = document.getElementById('agent-' + agentKey + '-result');

  card.className = 'agent-card agent-' + state2;
  statusEl.textContent = { idle:'Idle', running:'Running...', done:'✓ Done', error:'✗ Error' }[state2] || state2;
  statusEl.style.color = { idle:'#4a6080', running:'#818cf8', done:'#34d399', error:'#f87171' }[state2];

  if (text) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = formatMarkdown(text);
  }

  if (state2 === 'running') {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.display = 'inline-block';
    spinner.style.marginRight = '4px';
    statusEl.prepend(spinner);
  }
}

async function runAgents() {
  const metrics = getMetrics();
  if (!metrics.holdings.length) {
    document.getElementById('agentError').style.display = 'block';
    document.getElementById('agentError').textContent = 'Add some holdings first before running analysis.';
    return;
  }

  // Check AI quota — admins / BYOK users skip; others gated to N runs
  const allowed = await tryConsumeAiQuota();
  if (!allowed) return; // paywall modal already shown

  // API key no longer required — proxy has platform key. Admin override optional.
  document.getElementById('agentError').style.display = 'none';
  document.getElementById('runAgentsBtn').disabled = true;
  document.getElementById('runAgentsBtn').innerHTML = '<div class="spinner" style="width:14px;height:14px;margin-right:8px;display:inline-block;"></div>Running...';

  ['portfolio','market','opportunity','advisor'].forEach(k => setAgentState(k, 'idle'));

  const sym = CURRENCY_SYMBOLS[state.settings.currency] || '£';

  // ── Payload compression ───────────────────────────────────────────────
  // With ~100+ holdings, sending every row verbatim to 3 parallel Sonnet
  // calls easily exceeds Anthropic's 10k input-tokens-per-minute org cap.
  // We send the top 20 holdings by weight in full + aggregate the long tail
  // into one row per (type, sector). Same analytical signal, ~70% smaller.
  const TOP_N = 20;
  const sorted = [...metrics.holdings].sort((a,b) => (b.currentValue||0) - (a.currentValue||0));
  const topHoldings = sorted.slice(0, TOP_N).map(h => ({
    symbol: h.symbol, name: h.name || h.symbol, type: h.type,
    platform: h.platform, sector: h.sector || 'unknown',
    value: sym + fmt(h.currentValue),
    weight: fmt(h.weight) + '%',
    return: (h.gainPct >= 0 ? '+' : '') + fmt(h.gainPct) + '%'
  }));
  // Aggregate the rest: one row per (type+sector) with combined weight + value.
  const tail = sorted.slice(TOP_N);
  const aggMap = new Map();
  tail.forEach(h => {
    const key = `${h.type || 'other'}|${h.sector || 'unknown'}`;
    if (!aggMap.has(key)) aggMap.set(key, { type: h.type, sector: h.sector || 'unknown', value: 0, weight: 0, count: 0 });
    const a = aggMap.get(key);
    a.value  += h.currentValue || 0;
    a.weight += h.weight || 0;
    a.count  += 1;
  });
  const tailAggregates = [...aggMap.values()]
    .sort((a,b) => b.value - a.value)
    .map(a => ({
      type: a.type, sector: a.sector,
      holdings: a.count,
      value: sym + fmt(a.value),
      weight: fmt(a.weight) + '%'
    }));

  const portfolioSummary = {
    totalValue:  sym + fmt(metrics.totalValue),
    totalReturn: (metrics.totalGain >= 0 ? '+' : '') + fmt(metrics.totalGainPct) + '%',
    holdingsCount: metrics.holdings.length,
    topHoldings,
    ...(tailAggregates.length ? { tailAggregates, tailNote: `${tail.length} smaller holdings aggregated by type+sector to keep prompt size within rate limits` } : {})
  };

  const marketSummary = {
    indices: state.marketData.indices,
    crypto: state.marketData.crypto,
    commodities: state.marketData.commodities
  };

  const marketContext = document.getElementById('marketContext').value;
  const baseMsg = `Portfolio Data:\n${JSON.stringify(portfolioSummary, null, 2)}\n\nMarket Data:\n${JSON.stringify(marketSummary, null, 2)}${marketContext ? '\n\nAdditional Context:\n' + marketContext : ''}`;

  try {
    // ── Phase 1: portfolio, market, opportunity — staggered launch ──────────
    // True parallel hits Anthropic's per-minute input-token cap when the
    // portfolio is large. Staggering by ~4s spreads ~3 × 3-5k = 10-15k
    // tokens across ~10s, which keeps us inside the 10k/min sonnet window
    // without meaningfully slowing the user-perceived total (~25s anyway).
    const stagger = (ms) => new Promise(r => setTimeout(r, ms));
    // ── SEQUENTIAL execution ─────────────────────────────────────────────
    // Was running 4 agents in parallel staggered by 3.5s — hit Anthropic's
    // 10k input-tokens/min cap on big portfolios + timed out the page.
    // Now: one agent at a time. Slower wall-clock (~25-40s total) but
    // robust, no rate-limit hits, no timeouts. Each agent's result is
    // saved as it lands so a partial failure still leaves usable data.
    state.agentResults = state.agentResults || {};
    // Tag which portfolio this analysis is for — so switching portfolios
    // shows a "stale, re-run" banner instead of the wrong portfolio's insights.
    state.agentResults.portfolioId   = state.activePortfolioId;
    state.agentResults.portfolioName = (typeof getActivePortfolio === 'function') ? getActivePortfolio().name : null;

    setAgentState('portfolio', 'running');
    const healthAnalysis = await callClaude('portfolio', baseMsg);
    setAgentState('portfolio', 'done', healthAnalysis);
    const scoreMatch = healthAnalysis.match(/Health Score:\s*(\d+)/i);
    if (scoreMatch) updateScoreRing(parseInt(scoreMatch[1]));
    state.agentResults.healthAnalysis = healthAnalysis;
    state.agentResults.portfolioScore = scoreMatch ? parseInt(scoreMatch[1]) : null;
    saveState();

    setAgentState('market', 'running');
    const marketAnalysis = await callClaude('market', baseMsg);
    setAgentState('market', 'done', marketAnalysis);
    state.agentResults.marketAnalysis = marketAnalysis;
    saveState();

    setAgentState('risk', 'running');
    const riskAnalysis = await callClaude('risk', baseMsg);
    setAgentState('risk', 'done', riskAnalysis);
    const riskMatch = riskAnalysis.match(/Risk Level:\s*(Low|Moderate|Elevated|High)/i);
    state.agentResults.riskAnalysis = riskAnalysis;
    state.agentResults.riskLevel = riskMatch ? riskMatch[1] : null;
    saveState();

    setAgentState('opportunity', 'running');
    const opportunities = await callClaude('opportunity', baseMsg);
    setAgentState('opportunity', 'done', opportunities);
    state.agentResults.opportunities = opportunities;
    saveState();

    // ── Phase 2: advisor synthesises all four outputs ────────────────────────
    setAgentState('advisor', 'running');
    const advisorMsg = `Portfolio Data:\n${JSON.stringify(portfolioSummary, null, 2)}\n\nMarket Context:\n${JSON.stringify(marketSummary, null, 2)}\n\n── AGENT OUTPUTS ──\n\n📊 Portfolio Health Agent:\n${healthAnalysis}\n\n🌍 Market Impact Agent:\n${marketAnalysis}\n\n🛡️ Risk Watcher:\n${riskAnalysis}\n\n🔭 Opportunity Scout Agent:\n${opportunities}`;
    const finalAdvice = await callClaude('advisor', advisorMsg);
    setAgentState('advisor', 'done', finalAdvice);

    state.agentResults.finalAdvice = finalAdvice;
    state.agentResults.timestamp = new Date().toISOString();
    saveState();
    renderInsightsSection(state.agentResults);
    renderQuickInsights(metrics);
    logActivity('agent_run', { holdingsCount: metrics.holdings.length, portfolioScore: state.agentResults.portfolioScore });

  } catch(e) {
    document.getElementById('agentError').style.display = 'block';
    const isRateLimit = /\b429\b|rate limit/i.test(e.message || '');
    document.getElementById('agentError').textContent = isRateLimit
      ? 'Rate limit hit. Wait ~60 seconds, then try running a single agent (click Run on the agent card directly).'
      : 'Agent error: ' + e.message;
    logActivity('agent_run_failed', { error: e.message?.slice(0,200) });
    ['portfolio','market','risk','opportunity','advisor'].forEach(k => {
      if (document.getElementById('agent-'+k)?.className.includes('running'))
        setAgentState(k, 'error');
    });
  }

  document.getElementById('runAgentsBtn').disabled = false;
  document.getElementById('runAgentsBtn').innerHTML = '<i class="fas fa-redo mr-2"></i>Run All Again';
}

// Run a single agent by key. Lets the user re-run just one (saves money,
// avoids rate limits) — wired to the per-card play buttons in the modal.
async function runSingleAgent(agentKey) {
  const metrics = getMetrics();
  if (!metrics.holdings.length) {
    document.getElementById('agentError').style.display = 'block';
    document.getElementById('agentError').textContent = 'Add some holdings first before running analysis.';
    return;
  }
  const allowed = await tryConsumeAiQuota();
  if (!allowed) return;
  document.getElementById('agentError').style.display = 'none';

  // Rebuild the same payload runAgents() uses — kept in scope by recomputing.
  const sym = CURRENCY_SYMBOLS[state.settings.currency] || '£';
  const TOP_N = 20;
  const sorted = [...metrics.holdings].sort((a,b) => (b.currentValue||0) - (a.currentValue||0));
  const topHoldings = sorted.slice(0, TOP_N).map(h => ({
    symbol: h.symbol, name: h.name || h.symbol, type: h.type,
    platform: h.platform, sector: h.sector || 'unknown',
    value: sym + fmt(h.currentValue),
    weight: fmt(h.weight) + '%',
    return: (h.gainPct >= 0 ? '+' : '') + fmt(h.gainPct) + '%'
  }));
  const tail = sorted.slice(TOP_N);
  const aggMap = new Map();
  tail.forEach(h => {
    const key = `${h.type || 'other'}|${h.sector || 'unknown'}`;
    if (!aggMap.has(key)) aggMap.set(key, { type: h.type, sector: h.sector || 'unknown', value: 0, weight: 0, count: 0 });
    const a = aggMap.get(key);
    a.value  += h.currentValue || 0;
    a.weight += h.weight || 0;
    a.count  += 1;
  });
  const tailAggregates = [...aggMap.values()].sort((a,b) => b.value - a.value).map(a => ({
    type: a.type, sector: a.sector, holdings: a.count,
    value: sym + fmt(a.value), weight: fmt(a.weight) + '%'
  }));
  const portfolioSummary = { totalValue: sym + fmt(metrics.totalValue), totalReturn: (metrics.totalGainPct >= 0 ? '+' : '') + fmt(metrics.totalGainPct) + '%', holdingsCount: metrics.holdings.length, topHoldings, tailAggregates };
  const marketSummary = (typeof window._latestMarketData === 'object') ? window._latestMarketData : {};
  const baseMsg = `Portfolio:\n${JSON.stringify(portfolioSummary, null, 2)}\n\nMarket Context:\n${JSON.stringify(marketSummary, null, 2)}`;

  state.agentResults = state.agentResults || {};
  state.agentResults.portfolioId   = state.activePortfolioId;
  state.agentResults.portfolioName = (typeof getActivePortfolio === 'function') ? getActivePortfolio().name : null;
  try {
    setAgentState(agentKey, 'running');
    if (agentKey === 'advisor') {
      // Advisor needs the other 3+1 outputs to synthesise — use stored
      const r = state.agentResults;
      if (!r.healthAnalysis || !r.marketAnalysis || !r.riskAnalysis || !r.opportunities) {
        setAgentState('advisor', 'error');
        document.getElementById('agentError').style.display = 'block';
        document.getElementById('agentError').textContent = 'Run the other 4 agents first — advisor needs their outputs to synthesise.';
        return;
      }
      const msg = `Portfolio Data:\n${JSON.stringify(portfolioSummary, null, 2)}\n\nMarket Context:\n${JSON.stringify(marketSummary, null, 2)}\n\n── AGENT OUTPUTS ──\n\n📊 Portfolio Health:\n${r.healthAnalysis}\n\n🌍 Market Impact:\n${r.marketAnalysis}\n\n🛡️ Risk Watcher:\n${r.riskAnalysis}\n\n🔭 Opportunity Scout:\n${r.opportunities}`;
      const out = await callClaude('advisor', msg);
      setAgentState('advisor', 'done', out);
      state.agentResults.finalAdvice = out;
    } else {
      const out = await callClaude(agentKey, baseMsg);
      setAgentState(agentKey, 'done', out);
      if (agentKey === 'portfolio') {
        const m = out.match(/Health Score:\s*(\d+)/i);
        if (m) { updateScoreRing(parseInt(m[1])); state.agentResults.portfolioScore = parseInt(m[1]); }
        state.agentResults.healthAnalysis = out;
      } else if (agentKey === 'market') {
        state.agentResults.marketAnalysis = out;
      } else if (agentKey === 'risk') {
        const m = out.match(/Risk Level:\s*(Low|Moderate|Elevated|High)/i);
        if (m) state.agentResults.riskLevel = m[1];
        state.agentResults.riskAnalysis = out;
      } else if (agentKey === 'opportunity') {
        state.agentResults.opportunities = out;
      }
    }
    state.agentResults.timestamp = new Date().toISOString();
    saveState();
    renderInsightsSection(state.agentResults);
    logActivity('agent_run_single', { agent: agentKey });
  } catch(e) {
    setAgentState(agentKey, 'error');
    document.getElementById('agentError').style.display = 'block';
    document.getElementById('agentError').textContent = 'Agent error: ' + e.message;
  }
}
