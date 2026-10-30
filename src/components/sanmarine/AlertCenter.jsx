import React, { useState, useEffect, useMemo } from 'react';
import { ShieldAlert, Search, X, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { canHandleAlerts } from '@/lib/erpRoles';
import { logAudit } from '@/lib/sanmarineWorkflow';
import { normalizeTruckNumber } from '@/utils/truckUtils';
import { ALERT_TYPE_LABEL, PRIORITY_LABEL } from '@/lib/sanmarineInvestigation';
import { FLAG_META } from '@/lib/sanmarineRules';
import { parsePhotos } from '@/lib/sanmarinePhotos';
import AlertCard from './AlertCard';
import GhatAlertGroup from './GhatAlertGroup';
import { Layers, List } from 'lucide-react';
import AlertInvestigation from './AlertInvestigation';
import { PageShell, PageHeader, Empty, ghostBtn, inputCls } from './formParts';

const TABS = [['OPEN', 'ওপেন'], ['INVESTIGATING', 'তদন্তাধীন'], ['RESOLVED', 'সমাধান'], ['ALL', 'সব']];
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasPhoto = (v) => parsePhotos(v).length > 0;

// Which trip an alert belongs to (vessel/lighter/staff), and whether that trip's documents are actually
// attached. Loaded in one batch — three queries for the whole list, never one query per alert.
function useAlertEvidence(alerts) {
  const [map, setMap] = useState({});
  useEffect(() => {
    const idsOf = (key) => [...new Set(alerts.map((a) => a[key]).filter(Boolean))];
    const loadIds = idsOf('relatedLoadingId');
    const emptyIds = idsOf('relatedEmptyId');
    const docIds = idsOf('relatedDailyDocumentId');
    if (!loadIds.length && !emptyIds.length && !docIds.length) { setMap({}); return undefined; }
    let dead = false;
    (async () => {
      const [loads, empties, docs] = await Promise.all([
        loadIds.length ? base44.entities.TruckEntry.filter({ id: { $in: loadIds } }, { limit: 200 }) : { items: [] },
        emptyIds.length ? base44.entities.EmptyWeight.filter({ id: { $in: emptyIds } }, { limit: 200 }) : { items: [] },
        docIds.length ? base44.entities.LighterDailyDocument.filter({ id: { $in: docIds } }, { limit: 100 }) : { items: [] },
      ]);
      if (dead) return;
      const L = new Map((loads.items || []).map((r) => [r.id, r]));
      const M = new Map((empties.items || []).map((r) => [r.id, r]));
      const D = new Map((docs.items || []).map((r) => [r.id, r]));
      const next = {};
      alerts.forEach((a) => {
        const load = L.get(a.relatedLoadingId);
        const empty = M.get(a.relatedEmptyId) || (load && load.emptyWeightId ? M.get(load.emptyWeightId) : null);
        const doc = D.get(a.relatedDailyDocumentId);
        const list = [];
        if (load) {
          list.push({ label: 'লোড স্লিপ', ok: hasPhoto(load.scalePhoto), required: true });
          list.push({ label: 'লোড মনিটর ছবি', ok: hasPhoto(load.monitorPhoto), required: true });
        }
        if (empty) {
          list.push({ label: 'খালি স্লিপ', ok: hasPhoto(empty.tallyOriginalPhoto), required: true });
          list.push({ label: 'খালি মনিটর ছবি', ok: hasPhoto(empty.monitorPhoto), required: true });
          list.push({ label: 'খালি গাড়ির ভিডিও', ok: !!empty.emptyTruckVideo, required: false });
        }
        if (doc) {
          list.push({ label: 'ওয়েইমেন্ট শিট', ok: hasPhoto(doc.weighmentSheetPhoto), required: true });
          list.push({ label: 'পয়েন্ট খাতা', ok: hasPhoto(doc.pointKhataPhoto), required: true });
        }
        next[a.id] = {
          vesselId: (load && load.motherVesselId) || a.motherVesselId || '',
          lighterId: (load && load.lighterVesselId) || a.lighterVesselId || '',
          staff: (load && load.enteredBy) || (empty ? empty.enteredByName : '') || '',
          docs: list,
        };
      });
      setMap(next);
    })().catch(() => { if (!dead) setMap({}); });
    return () => { dead = true; };
  }, [alerts.map((a) => a.id).join(',')]);
  return map;
}

export default function AlertCenter({ alerts, currentUser, vessels, lighters, onRefresh }) {
  const [tab, setTab] = useState('OPEN');
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [ghat, setGhat] = useState('');
  const [vesselId, setVesselId] = useState('');
  const [lighterId, setLighterId] = useState('');
  const [staff, setStaff] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [openAlert, setOpenAlert] = useState(null);
  const [groupByGhat, setGroupByGhat] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const canHandle = canHandleAlerts(currentUser);

  const evidence = useAlertEvidence(alerts);

  const filtered = useMemo(() => {
    const normSearch = normalizeTruckNumber(search) || search.trim().toUpperCase();
    return [...alerts]
      .sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''))
      .filter((a) => {
        if (tab !== 'ALL' && a.status !== tab) return false;
        if (date && !(a.createdTime || '').startsWith(date)) return false;
        if (ghat && (a.ghat || '').toUpperCase() !== ghat.toUpperCase()) return false;
        if (normSearch) {
          // A digit search matches the truck number; a word search matches the truck number or the problem
          // itself ("গড়মিল", "ভিডিও"), so an alert can be found by what it is about.
          const digits = normSearch.replace(/\D/g, '');
          const tn = (a.normalizedTruckNumber || normalizeTruckNumber(a.truckNumber || '')).toUpperCase();
          const byNumber = digits.length >= 3 && tn.includes(digits);
          const text = normSearch.toUpperCase();
          const byText = (a.truckNumber || '').toUpperCase().includes(text) || (a.title || '').toUpperCase().includes(text);
          if (!byNumber && !byText) return false;
        }
        if (type && a.category !== type) return false;
        if (priority && a.severity !== priority) return false;
        if (staff) {
          const e = evidence[a.id] || {};
          const byName = (a.enteredByName || '') + (e.staff || '');
          if (!byName.toLowerCase().includes(staff.toLowerCase())) return false;
        }
        if (vesselId || lighterId) {
          const e = evidence[a.id] || {};
          if (vesselId && e.vesselId !== vesselId) return false;
          if (lighterId && e.lighterId !== lighterId) return false;
        }
        return true;
      });
  }, [alerts, tab, date, ghat, search, type, priority, staff, vesselId, lighterId, evidence]);

  const countOf = (s) => alerts.filter((a) => a.status === s).length;
  const hasFilters = !!(search || date || ghat || vesselId || lighterId || staff || type || priority);
  const clearFilters = () => { setSearch(''); setDate(''); setGhat(''); setVesselId(''); setLighterId(''); setStaff(''); setType(''); setPriority(''); };

  const change = async (alert, data) => {
    await api.updateAlert(alert.id, data);
    await logAudit(currentUser, `ALERT_${data.status}`, 'Alert', alert.id, alert.title);
    await onRefresh();
  };

  const groups = useMemo(() => {
    const order = [...new Set(filtered.map((a) => a.ghat).filter(Boolean))].sort();
    const buckets = new Map();
    filtered.forEach((a) => {
      const key = a.ghat || '';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(a);
    });
    const known = order.map((g) => ({ key: g, name: g, items: buckets.get(g) || [] }));
    const unknown = buckets.has('') ? [{ key: '', name: 'অনির্দিষ্ট ঘাট', items: buckets.get('') }] : [];
    return [...known, ...unknown];
  }, [filtered]);

  const typeOptions = useMemo(() => {
    const cats = [...new Set(alerts.map((a) => a.category).filter(Boolean))];
    return cats.map((c) => ({ value: c, label: ALERT_TYPE_LABEL[c] || FLAG_META[c]?.label || c }));
  }, [alerts]);

  return (
    <PageShell>
      <PageHeader icon={ShieldAlert} title="অ্যালার্ট সেন্টার" sub={`${countOf('OPEN')}টি ওপেন · ${filtered.length}টি দেখানো হচ্ছে`} />

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setLimit(50); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${tab === id ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200'}`}>
            {label}{id !== 'ALL' ? ` (${countOf(id)})` : ''}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ট্রাক নম্বর..." className={`${inputCls} pl-9`} />
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        <select value={ghat} onChange={(e) => setGhat(e.target.value)} className={inputCls}>
          <option value="">সব ঘাট</option>
          {[...new Set(alerts.map((a) => a.ghat).filter(Boolean))].sort().map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={vesselId} onChange={(e) => setVesselId(e.target.value)} className={inputCls}>
          <option value="">সব ভেসেল</option>
          {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={lighterId} onChange={(e) => setLighterId(e.target.value)} className={inputCls}>
          <option value="">সব লাইটার</option>
          {lighters.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="স্টাফ/সুপারভাইজার" className={inputCls} />
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
          <option value="">সব টাইপ</option>
          {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
          <option value="">সব প্রায়োরিটি</option>
          {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {hasFilters && <button onClick={clearFilters} className={`${ghostBtn} col-span-2 sm:col-span-1`}><X className="h-4 w-4" /> ফিল্টার মুছুন</button>}
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <button onClick={() => setGroupByGhat((v) => !v)} className={`${ghostBtn} !text-[11px]`} title="ঘাট অনুযায়ী / তালিকা">
          {groupByGhat ? <List className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
          {groupByGhat ? 'তালিকায় দেখুন' : 'ঘাট অনুযায়ী দেখুন'}
        </button>
      </div>

      {!canHandle && <div className="text-[11px] text-slate-500 font-semibold">অ্যালার্ট ম্যানেজ করতে সুপারভাইজার বা তার উপরের রোল প্রয়োজন — তবে সব অ্যালার্ট দেখা যাবে।</div>}
      {filtered.length === 0 && <Empty text="কোনো অ্যালার্ট পাওয়া যায়নি।" />}

      {groupByGhat && filtered.length > 0 ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <GhatAlertGroup
              key={g.key || '__unknown'}
              name={g.name}
              items={g.items}
              canHandle={canHandle}
              onChange={change}
              onOpen={setOpenAlert}
              collapsed={collapsed[g.key]}
              onToggle={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
              evidence={evidence}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, limit).map((a) => <AlertCard key={a.id} alert={a} docs={evidence[a.id] && evidence[a.id].docs} canHandle={canHandle} onChange={change} onOpen={setOpenAlert} />)}
        </div>
      )}
      {!groupByGhat && filtered.length > limit && <button onClick={() => setLimit((l) => l + 50)} className={`${ghostBtn} w-full`}>আরও দেখুন</button>}

      {openAlert && <AlertInvestigation alert={openAlert} currentUser={currentUser} onClose={() => setOpenAlert(null)} onChange={change} />}
    </PageShell>
  );
}