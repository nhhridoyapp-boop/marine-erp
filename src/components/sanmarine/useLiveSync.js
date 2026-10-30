import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

// Refreshes the dashboard numbers shortly after ANY device saves, edits or deletes a truck / empty-weight record
// (realtime subscription — no extra polling). Bursts are merged: at most one refresh per minute.
export default function useLiveSync(enabled, onChange) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    let last = 0;
    const fire = () => {
      if (!navigator.onLine) return; // offline: skip the refresh instead of firing a request that cannot succeed
      clearTimeout(timer);
      const wait = Math.max(4000, 60000 - (Date.now() - last));
      timer = setTimeout(() => { last = Date.now(); cb.current(); }, wait);
    };
    const unsubs = [];
    try {
      [base44.entities.TruckEntry, base44.entities.EmptyWeight].forEach((e) => {
        const u = e.subscribe(fire);
        if (typeof u === 'function') unsubs.push(u);
      });
    } catch (e) {
      console.error('Live sync subscription failed:', e); // a failed subscribe must never crash the screen
    }
    return () => {
      clearTimeout(timer);
      unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
    };
  }, [enabled]);
}