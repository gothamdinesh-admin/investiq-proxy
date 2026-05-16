// supabase/functions/check-price-alerts/index.ts
//
// Runs every 30 min via pg_cron. Evaluates all active price_alerts,
// fetches current prices from the Render proxy, fires emails for any
// alerts whose condition is met (respecting cooldown), updates
// last_fired_at + fire_count.
//
// Auth: X-Cron-Secret header — same model as weekly-digest.
//
// Required env (same as weekly-digest, can be reused):
//   RESEND_API_KEY        — Resend API key
//   RESEND_FROM_EMAIL     — e.g. "InvestIQ <onboarding@resend.dev>"
//   CRON_SECRET           — shared secret with the cron job
//   PROXY_URL             — Render proxy base URL (e.g. https://investiq-proxy.onrender.com)
//   PROXY_SECRET          — Render PROXY_SECRET env var (for X-Proxy-Secret header)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPA_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPA_SRV    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY  = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL  = Deno.env.get("RESEND_FROM_EMAIL") || "InvestIQ <onboarding@resend.dev>";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const PROXY_URL   = (Deno.env.get("PROXY_URL") || "https://investiq-proxy.onrender.com").replace(/\/$/, "");
const PROXY_SECRET = Deno.env.get("PROXY_SECRET") || "";

const supa = createClient(SUPA_URL, SUPA_SRV, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Cron-Secret",
  "Access-Control-Max-Age":       "86400"
};

interface Alert {
  id: string;
  user_id: string;
  scope: 'ticker' | 'portfolio';
  symbol: string | null;
  condition: 'above' | 'below' | 'day_rise_pct' | 'day_drop_pct';
  threshold: number;
  currency: string | null;
  cooldown_hours: number;
  last_fired_at: string | null;
  note: string | null;
}

interface FireResult {
  alert_id: string;
  user_email: string;
  ok: boolean;
  reason?: string;
  fired_for?: string;
}

function fmt(n: number, dec = 2): string {
  if (n == null || isNaN(n)) return "–";
  return Math.abs(n).toFixed(dec);
}

function conditionLabel(c: string, t: number, sym?: string): string {
  const s = sym || "";
  switch (c) {
    case "above":         return `rises above ${s}${fmt(t)}`;
    case "below":         return `drops below ${s}${fmt(t)}`;
    case "day_rise_pct":  return `rises ${fmt(t)}% in a day`;
    case "day_drop_pct":  return `drops ${fmt(t)}% in a day`;
    default:              return c;
  }
}

function emailHtml(opts: {
  name: string;
  alertDescription: string;
  currentValue: string;
  thresholdValue: string;
  symbol: string;
  note: string | null;
}) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a1120;color:#c8d6ef;padding:32px 24px;max-width:560px;margin:0 auto;border-radius:16px;">
    <div style="font-size:24px;font-weight:700;color:#818cf8;margin-bottom:4px;">InvestIQ</div>
    <div style="font-size:13px;color:#7a9cc0;margin-bottom:28px;">Price alert</div>

    <div style="font-size:14px;color:#c8d6ef;margin-bottom:18px;line-height:1.6;">
      Hi ${opts.name || "there"},<br><br>
      Your alert for <b>${opts.symbol}</b> just triggered:
    </div>

    <div style="background:#0f1729;border:1px solid #fbbf2444;border-radius:12px;padding:20px;margin-bottom:18px;">
      <div style="font-size:11px;color:#fbbf24;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Alert fired</div>
      <div style="font-size:18px;color:#c8d6ef;line-height:1.4;margin-bottom:10px;">${opts.alertDescription}</div>
      <div style="font-size:13px;color:#7a9cc0;">
        Current: <b style="color:#c8d6ef;">${opts.currentValue}</b>
        &middot;
        Threshold: <b style="color:#c8d6ef;">${opts.thresholdValue}</b>
      </div>
      ${opts.note ? `<div style="font-size:12px;color:#94a3b8;margin-top:12px;font-style:italic;border-top:1px solid #1e2d4a;padding-top:10px;">Your note: ${opts.note}</div>` : ""}
    </div>

    <a href="https://investiq-nz.netlify.app" style="display:inline-block;background:#6366f1;color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">Open InvestIQ →</a>

    <hr style="border:none;border-top:1px solid #1e2d4a;margin:32px 0 16px;">
    <div style="font-size:11px;color:#4a6080;line-height:1.7;">
      This alert is on cooldown for 24 hours so it won't spam you. Manage your alerts in the app.
      <br><br>
      This is analysis only, not financial advice.
      <br><br>
      <a href="https://investiq-nz.netlify.app#alerts" style="color:#7a9cc0;">Manage alerts</a>
    </div>
  </div>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

