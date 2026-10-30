import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { UserCheck } from 'lucide-react';
import { isAdminRole, isSuperAdmin } from '@/lib/erpRoles';
import { resolveApproval } from '@/lib/sanmarineWorkflow';
import { PageShell, PageHeader, Notice, Empty } from './formParts';
import ApprovalCard from './ApprovalCard';

export default function ApprovalCenter({ approvals, currentUser, onRefresh }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  // A held weight-mismatch entry may be approved by an Admin (or the app's platform admin); edit/delete/reopen
  // requests stay Super Admin only, exactly as before.
  const [platformAdmin, setPlatformAdmin] = useState(false);
  useEffect(() => { base44.auth.me().then((m) => setPlatformAdmin(m?.role === 'admin')).catch(() => {}); }, []);
  const canDecide = (a) => (a.type === 'WEIGHT_MISMATCH' ? (isAdminRole(currentUser) || platformAdmin) : isSuperAdmin(currentUser));
  const pending = approvals.filter((a) => a.status === 'pending');
  const history = approvals.filter((a) => a.status !== 'pending').slice(0, 20);

  const decide = async (a, decision) => {
    setBusy(a.id);
    try {
      await resolveApproval(a, decision, currentUser);
      setNote({
        kind: 'success',
        text: decision === 'approved'
          ? (a.type === 'WEIGHT_MISMATCH' ? 'অনুমোদিত হয়েছে — এন্ট্রি তৈরি হয়েছে।' : 'অনুমোদিত হয়েছে।')
          : (a.type === 'WEIGHT_MISMATCH' ? 'বাতিল করা হয়েছে — এই ট্রাকের এন্ট্রি হয়নি।' : 'বাতিল করা হয়েছে।'),
      });
      await onRefresh();
    } catch (e) {
      // The server briefly refusing calls (rate limit) is not a decision failure: nothing is half-approved, and
      // the same button works again a few seconds later.
      const limited = (e && (e.status === 429 || (e.response && e.response.status) === 429)) || /rate limit/i.test((e && e.message) || '');
      setNote({ kind: 'error', text: limited
        ? 'সার্ভার এই মুহূর্তে ব্যস্ত (রেট লিমিট) — কয়েক সেকেন্ড অপেক্ষা করে আবার চাপুন। কিছুই নষ্ট হয়নি।'
        : (e.message || 'কাজ ব্যর্থ।') });
    } finally { setBusy(''); }
  };

  return (
    <PageShell>
      <PageHeader icon={UserCheck} title="অনুমোদন কেন্দ্র" sub={`${pending.length}টি অনুমোদনের অপেক্ষায়`} />
      {note && <Notice kind={note.kind}>{note.text}</Notice>}
      {pending.length === 0 && <Empty text="কোনো পেন্ডিং অনুমোদন নেই।" />}
      <div className="space-y-2">
        {pending.map((a) => <ApprovalCard key={a.id} a={a} canDecide={canDecide(a)} busy={busy === a.id} onDecide={(d) => decide(a, d)} />)}
      </div>
      {history.length > 0 && <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 pt-2">সাম্প্রতিক সিদ্ধান্ত</h2>}
      <div className="space-y-2">{history.map((a) => <ApprovalCard key={a.id} a={a} canDecide={false} busy={false} onDecide={() => {}} />)}</div>
    </PageShell>
  );
}