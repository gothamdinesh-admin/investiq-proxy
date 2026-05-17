// supabase/functions/refresh-nz-funds/index.ts
//
// v0.8e — Daily server-side refresh of every NZ fund / KiwiSaver unit
// price across every user's portfolio. Runs via pg_cron at 14:00 UTC
// daily (= 2 AM NZ). For each unique fund symbol in the system, hits
// the Render proxy's /api/nz-fund route (which tries Harbour direct +
// Sorted.org.nz fallback) and updates every user's holding that owns
// that symbol.
//
// Failed refreshes write to the `notifications` table per-user, so the
// user sees them on next sign-in via the bell icon.
//
// Required env:
//   CRON_SECRET   — shared secret with the cron job
//   PROXY_URL     — Render proxy base URL
//   PROXY_SECRET  — Render PROXY_SECRET env var (for X-Proxy-Secret)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPA_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPA_SRV     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET  = Deno.env.get("CRON_SECRET") || "";
const PROXY_URL    = (Deno.env.get("PROXY_URL") || "https://investiq-proxy.onrender.com").replace(/\/$/, "");
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

interface FundPrice {
  price?: number;
  asOf?: string;
  source?: string;
  fund_name?: string;
  error?: string;
}

async function fetchFundPrice(code: string, provider: string, name: string): Promise<FundPrice> {
  const url = `${PROXY_URL}/api/nz-fund?code=${encodeURIComponent(code)}&provider=${encodeURIComponent(provider)}&name=${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url, {
      headers: PROXY_SECRET ? { "X-Proxy-Secret": PROXY_SECRET } : {},
      signal: AbortSignal.timeout(15000)
    });
    return await res.json();
  } catch (e) {
    return { error: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // X-Cron-Secret gate (same pattern as weekly-digest, check-price-alerts)
  const provided = req.headers.get("X-Cron-Secret") || "";
  if (CRON_SECRET && provided !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorised" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  // Fetch all portfolios that have at least one fund/kiwisaver holding
  const { data: rows, error } = await supa
    .from("investiq_portfolios")
    .select("user_id, portfolio");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  // Collect every unique fund (symbol, provider, name) we need to look up.
  // Lookup is by (symbol + provider) since same symbol could come from
  // different providers in theory.
  const lookupMap = new Map<string, { code: string; provider: string; name: string; users: string[] }>();
  for (const row of rows || []) {
    const portfolio = row.portfolio || [];
    for (const h of portfolio) {
      if (h.type !== "fund" && h.type !== "kiwisaver") continue;
      const key = `${(h.symbol || "").toUpperCase()}::${(h.provider || "").toLowerCase()}`;
      if (!lookupMap.has(key)) {
        lookupMap.set(key, {
          code:     h.symbol || "",
          provider: h.provider || "",
          name:     h.name     || "",
          users:    []
        });
      }
      lookupMap.get(key)!.users.push(row.user_id);
    }
  }

  if (!lookupMap.size) {
    return new Response(JSON.stringify({
      ran_at: new Date().toISOString(),
      message: "No fund/kiwisaver holdings in any portfolio",
      lookups: 0
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Fetch each unique fund's price (serialised, 300ms delay between calls
  // to be polite to Harbour / Sorted.org.nz)
  const priceMap = new Map<string, FundPrice>();
  const lookups = Array.from(lookupMap.entries());
  for (let i = 0; i < lookups.length; i++) {
    const [key, { code, provider, name }] = lookups[i];
    priceMap.set(key, await fetchFundPrice(code, provider, name));
    if (i < lookups.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  // Update each user's portfolio: for every fund holding, if we found a
  // price for that symbol, patch in currentPrice + manualPriceDate.
  // Failures get a notification row written for that user.
  const today = new Date().toISOString().slice(0, 10);
  let updates = 0, failures = 0;
  for (const row of rows || []) {
    const portfolio = row.portfolio || [];
    let touched = false;
    for (const h of portfolio) {
      if (h.type !== "fund" && h.type !== "kiwisaver") continue;
      const key = `${(h.symbol || "").toUpperCase()}::${(h.provider || "").toLowerCase()}`;
      const p = priceMap.get(key);
      if (p?.price) {
        h.currentPrice = p.price;
        h.manualPriceDate = today;
        if (p.fund_name && !h.name) h.name = p.fund_name;
        touched = true;
        updates++;
      } else {
        failures++;
        // Write a notification for this user (RLS-bypassed via service role)
        await supa.from("notifications").insert({
          user_id:    row.user_id,
          kind:       "fund_refresh_failed",
          severity:   "warning",
          title:      `Couldn't auto-refresh ${h.symbol}`,
          body:       p?.error || "Provider site didn't return a matching fund. Update the price manually for now.",
          link_url:   "https://investiq-nz.netlify.app/#holdings",
          link_label: "Open Holdings",
          metadata:   { symbol: h.symbol, provider: h.provider, source: p?.source }
        });
      }
    }
    if (touched) {
      await supa.from("investiq_portfolios")
        .update({ portfolio, updated_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
    }
  }

  // Drop a summary notification to the admin too
  if (updates > 0 || failures > 0) {
    // Find admin users
    const { data: admins } = await supa.from("profiles").select("id").eq("is_admin", true);
    for (const a of admins || []) {
      await supa.from("notifications").insert({
        user_id:    a.id,
        kind:       "fund_refresh_summary",
        severity:   failures > 0 ? "warning" : "success",
        title:      `NZ fund auto-refresh · ${updates} updated, ${failures} failed`,
        body:       `${lookupMap.size} unique fund codes across ${rows?.length || 0} portfolios. Daily 14:00 UTC schedule.`,
        metadata:   { lookups: lookupMap.size, updates, failures }
      });
    }
  }

  return new Response(JSON.stringify({
    ran_at:        new Date().toISOString(),
    unique_funds:  lookupMap.size,
    portfolios:    rows?.length || 0,
    updates,
    failures
  }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
});
