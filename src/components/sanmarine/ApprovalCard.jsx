import React from 'react';
import { CheckCircle2, XCircle, Scale, UserPlus, Pencil, Trash2, RotateCcw, Database } from 'lucide-react';
import { Card } from './formParts';
import ApprovalDetail from './ApprovalDetail';

// Headline first, specifics after: the admin must know from the first line WHAT is being approved,
// without reading the whole card.
const KIND = {
  WEIGHT_MISMATCH: { label: 'ওজন গড়মিল অনুমোদন', headline: 'ওজন গড়মিল — এই ওজন অনুমোদন ছাড়া এন্ট্রি হিসেবে জমা হয়নি', icon: Scale, tone: 'bg-rose-100 text-rose-700' },
  RECORD_EDIT: { label: 'রেকর্ড সম্পাদনা', headline: 'রেকর্ড সম্পাদনার অনুমোদন প্রয়োজন', icon: Pencil, tone: 'bg-amber-100 text-amber-800' },
  RECORD_DELETE: { label: 'রেকর্ড ডিলিট', headline: 'রেকর্ড মুছে ফেলার অনুমোদন প্রয়োজন', icon: Trash2, tone: 'bg-rose-100 text-rose-700' },
  VESSEL_REOPEN: { label: 'ভেসেল পুনরায় খোলা', headline: 'ভেসেল পুনরায় খোলার অনুমোদন প্রয়োজন', icon: RotateCcw, tone: 'bg-sky-100 text-sky-700' },
  LIGHTER_REOPEN: { label: 'লাইটার পুনরায় খোলা', headline: 'লাইটার পুনরায় খোলার অনুমোদন প্রয়োজন', icon: RotateCcw, tone: 'bg-sky-100 text-sky-700' },
  MASTER_DATA_CHANGE: { label: 'মাস্টার ডাটা পরিবর্তন', headline: 'মাস্টার ডাটা পরিবর্তনের অনুমোদন প্রয়োজন', icon: Database, tone: 'bg-violet-100 text-violet-700' },
  USER_REGISTRATION: { label: 'নতুন ইউজার', headline: 'নতুন ইউজারের অনুমোদন প্রয়োজন', icon: UserPlus, tone: 'bg-emerald-100 text-emerald-700' },
  USER_INVITATION: { label: 'ইউজার আমন্ত্রণ', headline: 'ইউজার আমন্ত্রণের অনুমোদন প্রয়োজন', icon: UserPlus, tone: 'bg-emerald-100 text-emerald-700' },
};
const FALLBACK = { label: 'অনুমোদন', headline: 'অনুমোদন প্রয়োজন', icon: CheckCircle2, tone: 'bg-slate-100 text-slate-700' };

const payloadOf = (a) => { try { return JSON.parse(a.payload || '{}') || {}; } catch (e) { return {}; } };

// The two weights behind a held weighing, read straight from the submitted form (slip vs monitor).
function mismatch(a) {
  const f = payloadOf(a).form || {};
  const isLoad = payloadOf(a).kind === 'loading';
  const left = Number(isLoad ? f.gross : f.tallyWeight);
  const right = Number(isLoad ? f.secondWeight : f.monitorWeight);
  if (!left || !right) return null;
  return { leftLabel: isLoad ? 'স্কেল গ্রস' : 'স্লিপ', rightLabel: isLoad ? 'মনিটর ওয়েট' : 'মনিটর ছবি', left, right, kg: Math.abs(right - left) };
}

export default function ApprovalCard({ a, canDecide, busy, onDecide }) {
  const kind = KIND[a.type] || FALLBACK;
  const Icon = kind.icon;
  const mm = a.type === 'WEIGHT_MISMATCH' ? mismatch(a) : null;
  const fields = a.type === 'RECORD_EDIT' ? Object.keys(payloadOf(a).patch || {}).length : 0;
  return (
    <Card className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${kind.tone}`}><Icon className="h-3 w-3" />{kind.label}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.status === 'pending' ? 'bg-amber-100 text-amber-800' : a.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {a.status === 'pending' ? 'সিদ্ধান্ত বাকি' : a.status === 'approved' ? 'অনুমোদিত' : 'বাতিল'}
        </span>
        {mm && <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 text-[11px] font-black">পার্থক্য {mm.kg} KG</span>}
        {fields > 0 && <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-black">{fields}টি ফিল্ড বদলাবে</span>}
      </div>

      <div className="font-black text-[15px] text-slate-900 leading-snug">{kind.headline}</div>
      <div className="text-sm font-black text-slate-800">{a.targetDescription}</div>
      {a.details && <div className="text-[11px] font-semibold text-rose-600">{a.details}</div>}
      {mm && (
        <div className="text-[11px] font-bold text-slate-700">
          তুলনা: <span className="font-mono text-slate-500">{mm.leftLabel} {mm.left} KG</span> ↔ <span className="font-mono text-rose-700">{mm.rightLabel} {mm.right} KG</span>
        </div>
      )}
      <div className="text-[11px] text-slate-500">
        অনুরোধকারী: {a.requestedByName} ({a.requestedRole}){a.requestedAt ? ` · ${new Date(a.requestedAt).toLocaleString('en-GB')}` : ''}
      </div>

      <ApprovalDetail a={a} />

      {a.status !== 'pending' && (
        <div className="text-[11px] font-bold text-slate-500">{a.status === 'approved' ? 'অনুমোদিত' : 'বাতিল'} — {a.reviewedByName}{a.reviewedAt ? ` · ${new Date(a.reviewedAt).toLocaleString('en-GB')}` : ''}</div>
      )}
      {a.status === 'pending' && canDecide && (
        <div className="flex gap-2 pt-1">
          <button disabled={busy} onClick={() => onDecide('approved')} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> অনুমোদন</button>
          <button disabled={busy} onClick={() => onDecide('rejected')} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-100 text-rose-700 text-xs font-bold disabled:opacity-50"><XCircle className="h-4 w-4" /> বাতিল</button>
        </div>
      )}
      {a.status === 'pending' && !canDecide && (
        <div className="text-[10px] font-bold text-slate-400">{a.type === 'WEIGHT_MISMATCH' ? 'সিদ্ধান্ত দিতে Admin অনুমতি দরকার।' : 'সিদ্ধান্ত দিতে Super Admin অনুমতি দরকার।'}</div>
      )}
    </Card>
  );
}