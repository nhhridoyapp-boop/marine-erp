import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileCheck, Plus, Pencil, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { andQuery } from '@/components/sanmarine/company/companyScope';
import { isAdminRole } from '@/lib/erpRoles';
import { DOC_STATUS_LABEL } from '@/lib/sanmarineRules';
import { docToForm, deleteDailyDoc } from '@/lib/sanmarineDocs';
import { createApproval } from '@/lib/sanmarineWorkflow';
import DailyDocForm from './DailyDocForm';
import DocDetail from './DocDetail';
import { PageShell, PageHeader, Card, Notice, Empty, Select, inputCls, primaryBtn, ghostBtn } from './formParts';

function DocCard({ d, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ok = d.reconciliationStatus === 'MATCHED';
  return (
    <Card className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm text-slate-800">{d.lighterVesselName} <span className="text-[11px] font-medium text-slate-500">· {d.motherVesselName}</span></div>
          <div className="text-[11px] text-slate-500">{d.date} · {d.ghatName} · {d.consigneeName || '—'}</div>
          <div className="text-[11px] font-bold text-slate-700 mt-1">শিট {d.weighmentSheetTotalTrucks} ট্রাক / {d.scaleTotalBags} ব্যাগ · খাতা {d.pointKhataTotalTrucks} ট্রাক / {d.pointKhataTotalBags} ব্যাগ</div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{DOC_STATUS_LABEL[d.reconciliationStatus] || d.reconciliationStatus}</span>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button onClick={() => onEdit(d)} className="p-2 rounded-lg bg-slate-100 text-slate-600" title="সম্পাদনা"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => onDelete(d)} className="p-2 rounded-lg bg-rose-50 text-rose-600" title="মুছুন"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      <button type="button" onClick={() => setOpen((s) => !s)} className="text-[11px] font-bold text-teal-700 flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {open ? 'বিস্তারিত লুকান' : 'ছবি ও বিস্তারিত দেখুন'}</button>
      {open && <DocDetail d={d} />}
    </Card>
  );
}

export default function DailyDocuments({ scope, vessels, lighters, ghats, currentUser }) {
  const [form, setForm] = useState(null);
  const [date, setDate] = useState('');
  const [lighterId, setLighterId] = useState('');
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState(null);
  const reqRef = useRef(0);

  const load = useCallback(async (cursor) => {
    const id = ++reqRef.current;
    setLoading(true);
    if (!scope) { setItems([]); setNext(null); setLoading(false); return; }
    const q = {};
    if (date) q.date = date;
    if (lighterId) q.lighterVesselId = lighterId;
    try {
      const page = await base44.entities.LighterDailyDocument.filter(andQuery(scope.docs, q), { sort: '-date', limit: 20, cursor });
      if (id !== reqRef.current) return;
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setNext(page.has_more ? page.next_cursor : null);
      setNote((prev) => prev?.kind === 'error' ? null : prev);
    } catch (error) {
      if (id === reqRef.current) setNote({ kind: 'error', text: 'ডকুমেন্ট তালিকা লোড হয়নি; আগের ডেটা ও লগইন অক্ষত আছে। আবার চেষ্টা করুন।' });
    } finally { if (id === reqRef.current) setLoading(false); }
  }, [scope, date, lighterId]);
  useEffect(() => { load(); }, [load]);

  const remove = async (d) => {
    try {
      if (isAdminRole(currentUser)) {
        if (!confirm('এই ডকুমেন্ট মুছে ফেলতে চান?')) return;
        await deleteDailyDoc(d.id, currentUser);
        setNote({ kind: 'success', text: 'ডকুমেন্ট মুছে ফেলা হয়েছে (অডিট লগে সংরক্ষিত)।' });
      } else {
        if (!confirm('মুছে ফেলার অনুরোধ সুপার অ্যাডমিনের কাছে পাঠাবেন?')) return;
        await createApproval(currentUser, { type: 'RECORD_DELETE', targetId: d.id, targetDescription: `ডেইলি ডকুমেন্ট: ${d.lighterVesselName} (${d.date})`, payload: { kind: 'document' } });
        setNote({ kind: 'info', text: 'ডিলিট অনুরোধ অনুমোদনের জন্য পাঠানো হয়েছে।' });
      }
    } catch (e) { setNote({ kind: 'error', text: e.message || 'কাজ ব্যর্থ।' }); }
    load();
  };

  const done = (n) => { setForm(null); setNote(n); load(); };

  return (
    <PageShell>
      <PageHeader icon={FileCheck} title="ডেইলি ডকুমেন্টস ও খাতা" sub="ওয়েইমেন্ট শিট বনাম পয়েন্ট খাতা — ট্রাক ও ব্যাগ মিলানো"
        right={scope && !form && <button onClick={() => { setNote(null); setForm({ initial: null, editId: null }); }} className={primaryBtn}><Plus className="h-4 w-4" /> নতুন</button>} />
      <p className="text-xs text-muted-foreground">এই কোম্পানির নিশ্চিত রেকর্ড দেখানো হচ্ছে; অনির্ধারিত পুরোনো ডকুমেন্ট Data Safety-এর Admin Review-তে আছে, মুছে ফেলা হয়নি।</p>
      {note && <Notice kind={note.kind}>{note.text}</Notice>}
      {note?.kind === 'error' && <button type="button" onClick={() => load()} className={ghostBtn}>আবার চেষ্টা করুন</button>}
      {form && <DailyDocForm initial={form.initial} editId={form.editId} vessels={vessels} lighters={lighters} ghats={ghats} currentUser={currentUser} onDone={done} onCancel={() => setForm(null)} />}
      <div className="grid grid-cols-2 gap-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        <Select value={lighterId} onChange={setLighterId} options={lighters.map((l) => ({ value: l.id, label: l.name }))} placeholder="সব লাইটার" />
      </div>
      {!loading && scope && note?.kind !== 'error' && items.length === 0 && <Empty text="কোনো ডকুমেন্ট পাওয়া যায়নি।" />}
      <div className="space-y-2">{items.map((d) => <DocCard key={d.id} d={d} onEdit={(x) => { setNote(null); setForm({ initial: docToForm(x), editId: x.id }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onDelete={remove} />)}</div>
      {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
      {next && !loading && <button onClick={() => load(next)} className={`${ghostBtn} w-full`}>আরও দেখুন</button>}
    </PageShell>
  );
}