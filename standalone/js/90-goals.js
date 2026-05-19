// ═══════════════════════════════════════════════════════════════════════
// 90-goals.js — Goals & Targets (v0.15)
//
// Lets users set portfolio milestones like '$100k by 2030' and see
// whether they're on track. Math:
//   current = portfolio value matching the goal's scope
//   future  = current × (1+r)^years + monthly × ((1+r/12)^months − 1) ÷ (r/12)
//   on_track = future >= target
//
// Schema: supabase/migrations/015_goals.sql
// Depends on: state, _supabase, _supaUser, getMetrics, CURRENCY_SYMBOLS,
//             fmt, _escape, openModal, closeModal, showConfirm, toast.
// ═══════════════════════════════════════════════════════════════════════

let _goalsCache = [];
let _goalsMigrationMissing = false;

function _isGoalMissingTableError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('relation') || err.code === '42P01';
}

async function loadGoalsFromCloud() {
  if (!_supabase || !_supaUser) return;
  try {
    const { data, error } = await _supabase
      .from('investment_goals').select('*')
      .eq('archived', false)
      .order('target_date', { ascending: true });
    if (error) {
      if (_isGoalMissingTableError(error)) { _goalsMigrationMissing = true; _goalsCache = []; return; }
      console.warn('[goals] load failed:', error.message); return;
    }
    _goalsCache = data || [];
    _goalsMigrationMissing = false;
  } catch(e) { console.warn('[goals] unexpected:', e); }
}

// Compute the current value of holdings matching a goal's scope.
function _goalCurrentValue(goal) {
  const metrics = (typeof getMetrics === 'function') ? getMetrics() : null;
  if (!metrics) return 0;
  if (goal.scope === 'portfolio') return Number(metrics.totalValue) || 0;
  if (goal.scope === 'symbol') {
    const h = metrics.holdings.find(x => (x.symbol || '').toUpperCase() === (goal.scope_value || '').toUpperCase());
    return h ? Number(h.currentValue) || 0 : 0;
  }
  if (goal.scope === 'category') {
    const target = (goal.scope_value || '').toLowerCase();
    return metrics.holdings
      .filter(h => (h.type || '').toLowerCase() === target)
      .reduce((s, h) => s + (Number(h.currentValue) || 0), 0);
  }
  return 0;
}

// Project the future value given current + monthly contribution + return rate.
// Uses standard compound + annuity formulas. Returns projected value at target date.
function _goalProjectFuture(current, monthly, annualReturnPct, years) {
  if (years <= 0) return current + (monthly * Math.max(years * 12, 0));
  const r = (annualReturnPct || 0) / 100;
  const mr = r / 12;
  const months = years * 12;
  const fvCurrent = current * Math.pow(1 + r, years);
  const fvContributions = mr > 0
    ? monthly * ((Math.pow(1 + mr, months) - 1) / mr)
    : monthly * months;
  return fvCurrent + fvContributions;
}

// Render the Goals section — a grid of goal cards with progress + projection.
function renderGoalsSection() {
  const grid = document.getElementById('goalsGrid');
  if (!grid) return;

  if (_goalsMigrationMissing) {
    grid.innerHTML = `<div class="card2 p-5" style="border-left:3px solid var(--color-amber);grid-column:span 2;">
      <div class="flex items-start gap-3">
        <i class="fas fa-database" style="color:var(--color-amber);font-size:24px;margin-top:2px;"></i>
        <div style="flex:1;">
          <div class="font-semibold text-base mb-2">One setup step needed</div>
          <div class="text-sm" style="color:var(--text-body);line-height:1.55;margin-bottom:10px;">
            Goals & Targets needs a new <code>investment_goals</code> table. The rest of InvestIQ keeps working.
          </div>
          <div class="text-sm" style="color:var(--text-body);">
            <b>To activate:</b><br>
            1. Open your Supabase dashboard → SQL Editor.<br>
            2. Paste the contents of <code>supabase/migrations/015_goals.sql</code>.<br>
            3. Click <b>Run</b>, then refresh this page.
          </div>
        </div>
      </div>
    </div>`;
    return;
  }

  if (!_goalsCache.length) {
    // Empty state stays as the initial markup, but we paint it via JS so
    // it can't get stuck after a goal-then-delete-all cycle.
    grid.innerHTML = `<div class="card p-8 text-center" style="grid-column:span 2;">
      <i class="fas fa-bullseye text-4xl mb-3 block" style="color:var(--accent);opacity:0.35;"></i>
      <div class="text-lg font-semibold mb-1">No goals set yet</div>
      <div class="text-sm neutral mb-4 max-w-md mx-auto">Goals turn "I should save more" into a number on a calendar. Set one, and you'll see whether you're on track every time you open the app.</div>
      <button onclick="openGoalModal()" class="btn btn-primary"><i class="fas fa-plus mr-1"></i>Set your first goal</button>
    </div>`;
    return;
  }

  grid.innerHTML = _goalsCache.map(_renderGoalCard).join('');
}

