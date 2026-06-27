// ═══════════════════════════════════════════════════════════════════════
// notify-signup — emails the admin(s) when a new user signs up, and emails
// the user when an admin approves them. Sent via Resend (same key as the
// weekly digest). Deploy to EACH project (personal + harbour).
//
// Secrets (Supabase → Edge Functions → Manage secrets):
//   RESEND_API_KEY        — your Resend API key (already set for the digest)
//   RESEND_FROM_EMAIL     — e.g. "Harbour IQ <onboarding@resend.dev>"
//   ADMIN_NOTIFY_EMAILS   — comma-separated admin recipients. Defaults to
//                           gothamdinesh@gmail.com (set this to add more).
//
// Keep "Verify JWT" ON (default) so only authenticated calls (a real signup
// session, or an admin) can trigger it.
//
// Body: { "type": "signup" | "approved", "email": "user@x.com", "edition": "Harbour IQ" }
//   signup   → notifies the admins that someone signed up (awaiting approval)
//   approved → notifies the user that they've been approved
// ═══════════════════════════════════════════════════════════════════════

const RESEND_KEY  = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL  = Deno.env.get("RESEND_FROM_EMAIL") || "InvestIQ <onboarding@resend.dev>";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_NOTIFY_EMAILS")
  || "gothamdinesh@gmail.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

function esc(s: string): string {
  return String(s || "").replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
}

async function sendEmail(to: string | string[], subject: string, html: string) {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

function shell(title: string, body: string): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a1120;color:#c8d6ef;padding:32px 24px;max-width:560px;margin:0 auto;border-radius:16px;">
    <div style="font-size:22px;font-weight:700;color:#818cf8;margin-bottom:18px;">${esc(title)}</div>
    ${body}
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: CORS });

  let payload: { type?: string; email?: string; edition?: string };
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }); }

  const type    = payload.type === "approved" ? "approved" : "signup";
  const email   = (payload.email || "").slice(0, 200);
  const edition = (payload.edition || "InvestIQ").slice(0, 60);
  const when    = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  let result;
  if (type === "approved") {
    // Tell the just-approved user they're in.
    if (!email) return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    result = await sendEmail(
      email,
      `You're approved — ${edition}`,
      shell(`${esc(edition)} access approved`, `
        <div style="font-size:14px;line-height:1.6;color:#94a3b8;">
          Good news — your access to <b style="color:#c8d6ef;">${esc(edition)}</b> has been approved.
          You can sign in now and start using the dashboard.
        </div>`)
    );
  } else {
    // Notify the admins that someone signed up and is awaiting approval.
    result = await sendEmail(
      ADMIN_EMAILS,
      `New ${edition} signup awaiting approval: ${email}`,
      shell(`New ${esc(edition)} signup`, `
        <div style="background:#0f1729;border:1px solid #1e2d4a;border-radius:12px;padding:18px;margin-bottom:16px;">
          <div style="font-size:11px;color:#7a9cc0;text-transform:uppercase;letter-spacing:0.5px;">Email</div>
          <div style="font-size:18px;font-weight:700;color:#c8d6ef;margin:4px 0;">${esc(email)}</div>
          <div style="font-size:12px;color:#7a9cc0;">${esc(edition)} · ${esc(when)}</div>
        </div>
        <div style="font-size:14px;line-height:1.6;color:#94a3b8;">
          They're in the <b style="color:#fbbf24;">pending</b> state and can't access the app yet.
          Open <b style="color:#c8d6ef;">Admin → Users</b> in ${esc(edition)} to Approve or leave them pending.
        </div>`)
    );
  }

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 502,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
