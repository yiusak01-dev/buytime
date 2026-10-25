// send-push（舊版 買時間）已停用。
// 原因：舊版唔驗證 call 嘅人（任何人都可以推送任何內容俾任何用戶），而且推送私鑰寫咗喺公開 repo。
// 新版推送由資料庫 trigger 經 aah-push function 發出，用另一套金鑰，存喺 Supabase Vault。
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "send-push has been retired; use aah-push" }), { status: 410, headers: corsHeaders });
});