function _renderGoalCard(g) {
  const sym = CURRENCY_SYMBOLS[g.currency] || 'NZ$';
  const current = _goalCurrentValue(g);
  const target = Number(g.target_amount) || 0;
  const today = new Date();
  const tgt = new Date(g.target_date);
  const msToTarget = tgt - today;
  const days = Math.max(0, Math.ceil(msToTarget / 86400000));
  const years = msToTarget / (365.25 * 86400000);
  const monthly = Number(g.monthly_contribution) || 0;
  const expRet = Number(g.expected_return_pct) || 0;

  const startingAmount = Number(g.starting_amount) || current;
  const projected = _goalProjectFuture(current, monthly, expRet, Math.max(years, 0));
  const onTrack = projected >= target;
  // Progress = how close current value is to target (independent of projection)
  const progress = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
  // Projection-meets-target % (what fraction of target the projection hits)
  const projectionPct = target > 0 ? Math.min(200, (projected / target) * 100) : 0;

  const statusColor  = onTrack ? 'var(--color-green)' : 'var(--color-amber)';
  const statusLabel  = onTrack ? 'On Track' : 'Off Track';
  const statusIcon   = onTrack ? 'fa-circle-check' : 'fa-triangle-exclamation';

  // Suggested catch-up monthly to hit target if off-track
  let catchUpMonthly = null;
  if (!onTrack && years > 0 && expRet > 0) {
    const r = expRet / 100;
    const mr = r / 12;
    const months = years * 12;
    const fvCurrent = current * Math.pow(1 + r, years);
    const need = target - fvCurrent;
    if (need > 0 && mr > 0) {
      catchUpMonthly = need / ((Math.pow(1 + mr, months) - 1) / mr);
    }
  }

  const scopeLabel =
    g.scope === 'portfolio' ? 'Whole portfolio' :
    g.scope === 'category'  ? `Asset: ${_escape(g.scope_value || '?')}` :
    g.scope === 'symbol'    ? `Ticker: ${_escape(g.scope_value || '?')}` : '';

  const icon = g.icon || '🎯';

  return `<div class="card p-5" style="border-left:3px solid ${statusColor};position:relative;">
    <div class="flex items-start justify-between mb-3 gap-3">
      <div style="min-width:0;flex:1;">
        <div class="flex items-center gap-2 flex-wrap mb-1">
          <span style="font-size:20px;">${_escape(icon)}</span>
          <span class="font-bold text-base" style="color:var(--text-primary);">${_escape(g.name)}</span>
          <span class="text-xs" style="padding:2px 8px;border-radius:9999px;background:${statusColor}1f;color:${statusColor};font-weight:700;text-transform:uppercase;letter-spacing:0.4px;font-size:9px;"><i class="fas ${statusIcon} mr-1" style="font-size:8px;"></i>${statusLabel}</span>
        </div>
        <div class="text-xs neutral">${scopeLabel} · target ${sym}${fmt(target)} by ${_escape(g.target_date)}</div>
      </div>
      <button onclick="event.stopPropagation();openGoalModal('${g.id}')" class="btn btn-sm btn-secondary" style="font-size:10px;padding:3px 9px;" title="Edit"><i class="fas fa-pen"></i></button>
    </div>

    <!-- Current vs target progress bar -->
    <div class="mb-3">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs neutral">Current</span>
        <span class="text-xs" style="color:var(--text-primary);font-weight:600;">${sym}${fmt(current)} <span class="neutral" style="font-weight:400;">/ ${sym}${fmt(target)}</span></span>
      </div>
      <div style="height:8px;background:var(--bg-deep);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${progress}%;background:${statusColor};border-radius:4px;transition:width 0.5s ease;"></div>
      </div>
      <div class="text-xs neutral mt-1">${progress.toFixed(1)}% of target · ${days.toLocaleString()} day${days === 1 ? '' : 's'} to go</div>
    </div>

    <!-- Projection summary -->
    <div class="card2 p-3" style="border-left:2px solid ${statusColor};">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs uppercase neutral font-semibold" style="letter-spacing:0.4px;">Projection at ${expRet.toFixed(1)}% p.a.</span>
        <span class="text-xs" style="color:${statusColor};font-weight:700;">${sym}${fmt(projected)}</span>
      </div>
      <div class="text-xs neutral">
        Hits <b style="color:${statusColor};">${projectionPct.toFixed(0)}%</b> of target.
        ${monthly > 0 ? `Assumes ${sym}${fmt(monthly)}/mo contributions.` : 'No monthly contributions modelled.'}
        ${catchUpMonthly != null && catchUpMonthly > 0 ? ` <br><b style="color:var(--color-amber);">To catch up:</b> add ${sym}${fmt(catchUpMonthly)}/mo from today.` : ''}
      </div>
    </div>
  </div>`;
}

