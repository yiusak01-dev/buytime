// aah-push：啱啱好推送通知。
// 只接受資料庫（pg_net）call：要帶 x-push-secret，暗號存喺 Vault，經 service role 讀。
// VAPID 金鑰第一次運行時產生，存喺 Vault；唔會寫喺程式碼入面。
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUBJECT = "mailto:yiusak01@gmail.com";
const TTL_SECONDS = 15 * 60; // 「同一時間同一地點」，過咗 15 分鐘先送到都冇用

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Cfg = { secret: string | null; vapid_public: string | null; vapid_private: string | null };
let cfg: Cfg | null = null;
let cfgAt = 0;

async function loadCfg(force = false): Promise<Cfg> {
  if (cfg && !force && Date.now() - cfgAt < 5 * 60_000) return cfg;
  const { data, error } = await admin.rpc("aah__push_config");
  if (error) throw new Error("config: " + error.message);
  let c = data as Cfg;
  if (!c.vapid_public || !c.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    const { error: e2 } = await admin.rpc("aah__push_init_vapid", { p_public: k.publicKey, p_private: k.privateKey });
    if (e2) throw new Error("init: " + e2.message);
    const again = await admin.rpc("aah__push_config");
    if (again.error) throw new Error("config: " + again.error.message);
    c = again.data as Cfg;
  }
  cfg = c;
  cfgAt = Date.now();
  return c;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ── FCM（將來 Android／iOS app 用；未設定 FCM_SERVICE_ACCOUNT_JSON 就略過）──
function b64url(data: ArrayBuffer | string) {
  const str = typeof data === "string" ? btoa(unescape(encodeURIComponent(data))) : btoa(String.fromCharCode(...new Uint8Array(data)));
  return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function googleToken(email: string, pem: string) {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }))}`;
  const raw = atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s/g, ""));
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(raw, (ch) => ch.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${input}.${b64url(sig)}`,
  });
  const t = await res.json();
  if (!t.access_token) throw new Error("google token failed");
  return t.access_token as string;
}
async function sendFCM(token: string, title: string, body: string, url: string): Promise<"ok" | "gone" | "skip" | "fail"> {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return "skip";
  try {
    const sa = JSON.parse(raw);
    const access = await googleToken(sa.client_email, sa.private_key);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
      body: JSON.stringify({ message: { token, notification: { title, body }, data: { url }, android: { priority: "HIGH", ttl: `${TTL_SECONDS}s` } } }),
    });
    if (res.ok) return "ok";
    if (res.status === 404) return "gone";
    console.error("[aah-push] fcm", res.status, await res.text());
    return "fail";
  } catch (e) {
    console.error("[aah-push] fcm error", e);
    return "fail";
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let c: Cfg;
  try {
    c = await loadCfg();
  } catch (e) {
    console.error("[aah-push]", e);
    return json({ error: "config" }, 500);
  }
  const given = req.headers.get("x-push-secret") ?? "";
  if (!c.secret || !safeEqual(given, c.secret)) {
    c = await loadCfg(true);
    if (!c.secret || !safeEqual(given, c.secret)) return json({ error: "unauthorized" }, 401);
  }

  const payload = await req.json().catch(() => ({}));
  if (payload.init) return json({ ok: true, ready: !!c.vapid_public });

  const { recipient_id, title, body, url, tag } = payload as Record<string, string | undefined>;
  if (!recipient_id || !title) return json({ error: "missing fields" }, 400);

  const { data: subs, error } = await admin.from("aah_push_subscriptions").select("endpoint, subscription").eq("user_id", recipient_id);
  if (error) {
    console.error("[aah-push] lookup", error.message);
    return json({ error: "lookup" }, 500);
  }
  if (!subs?.length) return json({ ok: true, sent: 0 });

  webpush.setVapidDetails(SUBJECT, c.vapid_public!, c.vapid_private!);
  const message = JSON.stringify({ title, body: body ?? "", url: url ?? "/", tag: tag ?? null });
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s: { endpoint: string; subscription: any }) => {
      const sub = s.subscription;
      if (sub?.type === "fcm") {
        const r = await sendFCM(sub.token, title, body ?? "", url ?? "/");
        if (r === "ok") sent++;
        if (r === "gone") {
          await admin.from("aah_push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        }
        return;
      }
      try {
        await webpush.sendNotification(sub, message, { TTL: TTL_SECONDS, urgency: "high" });
        sent++;
      } catch (err: any) {
        const status = err?.statusCode ?? 0;
        if (status === 404 || status === 410) {
          await admin.from("aah_push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        } else {
          console.error("[aah-push] web push failed", status, err?.body ?? err?.message);
        }
      }
    }),
  );
  return json({ ok: true, sent, removed });
});
