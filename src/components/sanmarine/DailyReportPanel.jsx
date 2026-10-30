import React, { useState, useEffect } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { Card, Field, inputCls, primaryBtn } from './formParts';

const fMT = (kg) => (kg > 0 ? (kg / 1000).toFixed(3) : '0.000');
const fDate = (d) => { const p = (d || '').split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d || ''; };
const sumRows = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

// Standard discharge report text (WhatsApp / SMS format). All numbers come from the server (aggregate), never from a loaded list.
async function loadStats(date, base) {
  const E = base44.entities.TruckEntry;
  const [daily, cum, first, earliest] = await Promise.all([
    E.aggregate({ query: { ...base, date }, groupBy: 'date', sum: ['bags', 'gross'] }),
    E.aggregate({ query: { ...base, date: { $lte: date } }, groupBy: 'motherVesselId', sum: ['bags', 'gross'] }),
    E.filter({ ...base, date }, { limit: 1, fields: ['ghatName', 'cargoName'] }),
    E.filter({ ...base, date: { $lte: date } }, { sort: 'date', limit: 1, fields: ['date'] }),
  ]);
  return {
    dTrucks: sumRows(daily.rows || [], 'count'), dBags: sumRows(daily.rows || [], 'sum_bags'), dGross: sumRows(daily.rows || [], 'sum_gross'),
    cTrucks: sumRows(cum.rows || [], 'count'), cBags: sumRows(cum.rows || [], 'sum_bags'), cGross: sumRows(cum.rows || [], 'sum_gross'),
    ghat: first.items[0]?.ghatName || '', cargo: first.items[0]?.cargoName || '', started: earliest.items[0]?.date || date,
  };
}

export default function DailyReportPanel({ vessels, lighters, consignees, ghats }) {
  const [date, setDate] = useState(api.todayStr());
  const [vesselId, setVesselId] = useState('');
  const [lighterId, setLighterId] = useState('');
  const [consigneeId, setConsigneeId] = useState('');
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (!vesselId && vessels.length) setVesselId(vessels[0].id); }, [vessels, vesselId]);

  useEffect(() => {
    const base = {};
    if (vesselId) base.motherVesselId = vesselId;
    if (lighterId) base.lighterVesselId = lighterId;
    if (consigneeId) base.consigneeId = consigneeId;
    let dead = false;
    setStats(null);
    const t = setTimeout(() => { loadStats(date, base).then((s) => { if (!dead) setStats(s); }).catch(() => { if (!dead) setStats({ error: true }); }); }, 400);
    return () => { dead = true; clearTimeout(t); };
  }, [date, vesselId, lighterId, consigneeId]);

  const vessel = vessels.find((v) => v.id === vesselId);
  const lighter = lighters.find((l) => l.id === lighterId);
  const consignee = consignees.find((c) => c.id === consigneeId);
  const ready = stats && !stats.error;
  const ghat = ready ? ghats.find((g) => g.name === stats.ghat) : null;
  const text = ready ? `Date : ${fDate(date) || '—'}
Place : ${ghat?.name || stats.ghat || '—'}
Area : ${ghat?.location || 'Dhaka'}

${vessel?.name || 'M.V. VESSEL'}
Cargo : ${vessel?.cargoType || stats.cargo || 'Cargo'}

${lighter?.name || 'LIGHTER VESSEL'}
A/c : ${consignee?.name || lighter?.consigneeName || 'Consignee'}

Daily Report....
Total Truck = ${String(stats.dTrucks).padStart(2, '0')}
          Bag.  = ${stats.dBags}
          G.W.  = ${fMT(stats.dGross)}

Summary....
Started : ${fDate(stats.started)}
Total Truck = ${String(stats.cTrucks).padStart(2, '0')}
          Bag.  = ${stats.cBags}
          G.W.  = ${fMT(stats.cGross)}` : '';

  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="তারিখ (Date)"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Mother Vessel">
          <select value={vesselId} onChange={(e) => { setVesselId(e.target.value); setLighterId(''); }} className={inputCls}>
            <option value="">All Vessels</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="Lighter Vessel">
          <select value={lighterId} onChange={(e) => setLighterId(e.target.value)} className={inputCls}>
            <option value="">All Lighters</option>{lighters.filter((l) => !vesselId || l.motherVesselId === vesselId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Consignee (A/c)">
          <select value={consigneeId} onChange={(e) => setConsigneeId(e.target.value)} className={inputCls}>
            <option value="">All</option>{consignees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-black text-slate-800">Daily Discharge Report</div>
          <button type="button" onClick={copy} disabled={!ready} className={primaryBtn}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'কপি হয়েছে' : 'কপি করুন'}</button>
        </div>
        {!stats && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
        {stats?.error && <div className="text-xs font-bold text-rose-600">রিপোর্ট আনা যায়নি। আবার চেষ্টা করুন।</div>}
        {ready && <pre className="whitespace-pre-wrap text-[13px] leading-relaxed font-mono bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800">{text}</pre>}
      </Card>
    </div>
  );
}