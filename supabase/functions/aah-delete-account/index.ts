// aah-delete-account：用家喺 app 入面刪除自己個帳戶。
// 1. 用 JWT 確認係本人；2. 資料庫 aah__delete_account：檢查冇進行中配對、收 post、名同訊息匿名、清空 profile；
// 3. 清走推送裝置同位置紀錄；4. 軟刪除 auth 用戶：email 會被清走、唔可以再登入，但對方嘅配對紀錄唔會斷。
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "not signed in" }, 401);
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return json({ error: "not signed in" }, 401);
  const uid = data.user.id;

  const { error: cleanErr } = await admin.rpc("aah__delete_account", { p_user: uid });
  if (cleanErr) {
    if (/active match/.test(cleanErr.message)) return json({ error: "active match" }, 409);
    console.error("[aah-delete-account] cleanup", cleanErr.message);
    return json({ error: "cleanup failed" }, 500);
  }

  const { error: pushErr } = await admin.from("aah_push_subscriptions").delete().eq("user_id", uid);
  const { error: presErr } = await admin.from("aah_presence").delete().eq("user_id", uid);
  if (pushErr || presErr) {
    console.error("[aah-delete-account] devices", pushErr?.message, presErr?.message);
    return json({ error: "cleanup failed" }, 500);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(uid, true);
  if (delErr) {
    console.error("[aah-delete-account] auth", delErr.message);
    return json({ error: "delete failed" }, 500);
  }
  return json({ ok: true });
});
