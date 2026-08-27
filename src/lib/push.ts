import { ownSupabase } from "@/integrations/supabase/own-client";

export const VAPID_PUBLIC_KEY =
  "BHMSe8NwD4Wtb2J1yaTAOH24TXZra17AxGZFtJHN1VnRIHaYUGquTQFvb9BdR6c6BaSIUMl67GZGKG3Tfg-8KRI";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** True when running inside a Capacitor native Android/iOS app */
export function isNativeApp(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as any).Capacitor?.isNativePlatform?.()
  );
}

export function pushSupported(): boolean {
  if (isNativeApp()) return true; // FCM always available in native
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Register for FCM push via Capacitor bridge (Android/iOS) */
async function subscribeCapacitorFCM(userId: string): Promise<boolean> {
  try {
    const PushNotifications = (window as any).Capacitor?.Plugins?.PushNotifications;
    if (!PushNotifications) {
      console.warn("[push] Capacitor PushNotifications plugin not found");
      return false;
    }

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") return false;

    await PushNotifications.register();

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      PushNotifications.addListener("registration", async (token: { value: string }) => {
        if (resolved) return;
        resolved = true;
        console.log("[push] FCM token:", token.value);
        const { error } = await (ownSupabase as any).from("push_subscriptions").upsert(
          {
            user_id: userId,
            subscription: { type: "fcm", token: token.value },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        resolve(!error);
      });

      PushNotifications.addListener("registrationError", (err: any) => {
        if (resolved) return;
        resolved = true;
        console.warn("[push] FCM registration error", err);
        resolve(false);
      });

      setTimeout(() => { if (!resolved) { resolved = true; resolve(false); } }, 10000);
    });
  } catch (e) {
    console.warn("[push] Capacitor FCM subscribe failed", e);
    return false;
  }
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (isNativeApp()) return subscribeCapacitorFCM(userId);

  try {
    if (!pushSupported()) return false;
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));
    const { error } = await (ownSupabase as any).from("push_subscriptions").upsert(
      { user_id: userId, subscription: sub.toJSON(), updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (error) { console.warn("[push] save subscription failed", error); return false; }
    return true;
  } catch (e) {
    console.warn("[push] subscribe failed", e);
    return false;
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  try {
    if (isNativeApp()) {
      const PushNotifications = (window as any).Capacitor?.Plugins?.PushNotifications;
      await PushNotifications?.unregister?.();
    } else {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
    }
    await (ownSupabase as any).from("push_subscriptions").delete().eq("user_id", userId);
  } catch (e) {
    console.warn("[push] unsubscribe failed", e);
  }
}

export async function isPushSubscribed(userId?: string): Promise<boolean> {
  try {
    if (isNativeApp() && userId) {
      const { data } = await (ownSupabase as any)
        .from("push_subscriptions")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      return !!data;
    }
    if (!pushSupported()) return false;
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/** Fire-and-forget push to the other party after a chat message is sent. */
export async function sendPushToUser(params: {
  recipient_id: string;
  title: string;
  body: string;
  chat_id?: string;
}): Promise<void> {
  try {
    const LOVABLE_URL = "https://oadwfgujhjqgnydigwux.supabase.co";
    const LOVABLE_ANON =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHdmZ3VqaGpxZ255ZGlnd3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTM0MjMsImV4cCI6MjA5ODc4OTQyM30.Zx2prlmxNXhPB6YWHG09QZr7wiNqHIXvrRcYfrXMnBY";
    await fetch(`${LOVABLE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_ANON}`,
        apikey: LOVABLE_ANON,
      },
      body: JSON.stringify(params),
    });
  } catch (e) {
    console.warn("[push] sendPushToUser failed", e);
  }

  // Also persist the notification so it shows up on the 通告 page.
  // Requires the `notifications` table (see src/routes/announcements.tsx for SQL).
  try {
    const { error } = await (ownSupabase as any).from("notifications").insert({
      user_id: params.recipient_id,
      title: params.title,
      body: params.body,
      chat_id: params.chat_id ?? null,
    });
    if (error) console.warn("[push] save notification skipped:", error.message);
  } catch (e) {
    console.warn("[push] save notification failed", e);
  }
}
