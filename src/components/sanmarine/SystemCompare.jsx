import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { reconcileWithSystem, DOC_BAG_ALERT_THRESHOLD } from '@/lib/sanmarineRules';

const Chips = ({ title, items, color }) => (items.length === 0 ? null : (
  <div>
    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{title} ({items.length})</div>
    <div className="flex flex-wrap gap-1">{items.map((t) => <span key={t} className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${color}`}>{t}</span>)}</div>
  </div>
));

// Truck / bag mismatch (shown separately), the >45 bag high-priority warning, and the comparison with the saved truck entries.
export default function SystemCompare({ rec, wsBags, pkBags, sys }) {
  const bagGap = Math.abs(rec.bagDifference);
  const truckBad = rec.truckDifference !== 0 || rec.missingInPointKhata.length > 0 || rec.missingInWeighmentSheet.length > 0;
  const cmp = sys && sys.ready ? reconcileWithSystem(rec, sys.trucks, sys.bags) : null;
  const line = (ok, text) => <div className={`text-[11px] font-black ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{ok ? '✓' : '✗'} {text}</div>;
  return (
    <div className="space-y-2">
      <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
        {line(!truckBad, `ট্রাক: ${truckBad ? 'অমিল' : 'মিলেছে'}`)}
        {line(bagGap === 0, `ব্যাগ: ${bagGap === 0 ? 'মিলেছে' : `অমিল (পার্থক্য ${bagGap})`}`)}
      </div>
      {bagGap > DOC_BAG_ALERT_THRESHOLD && (
        <div className="p-2.5 rounded-xl bg-rose-600 text-white text-xs font-black flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> HIGH PRIORITY: ব্যাগ পার্থক্য {bagGap} ({DOC_BAG_ALERT_THRESHOLD}-এর বেশি) — সংরক্ষণে আলাদা অ্যালার্ট তৈরি হবে
        </div>
      )}
      <div className="p-2.5 rounded-xl border border-slate-200 space-y-1.5">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">সিস্টেমের ট্রাক এন্ট্রির সাথে তুলনা</div>
        {sys && sys.loading && <div className="text-[11px] font-bold text-teal-700 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> সিস্টেম এন্ট্রি দেখা হচ্ছে...</div>}
        {!sys || (!sys.loading && !sys.ready) ? <div className="text-[11px] text-slate-500">তারিখ, লাইটার ও ঘাট নির্বাচন করলে সিস্টেমের এন্ট্রির সাথে মিলানো হবে।</div> : null}
        {cmp && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-1.5 rounded-lg bg-slate-50"><div className="text-[10px] font-bold text-slate-500">সিস্টেম ট্রাক</div><div className="font-mono font-black">{cmp.sysCount}</div></div>
              <div className="p-1.5 rounded-lg bg-slate-50"><div className="text-[10px] font-bold text-slate-500">সিস্টেম ব্যাগ</div><div className="font-mono font-black">{cmp.sysBags}</div></div>
              <div className={`p-1.5 rounded-lg ${cmp.ok ? 'bg-emerald-50' : 'bg-rose-50'}`}><div className="text-[10px] font-bold text-slate-500">ফলাফল</div><div className={`text-[11px] font-black ${cmp.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{cmp.ok ? 'ম্যাচড' : 'আনম্যাচড'}</div></div>
            </div>
            <div className="text-[11px] text-slate-600 font-semibold">শিট − সিস্টেম ট্রাক: {cmp.wsTruckDiff} · খাতা − সিস্টেম ট্রাক: {cmp.pkTruckDiff} · শিট − সিস্টেম ব্যাগ: {(Number(wsBags) || 0) - cmp.sysBags} · খাতা − সিস্টেম ব্যাগ: {(Number(pkBags) || 0) - cmp.sysBags}</div>
            <Chips title="কাগজে আছে, সিস্টেমে নেই (Missing Truck)" items={cmp.missingInSystem} color="bg-rose-100 text-rose-700" />
            <Chips title="সিস্টেমে আছে, কাগজে নেই (Extra Truck)" items={cmp.extraInSystem} color="bg-amber-100 text-amber-800" />
            <Chips title="সিস্টেমে ডুপ্লিকেট" items={cmp.sysDuplicates} color="bg-purple-100 text-purple-700" />
          </>
        )}
      </div>
    </div>
  );
}