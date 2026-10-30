import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileSpreadsheet, Search, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { isAdminRole } from '@/lib/erpRoles';
import { normalizeTruckNumber } from '@/utils/truckUtils';
import { deleteRecord, createApproval } from '@/lib/sanmarineWorkflow';
import { assertNotLocked } from '@/lib/sanmarineEntries';
import { andQuery } from '@/components/sanmarine/company/companyScope';
import EntryRow from './EntryRow';
import EntryDetail from './EntryDetail';
import EditRecordModal from './EditRecordModal';
import { PageShell, PageHeader, Notice, Empty, inputCls, ghostBtn } from './formParts';

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FILTERS = [['all', 'সব'], ['today', 'আজকের'], ['matched', 'ম্যাচড'], ['pending_empty', 'বাকি']];

function buildQuery(kind, { search, date, status, ghat, vesselId, lighterId, staff, shift }) {
  const isLoading = kind === 'loading';
  const q = {};
  const d = status === 'today' ? api.todayStr() : date;
  if (d) q[isLoading ? 'date' : 'emptyWeightDate'] = d;
  if (ghat) q[isLoading ? 'ghatName' : 'ghat'] = ghat;
  if (isLoading) {
    if (vesselId) q.motherVesselId = vesselId;
    if (lighterId) q.lighterVesselId = lighterId;
    if (shift) q.shift = shift;
    if (staff) q.enteredBy = { $regex: escapeRx(staff), $options: 'i' };
  } else if (staff) {
    q.enteredByName = { $regex: escapeRx(staff), $options: 'i' };
  }
  if (search.trim()) q.normalizedTruckNumber = { $regex: escapeRx(normalizeTruckNumber(search) || search.trim().toUpperCase()), $options: 'i' };
  if (status === 'matched') {
    if (isLoading) q.emptyWeightMatched = true; else q.loadingEntryId = { $exists: true, $ne: '' };
  }
  if (status === 'pending_empty') {
    if (isLoading) q.emptyWeightMatched = { $ne: true }; else q.$or = [{ loadingEntryId: '' }, { loadingEntryId: { $exists: false } }];
  }
  return q;
}

