import React, { useState, useEffect } from 'react';
import { Search, Truck, Ship, Anchor, MapPin, Building, ArrowRight, X, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { normalizeTruckNumber } from '@/utils/truckUtils';

function Row({ icon: Icon, title, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 text-left">
      <div className="h-8 w-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0"><Icon className="h-4 w-4" /></div>
      <div className="flex-1 min-w-0"><div className="text-sm font-black text-slate-800 truncate">{title}</div>{sub ? <div className="text-[11px] text-slate-500 truncate">{sub}</div> : null}</div>
      <ArrowRight className="h-4 w-4 text-slate-300" />
    </button>
  );
}

// Truck search runs on the server (regex on the normalised number); master lists are already loaded for the forms.
export default function GlobalSearchModal({ open, onClose, vessels, lighters, ghats, consignees, onNavigate }) {
  const [query, setQuery] = useState('');
  const [trucks, setTrucks] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const n = normalizeTruckNumber(query);
    if (!open || n.length < 2) { setTrucks([]); setBusy(false); return undefined; }
    let dead = false;
    setBusy(true);
    const t = setTimeout(async () => {
      const q = { normalizedTruckNumber: { $regex: n } };
      const opt = { sort: '-created_date', limit: 20, fields: ['truckNumber', 'normalizedTruckNumber'] };
      const [a, b] = await Promise.all([base44.entities.TruckEntry.filter(q, opt), base44.entities.EmptyWeight.filter(q, opt)]);
      if (dead) return;
      const map = new Map();
      [...a.items, ...b.items].forEach((r) => { if (!map.has(r.normalizedTruckNumber)) map.set(r.normalizedTruckNumber, r.truckNumber); });
      setTrucks([...map.values()].slice(0, 6));
      setBusy(false);
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [query, open]);

  if (!open) return null;
  const q = query.trim().toUpperCase();
  const pick = (list) => (q ? list.filter((x) => (x.name || '').toUpperCase().includes(q)).slice(0, 5) : []);
  const go = (tab, opts) => { onNavigate(tab, opts); setQuery(''); onClose(); };
  const groups = [
    [pick(vessels), Ship, 'vessels', (v) => [v.cargoType, v.status].filter(Boolean).join(' · ')],
    [pick(lighters), Anchor, 'lighters', (l) => l.consigneeName],
    [pick(ghats), MapPin, 'ghats', (g) => g.location],
    [pick(consignees), Building, 'consignees', (c) => c.contactPerson],
  ];
  const empty = q && !busy && trucks.length === 0 && groups.every((g) => g[0].length === 0);

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-start justify-center p-3 pt-16" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-3 border-b border-slate-100">
          <Search className="h-4 w-4 text-teal-600" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ট্রাক নম্বর, ভেসেল, লাইটার, ঘাট, পার্টি খুঁজুন..." className="flex-1 outline-none text-sm font-semibold bg-transparent" />
          {busy && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
          {!q && <div className="text-center py-8 text-xs font-bold text-slate-400">কমপক্ষে ২ অক্ষর লিখে খুঁজুন</div>}
          {trucks.map((t) => <Row key={t} icon={Truck} title={t} sub="ট্রাক হিস্ট্রি দেখুন" onClick={() => go('truck_history', { truckNo: t })} />)}
          {groups.map(([items, Icon, tab, sub]) => items.map((x) => <Row key={`${tab}-${x.id}`} icon={Icon} title={x.name} sub={sub(x)} onClick={() => go(tab)} />))}
          {empty && <div className="text-center py-8 text-xs font-bold text-slate-400">কিছু পাওয়া যায়নি</div>}
        </div>
      </div>
    </div>
  );
}