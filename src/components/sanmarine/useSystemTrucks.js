import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { normalizeTruckNumber } from '@/utils/truckUtils';

const NONE = { loading: false, trucks: [], entries: [], bags: 0, ready: false };

// Truck entries actually saved in the system for one date + lighter + ghat (used to check the paper documents against the system).
// entries = [{ truck, bags }] so bags can be compared truck by truck.
export default function useSystemTrucks({ date, lighterVesselId, ghatName }) {
  const [sys, setSys] = useState(NONE);
  useEffect(() => {
    if (!date || !lighterVesselId || !ghatName) { setSys(NONE); return undefined; }
    let cancelled = false;
    setSys((p) => ({ ...p, loading: true }));
    base44.entities.TruckEntry.filter({ date, lighterVesselId, ghatName: ghatName.toUpperCase() }, { limit: 1000, fields: ['normalizedTruckNumber', 'truckNumber', 'bags'] })
      .then((page) => {
        if (cancelled) return;
        const items = page.items || [];
        const entries = items.map((x) => ({ truck: x.normalizedTruckNumber || normalizeTruckNumber(x.truckNumber), bags: Number(x.bags) || 0 })).filter((x) => x.truck);
        setSys({ loading: false, ready: true, trucks: entries.map((x) => x.truck), entries, bags: entries.reduce((s, x) => s + x.bags, 0) });
      })
      .catch(() => { if (!cancelled) setSys(NONE); });
    return () => { cancelled = true; };
  }, [date, lighterVesselId, ghatName]);
  return sys;
}