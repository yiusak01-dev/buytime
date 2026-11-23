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
    // 用緊 app 嗰陣：唔彈系統橫額（會遮住頂部「返上一頁」），改由 app 自己喺標題下面出一張撳得嘅卡；聲照響
    PushNotifications: {
      presentationOptions: ["badge", "sound"],
    },
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#FBF6EA",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      // 狀態列白底深色字（iPhone 同 Android 一致）
      backgroundColor: "#FFFFFF",
      overlaysWebView: false,
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound"],
    },
  },
};

export default config;
