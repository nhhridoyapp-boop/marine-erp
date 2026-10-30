import type { CapacitorConfig } from '@capacitor/cli';

// The native shell loads the LIVE production web app (server.url below) — always up to date,
// no APK rebuild needed for web changes. Full-screen WebView (no browser chrome) = real native-app feel.
// webDir points to a tiny permanent splash folder (android-shell-web/) so `cap sync` works WITHOUT
// running `vite build` — the splash only shows for the brief moment before the network URL loads.
// All data still goes to the same central production Base44 database.
const config: CapacitorConfig = {
  appId: 'com.sanmarine.surveyinspection',
  appName: 'SAN MARINE SURVEY & INSPECTION',
  webDir: 'android-shell-web',
  backgroundColor: '#0B2A4A',
  android: {
    allowMixedContent: false,
    backgroundColor: '#0B2A4A',
  },
  server: {
    // The native shell loads the LIVE production web app — always up to date, no APK rebuild
    // needed for web changes. Full-screen WebView (no browser chrome) = real native-app feel.
    // All data still goes to the same central production database.
    url: 'https://san-marine-survey-inspection-scale-monitoring.base44.app',
    androidScheme: 'https',
  },
};

export default config;