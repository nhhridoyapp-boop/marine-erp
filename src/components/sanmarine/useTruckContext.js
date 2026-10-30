import { useState, useEffect } from 'react';
import { getTruckContext } from '@/lib/sanmarineEntries';

// Previous trip / last empty weight of the truck typed in a form (debounced).
export default function useTruckContext(truck) {
  const [ctx, setCtx] = useState(null);
  useEffect(() => {
    setCtx(null);
    if ((truck || '').trim().length < 4) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      getTruckContext(truck).then((c) => { if (!cancelled) setCtx(c); }).catch(() => {});
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [truck]);
  return ctx;
}