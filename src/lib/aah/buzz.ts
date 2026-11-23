// 有新訊息：震一下（iPhone／Android app 用原生震動；網頁版支援就用 navigator.vibrate）
import { Capacitor } from "@capacitor/core";

let last = 0;
export async function buzz() {
  // 一次過嚟幾條訊息唔好連環震
  if (Date.now() - last < 1500) return;
  last = Date.now();
  try {
    if (Capacitor.isNativePlatform()) {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Success });
      return;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([60, 60, 60]);
  } catch {
    /* 震唔到唔緊要 */
  }
}
