// supabase/functions/family-invite/index.ts
//
// Sends a family-invite email via Resend. Called by the frontend after the
// caller has already INSERTed a row into family_invites (which produced a
// token + code). This function just looks up the invite, formats an email,
// and sends it.
//
// Why an Edge Function instead of inline frontend Resend call?
//   - Resend API key stays server-side (already set as RESEND_API_KEY secret
//     for the weekly-digest function — reused here)
//   - Verifies the caller actually has rights to send for this family
//     (uses Supabase JWT → service-role lookup)
//
// Deploy via Dashboard: create function "family-invite", paste this code,
// uncheck Verify JWT (we handle auth via X-Cron-Secret pattern... actually
// for this function we DO want JWT verification ON because we use the
// caller's identity to authorise the send. So leave Verify JWT ENABLED.)

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPA_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPA_SRV  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "InvestIQ <onboarding@resend.dev>";
const APP_URL    = Deno.env.get("APP_URL") || "https://investiq-nz.netlify.app";

const supa = createClient(SUPA_URL, SUPA_SRV, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age":       "86400"
};

function emailHtml(opts: {
  inviterName: string;
  familyName: string;
  role: string;
  acceptUrl: string;
  code: string;
}) {
  const roleDesc: Record<string, string> = {
    owner:  "as a co-owner (full control)",
    adult:  "as an adult member (full access to family data)",
    teen:   "as a teen (manage your own portfolio, see family total)",
    child:  "as a child (custodial — adults manage on your behalf)",
    viewer: "as a viewer (read-only, e.g. accountant or partner)"
  };
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a1120;color:#c8d6ef;padding:32px 24px;max-width:560px;margin:0 auto;border-radius:16px;">
    <div style="font-size:24px;font-weight:700;color:#818cf8;margin-bottom:4px;">InvestIQ</div>
    <div style="font-size:13px;color:#7a9cc0;margin-bottom:28px;">You've been invited to join a family portfolio</div>

    <div style="font-size:15px;color:#c8d6ef;margin-bottom:18px;line-height:1.6;">
      <b>${opts.inviterName}</b> has invited you to join the <b>${opts.familyName}</b> family on InvestIQ
      ${roleDesc[opts.role] || ''}.
    </div>

    <div style="background:#0f1729;border:1px solid #1e2d4a;border-radius:12px;padding:20px;margin-bottom:18px;">
      <div style="font-size:11px;color:#7a9cc0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Click to accept</div>
      <a href="${opts.acceptUrl}" style="display:inline-block;background:#6366f1;color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;margin-top:6px;">Accept invite →</a>
      <div style="font-size:11px;color:#7a9cc0;margin-top:14px;line-height:1.5;">
        Or open the app and enter the invite code:<br>
        <span style="font-family:'SF Mono','Consolas',monospace;font-size:18px;color:#fbbf24;letter-spacing:2px;font-weight:700;">${opts.code}</span>
      </div>
    </div>

    <div style="font-size:12px;color:#7a9cc0;line-height:1.6;">
      InvestIQ is a personal portfolio dashboard for NZ investors. Each family member has their own login and portfolio — the family layer just adds shared visibility and aggregate views.
      <br><br>
      This invite expires in 7 days. If you weren't expecting it, you can safely ignore this email.
    </div>
  </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    // Pull invite_id from body. The frontend has already INSERTed the row
    // (passing RLS — only owner/adult can insert for a family they're in).
    const body = await req.json().catch(() => ({}));
    const inviteId = body.invite_id;
    if (!inviteId) {
      return new Response(JSON.stringify({ error: "invite_id required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Auth: who's calling? Pull from JWT.
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "no auth" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    const { data: userRes, error: userErr } = await supa.auth.getUser(jwt);
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "invalid jwt" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    const callerId = userRes.user.id;

    // Lookup invite + family + caller profile
    const { data: invite, error: invErr } = await supa
      .from("family_invites")
      .select("id, family_id, email, role, token, code, expires_at, used_at, invited_by")
      .eq("id", inviteId)
      .single();
    if (invErr || !invite) {
      return new Response(JSON.stringify({ error: "invite not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    if (invite.used_at) {
      return new Response(JSON.stringify({ error: "invite already used" }), {
        status: 410, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    if (invite.invited_by !== callerId) {
      return new Response(JSON.stringify({ error: "not your invite to send" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    if (!invite.email) {
      return new Response(JSON.stringify({ error: "invite has no email — share the code verbally instead" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Fetch family name + inviter name
    const { data: family } = await supa.from("families").select("name").eq("id", invite.family_id).single();
    const { data: inviterProfile } = await supa
      .from("profiles").select("email, display_name").eq("id", callerId).single();
    const inviterName = inviterProfile?.display_name || inviterProfile?.email?.split("@")[0] || "Someone";

    // Build accept URL — frontend reads ?family_invite=<token> on load.
    const acceptUrl = `${APP_URL}?family_invite=${encodeURIComponent(invite.token)}`;

    // Send via Resend
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured on this function" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to:   invite.email,
        subject: `${inviterName} invited you to a family portfolio on InvestIQ`,
        html: emailHtml({
          inviterName,
          familyName:  family?.name || "their",
          role:        invite.role,
          acceptUrl,
          code:        invite.code
        })
      })
    });
    if (!resendRes.ok) {
      const t = await resendRes.text();
      return new Response(JSON.stringify({ error: `Resend ${resendRes.status}: ${t.slice(0, 200)}` }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      sent_to: invite.email,
      code:    invite.code,    // returned so frontend can also show the code
      expires: invite.expires_at
    }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "unexpected" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
