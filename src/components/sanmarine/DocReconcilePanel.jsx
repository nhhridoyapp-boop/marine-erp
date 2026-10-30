import React from 'react';
import { DOC_STATUS_LABEL } from '@/lib/sanmarineRules';
import SystemCompare from './SystemCompare';
import TruckBagDiff from './TruckBagDiff';

const Stat = ({ label, value, bad }) => (
  <div className={`p-2 rounded-xl text-center ${bad ? 'bg-rose-50 border border-rose-200' : 'bg-slate-50 border border-slate-100'}`}>
    <div className="text-[10px] font-bold text-slate-500">{label}</div>
    <div className={`text-base font-black font-mono ${bad ? 'text-rose-700' : 'text-slate-800'}`}>{value}</div>
  </div>
);

const Chips = ({ title, items, color }) => (items.length === 0 ? null : (
  <div>
    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{title} ({items.length})</div>
    <div className="flex flex-wrap gap-1">{items.map((t) => <span key={t} className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${color}`}>{t}</span>)}</div>
  </div>
));

// Live comparison of weighment sheet vs point khata (from reconcileDocs).
export default function DocReconcilePanel({ rec, wsBags, pkBags, sys, wsRows, pkRows }) {
  const ok = rec.status === 'MATCHED';
  return (
    <div className="space-y-2">
      <div className={`p-2.5 rounded-xl text-xs font-black border ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
        ফলাফল: {DOC_STATUS_LABEL[rec.status]}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="শিট ট্রাক" value={rec.wsCount} />
        <Stat label="খাতা ট্রাক" value={rec.pkCount} />
        <Stat label="ট্রাক পার্থক্য" value={rec.truckDifference} bad={rec.truckDifference !== 0} />
        <Stat label="শিট ব্যাগ" value={Number(wsBags) || 0} />
        <Stat label="খাতা ব্যাগ" value={Number(pkBags) || 0} />
        <Stat label="ব্যাগ পার্থক্য" value={rec.bagDifference} bad={rec.bagDifference !== 0} />
      </div>
      <Chips title="শিটে আছে, খাতায় নেই" items={rec.missingInPointKhata} color="bg-rose-100 text-rose-700" />
      <Chips title="খাতায় আছে, শিটে নেই" items={rec.missingInWeighmentSheet} color="bg-amber-100 text-amber-800" />
      <Chips title="ডুপ্লিকেট ট্রাক" items={rec.duplicates} color="bg-purple-100 text-purple-700" />
      <TruckBagDiff wsRows={wsRows} pkRows={pkRows} sysEntries={sys && sys.ready ? sys.entries : []} />
      <SystemCompare rec={rec} wsBags={wsBags} pkBags={pkBags} sys={sys} />
    </div>
  );
}