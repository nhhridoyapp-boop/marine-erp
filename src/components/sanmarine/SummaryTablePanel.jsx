import React, { useState, useEffect } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, Field, inputCls, ghostBtn } from './formParts';

const fN = (n) => Number(n || 0).toLocaleString('en-IN');
const fMT = (kg) => (kg > 0 ? (kg / 1000).toFixed(3) : '0.000');
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

// Final summary table: one row per date, totals computed by the server (aggregate).
export default function SummaryTablePanel({ vessels, settings }) {
  const [vesselId, setVesselId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState(null);

  useEffect(() => { if (!vesselId && vessels.length) setVesselId(vessels[0].id); }, [vessels, vesselId]);

  useEffect(() => {
    const query = {};
    if (vesselId) query.motherVesselId = vesselId;
    if (from || to) query.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    let dead = false;
    setRows(null);
    const t = setTimeout(() => {
      base44.entities.TruckEntry.aggregate({ query, groupBy: 'date', sum: ['bags', 'gross', 'net'], sort: 'date', limit: 1000 })
        .then((r) => { if (!dead) setRows(r.rows || []); }).catch(() => { if (!dead) setRows([]); });
    }, 400);
    return () => { dead = true; clearTimeout(t); };
  }, [vesselId, from, to]);

  const list = rows || [];
  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:hidden">
        <Field label="Mother Vessel">
          <select value={vesselId} onChange={(e) => setVesselId(e.target.value)} className={inputCls}>
            <option value="">All Vessels</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="From Date"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
        <Field label="To Date"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-black text-slate-800">{settings.companyName || 'SAN MARINE SURVEY & INSPECTION'} — Daily Discharge Table</h3>
            <p className="text-[11px] text-slate-500">{vessels.find((v) => v.id === vesselId)?.name || 'All Vessels'}</p>
          </div>
          <button type="button" onClick={() => window.print()} className={`${ghostBtn} print:hidden`}><Printer className="h-3.5 w-3.5" /> Print / Save PDF</button>
        </div>
        {rows === null && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
        {rows !== null && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                <tr><th className="py-2.5 px-3">Date</th><th className="py-2.5 px-3 text-right">Trucks</th><th className="py-2.5 px-3 text-right">Bags</th><th className="py-2.5 px-3 text-right">Gross (MT)</th><th className="py-2.5 px-3 text-right">Net (MT)</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {list.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400 font-sans">কোনো ডাটা পাওয়া যায়নি</td></tr>}
                {list.map((r) => (
                  <tr key={r.date}><td className="py-2 px-3 font-medium text-slate-800">{r.date}</td><td className="py-2 px-3 text-right">{r.count}</td><td className="py-2 px-3 text-right">{fN(r.sum_bags)}</td><td className="py-2 px-3 text-right">{fMT(r.sum_gross)}</td><td className="py-2 px-3 text-right font-bold text-teal-700">{fMT(r.sum_net)}</td></tr>
                ))}
              </tbody>
              {list.length > 0 && (
                <tfoot className="bg-teal-50/50 font-bold border-t-2 border-teal-200 font-mono">
                  <tr><td className="py-2.5 px-3 font-sans">Total</td><td className="py-2.5 px-3 text-right">{sum(list, 'count')}</td><td className="py-2.5 px-3 text-right">{fN(sum(list, 'sum_bags'))}</td><td className="py-2.5 px-3 text-right">{fMT(sum(list, 'sum_gross'))}</td><td className="py-2.5 px-3 text-right font-black text-teal-700">{fMT(sum(list, 'sum_net'))}</td></tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}