// ═══════════════════════════════════════════════════════════════════════
// submit-fund-form — emails a completed Harbour fund instruction (Additional
// Investment or Redemption) to the operations inbox, with the authorised
// signatures embedded inline AND attached, for manual verification/processing.
//
// PROTOTYPE / TRIAL: this produces an INSTRUCTION EMAIL for a human at Harbour/
// APEX operations to verify and action. It is NOT a live transaction and does
// not itself move money or units.
//
// Secrets (Supabase → Edge Functions → Manage secrets):
//   RESEND_API_KEY     — Resend key (same one the digest/notify functions use)
//   RESEND_FROM_EMAIL   — e.g. "Harbour IQ <onboarding@resend.dev>"
//   FUND_OPS_EMAILS     — comma-separated recipients. Defaults to
//                         gothamdinesh@gmail.com (the trial ops stand-in).
//                         Change to client@harbourasset.co.nz / APEX only once
//                         a sending domain is verified and the trial is over.
//
// Keep "Verify JWT" ON — only a signed-in Harbour IQ user can submit.
// ═══════════════════════════════════════════════════════════════════════

const RESEND_KEY  = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL  = Deno.env.get("RESEND_FROM_EMAIL") || "Harbour IQ <onboarding@resend.dev>";
const OPS_EMAILS  = (Deno.env.get("FUND_OPS_EMAILS") || "gothamdinesh@gmail.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
}

// data:image/png;base64,XXXX → { mime, b64 } (or null if not a data URL)
function parseDataUrl(u: string): { mime: string; b64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(u || "");
  return m ? { mime: m[1], b64: m[2] } : null;
}

