// supabase/functions/daily-backup/index.ts
//
// SECURITY C4 — Daily Postgres backup written to Supabase Storage.
//
// Triggered daily by pg_cron. Service-role reads all critical tables,
// serialises to JSON, uploads to a private 'backups' bucket with the
// date in the filename. Deletes backups older than 30 days to control
// storage cost.
//
// Why JSON instead of pg_dump:
//   - Edge Functions are Deno, can't shell out to pg_dump binary
//   - JSON is portable: restore on any Postgres, sanity-check in any
//     editor, diff between days
//   - Tradeoff: doesn't preserve schema (only data). Schema lives in
//     supabase/migrations/ already, version-controlled in git.
//
// Restore procedure: see daily-backup/RESTORE.md
//
// Required env (auto-injected by Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Required env (manual):
//   CRON_SECRET  — shared secret with the cron job

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPA_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPA_SRV    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const supa = createClient(SUPA_URL, SUPA_SRV, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Cron-Secret",
  "Access-Control-Max-Age":       "86400"
};

const BUCKET = "backups";
const RETENTION_DAYS = 30;

// Tables to back up. Order matters for restore (FK dependencies):
//   profiles must come before family_members
//   families must come before family_members
const TABLES = [
  "profiles",
  "families",
  "family_members",
  "family_invites",
  "investiq_portfolios",
  "investiq_snapshots",
  "investiq_activity_log",
  "price_alerts"
];

async function ensureBucket() {
  // Create bucket if missing. Private (no public URL access).
  const { data, error } = await supa.storage.getBucket(BUCKET);
  if (data) return;
  if (error && !error.message.includes("not found")) {
    throw error;
  }
  const { error: createErr } = await supa.storage.createBucket(BUCKET, {
    public: false
  });
  if (createErr) throw createErr;
}

async function dumpTable(name: string) {
  // Pull all rows. For very large tables this paginates implicitly via PostgREST.
  // At current scale (single-user) this is fine; the limit is 1000 rows by
  // default which we explicitly raise. Snapshot table could exceed this at
  // multi-user scale — switch to chunked range() reads if so.
  const { data, error } = await supa
    .from(name)
    .select("*")
    .limit(50000);
  if (error) {
    console.warn(`[backup] ${name}: ${error.message}`);
    return { rows: 0, error: error.message };
  }
  return { rows: data?.length || 0, data };
}

async function pruneOldBackups() {
  const { data: files, error } = await supa.storage.from(BUCKET).list();
  if (error || !files) return { pruned: 0, error: error?.message };
  const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const oldFiles = files.filter(f => {
    if (f.created_at) return new Date(f.created_at).getTime() < cutoffMs;
    // Fallback: parse date from filename like backup-2026-05-16.json
    const m = f.name.match(/^backup-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) return false;
    return new Date(m[1]).getTime() < cutoffMs;
  });
  if (!oldFiles.length) return { pruned: 0 };
  const { error: delErr } = await supa.storage
    .from(BUCKET)
    .remove(oldFiles.map(f => f.name));
  return { pruned: oldFiles.length, error: delErr?.message };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // X-Cron-Secret gate
  const provided = req.headers.get("X-Cron-Secret") || "";
  if (CRON_SECRET && provided !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorised" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  try {
    await ensureBucket();

    // Dump each table
    const tableSummaries: Record<string, { rows: number; error?: string }> = {};
    const dump: any = {
      meta: {
        backup_version: 1,
        timestamp:      new Date().toISOString(),
        source:         SUPA_URL,
        retention_days: RETENTION_DAYS,
        tables:         TABLES
      },
      data: {}
    };
    for (const t of TABLES) {
      const res = await dumpTable(t);
      tableSummaries[t] = { rows: res.rows, error: res.error };
      if (res.data) dump.data[t] = res.data;
    }

    // Upload as JSON. Filename uses today's UTC date so re-runs same-day overwrite.
    const today = new Date().toISOString().slice(0, 10);
    const filename = `backup-${today}.json`;
    const body = JSON.stringify(dump);

    const { error: uploadErr } = await supa.storage
      .from(BUCKET)
      .upload(filename, new Blob([body], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json"
      });

    if (uploadErr) {
      return new Response(JSON.stringify({
        ok: false,
        error: `upload failed: ${uploadErr.message}`,
        tables: tableSummaries
      }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Prune old backups
    const prune = await pruneOldBackups();

    return new Response(JSON.stringify({
      ok: true,
      filename,
      size_bytes: body.length,
      tables:     tableSummaries,
      pruned:     prune.pruned,
      prune_err:  prune.error,
      ran_at:     new Date().toISOString()
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: (e as Error).message || "unexpected"
    }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
