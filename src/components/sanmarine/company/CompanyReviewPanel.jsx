import React, { useEffect, useState } from 'react';
import { isAdminRole } from '@/lib/erpRoles';
import { reviewCompanyMappings, applyConfirmedCompanyMapping } from '@/components/sanmarine/company/companyReview';
export default function CompanyReviewPanel({ currentUser }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const load = async (cursor) => { setBusy(true); try { const result = await reviewCompanyMappings(cursor); setData((old) => cursor ? { ...result, candidates: [...(old?.candidates || []), ...result.candidates] } : result); } catch (e) { setMessage(e.message); } finally { setBusy(false); } };
  useEffect(() => { if (isAdminRole(currentUser)) load(); }, [currentUser?.id]);
  if (!isAdminRole(currentUser)) return null;
  const apply = async (row) => {
    if (busy || !window.confirm(`${row.label}: নির্ভরযোগ্য সম্পর্ক থেকে ${row.proposed} Assign করবেন? ব্যাকআপ/User যাচাই ব্যর্থ হলে বন্ধ হবে।`)) return;
    setBusy(true); setMessage('');
    try { const result = await applyConfirmedCompanyMapping(row, currentUser); setMessage(`${result.label} → ${result.company}; Backup ${result.backupId}`); await load(); }
    catch (e) { setMessage(e.message || 'Mapping ব্যর্থ।'); } finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-border bg-card p-4 space-y-3 text-xs">
    <h2 className="font-bold text-base">Company Mapping — Admin Review</h2>
    <p>পুরোনো SAN MARINE নামটি রিপোর্টে পূর্ণ নামে পড়া হয়; পুরোনো মান rewrite হবে না। শুধু নির্ভরযোগ্য ID-সম্পর্ক এবং নতুন ভেরিফাইড ব্যাকআপ থাকলে ফাঁকা Company পূরণ করা যাবে।</p>
    {data && <p>অনির্ধারিত Consignee: {data.consigneeCount} · অনির্ধারিত/অনাথ Entry: {data.entryCount} · খালি ওজন: {data.emptyCount} · ডেইলি ডকুমেন্ট: {data.documentCount} · অ্যালার্ট: {data.alertCount}</p>}
    {message && <p role="status" className="break-words">{message}</p>}
    {busy && <p role="status">যাচাই হচ্ছে...</p>}
    {data?.candidates.map((r) => <article key={`${r.entity}:${r.id}`} className="border-t border-border pt-2 space-y-1"><p className="font-semibold">{r.entity} · {r.label}</p><p className="break-all text-muted-foreground">ID: {r.id}</p><p>{r.reason}</p><p>প্রস্তাবিত: {r.proposed || 'Not Assigned — Review Required'}</p>{r.proposed && <button type="button" disabled={busy} onClick={() => apply(r)} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">ব্যাকআপ যাচাই করে Confirm Mapping</button>}</article>)}
    <button type="button" disabled={busy} onClick={() => load()} className="underline">আবার যাচাই</button>
    {data && Object.values(data.next).some(Boolean) && <button type="button" disabled={busy} onClick={() => load(data.next)} className="ml-3 underline">আরও Review Record</button>}
  </section>;
}