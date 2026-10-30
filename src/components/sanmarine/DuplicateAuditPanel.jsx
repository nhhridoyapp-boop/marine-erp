import React, { useState, useEffect } from 'react';
import { Copy, AlertTriangle, Loader2, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { isSuperAdmin } from '@/lib/erpRoles';
import ConfirmDialog from './ConfirmDialog';

// Duplicate report + one-tap cleanup: an extra ID that shares one email but recorded no entry is removed,
// while the ID that actually holds the entries is kept. An ID that does have entries is never removed —
// it is listed below for a manual decision (Edit Staff / মুছুন).
export default function DuplicateAuditPanel({ currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClean, setConfirmClean] = useState(false);
  const [report, setReport] = useState(null);
  const owner = isSuperAdmin(currentUser);

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const res = await api.duplicateAudit();
      setData(res);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'অডিট লোড হয়নি।');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const clean = async () => {
    setConfirmClean(false); setErr(''); setBusy(true);
    try {
      const res = await api.dedupeAccounts();
      setReport(res);
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'ডুপ্লিকেট পরিষ্কার করা যায়নি।');
    } finally { setBusy(false); }
  };

  if (loading && !data) return <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (err && !data) return <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{err}</div>;
  if (!data) return null;

  const DupGroup = ({ label, icon: Icon, groups, field }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-black text-slate-700"><Icon className="h-3.5 w-3.5" /> {label} ({groups.length})</div>
      {groups.length === 0 && <p className="text-[11px] text-slate-400 pl-5">কোনো ডুপ্লিকেট নেই।</p>}
      {groups.map((g, i) => (
        <div key={i} className="ml-5 p-2.5 rounded-xl border border-amber-200 bg-amber-50/50">
          <div className="text-[11px] font-bold text-amber-800">{field}: {g.key} — {g.count}টি রেকর্ড</div>
          <div className="mt-1 space-y-0.5">
            {g.records.map(r => (
              <div key={r.id} className="text-[10px] text-slate-600 flex items-center gap-2">
                <span className="font-mono">{r.id.slice(-8)}</span>
                <span className="font-bold">{r.name}</span>
                <span>·</span>
                <span>{r.email || '—'}</span>
                <span>·</span>
                <span>{r.employeeId || '—'}</span>
                <span className={`px-1.5 rounded-full text-[9px] font-bold ${r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-black text-slate-800">ডুপ্লিকেট অডিট</h3>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> রিফ্রেশ
        </button>
      </div>

      {owner && (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 space-y-2">
          <div className="text-[11px] text-rose-900 flex items-start gap-2">
            <Trash2 className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <span>একই ইমেইলের অতিরিক্ত আইডি যেগুলোতে <b>কোনো এন্ট্রি নেই</b> সেগুলো মুছে ফেলা হবে; যে আইডিতে এন্ট্রি আছে সেটিই থাকবে। কোনো এন্ট্রি হারাবে না।</span>
          </div>
          <button onClick={() => setConfirmClean(true)} disabled={busy} className="flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} {busy ? 'পরিষ্কার হচ্ছে...' : 'এন্ট্রিবিহীন ডুপ্লিকেট মুছুন'}
          </button>
        </div>
      )}

      {report && (
        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-black text-emerald-800"><CheckCircle2 className="h-4 w-4" /> মুছে ফেলা হয়েছে: {report.deleted.length}টি</div>
          {report.deleted.length === 0 && <p className="text-[11px] text-emerald-800">মুছে ফেলার মতো এন্ট্রিবিহীন ডুপ্লিকেট পাওয়া যায়নি।</p>}
          {report.deleted.map((d, i) => (
            <div key={i} className="text-[11px] text-emerald-900">• {d.name} ({d.email}){d.employeeId ? ` · আইডি ${d.employeeId}` : ''}</div>
          ))}
          {report.skipped.length > 0 && (
            <div className="pt-1 space-y-1">
              <div className="text-[11px] font-black text-amber-800">এন্ট্রি থাকায় রাখা হয়েছে ({report.skipped.length}টি) — হাতে যাচাই করুন:</div>
              {report.skipped.map((s, i) => (
                <div key={i} className="text-[11px] text-amber-900">• {s.name}{s.employeeId ? ` · আইডি ${s.employeeId}` : ''}{s.entries ? ` · ${s.entries}টি এন্ট্রি` : ''}{s.reason ? ` · ${s.reason}` : ''}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {!owner && (
        <div className="p-3 rounded-xl bg-sky-50 border border-sky-100 text-[11px] text-sky-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
          <span>এই প্রতিবেদন শুধু দেখার জন্য। ডুপ্লিকেট মুছতে সুপার অ্যাডমিন লগইন দরকার; নিচের তালিকা থেকে হাতে যাচাই করে "পরিবর্তন" দিয়ে ঠিক করুন।</span>
        </div>
      )}

      <div className="text-[11px] font-bold text-slate-500">মোট রেকর্ড: {data.total}</div>
      <DupGroup label="ডুপ্লিকেট ইমেইল" icon={Copy} groups={data.duplicateEmails || []} field="ইমেইল" />
      <DupGroup label="ডুপ্লিকেট মোবাইল" icon={Copy} groups={data.duplicateMobiles || []} field="মোবাইল" />
      <DupGroup label="ডুপ্লিকেট স্টাফ আইডি" icon={Copy} groups={data.duplicateEmployeeIds || []} field="আইডি" />

      <ConfirmDialog
        open={confirmClean}
        title="এন্ট্রিবিহীন ডুপ্লিকেট মুছবেন?"
        message={'একই ইমেইলের অতিরিক্ত আইডিগুলোর মধ্যে যেগুলোতে কোনো এন্ট্রি নেই শুধু সেগুলো মুছে যাবে। মুছে ফেলা আইডি ফিরিয়ে আনা যাবে না।'}
        confirmLabel="মুছে ফেলুন"
        busy={busy}
        onConfirm={clean}
        onClose={() => setConfirmClean(false)}
      />
    </div>
  );
}