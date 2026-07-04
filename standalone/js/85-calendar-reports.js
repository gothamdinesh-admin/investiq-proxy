// ═══════════════════════════════════════════════════════════════════════
// 85-calendar-reports.js — Calendar + Reports + PWA install prompt (v0.17)
//
// Three small features that round out the app's "feels finished" feel:
//   1. Calendar section — derived events from holdings + dividends + NZ tax
//   2. Reports section — printable / PDF-exportable portfolio summary
//   3. PWA install prompt — banner on iOS/Android prompting Add-to-Home
//
// Depends on: state, getMetrics, CURRENCY_SYMBOLS, fmt, _escape, _supabase.
// ═══════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// CALENDAR
//
// Builds an event timeline from three sources:
//   - Dividend ledger (`dividends` table) — paid + expected based on
//     historical frequency
//   - Earnings dates (heuristic from ticker — most US stocks report
//     in late Jan / Apr / Jul / Oct; rough monthly bucketing for the demo)
//   - NZ tax cycle (FIF year end 31 March, IR3 due 7 July)
// ─────────────────────────────────────────────────────────────────────────

const NZ_TAX_EVENTS = [
  { date: '03-31', kind: 'tax',  title: 'NZ FIF tax year end',           note: 'End of NZ income year for FIF reporting' },
  { date: '07-07', kind: 'tax',  title: 'IR3 individual return due',     note: 'Standard due date (later if extension)' },
  { date: '04-07', kind: 'tax',  title: 'Provisional tax instalment 3',  note: 'Final instalment for previous year' },
  { date: '08-28', kind: 'tax',  title: 'Provisional tax instalment 1',  note: 'For current year' },
  { date: '01-15', kind: 'tax',  title: 'Provisional tax instalment 2',  note: 'Mid-year instalment' }
];

// Build the list of calendar events for the active range.
async function buildCalendarEvents() {
  const events = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();

  // 1. NZ Tax events — current year + next year so 'upcoming 90d' always
  //    has Mar-end visible from early-year sessions.
  [year, year + 1].forEach(y => {
    NZ_TAX_EVENTS.forEach(e => {
      events.push({
        date: new Date(`${y}-${e.date}`),
        kind: e.kind, title: e.title, note: e.note, icon: 'fa-receipt',
        color: 'var(--color-green)', symbol: 'NZ Tax'
      });
    });
  });

  // 2. Dividend events from the existing ledger.
  //    Past payments are listed; future expected ones derived from the
  //    most-recent frequency per holding.
  try {
    if (_supabase && _supaUser) {
      const { data: divs } = await _supabase.from('dividends')
        .select('symbol, pay_date, gross_amount, currency, div_type')
        .order('pay_date', { ascending: false }).limit(200);
      (divs || []).forEach(d => {
        events.push({
          date: new Date(d.pay_date + 'T00:00:00'),
          kind: 'dividend',
          title: `${d.symbol} dividend pay date`,
          note: `${d.div_type || 'cash'} · ${(CURRENCY_SYMBOLS[d.currency] || d.currency + ' ')}${fmt(d.gross_amount)} gross`,
          symbol: d.symbol, icon: 'fa-coins', color: 'var(--color-amber)'
        });
      });
      // Project next-dividend dates: for each symbol with ≥2 historical
      // payments, project the next one based on the gap between the most-
      // recent two.
      const bySymbol = {};
      (divs || []).forEach(d => {
        if (!bySymbol[d.symbol]) bySymbol[d.symbol] = [];
        bySymbol[d.symbol].push(new Date(d.pay_date));
      });
      Object.entries(bySymbol).forEach(([sym, dates]) => {
        if (dates.length < 2) return;
        const sorted = dates.sort((a, b) => b - a); // newest first
        const gap = sorted[0] - sorted[1]; // ms between two most-recent
        if (gap <= 0) return;
        const projected = new Date(sorted[0].getTime() + gap);
        if (projected > today) {
          events.push({
            date: projected, kind: 'dividend-projected',
            title: `${sym} next dividend (projected)`,
            note: `Based on prior ${Math.round(gap / 86400000)}-day cadence`,
            symbol: sym, icon: 'fa-coins', color: 'var(--color-amber)', projected: true
          });
        }
      });
    }
  } catch(e) { console.warn('[calendar] dividend load:', e); }

  // 3. Earnings dates (heuristic). Real-time earnings calendars need a
  //    paid API. For NOW: roughly project quarterly earnings for any US
  //    stock holding using the standard Jan/Apr/Jul/Oct window.
  const holdings = (state.portfolio || []).filter(h => (h.type === 'stock' || h.type === 'etf') && !h.ignored);
  const earningsMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
  const uniqueSymbols = [...new Set(holdings.map(h => (h.symbol || '').toUpperCase()))];
  uniqueSymbols.forEach(sym => {
    // Only US-listed (no suffix) for the heuristic — others vary widely
    if (sym.includes('.') || sym.includes('-')) return;
    earningsMonths.forEach(month => {
      [year, year + 1].forEach(y => {
        // Mid-month placeholder
        const d = new Date(y, month, 15);
        if (d < today) return;
        events.push({
          date: d, kind: 'earnings',
          title: `${sym} earnings (est.)`,
          note: 'Quarterly earnings window — confirm exact date with the company',
          symbol: sym, icon: 'fa-chart-line', color: 'var(--color-blue)', projected: true
        });
      });
    });
  });

  return events.sort((a, b) => a.date - b.date);
}