function money(n: unknown): string {
  const v = parseFloat(String(n ?? "").replace(/[$,\s]/g, ""));
  return isNaN(v) ? esc(String(n ?? "")) : v.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: CORS });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (!RESEND_KEY) return json(500, { ok: false, error: "RESEND_API_KEY not set in this project" });

  let p: any;
  try { p = await req.json(); } catch { return json(400, { ok: false, error: "bad json" }); }

  const type = p.type === "redeem" ? "redeem" : "invest";
  const isRedeem = type === "redeem";
  const title = isRedeem ? "Redemption" : "Additional Investment";
  const accountName = String(p.accountName || "").slice(0, 200);
  const hrNumber    = String(p.hrNumber || "").slice(0, 60);
  const date        = String(p.date || "").slice(0, 40);
  const rows        = Array.isArray(p.rows) ? p.rows.slice(0, 5) : [];
  const total       = String(p.total || "");
  const submittedBy = String(p.submittedBy || "").slice(0, 200);
  const signatories = Array.isArray(p.signatories) ? p.signatories.slice(0, 2) : [];

  if (!accountName || !rows.length) return json(400, { ok: false, error: "accountName and at least one fund row required" });
  if (!signatories.some((s: any) => s && s.signature)) return json(400, { ok: false, error: "at least one signature required" });

  const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  // ── Build inline signature blocks + Resend attachments ──
  const attachments: Array<{ filename: string; content: string; content_id: string }> = [];
  const sigBlocks = signatories.map((s: any, i: number) => {
    const parsed = parseDataUrl(s?.signature || "");
    let img = '<div style="color:#94a3b8;font-size:12px;">(no signature captured)</div>';
    if (parsed) {
      const cid = `sig${i + 1}`;
      const ext = parsed.mime.includes("jpeg") ? "jpg" : "png";
      attachments.push({ filename: `signature-${i + 1}.${ext}`, content: parsed.b64, content_id: cid });
      img = `<img src="cid:${cid}" alt="signature ${i + 1}" style="max-width:280px;max-height:90px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;" />`;
    }
    return `<div style="margin:10px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Authorised signatory ${i + 1}</div>
      <div style="font-size:15px;font-weight:600;color:#0b1220;margin:2px 0 8px;">${esc(s?.fullName || "—")}</div>
      ${img}
    </div>`;
  }).join("");

  const rowsHtml = rows.map((r: any) => `<tr>
    <td style="padding:6px 10px;border:1px solid #e2e8f0;">${esc(r.fund || "")}</td>
    <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">${isRedeem ? esc(r.amount || "") : "$" + money(r.amount)}</td>
  </tr>`).join("");

  const bankHtml = isRedeem ? `
    <h3 style="font-size:13px;color:#005A79;margin:18px 0 6px;">Proceeds to client bank account</h3>
    <table style="border-collapse:collapse;font-size:13px;">
      <tr><td style="padding:4px 10px;color:#64748b;">Account name</td><td style="padding:4px 10px;font-weight:600;">${esc(p.bankAccountName || "—")}</td></tr>
      <tr><td style="padding:4px 10px;color:#64748b;">Bank & branch</td><td style="padding:4px 10px;font-weight:600;">${esc(p.bankNameBranch || "—")}</td></tr>
      <tr><td style="padding:4px 10px;color:#64748b;">Account number</td><td style="padding:4px 10px;font-weight:600;">${esc(p.bankAccountNumber || "—")}</td></tr>
    </table>` : `
    <h3 style="font-size:13px;color:#005A79;margin:18px 0 6px;">Nature & purpose (first-time)</h3>
    <div style="font-size:13px;color:#334155;">${esc(p.naturePurpose || "—")}</div>`;

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#0b1220;">
    <div style="background:#005A79;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85;">Harbour IQ · Transaction instruction</div>
      <div style="font-size:22px;font-weight:800;margin-top:2px;">${esc(title)}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 12px;font-size:12px;color:#92400E;margin-bottom:16px;">
        ⚠ Prototype instruction generated by Harbour IQ for manual verification &amp; processing. This is <b>not</b> a live transaction and does not itself move money or units.
      </div>
      <table style="border-collapse:collapse;font-size:13px;margin-bottom:8px;">
        <tr><td style="padding:4px 10px;color:#64748b;">Account name</td><td style="padding:4px 10px;font-weight:700;font-size:15px;">${esc(accountName)}</td></tr>
        <tr><td style="padding:4px 10px;color:#64748b;">HR number</td><td style="padding:4px 10px;font-weight:600;">${esc(hrNumber || "—")}</td></tr>
        <tr><td style="padding:4px 10px;color:#64748b;">Date</td><td style="padding:4px 10px;font-weight:600;">${esc(date || "—")}</td></tr>
      </table>
      <h3 style="font-size:13px;color:#005A79;margin:18px 0 6px;">${isRedeem ? "Redeem from" : "Invest into"}</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead><tr style="background:#f1f5f9;"><th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Fund</th><th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">Amount ${isRedeem ? "(units / $ / full)" : "($)"}</th></tr></thead>
        <tbody>${rowsHtml}
          <tr><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:700;text-align:right;">Total</td><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:700;text-align:right;">${isRedeem ? esc(total) : "$" + money(total)}</td></tr>
        </tbody>
      </table>
      ${bankHtml}
      ${p.confirmationEmail ? `<div style="font-size:12px;color:#64748b;margin-top:14px;">Confirmations / queries to: <b style="color:#0b1220;">${esc(p.confirmationEmail)}</b></div>` : ""}
      <h3 style="font-size:13px;color:#005A79;margin:18px 0 6px;">Authorised signatories</h3>
      ${sigBlocks}
      <div style="border-top:1px solid #e2e8f0;margin-top:18px;padding-top:10px;font-size:11px;color:#64748b;line-height:1.6;">
        Submitted via Harbour IQ by <b>${esc(submittedBy || "unknown")}</b> at ${esc(when)}.
        Client confirms funds/units per the Harbour Investment Funds PDS terms. Verify signatory identity and mandate before processing.
      </div>
    </div>
  </div>`;

  const subject = `[Harbour IQ] ${title} — ${accountName}${date ? " — " + date : ""}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: OPS_EMAILS, subject, html, attachments }),
    });
    if (!res.ok) return json(502, { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` });
    return json(200, { ok: true, sentTo: OPS_EMAILS, subject });
  } catch (e) {
    return json(502, { ok: false, error: String((e as Error).message || e) });
  }
});
