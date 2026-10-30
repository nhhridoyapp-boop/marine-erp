import React, { useState, useEffect } from 'react';
import { Link2, Trash2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { canManageMaster, ROLE_SETS } from '@/lib/erpRoles';
import { requireActor } from '@/lib/sanmarineSession';
import { logAudit } from '@/lib/sanmarineWorkflow';
import { Card, Notice, Empty, Select } from './formParts';

// Remembered Scale Name → Ghat links. Changing one here never touches historical records.
export default function ScaleMappings({ ghats, currentUser }) {
  const [items, setItems] = useState(null);
  const [note, setNote] = useState(null);
  const canEdit = canManageMaster(currentUser);
  const load = () => api.getScaleGhatMappings().then(setItems);
  useEffect(() => { load(); }, []);

  const run = async (fn, okText) => {
    try { await requireActor(currentUser, ROLE_SETS.MASTER); await fn(); setNote({ kind: 'success', text: okText }); await load(); }
    catch (e) { setNote({ kind: 'error', text: e.message || 'কাজ ব্যর্থ।' }); }
  };
  const change = (m, ghatName) => ghatName && run(async () => {
    await base44.entities.ScaleGhatMapping.update(m.id, { ghatName, lastUpdated: api.nowISO() });
    await logAudit(currentUser, 'SCALE_MAPPING_CHANGED', 'ScaleGhatMapping', m.id, m.scaleName, { ghatName: m.ghatName }, { ghatName });
  }, 'ম্যাপিং পরিবর্তন হয়েছে (আগের রেকর্ড অপরিবর্তিত)।');
  const remove = (m) => confirm(`"${m.scaleName}" ম্যাপিং মুছবেন?`) && run(async () => {
    await base44.entities.ScaleGhatMapping.delete(m.id);
    await logAudit(currentUser, 'SCALE_MAPPING_DELETED', 'ScaleGhatMapping', m.id, m.scaleName, m);
  }, 'ম্যাপিং মুছে ফেলা হয়েছে।');

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-5 pb-6 space-y-3">
      <div className="flex items-center gap-2 text-sm font-black text-slate-800"><Link2 className="h-4 w-4 text-teal-600" /> স্কেল → ঘাট ম্যাপিং (সিস্টেম মনে রাখে)</div>
      <Notice kind="info">একবার স্কেল কোনো ঘাটে ব্যবহার হলে ম্যাপিং সংরক্ষিত হয়। পরে একই স্কেল অন্য ঘাটে ব্যবহার হলে অ্যালার্ট তৈরি হয়; পুরোনো রেকর্ড বদলায় না।</Notice>
      {note && <Notice kind={note.kind}>{note.text}</Notice>}
      {items === null && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
      {items && items.length === 0 && <Empty text="এখনো কোনো স্কেল-ঘাট ম্যাপিং তৈরি হয়নি।" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(items || []).map((m) => (
          <Card key={m.id} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm text-slate-800">{m.scaleName}</div>
              <div className="text-[11px] text-slate-500">ব্যবহার {m.timesUsed || 1} বার</div>
            </div>
            {canEdit
              ? <div className="w-36"><Select value={m.ghatName} onChange={(v) => change(m, v)} options={ghats.map((g) => ({ value: g.name.toUpperCase(), label: g.name.toUpperCase() }))} /></div>
              : <span className="px-2 py-1 rounded-lg bg-slate-100 text-xs font-bold">{m.ghatName}</span>}
            {canEdit && <button onClick={() => remove(m)} className="p-2 rounded-lg bg-rose-100 text-rose-600" title="মুছুন"><Trash2 className="h-4 w-4" /></button>}
          </Card>
        ))}
      </div>
    </div>
  );
}