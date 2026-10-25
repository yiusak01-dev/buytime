// 舊版（買時間）推送介面：而家全部轉用 src/lib/aah/push.ts。
// 以前喺瀏覽器直接 call send-push（任何人都可以推送俾任何人），已經停用；
// 推送改為由伺服器喺事件發生時發出。
import { disablePush, enablePush, isNativeApp as aahIsNativeApp, pushSupport, usePush } from "@/lib/aah/push";

export const isNativeApp = aahIsNativeApp;

export function pushSupported(): boolean {
  const s = pushSupport();
  return s === "ok" || s === "native";
}

export async function subscribeToPush(_userId: string): Promise<boolean> {
  return (await enablePush()) === "on";
}

export async function unsubscribeFromPush(_userId: string): Promise<void> {
  await disablePush();
}

export async function isPushSubscribed(_userId?: string): Promise<boolean> {
  if (!pushSupported() || typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** 已停用：推送而家由伺服器發，瀏覽器唔可以再直接推送俾其他人。 */
export async function sendPushToUser(_params: { recipient_id: string; title: string; body: string; chat_id?: string }): Promise<void> {
  // no-op
}

export { usePush };
