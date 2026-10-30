import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ClipboardList, Loader2, MessageCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { PageShell, PageHeader, Card, Field, Select, Notice, Empty, inputCls, ghostBtn } from './formParts';
import { toast } from '@/components/ui/use-toast';

const num = (n) => Number(n) || 0;
const fN = (n) => num(n).toLocaleString('en-IN');
const fMt = (kg) => (num(kg) / 1000).toFixed(3);

export default function StaffDailySummary({ currentUser, vessels = [], lighters = [] }) {
  const [date, setDate] = useState(api.todayStr());
  const [staff, setStaff] = useState(currentUser?.name || '');
  const [staffList, setStaffList] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const vName = (id) => (vessels.find((v) => v.id === id) || {}).name || '—';
  const lName = (id) => (lighters.find((l) => l.id === id) || {}).name || '—';

  const reload = useCallback(async () => {
    setLoading(true); setError(''); setRows([]);
    try {
      const q = { date };
      if (staff) q.enteredBy = staff;
      const page = await base44.entities.TruckEntry.filter(q, { sort: 'shift', limit: 2000 });
      setRows(page.items || []);
      const agg = await base44.entities.TruckEntry.aggregate({ query: { date }, groupBy: 'enteredBy', limit: 100 });
      setStaffList((agg.rows || []).map((r) => r.enteredBy).filter(Boolean));
    } catch (e) { setError(e.message || 'ডাটা আনা যায়নি।'); }
    finally { setLoading(false); }
  }, [date, staff]);

  useEffect(() => { reload(); }, [reload]);
  // Live: নতুন এন্ট্রি save হলে সাথে সাথে সামারি আপডেট হবে।
  useEffect(() => {
    const unsub = base44.entities.TruckEntry.subscribe((ev) => {
      if (ev.type === 'create' || ev.type === 'update') reload();
    });
    return unsub;
  }, [reload]);

  const tree = useMemo(() => {
    const root = new Map();
    const tot = { vessels: new Set(), lighters: new Set(), trucks: 0, bags: 0, net: 0 };
    const node = (map, key, label) => {
      if (!map.has(key)) map.set(key, { key, label, trucks: [], kids: new Map(), bags: 0, net: 0, count: 0 });
      return map.get(key);
    };
    for (const r of rows) {
      const shift = r.shift || 'Day';
      const ghat = (r.ghatName || '—').toUpperCase();
      const s = node(root, shift, shift);
      const g = node(s.kids, ghat, ghat);
      const v = node(g.kids, r.motherVesselId || '~', vName(r.motherVesselId));
      const l = node(v.kids, r.lighterVesselId || '~', lName(r.lighterVesselId));
      l.trucks.push({ truck: r.truckNumber, bags: num(r.bags), net: num(r.net), time: r.time || '' });
      [s, g, v, l].forEach((n) => { n.bags += num(r.bags); n.net += num(r.net); n.count += 1; });
      tot.vessels.add(r.motherVesselId); tot.lighters.add(r.lighterVesselId);
      tot.trucks += 1; tot.bags += num(r.bags); tot.net += num(r.net);
    }
    const finish = (map) => [...map.values()].map((n) => ({ ...n, kids: finish(n.kids) }));
    return { tree: finish(root), tot: { vessels: tot.vessels.size, lighters: tot.lighters.size, trucks: tot.trucks, bags: tot.bags, net: tot.net } };
  }, [rows, vessels, lighters]);

  const copyText = () => {
    if (!tree.tree.length) return;
    const lines = [`*${date}*`];
    for (const s of tree.tree) {
      lines.push('', `*${s.label.toUpperCase()} SHIFT*`);
      for (const g of s.kids) {
        lines.push(`*GHAT: ${g.label}*`);
        for (const v of g.kids) {
          lines.push('', v.label);
          for (const l of v.kids) {
            lines.push(l.label);
            for (const t of l.trucks) lines.push(`Truck: ${t.truck} — ${fN(t.bags)} Bag — ${fMt(t.net)} MT`);
            lines.push(`Lighter Total: ${l.trucks.length} Truck | ${fN(l.bags)} Bag | ${fMt(l.net)} MT`);
          }
        }
        lines.push(`GHAT Total: ${g.count} Truck | ${fN(g.bags)} Bag | ${fMt(g.net)} MT`);
      }
    }
    lines.push('', `*দিনের মোট:* ${tree.tot.trucks} Truck | ${fN(tree.tot.bags)} Bag | ${fMt(tree.tot.net)} MT`);
    lines.push(`মাদার ভেসেল: ${tree.tot.vessels} · লাইটার: ${tree.tot.lighters}`);
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => toast({ title: 'WhatsApp টেক্সট কপি হয়েছে' })).catch(() => {});
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <PageShell>
      <PageHeader icon={ClipboardList} title="স্টাফ ডেইলি এন্ট্রি সামারি" sub="তারিখ → শিফট → ঘাট → মাদার ভেসেল → লাইটার → ট্রাক — এন্ট্রি সেভ হলে সাথে সাথে আপডেট"
        right={tree.tree.length > 0 && <button onClick={copyText} className={ghostBtn}><MessageCircle className="h-4 w-4" /> WhatsApp কপি</button>} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="তারিখ"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="স্টাফ (ঐচ্ছিক)">
          <Select value={staff} onChange={setStaff} options={staffList.map((s) => ({ value: s, label: s }))} placeholder="সব স্টাফ" />
        </Field>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
      {!loading && !error && tree.tree.length === 0 && <Empty text="এই তারিখে কোনো এন্ট্রি নেই।" />}
      {tree.tree.length > 0 && (
        <>
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                ['মাদার ভেসেল', tree.tot.vessels], ['লাইটার', tree.tot.lighters], ['ট্রাক', tree.tot.trucks], ['মোট ব্যাগ', fN(tree.tot.bags)], ['মোট নেট (MT)', fMt(tree.tot.net)],
              ].map(([l, v]) => (
                <div key={l} className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-center">
                  <div className="text-[9px] font-bold text-slate-500">{l}</div>
                  <div className="text-sm font-black font-mono text-slate-800">{v}</div>
                </div>
              ))}
            </div>
          </Card>
          <div className="space-y-3">
            {tree.tree.map((s, i) => <ShiftNode key={s.key} node={s} defaultOpen={i === 0} />)}
          </div>
        </>
      )}
    </PageShell>
  );
}

