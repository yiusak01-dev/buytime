// notify-seller：有新爭議時 email 通知 admin。
// 安全：收件人固定（唔再接受 request 指定），內容會 escape，避免俾人當 email 轉發器濫用。
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "support@buytime.hk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (v: unknown) =>
  String(v ?? "")
    .slice(0, 120)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { transaction_id, mall_name, type } = body ?? {};

    if (type === "dispute") {
      if (!transaction_id || !UUID.test(String(transaction_id))) {
        return new Response(JSON.stringify({ error: "missing params" }), { status: 400, headers: corsHeaders });
      }
      const subject = `🚨 買時間：有新爭議需要裁決`;
      const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
        <h2 style="margin:0 0 12px">🚨 有新爭議需要裁決</h2>
        <p style="color:#555;margin:0 0 8px">交易 <strong>${esc(transaction_id)}</strong> 有用戶提出爭議${mall_name ? `（${esc(mall_name)}）` : ""}。</p>
        <p style="color:#555;margin:0 0 8px">請登入 Admin Panel 查看證據並裁決。</p>
        <p style="margin:16px 0"><a href="https://www.buytime.hk/admin" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">前往 Admin Panel</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#bbb;font-size:11px">買時間 Beta</p>
      </div>`;

      const adminRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "啱啱好 BuyTime <noreply@buytime.hk>", to: ADMIN_EMAIL, subject, html }),
      });
      if (!adminRes.ok) {
        console.error("Resend error:", await adminRes.text());
        return new Response(JSON.stringify({ error: "email send failed" }), { status: 500, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // 其他類型（購買、傾偈）只用推送通知，唔發 email。
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400, headers: corsHeaders });
  }
});
