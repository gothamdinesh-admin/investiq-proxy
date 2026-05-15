// supabase/functions/weekly-digest/index.ts
//
// Weekly portfolio digest — runs once per week via pg_cron, computes each
// opted-in user's portfolio change vs 7 days ago using investiq_snapshots,
// and emails them a summary via Resend.
//
// Deploy:
//   supabase functions deploy weekly-digest --no-verify-jwt
//
// Schedule (Supabase Dashboard → Database → Cron Jobs, or via SQL):
//   SELECT cron.schedule(
//     'weekly-digest',
//     '0 18 * * 0',  -- 6 PM UTC every Sunday (= 6 AM Monday NZ)
//     $$ SELECT net.http_post(
//          url := 'https://<project>.supabase.co/functions/v1/weekly-digest',
//          headers := jsonb_build_object(
//            'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
//            'Content-Type', 'application/json'
//          )
//        ) $$
//   );
//
// Required env (set via `supabase secrets set ...`):
//   RESEND_API_KEY        — your Resend API key
//   RESEND_FROM_EMAIL     — e.g. "InvestIQ <digest@investiq.co.nz>"
//   CRON_SECRET           — shared secret so only the cron job can invoke this
//   SUPABASE_URL          — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "InvestIQ <onboarding@resend.dev>";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const supa = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

interface DigestResult { email: string; ok: boolean; reason?: string }

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
  });
  if (res.ok) return { ok: true };
  const errText = await res.text();
  return { ok: false, error: `Resend ${res.status}: ${errText.slice(0, 200)}` };
}

function fmtNZD(n: number): string {
  if (n == null || isNaN(n)) return "NZ$–";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}NZ$${(abs/1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}NZ$${(abs/1e3).toFixed(1)}K`;
  return `${sign}NZ$${abs.toFixed(2)}`;
}

function buildHtml(opts: {
  name: string;
  totalValue: number;
  weekChange: number;
  weekChangePct: number;
  topMover: { symbol: string; pct: number } | null;
  worstMover: { symbol: string; pct: number } | null;
  holdingsCount: number;
}): string {
  const c = opts.weekChange >= 0 ? "#34d399" : "#f87171";
  const arrow = opts.weekChange >= 0 ? "▲" : "▼";
  const sign = opts.weekChange >= 0 ? "+" : "";
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a1120;color:#c8d6ef;padding:32px 24px;max-width:560px;margin:0 auto;border-radius:16px;">
    <div style="font-size:24px;font-weight:700;color:#818cf8;margin-bottom:4px;">InvestIQ</div>
    <div style="font-size:13px;color:#7a9cc0;margin-bottom:28px;">Your week in markets</div>

    <div style="font-size:14px;margin-bottom:6px;">Hi ${opts.name || "there"},</div>
    <div style="font-size:14px;color:#94a3b8;margin-bottom:24px;line-height:1.6;">
      Here's how your portfolio moved this past week.
    </div>

    <div style="background:#0f1729;border:1px solid #1e2d4a;border-radius:12px;padding:20px;margin-bottom:14px;">
      <div style="font-size:11px;color:#7a9cc0;text-transform:uppercase;letter-spacing:0.5px;">Total value</div>
      <div style="font-size:30px;font-weight:700;color:#c8d6ef;margin:6px 0;">${fmtNZD(opts.totalValue)}</div>
      <div style="font-size:14px;color:${c};font-weight:600;">${arrow} ${sign}${fmtNZD(opts.weekChange)} (${sign}${opts.weekChangePct.toFixed(2)}%) this week</div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:24px;">
      ${opts.topMover ? `
        <div style="flex:1;background:#0f1729;border:1px solid #1e2d4a;border-radius:10px;padding:14px;">
          <div style="font-size:10px;color:#7a9cc0;text-transform:uppercase;letter-spacing:0.5px;">Top mover</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px;">${opts.topMover.symbol}</div>
          <div style="font-size:13px;color:#34d399;font-weight:600;">+${opts.topMover.pct.toFixed(2)}%</div>
        </div>` : ""}
      ${opts.worstMover ? `
        <div style="flex:1;background:#0f1729;border:1px solid #1e2d4a;border-radius:10px;padding:14px;">
          <div style="font-size:10px;color:#7a9cc0;text-transform:uppercase;letter-spacing:0.5px;">Worst mover</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px;">${opts.worstMover.symbol}</div>
          <div style="font-size:13px;color:#f87171;font-weight:600;">${opts.worstMover.pct.toFixed(2)}%</div>
        </div>` : ""}
    </div>

    <div style="font-size:13px;color:#7a9cc0;margin-bottom:20px;line-height:1.6;">
      Holdings: ${opts.holdingsCount} · view your full dashboard for the breakdown.
    </div>

    <a href="https://investiq-nz.netlify.app" style="display:inline-block;background:#6366f1;color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">Open InvestIQ →</a>

    <hr style="border:none;border-top:1px solid #1e2d4a;margin:32px 0 16px;">
    <div style="font-size:11px;color:#4a6080;line-height:1.7;">
      You're getting this because you opted in to InvestIQ's weekly digest.
      <br>This is analysis only, not financial advice. Always check the numbers in-app before acting.
      <br><br>
      <a href="https://investiq-nz.netlify.app#unsubscribe-digest" style="color:#7a9cc0;">Manage email preferences</a>
    </div>
  </div>`;
}

