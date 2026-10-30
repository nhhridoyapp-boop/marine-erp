import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Package, Scale, AlertTriangle, Clock } from 'lucide-react';
import { recordProblems } from '@/lib/sanmarineRules';

export default function GhatWorkload({ data, ghat, onSelectGhat }) {
  const rows = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    const ensure = (name) => {
      if (!map.has(name)) map.set(name, { ghat: name, trucks: 0, bags: 0, net: 0, problems: 0, pending: 0 });
      return map.get(name);
    };
    data.loads.forEach((r) => {
      const g = ensure(r.ghatName || '—');
      g.trucks += 1;
      g.bags += Number(r.bags) || 0;
      g.net += Number(r.net) || 0;
      if (recordProblems('loading', r).length) g.problems += 1;
    });
    data.empties.forEach((e) => {
      if (e.loadingEntryId) return;
      const g = ensure(e.ghat || '—');
      g.pending += 1;
    });
    return [...map.values()].sort((a, b) => b.trucks - a.trucks);
  }, [data]);

  if (rows.length === 0) return null;
  const maxTrucks = Math.max(...rows.map((r) => r.trucks), 1);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="text-xs font-black text-slate-700 mb-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-teal-500" />ঘাটের কাজের চাপ (তুলনামূলক গ্রাফ)
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
            <YAxis type="category" dataKey="ghat" tick={{ fontSize: 10, fill: '#475569' }} width={90} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit' }} cursor={{ fill: '#f8fafc' }} />
            <Bar dataKey="trucks" name="ট্রাক" fill="#0d9488" radius={[0, 6, 6, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {rows.map((r) => {
          const active = ghat && r.ghat.toUpperCase() === ghat;
          return (
            <button key={r.ghat} type="button" onClick={() => onSelectGhat(active ? '' : r.ghat.toUpperCase())}
              className={`text-left p-3 rounded-2xl border transition-all ${active ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
              <div className="flex items-center justify-between">
                <span className="font-black text-sm text-slate-800 truncate">{r.ghat}</span>
                <span className="text-[10px] font-bold text-teal-600 shrink-0">{active ? 'নির্বাচিত ✓' : 'ফিল্টার →'}</span>
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black font-mono text-slate-900">{r.trucks}</span>
                <span className="text-[10px] text-slate-500">ট্রাক</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${(r.trucks / maxTrucks) * 100}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-1 mt-2 text-[10px] font-bold text-slate-600">
                <span className="flex items-center gap-1"><Package className="h-3 w-3 text-amber-500" />{r.bags.toLocaleString('en-IN')}</span>
                <span className="flex items-center gap-1"><Scale className="h-3 w-3 text-purple-500" />{(r.net / 1000).toFixed(2)} MT</span>
                <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-rose-500" />{r.problems} সমস্যা</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-amber-500" />{r.pending} পেন্ডিং</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}