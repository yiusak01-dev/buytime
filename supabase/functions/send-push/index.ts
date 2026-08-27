// send-push — supports Web Push (VAPID) + FCM native tokens (v1 API)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VAPID_PUBLIC =
  "BHMSe8NwD4Wtb2J1yaTAOH24TXZra17AxGZFtJHN1VnRIHaYUGquTQFvb9BdR6c6BaSIUMl67GZGKG3Tfg-8KRI";
const VAPID_PRIVATE = "xOgyl0RYmyfyQm1tYS7jOVnFnMIkzZQB0oYknUF-OMI";
const VAPID_SUBJECT = "mailto:yiusak01@gmail.com";

const OWN_URL = "https://oadwfgujhjqgnydigwux.supabase.co";
const OWN_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHdmZ3VqaGpxZ255ZGlnd3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTM0MjMsImV4cCI6MjA5ODc4OTQyM30.Zx2prlmxNXhPB6YWHG09QZr7wiNqHIXvrRcYfrXMnBY";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// ── Auto-migration: ensure notifications table exists (runs once per cold start) ──
// Uses OWN_DB_URL when provided (the project the app reads notifications from),
// otherwise falls back to this function's own database.
const migrateNotifications = (async () => {
  const dbUrl = Deno.env.get("OWN_DB_URL") ?? Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    console.warn("[send-push] no DB url, skipping notifications migration");
    return;
  }
  let sql: any;
  try {
    const postgres = (await import("https://deno.land/x/postgresjs@v3.4.4/mod.js")).default;
    sql = postgres(dbUrl, { max: 1 });
    await sql`
      CREATE TABLE IF NOT EXISTS public.notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        title text NOT NULL,
        body text NOT NULL DEFAULT '',
        chat_id text,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC)`;
    await sql`GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated`;
    await sql`GRANT SELECT, INSERT ON public.notifications TO anon`;
    await sql`GRANT ALL ON public.notifications TO service_role`;
    await sql`ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY`;
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='own notifications readable') THEN
          EXECUTE 'CREATE POLICY "own notifications readable" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id)';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='own notifications updatable') THEN
          EXECUTE 'CREATE POLICY "own notifications updatable" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id)';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='anyone can insert notifications') THEN
          EXECUTE 'CREATE POLICY "anyone can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true)';
        END IF;
      END $$;
    `;
    console.log("[send-push] notifications table ready");
  } catch (err) {
    console.error("[send-push] notifications migration failed (ignored)", err);
  } finally {
    try {
      await sql?.end?.({ timeout: 5 });
    } catch { /* ignore */ }
  }
})();



function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "")
    .trim();
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function base64url(data: ArrayBuffer | string): string {
  let str: string;
  if (typeof data === "string") {
    str = btoa(unescape(encodeURIComponent(data)));
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

async function sendFCM(token: string, title: string, body: string, chatId?: string): Promise<void> {
  const saJsonStr = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "";
  if (!saJsonStr) {
    console.warn("[send-push] FCM_SERVICE_ACCOUNT_JSON not set, skipping FCM send");
    return;
  }

  let sa: { client_email: string; private_key: string; project_id: string };
  try {
    sa = JSON.parse(saJsonStr);
  } catch {
    console.error("[send-push] Failed to parse FCM_SERVICE_ACCOUNT_JSON");
    return;
  }

  try {
    const accessToken = await getGoogleAccessToken(sa.client_email, sa.private_key);

    const payload = {
      message: {
        token,
        notification: { title, body },
        data: {
          chat_id: chatId ?? "",
          url: chatId ? `/chat/${chatId}` : "/chats",
        },
        android: { priority: "HIGH" },
      },
    };

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[send-push] FCM v1 error", res.status, text);
    } else {
      console.log("[send-push] FCM v1 sent successfully");
    }
  } catch (err) {
    console.error("[send-push] FCM send error:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await migrateNotifications.catch(() => {});
    const { recipient_id, title, body, chat_id } = await req.json();
    if (!recipient_id || !title || !body) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const own = createClient(OWN_URL, OWN_ANON);
    const { data: row, error } = await own
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", recipient_id)
      .maybeSingle();

    if (error) console.warn("[send-push] lookup error", error.message);

    if (!row?.subscription) {
      return new Response(JSON.stringify({ ok: true, skipped: "no subscription" }), {
        headers: corsHeaders,
      });
    }

    const sub = row.subscription as any;

    // FCM native token (from Capacitor Android/iOS app)
    if (sub.type === "fcm" && sub.token) {
      await sendFCM(sub.token, title, body, chat_id);
      return new Response(JSON.stringify({ ok: true, method: "fcm" }), { headers: corsHeaders });
    }

    // Web Push subscription (browser)
    try {
      const webSub = sub as { endpoint: string; keys: { auth: string; p256dh: string } };
      const payload = JSON.stringify({
        title,
        body,
        chat_id,
        url: chat_id ? `/chat/${chat_id}` : "/chats",
      });
      await webpush.sendNotification(webSub as any, payload, { TTL: 86400 });
    } catch (err: any) {
      const status = err?.statusCode ?? 0;
      if (status === 404 || status === 410) {
        await own.from("push_subscriptions").delete().eq("user_id", recipient_id);
        return new Response(JSON.stringify({ ok: true, removed: true }), { headers: corsHeaders });
      }
      console.error("[send-push] web push failed", status, err?.body ?? err?.message);
      return new Response(JSON.stringify({ ok: false, status, error: err?.message }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: true, method: "webpush" }), { headers: corsHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
