// ═══════════════════════════════════════════════════════════════════════
// 80-trader.js — TraderIQ module (v0.13)
//
// Trade journal + AI coach. Sibling to InvestIQ's portfolio tracker.
// Holdings = positions you still own (InvestIQ). Trades = positions you
// took and exited (here). Different lens, same auth/Supabase project.
//
// Schema lives in supabase/migrations/014_trader_iq.sql:
//   trades         — every trade (planned/open/closed/cancelled)
//   trade_setups   — user-defined setup tag library
//
// Depends on: 00-config.js, 10-helpers.js (_escape, fmt), 20-state.js,
//             40-auth.js (_supabase, _supaUser), 70-ai.js (callClaude,
//             AGENT_DEFS, formatMarkdown).
// ═══════════════════════════════════════════════════════════════════════

// In-memory caches (refreshed from Supabase on section load)
let _tradesCache = [];
let _tradeSetupsCache = [];

// Default setup library — created on first TraderIQ open if user has none
const _DEFAULT_TRADE_SETUPS = [
  { name: 'Breakout',           description: 'Buying strength on a level break',     color: '#10B981' },
  { name: 'Mean Reversion',     description: 'Fade an overextended move to mean',    color: '#60A5FA' },
  { name: 'News Catalyst',      description: 'Earnings/announcement-driven entry',   color: '#F59E0B' },
  { name: 'Trend Continuation', description: 'Pullback in established uptrend',      color: '#34D399' },
  { name: 'Swing',              description: 'Multi-day-to-week hold on technicals', color: '#A78BFA' },
  { name: 'Position',           description: 'Multi-week-to-month conviction trade', color: '#22D3EE' },
  { name: 'Scalp',              description: 'Intraday quick-in-quick-out',          color: '#FB923C' }
];

async function loadTradesFromCloud() {
  if (!_supabase || !_supaUser) return;
  const { data: trades, error: tErr } = await _supabase
    .from('trades').select('*').order('entry_date', { ascending: false, nullsFirst: false });
  if (!tErr) _tradesCache = trades || [];

  const { data: setups, error: sErr } = await _supabase
    .from('trade_setups').select('*').order('name', { ascending: true });
  if (!sErr) _tradeSetupsCache = setups || [];

  // Seed default setups for first-time users
  if ((setups || []).length === 0) {
    for (const def of _DEFAULT_TRADE_SETUPS) {
      await _supabase.from('trade_setups').insert(def).catch(() => {});
    }
    const { data: refreshed } = await _supabase.from('trade_setups').select('*').order('name');
    _tradeSetupsCache = refreshed || [];
  }
}

// Compute the metrics shown in the TraderIQ KPI strip from a closed-trade list.
function computeTradeMetrics(closedTrades) {
  if (!closedTrades.length) return null;
  const wins  = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losses = closedTrades.filter(t => (t.pnl || 0) < 0);
  const winRate = closedTrades.length ? (wins.length / closedTrades.length) * 100 : 0;
  const totalPnl  = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossWin  = wins.reduce((s, t)   => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));
  const avgWin   = wins.length   ? grossWin  / wins.length   : 0;
  const avgLoss  = losses.length ? grossLoss / losses.length : 0;
  // Expectancy per trade = (winrate × avgWin) − (lossrate × avgLoss)
  const expectancy = (wins.length / closedTrades.length) * avgWin - (losses.length / closedTrades.length) * avgLoss;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  // Average hold (winners vs losers, in hours)
  const holdHours = (t) => t.duration_hours != null ? t.duration_hours :
    (t.entry_date && t.exit_date ? (new Date(t.exit_date) - new Date(t.entry_date)) / 3600000 : null);
  const winHolds  = wins.map(holdHours).filter(h => h != null && h > 0);
  const lossHolds = losses.map(holdHours).filter(h => h != null && h > 0);
  const avgWinHold  = winHolds.length  ? winHolds.reduce((a,b)=>a+b,0)  / winHolds.length  : null;
  const avgLossHold = lossHolds.length ? lossHolds.reduce((a,b)=>a+b,0) / lossHolds.length : null;
  return { count: closedTrades.length, wins: wins.length, losses: losses.length,
    winRate, totalPnl, avgWin, avgLoss, expectancy, profitFactor,
    avgWinHold, avgLossHold };
}

