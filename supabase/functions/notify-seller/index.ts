const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { transaction_id, mall_name, type, admin_email } = body;

    // Dispute → notify admin email directly
    if (type === "dispute" && admin_email) {
      if (!transaction_id) {
        return new Response(JSON.stringify({ error: "missing params" }), { status: 400, headers: corsHeaders });
      }
      const subject = `🚨 買時間：有新爭議需要裁決`;
      const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
        <h2 style="margin:0 0 12px">🚨 有新爭議需要裁決</h2>
        <p style="color:#555;margin:0 0 8px">交易 <strong>${transaction_id}</strong> 有用戶提出爭議${mall_name ? `（${mall_name}）` : ""}。</p>
        <p style="color:#555;margin:0 0 8px">請登入 Admin Panel 查看證據並裁決。</p>
        <p style="margin:16px 0"><a href="https://www.buytime.hk/admin" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">前往 Admin Panel</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#bbb;font-size:11px">買時間 Beta</p>
      </div>`;

      const adminRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "買時間 <noreply@buytime.hk>", to: admin_email, subject, html }),
      });
      if (!adminRes.ok) {
        const errText = await adminRes.text();
        console.error("Resend error:", errText);
        return new Response(JSON.stringify({ error: "email send failed", detail: errText }), { status: 500, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ ok: true, to: admin_email }), { headers: corsHeaders });
    }

    // All other notification types (purchase/interest, chat messages) are
    // handled by push notifications only — no email.
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
