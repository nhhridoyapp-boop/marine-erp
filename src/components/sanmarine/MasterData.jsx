import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Database } from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { canManageMaster, canAddMaster, ROLE_SETS } from '@/lib/erpRoles';
import { requireActor } from '@/lib/sanmarineSession';
import { MASTER_CONFIGS } from './masterConfigs';
import MasterForm from './MasterForm';
import { Card, PageShell, PageHeader, Notice, Empty, primaryBtn } from './formParts';

export default function MasterData({ type, items, lookups, currentUser, onRefresh }) {
  // Own-key lookup only: a stray address like /master/constructor must fall through to the message below,
  // never resolve to something on Object's prototype and crash the page.
  const cfg = Object.hasOwn(MASTER_CONFIGS, type) ? MASTER_CONFIGS[type] : null;
  const canAdd = canAddMaster(currentUser);
  const canManage = canManageMaster(currentUser);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  // An unknown list type (old link, mistyped address) must show a plain message — never crash the screen.
  if (!cfg) return (
    <PageShell>
      <Notice kind="error">এই তালিকাটি খুঁজে পাওয়া যায়নি। মেনু থেকে আবার খুলুন।</Notice>
    </PageShell>
  );

  const save = async (data) => {
    setBusy(true);
    try {
      await requireActor(currentUser, editing.id ? ROLE_SETS.MASTER : ROLE_SETS.MASTER_ADD);
      await api.saveMaster(type, editing.id || null, data);
      setEditing(null);
      setNote({ kind: 'success', text: 'সংরক্ষিত হয়েছে।' });
      await onRefresh();
    } catch (e) {
      setNote({ kind: 'error', text: e.message || 'সংরক্ষণ ব্যর্থ।' });
    } finally { setBusy(false); }
  };

  const remove = async (item) => {
    const blocked = cfg.inUse ? cfg.inUse(item, lookups) : '';
    if (blocked) { setNote({ kind: 'error', text: blocked }); return; }
    if (!confirm(`"${item.name}" মুছে ফেলতে চান?`)) return;
    try {
      await requireActor(currentUser, ROLE_SETS.MASTER);
      await api.deleteMaster(type, item.id);
      setNote({ kind: 'success', text: 'মুছে ফেলা হয়েছে (অডিট লগে সংরক্ষিত)।' });
      await onRefresh();
    } catch (e) {
      setNote({ kind: 'error', text: e.message || 'কাজ ব্যর্থ।' });
    }
  };

  return (
    <PageShell>
      <PageHeader icon={Database} title={cfg.title} sub={`মোট ${items.length}টি`}
        right={canAdd && <button onClick={() => { setNote(null); setEditing({}); }} className={primaryBtn}><Plus className="h-4 w-4" /> নতুন</button>} />
      {note && <Notice kind={note.kind}>{note.text}</Notice>}
      {!canAdd && <Notice kind="info">নতুন তথ্য যোগ করতে Supervisor / Staff অনুমোদিত অ্যাকাউন্ট দরকার। সম্পাদনা/মুছতে অ্যাডমিন অনুমতি দরকার।</Notice>}
      {canAdd && !canManage && <Notice kind="info">আপনি নতুন তথ্য যোগ করতে পারবেন। সম্পাদনা ও মুছতে অ্যাডমিন অনুমতি দরকার।</Notice>}
      {editing && <MasterForm key={editing.id || 'new'} cfg={cfg} kind={type} initial={editing} lookups={lookups} onSave={save} onCancel={() => setEditing(null)} busy={busy} />}
      {items.length === 0 && <Empty text="কোনো তথ্য নেই।" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map(item => (
          <Card key={item.id} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm text-slate-800 truncate">{item.name}</div>
              <div className="text-[11px] text-slate-500 truncate">{cfg.sub(item, lookups) || '—'}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {item.company && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-700">{item.company}</span>}
                {item.status && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">{item.status}</span>}
              </div>
            </div>
            {canManage && (
              <div className="flex gap-1 shrink-0">
                <button onClick={() => { setNote(null); setEditing(item); }} className="p-2 rounded-lg bg-slate-100 text-slate-600" title="সম্পাদনা"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(item)} className="p-2 rounded-lg bg-rose-100 text-rose-600" title="মুছুন"><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </PageShell>
  );
}