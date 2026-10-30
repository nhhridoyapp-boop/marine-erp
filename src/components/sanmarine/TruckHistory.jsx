import React, { useState, useEffect } from 'react';
import { History, Search, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { normalizeTruckNumber } from '@/utils/truckUtils';
import { PageShell, PageHeader, Card, Empty, Notice, inputCls, primaryBtn, ghostBtn } from './formParts';
import EmptyWeightHistory from './EmptyWeightHistory';

export default function TruckHistory({ initialTruck = '' }) {
  const [q, setQ] = useState(initialTruck);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);

  const run = async (raw) => {
    const n = normalizeTruckNumber(raw);
    if (!n) return;
    setBusy(true);
    // Same truck = identical normalised number, or the same 5+ digit registration digits.
    const digits = n.replace(/\D/g, '');
    const cond = digits.length >= 5 ? { $regex: digits } : n;
    const query = { normalizedTruckNumber: cond };
    const [loads, empties, loadTotal, emptyTotal] = await Promise.all([
      base44.entities.TruckEntry.filter(query, { sort: '-created_date', limit: 100 }),
      base44.entities.EmptyWeight.filter(query, { sort: '-created_date', limit: 100 }),
      base44.entities.TruckEntry.count(query),
      base44.entities.EmptyWeight.count(query),
    ]);
    setRes({
      query, loads: loads.items, empties: empties.items, loadTotal, emptyTotal,
      nextLoads: loads.has_more ? loads.next_cursor : null, nextEmpties: empties.has_more ? empties.next_cursor : null,
    });
    setBusy(false);
  };
  // Older trips are never cut off: every page of history can be opened.
  const more = async () => {
    setBusy(true);
    const [loads, empties] = await Promise.all([
      res.nextLoads ? base44.entities.TruckEntry.filter(res.query, { sort: '-created_date', limit: 100, cursor: res.nextLoads }) : null,
      res.nextEmpties ? base44.entities.EmptyWeight.filter(res.query, { sort: '-created_date', limit: 100, cursor: res.nextEmpties }) : null,
    ]);
    setRes((p) => ({
      ...p,
      loads: loads ? [...p.loads, ...loads.items] : p.loads, empties: empties ? [...p.empties, ...empties.items] : p.empties,
      nextLoads: loads && loads.has_more ? loads.next_cursor : null, nextEmpties: empties && empties.has_more ? empties.next_cursor : null,
    }));
    setBusy(false);
  };
  const search = (e) => { e.preventDefault(); run(q); };
  useEffect(() => { if (initialTruck) run(initialTruck); }, [initialTruck]);

  return (
    <PageShell>
      <PageHeader icon={History} title="ট্রাক হিস্ট্রি" sub="একটি ট্রাকের সকল খালি ও লোড রেকর্ড" />
      <form onSubmit={search} className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="ট্রাক নম্বর (যেমন: DMT-123456)" className={`${inputCls} uppercase font-mono`} />
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</button>
      </form>
      {res && res.loads.length === 0 && res.empties.length === 0 && <Empty text="এই ট্রাকের কোনো রেকর্ড নেই।" />}
      {res && res.loads.length + res.empties.length > 0 && (
        <>
          <Notice kind="info">লোড এন্ট্রি {res.loadTotal}টি · খালি ওজন {res.emptyTotal}টি</Notice>
          <EmptyWeightHistory empties={res.empties} loads={res.loads} />
          <div className="space-y-2">
            {res.loads.map(e => (
              <Card key={e.id}><div className="text-[10px] font-black text-teal-700 uppercase">লোড</div>
                <div className="text-sm font-black">{e.truckNumber} <span className="text-[11px] font-medium text-slate-500">{e.date} {e.time} · {e.ghatName}</span></div>
                <div className="text-[11px] font-bold text-slate-600">ব্যাগ {e.bags || 0} · গ্রস {e.gross} · টেয়ার {e.tare} · নেট {e.net} KG</div></Card>
            ))}
            {res.empties.map(e => (
              <Card key={e.id}><div className="text-[10px] font-black text-amber-700 uppercase">খালি ওজন</div>
                <div className="text-sm font-black">{e.truckNumber} <span className="text-[11px] font-medium text-slate-500">{e.emptyWeightDate} {e.emptyWeightTime} · {e.ghat}</span></div>
                <div className="text-[11px] font-bold text-slate-600">খালি গাড়ির ওজন {e.tallyWeight} · মনিটর {e.monitorWeight} · পার্থক্য {e.difference}</div></Card>
            ))}
          </div>
          {(res.nextLoads || res.nextEmpties) && <button onClick={more} disabled={busy} className={`${ghostBtn} w-full`}>আরও দেখুন</button>}
        </>
      )}
    </PageShell>
  );
}