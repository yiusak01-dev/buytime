// 啱啱好推送通知（app 端）
// - 訂閱存喺 aah_push_subscriptions（經 function，一個人可以有幾部裝置）
// - 推送由伺服器發：app 只係登記／移除裝置
// - 公鑰由資料庫攞（舊版寫死喺程式碼嘅金鑰已經作廢，用舊金鑰嘅訂閱會自動換走）
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const sb = () => supabase as any;
const SW_URL = "/sw.js";
const PREF_KEY = "aah:push";

export type PushSupport = "ok" | "ios-install" | "unsupported" | "native";

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  // 原生 app：要裝咗推送 plugin（Firebase 設定好之後先加）先支援
  if (isNativeApp()) return (window as any).Capacitor?.isPluginAvailable?.("PushNotifications") ? "native" : "unsupported";
  const webPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iPhone／iPad：要「加到主畫面」再由主畫面開，先有推送
  if (isIOS() && !isStandalone()) return "ios-install";
  return webPush ? "ok" : "unsupported";
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function readPref(): "on" | "off" | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}
function writePref(v: "on" | "off") {
  try {
    localStorage.setItem(PREF_KEY, v);
  } catch {
    /* 私密瀏覽等情況：唔記得都冇問題 */
  }
}

let vapidCache: string | null = null;
async function vapidKey(): Promise<string> {
  if (vapidCache) return vapidCache;
  const { data, error } = await sb().rpc("aah_vapid_public_key");
  if (error) throw error;
  if (!data) throw new Error("push not ready");
  vapidCache = data as string;
  return vapidCache;
}

function keyBytes(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(sub: PushSubscription, key: Uint8Array) {
  const k = sub.options?.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

async function registration() {
  const reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  return reg;
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await sb().rpc("aah_save_push_subscription", {
    p_endpoint: json.endpoint,
    p_subscription: json,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

/** 攞（或者整）用而家金鑰嘅訂閱；舊金鑰嘅會先取消 */
async function currentSubscription(create: boolean): Promise<PushSubscription | null> {
  const reg = await registration();
  const key = keyBytes(await vapidKey());
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
  return sub;
}

async function enableNative(): Promise<"on" | "denied" | "error"> {
  const PN = (window as any).Capacitor?.Plugins?.PushNotifications;
  if (!PN) return "error";
  const perm = await PN.requestPermissions();
  if (perm.receive !== "granted") return "denied";
  await PN.register();
  const token: string | null = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 10000);
    PN.addListener("registration", (tk: { value: string }) => {
      clearTimeout(t);
      resolve(tk.value);
    });
    PN.addListener("registrationError", () => {
      clearTimeout(t);
      resolve(null);
    });
  });
  if (!token) return "error";
  const { error } = await sb().rpc("aah_save_push_subscription", { p_endpoint: `fcm:${token}`, p_subscription: { type: "fcm", token }, p_user_agent: navigator.userAgent });
  if (error) return "error";
  writePref("on");
  return "on";
}

/** 用家撳「開通知」 */
export async function enablePush(): Promise<"on" | "denied" | "unsupported" | "ios-install" | "error"> {
  const support = pushSupport();
  if (support === "native") return enableNative();
  if (support !== "ok") return support;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const sub = await currentSubscription(true);
    if (!sub) return "error";
    await saveSubscription(sub);
    writePref("on");
    return "on";
  } catch (e) {
    console.warn("[push] enable failed", e);
    return "error";
  }
}

/** 用家撳「關通知」 */
export async function disablePush() {
  writePref("off");
  if (pushSupport() !== "ok") return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await sb().rpc("aah_remove_push_subscription", { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch (e) {
    console.warn("[push] disable failed", e);
  }
}

/** 登出前：呢部裝置唔再收呢個帳戶嘅通知（保留瀏覽器權限，下次登入自動接返） */
export async function removeThisDevice() {
  if (pushSupport() !== "ok") return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sb().rpc("aah_remove_push_subscription", { p_endpoint: sub.endpoint });
  } catch {
    /* 登出唔可以因為呢度失敗而卡住 */
  }
}

/**
 * 開 app／登入後：已經俾咗權限而冇閂過，就確保呢部裝置登記咗（亦會換走舊金鑰嘅訂閱）。
 * 未登入都會清走舊金鑰嘅訂閱。
 */
export async function syncPush(signedIn: boolean) {
  if (pushSupport() !== "ok" || pushPermission() !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!reg && !signedIn) return;
    const want = signedIn && readPref() !== "off";
    const sub = await currentSubscription(want);
    if (sub && want) await saveSubscription(sub);
  } catch (e) {
    console.warn("[push] sync failed", e);
  }
}

async function isOn(): Promise<boolean> {
  if (readPref() === "off") return false;
  if (pushSupport() === "native") return readPref() === "on";
  if (pushSupport() !== "ok" || pushPermission() !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return false;
    return sameKey(sub, keyBytes(await vapidKey()));
  } catch {
    return false;
  }
}

export function usePush() {
  const [state, setState] = useState<{ support: PushSupport; permission: NotificationPermission | "unsupported"; on: boolean; busy: boolean; ready: boolean }>(() => ({
    support: pushSupport(),
    permission: pushPermission(),
    on: false,
    busy: false,
    ready: false,
  }));
  const refresh = useCallback(async () => {
    const on = await isOn();
    setState((s) => ({ ...s, support: pushSupport(), permission: pushPermission(), on, ready: true }));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const enable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }));
    const r = await enablePush();
    await refresh();
    setState((s) => ({ ...s, busy: false }));
    return r;
  }, [refresh]);
  const disable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }));
    await disablePush();
    await refresh();
    setState((s) => ({ ...s, busy: false }));
  }, [refresh]);
  return { ...state, enable, disable, refresh };
}
