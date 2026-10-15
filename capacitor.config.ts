import type { CapacitorConfig } from '@capacitor/cli';

// Build with bundled assets; not a remote web site wrapper.
const config: CapacitorConfig = {
  appId: 'hk.ngaamngaamho.app',
  appName: '啱啱好',
  webDir: 'dist/public',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};
export default config;
