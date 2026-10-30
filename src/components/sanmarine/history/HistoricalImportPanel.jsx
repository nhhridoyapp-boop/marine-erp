import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { buildHistoricalPreview } from '@/components/sanmarine/history/historicalPreview';
import historicalImport from '@/components/sanmarine/history/historicalImport';
import HistoricalImportPreview from '@/components/sanmarine/history/HistoricalImportPreview';

export default function HistoricalImportPanel({ currentUser }) {
  const [preview, setPreview] = useState(null), [result, setResult] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const lock = useRef(false), input = useRef(null), client = useQueryClient();
  const inspect = async (e) => {
    const files = [...e.target.files]; e.target.value = ''; if (!files.length || lock.current) return;
    lock.current = true; setBusy('ফাইল ও বিদ্যমান ওজন যাচাই হচ্ছে...'); setError(''); setPreview(null); setResult(null);
    try { setPreview(await buildHistoricalPreview(files, currentUser)); }
    catch (err) { setError(err.message || 'Preview ব্যর্থ; কোনো Record Import হয়নি।'); }
    finally { lock.current = false; setBusy(''); }
  };
  const commit = async () => {
    if (!preview || lock.current || !window.confirm('শুধু Preview-এর বৈধ পুরোনো ওজন Import হবে। পূর্ণ ব্যাকআপ যাচাই ব্যর্থ হলে কাজ থামবে। বিদ্যমান এন্ট্রি বদলাবে না। শুরু করবেন?')) return;
    lock.current = true; setBusy('Import শুরু হচ্ছে...'); setError(''); setResult(null);
    try { const r = await historicalImport(preview, currentUser, setBusy); setResult(r); setPreview(null); await client.invalidateQueries({ queryKey: ['historical-empty-weight'] }); }
    catch (err) { setError(`${err.message || 'Import ব্যর্থ।'} নিরাপত্তার জন্য স্বয়ংক্রিয় Save Retry নেই; একই ফাইল আবার Preview করে বর্তমান অবস্থার সঙ্গে মিলিয়ে নিন।`); setPreview(null); }
    finally { lock.current = false; setBusy(''); }
  };
  return <section className="rounded-xl border border-border bg-card p-4 space-y-3">
    <h2 className="text-base font-bold">Historical Empty Weight Import</h2>
    <p className="text-xs text-muted-foreground">দেওয়া JSON ও Excel একসঙ্গে নির্বাচন করুন: Preview → Duplicate/Conflict যাচাই → ভেরিফাইড ব্যাকআপ → নিশ্চিত Import। উৎস ও যাচাই-সারাংশ গোপনে রাখা হবে।</p>
    <p className="text-xs text-muted-foreground">শুধু প্ল্যাটফর্ম Admin ও ERP Super Admin Import করতে পারবেন। পুরোনো ওজন আলাদা থাকবে—বর্তমান এন্ট্রি, রিপোর্টের মোট, অ্যালার্ট বা স্বয়ংক্রিয় Loading Matching-এ যোগ হবে না।</p>
    <input ref={input} type="file" accept=".json,.xlsx" multiple onChange={inspect} disabled={!!busy} className="hidden" />
    <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">JSON / Excel নির্বাচন ও Preview</button>
    {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{busy}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {preview && <><HistoricalImportPreview preview={preview} /><button type="button" disabled={!!busy || !preview.counts.VALID} onClick={commit} className="rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50">ব্যাকআপ যাচাই করে {preview.counts.VALID}টি বৈধ Record Import করুন</button></>}
    {result && <div className="text-sm space-y-1"><p className="font-bold">{result.status} · সফল: {result.successful} · Duplicate: {result.counts.DUPLICATE} · Invalid: {result.counts.INVALID} · Review: {result.counts.REVIEW} · বাদ: {result.counts.SKIPPED}</p>{result.batchId && <p className="break-all">Batch: {result.batchId} · Backup: {result.backupId}</p>}{result.remaining > 0 && <p>বাকি/অনিশ্চিত: {result.remaining}; আবার Preview করতে হবে।</p>}{result.message && <p>{result.message}</p>}</div>}
  </section>;
}