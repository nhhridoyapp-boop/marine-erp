import React, { useState, useEffect } from 'react';
import { Loader2, FileText, ImageOff } from 'lucide-react';
import { fetchTripEvidence, evidenceList, missingDocuments } from '@/lib/sanmarineInvestigation';
import { Card, Notice, Empty } from './formParts';
import PhotoThumb from './PhotoThumb';

// Shows every uploaded document for one truck + date (+ time). Documents are matched
// by truck number AND date (and the closest time when available) — never by truck number
// alone — so a different trip's photos cannot appear here.
export default function TripDocuments({ truckNumber, date, time }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(''); setData(null);
    fetchTripEvidence(truckNumber, date, time)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message || 'ডকুমেন্ট আনা যায়নি।'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [truckNumber, date, time]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>;
  if (err) return <Notice kind="error">{err}</Notice>;
  if (!data) return null;

  const evidence = evidenceList(data);
  const missing = missingDocuments(data, truckNumber, date);

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">ট্রাক: {truckNumber} · তারিখ: {date}{time ? ` · সময়: ${time}` : ''}</div>
      {missing.length > 0 && (
        <Notice kind="warn">
          <div className="font-black mb-1">MISSING — নিচের ডকুমেন্টগুলো নেই:</div>
          {missing.map((m) => <div key={m.key}>· MISSING — {m.label}</div>)}
        </Notice>
      )}
      {evidence.length === 0 && missing.length === 0 && <Empty text="এই ট্রাক/তারিখের কোনো ডকুমেন্ট পাওয়া যায়নি।" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {evidence.map((e, i) => (
          <Card key={i} className="flex gap-3 items-start">
            <PhotoThumb uri={e.uri} label={e.type} size="h-20 w-20" />
            <div className="min-w-0 flex-1 text-xs space-y-0.5">
              <div className="font-black text-slate-800 flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-teal-600" />{e.type}</div>
              <div className="text-slate-500">আপলোড করেছেন: <b className="text-slate-700">{e.uploadedBy || '—'}</b></div>
              <div className="text-slate-500">তারিখ: {e.date || '—'}{e.time ? ` ${e.time}` : ''}</div>
              <div className="text-slate-500">ট্রাক: <b className="text-slate-700 font-mono">{e.truck || '—'}</b></div>
              <div className="text-slate-500">ট্রিপ: <span className="font-mono text-slate-600">{e.trip || '—'}</span></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}