import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, Loader2, DatabaseBackup, RotateCcw, Trash2, Search, Activity, CheckCircle2, XCircle, Download } from 'lucide-react';
import { createAutoBackup, listBackups, loadBackupFile, downloadBackup, restoreBackup, verifyBackupIntegrity, enforceRetention, backupAll, APP_VERSION } from '@/lib/sanmarineBackup';
import { identifyTestData, deleteTestData, integrityCheck } from '@/lib/sanmarineDataSafety';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';
import { logAudit } from '@/lib/sanmarineWorkflow';
import { PageShell, PageHeader, Card, Notice, primaryBtn, ghostBtn, dangerBtn, inputCls } from './formParts';
import ExternalBackupStatus from './ExternalBackupStatus';
import HistoricalImportPanel from '@/components/sanmarine/history/HistoricalImportPanel';
import CompanyReviewPanel from '@/components/sanmarine/company/CompanyReviewPanel';

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const KIND = { auto: 'স্বয়ংক্রিয়', manual: 'ম্যানুয়াল', 'before-restore': 'রিস্টোরের আগে', 'before-reopen': 'রিওপেনের আগে', 'pre-migration': 'মাইগ্রেশনের আগে' };
const TIER = { daily: 'দৈনিক', weekly: 'সাপ্তাহিক', monthly: 'মাসিক' };

export default function DataSafety({ currentUser }) {
  const [tab, setTab] = useState('backup');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [list, setList] = useState([]);

  const load = useCallback(() => { listBackups().then(setList).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn) => {
    setBusy(key); setMsg(null);
    try { await requireActor(currentUser, ROLE_SETS.SUPER); const r = await fn(); setMsg(r || { kind: 'success', text: 'সম্পন্ন হয়েছে।' }); }
    catch (e) { setMsg({ kind: 'error', text: e.message || 'কাজ ব্যর্থ।' }); }
    finally { setBusy(''); load(); }
  };

  const tabs = [
    { id: 'backup', label: 'ব্যাকআপ', icon: DatabaseBackup },
    { id: 'restore', label: 'রিস্টোর', icon: RotateCcw },
    { id: 'cleanup', label: 'ডেমো ক্লিনআপ', icon: Trash2 },
    { id: 'integrity', label: 'ইন্টিগ্রিটি', icon: Activity },
    { id: 'historical', label: 'পুরোনো খালি ওজন Import', icon: Download },
    { id: 'company_review', label: 'Company Mapping Review', icon: Search },
  ];

  return (
    <PageShell>
      <PageHeader icon={ShieldCheck} title="ডেটা সেফটি ও ব্যাকআপ" sub={`ভার্সন: ${APP_VERSION} · সব কাজ Super Admin-এর জন্য, প্রতিটি অডিট-লগ হয়`} />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const Icon = t.icon; const active = tab === t.id;
          return <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${active ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}><Icon className="h-4 w-4" />{t.label}</button>;
        })}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {tab === 'backup' && <BackupTab busy={busy} run={run} list={list} currentUser={currentUser} />}
      {tab === 'restore' && <RestoreTab busy={busy} run={run} list={list} currentUser={currentUser} onDone={load} />}
      {tab === 'cleanup' && <CleanupTab busy={busy} run={run} currentUser={currentUser} />}
      {tab === 'integrity' && <IntegrityTab busy={busy} run={run} />}
      {tab === 'historical' && <HistoricalImportPanel currentUser={currentUser} />}
      {tab === 'company_review' && <CompanyReviewPanel currentUser={currentUser} />}
    </PageShell>
  );
}

