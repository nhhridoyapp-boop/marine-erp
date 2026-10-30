import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import ErrorBoundary from '@/components/sanmarine/ErrorBoundary'
import '@/index.css'
import { initializePwaInstall } from '@/components/sanmarine/setup/pwaInstall'

initializePwaInstall();

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

// Installable PWA with offline app shell (production builds only). The worker file is re-checked on every start, so a new
// release is noticed without waiting for the browser's own schedule.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => reg.update()).catch(() => {});
  });
}

// Ask the browser not to evict this app's stored login/session when the device is low on space.
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* ignore */ }