async function fetchPrices(symbols: string[]): Promise<Record<string, { price: number; changePct: number }>> {
  if (!symbols.length) return {};
  const url = `${PROXY_URL}/api/market?symbols=${encodeURIComponent(symbols.join(","))}`;
  try {
    const res = await fetch(url, {
      headers: PROXY_SECRET ? { "X-Proxy-Secret": PROXY_SECRET } : {},
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      console.error(`[price-alerts] proxy /api/market returned ${res.status}`);
      return {};
    }
    return await res.json();
  } catch (e) {
    console.error(`[price-alerts] proxy fetch failed:`, (e as Error).message);
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // X-Cron-Secret gate (same pattern as weekly-digest)
  const provided = req.headers.get("X-Cron-Secret") || "";
  if (CRON_SECRET && provided !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorised" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  // Fetch all active alerts that are off-cooldown
  const { data: alerts, error } = await supa
    .from("price_alerts")
    .select("id, user_id, scope, symbol, condition, threshold, currency, cooldown_hours, last_fired_at, note")
    .eq("active", true);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  const offCooldown = (alerts || []).filter(a => {
    if (!a.last_fired_at) return true;
    const cooldownMs = (a.cooldown_hours || 24) * 60 * 60 * 1000;
    return Date.now() - new Date(a.last_fired_at).getTime() > cooldownMs;
  });

  if (!offCooldown.length) {
    return new Response(JSON.stringify({
      ran_at: new Date().toISOString(),
      total_alerts: alerts?.length || 0,
      off_cooldown: 0,
      checked: 0,
      fired: 0
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Unique ticker symbols to fetch (portfolio-scope alerts need separate per-user query)
  const tickerSymbols = [...new Set(offCooldown
    .filter(a => a.scope === "ticker" && a.symbol)
    .map(a => a.symbol!))];
  const prices = await fetchPrices(tickerSymbols);

  const results: FireResult[] = [];
  for (const alert of offCooldown as Alert[]) {
    try {
      let triggered = false;
      let currentVal = 0;
      let triggeredDescription = "";
      let firedFor = "";

      if (alert.scope === "ticker") {
        const q = prices[alert.symbol!];
        if (!q || q.price == null) continue;
        currentVal = q.price;
        const changePct = q.changePct || 0;
        firedFor = alert.symbol!;

        if (alert.condition === "above" && currentVal >= alert.threshold) triggered = true;
        if (alert.condition === "below" && currentVal <= alert.threshold) triggered = true;
        if (alert.condition === "day_rise_pct" && changePct >= alert.threshold) triggered = true;
        if (alert.condition === "day_drop_pct" && changePct <= -Math.abs(alert.threshold)) triggered = true;

        if (triggered) {
          const sym = alert.currency === "NZD" ? "NZ$"
                    : alert.currency === "USD" ? "$"
                    : alert.currency === "GBP" ? "£"
                    : alert.currency === "EUR" ? "€"
                    : "";
          if (alert.condition === "day_rise_pct" || alert.condition === "day_drop_pct") {
            triggeredDescription = `${alert.symbol} ${conditionLabel(alert.condition, alert.threshold)} (today: ${changePct >= 0 ? "+" : ""}${fmt(changePct)}%)`;
          } else {
            triggeredDescription = `${alert.symbol} ${conditionLabel(alert.condition, alert.threshold, sym)}`;
          }
        }
      } else if (alert.scope === "portfolio") {
        // Pull this user's latest snapshot
        const { data: latest } = await supa
          .from("investiq_snapshots")
          .select("snapshot_date, total_value, total_cost")
          .eq("user_id", alert.user_id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .single();
        const { data: priorRow } = await supa
          .from("investiq_snapshots")
          .select("total_value")
          .eq("user_id", alert.user_id)
          .lt("snapshot_date", latest?.snapshot_date || new Date().toISOString().slice(0, 10))
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .single();
        if (!latest) continue;
        const todayVal = Number(latest.total_value);
        const priorVal = priorRow ? Number(priorRow.total_value) : todayVal;
        const dayPct = priorVal > 0 ? ((todayVal - priorVal) / priorVal) * 100 : 0;
        currentVal = todayVal;
        firedFor = "Portfolio";

        if (alert.condition === "above" && todayVal >= alert.threshold) triggered = true;
        if (alert.condition === "below" && todayVal <= alert.threshold) triggered = true;
        if (alert.condition === "day_rise_pct" && dayPct >= alert.threshold) triggered = true;
        if (alert.condition === "day_drop_pct" && dayPct <= -Math.abs(alert.threshold)) triggered = true;

        if (triggered) {
          triggeredDescription = (alert.condition.endsWith("pct"))
            ? `Your portfolio ${conditionLabel(alert.condition, alert.threshold)} (today: ${dayPct >= 0 ? "+" : ""}${fmt(dayPct)}%)`
            : `Your portfolio ${conditionLabel(alert.condition, alert.threshold, "NZ$")}`;
        }
      }

      if (!triggered) continue;

      // Fetch user email + display_name for the email body
      const { data: user } = await supa.from("profiles").select("email, display_name").eq("id", alert.user_id).single();
      if (!user?.email) {
        results.push({ alert_id: alert.id, user_email: "(unknown)", ok: false, reason: "no email on profile" });
        continue;
      }

      const subject = `Alert: ${triggeredDescription}`;
      const html = emailHtml({
        name:             user.display_name || user.email.split("@")[0],
        alertDescription: triggeredDescription,
        currentValue:     fmt(currentVal),
        thresholdValue:   fmt(alert.threshold),
        symbol:           firedFor,
        note:             alert.note
      });

      const send = await sendEmail(user.email, subject, html);
      if (send.ok) {
        // Mark fired
        await supa.from("price_alerts").update({
          last_fired_at: new Date().toISOString(),
          fire_count: (alert as any).fire_count != null ? (alert as any).fire_count + 1 : 1
        }).eq("id", alert.id);
      }
      results.push({
        alert_id:   alert.id,
        user_email: user.email,
        ok:         send.ok,
        reason:     send.error,
        fired_for:  firedFor
      });
    } catch (e) {
      results.push({ alert_id: alert.id, user_email: "?", ok: false, reason: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({
    ran_at:        new Date().toISOString(),
    total_alerts:  alerts?.length || 0,
    off_cooldown:  offCooldown.length,
    checked:       offCooldown.length,
    fired:         results.filter(r => r.ok).length,
    failed:        results.filter(r => !r.ok).length,
    details:       results
  }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
});