// MODAL HANDLERS
function openGoalModal(goalId) {
  const g = goalId ? _goalsCache.find(x => x.id === goalId) : null;
  document.getElementById('goalId').value = g ? g.id : '';
  document.getElementById('goalModalTitle').textContent = g ? 'Edit Goal' : 'New Goal';
  document.getElementById('goalSubmitLabel').textContent = g ? 'Save changes' : 'Save Goal';
  document.getElementById('goalDeleteBtn').style.display = g ? 'inline-flex' : 'none';
  const setVal = (id, v) => { document.getElementById(id).value = v == null ? '' : v; };
  setVal('goalName',       g?.name);
  setVal('goalTarget',     g?.target_amount);
  setVal('goalDate',       g?.target_date || _defaultGoalDate());
  setVal('goalCurrency',   g?.currency || state.settings?.currency || 'NZD');
  setVal('goalIcon',       g?.icon || '🎯');
  setVal('goalScope',      g?.scope || 'portfolio');
  setVal('goalScopeValue', g?.scope_value);
  setVal('goalStart',      g?.starting_amount);
  setVal('goalMonthly',    g?.monthly_contribution);
  setVal('goalReturn',     g?.expected_return_pct != null ? g.expected_return_pct : 7.0);
  // Toggle scope-value visibility
  document.getElementById('goalScopeValueWrap').style.display = (g?.scope || 'portfolio') === 'portfolio' ? 'none' : '';
  openModal('goalModal');
}

function _defaultGoalDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  return d.toISOString().slice(0, 10);
}

async function saveGoal() {
  if (!_supabase || !_supaUser) { if (window.toast) toast.warning('Sign in to save goals'); return; }
  if (_goalsMigrationMissing) { if (window.toast) toast.warning('Run migration 015 first.'); closeModal('goalModal'); return; }
  const id = document.getElementById('goalId').value || null;
  const num = (id2) => { const v = document.getElementById(id2).value; return v === '' ? null : parseFloat(v); };
  const row = {
    name: (document.getElementById('goalName').value || '').trim(),
    target_amount: num('goalTarget'),
    target_date: document.getElementById('goalDate').value,
    currency: document.getElementById('goalCurrency').value || 'NZD',
    scope: document.getElementById('goalScope').value || 'portfolio',
    scope_value: (document.getElementById('goalScopeValue').value || '').trim() || null,
    starting_amount: num('goalStart'),
    monthly_contribution: num('goalMonthly'),
    expected_return_pct: num('goalReturn'),
    icon: (document.getElementById('goalIcon').value || '🎯').trim() || '🎯'
  };
  if (!row.name || !row.target_amount || !row.target_date) { if (window.toast) toast.warning('Name, target amount, and date are required'); return; }
  if (id) {
    const { error } = await _supabase.from('investment_goals').update(row).eq('id', id);
    if (error) { if (window.toast) toast.error('Save failed: ' + error.message); return; }
    if (window.toast) toast.success('Goal updated');
  } else {
    const { error } = await _supabase.from('investment_goals').insert(row);
    if (error) { if (window.toast) toast.error('Save failed: ' + error.message); return; }
    if (window.toast) toast.success('Goal saved');
  }
  try { logActivity(id ? 'goal_updated' : 'goal_created', { name: row.name, target: row.target_amount }); } catch(e) {}
  closeModal('goalModal');
  await loadGoalsFromCloud();
  renderGoalsSection();
}

async function deleteGoalFromModal() {
  const id = document.getElementById('goalId').value;
  if (!id) return;
  const ok = await showConfirm({
    title: 'Delete this goal?',
    message: 'This is permanent. Progress data is not recoverable.',
    confirmLabel: 'Delete', cancelLabel: 'Keep', variant: 'danger'
  });
  if (!ok) return;
  await _supabase.from('investment_goals').delete().eq('id', id);
  closeModal('goalModal');
  if (window.toast) toast.success('Goal deleted');
  await loadGoalsFromCloud();
  renderGoalsSection();
}
