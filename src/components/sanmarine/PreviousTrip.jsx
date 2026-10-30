import React from 'react';
import { History } from 'lucide-react';
import { WEIGHT_TOLERANCE_KG } from '@/lib/sanmarineRules';

const nm = (list, id) => ((list || []).find((x) => x.id === id) || {}).name || '—';

// Shows the previous trip of the truck entered in a form (date, time, ghat, vessel, lighter, empty weight, gross, net).
// currentEmpty (empty-weight form only): live previous-vs-current empty weight difference.
export default function PreviousTrip({ ctx, vessels, lighters, currentEmpty }) {
  if (!ctx || (!ctx.lastLoad && !ctx.lastEmpty)) return null;
  const { lastLoad: l, lastEmpty: e } = ctx;
  const cur = Number(currentEmpty) || 0;
  const diff = e && cur > 0 ? cur - (Number(e.tallyWeight) || 0) : null;
  const big = diff !== null && Math.abs(diff) > WEIGHT_TOLERANCE_KG;
  return (
    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-700 space-y-0.5">
      <div className="flex items-center gap-1.5 text-slate-500 font-black uppercase tracking-wider text-[10px]"><History className="h-3.5 w-3.5" /> আগের ট্রিপ</div>
      {l && (
        <div>
          শেষ লোড: {l.date} {l.time || ''} · ঘাট {l.ghatName || '—'} · ভেসেল {nm(vessels, l.motherVesselId)} · লাইটার {nm(lighters, l.lighterVesselId)}
          <br />খালি {Number(l.tare || 0).toLocaleString('en-IN')} · গ্রস {Number(l.gross || 0).toLocaleString('en-IN')} · নেট {Number(l.net || 0).toLocaleString('en-IN')} KG · ব্যাগ {l.bags || 0}
        </div>
      )}
      {e && <div>শেষ খালি ওজন: {e.emptyWeightDate} {e.emptyWeightTime || ''} · {e.ghat || '—'} · খালি গাড়ির ওজন {e.tallyWeight} KG {e.loadingEntryId ? '(লোড হয়েছে)' : '(লোড বাকি)'}</div>}
      {diff !== null && (
        <div className={big ? 'text-rose-700 font-black' : 'text-emerald-700'}>
          আগের খালি ওজন {e.tallyWeight} → এখন {cur} KG: পার্থক্য {diff > 0 ? '+' : ''}{diff} KG{big ? ` — HIGH PRIORITY (${WEIGHT_TOLERANCE_KG} KG-এর বেশি), সংরক্ষণে লাল অ্যালার্ট হবে` : ''}
        </div>
      )}
    </div>
  );
}