import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "hk.buytime.app",
  appName: "買時間",
  webDir: "dist/public",
  server: {
    url: "https://buytime.hk",
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    buildOptions: {
      keystorePath: "buytime.keystore",
      keystoreAlias: "buytime",
    },
  },
};

export default config;
