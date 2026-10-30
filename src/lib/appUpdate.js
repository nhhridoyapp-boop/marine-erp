import { useState, useEffect, useCallback } from 'react';

// New-version detection. Every published build has differently named app files (/assets/index-<hash>.js|css). The running page
// remembers which ones it was started with; the server's current home page is compared against them. Only the downloaded app
// files are refreshed by an update — login (browser storage) and all server records are never touched.
const CHECK_MS = 5 * 60 * 1000;
const LONG_AWAY_MS = 10 * 60 * 1000;
const BOOT_WINDOW_MS = 60 * 1000;
const AUTO_KEY = 'sm_auto_reload_at';
const FILE_RX = /\/assets\/index-[^/?#"'\s]+\.(?:js|css)/;

export function signatureFromHtml(html) {
  const files = [];
  (String(html).match(/<(?:script|link)\b[^>]*>/gi) || []).forEach((tag) => {
    const m = tag.match(/(?:src|href)=["']([^"']+)["']/i);
    const f = m && m[1].match(FILE_RX);
    if (f) files.push(f[0]);
  });
  return files.sort().join('|');
}

export function currentSignature() {
  if (typeof document === 'undefined') return '';
  const files = [];
  document.querySelectorAll('script[src], link[rel="stylesheet"][href]').forEach((n) => {
    const f = (n.getAttribute('src') || n.getAttribute('href') || '').match(FILE_RX);
    if (f) files.push(f[0]);
  });
  return files.sort().join('|');
}

async function latestSignature() {
  const res = await fetch(`/?sm_v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
  return res.ok ? signatureFromHtml(await res.text()) : '';
}

// Guards against reload loops: an automatic reload is allowed at most once every 2 minutes per tab.
function canAutoReload() {
  try { return Date.now() - Number(sessionStorage.getItem(AUTO_KEY) || 0) > 120000; } catch (e) { return true; }
}

export async function applyUpdate() {
  try { sessionStorage.setItem(AUTO_KEY, String(Date.now())); } catch (e) { /* ignore */ }
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) await reg.update();
  } catch (e) { /* reload anyway */ }
  window.location.reload();
}

// `ready` becomes true when a newer version is live. The app updates itself when that is safe (right after it was opened, or
// after the app sat in the background for a long time); otherwise a banner lets the user update at a good moment, so a
// half-filled entry form is never thrown away.
export default function useAppUpdate() {
  const [ready, setReady] = useState(false);
  const dismiss = useCallback(() => setReady(false), []);

  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    const base = currentSignature();
    if (!base) return undefined;
    let stopped = false; let last = 0; let hiddenAt = 0;
    const bootAt = Date.now();
    const check = async (force, safeToReload) => {
      if (stopped || (!force && Date.now() - last < 30000)) return;
      last = Date.now();
      try {
        const sig = await latestSignature();
        if (stopped || !sig || sig === base) return;
        if ((safeToReload || Date.now() - bootAt < BOOT_WINDOW_MS) && canAutoReload()) { applyUpdate(); return; }
        setReady(true);
      } catch (e) { /* offline or server busy: checked again later */ }
    };
    const first = setTimeout(() => check(true, false), 4000);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') check(false, false); }, CHECK_MS);
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      check(away > LONG_AWAY_MS, away > LONG_AWAY_MS);
    };
    const onOnline = () => check(false, false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true; clearTimeout(first); clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline);
    };
  }, []);

  return { ready, dismiss, apply: applyUpdate };
}