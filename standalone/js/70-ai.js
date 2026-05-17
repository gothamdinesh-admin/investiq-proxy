// ═══════════════════════════════════════════════════════════════════════
// 70-ai.js — Multi-agent Claude analysis pipeline + UI helpers.
// Depends on: 00-config.js (PLATFORM_CONFIG, CURRENCY_SYMBOLS),
//             10-helpers.js (fmt, _escape), 20-state.js (state).
// Forward refs (resolved lazily at call time, declared inline):
//   getMetrics(), proxyHeaders(), tryConsumeAiQuota(), saveState(),
//   renderQuickInsights(), logActivity(), toast.
// ═══════════════════════════════════════════════════════════════════════

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

  // ── KPI strip ────────────────────────────────────────────────────────────
  const kpiTile = (label, value, sub, color, icon) => `
    <div class="card2 p-4" style="border-left:3px solid ${color};">
      <div class="flex items-center justify-between mb-1">
        <div class="text-xs uppercase neutral font-semibold" style="letter-spacing:0.4px;">${label}</div>
        <i class="fas ${icon}" style="color:${color};font-size:14px;"></i>
      </div>
      <div class="text-2xl font-bold mt-1" style="color:${color};line-height:1.1;">${value}</div>
      <div class="text-xs neutral mt-1">${sub}</div>
    </div>`;
  const kpiStrip = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      ${kpiTile('Portfolio Health',  score != null ? score + '/100' : '–', scoreLabel,                            scoreColor, 'fa-heartbeat')}
      ${kpiTile('Risk Level',        riskLevel,                              'Auto-classified by Risk Watcher',   riskColor,  riskIcon)}
      ${kpiTile('Market Sentiment',  sentiment,                              'Across your holdings today',        sentColor,  sentIcon)}
      ${kpiTile('Opportunities',     oppCount || '–',                        oppCount ? 'Ideas found by Scout' : 'No gaps flagged', 'var(--color-violet)', 'fa-lightbulb')}
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

  // ── Per-agent detail (collapsible — most users want the action items above) ──
  const agentCard = (icon, title, color, body) => `
    <details class="card p-5" style="border-left:3px solid ${color};">
      <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;">
        <div class="flex items-center gap-2">
          <i class="${icon}" style="color:${color};font-size:16px;"></i>
          <span class="font-semibold" style="color:${color};">${title}</span>
        </div>
        <i class="fas fa-chevron-down text-xs neutral"></i>
      </summary>
      <div class="prose-sm mt-3 pt-3" style="color:var(--text-body);line-height:1.7;font-size:13px;border-top:1px solid var(--border);">${formatMarkdown(body || 'No output.')}</div>
    </details>`;

  document.getElementById('insightsContent').innerHTML = kpiStrip + heroHtml + actionItemHtml + `
    <div class="text-xs uppercase neutral font-semibold mb-3 mt-4 flex items-center gap-2" style="letter-spacing:0.6px;">
      <i class="fas fa-folder-open" style="color:var(--text-muted);"></i> Detailed agent reports
      <span class="neutral" style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;">click a card to expand</span>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${agentCard('fas fa-heartbeat',         'Portfolio Health',  'var(--color-green)',  results.healthAnalysis)}
      ${agentCard('fas fa-chart-line',        'Market Impact',     'var(--color-blue)',   results.marketAnalysis)}
      ${agentCard('fas fa-shield-halved',     'Risk Watcher',      'var(--color-amber)',  results.riskAnalysis)}
      ${agentCard('fas fa-lightbulb',         'Opportunity Scout', 'var(--color-violet)', results.opportunities)}
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
  }
};

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
    setAgentState('portfolio',   'running');
    const p1 = callClaude('portfolio',   baseMsg);
    await stagger(3500);
    setAgentState('market',      'running');
    const p2 = callClaude('market',      baseMsg);
    await stagger(3500);
    setAgentState('risk',        'running');
    const p4 = callClaude('risk',        baseMsg);
    await stagger(3500);
    setAgentState('opportunity', 'running');
    const p3 = callClaude('opportunity', baseMsg);

    const [healthAnalysis, marketAnalysis, riskAnalysis, opportunities] = await Promise.all([p1, p2, p4, p3]);

    setAgentState('portfolio',   'done', healthAnalysis);
    setAgentState('market',      'done', marketAnalysis);
    setAgentState('risk',        'done', riskAnalysis);
    setAgentState('opportunity', 'done', opportunities);

    const scoreMatch = healthAnalysis.match(/Health Score:\s*(\d+)/i);
    if (scoreMatch) updateScoreRing(parseInt(scoreMatch[1]));
    const riskMatch = riskAnalysis.match(/Risk Level:\s*(Low|Moderate|Elevated|High)/i);

    // ── Phase 2: advisor synthesises all four outputs ────────────────────────
    setAgentState('advisor', 'running');
    const advisorMsg = `Portfolio Data:\n${JSON.stringify(portfolioSummary, null, 2)}\n\nMarket Context:\n${JSON.stringify(marketSummary, null, 2)}\n\n── AGENT OUTPUTS ──\n\n📊 Portfolio Health Agent:\n${healthAnalysis}\n\n🌍 Market Impact Agent:\n${marketAnalysis}\n\n🛡️ Risk Watcher:\n${riskAnalysis}\n\n🔭 Opportunity Scout Agent:\n${opportunities}`;
    const finalAdvice = await callClaude('advisor', advisorMsg);
    setAgentState('advisor', 'done', finalAdvice);

    state.agentResults = { healthAnalysis, marketAnalysis, riskAnalysis, opportunities, finalAdvice,
      portfolioScore: scoreMatch ? parseInt(scoreMatch[1]) : null,
      riskLevel: riskMatch ? riskMatch[1] : null,
      timestamp: new Date().toISOString() };
    saveState();
    renderInsightsSection(state.agentResults);
    renderQuickInsights(metrics);
    logActivity('agent_run', { holdingsCount: metrics.holdings.length, portfolioScore: state.agentResults.portfolioScore });

  } catch(e) {
    document.getElementById('agentError').style.display = 'block';
    // Friendlier message for the most common failure: Anthropic per-minute
    // rate-limit. Tells the user it's transient and they can just retry.
    const isRateLimit = /\b429\b|rate limit/i.test(e.message || '');
    document.getElementById('agentError').textContent = isRateLimit
      ? 'Rate limit hit (Anthropic 10k input tokens/min). Wait ~60 seconds and click Run Again — the staggered launch and slimmed payload should keep the next run under cap.'
      : 'Agent error: ' + e.message;
    logActivity('agent_run_failed', { error: e.message?.slice(0,200) });
    ['portfolio','market','opportunity','advisor'].forEach(k => {
      if (document.getElementById('agent-'+k)?.className.includes('running'))
        setAgentState(k, 'error');
    });
  }

  document.getElementById('runAgentsBtn').disabled = false;
  document.getElementById('runAgentsBtn').innerHTML = '<i class="fas fa-redo mr-2"></i>Run Again';
}