async function renderCalendarSection() {
  const wrap = document.getElementById('calendarTimeline');
  if (!wrap) return;
  wrap.innerHTML = '<div class="text-center py-10 neutral text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Loading events…</div>';

  const range = document.getElementById('calendarRange')?.value || 'upcoming';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const events = await buildCalendarEvents();

  // Filter by range
  let filtered = events;
  if (range === 'upcoming')    filtered = events.filter(e => e.date >= today && (e.date - today) <= 30 * 86400000);
  if (range === 'upcoming90')  filtered = events.filter(e => e.date >= today && (e.date - today) <= 90 * 86400000);
  if (range === 'past')        filtered = events.filter(e => e.date < today && (today - e.date) <= 30 * 86400000);
  // 'all' = no filter

  // KPI tiles
  const inWindow = events.filter(e => e.date >= today && (e.date - today) <= 30 * 86400000);
  const inWeek   = events.filter(e => e.date >= today && (e.date - today) <= 7  * 86400000);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('calKpiDividends', inWindow.filter(e => e.kind.startsWith('dividend')).length);
  set('calKpiEarnings',  inWindow.filter(e => e.kind === 'earnings').length);
  set('calKpiTax',       inWindow.filter(e => e.kind === 'tax').length);
  set('calKpiThisWeek',  inWeek.length);

  if (!filtered.length) {
    wrap.innerHTML = `<div class="text-center py-10 neutral text-sm">
      <i class="fas fa-calendar-check text-3xl mb-3 block" style="color:var(--color-teal);opacity:0.4;"></i>
      <div class="text-sm">No events in the selected range.</div>
      <div class="text-xs neutral mt-2">Try expanding the range or adding more holdings + dividends.</div>
    </div>`;
    return;
  }

  // Group events by date
  const byDate = {};
  filtered.forEach(e => {
    const key = e.date.toISOString().slice(0, 10);
    (byDate[key] = byDate[key] || []).push(e);
  });
  const dateKeys = Object.keys(byDate).sort();

  wrap.innerHTML = dateKeys.map(key => {
    const dayEvents = byDate[key];
    const d = new Date(key + 'T00:00:00');
    const isToday = d.getTime() === today.getTime();
    const daysAway = Math.round((d - today) / 86400000);
    const relLabel =
      isToday ? 'Today' :
      daysAway === 1 ? 'Tomorrow' :
      daysAway === -1 ? 'Yesterday' :
      daysAway > 0 ? `in ${daysAway} day${daysAway === 1 ? '' : 's'}` :
      `${Math.abs(daysAway)} day${Math.abs(daysAway) === 1 ? '' : 's'} ago`;
    const dateStr = d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
    return `<div class="mb-4">
      <div class="flex items-baseline gap-3 mb-2">
        <div class="font-semibold text-sm" style="color:var(--text-primary);">${_escape(dateStr)}</div>
        <div class="text-xs" style="color:${isToday ? 'var(--accent)' : 'var(--text-muted)'};font-weight:${isToday ? 700 : 400};">${_escape(relLabel)}</div>
      </div>
      <div class="space-y-2">
        ${dayEvents.map(e => `<div class="card2 p-3" style="border-left:3px solid ${e.color};${e.projected ? 'opacity:0.85;' : ''}">
          <div class="flex items-start gap-2">
            <i class="fas ${e.icon}" style="color:${e.color};font-size:14px;margin-top:2px;"></i>
            <div style="flex:1;min-width:0;">
              <div class="text-sm" style="color:var(--text-primary);font-weight:600;">${_escape(e.title)}${e.projected ? ` <span class="text-xs neutral" style="font-weight:400;font-style:italic;">· projected</span>` : ''}</div>
              ${e.note ? `<div class="text-xs neutral mt-1">${_escape(e.note)}</div>` : ''}
            </div>
            <span class="text-xs" style="padding:2px 8px;border-radius:9999px;background:${e.color}1f;color:${e.color};font-weight:600;text-transform:uppercase;letter-spacing:0.4px;font-size:9px;white-space:nowrap;">${e.kind === 'dividend-projected' ? 'dividend' : e.kind}</span>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────
// REPORTS — printable HTML preview + browser-print PDF export
// Uses window.print() with print-stylesheets — no third-party PDF library
// needed, keeps the bundle lean. Browser's "Save as PDF" creates the file.
// ─────────────────────────────────────────────────────────────────────────

// ── Official Harbour report PDFs (Supabase Storage bucket: fund-reports) ─
// ONE flat library: admins dump every monthly PDF (named by fund CODE, e.g.
// Reporting_HARAEQ_Apr26.pdf) into the bucket root. Each user sees the reports
// whose filename contains a fund CODE they hold — matched via the imported
// unit-price feed (which maps fund name → code). Approved users read via
// short-lived signed URLs; admins upload/delete. Requires migration 020.

// Fund code(s) for the active book, resolved from the unit-price feed store
// (keyed by code, carrying the normalised fund name). A name like "Australasian
// Equity Fund" may map to both retail + wholesale codes — return all.
function _activeFundCodes() {
  const fund = (typeof _activeFund === 'function') ? _activeFund() : null;
  const name = (fund && fund.name) || (typeof getActivePortfolio === 'function' ? getActivePortfolio().name : '');
  if (!name || typeof _normFundName !== 'function') return [];
  const want = _normFundName(name);
  const codes = [];
  if (fund && fund.code) codes.push(String(fund.code).toUpperCase());
  try {
    const feed = (typeof _loadFundFeed === 'function') ? _loadFundFeed() : {};
    Object.keys(feed).forEach(code => { if (feed[code] && feed[code].norm === want) codes.push(code.toUpperCase()); });
  } catch(e) {}
  return [...new Set(codes)];
}

// Does a filename belong to one of these fund codes? Exact-token match so
// HARAEQ doesn't match a HARAER file.
function _reportMatchesCodes(filename, codes) {
  const up = String(filename || '').toUpperCase();
  return codes.some(c => new RegExp('(^|[^A-Z0-9])' + c.replace(/[^A-Z0-9]/g, '') + '([^A-Z0-9]|$)').test(up));
}

async function renderOfficialReports() {
  const card = document.getElementById('officialReportsCard');
  if (!card) return;
  const isFund = (typeof _isFundWeightView === 'function') && _isFundWeightView();
  if (!isFund || typeof _supabase === 'undefined' || !_supabase || !_supaUser) { card.style.display = 'none'; return; }
  card.style.display = '';
  const isAdmin = (typeof _isAdmin !== 'undefined' && _isAdmin);
  const up = document.getElementById('officialReportsUpload');
  if (up) up.style.display = isAdmin ? '' : 'none';
  const list = document.getElementById('officialReportsList');
  const codes = _activeFundCodes();
  try {
    // Flat library — list the bucket root.
    const { data, error } = await _supabase.storage.from('fund-reports')
      .list('', { limit: 500, sortBy: { column: 'name', order: 'desc' } });
    if (error) throw error;
    const all = (data || []).filter(f => f.name && /\.pdf$/i.test(f.name));
    // Match by fund code. Admin with no code match still sees all (to manage the library).
    let files = codes.length ? all.filter(f => _reportMatchesCodes(f.name, codes)) : [];
    const showingAll = isAdmin && !files.length && all.length;
    if (showingAll) files = all;

    if (!codes.length && !isAdmin) {
      list.innerHTML = `<div class="text-xs neutral py-2">Reports are matched by fund code — import this fund's unit-price feed and they'll appear here.</div>`;
      return;
    }
    if (!files.length) {
      list.innerHTML = `<div class="text-xs neutral py-2">${all.length ? 'No reports match this fund' + (codes.length ? ` (code ${codes.join(', ')})` : '') + ' yet.' : 'No reports in the library yet.'}${isAdmin ? ' Use <b>Upload PDFs</b> to add the monthly documents — name them by fund code (e.g. Reporting_HARAEQ_Apr26.pdf).' : ''}</div>`;
      return;
    }
    const codeNote = codes.length ? `<div class="text-xs neutral mb-2">Showing reports for <b>${_escape(codes.join(', '))}</b>${isAdmin ? ` · ${all.length} in library` : ''}.</div>`
      : (isAdmin ? `<div class="text-xs neutral mb-2" style="color:var(--color-amber);">No fund code resolved for this book — showing the whole library (${all.length}). Import the unit-price feed to auto-match.</div>` : '');
    list.innerHTML = codeNote + files.map(f => `
      <div class="flex items-center justify-between gap-3" style="padding:9px 4px;border-bottom:1px solid var(--border);">
        <div class="flex items-center gap-3" style="min-width:0;">
          <i class="fas fa-file-pdf" style="color:var(--color-red);font-size:16px;"></i>
          <div style="min-width:0;overflow:hidden;">
            <div class="text-sm font-semibold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escape(f.name)}</div>
            <div class="text-xs neutral">${f.metadata && f.metadata.size ? (f.metadata.size / 1024 / 1024).toFixed(1) + ' MB · ' : ''}${f.created_at ? new Date(f.created_at).toLocaleDateString('en-NZ') : ''}</div>
          </div>
        </div>
        <div class="flex items-center gap-2" style="flex-shrink:0;">
          <button onclick="openOfficialReport('${_escape(f.name)}')" class="btn btn-sm btn-primary" style="font-size:11px;padding:4px 12px;"><i class="fas fa-arrow-up-right-from-square mr-1"></i>Open</button>
          ${isAdmin ? `<button onclick="deleteOfficialReport('${_escape(f.name)}')" class="btn btn-sm btn-danger" style="font-size:11px;padding:4px 8px;" title="Delete (admin)"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>`).join('');
  } catch(e) {
    const missing = /not found|bucket/i.test(e.message || '');
    list.innerHTML = `<div class="text-xs neutral py-2">${missing ? 'Storage bucket not set up yet — run migration <b>020_fund_reports_storage.sql</b> in the Harbour project.' : 'Couldn\'t load reports: ' + _escape(e.message || String(e))}</div>`;
  }
}

async function openOfficialReport(path) {
  try {
    const { data, error } = await _supabase.storage.from('fund-reports').createSignedUrl(path, 3600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch(e) { toast.error('Couldn\'t open report: ' + (e.message || e)); }
}

async function uploadOfficialReports(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;
  // Flat shared library — dump every PDF to the bucket root under its own
  // filename (which carries the fund code). Holders auto-match by code.
  let ok = 0, failed = [];
  toast.info(`Uploading ${files.length} report(s) to the shared library…`);
  for (const f of files) {
    try {
      const safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_');   // keep the code + date, sanitise the rest
      const { error } = await _supabase.storage.from('fund-reports')
        .upload(safe, f, { upsert: true, contentType: 'application/pdf' });
      if (error) throw error;
      ok++;
    } catch(e) { failed.push(`${f.name}: ${e.message || e}`); }
  }
  if (ok) toast.success(`${ok} report(s) added to the library — each shows to holders of the matching fund code.`);
  if (failed.length) toast.error({ title: `${failed.length} failed`, message: failed.slice(0, 2).join('\n') });
  logActivity('official_report_upload', { ok, failed: failed.length });
  renderOfficialReports();
}

async function deleteOfficialReport(path) {
  const sure = await showFormModal({ title: 'Delete report?', icon: 'fa-trash', iconColor: 'var(--color-red)',
    description: `Delete <b>${_escape(path.split('/').pop())}</b> from storage? This can't be undone.`,
    submitLabel: 'Delete', submitVariant: 'danger' });
  if (!sure) return;
  try {
    const { error } = await _supabase.storage.from('fund-reports').remove([path]);
    if (error) throw error;
    toast.success('Report deleted.');
    logActivity('official_report_delete', { path });
    renderOfficialReports();
  } catch(e) { toast.error('Delete failed: ' + (e.message || e)); }
}

// ── Harbour Fund Report (weight-based fund books) ────────────────────────
// Modelled on Harbour's official monthly fund report PDF (Reporting_*.pdf):
// headline stat strip → top-10 holdings → investment mix → monthly returns →
// fund profile / risk indicator → footer. Built entirely from connected data:
// Disclose weights + feed (NAV/unit/returns) + Disclose meta (monthly/profile).
function _harbourFundReportHtml(metrics, asOf) {
  const esc = _escape, HB = '#005A79', SLATE = '#44546A';
  const fund = (typeof _activeFund === 'function') ? _activeFund() : null;
  const fundName = (fund && fund.name) || (typeof getActivePortfolio === 'function' ? getActivePortfolio().name : 'Fund');
  const fd = (typeof getFundMarketData === 'function') ? getFundMarketData(fundName) : null;
  const dm = (typeof getFundDiscloseMeta === 'function') ? getFundDiscloseMeta(fundName) : null;
  const det = (dm && dm.details) || {};
  const generated = new Date().toLocaleString('en-NZ');
  const tv = metrics.totalValue || 1;
  const real = metrics.holdings.filter(h => !_isSyntheticFundRow(h));
  const top10 = [...real].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0)).slice(0, 10);

  const pct = (v, signed) => v == null ? '—' : `${signed && v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const statCell = (label, value, sub) => `
    <div style="padding:12px;border-left:3px solid ${HB};background:#F1F5F9;border-radius:4px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;font-weight:600;">${label}</div>
      <div style="font-size:20px;font-weight:700;color:#0B1220;margin-top:4px;">${value}</div>
      <div style="font-size:10px;color:#64748B;margin-top:2px;">${sub || ''}</div>
    </div>`;
  const secTitle = (t) => `<div style="font-size:14px;font-weight:800;color:${HB};margin:22px 0 10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #E2E8F0;padding-bottom:6px;">${t}</div>`;

  // Header
  let html = `
    <div style="border-bottom:3px solid ${HB};padding-bottom:16px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:12px;font-weight:700;color:${HB};letter-spacing:1px;text-transform:uppercase;">Harbour IQ · Fund Report</div>
          <div style="font-size:22px;font-weight:800;color:#0B1220;margin-top:2px;">${esc(fundName)}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px;">Holdings as at ${esc((fund && fund.asAt) || asOf)}${fd && fd.date ? ` · priced ${esc(fd.date)}` : ''}</div>
        </div>
        <div style="font-size:11px;color:#64748B;text-align:right;">
          <div>Generated ${esc(generated)}</div>
          <div style="margin-top:2px;">${esc(cms('report.footer'))}</div>
        </div>
      </div>
    </div>`;

  // Headline stat strip (like the PDF's 1m / 1yr / size / inception row)
  const fmtNav = (n) => n == null ? '—' : 'NZ$' + (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1e3).toLocaleString() + 'k');
  html += `<div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;margin-bottom:8px;">
    ${statCell('1 month performance', pct(fd && fd.returns ? fd.returns['1m'] : (dm && dm.monthly && dm.monthly.length ? dm.monthly[dm.monthly.length - 1].pct : null), true), 'gross, before fees & tax')}
    ${statCell('1 year performance', pct(fd && fd.returns ? fd.returns['1yr'] : null, true), fd && fd.bmark && fd.bmark['1yr'] != null ? `benchmark ${pct(fd.bmark['1yr'], true)}` : 'gross, before fees & tax')}
    ${statCell('Fund size', fmtNav((fd && fd.nav) != null ? fd.nav : det.fundValue), det.classification ? esc(det.classification) : 'NZD')}
    ${statCell('Unit price', fd && fd.price != null ? fd.price.toFixed(4) : '—', fd && fd.dailyPct != null ? `${pct(fd.dailyPct, true)} on the day` : '')}
  </div>`;

  // Top 10 holdings (PDF page 2)
  html += secTitle('Top 10 holdings');
  html += `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#F1F5F9;">
      <th style="text-align:left;padding:7px 10px;color:#64748B;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Holding</th>
      <th style="text-align:right;padding:7px 10px;color:#64748B;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Position</th>
    </tr></thead><tbody>
    ${top10.map((h, i) => `<tr style="border-bottom:1px solid #E2E8F0;${i % 2 ? 'background:#FAFBFC;' : ''}">
      <td style="padding:6px 10px;color:#0B1220;">${esc(h.name || h.symbol)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:600;color:${HB};">${fmt(h.currentValue)}%</td>
    </tr>`).join('')}
    </tbody></table>
    <div style="font-size:10px;color:#64748B;margin-top:4px;">Top 10 total: ${fmt(top10.reduce((s, h) => s + (h.currentValue || 0), 0))}% of fund net assets · ${real.length} named positions disclosed</div>`;

  // Investment mix (asset class) + currency (named holdings)
  const CLASS = { stock: 'Equity', etf: 'Equity', bond: 'Fixed income', cash: 'Cash', fund: 'Alternatives', mutualfund: 'Alternatives', other: 'Other' };
  const agg = (rows, keyFn) => { const t = rows.reduce((s, h) => s + (h.currentValue || 0), 0) || 1; const o = {}; rows.forEach(h => { const k = keyFn(h) || 'Other'; o[k] = (o[k] || 0) + (h.currentValue || 0); }); return Object.entries(o).map(([k, v]) => [k, v / t * 100]).sort((a, b) => b[1] - a[1]); };
  const booked = metrics.holdings.filter(h => h.overlayNet == null);
  const barRow = ([k, v]) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
      <div style="width:130px;font-size:11px;color:#0B1220;">${esc(k)}</div>
      <div style="flex:1;height:10px;background:#E2E8F0;border-radius:5px;overflow:hidden;"><div style="height:100%;width:${Math.min(v, 100).toFixed(1)}%;background:${HB};"></div></div>
      <div style="width:52px;text-align:right;font-size:11px;font-weight:600;color:${SLATE};">${v.toFixed(2)}%</div>
    </div>`;
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
    <div>${secTitle('Investment mix')}${agg(booked, h => CLASS[h.type] || 'Other').map(barRow).join('')}</div>
    <div>${secTitle('Currency exposure')}${agg(real, h => h.nativeCurrency || h.currency || 'NZD').slice(0, 6).map(barRow).join('')}
      <div style="font-size:10px;color:#64748B;">% of named holdings</div></div>
  </div>`;

  // Monthly fund returns (from the Disclose FUND RETURNS file)
  if (dm && dm.monthly && dm.monthly.length) {
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    html += secTitle('Monthly fund returns');
    html += `<table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody><tr>
      ${dm.monthly.slice(-6).map(r => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(r.d); const lbl = m ? `${MON[(+m[2]) - 1]} ${m[3].slice(2)}` : r.d; return `
        <td style="text-align:center;padding:8px;border:1px solid #E2E8F0;">
          <div style="font-size:10px;color:#64748B;">${lbl}</div>
          <div style="font-weight:700;color:${r.pct >= 0 ? '#0F766E' : '#B91C1C'};">${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%</div>
        </td>`; }).join('')}
    </tr></tbody></table>`;
  }

  // Fund profile + risk indicator (from GENERAL FUND DETAILS)
  if (det.classification || det.risk || det.description) {
    html += secTitle('Fund profile');
    if (det.risk) {
      html += `<div style="display:flex;gap:4px;align-items:center;margin-bottom:10px;">
        <span style="font-size:11px;color:#64748B;margin-right:6px;">Risk indicator</span>
        ${[1, 2, 3, 4, 5, 6, 7].map(n => `<div style="width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;${n === det.risk ? `background:${HB};color:#fff;` : 'background:#F1F5F9;color:#94A3B8;'}">${n}</div>`).join('')}
        <span style="font-size:10px;color:#64748B;margin-left:6px;">1 = lower risk · 7 = higher risk</span>
      </div>`;
    }
    if (det.description) html += `<div style="font-size:12px;color:#334155;line-height:1.6;">${esc(det.description)}</div>`;
    if (det.started) html += `<div style="font-size:11px;color:#64748B;margin-top:6px;">Fund started ${esc(det.started)}</div>`;
  }

  // AI review (if the agents have been run on THIS fund book)
  const ar = state.agentResults;
  if (ar && ar.advisor && ar.portfolioId === state.activePortfolioId) {
    const line = (ar.advisor.match(/\[(?:Critical|High|Medium)\][^\n]+/g) || []).slice(0, 3);
    if (line.length) {
      html += secTitle('AI review highlights');
      html += `<ul style="font-size:12px;color:#334155;line-height:1.7;margin:0;padding-left:18px;">${line.map(l => `<li>${esc(l.replace(/\s+/g, ' ').trim())}</li>`).join('')}</ul>
        <div style="font-size:10px;color:#64748B;margin-top:4px;">Generated by Harbour IQ AI agents — internal analytical support, not investment advice.</div>`;
    }
  }

  // Footer
  html += `<div style="border-top:1px solid #E2E8F0;margin-top:24px;padding-top:10px;font-size:10px;color:#64748B;line-height:1.6;">
    Data sources: NZ Disclose Register full portfolio holdings${fd ? ' · Harbour unit-price feed' : ''}${dm && dm.monthly ? ' · Disclose fund returns' : ''}.
    Weights are % of fund net assets as at the disclosure date. ${esc(cms('report.dataSource'))}
    This report is generated by Harbour IQ for internal analytical use — it is not an offer document, fund update under the FMC Act, or investment advice.
  </div>`;
  return html;
}

function renderReportPreview() {
  const wrap = document.getElementById('reportPreview');
  if (!wrap) return;
  const type   = document.getElementById('reportType')?.value || 'summary';
  const asOf   = document.getElementById('reportDate')?.value || new Date().toISOString().slice(0, 10);
  const scope  = document.getElementById('reportScope')?.value || 'all';
  const metrics = (typeof getMetrics === 'function') ? getMetrics() : null;
  if (!metrics) { wrap.innerHTML = '<div class="text-center py-10">Portfolio data not loaded yet.</div>'; return; }

  // Weight-based fund book → the Harbour fund report (modelled on the official
  // monthly PDF: headline stats, top-10, mix, monthly returns, profile). The
  // personal $-based templates are meaningless for a fund, whatever "type" says.
  const _repSub = document.getElementById('reportsSubtitle');
  if (typeof _isFundWeightView === 'function' && _isFundWeightView()) {
    if (_repSub) _repSub.textContent = 'Official monthly PDFs above; the generated snapshot below is built live from the connected data. PDF-ready via Print.';
    try { renderOfficialReports(); } catch(e) { console.warn('[official-reports]', e); }
    wrap.innerHTML = _harbourFundReportHtml(metrics, asOf);
    return;
  }
  if (_repSub) _repSub.textContent = 'Generate printable portfolio summaries — for your accountant, spouse, financial adviser, or your own records. PDF-ready.';
  const _orc = document.getElementById('officialReportsCard');
  if (_orc) _orc.style.display = 'none';

  const sym = CURRENCY_SYMBOLS[state.settings.currency] || 'NZ$';
  const userName = state.settings.name || _userProfile?.display_name || _supaUser?.email || 'Investor';
  const generated = new Date().toLocaleString('en-NZ');

  // Multi-portfolio context — every report states which portfolio it covers.
  const viewingAll = (typeof isViewingAll === 'function') && isViewingAll();
  const multiPf = (typeof listPortfolios === 'function') && listPortfolios().length > 1;
  const pfLabel = viewingAll ? 'All portfolios'
    : (typeof getActivePortfolio === 'function' ? getActivePortfolio().name : (state.settings.name || 'Portfolio'));

  let holdings = metrics.holdings;
  if (scope === 'active') holdings = holdings.filter(h => !h.ignored);
  // scope 'byplatform' just affects sort order in this build
  if (scope === 'byplatform') holdings = [...holdings].sort((a, b) => (a.platform || '').localeCompare(b.platform || ''));

  const header = `
    <div style="border-bottom:2px solid #0B1220;padding-bottom:16px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:22px;font-weight:800;color:#0B1220;">${_reportTypeTitle(type)}</div>
          <div style="font-size:13px;color:#475569;margin-top:2px;">${_escape(userName)} · as of ${_escape(asOf)}${(multiPf && type !== 'portfolio' && type !== 'tax') ? ` · <b>${_escape(pfLabel)}</b>` : ''}</div>
        </div>
        <div style="font-size:11px;color:#64748B;text-align:right;">
          <div>Generated ${_escape(generated)}</div>
          <div style="margin-top:2px;">${_escape(cms('report.footer'))}</div>
        </div>
      </div>
    </div>`;

  const summaryKpis = `
    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;margin-bottom:20px;">
      <div style="padding:12px;border-left:3px solid #1D4ED8;background:#F1F5F9;border-radius:4px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;font-weight:600;">Total Value</div>
        <div style="font-size:20px;font-weight:700;color:#0B1220;margin-top:4px;">${sym}${fmt(metrics.totalValue)}</div>
      </div>
      <div style="padding:12px;border-left:3px solid #10B981;background:#F1F5F9;border-radius:4px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;font-weight:600;">Total Return</div>
        <div style="font-size:20px;font-weight:700;color:${metrics.totalGain >= 0 ? '#047857' : '#DC2626'};margin-top:4px;">${metrics.totalGain >= 0 ? '+' : '−'}${sym}${fmt(Math.abs(metrics.totalGain))}</div>
        <div style="font-size:11px;color:${metrics.totalGain >= 0 ? '#047857' : '#DC2626'};margin-top:2px;">${metrics.totalGainPct >= 0 ? '+' : ''}${fmt(metrics.totalGainPct)}%</div>
      </div>
      <div style="padding:12px;border-left:3px solid #F59E0B;background:#F1F5F9;border-radius:4px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;font-weight:600;">Cost Basis</div>
        <div style="font-size:20px;font-weight:700;color:#0B1220;margin-top:4px;">${sym}${fmt(metrics.totalCost)}</div>
      </div>
      <div style="padding:12px;border-left:3px solid #7C3AED;background:#F1F5F9;border-radius:4px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;font-weight:600;">Holdings</div>
        <div style="font-size:20px;font-weight:700;color:#0B1220;margin-top:4px;">${holdings.length}</div>
      </div>
    </div>`;

  let body = '';
  if (type === 'summary' || type === 'performance') {
    body = summaryKpis + _reportHoldingsTable(holdings, sym);
  } else if (type === 'platform') {
    body = summaryKpis + _reportPlatformBlock(holdings, sym);
  } else if (type === 'portfolio') {
    body = _reportByPortfolioBlock(sym);
  } else if (type === 'tax') {
    // FIF is per-person across ALL portfolios — the report matches the app.
    body = _reportTaxBlock(_allPortfolioHoldings(), sym);
  } else if (type === 'dividends') {
    body = _reportDividendsBlock(sym);
  }

  const footer = `
    <div style="border-top:1px solid #CBD5E1;padding-top:12px;margin-top:32px;font-size:10px;color:#64748B;text-align:center;line-height:1.6;">
      Analysis only — not financial advice. Always consult a licensed adviser before acting.<br>
      ${_escape(cms('report.dataSource'))} Generated on ${_escape(generated)} for ${_escape(userName)}.
    </div>`;

  wrap.innerHTML = header + body + footer;
}

function _reportTypeTitle(t) {
  return {
    summary: 'Portfolio Summary',
    performance: 'Performance Report',
    platform: 'Platform Breakdown',
    portfolio: 'Portfolio Breakdown',
    tax: 'NZ Tax (FIF) Report',
    dividends: 'Dividend Income Report'
  }[t] || 'Portfolio Report';
}

// All holdings across EVERY portfolio, each computed via getMetrics and tagged
// with its portfolio name. Used by the per-person FIF report + by-portfolio.
function _allPortfolioHoldings() {
  const ports = (typeof listPortfolios === 'function' && listPortfolios().length)
    ? listPortfolios() : [{ name: 'Portfolio', holdings: state.portfolio }];
  const out = [];
  ports.forEach(pf => {
    getMetrics(pf.holdings).holdings.forEach(h => out.push({ ...h, _portfolioName: pf.name }));
  });
  return out;
}

// A compact subtotal card row (value / cost / gain) for a labelled group.
function _reportGroupSubtotal(label, hs, sym, pctOfTotal) {
  const value = hs.reduce((s, h) => s + (h.currentValue || 0), 0);
  const cost  = hs.reduce((s, h) => s + (h.costBasis || 0), 0);
  const gain  = value - cost;
  const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
  const gc = gain >= 0 ? '#047857' : '#DC2626';
  return `
    <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin:22px 0 8px;padding-bottom:6px;border-bottom:2px solid #0B1220;">
      <div style="font-size:15px;font-weight:800;color:#0B1220;">${_escape(label)}
        <span style="font-size:11px;font-weight:600;color:#64748B;">· ${hs.length} holding${hs.length === 1 ? '' : 's'}${pctOfTotal != null ? ` · ${fmt(pctOfTotal)}% of total` : ''}</span>
      </div>
      <div style="font-size:12px;color:#475569;">
        Value <b style="color:#0B1220;">${sym}${fmt(value)}</b> ·
        Cost ${sym}${fmt(cost)} ·
        <span style="color:${gc};font-weight:700;">${gain >= 0 ? '+' : '−'}${sym}${fmt(Math.abs(gain))} (${gainPct >= 0 ? '+' : ''}${fmt(gainPct)}%)</span>
      </div>
    </div>`;
}

// Platform Breakdown — group the (active-portfolio) holdings by platform with
// a subtotal header + allocation %, then the holdings table under each.
function _reportPlatformBlock(holdings, sym) {
  if (!holdings.length) return '<div style="text-align:center;padding:40px;color:#64748B;">No holdings.</div>';
  const grandValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0) || 1;
  const byPlat = {};
  holdings.forEach(h => { const k = h.platform || 'Unspecified'; (byPlat[k] = byPlat[k] || []).push(h); });
  const platforms = Object.keys(byPlat).sort((a, b) =>
    byPlat[b].reduce((s, h) => s + (h.currentValue || 0), 0) - byPlat[a].reduce((s, h) => s + (h.currentValue || 0), 0));
  // Allocation summary strip
  const alloc = platforms.map(p => {
    const v = byPlat[p].reduce((s, h) => s + (h.currentValue || 0), 0);
    return `<tr style="border-bottom:1px solid #E2E8F0;">
      <td style="padding:6px 10px;font-weight:600;">${_escape(p)}</td>
      <td style="padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;">${sym}${fmt(v)}</td>
      <td style="padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;">${fmt((v / grandValue) * 100)}%</td>
    </tr>`;
  }).join('');
  const allocTable = `<h3 style="font-size:14px;color:#0B1220;margin:8px 0 8px;">Allocation by platform</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;color:#0B1220;margin-bottom:8px;">
      <thead><tr style="background:#0B1220;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">
        <th style="padding:8px 10px;text-align:left;">Platform</th>
        <th style="padding:8px 10px;text-align:right;">Value</th>
        <th style="padding:8px 10px;text-align:right;">% of total</th>
      </tr></thead><tbody>${alloc}</tbody></table>`;
  const sections = platforms.map(p => {
    const hs = [...byPlat[p]].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
    const v = hs.reduce((s, h) => s + (h.currentValue || 0), 0);
    return _reportGroupSubtotal(p, hs, sym, (v / grandValue) * 100) + _reportHoldingsTable(hs, sym);
  }).join('');
  return allocTable + sections;
}

// By-Portfolio Breakdown — one section per portfolio with its own subtotal +
// holdings, preceded by an account-wide total. Spans ALL portfolios.
function _reportByPortfolioBlock(sym) {
  const ports = (typeof listPortfolios === 'function') ? listPortfolios() : [];
  if (ports.length === 0) return '<div style="text-align:center;padding:40px;color:#64748B;">No portfolios.</div>';
  let acctValue = 0, acctCost = 0;
  const perPf = ports.map(pf => {
    const m = getMetrics(pf.holdings);
    acctValue += m.totalValue; acctCost += m.totalCost;
    return { name: pf.name, holdings: m.holdings, value: m.totalValue, cost: m.totalCost };
  });
  const acctGain = acctValue - acctCost;
  const acctGainPct = acctCost > 0 ? (acctGain / acctCost) * 100 : 0;
  const gc = acctGain >= 0 ? '#047857' : '#DC2626';
  const acctHeader = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px;">
      <div style="padding:12px;border-left:3px solid #1D4ED8;background:#F1F5F9;border-radius:4px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;font-weight:600;">Account value</div>
        <div style="font-size:20px;font-weight:700;color:#0B1220;margin-top:4px;">${sym}${fmt(acctValue)}</div>
      </div>
      <div style="padding:12px;border-left:3px solid #10B981;background:#F1F5F9;border-radius:4px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;font-weight:600;">Account return</div>
        <div style="font-size:20px;font-weight:700;color:${gc};margin-top:4px;">${acctGain >= 0 ? '+' : '−'}${sym}${fmt(Math.abs(acctGain))}</div>
        <div style="font-size:11px;color:${gc};margin-top:2px;">${acctGainPct >= 0 ? '+' : ''}${fmt(acctGainPct)}%</div>
      </div>
      <div style="padding:12px;border-left:3px solid #F59E0B;background:#F1F5F9;border-radius:4px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;font-weight:600;">Cost basis</div>
        <div style="font-size:20px;font-weight:700;color:#0B1220;margin-top:4px;">${sym}${fmt(acctCost)}</div>
      </div>
      <div style="padding:12px;border-left:3px solid #7C3AED;background:#F1F5F9;border-radius:4px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;font-weight:600;">Portfolios</div>
        <div style="font-size:20px;font-weight:700;color:#0B1220;margin-top:4px;">${ports.length}</div>
      </div>
    </div>`;
  const sections = perPf
    .sort((a, b) => b.value - a.value)
    .map(p => {
      const hs = [...p.holdings].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
      return _reportGroupSubtotal(p.name, hs, sym, acctValue > 0 ? (p.value / acctValue) * 100 : 0)
        + (hs.length ? _reportHoldingsTable(hs, sym) : '<div style="padding:10px;color:#64748B;font-size:12px;">No holdings in this portfolio.</div>');
    }).join('');
  return acctHeader + sections;
}

function _reportHoldingsTable(holdings, sym) {
  if (!holdings.length) return '<div style="text-align:center;padding:40px;color:#64748B;">No holdings.</div>';
  const rows = holdings.map(h => {
    const gainColor = h.gain >= 0 ? '#047857' : '#DC2626';
    return `<tr style="border-bottom:1px solid #E2E8F0;">
      <td style="padding:8px 10px;font-weight:600;">${_escape(h.symbol)}</td>
      <td style="padding:8px 10px;color:#475569;">${_escape(h.name || h.platform || '')}</td>
      <td style="padding:8px 10px;color:#64748B;font-size:11px;">${_escape((h.type || '').toUpperCase())}</td>
      <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums;">${Number(h.quantity || 0).toFixed(4)}</td>
      <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums;">${sym}${fmt(h.costBasis)}</td>
      <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${sym}${fmt(h.currentValue)}</td>
      <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums;color:${gainColor};">${h.gain >= 0 ? '+' : '−'}${sym}${fmt(Math.abs(h.gain))}</td>
      <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums;color:${gainColor};">${h.gainPct >= 0 ? '+' : ''}${fmt(h.gainPct)}%</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;color:#0B1220;">
    <thead>
      <tr style="background:#0B1220;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">
        <th style="padding:10px;text-align:left;">Symbol</th>
        <th style="padding:10px;text-align:left;">Name</th>
        <th style="padding:10px;text-align:left;">Type</th>
        <th style="padding:10px;text-align:right;">Units</th>
        <th style="padding:10px;text-align:right;">Cost</th>
        <th style="padding:10px;text-align:right;">Value</th>
        <th style="padding:10px;text-align:right;">Gain $</th>
        <th style="padding:10px;text-align:right;">Gain %</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _reportTaxBlock(holdings, sym) {
  // Overseas holdings = NOT NZD currency (FIF threshold is on overseas cost basis)
  const overseas = holdings.filter(h => h.currency && h.currency.toUpperCase() !== 'NZD');
  const overseasCost = overseas.reduce((s, h) => s + (h.costBasis || 0), 0);
  const overseasValue = overseas.reduce((s, h) => s + (h.currentValue || 0), 0);
  const threshold = 50000;
  const overThreshold = overseasCost > threshold;
  const fdrEstimate = overThreshold ? overseasValue * 0.05 : 0;
  const _nPf = (typeof listPortfolios === 'function') ? listPortfolios().length : 1;
  const perPersonNote = _nPf > 1
    ? `<div style="margin-bottom:12px;padding:12px 14px;background:#EEF2FF;border-left:4px solid #6366F1;color:#3730A3;font-size:12px;line-height:1.6;">
         <b>Assessed per person across all ${_nPf} portfolios.</b> The NZ$50,000 FIF de-minimis applies to your total overseas cost basis — not each portfolio separately — so this report combines them.
       </div>` : '';
  return perPersonNote + `
    <div style="margin-bottom:20px;padding:16px;background:#FEF3C7;border-left:4px solid #F59E0B;color:#78350F;font-size:12px;line-height:1.6;">
      <b>Analysis only — not tax advice.</b> Always consult a licensed NZ tax adviser before filing.
    </div>
    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;margin-bottom:20px;">
      <div style="padding:14px;border:1px solid #CBD5E1;border-radius:4px;">
        <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Overseas Cost Basis</div>
        <div style="font-size:22px;font-weight:700;color:#0B1220;margin-top:4px;">${sym}${fmt(overseasCost)}</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px;">Threshold: NZ\$${fmt(threshold)}</div>
      </div>
      <div style="padding:14px;border:1px solid #CBD5E1;border-radius:4px;">
        <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">FIF Status</div>
        <div style="font-size:22px;font-weight:700;color:${overThreshold ? '#DC2626' : '#047857'};margin-top:4px;">${overThreshold ? 'Above' : 'Below'}</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px;">${overThreshold ? 'FIF income tax applies' : 'No FIF required'}</div>
      </div>
      <div style="padding:14px;border:1px solid #CBD5E1;border-radius:4px;">
        <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">FDR 5% Estimate</div>
        <div style="font-size:22px;font-weight:700;color:#0B1220;margin-top:4px;">${sym}${fmt(fdrEstimate)}</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px;">Fair Dividend Rate</div>
      </div>
    </div>
    <h3 style="font-size:14px;color:#0B1220;margin:24px 0 12px;">Overseas holdings contributing to FIF</h3>
    ${_reportHoldingsTable(overseas, sym)}
  `;
}

function _reportDividendsBlock(sym) {
  // Pull from in-memory cache built by dividends section if available
  const note = `<div style="margin-bottom:16px;padding:12px;background:#F1F5F9;border-radius:4px;font-size:12px;color:#475569;">
    For the full dividend ledger, open the Dividends section and use its CSV/PDF export. This report shows a summary of all-time logged dividends.
  </div>`;
  return note + '<div style="color:#64748B;font-size:13px;text-align:center;padding:30px;">Detailed dividend listing available from the Dividends section. Use that section\'s CSV export for IR3 preparation.</div>';
}

// Export the rendered preview as PDF via the browser's print dialog.
// The user picks "Save as PDF" in the system print dialog.
function exportReportPdf() {
  const preview = document.getElementById('reportPreview');
  if (!preview || preview.innerHTML.trim().length < 100) {
    if (window.toast) toast.warning('Refresh the preview first.');
    return;
  }
  const printWin = window.open('', '_blank');
  if (!printWin) { if (window.toast) toast.error('Popup blocked. Allow popups for this site to export PDFs.'); return; }
  const userName = state.settings.name || _userProfile?.display_name || _supaUser?.email || 'investor';
  const date = new Date().toISOString().slice(0, 10);
  printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${_escape(cms('report.title'))} · ${_escape(userName)} · ${date}</title>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; margin: 0; padding: 32px; color: #0B1220; background: #fff; }
    @page { size: A4; margin: 18mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>${preview.innerHTML}</body>
</html>`);
  printWin.document.close();
  // Give the new window a beat to render, then fire print
  setTimeout(() => { try { printWin.print(); } catch(e) {} }, 250);
  if (window.toast) toast.info('Choose "Save as PDF" in the print dialog');
}

// ─────────────────────────────────────────────────────────────────────────
// PWA install prompt
// Captures the beforeinstallprompt event and shows a banner on Android
// Chrome. iOS doesn't fire that event — we detect Safari/iOS and show
// instructions instead. Banner persists until dismissed or installed.
// ─────────────────────────────────────────────────────────────────────────

let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  if (!localStorage.getItem('investiq_pwa_dismissed')) {
    setTimeout(() => _showPwaBanner(), 8000); // wait 8s so it doesn't fire during sign-in
  }
});

window.addEventListener('appinstalled', () => {
  _hidePwaBanner();
  localStorage.setItem('investiq_pwa_installed', '1');
});

function _showPwaBanner() {
  if (document.getElementById('pwaInstallBanner')) return;
  if (localStorage.getItem('investiq_pwa_installed')) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (!_deferredInstallPrompt && !(isIOS && isSafari)) return;
  const banner = document.createElement('div');
  banner.id = 'pwaInstallBanner';
  banner.style.cssText = 'position:fixed;bottom:90px;left:12px;right:12px;max-width:420px;margin:0 auto;padding:14px 16px;background:var(--bg-panel);border:1px solid var(--accent-soft-2);border-left:3px solid var(--accent);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.25);z-index:80;display:flex;align-items:center;gap:12px;animation:fadeIn 0.3s;';
  const instruction = isIOS
    ? 'Tap <i class="fas fa-arrow-up-from-bracket" style="color:var(--accent);"></i> then <b>Add to Home Screen</b>'
    : cms('pwa.installInstruction');
  banner.innerHTML = `
    <i class="fas fa-mobile-screen-button" style="color:var(--accent);font-size:22px;"></i>
    <div style="flex:1;">
      <div class="font-semibold text-sm" style="color:var(--text-primary);">${_escape(cms('pwa.installTitle'))}</div>
      <div class="text-xs neutral mt-1" style="line-height:1.4;">${instruction}</div>
    </div>
    ${_deferredInstallPrompt ? `<button onclick="installPwa()" class="btn btn-primary btn-sm" style="font-size:11px;padding:6px 12px;">Install</button>` : ''}
    <button onclick="_dismissPwaBanner()" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>`;
  document.body.appendChild(banner);
}

function _hidePwaBanner() {
  const b = document.getElementById('pwaInstallBanner'); if (b) b.remove();
}

function _dismissPwaBanner() {
  localStorage.setItem('investiq_pwa_dismissed', '1');
  _hidePwaBanner();
}

async function installPwa() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  const choice = await _deferredInstallPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    if (window.toast) toast.success(cms('pwa.installed'));
  }
  _deferredInstallPrompt = null;
  _hidePwaBanner();
}

// Expose globals
window.renderCalendarSection = renderCalendarSection;
window.renderReportPreview = renderReportPreview;
window.exportReportPdf = exportReportPdf;
window.installPwa = installPwa;
window._dismissPwaBanner = _dismissPwaBanner;