function ShiftNode({ node, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 text-left">
        <Icon className="h-4 w-4 text-slate-400 shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 shrink-0">শিফট</span>
        <span className="font-black text-sm text-slate-800">{node.label}</span>
        <span className="ml-auto text-[11px] font-bold text-slate-500 shrink-0">{node.count} ট্রাক · {fMt(node.net)} MT</span>
      </button>
      {open && (
        <div className="mt-2 pl-2 sm:pl-3 border-l-2 border-teal-100 space-y-2">
          {node.kids.map((g) => (
            <div key={g.key} className="pl-2 border-l-2 border-slate-200">
              <div className="flex items-center gap-2 py-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">ঘাট</span>
                <span className="font-black text-sm text-slate-800">{g.label}</span>
                <span className="ml-auto text-[11px] font-bold text-slate-500">{g.count} ট্রাক · {fN(g.bags)} ব্যাগ · {fMt(g.net)} MT</span>
              </div>
              <div className="pl-2 space-y-1">
                {g.kids.map((v) => (
                  <div key={v.key} className="pl-2 border-l-2 border-slate-100">
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] font-bold uppercase text-slate-400">ভেসেল</span>
                      <span className="font-bold text-xs text-slate-700">{v.label}</span>
                    </div>
                    <div className="pl-2 space-y-1">
                      {v.kids.map((l) => (
                        <div key={l.key} className="pl-2 border-l-2 border-teal-50">
                          <div className="flex items-center gap-2 py-0.5">
                            <span className="text-[10px] font-bold uppercase text-slate-400">লাইটার</span>
                            <span className="font-bold text-xs text-slate-700">{l.label}</span>
                            <span className="ml-auto text-[10px] font-bold text-slate-500">{l.trucks.length} ট্রাক · {fN(l.bags)} ব্যাগ · {fMt(l.net)} MT</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px] my-1">
                              <thead><tr className="text-slate-400 text-[9px] uppercase"><th className="text-left py-0.5">ট্রাক</th><th className="text-left">সময়</th><th className="text-right">ব্যাগ</th><th className="text-right">নেট (MT)</th></tr></thead>
                              <tbody>
                                {l.trucks.map((t, idx) => (
                                  <tr key={idx} className="border-t border-slate-100">
                                    <td className="py-0.5 font-mono font-bold text-slate-800">{t.truck}</td>
                                    <td className="text-slate-500">{t.time}</td>
                                    <td className="text-right font-mono">{fN(t.bags)}</td>
                                    <td className="text-right font-mono font-bold">{fMt(t.net)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}