import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Ionic Capacitor shell for the Angular app (demo on Android emulator / device).
 * Build web assets first: `npm run build:mobile` then `npx cap sync android`.
 */
const config: CapacitorConfig = {
  appId: 'com.talenteye.app',
  appName: 'TalentEye',
  webDir: 'dist/talenteye-frontend/browser',
  server: {
    androidScheme: 'http'
  },
  android: {
    allowMixedContent: true
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
