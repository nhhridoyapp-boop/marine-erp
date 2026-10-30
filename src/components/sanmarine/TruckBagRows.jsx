import React from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { summarizeRows, needsCheck, newRow } from '@/lib/sanmarineKhataRows';
import { inputCls } from './formParts';

const cell = `${inputCls} !py-2 !px-2 font-mono`;

// Truck + bag-count rows of ONE document (filled by OCR, every cell editable). Total Truck (unique) and Total Bags follow the rows.
export default function TruckBagRows({ label, rows, onChange, bags, onBagsChange }) {
  const s = summarizeRows(rows);
  const edit = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch, verify: false } : r)));
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-center">
          <div className="text-[10px] font-bold text-slate-500">মোট ট্রাক (ইউনিক) · স্বয়ংক্রিয়</div>
          <div className="text-base font-black font-mono text-slate-800">{s.trucks}</div>
        </div>
        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-center">
          <div className="text-[10px] font-bold text-slate-500">মোট ব্যাগ {s.anyBags ? '· স্বয়ংক্রিয়' : '*'}</div>
          {s.anyBags
            ? <div className="text-base font-black font-mono text-slate-800">{s.bags}</div>
            : <input type="number" inputMode="numeric" value={bags} onChange={(e) => onBagsChange(e.target.value)} className={`${cell} text-center`} placeholder="মোট ব্যাগ" />}
        </div>
      </div>
      {s.duplicates > 0 && <div className="text-[11px] font-bold text-purple-700">ডুপ্লিকেট ট্রাক: {s.duplicates}টি নম্বর একাধিকবার আছে ({s.lines} লাইন)</div>}
      {s.unresolved > 0 && <div className="text-[11px] font-black text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Needs Verification: {s.unresolved}টি লাইন যাচাই বাকি</div>}
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
        {rows.map((r, i) => {
          const bad = needsCheck(r, s.anyBags);
          return (
            <div key={i} className={`p-1.5 rounded-xl border ${bad ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center gap-1.5">
                <span className="w-6 shrink-0 text-center text-[10px] font-bold text-slate-400">{i + 1}</span>
                <input value={r.truck} onChange={(e) => edit(i, { truck: e.target.value })} placeholder="ট্রাক নম্বর" className={`${cell} flex-1 min-w-0 uppercase`} />
                <input type="number" inputMode="numeric" value={r.bags} onChange={(e) => edit(i, { bags: e.target.value })} placeholder="ব্যাগ" className={`${cell} w-20 shrink-0`} />
                <button type="button" title="লাইন মুছুন" onClick={() => onChange(rows.filter((_, k) => k !== i))} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 shrink-0"><Trash2 className="h-4 w-4" /></button>
              </div>
              {bad && <div className="text-[10px] font-black text-amber-700 pl-7 pt-1">Needs Verification{!r.truck.trim() ? ' — ট্রাক নম্বর' : ''}{s.anyBags && !(Number(r.bags) > 0) ? ' — ব্যাগ' : ''}</div>}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => onChange([...rows, newRow()])} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> লাইন যোগ করুন</button>
    </div>
  );
}