// Format a duration in hours into a compact human string.
function _fmtHours(h) {
  if (h == null) return '–';
  if (h < 24) return Math.round(h) + 'h';
  return (h / 24).toFixed(1) + 'd';
}

// Main render — KPI strip + setup breakdown + trade list. Called when the
// TraderIQ section opens, after any trade save/delete, or on filter change.
function renderTraderIQ() {
  const sym = (typeof CURRENCY_SYMBOLS !== 'undefined' && CURRENCY_SYMBOLS[state.settings?.currency]) || 'NZ$';

  // Filter + sort the trade list per the user's controls
  const statusFilter = document.getElementById('tradeFilterStatus')?.value || 'all';
  const sortMode     = document.getElementById('tradeFilterSort')?.value || 'recent';
  let filtered = (_tradesCache || []).slice();
  if (statusFilter !== 'all') filtered = filtered.filter(t => t.status === statusFilter);
  if (sortMode === 'recent')      filtered.sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0));
  if (sortMode === 'oldest')      filtered.sort((a, b) => new Date(a.entry_date || 0) - new Date(b.entry_date || 0));
  if (sortMode === 'pnl-desc')    filtered.sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  if (sortMode === 'pnl-asc')     filtered.sort((a, b) => (a.pnl || 0) - (b.pnl || 0));

  // KPI strip — only closed trades have meaningful P&L
  const closed = _tradesCache.filter(t => t.status === 'closed');
  const m = computeTradeMetrics(closed);
  const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  if (m && m.count) {
    setT('tradeKpiWinRate', m.winRate.toFixed(0) + '%');
    setT('tradeKpiWinRateSub', `${m.wins}W / ${m.losses}L · ${m.count} closed`);
    const pnlColor = m.totalPnl >= 0 ? 'var(--color-green)' : 'var(--color-red)';
    const pnlEl = document.getElementById('tradeKpiPnl');
    if (pnlEl) { pnlEl.textContent = (m.totalPnl >= 0 ? '+' : '−') + sym + fmt(Math.abs(m.totalPnl)); pnlEl.style.color = pnlColor; }
    setT('tradeKpiPnlSub', `avg ${sym}${fmt(m.totalPnl / m.count)} per trade`);
    const expColor = m.expectancy >= 0 ? 'var(--color-amber)' : 'var(--color-red)';
    const expEl = document.getElementById('tradeKpiExpectancy');
    if (expEl) { expEl.textContent = (m.expectancy >= 0 ? '+' : '−') + sym + fmt(Math.abs(m.expectancy)); expEl.style.color = expColor; }
    const pfEl = document.getElementById('tradeKpiProfitFactor');
    if (pfEl) pfEl.textContent = m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2);
    setT('tradeKpiAvgHold', _fmtHours(m.avgWinHold));
    setT('tradeKpiAvgHoldSub', `winners ${_fmtHours(m.avgWinHold)} · losers ${_fmtHours(m.avgLossHold)}`);
  }

  // Setup performance breakdown — group closed trades by setup label
  renderTradeSetupBreakdown(closed, sym);

  // Trade list
  const wrap = document.getElementById('tradeListWrap');
  if (!wrap) return;
  if (!filtered.length) {
    if (_tradesCache.length) {
      wrap.innerHTML = `<div class="text-center py-8 neutral text-sm">No trades match the current filter.</div>`;
    } // else: keep the empty-state from the HTML markup
    return;
  }
  wrap.innerHTML = filtered.map(t => _renderTradeRow(t, sym)).join('');
}

