import React, { useState } from 'react';
import { downloadHistoricalSummary } from '@/components/sanmarine/history/historicalPreview';
const LABELS = { VALID: 'Importযোগ্য', DUPLICATE: 'Duplicate', INVALID: 'Invalid', REVIEW: 'Review দরকার', SKIPPED: 'বাদ' };

export default function HistoricalImportPreview({ preview }) {
  const [status, setStatus] = useState('ALL'), [page, setPage] = useState(0);
  const rows = preview.candidates.filter((c) => status === 'ALL' || c.status === status);
  return <div className="space-y-3 text-xs">
    {preview.sources.map((s) => <p key={`${s.hash}:${s.file.name}`} className="break-words"><b>{s.file.name}</b> · {s.section} · {s.rows} সারি</p>)}
    <div className="flex flex-wrap gap-2">{Object.entries(preview.counts).map(([k, v]) => <span key={k} className="rounded border border-border bg-muted px-2 py-1">{LABELS[k]}: {v}</span>)}</div>
    <p className="text-muted-foreground">কোম্পানি না থাকলে ফাঁকা থাকবে; ভেসেলের নাম থেকে অনুমান করা হবে না। Review ও Invalid Import হবে না; Duplicate অপরিবর্তিত থাকবে।</p>
    <div className="flex flex-wrap gap-3"><label>দেখুন <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="rounded border border-border bg-background p-1"><option value="ALL">সব</option>{Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><button type="button" onClick={() => downloadHistoricalSummary(preview)} className="underline">পূর্ণ Preview/Validation ডাউনলোড</button></div>
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['উৎস/সারি', 'ট্রাক', 'ওজন KG', 'তারিখ/সময়', 'ঘাট/স্কেল', 'ফল/কারণ'].map((h) => <th key={h} className="border-b border-border p-2">{h}</th>)}</tr></thead><tbody>
      {rows.slice(page * 20, page * 20 + 20).map((c, i) => <tr key={`${c.record.sourceKey}:${i}`}>
        <td className="border-b border-border p-2">{c.record.sourceFileName} / {c.record.sourceRow}</td><td className="border-b border-border p-2">{c.record.truckNumber || 'নেই'}</td><td className="border-b border-border p-2">{c.record.tareWeight ?? 'নেই'}</td><td className="border-b border-border p-2">{c.record.weighmentDate || c.record.rawDate || 'নেই'} {c.record.weighmentTime || c.record.rawTime}</td><td className="border-b border-border p-2">{c.record.ghat || 'নেই'} / {c.record.scaleName || 'নেই'}</td><td className="border-b border-border p-2">{LABELS[c.status]} {c.reason && <p>{c.reason}</p>}</td>
      </tr>)}
    </tbody></table></div>
    <div className="flex gap-3"><button type="button" disabled={!page} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">আগের</button><span>{page + 1} / {Math.max(1, Math.ceil(rows.length / 20))}</span><button type="button" disabled={(page + 1) * 20 >= rows.length} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">পরের</button></div>
  </div>;
}