// notify-seller（舊版 買時間）已停用。
// 原因：舊版爭議流程已經冇用，而呢個 function 唔驗證 call 嘅人，任何人都可以不停 call 嚟用晒 email 額度
// （註冊確認信同重設密碼信用同一個額度）。新版舉報通知由資料庫 trigger 經 aah-push 發出。
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "notify-seller has been retired" }), { status: 410, headers: corsHeaders });
});
