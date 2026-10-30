import { Capacitor } from '@capacitor/core';

// True only inside the installed Android/iOS app shell (Capacitor). In a normal browser / PWA this is false.
// Google sign-in cannot complete inside an app WebView (Google blocks it and the sign-in escapes to the phone's
// browser, so the app never receives the login), which is why the native app uses email + password instead.
export const isNativeApp = () => {
  try { return Capacitor.isNativePlatform(); } catch (e) { return false; }
};