async function digestForUser(userId: string, email: string): Promise<DigestResult> {
  // Latest snapshot (yesterday or today) and snapshot from 7+ days ago
  const today = new Date();
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  // Latest snapshot
  const { data: latest, error: e1 } = await supa
    .from("investiq_snapshots")
    .select("snapshot_date, total_value, breakdown")
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .single();
  if (e1 || !latest) return { email, ok: false, reason: "no recent snapshot" };

  // Snapshot from ~7 days ago (closest on-or-before)
  const { data: prior } = await supa
    .from("investiq_snapshots")
    .select("snapshot_date, total_value, breakdown")
    .eq("user_id", userId)
    .lte("snapshot_date", weekAgoStr)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .single();

  const totalValue   = Number(latest.total_value) || 0;
  const priorValue   = prior ? Number(prior.total_value) || totalValue : totalValue;
  const weekChange   = totalValue - priorValue;
  const weekChangePct = priorValue > 0 ? (weekChange / priorValue) * 100 : 0;

  // Top / worst mover this week from the breakdown JSON
  let topMover: { symbol: string; pct: number } | null = null;
  let worstMover: { symbol: string; pct: number } | null = null;
  if (latest.breakdown && prior?.breakdown) {
    const priorMap: Record<string, number> = {};
    for (const h of (prior.breakdown.holdings || [])) {
      if (h.symbol && h.currentPrice) priorMap[h.symbol] = h.currentPrice;
    }
    const moves: { symbol: string; pct: number }[] = [];
    for (const h of (latest.breakdown.holdings || [])) {
      if (!h.symbol || !h.currentPrice || !priorMap[h.symbol]) continue;
      const pct = ((h.currentPrice - priorMap[h.symbol]) / priorMap[h.symbol]) * 100;
      if (isFinite(pct)) moves.push({ symbol: h.symbol, pct });
    }
    moves.sort((a,b) => b.pct - a.pct);
    if (moves.length) {
      topMover = moves[0].pct > 0 ? moves[0] : null;
      worstMover = moves[moves.length-1].pct < 0 ? moves[moves.length-1] : null;
    }
  }

  const holdingsCount = (latest.breakdown?.holdings || []).length;

  // Use display name from profile if available
  const { data: prof } = await supa
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  const name = prof?.display_name || email.split("@")[0];

  const html = buildHtml({ name, totalValue, weekChange, weekChangePct, topMover, worstMover, holdingsCount });
  const subject = `Your portfolio: ${weekChange >= 0 ? "+" : ""}${fmtNZD(weekChange)} this week`;
  const send = await sendEmail(email, subject, html);
  return { email, ok: send.ok, reason: send.error };
}

serve(async (req) => {
  // Shared-secret gate — only the cron job (or admin) can invoke this.
  // Edge Functions are public by default; this prevents drive-by sends.
  const authHeader = req.headers.get("Authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "");
  if (CRON_SECRET && provided !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorised" }), {
      status: 401, headers: { "Content-Type": "application/json" }
    });
  }

  // Fetch opted-in users
  const { data: users, error } = await supa
    .from("profiles")
    .select("id, email, digest_opt_in")
    .eq("digest_opt_in", true)
    .eq("is_approved", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }

  const results: DigestResult[] = [];
  for (const u of users || []) {
    if (!u.email) { results.push({ email: "(no email)", ok: false, reason: "missing email" }); continue; }
    try {
      results.push(await digestForUser(u.id, u.email));
    } catch (e) {
      results.push({ email: u.email, ok: false, reason: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({
    ran_at: new Date().toISOString(),
    attempted: results.length,
    sent:      results.filter(r => r.ok).length,
    failed:    results.filter(r => !r.ok).length,
    details:   results
  }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
});