function BackupTab({ busy, run, list, currentUser }) {
  const doBackup = () => run('backup', async () => {
    const r = await createAutoBackup(currentUser, 'manual', 'ম্যানুয়াল ব্যাকআপ (ভেরিফাইড)');
    if (!r.verified) return { kind: 'warn', text: `ব্যাকআপ তৈরি হলেও ভেরিফিকেশন ব্যর্থ — ${r.total} রেকর্ড। আবার চেষ্টা করুন।` };
    return { kind: 'success', text: `ভেরিফাইড ব্যাকআপ সংরক্ষিত — ${r.total} রেকর্ড, hash ✓, count ✓।` };
  });
  const doDownload = () => run('download', async () => {
    const b = await backupAll(); downloadBackup(b);
    await logAudit(currentUser, 'BACKUP_DOWNLOADED', 'System', '', `${sum(b.counts)} রেকর্ড (ডিভাইসে ডাউনলোড)`);
    return { kind: 'success', text: `ব্যাকআপ ডাউনলোড হয়েছে — ${sum(b.counts)}টি রেকর্ড।` };
  });
  const doRetention = () => run('retention', async () => {
    const r = await enforceRetention();
    await logAudit(currentUser, 'BACKUP_RETENTION', 'System', '', `${r.removed}টি পুরোনো লগ প্রুন, ${r.kept}টি রাখা`);
    return { kind: 'success', text: `রিটেনশন প্রয়োগ — ${r.removed}টি পুরোনো ব্যাকআপ লগ প্রুন, ${r.kept}টি রাখা (দৈনিক ৭, সাপ্তাহিক ৪, মাসিক ১২)।` };
  });

  return (
    <>
      <ExternalBackupStatus />
      <Card className="space-y-3">
        <Notice kind="info">প্রতিটি ব্যাকআপ তৈরির পর রেকর্ড count ও SHA-256 hash দিয়ে ভেরিফাই হয় এবং সংরক্ষিত ফাইল আবার পড়ে মিলিয়ে দেখা হয়। ভেরিফিকেশন ব্যর্থ হলে "অভেরিফাইড" দেখাবে।</Notice>
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={doBackup} disabled={!!busy} className={primaryBtn}>{busy === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} এখনই ব্যাকআপ (ভেরিফাইড)</button>
          <button onClick={doDownload} disabled={!!busy} className={ghostBtn}>{busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} ডাউনলোড</button>
          <button onClick={doRetention} disabled={!!busy} className={ghostBtn}>{busy === 'retention' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} রিটেনশন প্রয়োগ</button>
        </div>
      </Card>
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 pt-2">সংরক্ষিত ব্যাকআপ ({list.length})</div>
      {list.length === 0 && <div className="text-xs text-slate-400 font-bold">এখনো কোনো ব্যাকআপ নেই।</div>}
      <div className="space-y-1.5">
        {list.map((b) => (
          <div key={b.id} className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-slate-800 flex items-center gap-1.5 flex-wrap">
                {new Date(b.createdAt).toLocaleString('en-GB')}
                <span className="px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px]">{KIND[b.kind] || b.kind}</span>
                {b.tier && <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]">{TIER[b.tier] || b.tier}</span>}
                {b.verified ? <span className="flex items-center gap-0.5 text-emerald-600 text-[10px] font-bold"><CheckCircle2 className="h-3 w-3" />ভেরিফাইড</span> : <span className="flex items-center gap-0.5 text-rose-600 text-[10px] font-bold"><XCircle className="h-3 w-3" />অভেরিফাইড</span>}
              </div>
              <div className="text-[10px] text-slate-500 truncate">{b.totalRecords}টি রেকর্ড · {b.createdByName} · {b.reason}</div>
              {b.verifyDetails && <div className="text-[9px] text-slate-400 truncate font-mono">{b.verifyDetails}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RestoreTab({ busy, run, list, currentUser, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { const parsed = JSON.parse(await f.text()); setFile(parsed); setPreview({ total: sum(parsed.counts), hash: parsed.hash, createdAt: parsed.createdAt }); }
    catch (err) { setPreview({ error: 'অবৈধ JSON ফাইল।' }); }
  };

  const doRestore = (backup, label) => run('restore', async () => {
    if (!backup || !confirm('রিস্টোর শুধু অনুপস্থিত রেকর্ড যোগ করবে — বিদ্যমান কোনো ডাটা মুছবে বা বদলাবে না। রিস্টোরের আগে স্বয়ংক্রিয় সেফটি ব্যাকআপ নেওয়া হবে। চালিয়ে যাবেন?')) return null;
    await logAudit(currentUser, 'RESTORE_STARTED', 'System', '', label);
    await createAutoBackup(currentUser, 'before-restore', `${label} রিস্টোরের আগে সেফটি ব্যাকআপ`);
    const res = await restoreBackup(backup);
    const v = await verifyBackupIntegrity(backup);
    await logAudit(currentUser, 'RESTORE_COMPLETED', 'System', '', `${label}: নতুন ${sum(res.created)}, বাদ ${sum(res.skipped)}, verify=${v.ok}`);
    onDone();
    return { kind: v.ok ? 'success' : 'warn', text: `রিস্টোর সম্পন্ন — নতুন ${sum(res.created)}টি, আগে থেকে ছিল ${sum(res.skipped)}টি। ভেরিফিকেশন: ${v.ok ? '✓' : '⚠️'}।` };
  });

  const doFromLog = (b) => run(`r-${b.id}`, async () => {
    const backup = await loadBackupFile(b.fileUri);
    return doRestore(backup, new Date(b.createdAt).toLocaleString('en-GB'));
  });

  return (
    <>
      <Card className="space-y-3">
        <Notice kind="warn">রিস্টোরের আগে স্বয়ংক্রিয় সেফটি ব্যাকআপ নেওয়া হয়। রিস্টোর শুধু additive — কোনো বিদ্যমান ডাটা মুছে/বদলায় না।</Notice>
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={ghostBtn}>{busy === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} ফাইল থেকে রিস্টোর</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
        {preview && !preview.error && (
          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div className="font-bold text-slate-700">ব্যাকআপ: {preview.createdAt && new Date(preview.createdAt).toLocaleString('en-GB')}</div>
            <div className="text-slate-500">মোট {preview.total}টি রেকর্ড · hash: {preview.hash ? preview.hash.slice(0, 16) + '…' : 'নেই'}</div>
            <button onClick={() => doRestore(file, 'ফাইল')} disabled={!!busy} className={primaryBtn + ' mt-1'}>{busy === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} রিস্টোর শুরু</button>
          </div>
        )}
        {preview && preview.error && <Notice kind="error">{preview.error}</Notice>}
      </Card>
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 pt-2">সংরক্ষিত ব্যাকআপ থেকে রিস্টোর</div>
      <div className="space-y-1.5">
        {list.map((b) => (
          <div key={b.id} className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-slate-800">{new Date(b.createdAt).toLocaleString('en-GB')} <span className="ml-1 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px]">{KIND[b.kind]}</span> {b.verified ? <span className="text-emerald-600 text-[10px]">✓</span> : <span className="text-rose-600 text-[10px]">⚠</span>}</div>
              <div className="text-[10px] text-slate-500 truncate">{b.totalRecords}টি রেকর্ড · {b.reason}</div>
            </div>
            <button onClick={() => doFromLog(b)} disabled={!!busy} className={ghostBtn}>{busy === `r-${b.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} রিস্টোর</button>
          </div>
        ))}
      </div>
    </>
  );
}

function CleanupTab({ busy, run, currentUser }) {
  const [candidates, setCandidates] = useState(null);
  const [confirmText, setConfirmText] = useState('');

  const scan = () => run('scan', async () => {
    const c = await identifyTestData();
    setCandidates(c);
    await logAudit(currentUser, 'DATA_CLEANUP_SCAN', 'System', '', `${c.total}টি test/demo রেকর্ড শনাক্ত`);
    return { kind: 'info', text: `${c.total}টি demo/test রেকর্ড শনাক্ত করা হয়েছে — নিচে দেখুন। মুছতে হলে "DELETE" টাইপ করে নিশ্চিত করুন।` };
  });

  const doDelete = () => run('delete', async () => {
    if (!candidates || candidates.total === 0) return { kind: 'info', text: 'মুছার মতো test ডেটা নেই।' };
    if (confirmText !== 'DELETE') return { kind: 'error', text: 'নিশ্চিত করতে "DELETE" লিখুন।' };
    await createAutoBackup(currentUser, 'before-restore', 'ডেমো ক্লিনআপের আগে সেফটি ব্যাকআপ');
    await logAudit(currentUser, 'DATA_DELETE_STARTED', 'System', '', `${candidates.total}টি test/demo রেকর্ড মুছছে`);
    const before = candidates.total;
    await deleteTestData(candidates, currentUser);
    const after = await identifyTestData();
    setCandidates(after);
    setConfirmText('');
    await logAudit(currentUser, 'DATA_CLEANUP', 'System', '', `${before}টি test/demo মুছে ফেলা হয়েছে, অবশিষ্ট ${after.total}`);
    return { kind: 'success', text: `${before}টি demo/test রেকর্ড মুছে ফেলা হয়েছে। সেফটি ব্যাকআপ আগেই নেওয়া হয়েছে। অবশিষ্ট test: ${after.total}টি।` };
  });

  const g = candidates?.groups || {};
  const rows = [
    ['testUsers', 'Test ইউজার', g.testUsers],
    ['trucks', 'Test ট্রাক এন্ট্রি', g.trucks],
    ['empties', 'Test খালি ওজন', g.empties],
    ['alerts', 'Test অ্যালার্ট', g.alerts],
    ['trustedDevices', 'Test ডিভাইস', g.trustedDevices],
    ['otpCodes', 'Test OTP', g.otpCodes],
    ['scaleMappings', 'Test স্কেল-ঘাট', g.scaleMappings],
    ['closings', 'Test ক্লোজিং', g.closings],
    ['approvals', 'Test অনুমোদন', g.approvals],
    ['ghats', 'Test ঘাট', g.ghats],
    ['vessels', 'Test ভেসেল', g.vessels],
    ['lighters', 'Test লাইটার', g.lighters],
    ['consignees', 'Test কনসাইনি', g.consignees],
    ['cargos', 'Test কার্গো', g.cargos],
  ].filter(([, , arr]) => arr && arr.length);

  return (
    <>
      <Card className="space-y-3">
        <Notice kind="info">শুধু স্পষ্ট test ডেটা শনাক্ত হয়: <b>@test.local</b> ইমেইল, <b>ZQ795645-*</b> প্রিফিক্স, <b>DMT9xxxxx</b> ট্রাক। Master Super Admin ও gmail ইউজার কখনো ধরা যায় না।</Notice>
        <Notice kind="warn">মোছার আগে স্বয়ংক্রিয় সেফটি ব্যাকআপ নেওয়া হয়। এটি অপরিবর্তনীয় — সাবধানে করুন।</Notice>
        <button onClick={scan} disabled={!!busy} className={primaryBtn}>{busy === 'scan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Test ডেটা খুঁজে বের করুন</button>
      </Card>
      {candidates && (
        <Card className="space-y-2">
          <div className="text-sm font-black text-slate-800">শনাক্ত: <span className="text-rose-600">{candidates.total}টি</span></div>
          {rows.length === 0 && <div className="text-xs text-emerald-600 font-bold">কোনো test/demo ডেটা পাওয়া যায়নি — ডাটাবেস পরিষ্কার। ✓</div>}
          {rows.map(([k, label, arr]) => (
            <div key={k} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-xs font-bold text-slate-700">{label}</span>
              <span className="text-xs font-black font-mono text-rose-600">{arr.length}টি</span>
            </div>
          ))}
          {candidates.total > 0 && (
            <div className="space-y-2 pt-2">
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='নিশ্চিত করতে "DELETE" লিখুন' className={inputCls + ' font-mono'} />
              <button onClick={doDelete} disabled={!!busy || confirmText !== 'DELETE'} className={dangerBtn}>{busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} নির্বাচিত Test ডেটা মুছুন</button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function IntegrityTab({ busy, run }) {
  const [result, setResult] = useState(null);
  const check = () => run('integrity', async () => {
    const r = await integrityCheck(); setResult(r);
    return { kind: r.orphans.length ? 'warn' : 'success', text: `ইন্টিগ্রিটি চেক সম্পন্ন — মোট ${r.total}টি রেকর্ড, ${r.orphans.length ? r.orphans.length + 'টি orphan রেফারেন্স' : 'কোনো orphan নেই'}।` };
  });
  return (
    <>
      <Card className="space-y-3">
        <Notice kind="info">প্রতিটি entity-এর live count + orphan রেফারেন্স যাচাই।</Notice>
        <button onClick={check} disabled={!!busy} className={primaryBtn}>{busy === 'integrity' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} ইন্টিগ্রিটি চেক চালান</button>
      </Card>
      {result && (
        <Card className="space-y-2">
          {result.orphans.length > 0 && <Notice kind="warn">{result.orphans.map((o) => `${o.type}: ${o.count}`).join(' · ')}</Notice>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {Object.entries(result.counts).map(([k, v]) => (
              <div key={k} className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-[9px] font-bold text-slate-500 truncate">{k}</div>
                <div className={`text-sm font-black font-mono ${v < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{v < 0 ? 'ERR' : v}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] font-bold text-slate-500 pt-1">মোট রেকর্ড: {result.total}</div>
        </Card>
      )}
    </>
  );
}