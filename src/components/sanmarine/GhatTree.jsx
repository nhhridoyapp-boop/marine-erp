import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { FLAG_META } from '@/lib/sanmarineRules';

const fN = (n) => Number(n || 0).toLocaleString('en-IN');
const METRICS = [
  ['total', 'মোট ট্রাক'], ['completed', 'সম্পন্ন'], ['pending', 'পেন্ডিং'], ['problemTrucks', 'সমস্যা ট্রাক', true], ['weightProblems', 'ওজন সমস্যা', true],
  ['kgDiff', 'KG পার্থক্য', true], ['missingDocs', 'ডকুমেন্ট মিসিং', true], ['monitorMissing', 'মনিটর ছবি নেই', true], ['scaleMissing', 'স্কেল ছবি নেই', true],
  ['duplicateConflict', 'ডুপ্লিকেট/সময় কনফ্লিক্ট', true], ['previousTrip', 'আগের ট্রিপ সমস্যা', true],
];
const LEVEL = ['তারিখ', 'ঘাট', 'মাদার ভেসেল', 'লাইটার'];
const SEV = { critical: 'text-rose-700', high: 'text-rose-600', warning: 'text-amber-700', medium: 'text-amber-700' };

export function StatsGrid({ stats }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 mt-2">
      {METRICS.map(([k, label, warn]) => (
        <div key={k} className={`px-2 py-1 rounded-lg text-center ${warn && stats[k] > 0 ? 'bg-rose-50 border border-rose-200' : 'bg-slate-50 border border-slate-100'}`}>
          <div className="text-[9px] font-bold text-slate-500 leading-tight">{label}</div>
          <div className={`text-sm font-black font-mono ${warn && stats[k] > 0 ? 'text-rose-700' : 'text-slate-800'}`}>{fN(stats[k])}</div>
        </div>
      ))}
    </div>
  );
}

function Truck({ t }) {
  return (
    <div className="pl-3 py-1.5 border-l-2 border-slate-200">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-black font-mono text-slate-800">{t.truckNumber}</span>
        <span className="text-slate-500">{t.time}</span>
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${t.kind === 'loading' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>{t.kind === 'loading' ? `লোড · নেট ${fN(t.net)} KG · ব্যাগ ${fN(t.bags)}` : `খালি ওজন ${fN(t.tally)} KG · লোড বাকি`}</span>
        {t.problems.length === 0 && <span className="text-[10px] font-bold text-emerald-600">সব ঠিক</span>}
      </div>
      {t.problems.map((p) => (
        <div key={p.code} className={`text-[11px] font-semibold ml-1 mt-0.5 ${SEV[FLAG_META[p.code]?.severity] || 'text-slate-600'}`}>
          ▸ {FLAG_META[p.code]?.label || p.code}{p.kg ? ` (${fN(p.kg)} KG)` : ''}{p.detail ? ` — ${p.detail}` : ''}
        </div>
      ))}
    </div>
  );
}

function Node({ node, level, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className={level === 0 ? 'bg-white rounded-2xl border border-slate-200 p-3' : 'mt-2 pl-2 sm:pl-3 border-l-2 border-teal-100'}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 text-left">
        <Icon className="h-4 w-4 text-slate-400 shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 shrink-0">{LEVEL[level]}</span>
        <span className="font-black text-sm text-slate-800 truncate">{node.label}</span>
        <span className="ml-auto text-[11px] font-bold text-slate-500 shrink-0">{node.stats.total} ট্রাক · {(node.stats.net / 1000).toFixed(3)} MT</span>
      </button>
      {open && (
        <>
          <StatsGrid stats={node.stats} />
          {node.kids.map((k) => <Node key={k.key} node={k} level={level + 1} defaultOpen={false} />)}
          {node.trucks.length > 0 && <div className="mt-2 space-y-1">{node.trucks.map((t) => <Truck key={t.id} t={t} />)}</div>}
        </>
      )}
    </div>
  );
}

export default function GhatTree({ tree }) {
  return <div className="space-y-3">{tree.map((d, i) => <Node key={d.key} node={d} level={0} defaultOpen={i === 0} />)}</div>;
}