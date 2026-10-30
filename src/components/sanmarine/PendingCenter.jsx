import React from 'react';
import { Clock, Truck, Scale } from 'lucide-react';
import { PageShell, PageHeader, Card, Empty, ghostBtn } from './formParts';

export default function PendingCenter({ emptyWeights, entries, onNavigate }) {
  const emptyPending = emptyWeights.filter(e => !e.loadingEntryId);
  const loadPending = entries.filter(e => !e.emptyWeightMatched);

  return (
    <PageShell>
      <PageHeader icon={Clock} title="পেন্ডিং সেন্টার" sub={`${emptyPending.length + loadPending.length}টি পেন্ডিং ট্রাক`} />

      <section className="space-y-2">
        <h2 className="text-xs font-black uppercase tracking-wider text-amber-700 flex items-center gap-1.5"><Scale className="h-4 w-4" /> খালি ওজন নেওয়া হয়েছে — লোড এন্ট্রি বাকি ({emptyPending.length})</h2>
        {emptyPending.length === 0 && <Empty text="কোনো পেন্ডিং নেই।" />}
        {emptyPending.slice(0, 100).map(e => (
          <Card key={e.id} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm font-mono">{e.truckNumber}</div>
              <div className="text-[11px] text-slate-500">{e.emptyWeightDate} {e.emptyWeightTime} · {e.ghat} · মনিটর {e.monitorWeight} KG</div>
            </div>
            <button onClick={() => onNavigate('entry', { mode: 'loading', truckNo: e.truckNumber })} className={ghostBtn}><Truck className="h-4 w-4" /> লোড এন্ট্রি</button>
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-black uppercase tracking-wider text-rose-700 flex items-center gap-1.5"><Truck className="h-4 w-4" /> লোড এন্ট্রি আছে — খালি ওজন নেই ({loadPending.length})</h2>
        {loadPending.length === 0 && <Empty text="কোনো পেন্ডিং নেই।" />}
        {loadPending.slice(0, 100).map(e => (
          <Card key={e.id} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm font-mono">{e.truckNumber}</div>
              <div className="text-[11px] text-slate-500">{e.date} {e.time} · {e.ghatName} · নেট {e.net} KG</div>
            </div>
            <button onClick={() => onNavigate('entry', { mode: 'empty', truckNo: e.truckNumber })} className={ghostBtn}><Scale className="h-4 w-4" /> খালি ওজন</button>
          </Card>
        ))}
      </section>
    </PageShell>
  );
}