export default function EntriesList({ scope, initialFilter = 'all', currentUser, vessels = [], lighters = [], ghats = [], onChanged }) {
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [kind, setKind] = useState('loading');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [ghat, setGhat] = useState('');
  const [vesselId, setVesselId] = useState('');
  const [lighterId, setLighterId] = useState('');
  const [staff, setStaff] = useState('');
  const [shift, setShift] = useState('');
  const [status, setStatus] = useState(FILTERS.some((f) => f[0] === initialFilter) ? initialFilter : 'all');
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState(null);
  const reqRef = useRef(0);

  const load = useCallback(async (cursor) => {
    const id = ++reqRef.current;
    setLoading(true);
    const ent = base44.entities[kind === 'loading' ? 'TruckEntry' : 'EmptyWeight'];
    if (!scope) { setItems([]); setTotal(null); setNext(null); setLoading(false); return; }
    const q = andQuery(kind === 'loading' ? scope.trucks : scope.empty, buildQuery(kind, { search, date, status, ghat, vesselId, lighterId, staff, shift }));
    try {
      const [page, count] = await Promise.all([ent.filter(q, { sort: '-created_date', limit: 30, cursor }), cursor ? Promise.resolve(null) : ent.count(q)]);
      if (id !== reqRef.current) return;
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setNext(page.has_more ? page.next_cursor : null);
      if (count !== null) setTotal(count);
      setNote((prev) => prev?.kind === 'error' ? null : prev);
    } catch (error) {
      if (id === reqRef.current) setNote({ kind: 'error', text: 'এন্ট্রি তালিকা লোড হয়নি; আগের ডেটা ও লগইন অক্ষত আছে। আবার চেষ্টা করুন।' });
    } finally { if (id === reqRef.current) setLoading(false); }
  }, [scope, kind, search, date, status, ghat, vesselId, lighterId, staff, shift]);

  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
  }, [load]);

  // Reset kind-specific filters that don't apply to empty weights.
  useEffect(() => {
    if (kind !== 'loading') { setVesselId(''); setLighterId(''); setShift(''); }
  }, [kind]);

  const handleDelete = async (item) => {
    const label = kind === 'loading' ? 'লোড এন্ট্রি' : 'খালি ওজন';
    try {
      if (isAdminRole(currentUser)) {
        if (!confirm(`${item.truckNumber} (${label}) মুছে ফেলতে চান?`)) return;
        await deleteRecord(kind, item.id, currentUser);
        setNote({ kind: 'success', text: 'রেকর্ড মুছে ফেলা হয়েছে (অডিট লগে সংরক্ষিত)।' });
      } else {
        if (!confirm(`${item.truckNumber} মুছে ফেলার অনুরোধ সুপার অ্যাডমিনের কাছে পাঠাবেন?`)) return;
        await assertNotLocked(kind, item);
        await createApproval(currentUser, { type: 'RECORD_DELETE', targetId: item.id, targetDescription: `${label}: ${item.truckNumber}`, payload: { kind } });
        setNote({ kind: 'info', text: 'ডিলিট অনুরোধ অনুমোদনের জন্য পাঠানো হয়েছে।' });
      }
    } catch (e) {
      setNote({ kind: 'error', text: e.message || 'কাজ ব্যর্থ।' });
    }
    load();
    onChanged();
  };

  const editDone = (n) => { setEditing(null); setNote(n); load(); onChanged(); };
  const hasFilters = !!(search || date || ghat || vesselId || lighterId || staff || shift || status !== 'all');
  const clearFilters = () => { setSearch(''); setDate(''); setGhat(''); setVesselId(''); setLighterId(''); setStaff(''); setShift(''); setStatus('all'); };

  return (
    <PageShell>
      <PageHeader icon={FileSpreadsheet} title="সকল এন্ট্রি" sub={total === null ? 'কোম্পানির ডেটা যাচাই হচ্ছে; অনির্ধারিত রেকর্ড Admin Review-তে দেখুন।' : `মোট ${total}টি · ${kind === 'loading' ? 'লোড এন্ট্রি' : 'খালি ওজন'}`} />
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
        {[['loading', 'লোড এন্ট্রি'], ['empty', 'খালি ওজন']].map(([id, label]) => (
          <button key={id} onClick={() => setKind(id)} className={`py-2 rounded-lg ${kind === id ? 'bg-white text-teal-800 shadow-sm font-black' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ট্রাক নম্বর খুঁজুন..." className={`${inputCls} pl-9`} />
        </div>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (status === 'today') setStatus('all'); }} className={inputCls} />
        <select value={ghat} onChange={(e) => setGhat(e.target.value)} className={inputCls}>
          <option value="">সব ঘাট</option>
          {ghats.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
        </select>
        {kind === 'loading' && (
          <>
            <select value={vesselId} onChange={(e) => setVesselId(e.target.value)} className={inputCls}>
              <option value="">সব মাদার ভেসেল</option>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select value={lighterId} onChange={(e) => setLighterId(e.target.value)} className={inputCls}>
              <option value="">সব লাইটার</option>
              {lighters.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={shift} onChange={(e) => setShift(e.target.value)} className={inputCls}>
              <option value="">সব শিফট</option>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </>
        )}
        <input value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="স্টাফ/সুপারভাইজার" className={inputCls} />
        {hasFilters && <button onClick={clearFilters} className={`${ghostBtn} col-span-2 sm:col-span-1`}><X className="h-4 w-4" /> ফিল্টার মুছুন</button>}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => setStatus(id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${status === id ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200'}`}>{label}</button>
        ))}
      </div>

      {note && <Notice kind={note.kind}>{note.text}</Notice>}
      {note?.kind === 'error' && <button type="button" onClick={() => load()} className={ghostBtn}>আবার চেষ্টা করুন</button>}
      {!loading && scope && note?.kind !== 'error' && items.length === 0 && <Empty text="কোনো রেকর্ড পাওয়া যায়নি।" />}
      <div className="space-y-2">
        {items.map((item) => <EntryRow key={item.id} kind={kind} item={item} vessels={vessels} lighters={lighters} onDelete={handleDelete} onEdit={setEditing} onOpen={setDetail} />)}
      </div>
      {detail && <EntryDetail kind={kind} item={detail} vessels={vessels} lighters={lighters} onClose={() => setDetail(null)} />}
      {editing && <EditRecordModal kind={kind} item={editing} ghats={ghats} currentUser={currentUser} onClose={() => setEditing(null)} onDone={editDone} />}
      {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
      {next && !loading && <button onClick={() => load(next)} className={`${ghostBtn} w-full`}>আরও দেখুন</button>}
    </PageShell>
  );
}