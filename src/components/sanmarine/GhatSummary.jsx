import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapPin, Loader2, MessageCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { loadSummaryData, buildTree } from '@/lib/sanmarineSummary';
import GhatTree, { StatsGrid } from './GhatTree';
import { PageShell, PageHeader, Card, Empty, Field, Notice, Select, inputCls, ghostBtn } from './formParts';
import GhatWorkload from './GhatWorkload';
import { toast } from '@/components/ui/use-toast';

export default function GhatSummary({ vessels = [], lighters = [], ghats = [] }) {
  const [from, setFrom] = useState(api.todayStr());
  const [to, setTo] = useState(api.todayStr());
  const [ghat, setGhat] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setData(null); setError('');
    loadSummaryData(from, to).then(setData).catch((e) => setError(e.message || 'ডাটা আনা যায়নি।'));
  }, [from, to]);
  useEffect(() => { reload(); }, [reload]);
  // Live: নতুন এন্ট্রি save হলে সাথে সাথে সামারি আপডেট হবে।
  useEffect(() => {
    const unsub = base44.entities.TruckEntry.subscribe((ev) => {
      if (ev.type === 'create' || ev.type === 'update') reload();
    });
    return unsub;
  }, [reload]);

  const result = useMemo(() => {
    if (!data) return null;
    const match = (name) => !ghat || (name || '').toUpperCase() === ghat;
    return buildTree(data.loads.filter((r) => match(r.ghatName)), data.empties.filter((e) => match(e.ghat)), { vessels, lighters });
  }, [data, ghat, vessels, lighters]);

  const copyText = () => {
    if (!result) return;
    const fN = (n) => Number(n || 0).toLocaleString('en-IN');
    const fMt = (kg) => (Number(kg || 0) / 1000).toFixed(3);
    const lines = ['*SAN MARINE SURVEY & INSPECTION*', `*ঘাট ডেইলি সামারি · ${from} থেকে ${to}*`];
    for (const d of result.tree) {
      lines.push('', `*${d.label}*`);
      for (const g of d.kids) {
        lines.push(`*GHAT: ${g.label}*`);
        for (const v of g.kids) {
          lines.push('', v.label);
          for (const l of v.kids) {
            if (!l.trucks.length) continue;
            lines.push(l.label);
            for (const t of l.trucks) lines.push(`Truck: ${t.truckNumber} — ${fN(t.bags)} Bag — ${fMt(t.net)} MT`);
            lines.push(`Lighter Total: ${l.trucks.length} Truck | ${fN(l.stats.bags)} Bag | ${fMt(l.stats.net)} MT`);
          }
        }
        lines.push(`GHAT Total: ${g.stats.total} Truck | ${fN(g.stats.bags)} Bag | ${fMt(g.stats.net)} MT`);
      }
    }
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => toast({ title: 'WhatsApp টেক্সট কপি হয়েছে' })).catch(() => {});
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <PageShell>
      <PageHeader icon={MapPin} title="ঘাট ডেইলি সামারি (লাইভ)" sub="তারিখ → ঘাট → মাদার ভেসেল → লাইটার → ট্রাক — এন্ট্রি সেভ হলে সাথে সাথে আপডেট"
        right={result && <button onClick={copyText} className={ghostBtn}><MessageCircle className="h-4 w-4" /> WhatsApp কপি</button>} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="শুরু তারিখ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
        <Field label="শেষ তারিখ"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
        <Field label="ঘাট"><Select value={ghat} onChange={setGhat} options={ghats.map((g) => ({ value: g.name.toUpperCase(), label: g.name.toUpperCase() }))} placeholder="সব ঘাট" /></Field>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {!result && !error && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
      {data && <GhatWorkload data={data} ghat={ghat} onSelectGhat={setGhat} />}
      {data?.truncated && <Notice kind="warn">ডাটা অনেক বেশি — প্রথম ৫০০০টি রেকর্ড দেখানো হচ্ছে। তারিখের সীমা ছোট করুন।</Notice>}
      {result && result.tree.length === 0 && <Empty text="এই সময়ে কোনো এন্ট্রি নেই।" />}
      {result && result.tree.length > 0 && (
        <>
          <Card><div className="text-xs font-black text-slate-700">মোট সারাংশ · ব্যাগ {result.total.bags.toLocaleString('en-IN')} · নেট {(result.total.net / 1000).toFixed(3)} MT</div><StatsGrid stats={result.total} /></Card>
          <GhatTree tree={result.tree} />
        </>
      )}
    </PageShell>
  );
}