function renderTradeSetupBreakdown(closed, sym) {
  const wrap = document.getElementById('tradeSetupBreakdown');
  if (!wrap) return;
  if (!closed.length) { wrap.innerHTML = '<div class="text-center py-6 neutral text-sm">Close some trades to see setup performance.</div>'; return; }
  const groups = {};
  closed.forEach(t => {
    const k = t.setup_label || 'Untagged';
    if (!groups[k]) groups[k] = { count: 0, wins: 0, pnl: 0 };
    groups[k].count++;
    if ((t.pnl || 0) > 0) groups[k].wins++;
    groups[k].pnl += (t.pnl || 0);
  });
  const rows = Object.entries(groups).sort((a, b) => b[1].pnl - a[1].pnl);
  if (!rows.length) { wrap.innerHTML = '<div class="text-center py-6 neutral text-sm">No setup data.</div>'; return; }
  wrap.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
    ${rows.map(([name, s]) => {
      const winRate = (s.wins / s.count) * 100;
      const pnlColor = s.pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)';
      return `<div class="card2 p-3" style="border-left:3px solid ${pnlColor};">
        <div class="flex items-center justify-between mb-1">
          <div class="font-semibold text-sm" style="color:var(--text-primary);">${_escape(name)}</div>
          <div class="text-xs neutral">${s.count} trade${s.count === 1 ? '' : 's'}</div>
        </div>
        <div class="flex items-center justify-between">
          <div class="text-xs neutral">${s.wins}W · ${winRate.toFixed(0)}% win</div>
          <div class="font-bold mono" style="color:${pnlColor};">${s.pnl >= 0 ? '+' : '−'}${sym}${fmt(Math.abs(s.pnl))}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function _renderTradeRow(t, sym) {
  const pnl = t.pnl || 0;
  const pnlPct = t.pnl_pct || 0;
  const win = pnl > 0;
  const color = pnl === 0 ? 'var(--text-muted)' : (win ? 'var(--color-green)' : 'var(--color-red)');
  const statusColor = {
    closed: 'var(--text-muted)', open: 'var(--color-amber)',
    planned: 'var(--color-blue)', cancelled: 'var(--text-muted)'
  }[t.status] || 'var(--text-muted)';
  const setupChip = t.setup_label
    ? `<span class="text-xs" style="padding:1px 8px;border-radius:9999px;background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent-soft-2);font-weight:600;font-size:10px;">${_escape(t.setup_label)}</span>`
    : '';
  const sideTag = t.side === 'short'
    ? `<span class="text-xs" style="color:var(--color-red);font-weight:600;">SHORT</span>` : '';
  return `<div onclick="openTradeModal('${t.id}')" style="display:flex;align-items:center;gap:12px;padding:14px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background='var(--bg-panel-2)'" onmouseout="this.style.background='transparent'">
    <div style="width:42px;height:42px;border-radius:10px;background:${color}22;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:${color};flex-shrink:0;">
      ${_escape((t.symbol || '?').slice(0,4))}
    </div>
    <div style="flex:1;min-width:0;">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-semibold text-sm" style="color:var(--text-primary);">${_escape(t.symbol || '?')}</span>
        <span class="text-xs neutral">${_escape(t.name || t.asset_type || '')}</span>
        ${sideTag}
        ${setupChip}
        <span class="text-xs" style="color:${statusColor};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;font-size:9px;">${_escape(t.status || '')}</span>
      </div>
      <div class="text-xs neutral mt-1">
        ${t.entry_date ? new Date(t.entry_date).toLocaleDateString() : '–'}
        ${t.exit_date ? ' → ' + new Date(t.exit_date).toLocaleDateString() : ''}
        ${t.entry_price ? ` · ${sym}${fmt(t.entry_price)}` : ''}
        ${t.exit_price ? ` → ${sym}${fmt(t.exit_price)}` : ''}
        ${t.entry_qty ? ` · ${(+t.entry_qty).toFixed(2)} units` : ''}
      </div>
      ${t.thesis ? `<div class="text-xs mt-1" style="color:var(--text-body);font-style:italic;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">${_escape(t.thesis)}</div>` : ''}
    </div>
    <div class="text-right" style="flex-shrink:0;">
      <div class="font-bold mono" style="color:${color};font-size:14px;">${pnl === 0 ? '–' : (pnl > 0 ? '+' : '−') + sym + fmt(Math.abs(pnl))}</div>
      <div class="text-xs" style="color:${color};">${pnlPct ? ((pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%') : ''}</div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// MODAL HANDLERS
// ─────────────────────────────────────────────────────────────────────────
function openTradeModal(tradeId) {
  const t = tradeId ? _tradesCache.find(x => x.id === tradeId) : null;
  document.getElementById('tradeId').value = t ? t.id : '';
  document.getElementById('tradeModalTitle').textContent = t ? 'Edit Trade' : 'Log a Trade';
  document.getElementById('tradeSubmitLabel').textContent = t ? 'Save changes' : 'Save Trade';
  document.getElementById('tradeDeleteBtn').style.display = t ? 'inline-flex' : 'none';

  // Populate setup dropdown
  const setupSel = document.getElementById('tradeSetup');
  setupSel.innerHTML = '<option value="">— No setup —</option>' +
    _tradeSetupsCache.map(s => `<option value="${_escape(s.id)}" data-label="${_escape(s.name)}">${_escape(s.name)}</option>`).join('');

  const setVal = (id, v) => { document.getElementById(id).value = v == null ? '' : v; };
  setVal('tradeSymbol',     t?.symbol);
  setVal('tradeName',       t?.name);
  setVal('tradeAssetType',  t?.asset_type || 'stock');
  setVal('tradeSide',       t?.side || 'long');
  setVal('tradeStatus',     t?.status || 'closed');
  setVal('tradeSetup',      t?.setup_id);
  setVal('tradeEntryDate',  t?.entry_date ? t.entry_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
  setVal('tradeEntryPrice', t?.entry_price);
  setVal('tradeEntryQty',   t?.entry_qty);
  setVal('tradeEntryCcy',   t?.entry_currency || state.settings?.currency || 'NZD');
  setVal('tradeExitDate',   t?.exit_date ? t.exit_date.slice(0, 10) : '');
  setVal('tradeExitPrice',  t?.exit_price);
  setVal('tradeExitQty',    t?.exit_qty);
  setVal('tradeStop',       t?.stop_price);
  setVal('tradeTarget',     t?.target_price);
  setVal('tradePosSize',    t?.position_size_pct);
  setVal('tradeRR',         t?.risk_reward);
  setVal('tradeThesis',     t?.thesis);
  setVal('tradeLesson',     t?.lesson);
  openModal('tradeModal');
}

async function saveTrade() {
  if (!_supabase || !_supaUser) { if (window.toast) toast.warning('Sign in to save trades'); return; }
  const id           = document.getElementById('tradeId').value || null;
  const symbol       = (document.getElementById('tradeSymbol').value || '').trim().toUpperCase();
  if (!symbol) { if (window.toast) toast.warning('Symbol is required'); return; }
  const name         = (document.getElementById('tradeName').value || '').trim() || null;
  const asset_type   = document.getElementById('tradeAssetType').value;
  const side         = document.getElementById('tradeSide').value;
  const status       = document.getElementById('tradeStatus').value;
  const setupIdRaw   = document.getElementById('tradeSetup').value;
  const setup_id     = setupIdRaw || null;
  const setup_label  = setup_id ? (_tradeSetupsCache.find(s => s.id === setup_id)?.name || null) : null;
  const num = (id) => { const v = document.getElementById(id).value; return v === '' ? null : parseFloat(v); };
  const date = (id) => { const v = document.getElementById(id).value; return v ? new Date(v + 'T00:00:00').toISOString() : null; };
  const entry_date   = date('tradeEntryDate');
  const entry_price  = num('tradeEntryPrice');
  const entry_qty    = num('tradeEntryQty');
  const entry_currency = document.getElementById('tradeEntryCcy').value || null;
  const exit_date    = date('tradeExitDate');
  const exit_price   = num('tradeExitPrice');
  const exit_qty     = num('tradeExitQty');
  const stop_price   = num('tradeStop');
  const target_price = num('tradeTarget');
  const position_size_pct = num('tradePosSize');
  const risk_reward  = num('tradeRR');
  const thesis       = (document.getElementById('tradeThesis').value || '').trim() || null;
  const lesson       = (document.getElementById('tradeLesson').value || '').trim() || null;

  // Compute P&L if we have both legs (in entry currency for now — FX
  // conversion to base currency is a future enhancement).
  let pnl = null, pnl_pct = null, duration_hours = null;
  if (entry_price != null && exit_price != null && entry_qty != null) {
    const qty = exit_qty != null ? exit_qty : entry_qty;
    const sign = side === 'short' ? -1 : 1;
    pnl = sign * (exit_price - entry_price) * qty;
    if (entry_price !== 0) pnl_pct = sign * ((exit_price - entry_price) / entry_price) * 100;
  }
  if (entry_date && exit_date) duration_hours = (new Date(exit_date) - new Date(entry_date)) / 3600000;

  const row = { symbol, name, asset_type, side, status, setup_id, setup_label,
    entry_date, entry_price, entry_qty, entry_currency,
    exit_date, exit_price, exit_qty,
    stop_price, target_price, position_size_pct, risk_reward,
    thesis, lesson, pnl, pnl_pct, duration_hours };

  if (id) {
    const { error } = await _supabase.from('trades').update(row).eq('id', id);
    if (error) { if (window.toast) toast.error('Save failed: ' + error.message); return; }
    if (window.toast) toast.success('Trade updated');
  } else {
    const { error } = await _supabase.from('trades').insert(row);
    if (error) { if (window.toast) toast.error('Save failed: ' + error.message); return; }
    if (window.toast) toast.success('Trade logged');
  }
  try { logActivity(id ? 'trade_updated' : 'trade_logged', { symbol, status, pnl }); } catch(e) {}
  closeModal('tradeModal');
  await loadTradesFromCloud();
  renderTraderIQ();
}

async function deleteTradeFromModal() {
  const id = document.getElementById('tradeId').value;
  if (!id) return;
  const ok = await showConfirm({
    title: 'Delete this trade?',
    message: 'This is permanent and removes the trade from your journal + all coach analysis.',
    confirmLabel: 'Delete', cancelLabel: 'Keep', variant: 'danger'
  });
  if (!ok) return;
  const { error } = await _supabase.from('trades').delete().eq('id', id);
  if (error) { if (window.toast) toast.error('Delete failed: ' + error.message); return; }
  closeModal('tradeModal');
  if (window.toast) toast.success('Trade deleted');
  await loadTradesFromCloud();
  renderTraderIQ();
}

// ─────────────────────────────────────────────────────────────────────────
// AI COACH — single Sonnet/Haiku call across the trade journal
// ─────────────────────────────────────────────────────────────────────────
function openTradeCoachModal() { openModal('tradeCoachModal'); }

async function runTradeCoach() {
  const btn = document.getElementById('tradeCoachRunBtn');
  const out = document.getElementById('tradeCoachOutput');
  const closed = _tradesCache.filter(t => t.status === 'closed');
  if (closed.length < 3) {
    out.innerHTML = `<div class="text-center py-4 neutral text-sm">Log at least 3 closed trades before running the coach. You have ${closed.length} so far.</div>`;
    return;
  }
  btn.disabled = true; btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;margin-right:8px;display:inline-block;"></div>Analysing...';
  out.innerHTML = `<div class="text-center py-6 neutral text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Crunching ${closed.length} closed trades…</div>`;
  try {
    // Inject the coach prompt def if not already present
    if (typeof AGENT_DEFS !== 'undefined' && !AGENT_DEFS.tradeCoach) {
      AGENT_DEFS.tradeCoach = {
        label: 'TraderIQ Coach', model: 'claude-haiku-4-5',
        modelOpenAI: 'local-model', maxTokens: 1400,
        system: `You are a candid, expert trading coach analysing a user's CLOSED trade journal. Your job is to surface non-obvious patterns and blind spots — not generic advice. Output sections:

1. **Pattern observations** — 3-4 specific patterns in their results. Reference exact setups, win rates, or symbols. Examples: "Your Breakout setup has 71% win rate but you only took 7 — scale this up." or "News-catalyst trades hold a 38% win rate; consider tighter stops."

2. **Behavioural flags** — anything that looks like a bias or mistake. Examples: cutting winners early, holding losers too long, revenge-trading after a loss, over-trading a single ticker.

3. **30-day focus** — ONE specific change the trader should make this month, with a measurable outcome.

Be specific. Reference actual numbers from their journal. NZ-based investor. Under 320 words.`
      };
    }
    const m = computeTradeMetrics(closed);
    const summary = {
      trades: closed.length, wins: m.wins, losses: m.losses,
      winRate: m.winRate.toFixed(1) + '%',
      totalPnl: m.totalPnl.toFixed(2),
      avgWin: m.avgWin.toFixed(2), avgLoss: m.avgLoss.toFixed(2),
      expectancy: m.expectancy.toFixed(2), profitFactor: m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2),
      avgWinHoldHours: m.avgWinHold ? m.avgWinHold.toFixed(1) : null,
      avgLossHoldHours: m.avgLossHold ? m.avgLossHold.toFixed(1) : null
    };
    // Per-setup stats
    const setupStats = {};
    closed.forEach(t => {
      const k = t.setup_label || 'Untagged';
      if (!setupStats[k]) setupStats[k] = { count: 0, wins: 0, pnl: 0 };
      setupStats[k].count++; if ((t.pnl || 0) > 0) setupStats[k].wins++; setupStats[k].pnl += (t.pnl || 0);
    });
    // Slim the trade list for the prompt (keep last 40 — context cost)
    const recent = closed.slice(0, 40).map(t => ({
      sym: t.symbol, setup: t.setup_label, side: t.side, status: t.status,
      entry: t.entry_date?.slice(0,10), exit: t.exit_date?.slice(0,10),
      pnl: t.pnl?.toFixed(2), pnlPct: t.pnl_pct?.toFixed(2),
      thesis: t.thesis?.slice(0, 140), lesson: t.lesson?.slice(0, 140)
    }));
    const prompt = `Aggregate stats:\n${JSON.stringify(summary, null, 2)}\n\nSetup performance:\n${JSON.stringify(setupStats, null, 2)}\n\nRecent trades (most recent first):\n${JSON.stringify(recent, null, 2)}`;
    const result = await callClaude('tradeCoach', prompt);
    out.innerHTML = `<div class="prose-sm" style="color:var(--text-body);line-height:1.7;font-size:13px;">${formatMarkdown(result)}</div>`;
    state._lastTradeCoachAt = new Date().toISOString();
    state._lastTradeCoachOutput = result;
    try { saveState(); } catch(e) {}
    try { logActivity('trade_coach_run', { trades: closed.length }); } catch(e) {}
  } catch(e) {
    out.innerHTML = `<div class="text-center py-4" style="color:var(--color-red);">Coach failed: ${_escape(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-redo mr-1"></i>Re-analyse';
  }
}
