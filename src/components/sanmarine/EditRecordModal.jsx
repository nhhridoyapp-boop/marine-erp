import React, { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isAdminRole } from '@/lib/erpRoles';
import { applyRecordEdit, pickEditable, assertNotLocked } from '@/lib/sanmarineEntries';
import { createApproval } from '@/lib/sanmarineWorkflow';
import { Field, Select, Notice, inputCls, primaryBtn } from './formParts';
import PhotoField from './PhotoField';
import VideoField from '@/components/sanmarine/VideoField';

const FIELDS = {
  loading: [['truckNumber', 'ট্রাক নম্বর', 'text'], ['date', 'লোড তারিখ', 'date'], ['time', 'লোড সময়', 'time'], ['ghatName', 'ঘাট', 'ghat'], ['scaleName', 'স্কেল নাম', 'text'],
    ['bags', 'ব্যাগ', 'number'], ['gross', 'গ্রস (KG)', 'number'], ['tare', 'খালি গাড়ির ওজন (KG)', 'number'], ['secondWeight', 'মনিটর ওয়েট (KG)', 'number'],
    ['secondWeightDate', 'সেকেন্ড ওয়েট তারিখ', 'date'], ['secondWeightTime', 'সেকেন্ড ওয়েট সময়', 'time'], ['remarks', 'মন্তব্য', 'text']],
  empty: [['truckNumber', 'ট্রাক নম্বর', 'text'], ['emptyWeightDate', 'তারিখ', 'date'], ['emptyWeightTime', 'সময়', 'time'], ['ghat', 'ঘাট', 'ghat'],
    ['scaleName', 'স্কেল নাম', 'text'], ['tallyWeight', 'খালি গাড়ির ওজন (KG)', 'number'], ['monitorWeight', 'মনিটর ওজন (KG)', 'number'], ['remarks', 'মন্তব্য', 'text']],
};
const PHOTOS = {
  loading: [['scalePhoto', 'সেকেন্ড ওয়েট স্কেল কপি'], ['monitorPhoto', 'মনিটর ছবি']],
  empty: [['tallyOriginalPhoto', 'খালি ওজন স্লিপ ছবি'], ['monitorPhoto', 'মনিটর ছবি']],
};

// Admin / Super Admin save directly; Supervisor / Staff send a request the Super Admin must approve.
export default function EditRecordModal({ kind, item, ghats, currentUser, onClose, onDone }) {
  const keys = [...FIELDS[kind].map((x) => x[0]), ...PHOTOS[kind].map((x) => x[0]), ...(kind === 'empty' ? ['emptyTruckVideo', 'emptyTruckVideoName'] : [])];
  const [v, setV] = useState(() => Object.fromEntries(keys.map((k) => [k, item[k] ?? ''])));
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [err, setErr] = useState('');
  const direct = isAdminRole(currentUser);
  const label = kind === 'loading' ? 'লোড এন্ট্রি' : 'খালি ওজন';

  const save = async (e) => {
    e.preventDefault();
    if (videoBusy) return;
    setErr('');
    const patch = pickEditable(kind, v);
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, val]) => String(item[k] ?? '') !== String(val ?? '')));
    if (!Object.keys(changed).length) { setErr('কোনো পরিবর্তন করা হয়নি।'); return; }
    setBusy(true);
    try {
      if (direct) {
        await applyRecordEdit(kind, item.id, changed, currentUser);
        onDone({ kind: 'success', text: 'রেকর্ড সম্পাদনা সংরক্ষিত হয়েছে।' });
      } else {
        await assertNotLocked(kind, item);
        // The request carries the old value of every changed field, so the approving admin sees exactly what changes.
        const fieldRows = [...FIELDS[kind], ...PHOTOS[kind], ['emptyTruckVideo', 'খালি গাড়ির ভিডিও'], ['emptyTruckVideoName', 'ভিডিও ফাইলের নাম']];
        const labelOf = (k) => (fieldRows.find(([x]) => x === k) || [, k])[1];
        await createApproval(currentUser, {
          type: 'RECORD_EDIT', targetId: item.id, targetDescription: `${label}: ${item.truckNumber} সম্পাদনা`,
          details: Object.keys(changed).join(', '),
          payload: {
            kind, patch: changed,
            before: Object.fromEntries(Object.keys(changed).map((k) => [k, item[k] ?? ''])),
            labels: Object.fromEntries(Object.keys(changed).map((k) => [k, labelOf(k)])),
          },
        });
        onDone({ kind: 'info', text: 'সম্পাদনার অনুরোধ সুপার অ্যাডমিনের অনুমোদনের জন্য পাঠানো হয়েছে।' });
      }
    } catch (ex) { setErr(ex.message || 'সংরক্ষণ ব্যর্থ।'); } finally { setBusy(false); }
  };

  const ghatOpts = ghats.map((g) => ({ value: g.name.toUpperCase(), label: g.name.toUpperCase() }));
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader><DialogTitle className="text-base font-black">{label} সম্পাদনা — {item.truckNumber}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          {!direct && <Notice kind="info">আপনার রোলে সরাসরি সম্পাদনা নেই — পরিবর্তনগুলো সুপার অ্যাডমিনের অনুমোদনের পর কার্যকর হবে।</Notice>}
          {err && <Notice kind="error">{err}</Notice>}
          <div className="grid grid-cols-2 gap-3">
            {FIELDS[kind].map(([k, l, t]) => (
              <Field key={k} label={l}>
                {t === 'ghat'
                  ? <Select value={v[k]} onChange={(x) => setV((p) => ({ ...p, [k]: x }))} options={ghatOpts} />
                  : <input type={t} inputMode={t === 'number' ? 'decimal' : undefined} value={v[k]} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} className={inputCls} />}
              </Field>
            ))}
          </div>
          {PHOTOS[kind].map(([k, l]) => <PhotoField key={k} label={l} required value={v[k]} onChange={(x) => setV((p) => ({ ...p, [k]: x }))} />)}
          {kind === 'empty' && <VideoField value={v.emptyTruckVideo} name={v.emptyTruckVideoName} onChange={(uri, name) => setV((p) => ({ ...p, emptyTruckVideo: uri, emptyTruckVideoName: name }))} onBusy={setVideoBusy} disabled={busy} />}
          <button type="submit" disabled={busy || videoBusy} className={`${primaryBtn} w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {direct ? 'সংরক্ষণ' : 'অনুমোদনের জন্য পাঠান'}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}