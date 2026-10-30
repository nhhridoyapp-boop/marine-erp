import React, { useState, useRef, useEffect } from 'react';
import { Download, Upload, Loader2, DatabaseBackup, CloudUpload, RotateCcw } from 'lucide-react';
import { backupAll, downloadBackup, restoreBackup, createAutoBackup, listBackups, loadBackupFile } from '@/lib/sanmarineBackup';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';
import { logAudit } from '@/lib/sanmarineWorkflow';
import { Card, Notice, primaryBtn, ghostBtn } from './formParts';

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const KIND = { auto: 'স্বয়ংক্রিয়', manual: 'ম্যানুয়াল', 'before-restore': 'রিস্টোরের আগে', 'before-reopen': 'রিওপেনের আগে' };

export default function BackupRestore({ currentUser, onDone }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [list, setList] = useState([]);
  const fileRef = useRef(null);
  const load = () => listBackups().then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  const run = async (key, fn) => {
    setBusy(key); setMsg(null);
    try { await requireActor(currentUser, ROLE_SETS.SUPER); setMsg(await fn()); }
    catch (e) { setMsg({ kind: 'error', text: e.message || 'কাজ ব্যর্থ।' }); }
    finally { setBusy(''); load(); }
  };

  const doDownload = () => run('download', async () => {
    const b = await backupAll();
    downloadBackup(b);
    await logAudit(currentUser, 'BACKUP_DOWNLOADED', 'System', '', `${sum(b.counts)} রেকর্ড (ডিভাইসে ডাউনলোড)`);
    return { kind: 'success', text: `ব্যাকআপ ডাউনলোড হয়েছে — মোট ${sum(b.counts)}টি রেকর্ড।` };
  });

  const doCloud = () => run('cloud', async () => {
    const r = await createAutoBackup(currentUser, 'manual', 'ম্যানুয়াল ব্যাকআপ');
    if (!r.verified) return { kind: 'warn', text: `ব্যাকআপ তৈরি হলেও ভেরিফিকেশন ব্যর্থ — ${r.total}টি রেকর্ড। আবার চেষ্টা করুন।` };
    return { kind: 'success', text: `ভেরিফাইড ব্যাকআপ অ্যাপের সার্ভার-স্টোরেজে সংরক্ষিত — ${r.total}টি রেকর্ড (এটি ইনডিপেনডেন্ট এক্সটার্নাল ব্যাকআপ নয়)।` };
  });

  const restoreData = async (backup, label) => {
    await createAutoBackup(currentUser, 'before-restore', `${label} রিস্টোরের আগে স্বয়ংক্রিয় ব্যাকআপ`);
    const res = await restoreBackup(backup);
    await logAudit(currentUser, 'BACKUP_RESTORED', 'System', '', `${label}: নতুন ${sum(res.created)}, বাদ ${sum(res.skipped)}`);
    await onDone();
    return { kind: 'success', text: `রিস্টোর সম্পন্ন — নতুন যোগ ${sum(res.created)}টি, আগে থেকেই ছিল ${sum(res.skipped)}টি। (রিস্টোরের আগের অবস্থার ব্যাকআপও রাখা হয়েছে)` };
  };

  const confirmText = 'রিস্টোর শুধু অনুপস্থিত রেকর্ড যোগ করবে — বিদ্যমান কোনো ডাটা মুছবে বা বদলাবে না। রিস্টোরের আগে বর্তমান অবস্থার স্বয়ংক্রিয় ব্যাকআপ নেওয়া হবে। চালিয়ে যাবেন?';
  const doFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !confirm(confirmText)) return;
    run('restore', async () => restoreData(JSON.parse(await file.text()), 'ফাইল'));
  };
  const doFromLog = (b) => confirm(confirmText) && run(`r-${b.id}`, async () => restoreData(await loadBackupFile(b.fileUri), new Date(b.createdAt).toLocaleString('en-GB')));

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-black text-slate-800"><DatabaseBackup className="h-4 w-4 text-teal-600" /> ব্যাকআপ ও রিস্টোর</div>
      <Notice kind="info">প্রতিদিন প্রথম অ্যাডমিন লগইনে স্বয়ংক্রিয় ব্যাকআপ হয়; রিস্টোর ও লাইটার পুনরায় খোলার আগেও হয়। ব্যাকআপ প্রাইভেট স্টোরেজে থাকে — কোনো ডাটা মোছা হয় না।</Notice>
      <Notice kind="warn">ব্যাকআপ ফাইলে ইউজারের পাসওয়ার্ড হ্যাশসহ সব ডাটা থাকে — ডাউনলোড করা ফাইল গোপন রাখুন।</Notice>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={doCloud} disabled={!!busy} className={primaryBtn}>{busy === 'cloud' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} এখনই ব্যাকআপ নিন</button>
        <button onClick={doDownload} disabled={!!busy} className={ghostBtn}>{busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} ব্যাকআপ ডাউনলোড</button>
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={ghostBtn}>{busy === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} ফাইল থেকে রিস্টোর</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={doFile} className="hidden" />
      </div>
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 pt-1">সংরক্ষিত ব্যাকআপ ({list.length})</div>
      {list.length === 0 && <div className="text-xs text-slate-400 font-bold">এখনো কোনো ব্যাকআপ নেই।</div>}
      <div className="space-y-1.5">
        {list.map((b) => (
          <div key={b.id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-slate-800">{new Date(b.createdAt).toLocaleString('en-GB')} <span className="ml-1 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px]">{KIND[b.kind] || b.kind}</span></div>
              <div className="text-[10px] text-slate-500 truncate">{b.totalRecords}টি রেকর্ড · {b.createdByName} · {b.reason}</div>
            </div>
            <button onClick={() => doFromLog(b)} disabled={!!busy} className={ghostBtn}>{busy === `r-${b.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} রিস্টোর</button>
          </div>
        ))}
      </div>
    </Card>
  );
}