import React, { useState } from 'react';
import { Lock, Unlock, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { canClose, isSuperAdmin } from '@/lib/erpRoles';
import { reopenClosing } from '@/lib/sanmarineClosing';
import { createAutoBackup } from '@/lib/sanmarineBackup';
import { createApproval, logAudit } from '@/lib/sanmarineWorkflow';
import ClosingForm from './ClosingForm';
import ClosingReport from './ClosingReport';
import { PageShell, PageHeader, Card, Notice, Empty, ghostBtn } from './formParts';

const fN = (n) => Number(n || 0).toLocaleString('en-IN');

export default function ClosingPage({ closings, lighters, vessels, consignees, approvals, currentUser, onRefresh, settings }) {
  const [note, setNote] = useState(null);
  const [reportClosing, setReportClosing] = useState(null);
  const sorted = [...closings].sort((a, b) => (b.closingDate || '').localeCompare(a.closingDate || ''));

  const reopen = async (c) => {
    if (isSuperAdmin(currentUser)) {
      if (!confirm(`${c.lighterVesselName} পুনরায় খুলবেন? (খোলার আগে স্বয়ংক্রিয় ব্যাকআপ নেওয়া হবে)`)) return;
      try {
        await createAutoBackup(currentUser, 'before-reopen', `${c.lighterVesselName} পুনরায় খোলার আগে`);
        await reopenClosing(currentUser, c.id);
        await logAudit(currentUser, 'LIGHTER_REOPENED', 'VesselClosing', c.id, c.lighterVesselName);
        setNote({ kind: 'success', text: 'লাইটার পুনরায় খোলা হয়েছে (আগের ক্লোজিং রেকর্ড ইতিহাসে সংরক্ষিত)।' });
      } catch (e) {
        setNote({ kind: 'error', text: e.message || 'পুনরায় খোলা ব্যর্থ।' });
      }
    } else {
      await createApproval(currentUser, { type: 'LIGHTER_REOPEN', targetId: c.id, targetDescription: `লাইটার পুনরায় খোলা: ${c.lighterVesselName}` });
      await base44.entities.VesselClosing.update(c.id, { reopenRequested: true });
      setNote({ kind: 'info', text: 'পুনরায় খোলার অনুরোধ সুপার অ্যাডমিনের কাছে পাঠানো হয়েছে।' });
    }
    await onRefresh();
  };

  return (
    <PageShell>
      <PageHeader icon={Lock} title="লাইটার ক্লোজিং" sub="ক্লোজ করলে ওই লাইটারে নতুন এন্ট্রি লক হয়" />
      {note && <Notice kind={note.kind}>{note.text}</Notice>}
      {canClose(currentUser)
        ? <ClosingForm lighters={lighters} vessels={vessels} closings={closings} currentUser={currentUser} onDone={onRefresh} />
        : <Notice kind="info">লাইটার ক্লোজ করতে সুপারভাইজার বা তার উপরের রোল প্রয়োজন।</Notice>}
      {sorted.length === 0 && <Empty text="কোনো ক্লোজিং রেকর্ড নেই।" />}
      <div className="space-y-2">
        {sorted.map(c => {
          const requested = c.reopenRequested || approvals.some(a => a.status === 'pending' && a.targetId === c.id);
          return (
            <Card key={c.id} className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm text-slate-800">{c.lighterVesselName}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.status === 'LOCKED' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>
              </div>
              <div className="text-[11px] text-slate-500">{c.motherVesselName} · {c.consigneeName || '—'} · {c.closingDate} · {c.closedByName}</div>
              <div className="flex flex-wrap gap-x-4 text-[11px] font-bold text-slate-700">
                <span>ট্রাক {fN(c.totalCompletedTrucks)}</span><span>ব্যাগ {fN(c.totalBags)}</span><span>নেট {fN(c.totalDailyNetWeightKg)} KG</span>
                <span className="text-teal-700">চূড়ান্ত {(c.finalNetWeightMT || 0).toFixed(3)} MT</span>
              </div>
              <button onClick={() => setReportClosing(c)} className={ghostBtn}><FileText className="h-4 w-4" /> রিপোর্ট দেখুন</button>
              {c.status === 'LOCKED' && canClose(currentUser) && (
                <button disabled={requested} onClick={() => reopen(c)} className={ghostBtn}><Unlock className="h-4 w-4" /> {requested ? 'অনুরোধ পাঠানো হয়েছে' : isSuperAdmin(currentUser) ? 'পুনরায় খুলুন' : 'পুনরায় খোলার অনুরোধ'}</button>
              )}
            </Card>
          );
        })}
      </div>
      {reportClosing && (
        <ClosingReport closing={reportClosing} closings={closings} vessels={vessels} lighters={lighters} consignees={consignees} settings={settings} onClose={() => setReportClosing(null)} />
      )}
    </PageShell>
  );
}