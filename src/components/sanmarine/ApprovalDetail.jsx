import React from 'react';
import { Image } from '@/components/ui/image';
import { MONITOR_TOLERANCE_KG } from '@/lib/sanmarineRules';

const parseJson = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const show = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));

const Item = ({ label, value, strong }) => (
  <div className="min-w-0">
    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
    <div className={`text-[11px] truncate ${strong ? 'font-black text-slate-800' : 'font-semibold text-slate-700'}`}>{show(value)}</div>
  </div>
);

function Photo({ label, url }) {
  if (!url) return <Item label={label} value="ছবি নেই" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400 mb-1">{label}</div>
      <Image src={url} alt={label} className="h-20 w-full rounded-lg border border-slate-200" fittingType="fill" />
    </a>
  );
}

// The problem behind a pending request, in full — the admin decides on the numbers and the photos, not on a field name.
export default function ApprovalDetail({ a }) {
  const payload = parseJson(a.payload);
  if (!payload) return null;

  if (a.type === 'WEIGHT_MISMATCH' && payload.form) {
    const f = payload.form;
    const loading = payload.kind === 'loading';
    const slip = num(loading ? f.gross : f.tallyWeight);
    const monitor = num(loading ? f.secondWeight : f.monitorWeight);
    const diff = monitor - slip;
    return (
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 p-2">
        <div className="text-[10px] font-black text-amber-800 mb-1.5">
          {loading ? 'গ্রস ওজন বনাম মনিটর ওয়েট' : 'খালি স্লিপ বনাম মনিটর'} — পার্থক্য {Math.abs(diff)} KG (সীমা {MONITOR_TOLERANCE_KG} KG)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Item label="ট্রাক" value={f.truckNumber} strong />
          <Item label="তারিখ" value={loading ? f.date : f.emptyWeightDate} />
          <Item label="সময়" value={loading ? f.time : f.emptyWeightTime} />
          <Item label="ঘাট" value={f.ghatName || f.ghat} />
          <Item label="স্কেল" value={f.scaleName} />
          <Item label={loading ? 'গ্রস (KG)' : 'স্লিপ ওজন (KG)'} value={slip || '—'} strong />
          <Item label={loading ? 'মনিটর ওয়েট (KG)' : 'মনিটর ওজন (KG)'} value={monitor || '—'} strong />
          {loading ? <Item label="টেয়ার / নেট (KG)" value={`${num(f.tare)} / ${num(f.gross) - num(f.tare)}`} /> : <Item label="ব্যাগ" value={f.bags} />}
          <Item label="জমা দিয়েছেন" value={`${payload.submitter?.name || a.requestedByName} (${payload.submitter?.role || a.requestedRole})`} />
          {f.remarks ? <Item label="মন্তব্য" value={f.remarks} /> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Photo label={loading ? 'সেকেন্ড ওয়েট স্কেল কপি' : 'খালি ওজন স্লিপ ছবি'} url={loading ? f.scalePhoto : f.tallyOriginalPhoto} />
          <Photo label="মনিটর ছবি" url={f.monitorPhoto} />
        </div>
      </div>
    );
  }

  if (a.type === 'RECORD_EDIT' && payload.patch) {
    const rows = Object.entries(payload.patch);
    if (!rows.length) return null;
    const before = payload.before || {};
    const labels = payload.labels || {};
    const hasBefore = Object.keys(before).length > 0;
    return (
      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <div className="text-[10px] font-black text-slate-600 mb-1.5">
          কী পরিবর্তন হবে — {rows.length}টি ফিল্ড{hasBefore ? ' (আগের মান → নতুন মান)' : ''}
        </div>
        <div className="space-y-0.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="font-bold text-slate-700">{labels[k] || k}:</span>
              {hasBefore ? <span className="text-slate-400 line-through">{show(before[k])}</span> : null}
              <span className="font-black text-emerald-700">{hasBefore ? '→ ' : 'নতুন মান: '}{show(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}