import React, { useState, useEffect } from 'react';
import { X, Loader2, FileSpreadsheet, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { recordProblems, FLAG_META } from '@/lib/sanmarineRules';
import { Card, Notice, inputCls, ghostBtn } from './formParts';
import PhotoThumb from './PhotoThumb';
import TripDocuments from './TripDocuments';
import PrivateVideo from '@/components/sanmarine/PrivateVideo';

const SEV_CHIP = { critical: 'bg-rose-600 text-white', high: 'bg-rose-100 text-rose-700', warning: 'bg-amber-100 text-amber-800', medium: 'bg-amber-100 text-amber-800' };

function Field({ label, value, mono }) {
  return <div><span className="text-slate-400 text-[10px]">{label}:</span> <b className={mono ? 'font-mono text-slate-800' : 'text-slate-800'}>{value || '—'}</b></div>;
}

// Full details of one entry (loading or empty weight) + its related documents.
export default function EntryDetail({ kind, item, vessels, lighters, onClose }) {
  const [linked, setLinked] = useState(null);
  const [loading, setLoading] = useState(false);
  const isLoading = kind === 'loading';
  const lighter = isLoading ? lighters.find((l) => l.id === item.lighterVesselId) : null;
  const vessel = isLoading ? vessels.find((v) => v.id === item.motherVesselId) : null;
  const date = isLoading ? item.date : item.emptyWeightDate;
  const time = isLoading ? item.time : item.emptyWeightTime;
  const problems = recordProblems(kind, item);
  const emptyRecord = isLoading ? linked : item;

  useEffect(() => {
    let cancelled = false;
    setLinked(null);
    if (isLoading && item.emptyWeightId) {
      setLoading(true);
      base44.entities.EmptyWeight.get(item.emptyWeightId).then((e) => { if (!cancelled) setLinked(e); }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    } else if (!isLoading && item.loadingEntryId) {
      setLoading(true);
      base44.entities.TruckEntry.get(item.loadingEntryId).then((l) => { if (!cancelled) setLinked(l); }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [item.id, kind]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-50 w-full sm:max-w-lg max-h-[94vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-teal-600" /><h2 className="text-sm font-black text-slate-800">এন্ট্রি বিস্তারিত</h2></div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <Card className="space-y-1.5">
            <div className="text-base font-black font-mono text-slate-800">{item.truckNumber}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <Field label="ঘাট" value={isLoading ? item.ghatName : item.ghat} />
              <Field label="লাইটার" value={lighter?.name} />
              <Field label="মাদার ভেসেল" value={vessel?.name} />
              <Field label="তারিখ" value={date} />
              <Field label="সময়" value={time} />
              {isLoading && <Field label="শিফট" value={item.shift} />}
              <Field label="খালি/টেয়ার ওজন" value={`${isLoading ? item.tare : item.tallyWeight} KG`} />
              {isLoading && <Field label="গ্রস ওজন" value={`${item.gross} KG`} />}
              {isLoading && <Field label="নেট ওজন" value={`${item.net} KG`} />}
              {isLoading && <Field label="ব্যাগ" value={item.bags || 0} />}
              {!isLoading && <Field label="মনিটর ওজন" value={`${item.monitorWeight} KG`} />}
              {!isLoading && <Field label="পার্থক্য" value={`${item.difference} KG`} />}
              <Field label="এন্ট্রি করেছেন" value={isLoading ? item.enteredBy : item.enteredByName} />
              <Field label="স্কেল" value={item.scaleName} />
              <Field label="এন্ট্রি স্ট্যাটাস" value={isLoading ? (item.emptyWeightMatched ? 'খালি ওজন ম্যাচড' : 'খালি ওজন বাকি') : (item.loadingEntryId ? 'লোড হয়েছে' : 'লোড বাকি')} />
            </div>
            {item.remarks && (
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-400 text-[10px]">মন্তব্য:</span> <b className="text-slate-800">{item.remarks}</b>
              </div>
            )}
            {(item.latitude || item.locationName) && (
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-start gap-1.5 text-[11px] text-slate-600">
                <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <b className="text-slate-800">{item.locationName || 'ঠিকানা পাওয়া যায়নি'}</b>
                  {item.latitude != null && item.longitude != null && <div className="font-mono text-[10px] text-slate-500">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</div>}
                  {item.gpsCapturedAt && <div className="text-[10px] text-slate-400">ক্যাপচার: {new Date(item.gpsCapturedAt).toLocaleString('bn-BD')}</div>}
                </div>
              </div>
            )}
          </Card>

          {problems.length > 0 && (
            <Card>
              <div className="text-xs font-black text-slate-700 mb-1">সমস্যা / ফ্ল্যাগ</div>
              <div className="flex flex-wrap gap-1">
                {problems.map((p) => (
                  <span key={p.code} title={p.detail} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SEV_CHIP[FLAG_META[p.code]?.severity] || 'bg-slate-100 text-slate-600'}`}>{FLAG_META[p.code]?.label || p.code}</span>
                ))}
              </div>
            </Card>
          )}

          {linked && (
            <Card className="space-y-1">
              <div className="text-xs font-black text-slate-700">{isLoading ? 'সংযুক্ত খালি ওজন' : 'সংযুক্ত লোড এন্ট্রি'}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                {isLoading ? (
                  <>
                    <Field label="তারিখ" value={linked.emptyWeightDate} />
                    <Field label="সময়" value={linked.emptyWeightTime} />
                    <Field label="ঘাট" value={linked.ghat} />
                    <Field label="স্লিপ ওজন" value={`${linked.tallyWeight} KG`} />
                    <Field label="মনিটর ওজন" value={`${linked.monitorWeight} KG`} />
                  </>
                ) : (
                  <>
                    <Field label="তারিখ" value={linked.date} />
                    <Field label="সময়" value={linked.time} />
                    <Field label="ঘাট" value={linked.ghatName} />
                    <Field label="গ্রস" value={`${linked.gross} KG`} />
                    <Field label="নেট" value={`${linked.net} KG`} />
                    <Field label="ব্যাগ" value={linked.bags || 0} />
                  </>
                )}
              </div>
            </Card>
          )}

          {emptyRecord?.emptyTruckVideo && <Card className="space-y-2">
            <div className="text-sm font-bold text-foreground">খালি গাড়ির ভিডিও — ম্যানুয়াল যাচাই</div>
            <PrivateVideo uri={emptyRecord.emptyTruckVideo} name={emptyRecord.emptyTruckVideoName} />
          </Card>}
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">সংশ্লিষ্ট ডকুমেন্ট</div>
            <TripDocuments truckNumber={item.truckNumber} date={date} time={time} />
          </div>
        </div>
      </div>
    </div>
  );
}