import React, { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { toMs, WEIGHT_TOLERANCE_KG } from '@/lib/sanmarineRules';
import { Card } from './formParts';

// Chronological empty-weight history of one truck: previous weight, current weight, exact difference, date, ghat, related trip.
// Read-only view — historical records are never changed.
export default function EmptyWeightHistory({ empties, loads }) {
  const rows = useMemo(() => {
    const asc = [...empties].sort((a, b) => toMs(a.emptyWeightDate, a.emptyWeightTime) - toMs(b.emptyWeightDate, b.emptyWeightTime));
    const loadById = new Map(loads.map((l) => [l.id, l]));
    return asc.map((e, i) => {
      const prev = i ? asc[i - 1] : null;
      const cur = Number(e.tallyWeight) || 0;
      return { e, prev, diff: prev ? cur - (Number(prev.tallyWeight) || 0) : null, load: e.loadingEntryId ? loadById.get(e.loadingEntryId) : null };
    });
  }, [empties, loads]);
  if (rows.length === 0) return null;

  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-black text-slate-800"><TrendingUp className="h-4 w-4 text-amber-600" /> খালি ওজনের ইতিহাস (পুরোনো → নতুন)</div>
      <div className="space-y-1.5">
        {rows.map(({ e, prev, diff, load }) => {
          const big = diff !== null && Math.abs(diff) > WEIGHT_TOLERANCE_KG;
          return (
            <div key={e.id} className={`grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-0.5 p-2 rounded-xl border text-[11px] font-semibold ${big ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
              <div className="font-black text-slate-800">{e.emptyWeightDate} <span className="font-medium text-slate-500">{e.emptyWeightTime}</span></div>
              <div className="text-slate-600">ঘাট: {e.ghat || '—'}</div>
              <div className="text-slate-700">বর্তমান: <span className="font-mono font-black">{e.tallyWeight}</span> KG{prev ? <span className="text-slate-500"> (আগের {prev.tallyWeight})</span> : <span className="text-slate-400"> (প্রথম রেকর্ড)</span>}</div>
              <div className={big ? 'text-rose-700 font-black' : 'text-slate-600'}>{diff === null ? 'পার্থক্য: —' : `পার্থক্য: ${diff > 0 ? '+' : ''}${diff} KG${big ? ' ⚠ HIGH' : ''}`}</div>
              <div className="text-slate-600">{load ? `লোড: ${load.date} ${load.time || ''}${load.serial ? ` · সিরিয়াল ${load.serial}` : ''}` : e.loadingEntryId ? 'লোড যুক্ত' : 'লোড বাকি'}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}