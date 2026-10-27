// 原生 app（iPhone／Android，用 Capacitor 包裝）專用嘅設定。網頁版唔會行呢度嘅嘢。
import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
export const nativePlatform = () => Capacitor.getPlatform() as "ios" | "android" | "web";

let started = false;

/**
 * 開 app 時做一次：狀態列顏色、收起開 app 畫面、Android 返回掣、
 * 由連結打開 app（例如 https://www.buytime.hk/post/xxx）就跳去嗰版。
 */
export async function initNative(go: (path: string) => void) {
  if (!isNative() || started) return;
  started = true;
  try {
    const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
      import("@capacitor/app"),
    ]);
    // 黃色頂部配深色字
    await StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    if (nativePlatform() === "android") await StatusBar.setBackgroundColor({ color: "#F5C518" }).catch(() => {});
    await SplashScreen.hide().catch(() => {});

    // Android 返回掣：有上一版就返上一版，冇就收埋 app
    void App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.minimizeApp();
    });

    // 由連結打開 app：只接受自己網站嘅連結
    void App.addListener("appUrlOpen", ({ url }) => {
      try {
        const u = new URL(url);
        const ok = u.hostname === "www.buytime.hk" || u.hostname === "buytime.hk" || u.protocol === "hk.buytime.app:";
        if (!ok) return;
        const path = u.protocol === "hk.buytime.app:" ? `/${u.host}${u.pathname}` : u.pathname;
        go(`${path}${u.search}`);
      } catch {
        /* 唔識嘅連結唔理 */
      }
    });
  } catch (e) {
    console.warn("[native] init failed", e);
  }
}
