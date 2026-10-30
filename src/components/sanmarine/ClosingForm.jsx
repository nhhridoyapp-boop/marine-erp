import React, { useState, useEffect } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { summarizeLighter, closeLighter } from '@/lib/sanmarineClosing';
import { logAudit } from '@/lib/sanmarineWorkflow';
import { Field, Select, Card, Notice, inputCls, primaryBtn } from './formParts';

const fN = (n) => Number(n || 0).toLocaleString('en-IN');

export default function ClosingForm({ lighters, vessels, closings, currentUser, onDone }) {
  const open = lighters.filter(l => l.status !== 'Completed' && !closings.some(c => c.lighterVesselId === l.id && c.status === 'LOCKED'));
  const [lighterId, setLighterId] = useState('');
  const [summary, setSummary] = useState(null);
  const [grams, setGrams] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setSummary(null);
    if (!lighterId) return undefined;
    let cancelled = false;
    summarizeLighter(lighterId).then(s => { if (!cancelled) setSummary(s); });
    return () => { cancelled = true; };
  }, [lighterId]);

  const bagTareKg = summary ? (summary.bags * (Number(grams) || 0)) / 1000 : 0;
  const finalKg = summary ? summary.netKg - bagTareKg : 0;

  const submit = async (e) => {
    e.preventDefault();
    const lighter = lighters.find(l => l.id === lighterId);
    if (!lighter || !summary) return;
    if (!confirm(`"${lighter.name}" ক্লোজ করলে নতুন এন্ট্রি লক হয়ে যাবে। নিশ্চিত?`)) return;
    setBusy(true);
    try {
      const vessel = vessels.find(v => v.id === lighter.motherVesselId);
      const c = await closeLighter(currentUser, { lighter, vessel, summary, bagTareGrams: grams, notes });
      await logAudit(currentUser, 'LIGHTER_CLOSED', 'VesselClosing', c.id, `${lighter.name} · ${(finalKg / 1000).toFixed(3)} MT`);
      setLighterId(''); setGrams(''); setNotes('');
      setMsg({ kind: 'success', text: `${lighter.name} ক্লোজ ও লক করা হয়েছে।` });
      await onDone();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message || 'ক্লোজিং ব্যর্থ।' });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm font-black text-slate-800">নতুন লাইটার ক্লোজিং</div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <Field label="লাইটার *"><Select value={lighterId} onChange={setLighterId} options={open.map(l => ({ value: l.id, label: l.name }))} /></Field>
        {lighterId && !summary && <div className="flex justify-center py-2"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
        {summary && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-slate-50"><div className="text-[10px] font-bold text-slate-500">ট্রাক</div><div className="font-black">{fN(summary.trucks)}</div></div>
              <div className="p-2 rounded-xl bg-slate-50"><div className="text-[10px] font-bold text-slate-500">ব্যাগ</div><div className="font-black">{fN(summary.bags)}</div></div>
              <div className="p-2 rounded-xl bg-slate-50"><div className="text-[10px] font-bold text-slate-500">নেট (KG)</div><div className="font-black">{fN(summary.netKg)}</div></div>
            </div>
            <Field label="ব্যাগ টেয়ার (গ্রাম/ব্যাগ)"><input type="number" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} className={inputCls} /></Field>
            <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-sm font-black text-teal-800">
              ব্যাগ টেয়ার: {fN(bagTareKg)} KG · চূড়ান্ত নেট: {fN(finalKg)} KG ({(finalKg / 1000).toFixed(3)} MT)
            </div>
            <Field label="ক্লোজিং নোট"><input value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} /></Field>
            <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} ক্লোজ ও লক করুন</button>
          </>
        )}
      </form>
    </Card>
  );
}