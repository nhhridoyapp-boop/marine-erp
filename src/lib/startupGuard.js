// Startup / loading safety helpers.

// Stops WAITING for a promise after `ms` (the request itself cannot be cancelled). Rejects with code 'TIMEOUT'.
export function withTimeout(promise, ms, label = 'request') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out`), { code: 'TIMEOUT' })), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// Clears the offline app-shell cache + service worker, then reloads. Login/session data (localStorage) and all
// server-side records are NOT touched — only the downloaded app files are refreshed.
export async function resetAppShellAndReload() {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k)));
    }
  } catch (e) {
    // reload anyway
  }
  window.location.reload();
}