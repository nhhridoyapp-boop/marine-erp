import React, { useState, useMemo, useEffect } from 'react';
import { Loader2, Save, AlertTriangle, MapPin } from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { saveLoadingEntry } from '@/lib/sanmarineEntries';
import { logAudit } from '@/lib/sanmarineWorkflow';
import * as R from '@/lib/sanmarineRules';
import { isSameTruck, formatTruckDisplay } from '@/utils/truckUtils';
import { Field, Select, Card, Notice, inputCls, primaryBtn } from './formParts';
import SearchSelect from './SearchSelect';
import TruckInput from './TruckInput';
import PhotoField from './PhotoField';
import { extractFromLoadedSlip, compareExtractions, isOcrQuotaError, wrongSlipType } from '@/lib/sanmarineOcr';
import PreviousTrip from './PreviousTrip';
import HistoricalWeightHistory from '@/components/sanmarine/history/HistoricalWeightHistory';
import ConfirmDialog from '@/components/sanmarine/ConfirmDialog';
import useTruckContext from './useTruckContext';
import useGpsLocation from './useGpsLocation';
import { canonicalCompany } from '@/components/sanmarine/company/companyScope';

const ro = 'opacity-70 cursor-not-allowed';

export default function LoadingForm({ vessels, lighters, ghats, cargos = [], scales = [], emptyWeights, closings, currentUser, rules, initialTruck = '', truckSuggestions = [], onSaved }) {
  const blank = () => ({
    truckNumber: initialTruck, date: api.todayStr(), time: api.timeStr(), shift: 'Day', motherVesselId: '', lighterVesselId: '', cargoName: '', ghatName: '', scaleName: '',
    tare: '', weightIn: '', tareDate: '', tareTime: '', gross: '', secondWeight: '', secondWeightDate: api.todayStr(), secondWeightTime: api.timeStr(), bags: '',
    scalePhoto: '', monitorPhoto: '', remarks: '',
  });
  const [f, setF] = useState(blank);
  const [mappings, setMappings] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(null);
  const [ocrData, setOcrData] = useState({ scale: null, monitor: null });
  const [ocrMsg, setOcrMsg] = useState(null);
  const [confirmCrossSlip, setConfirmCrossSlip] = useState(false);
  const ctx = useTruckContext(f.truckNumber);
  const gps = useGpsLocation();
  useEffect(() => { gps.capture(); }, []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const runOcrLoaded = async (uri, field) => {
    if (!uri) return;
    setOcrBusy(field); setOcrMsg(null);
    try {
      const data = await extractFromLoadedSlip(uri, field === 'monitor');
      setOcrData((p) => ({ ...p, [field]: data }));
      setF((p) => {
        const next = { ...p };
        if (data.truckNumber) next.truckNumber = data.truckNumber;
        if (data.date) { next.date = data.date; if (field === 'scale') next.secondWeightDate = data.date; }
        if (data.time) { next.time = data.time; if (field === 'scale') next.secondWeightTime = data.time; }
        if (data.scaleName) next.scaleName = data.scaleName;
        if (field === 'scale') {
          if (data.weightIn != null) next.weightIn = String(data.weightIn);
          if (data.weightIn != null && !match) next.tare = String(data.weightIn);
          if (data.weightOut != null) { next.gross = String(data.weightOut); next.secondWeight = String(data.weightOut); }
          if (data.bags != null) next.bags = String(data.bags);
        } else {
          if (data.weightOut != null) next.secondWeight = String(data.weightOut);
        }
        return next;
      });
      const labels = field === 'scale'
        ? [['ট্রাক নম্বর', data.truckNumber], ['তারিখ', data.date], ['সময়', data.time], ['Weight In', data.weightIn], ['গ্রস', data.weightOut], ['নেট', data.netWeight], ['স্কেল', data.scaleName], ['ব্যাগ', data.bags]]
        : [['ট্রাক নম্বর', data.truckNumber], ['তারিখ', data.date], ['সময়', data.time], ['ওজন', data.weightOut], ['স্কেল', data.scaleName]];
      const found = [], missing = [];
      labels.forEach(([label, val]) => (val != null && val !== '' ? found : missing).push(label));
      const typeWarn = wrongSlipType(data, 'loaded') ? ' ⚠ এটি খালি ওজন স্লিপ বলে মনে হচ্ছে — লোডেড স্লিপ আপলোড করুন।' : '';
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

  // Latest unlinked empty-weight record of the same truck (normalised match).
  const match = useMemo(() => {
    if (f.truckNumber.trim().length < 3) return null;
    const company = canonicalCompany(vessels.find((v) => v.id === f.motherVesselId)?.company);
    if (!company) return null;
    // An unassigned (company-less) empty weight can be claimed by whichever company's lighter loads it.
    return emptyWeights
      .filter((e) => !e.loadingEntryId && (!e.company || canonicalCompany(e.company) === company) && isSameTruck(e.truckNumber, f.truckNumber))
      .sort((a, b) => `${b.emptyWeightDate}${b.emptyWeightTime}`.localeCompare(`${a.emptyWeightDate}${a.emptyWeightTime}`))[0] || null;
  }, [emptyWeights, f.truckNumber, f.motherVesselId, vessels]);

  // Tally weight / date / time come from the matched first weighing.
  useEffect(() => {
    if (!match) {
      setF((p) => (p.fromMatch ? { ...p, tare: '', tareDate: '', tareTime: '', fromMatch: false } : p));
      return;
    }
    setF((p) => ({ ...p, fromMatch: true, tare: String(match.tallyWeight), tareDate: match.emptyWeightDate, tareTime: match.emptyWeightTime, ghatName: p.ghatName || match.ghat || '', scaleName: p.scaleName || match.scaleName || '' }));
  }, [match?.id]);

  const vessel = vessels.find((v) => v.id === f.motherVesselId);
  const lighter = lighters.find((l) => l.id === f.lighterVesselId);
  const locked = !!f.lighterVesselId && closings.some((c) => c.lighterVesselId === f.lighterVesselId && c.status === 'LOCKED');
  const net = (Number(f.gross) || 0) - (Number(f.tare) || 0);
  const vesselLighters = lighters.filter((l) => l.motherVesselId === f.motherVesselId && l.status !== 'Completed');
  const mapped = mappings.find((x) => x.scaleName === f.scaleName.toUpperCase().trim());
  const cargoNames = [...new Set(cargos.map((c) => c.name))];
  const scaleNames = [...new Set([...scales.map((s) => s.name.toUpperCase()), ...mappings.map((m) => m.scaleName)])];

  const onScale = (v) => setF((p) => {
    const m = mappings.find((x) => x.scaleName === v.toUpperCase().trim());
    return { ...p, scaleName: v, ghatName: p.ghatName || m?.ghatName || '' };
  });
  const onVessel = (v) => setF((p) => p.motherVesselId === v ? p : ({ ...p, motherVesselId: v, lighterVesselId: '', cargoName: vessels.find((x) => x.id === v)?.cargoType || '' }));

  const alertsPreview = useMemo(() => {
    const prev = ctx?.lastLoad && R.toMs(ctx.lastLoad.date, ctx.lastLoad.time) <= R.toMs(f.date, f.time) ? ctx.lastLoad : null;
    return [
      ...R.loadWeightFlags({ gross: f.gross, secondWeight: f.secondWeight }),
      ...(f.truckNumber.trim().length >= 3 ? R.matchFlags({ date: f.date, time: f.time, ghat: f.ghatName, tare: f.tare, weightIn: f.weightIn }, match, rules) : []),
      ...R.tripGapFlags({ date: f.date, time: f.time }, prev, rules),
    ];
  }, [f.gross, f.secondWeight, f.date, f.time, f.ghatName, f.truckNumber, match, ctx, rules]);

  const ocrMismatches = ocrData.scale && ocrData.monitor ? compareExtractions(ocrData.scale, ocrData.monitor) : [];
  const crossSlipMismatch = !!match && (Number(f.weightIn) > 0 || Number(f.tare) > 0) && (Number(match.tallyWeight) > 0 || Number(match.monitorWeight) > 0) &&
    Math.abs((Number(f.weightIn) || Number(f.tare) || 0) - (Number(match.tallyWeight) || Number(match.monitorWeight) || 0)) > R.WEIGHT_TOLERANCE_KG;
  const missing = [
    !f.truckNumber.trim() && 'ট্রাক নম্বর', !f.date && 'লোড তারিখ', !f.time && 'লোড সময়', !vessel && 'মাদার ভেসেল', !lighter && 'লাইটার', !f.ghatName && 'ঘাট', !(Number(f.tare) > 0) && 'খালি গাড়ির ওজন',
    !(Number(f.gross) > 0) && 'গ্রস ওজন', !(Number(f.secondWeight) > 0) && 'সেকেন্ড ওয়েট', !(Number(f.bags) > 0) && 'ব্যাগ সংখ্যা',
    !f.scalePhoto && 'সেকেন্ড ওয়েট স্কেল কপি', !f.monitorPhoto && 'সেকেন্ড ওয়েট মনিটর ছবি',
  ].filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (net <= 0) return setMsg({ kind: 'error', text: 'নেট ওজন শূন্যের বেশি হতে হবে (গ্রস > টেয়ার)।' });
    // The browser's own confirm() never opens inside the Android app (it returns undefined) and silently
    // cancelled the submission, so a cross-slip mismatch truck never even reached the server; the app's own
    // dialog is used instead.
    if (crossSlipMismatch && !confirmCrossSlip) return setConfirmCrossSlip(true);
    await save();
  };

  const save = async () => {
    setConfirmCrossSlip(false);
    setBusy(true);
    try {
      // Re-acquire the freshest GPS fix at save time (no extra prompt if we have a recent fix).
      const fix = await gps.recapture();
      const ghat = ghats.find((g) => g.name.toUpperCase() === f.ghatName);
      const saved = await saveLoadingEntry({
        ...f, truckNumber: formatTruckDisplay(f.truckNumber), motherVesselId: vessel?.id, lighterVesselId: lighter?.id,
        consigneeId: lighter?.consigneeId || '', consigneeName: lighter?.consigneeName || '', company: vessel?.company || '', ghatId: ghat?.id || '', cargoType: vessel?.cargoType || '',
        cargoName: f.cargoName || vessel?.cargoType || '', emptyWeightId: match?.id || '', weightOut: f.weightOut || f.gross,
        latitude: fix?.latitude ?? gps.coords?.latitude, longitude: fix?.longitude ?? gps.coords?.longitude,
        locationName: fix?.locationName ?? gps.locationName, gpsCapturedAt: (fix?.capturedAt ?? gps.capturedAt) ? new Date(fix?.capturedAt ?? gps.capturedAt).toISOString() : '',
      }, currentUser, rules);
      // Gross-vs-monitor difference over the tolerance: nothing is saved yet — an admin decision creates the entry.
      if (saved.pendingApproval) {
        await logAudit(currentUser, 'WEIGHT_MISMATCH_APPROVAL_REQUESTED', 'TruckEntry', saved.approval.id, `${formatTruckDisplay(f.truckNumber)} — গ্রস ${f.gross} KG, মনিটর ওয়েট ${f.secondWeight} KG`);
        setMsg({ kind: 'warn', text: '⚠ গ্রস ও মনিটর ওয়েটে গড়মিল বেশি — এন্ট্রি এখনো সংরক্ষিত হয়নি। অনুমোদন কেন্দ্রে অ্যাডমিনের কাছে পাঠানো হয়েছে; অ্যাডমিন অনুমোদন দিলেই এন্ট্রি তৈরি হবে।' });
        setF((p) => ({ ...blank(), motherVesselId: p.motherVesselId, lighterVesselId: p.lighterVesselId, cargoName: p.cargoName, ghatName: p.ghatName, scaleName: p.scaleName, shift: p.shift }));
        setOcrData({ scale: null, monitor: null });
        await onSaved();
        return;
      }
      const entry = saved;
      await logAudit(currentUser, 'LOADING_ENTRY_CREATED', 'TruckEntry', entry.id, `${entry.truckNumber} · নেট ${entry.net} KG · ${entry.serial}`);
      const alerts = entry.generatedAlerts || [];
      setMsg(alerts.length
        ? { kind: 'warn', text: `সংরক্ষিত (সিরিয়াল ${entry.serial}, নেট ${entry.net} KG), তবে ${alerts.length}টি অ্যালার্ট তৈরি হয়েছে: ${alerts.map((a) => a.title).join(' | ')}` }
        : { kind: 'success', text: `✓ ${entry.truckNumber} — সিরিয়াল ${entry.serial}, নেট ${entry.net} KG সংরক্ষিত হয়েছে।` });
      setF((p) => ({ ...blank(), motherVesselId: p.motherVesselId, lighterVesselId: p.lighterVesselId, cargoName: p.cargoName, ghatName: p.ghatName, scaleName: p.scaleName, shift: p.shift }));
      setOcrData({ scale: null, monitor: null }); // a stale reading must never be compared with the next truck's photo
      await onSaved();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message || 'সংরক্ষণ ব্যর্থ।' });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="grid grid-cols-3 gap-3">
          <Field label="ট্রাক নম্বর *" className="col-span-2"><TruckInput value={f.truckNumber} onChange={(v) => set('truckNumber', v)} suggestions={truckSuggestions} /></Field>
          <Field label="অটো সিরিয়াল"><input value="লাইটার অনুযায়ী অটো" readOnly className={`${inputCls} ${ro}`} /></Field>
        </div>
        {f.truckNumber.trim().length >= 3 && (match
          ? <Notice kind="success">খালি ওজন পাওয়া গেছে: {match.emptyWeightDate} {match.emptyWeightTime} — খালি গাড়ির ওজন {match.tallyWeight} KG (tare হিসেবে বসানো হয়েছে)</Notice>
          : <Notice kind="warn">এই ট্রাকের অলিঙ্কড খালি ওজন পাওয়া যায়নি — সংরক্ষণ করলে পেন্ডিং ও অ্যালার্ট তৈরি হবে; খালি গাড়ির ওজন হাতে লিখুন।</Notice>)}
        <PreviousTrip ctx={ctx} vessels={vessels} lighters={lighters} />
        <HistoricalWeightHistory truckNumber={f.truckNumber} currentWeight={f.tare} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="লোড তারিখ"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className={inputCls} /></Field>
          <Field label="লোড সময়"><input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} className={inputCls} /></Field>
          <Field label="শিফট"><Select value={f.shift} onChange={(v) => set('shift', v || 'Day')} options={[{ value: 'Day', label: 'Day' }, { value: 'Night', label: 'Night' }]} placeholder="Day" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="মাদার ভেসেল *"><SearchSelect value={f.motherVesselId} onChange={onVessel} options={vessels.filter((v) => v.status !== 'Completed').map((v) => ({ value: v.id, label: v.name }))} /></Field>
          <Field label="লাইটার *"><SearchSelect value={f.lighterVesselId} onChange={(v) => set('lighterVesselId', v)} disabled={!f.motherVesselId} options={vesselLighters.map((l) => ({ value: l.id, label: l.name }))} placeholder="— লাইটার —" /></Field>
        </div>
        {locked && <Notice kind="error">এই লাইটারের ক্লোজিং সম্পন্ন (LOCKED) — নতুন এন্ট্রি দেওয়া যাবে না।</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="কোম্পানি (ভেসেল থেকে)"><input value={vessel?.company || '—'} readOnly className={`${inputCls} ${ro}`} /></Field>
          <Field label="আমদানিকারক (কনসাইনি)"><input value={lighter?.consigneeName || '—'} readOnly className={`${inputCls} ${ro}`} /></Field>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${gps.status === 'ok' ? 'text-emerald-700' : gps.status === 'denied' || gps.status === 'unavailable' ? 'text-rose-600' : 'text-slate-500'}`}>
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {gps.busy ? 'GPS নিচ্ছে...' : gps.status === 'ok' && gps.coords ? `GPS: ${gps.coords.latitude.toFixed(5)}, ${gps.coords.longitude.toFixed(5)}${gps.locationName ? ` — ${gps.locationName}` : ''}${gps.capturedAt ? ` (${new Date(gps.capturedAt).toLocaleTimeString('bn-BD')})` : ''}` : gps.error || 'GPS অনুমতি দিলে স্থানাঙ্ক সংরক্ষিত হবে'}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="কার্গো">
            <input list="sm-cargo-names" value={f.cargoName} onChange={(e) => set('cargoName', e.target.value)} className={inputCls} />
            <datalist id="sm-cargo-names">{cargoNames.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ঘাট *"><SearchSelect value={f.ghatName} onChange={(v) => set('ghatName', v)} options={ghats.map((g) => ({ value: g.name.toUpperCase(), label: g.name.toUpperCase() }))} placeholder="— ঘাট —" /></Field>
          <Field label="স্কেল নাম">
            <input list="sm-scale-names-l" value={f.scaleName} onChange={(e) => onScale(e.target.value)} className={`${inputCls} uppercase`} />
            <datalist id="sm-scale-names-l">{scaleNames.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
        </div>
        {mapped && f.ghatName && mapped.ghatName !== f.ghatName && (
          <Notice kind="warn">স্কেল {mapped.scaleName} আগে {mapped.ghatName} ঘাটে ছিল — সংরক্ষণ করলে অ্যালার্ট তৈরি হবে।</Notice>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="লোড স্লিপের Weight In (KG)"><input type="number" inputMode="decimal" value={f.weightIn} onChange={(e) => set('weightIn', e.target.value)} placeholder="স্কেল স্লিপ থেকে" className={inputCls} /></Field>
          <Field label="খালি গাড়ির ওজন / Tare Weight (KG) *"><input type="number" inputMode="decimal" value={f.tare} readOnly={!!match} onChange={(e) => set('tare', e.target.value)} className={`${inputCls} ${match ? ro : ''}`} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="খালি ওজন তারিখ"><input type="date" value={f.tareDate} readOnly={!!match} onChange={(e) => set('tareDate', e.target.value)} className={`${inputCls} ${match ? ro : ''}`} /></Field>
          <Field label="খালি ওজন সময়"><input type="time" value={f.tareTime} readOnly={!!match} onChange={(e) => set('tareTime', e.target.value)} className={`${inputCls} ${match ? ro : ''}`} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="গ্রস ওজন (KG) *"><input type="number" inputMode="decimal" value={f.gross} onChange={(e) => set('gross', e.target.value)} className={inputCls} /></Field>
          <Field label="ব্যাগ সংখ্যা *" hint={!(Number(f.bags) > 0) ? 'ব্যাগ সংখ্যা আবশ্যক — স্কেল কপি থেকে OCR করুন অথবা হাতে লিখুন' : undefined}><input type="number" inputMode="numeric" value={f.bags} onChange={(e) => set('bags', e.target.value)} className={`${inputCls} ${!(Number(f.bags) > 0) ? 'border-rose-400 bg-rose-50' : ''}`} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="মনিটর ওয়েট (KG) *"><input type="number" inputMode="decimal" value={f.secondWeight} onChange={(e) => set('secondWeight', e.target.value)} className={inputCls} /></Field>
          <Field label="সেকেন্ড ওয়েট তারিখ"><input type="date" value={f.secondWeightDate} onChange={(e) => set('secondWeightDate', e.target.value)} className={inputCls} /></Field>
          <Field label="সেকেন্ড ওয়েট সময়"><input type="time" value={f.secondWeightTime} onChange={(e) => set('secondWeightTime', e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-sm font-black text-teal-800">নেট ওজন (গ্রস − খালি গাড়ির ওজন): {net > 0 ? net.toLocaleString('en-IN') : 0} KG ({(Math.max(net, 0) / 1000).toFixed(3)} MT)</div>
        {ocrMsg && <Notice kind={ocrMsg.kind}>{ocrMsg.text}</Notice>}
        {ocrMismatches.length > 0 && <Notice kind="warn">দুটি ছবির তুলনায় অমিল: {ocrMismatches.map((m) => m.field).join(', ')}</Notice>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PhotoField label="সেকেন্ড ওয়েট স্কেল কপি" required value={f.scalePhoto} onChange={(v) => { set('scalePhoto', v); if (!v) setOcrData((p) => ({ ...p, scale: null })); }} onOcr={(uri) => runOcrLoaded(uri, 'scale')} ocrBusy={ocrBusy === 'scale'} />
          <PhotoField label="সেকেন্ড ওয়েট মনিটর ছবি" required value={f.monitorPhoto} onChange={(v) => { set('monitorPhoto', v); if (!v) setOcrData((p) => ({ ...p, monitor: null })); }} onOcr={(uri) => runOcrLoaded(uri, 'monitor')} ocrBusy={ocrBusy === 'monitor'} />
        </div>
        {crossSlipMismatch && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-black flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div>⚠️ ক্রস-স্লিপ ওজন অমিল (HIGH PRIORITY)</div>
              <div className="font-semibold mt-0.5">লোড স্লিপের Weight In {f.weightIn || f.tare} KG · খালি স্লিপের ওজন {match?.tallyWeight || match?.monitorWeight} KG — পার্থক্য {Math.abs((Number(f.weightIn) || Number(f.tare) || 0) - (Number(match?.tallyWeight) || Number(match?.monitorWeight) || 0))} KG</div>
              <div className="font-medium mt-0.5">সংরক্ষণ করলে একটি critical অ্যালার্ট তৈরি হবে। নিশ্চিত হলেই জমা দিন।</div>
            </div>
          </div>
        )}
        <Field label="মন্তব্য"><input value={f.remarks} onChange={(e) => set('remarks', e.target.value)} className={inputCls} /></Field>
        {alertsPreview.length > 0 && (
          <Notice kind="warn">
            <div className="font-black mb-0.5">সংরক্ষণ করলে এই অ্যালার্টগুলো তৈরি হবে:</div>
            {alertsPreview.map((a, i) => <div key={i}>• {R.FLAG_META[a.code].label}: {a.detail}</div>)}
          </Notice>
        )}
        {missing.length > 0 && <Notice kind="warn">জমা দিতে বাকি: {missing.join(', ')}</Notice>}
        <button type="submit" disabled={busy || locked || missing.length > 0} className={`${primaryBtn} w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} লোড এন্ট্রি সংরক্ষণ করুন</button>
      </form>
      <ConfirmDialog
        open={confirmCrossSlip}
        title="ক্রস-স্লিপ ওজন অমিল"
        message={`লোড স্লিপের Weight In: ${f.weightIn || f.tare} KG\nখালি স্লিপের ওজন: ${match?.tallyWeight || match?.monitorWeight} KG\nপার্থক্য: ${Math.abs((Number(f.weightIn) || Number(f.tare) || 0) - (Number(match?.tallyWeight) || Number(match?.monitorWeight) || 0))} KG\n\nতবু সংরক্ষণ করতে চান?`}
        confirmLabel="সংরক্ষণ করুন"
        onConfirm={save}
        onClose={() => setConfirmCrossSlip(false)}
      />
    </Card>
  );
}