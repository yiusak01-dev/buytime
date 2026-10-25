// 平時部署嘅係一個關閉版（410）。要再試：用呢個檔重新 deploy（verify_jwt 關），用 Vault 推送暗號 call 一次，試完再換返關閉版。
// aah-selftest：上線後喺正式環境由頭到尾試一次真實流程（同 app 一樣用 supabase-js + 公開 key）。
// 只接受帶住推送暗號（Vault aah_push_secret）嘅 call；試完會用刪除帳戶功能清走兩個測試帳戶。
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

type U = { id: string; email: string; client: SupabaseClient; token: string };

Deno.serve(async (req) => {
  const { data: cfg } = await admin.rpc("aah__push_config");
  if (!cfg?.secret || req.headers.get("x-push-secret") !== cfg.secret) return json({ error: "unauthorized" }, 401);

  const results: { n: number; step: string; ok: boolean; detail: string }[] = [];
  const check = (step: string, ok: unknown, detail: unknown = "") => results.push({ n: results.length + 1, step, ok: !!ok, detail: String(detail ?? "").slice(0, 160) });
  const errOf = async (p: PromiseLike<{ error: { message: string } | null }>) => (await p).error?.message ?? "";
  const pw = crypto.randomUUID() + "Aa1!";
  const ts = Date.now();
  const users: U[] = [];

  async function make(tag: string): Promise<U> {
    const email = `aah-selftest-${tag}-${ts}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (error || !data.user) throw new Error(`create ${tag}: ${error?.message}`);
    const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password: pw });
    if (e2 || !s.session) throw new Error(`sign in ${tag}: ${e2?.message}`);
    const u = { id: data.user.id, email, client, token: s.session.access_token };
    users.push(u);
    return u;
  }
  async function deleteViaApp(u: U) {
    const r = await fetch(`${URL}/functions/v1/aah-delete-account`, { method: "POST", headers: { Authorization: `Bearer ${u.token}`, apikey: ANON, "Content-Type": "application/json" }, body: "{}" });
    return { status: r.status, body: await r.text() };
  }

  try {
    const A = await make("a");
    const B = await make("b");
    check("建立兩個測試帳戶，用 email 密碼登入", A.token && B.token);

    const { data: st } = await A.client.from("aah_settings").select("key,value");
    const set = new Map((st ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    check("上線設定：測試位置關、強制 GPS 開、免費置頂開", set.get("allow_test_location") === false && set.get("enforce_gps") === true && set.get("free_pin_trial") !== false, JSON.stringify(st));

    check("註冊暱稱（甲）", !(await errOf(A.client.from("aah_profiles").insert({ id: A.id, nickname: "測試甲" }))));
    check("註冊暱稱（乙）", !(await errOf(B.client.from("aah_profiles").insert({ id: B.id, nickname: "測試乙" }))));

    // 揀一個而家冇人喺度嘅商場，避免打擾真用家
    const { data: present } = await admin.from("aah_presence").select("mall_id").gte("seen_at", new Date(Date.now() - 3 * 3600_000).toISOString());
    const busy = new Set((present ?? []).map((p: { mall_id: string }) => String(p.mall_id)));
    const { data: malls } = await admin.from("malls").select("id,name,lat,lng").eq("is_active", true).not("lat", "is", null).order("id").limit(50);
    const mall = (malls ?? []).find((m: { id: number }) => !busy.has(String(m.id)));
    if (!mall) throw new Error("no quiet mall");
    const mallId = String(mall.id);
    const lat = Number(mall.lat), lng = Number(mall.lng);

    check("乙喺商場（記錄位置）", !(await errOf(B.client.rpc("aah_touch_presence", { p_mall: mallId }))), mall.name);

    const leave = new Date(Date.now() + 20 * 60_000).toISOString();
    const post = await A.client.rpc("aah_create_post", { p: { scenario: "offer", direction: "have", mall_id: mallId, mall_name: mall.name, shop: "系統測試（請忽略）", fields: { title: "系統測試" }, price: 0, pay_methods: ["cash"], leave_at: leave, verified_on_site: true, auto_accept: false } });
    const postId = post.data as string;
    check("甲出 post（GPS 已確認）", !post.error && postId, post.error?.message ?? postId);

    const off = await A.client.rpc("aah_create_post", { p: { scenario: "groupbuy", direction: "join", mall_id: mallId, mall_name: mall.name, shop: "系統測試", fields: {}, price: null, pay_methods: [], leave_at: leave, verified_on_site: false, need_count: 2 } });
    check("上線後：GPS 未確認唔准出 post", /not on site/.test(off.error?.message ?? ""), off.error?.message ?? "竟然出到");

    const seen = await B.client.from("aah_posts").select("id,author_name,pushed_count").eq("id", postId).maybeSingle();
    check("乙喺 feed 見到個 post", seen.data?.id === postId, `作者=${seen.data?.author_name} 附近用戶=${seen.data?.pushed_count}`);

    check("乙撳有興趣", !(await errOf(B.client.rpc("aah_express_interest", { p_post: postId, p_text: "我有興趣，5 分鐘到", p_offer: null }))));

    const ints = await A.client.from("aah_interests").select("id,status,display_name").eq("post_id", postId);
    check("甲睇到有興趣名單", ints.data?.length === 1 && ints.data[0].status === "pending", JSON.stringify(ints.data));

    const acc = await A.client.rpc("aah_accept_interest", { p_interest: ints.data?.[0]?.id, p_price: null });
    const matchId = acc.data as string;
    check("甲接受，配對成功", !acc.error && matchId, acc.error?.message ?? matchId);

    check("乙傳訊息", !(await errOf(B.client.from("aah_messages").insert({ match_id: matchId, from_id: B.id, text: "我著白色衫" }))));
    const msgs = await A.client.from("aah_messages").select("text,from_id").eq("match_id", matchId);
    check("甲收到對話", (msgs.data ?? []).some((m: { text: string }) => m.text === "我著白色衫"), `${msgs.data?.length} 句`);
    check("權限：冒認對方傳唔到訊息", !!(await errOf(A.client.from("aah_messages").insert({ match_id: matchId, from_id: B.id, text: "冒認" }))));

    check("雙方確認見面", !(await errOf(A.client.rpc("aah_confirm_meet", { p_match: matchId }))) && !(await errOf(B.client.rpc("aah_confirm_meet", { p_match: matchId }))));

    const far = await B.client.rpc("aah_mark_arrived", { p_match: matchId, p_lat: lat + 0.05, p_lng: lng + 0.05 });
    check("上線後：GPS 唔喺商場撳唔到「我到咗」", /not at mall/.test(far.error?.message ?? ""), far.error?.message ?? far.data);
    const nogps = await B.client.rpc("aah_mark_arrived", { p_match: matchId, p_lat: null, p_lng: null });
    check("上線後：冇 GPS 撳唔到「我到咗」", /gps required/.test(nogps.error?.message ?? ""), nogps.error?.message ?? nogps.data);

    const a1 = await A.client.rpc("aah_mark_arrived", { p_match: matchId, p_lat: lat + 0.0005, p_lng: lng });
    const b1 = await B.client.rpc("aah_mark_arrived", { p_match: matchId, p_lat: lat, p_lng: lng + 0.0005 });
    check("雙方喺商場撳「我到咗」→ 完成", a1.data === "waiting" && b1.data === "completed", `${a1.data ?? a1.error?.message} → ${b1.data ?? b1.error?.message}`);

    const pa = await A.client.from("aah_profiles").select("points").eq("id", A.id).single();
    const pb = await B.client.from("aah_profiles").select("points").eq("id", B.id).single();
    check("計分：俾嘢嗰個 30 分、接收嗰個 10 分", pa.data?.points === 30 && pb.data?.points === 10, `甲=${pa.data?.points} 乙=${pb.data?.points}`);
  } catch (e) {
    check("流程中斷", false, (e as Error).message);
  }

  // 清走：用 app 嘅刪除帳戶功能
  for (const u of users) {
    const r = await deleteViaApp(u);
    check(`刪除測試帳戶（${u.email.split("-")[2]}）`, r.status === 200, r.body);
    if (r.status !== 200) {
      await admin.rpc("aah__delete_account", { p_user: u.id });
      await admin.auth.admin.deleteUser(u.id, true);
    }
    const again = await createClient(URL, ANON, { auth: { persistSession: false } }).auth.signInWithPassword({ email: u.email, password: pw });
    check("刪除後登入唔到", !!again.error, again.error?.message ?? "竟然登入到");
  }

  return json({ passed: results.filter((r) => r.ok).length, total: results.length, results });
});
