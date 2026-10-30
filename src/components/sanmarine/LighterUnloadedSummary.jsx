import React, { useState, useEffect, useCallback } from 'react';
import { Anchor, Loader2, MessageCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { loadSummaryData } from '@/lib/sanmarineSummary';
import { PageShell, PageHeader, Card, Field, Notice, Empty, inputCls, ghostBtn } from './formParts';
import { toast } from '@/components/ui/use-toast';

const num = (n) => Number(n) || 0;
const fN = (n) => num(n).toLocaleString('en-IN');
const fMt = (kg) => (num(kg) / 1000).toFixed(3);

export default function LighterUnloadedSummary({ vessels = [], lighters = [] }) {
  const [from, setFrom] = useState(api.todayStr());
  const [to, setTo] = useState(api.todayStr());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await loadSummaryData(from, to);
      const map = new Map();
      for (const r of data.loads) {
        const id = r.lighterVesselId || '~';
        let row = map.get(id);
        if (!row) {
          row = { id, lighter: (lighters.find((l) => l.id === id) || {}).name || '—', vessel: (vessels.find((v) => v.id === r.motherVesselId) || {}).name || '—', ghats: new Set(), trucks: 0, bags: 0, net: 0 };
          map.set(id, row);
        }
        if (r.ghatName) row.ghats.add(r.ghatName.toUpperCase());
        row.trucks += 1; row.bags += num(r.bags); row.net += num(r.net);
      }
      setRows([...map.values()].sort((a, b) => b.net - a.net));
    } catch (e) { setError(e.message || 'ডাটা আনা যায়নি।'); }
    finally { setLoading(false); }
  }, [from, to, vessels, lighters]);

  useEffect(() => { reload(); }, [reload]);
  // Live: নতুন এন্ট্রি save হলে সাথে সাথে সামারি আপডেট হবে।
  useEffect(() => {
    const unsub = base44.entities.TruckEntry.subscribe((ev) => {
      if (ev.type === 'create' || ev.type === 'update') reload();
    });
    return unsub;
  }, [reload]);

  const tot = rows.reduce((a, r) => ({ trucks: a.trucks + r.trucks, bags: a.bags + r.bags, net: a.net + r.net }), { trucks: 0, bags: 0, net: 0 });

  const copyText = () => {
    if (!rows.length) return;
    const lines = [`*লাইটারভিত্তিক মোট আনলোড — ${from} থেকে ${to}*`, ''];
    for (const r of rows) {
      lines.push(`*${r.lighter}*`, `মাদার ভেসেল: ${r.vessel}`, `ঘাট: ${[...r.ghats].join(', ') || '—'}`, `Truck: ${r.trucks} | Bags: ${fN(r.bags)} | Net: ${fMt(r.net)} MT`, '');
    }
    lines.push(`*মোট:* ${tot.trucks} Truck | ${fN(tot.bags)} Bag | ${fMt(tot.net)} MT`);
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => toast({ title: 'WhatsApp টেক্সট কপি হয়েছে' })).catch(() => {});
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <PageShell>
      <PageHeader icon={Anchor} title="লাইটারভিত্তিক মোট আনলোড সামারি" sub="প্রতিটি লাইটারের মোট ট্রাক · ব্যাগ · নেট (MT) — এন্ট্রি সেভ হলে সাথে সাথে আপডেট"
        right={rows.length > 0 && <button onClick={copyText} className={ghostBtn}><MessageCircle className="h-4 w-4" /> WhatsApp কপি</button>} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="শুরু তারিখ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
        <Field label="শেষ তারিখ"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
      {!loading && !error && rows.length === 0 && <Empty text="এই সময়ে কোনো আনলোড নেই।" />}
      {rows.length > 0 && (
        <>
          <Card>
            <div className="grid grid-cols-3 gap-2">
              {[['মোট লাইটার', rows.length], ['মোট ট্রাক', fN(tot.trucks)], ['মোট নেট (MT)', fMt(tot.net)]].map(([l, v]) => (
                <div key={l} className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-center">
                  <div className="text-[9px] font-bold text-slate-500">{l}</div>
                  <div className="text-sm font-black font-mono text-slate-800">{v}</div>
                </div>
              ))}
            </div>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rows.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-sm text-slate-800 truncate">{r.lighter}</div>
                    <div className="text-[11px] text-slate-500 truncate">{r.vessel} · {[...r.ghats].join(', ') || '—'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-bold text-slate-400">নেট</div>
                    <div className="text-base font-black font-mono text-teal-700">{fMt(r.net)} <span className="text-[10px] text-slate-400">MT</span></div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  {[['ট্রাক', fN(r.trucks)], ['ব্যাগ', fN(r.bags)], ['নেট (KG)', fN(r.net)]].map(([l, v]) => (
                    <div key={l} className="px-2 py-1 rounded-lg bg-slate-50 text-center">
                      <div className="text-[9px] font-bold text-slate-500">{l}</div>
                      <div className="text-xs font-black font-mono text-slate-800">{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}