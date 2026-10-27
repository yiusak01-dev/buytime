import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 啱啱好 原生 app（iPhone／Android）設定。
 * 畫面同網頁版一樣（打包 dist 入 app），資料直接連 Supabase。
 */
const config: CapacitorConfig = {
  appId: "hk.buytime.app",
  appName: "啱啱好",
  webDir: "dist",
  backgroundColor: "#FBF6EA",
  ios: {
    contentInset: "always",
    // 狀態列同底部 Home 條後面嘅底色：白色，同底部掣一樣，亦同 Android 狀態列一致
    backgroundColor: "#FFFFFF",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#FBF6EA",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#F5C518",
      overlaysWebView: false,
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
