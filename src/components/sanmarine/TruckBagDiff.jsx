import React from 'react';
import { truckBagDiffs } from '@/lib/sanmarineKhataRows';

const v = (x) => (x == null ? '—' : x);

// Truck-by-truck bag disagreements between Weighment Sheet, Point Khata and the saved system entries.
export default function TruckBagDiff({ wsRows, pkRows, sysEntries }) {
  const diffs = truckBagDiffs(wsRows, pkRows, sysEntries);
  if (!diffs.length) return null;
  return (
    <div className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/50 space-y-1.5">
      <div className="text-[10px] font-black uppercase tracking-wider text-rose-700">ট্রাকভিত্তিক ব্যাগ অমিল ({diffs.length})</div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-[11px] items-center">
        <div className="font-black text-slate-500">ট্রাক</div><div className="font-black text-slate-500 text-right">শিট</div><div className="font-black text-slate-500 text-right">খাতা</div><div className="font-black text-slate-500 text-right">সিস্টেম</div>
        {diffs.map((d) => (
          <React.Fragment key={d.truck}>
            <div className="font-mono font-bold text-slate-800 break-all">{d.truck}</div>
            <div className="font-mono text-right">{v(d.ws)}</div><div className="font-mono text-right">{v(d.pk)}</div><div className="font-mono text-right">{v(d.sys)}</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}