import { useState, useCallback, useRef } from 'react';

// Captures the device GPS position and reverse-geocodes it to a place name via
// Nominatim (free, no API key). Returns { coords, locationName, capturedAt, busy,
// status, error, capture, recapture }.
//
// `capture()` is called once when a form opens. `recapture()` re-reads the position
// (used at save time so the freshest valid fix is stored). A failure never blocks
// saving — coords stay null and a clear status is shown. No fake address is ever
// displayed. Nominatim usage policy is respected (one request per fix, no polling).
export default function useGpsLocation() {
  const [coords, setCoords] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [capturedAt, setCapturedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | busy | ok | denied | unavailable | timeout
  const [error, setError] = useState('');
  const lastFix = useRef(null); // { latitude, longitude, locationName, capturedAt }

  const reverseGeocode = async (latitude, longitude) => {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14&accept-language=bn`,
        { headers: { Accept: 'application/json' } }
      );
      if (r.ok) {
        const data = await r.json();
        if (data.display_name) return data.display_name;
      }
    } catch (e) {
      // reverse geocode is best-effort — coords are still valid without a name
    }
    return '';
  };

  const capture = useCallback((opts = {}) => {
    if (!navigator.geolocation) { setStatus('unavailable'); setError('এই ডিভাইসে GPS সমর্থিত নয়।'); return Promise.resolve(null); }
    // Don't re-prompt if we already have a valid recent fix (within 60s) unless explicitly forced.
    if (!opts.force && lastFix.current && Date.now() - lastFix.current.capturedAt < 60000) {
      return Promise.resolve(lastFix.current);
    }
    setBusy(true); setStatus('busy'); setError('');
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const at = Date.now();
          setCoords({ latitude, longitude });
          setCapturedAt(at);
          setStatus('ok');
          const name = await reverseGeocode(latitude, longitude);
          setLocationName(name);
          lastFix.current = { latitude, longitude, locationName: name, capturedAt: at };
          setBusy(false);
          resolve(lastFix.current);
        },
        (err) => {
          const map = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };
          const st = map[err.code] || 'unavailable';
          setStatus(st);
          setError(st === 'denied' ? 'GPS অনুমতি দেওয়া হয়নি। ব্রাউজার সেটিং থেকে অনুমতি দিন।' : st === 'timeout' ? 'GPS সিগন্যাল পেতে সময় লেগেছে।' : 'GPS পাওয়া যায়নি।');
          setBusy(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    });
  }, []);

  // Re-read at save time. If we already have a fix younger than 30s, keep it
  // (avoids an extra permission prompt / delay on save). Otherwise re-acquire.
  const recapture = useCallback(() => {
    if (lastFix.current && Date.now() - lastFix.current.capturedAt < 30000) {
      return Promise.resolve(lastFix.current);
    }
    return capture({ force: true });
  }, [capture]);

  return { coords, locationName, capturedAt, busy, status, error, capture, recapture };
}