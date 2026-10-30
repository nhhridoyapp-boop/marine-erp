import React, { useState, useEffect } from 'react';
import { Loader2, Save, MapPin } from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { saveEmptyWeight } from '@/lib/sanmarineEntries';
import { logAudit } from '@/lib/sanmarineWorkflow';
import { formatTruckDisplay } from '@/utils/truckUtils';
import { Field, Card, Notice, inputCls, primaryBtn } from './formParts';
import SearchSelect from './SearchSelect';
import TruckInput from './TruckInput';
import PhotoField from './PhotoField';
import VideoField from '@/components/sanmarine/VideoField';
import { extractFromEmptySlip, compareExtractions, isOcrQuotaError, wrongSlipType } from '@/lib/sanmarineOcr';
import PreviousTrip from './PreviousTrip';
import HistoricalWeightHistory from '@/components/sanmarine/history/HistoricalWeightHistory';
import useTruckContext from './useTruckContext';
import useGpsLocation from './useGpsLocation';
import { MONITOR_TOLERANCE_KG } from '@/lib/sanmarineRules';

export default function EmptyWeightForm({ ghats, vessels = [], lighters = [], scales = [], currentUser, rules, initialTruck = '', truckSuggestions = [], onSaved }) {
  const blank = () => ({ truckNumber: initialTruck, date: api.todayStr(), time: api.timeStr(), ghat: '', scaleName: '', tallyWeight: '', monitorWeight: '', tallyOriginalPhoto: '', monitorPhoto: '', emptyTruckVideo: '', emptyTruckVideoName: '', remarks: '' });
  const [f, setF] = useState(blank);
  const [mappings, setMappings] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(null);
  const [ocrData, setOcrData] = useState({ tally: null, monitor: null });
  const [ocrMsg, setOcrMsg] = useState(null);
  const [videoWarned, setVideoWarned] = useState(false);
  const ctx = useTruckContext(f.truckNumber);
  const gps = useGpsLocation();
  useEffect(() => { gps.capture(); }, []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const runOcrEmpty = async (uri, field) => {
    if (!uri) return;
    setOcrBusy(field); setOcrMsg(null);
    try {
      const data = await extractFromEmptySlip(uri, field === 'monitor');
      setOcrData((p) => ({ ...p, [field]: data }));
      const wKey = field === 'tally' ? 'tallyWeight' : 'monitorWeight';
      setF((p) => ({
        ...p,
        truckNumber: data.truckNumber || p.truckNumber,
        date: data.date || p.date,
        time: data.time || p.time,
        [wKey]: data.emptyWeight != null ? String(data.emptyWeight) : p[wKey],
        scaleName: data.scaleName || p.scaleName,
      }));
      const found = [], missing = [];
      [['ট্রাক নম্বর', data.truckNumber], ['তারিখ', data.date], ['সময়', data.time], ['ওজন', data.emptyWeight], ['স্কেল', data.scaleName]]
        .forEach(([label, val]) => (val != null && val !== '' ? found : missing).push(label));
      const typeWarn = wrongSlipType(data, 'empty') ? ' ⚠ এটি লোডেড স্লিপ বলে মনে হচ্ছে — খালি ওজন স্লিপ আপলোড করুন।' : '';
      setOcrMsg({ kind: found.length ? (typeWarn ? 'warn' : 'success') : 'warn', text: found.length
        ? `OCR সফল — পড়া হয়েছে: ${found.join(', ')}${missing.length ? `। পাওয়া যায়নি: ${missing.join(', ')}` : ''}${typeWarn}`
        : 'OCR কোনো তথ্য পড়তে পারেনি। হাতে লিখুন।' });
    } catch (e) {
      const quota = isOcrQuotaError(e);
      setOcrMsg({ kind: quota ? 'warn' : 'error', text: quota
        ? (e.message || 'ফ্রী OCR কোটা বা সংযোগের সীমা; পরে চেষ্টা করুন।') + ' হাতে লিখুন — ছবি সংরক্ষিত থাকবে।'
        : 'OCR ব্যর্থ: ' + (e.message || 'অজানা ত্রুটি') + '। হাতে লিখুন।' });
    } finally { setOcrBusy(null); }
  };

  useEffect(() => { api.getScaleGhatMappings().then(setMappings); }, []);

  const mapped = mappings.find((x) => x.scaleName === f.scaleName.toUpperCase().trim());
  const onScale = (v) => setF((p) => {
    const m = mappings.find((x) => x.scaleName === v.toUpperCase().trim());
    return { ...p, scaleName: v, ghat: p.ghat || m?.ghatName || '' };
  });

  const ghatNames = [...new Set([...ghats.map((g) => g.name.toUpperCase()), ...(f.ghat ? [f.ghat] : [])])];
  const scaleNames = [...new Set([...scales.map((s) => s.name.toUpperCase()), ...mappings.map((m) => m.scaleName)])];
  const hasWeights = f.tallyWeight !== '' && f.monitorWeight !== '';
  const diff = (Number(f.monitorWeight) || 0) - (Number(f.tallyWeight) || 0);
  const mismatch = hasWeights && Math.abs(diff) > MONITOR_TOLERANCE_KG;
  const ocrMismatches = ocrData.tally && ocrData.monitor ? compareExtractions(ocrData.tally, ocrData.monitor) : [];
  const missing = [
    !f.date && 'তারিখ', !f.time && 'সময়', !f.truckNumber.trim() && 'ট্রাক নম্বর', !f.ghat && 'ঘাট', !(Number(f.tallyWeight) > 0) && 'খালি গাড়ির ওজন', !(Number(f.monitorWeight) > 0) && 'মনিটর ওজন',
    !f.tallyOriginalPhoto && 'খালি ওজন স্লিপ ছবি', !f.monitorPhoto && 'মনিটর ছবি',
  ].filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    if (videoBusy) return;
    setMsg(null);
    if (!f.emptyTruckVideo && !videoWarned) {
      setVideoWarned(true);
      setMsg({ kind: 'warn', text: '⚠ খালি গাড়ির ভিডিও যুক্ত নেই। ভিডিও যোগ করুন, অথবা আবার সংরক্ষণ চাপলে ভিডিও ছাড়াই এন্ট্রি সেভ হবে।' });
      return;
    }
    setBusy(true);
    try {
      // Re-acquire the freshest GPS fix at save time (no extra prompt if we have a recent fix).
      const fix = await gps.recapture();
      const saved = await saveEmptyWeight({
        truckNumber: formatTruckDisplay(f.truckNumber), emptyWeightDate: f.date, emptyWeightTime: f.time, ghat: f.ghat, scaleName: f.scaleName,
        tallyWeight: f.tallyWeight, monitorWeight: f.monitorWeight, tallyOriginalPhoto: f.tallyOriginalPhoto, monitorPhoto: f.monitorPhoto,
        emptyTruckVideo: f.emptyTruckVideo, emptyTruckVideoName: f.emptyTruckVideoName, remarks: f.remarks,
        latitude: fix?.latitude ?? gps.coords?.latitude, longitude: fix?.longitude ?? gps.coords?.longitude,
        locationName: fix?.locationName ?? gps.locationName, gpsCapturedAt: (fix?.capturedAt ?? gps.capturedAt) ? new Date(fix?.capturedAt ?? gps.capturedAt).toISOString() : '',
      }, currentUser, rules);
      // Monitor-vs-slip difference over the tolerance: nothing is saved yet — an admin decision creates the entry.
      if (saved.pendingApproval) {
        await logAudit(currentUser, 'WEIGHT_MISMATCH_APPROVAL_REQUESTED', 'EmptyWeight', saved.approval.id, `${formatTruckDisplay(f.truckNumber)} — স্লিপ ${f.tallyWeight} KG, মনিটর ${f.monitorWeight} KG`);
        setMsg({ kind: 'warn', text: '⚠ মনিটর ও স্লিপ ওজনে গড়মিল বেশি — এন্ট্রি এখনো সংরক্ষিত হয়নি। অনুমোদন কেন্দ্রে অ্যাডমিনের কাছে পাঠানো হয়েছে; অ্যাডমিন অনুমোদন দিলেই এন্ট্রি তৈরি হবে।' });
        setF((p) => ({ ...blank(), ghat: p.ghat, scaleName: p.scaleName }));
        setOcrData({ tally: null, monitor: null });
        setVideoWarned(false);
        await onSaved();
        return;
      }
      const { record, generatedAlerts, linkedLoad } = saved;
      await logAudit(currentUser, 'EMPTY_WEIGHT_CREATED', 'EmptyWeight', record.id, `${record.truckNumber} · ${record.monitorWeight} KG`);
      const extra = linkedLoad ? ` পেন্ডিং লোড এন্ট্রির (${linkedLoad.serial || linkedLoad.date}) সাথে স্বয়ংক্রিয়ভাবে যুক্ত হয়েছে।` : '';
      setMsg(generatedAlerts.length
        ? { kind: 'warn', text: `সংরক্ষিত হয়েছে, তবে ${generatedAlerts.length}টি অ্যালার্ট তৈরি হয়েছে: ${generatedAlerts.map((a) => a.title).join(' | ')}.${extra}` }
        : { kind: 'success', text: `✓ ${record.truckNumber} — খালি ওজন সংরক্ষিত হয়েছে।${extra}` });
      setF((p) => ({ ...blank(), ghat: p.ghat, scaleName: p.scaleName }));
      setOcrData({ tally: null, monitor: null }); // a stale reading must never be compared with the next truck's photo
      setVideoWarned(false);
      await onSaved();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message || 'সংরক্ষণ ব্যর্থ।' });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {/* কোম্পানি এখানে লাগে না: খালি গাড়ি লোড হওয়ার সময় মাদার ভেসেল → লাইটার অনুযায়ী কোম্পানি নির্ধারিত হয়। */}
        <Field label="ট্রাক নম্বর *"><TruckInput value={f.truckNumber} onChange={(v) => set('truckNumber', v)} suggestions={truckSuggestions} /></Field>
        <PreviousTrip ctx={ctx} vessels={vessels} lighters={lighters} currentEmpty={f.tallyWeight} />
        <HistoricalWeightHistory truckNumber={f.truckNumber} currentWeight={f.tallyWeight} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="তারিখ"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className={inputCls} /></Field>
          <Field label="সময়"><input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} className={inputCls} /></Field>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${gps.status === 'ok' ? 'text-emerald-700' : gps.status === 'denied' || gps.status === 'unavailable' ? 'text-rose-600' : 'text-slate-500'}`}>
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {gps.busy ? 'GPS নিচ্ছে...' : gps.status === 'ok' && gps.coords ? `GPS: ${gps.coords.latitude.toFixed(5)}, ${gps.coords.longitude.toFixed(5)}${gps.locationName ? ` — ${gps.locationName}` : ''}${gps.capturedAt ? ` (${new Date(gps.capturedAt).toLocaleTimeString('bn-BD')})` : ''}` : gps.error || 'GPS অনুমতি দিলে স্থানাঙ্ক সংরক্ষিত হবে'}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="স্কেল নাম">
            <input list="sm-scale-names" value={f.scaleName} onChange={(e) => onScale(e.target.value)} className={`${inputCls} uppercase`} />
            <datalist id="sm-scale-names">{scaleNames.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="ঘাট *"><SearchSelect value={f.ghat} onChange={(v) => set('ghat', v)} options={ghatNames.map((g) => ({ value: g, label: g }))} placeholder="— ঘাট —" /></Field>
        </div>
        {mapped && f.ghat && mapped.ghatName !== f.ghat && (
          <Notice kind="warn">স্কেল {mapped.scaleName} আগে {mapped.ghatName} ঘাটে ছিল — অন্য ঘাট দিলে অ্যালার্ট তৈরি হবে (আগের রেকর্ড বদলাবে না)।</Notice>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="খালি গাড়ির ওজন / Tare Weight (KG) *"><input type="number" inputMode="decimal" value={f.tallyWeight} onChange={(e) => set('tallyWeight', e.target.value)} className={inputCls} /></Field>
          <Field label="মনিটর ওজন (KG) *"><input type="number" inputMode="decimal" value={f.monitorWeight} onChange={(e) => set('monitorWeight', e.target.value)} className={inputCls} /></Field>
        </div>
        {hasWeights && (
          <div className={`p-2.5 rounded-xl text-xs font-black ${mismatch ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            পার্থক্য: {diff} KG — {mismatch ? 'HIGH PRIORITY: ওজন অমিল (১০ KG-এর বেশি)' : 'ম্যাচড'}
          </div>
        )}
        {ocrMsg && <Notice kind={ocrMsg.kind}>{ocrMsg.text}</Notice>}
        {ocrMismatches.length > 0 && <Notice kind="warn">দুটি ছবির তুলনায় অমিল: {ocrMismatches.map((m) => m.field).join(', ')}</Notice>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PhotoField label="খালি ওজন স্লিপের ছবি (স্কেল কপি)" required value={f.tallyOriginalPhoto} onChange={(v) => { set('tallyOriginalPhoto', v); if (!v) setOcrData((p) => ({ ...p, tally: null })); }} onOcr={(uri) => runOcrEmpty(uri, 'tally')} ocrBusy={ocrBusy === 'tally'} />
          <PhotoField label="খালি ওজন মনিটরিং ছবি" required value={f.monitorPhoto} onChange={(v) => { set('monitorPhoto', v); if (!v) setOcrData((p) => ({ ...p, monitor: null })); }} onOcr={(uri) => runOcrEmpty(uri, 'monitor')} ocrBusy={ocrBusy === 'monitor'} />
        </div>
        <VideoField value={f.emptyTruckVideo} name={f.emptyTruckVideoName} onChange={(uri, name) => { setF((p) => ({ ...p, emptyTruckVideo: uri, emptyTruckVideoName: name })); setVideoWarned(false); }} onBusy={setVideoBusy} disabled={busy} />
        <Field label="মন্তব্য (ঐচ্ছিক)"><input value={f.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="প্রয়োজনে কিছু নোট করুন" className={inputCls} /></Field>
        {missing.length > 0 && <Notice kind="warn">জমা দিতে বাকি: {missing.join(', ')}</Notice>}
        <button type="submit" disabled={busy || videoBusy || missing.length > 0} className={`${primaryBtn} w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} খালি ওজন সংরক্ষণ করুন</button>
      </form>
    </Card>
  );
}