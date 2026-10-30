import React, { useRef, useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PrivateVideo from '@/components/sanmarine/PrivateVideo';

export default function VideoField({ value, name = '', onChange, onBusy, disabled }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setError(''); onBusy?.(true);
    try {
      // No extension/MIME restriction or transcoding: keep 3GP, MP4 and other formats unchanged.
      const result = await base44.integrations.Core.UploadPrivateFile({ file });
      if (!result?.file_uri) throw new Error('ভিডিও আপলোড হয়নি; আবার চেষ্টা করুন।');
      onChange(result.file_uri, file.name);
    } catch (e) { setError(e.message || 'ভিডিও আপলোড ব্যর্থ।'); }
    finally { setBusy(false); onBusy?.(false); }
  };
  return <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-card-foreground">
    <div className="text-sm font-bold">খালি গাড়ির ভিডিও</div>
    <p className="text-xs text-muted-foreground">ঐচ্ছিক — 3GP, MP4 ও অন্যান্য ফরম্যাট; শুধু ম্যানুয়াল দেখা হবে, OCR নয়।</p>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{busy ? 'ভিডিও আপলোড হচ্ছে...' : 'ভিডিও আপলোড'}</button>
      {value && <button type="button" disabled={disabled || busy} onClick={() => { setError(''); onChange('', ''); }} aria-label="ভিডিও সরান" className="rounded-lg border border-border p-2 text-destructive disabled:opacity-50"><X className="h-4 w-4" /></button>}
    </div>
    <input ref={input} type="file" onChange={pick} disabled={disabled || busy} aria-label="খালি গাড়ির ভিডিও নির্বাচন" className="hidden" />
    {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
    {value && <PrivateVideo uri={value} name={name} />}
  </div>;
}