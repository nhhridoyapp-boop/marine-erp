import { useEffect, useState } from 'react';

let installPrompt = null;
let initialized = false;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());
export const installed = () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || Boolean(navigator.standalone);

export function initializePwaInstall() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); installPrompt = event; notify();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; notify(); });
}

export default function usePwaInstall() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const listener = () => refresh((value) => value + 1);
    const media = window.matchMedia('(display-mode: standalone)');
    listeners.add(listener); media.addEventListener('change', listener);
    return () => { listeners.delete(listener); media.removeEventListener('change', listener); };
  }, []);
  const install = async () => {
    if (!installPrompt) return;
    const prompt = installPrompt; installPrompt = null; notify();
    await prompt.prompt(); await prompt.userChoice; notify();
  };
  return { isInstalled: installed(), canInstall: Boolean(installPrompt), install };
}