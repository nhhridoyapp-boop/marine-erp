import React, { useState, useMemo } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { isAdminRole } from '@/lib/erpRoles';
import { reconcileDocs } from '@/lib/sanmarineRules';
import { saveDailyDoc, applyDocEdit, validateDoc } from '@/lib/sanmarineDocs';
import { createApproval, logAudit } from '@/lib/sanmarineWorkflow';
import { withRows } from '@/lib/sanmarineKhataRows';
import { Field, Select, Card, Notice, inputCls, primaryBtn, ghostBtn } from './formParts';
import MultiPhotoField from './MultiPhotoField';
import TruckBagRows from './TruckBagRows';
import DocReconcilePanel from './DocReconcilePanel';
import useKhataScan from './useKhataScan';
import useSystemTrucks from './useSystemTrucks';

const BLANK = () => ({ date: api.todayStr(), motherVesselId: '', lighterVesselId: '', ghatName: '', weighmentSheetPhoto: '', pointKhataPhoto: '', wsText: '', pkText: '', wsBags: '', pkBags: '', wsRows: [], pkRows: [], remarks: '' });

// Create (everyone) or edit (Admin directly; others send a request for Super Admin approval).
export default function DailyDocForm({ initial, editId, vessels, lighters, ghats, currentUser, onDone, onCancel }) {
  const [f, setF] = useState(initial || BLANK());
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState({ ws: false, pk: false });
  const uploadBusy = uploads.ws || uploads.pk;
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setRows = (kind, rows) => setF((p) => withRows(p, kind, rows));
  const vessel = vessels.find((v) => v.id === f.motherVesselId);
  const lighter = lighters.find((l) => l.id === f.lighterVesselId);
  const ghat = ghats.find((g) => g.name.toUpperCase() === f.ghatName);
  const rec = useMemo(() => reconcileDocs(f), [f.wsText, f.pkText, f.wsBags, f.pkBags]);
  const missing = validateDoc(f);
  const direct = isAdminRole(currentUser);
  const ks = useKhataScan(f, setF, { vessels, lighters, ghats, editId });
  const sys = useSystemTrucks({ date: f.date, lighterVesselId: f.lighterVesselId, ghatName: f.ghatName });

  const submit = async (e) => {
    e.preventDefault();
    if (uploadBusy || ks.busy || missing.length) { setErr(uploadBusy || ks.busy ? 'সব ছবি আপলোড ও স্ক্যান শেষ হতে দিন।' : `আবশ্যক তথ্য বাকি: ${missing.join(', ')}`); return; }
    setErr(''); setBusy(true);
    const ctx = { vessel: vessel && { id: vessel.id, name: vessel.name, company: vessel.company }, lighter: lighter && { id: lighter.id, name: lighter.name, company: lighter.company, motherVesselId: lighter.motherVesselId, consigneeId: lighter.consigneeId, consigneeName: lighter.consigneeName }, ghat: ghat && { id: ghat.id } };
    try {
      if (!editId) {
        const { doc } = await saveDailyDoc(f, ctx, currentUser);
        onDone({ kind: 'success', text: `ডকুমেন্ট সংরক্ষিত হয়েছে — ${doc.reconciliationStatus === 'MATCHED' ? 'ম্যাচড' : 'অমিল পাওয়া গেছে (ট্রাক অমিল বা ব্যাগ ৪৫-এর বেশি হলে অ্যালার্ট তৈরি হয়েছে)'}।` });
      } else if (direct) {
        await applyDocEdit(editId, f, ctx, currentUser);
        onDone({ kind: 'success', text: 'ডকুমেন্ট সম্পাদনা সংরক্ষিত হয়েছে।' });
      } else {
        await createApproval(currentUser, { type: 'RECORD_EDIT', targetId: editId, targetDescription: `ডেইলি ডকুমেন্ট: ${lighter?.name || ''} (${f.date}) সম্পাদনা`, payload: { kind: 'document', form: f, ctx } });
        await logAudit(currentUser, 'DAILY_DOC_EDIT_REQUESTED', 'LighterDailyDocument', editId, `${lighter?.name || ''} ${f.date}`);
        onDone({ kind: 'info', text: 'সম্পাদনার অনুরোধ সুপার অ্যাডমিনের অনুমোদনের জন্য পাঠানো হয়েছে।' });
      }
    } catch (ex) { setErr(ex.message || 'সংরক্ষণ ব্যর্থ।'); } finally { setBusy(false); }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm font-black text-slate-800">{editId ? 'ডকুমেন্ট সম্পাদনা' : 'নতুন ডেইলি ডকুমেন্ট'}</div>
        {editId && !direct && <Notice kind="info">পরিবর্তন সুপার অ্যাডমিনের অনুমোদনের পর কার্যকর হবে।</Notice>}
        {err && <Notice kind="error">{err}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="তারিখ *"><input type="date" value={f.date} disabled={!!editId} onChange={(e) => set('date', e.target.value)} className={inputCls} /></Field>
          <Field label="ঘাট *"><Select value={f.ghatName} onChange={(v) => set('ghatName', v)} options={ghats.map((g) => ({ value: g.name.toUpperCase(), label: g.name.toUpperCase() }))} placeholder="— ঘাট —" /></Field>
          <Field label="মাদার ভেসেল *"><Select value={f.motherVesselId} onChange={(v) => setF((p) => p.motherVesselId === v ? p : ({ ...p, motherVesselId: v, lighterVesselId: '' }))} options={vessels.map((v) => ({ value: v.id, label: v.name }))} /></Field>
          <Field label="লাইটার *"><Select value={f.lighterVesselId} disabled={!f.motherVesselId} onChange={(v) => set('lighterVesselId', v)} options={lighters.filter((l) => l.motherVesselId === f.motherVesselId).map((l) => ({ value: l.id, label: l.name }))} /></Field>
        </div>
        {ks.msg && <Notice kind={ks.msg.kind}>{ks.msg.text}</Notice>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MultiPhotoField label="ওয়েইমেন্ট শিটের ছবি (একাধিক)" required value={f.weighmentSheetPhoto} onChange={(v) => set('weighmentSheetPhoto', v)} onScan={() => ks.scan('ws')} scanBusy={ks.busy === 'ws'} disabled={busy} onBusy={(value) => setUploads((p) => ({ ...p, ws: value }))} />
          <MultiPhotoField label="পয়েন্ট খাতার ছবি (একাধিক)" required value={f.pointKhataPhoto} onChange={(v) => set('pointKhataPhoto', v)} onScan={() => ks.scan('pk')} scanBusy={ks.busy === 'pk'} disabled={busy} onBusy={(value) => setUploads((p) => ({ ...p, pk: value }))} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TruckBagRows label="ওয়েইমেন্ট শিট — ট্রাক ও ব্যাগ *" rows={f.wsRows || []} onChange={(r) => setRows('ws', r)} bags={f.wsBags} onBagsChange={(v) => set('wsBags', v)} />
          <TruckBagRows label="পয়েন্ট খাতা — ট্রাক ও ব্যাগ *" rows={f.pkRows || []} onChange={(r) => setRows('pk', r)} bags={f.pkBags} onBagsChange={(v) => set('pkBags', v)} />
        </div>
        <Field label="মন্তব্য"><input value={f.remarks} onChange={(e) => set('remarks', e.target.value)} className={inputCls} /></Field>
        <DocReconcilePanel rec={rec} wsBags={f.wsBags} pkBags={f.pkBags} sys={sys} wsRows={f.wsRows} pkRows={f.pkRows} />
        {missing.length > 0 && <Notice kind="warn">জমা দিতে বাকি: {missing.join(', ')}</Notice>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy || uploadBusy || !!ks.busy || missing.length > 0} className={`${primaryBtn} flex-1`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {editId && !direct ? 'অনুমোদনের জন্য পাঠান' : 'সংরক্ষণ'}</button>
          <button type="button" onClick={onCancel} className={ghostBtn}><X className="h-4 w-4" /> বাতিল</button>
        </div>
      </form>
    </Card>
  );
}