import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, MapPin, Truck, Package, TrendingUp, ChevronRight, Clock, Loader2, ShieldCheck,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { andQuery } from '@/components/sanmarine/company/companyScope';

const fN = (n) => Number(n || 0).toLocaleString('en-IN');
const fMT = (kg) => (kg > 0 ? (kg / 1000).toFixed(3) : '0.000');

export default function SupervisorSummary({ company, scope, stats, approvals = [], todayEntries = [], dateRows = [], lighters = [], onNavigate }) {
  const s = stats || {};
  const sums = s.sums || {};
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const lighterName = (id) => (lighters.find((l) => l.id === id) || {}).name || '—';

  // Date pills: today first, then last 7 days from aggregate, deduped
  const datePills = useMemo(() => {
    const today = api.todayStr();
    const dates = [today, ...(dateRows || []).slice(-7).map((r) => r.date).reverse()];
    const seen = new Set();
    return dates
      .filter((d) => { if (seen.has(d)) return false; seen.add(d); return true; })
      .map((d) => ({ date: d, count: (dateRows || []).find((r) => r.date === d)?.count || (d === today ? s.todayLoads || 0 : 0) }));
  }, [dateRows, todayEntries]);

  const [selectedDate, setSelectedDate] = useState(api.todayStr());
  const [dateGroups, setDateGroups] = useState([]);
  const [dateError, setDateError] = useState('');
  const [loadingDate, setLoadingDate] = useState(false);
  useEffect(() => {
    let cancelled = false; setDateGroups([]); setDateError(''); setLoadingDate(true);
    base44.entities.TruckEntry.aggregate({ query: andQuery(scope.trucks, { date: selectedDate }), groupBy: ['ghatName', 'lighterVesselId'], sum: ['bags', 'net'], limit: 1000 })
      .then((p) => { if (p.truncated) throw new Error('অসম্পূর্ণ grouping; বিস্তারিত Report-এ ছোট date range ব্যবহার করুন।'); if (!cancelled) { setDateGroups(p.rows); setLoadingDate(false); } })
      .catch((e) => { if (!cancelled) { setDateError(e.message || 'সারাংশ পড়া যায়নি।'); setLoadingDate(false); } });
    return () => { cancelled = true; };
  }, [selectedDate, company, scope, todayEntries]);

  const ghatBreakdown = useMemo(() => {
    const entries = dateGroups;
    const m = new Map();
    for (const r of entries) {
      const g = (r.ghatName || '—').toUpperCase();
      if (!m.has(g)) m.set(g, { ghat: g, trucks: 0, bags: 0, net: 0, lighters: new Map() });
      const d = m.get(g);
      d.trucks += r.count; d.bags += Number(r.sum_bags) || 0; d.net += Number(r.sum_net) || 0;
      const lid = r.lighterVesselId || '~';
      if (!d.lighters.has(lid)) d.lighters.set(lid, { lighterId: lid, trucks: 0, bags: 0, net: 0 });
      const l = d.lighters.get(lid);
      l.trucks += r.count; l.bags += Number(r.sum_bags) || 0; l.net += Number(r.sum_net) || 0;
    }
    return [...m.values()].map((d) => ({
      ...d, lighterCount: d.lighters.size,
      lighters: [...d.lighters.values()].sort((a, b) => b.trucks - a.trucks),
    })).sort((a, b) => b.trucks - a.trucks);
  }, [dateGroups]);

  const dateStats = useMemo(() => {
    return {
      trucks: dateGroups.reduce((sum, r) => sum + r.count, 0),
      bags: dateGroups.reduce((sum, r) => sum + (Number(r.sum_bags) || 0), 0),
      net: dateGroups.reduce((sum, r) => sum + (Number(r.sum_net) || 0), 0),
    };
  }, [dateGroups]);

  const [expandedGhat, setExpandedGhat] = useState(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <ShieldCheck className="h-4 w-4 text-indigo-600" />
        <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">সুপারভাইজার সারসংক্ষেপ (লাইভ)</h2>
      </div>

      {/* Today's quick stats + Pending approvals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-wider">আজকের সারাংশ</span>
            <span className="ml-auto text-[10px] font-bold bg-teal-800/50 px-2 py-0.5 rounded-full">{api.todayStr()}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <Truck className="h-4 w-4 mx-auto mb-1 opacity-80" />
              <div className="text-xl font-black font-mono">{s.todayLoads || 0}</div>
              <div className="text-[10px] opacity-80 font-bold">ট্রাক</div>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <Package className="h-4 w-4 mx-auto mb-1 opacity-80" />
              <div className="text-xl font-black font-mono">{fN(sums.todayBags || 0)}</div>
              <div className="text-[10px] opacity-80 font-bold">ব্যাগ</div>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <TrendingUp className="h-4 w-4 mx-auto mb-1 opacity-80" />
              <div className="text-xl font-black font-mono">{fMT(sums.todayNet || 0)}</div>
              <div className="text-[10px] opacity-80 font-bold">নেট MT</div>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl p-4 shadow-lg ${pendingApprovals.length > 0 ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white' : 'bg-white border border-slate-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-wider">পেন্ডিং অনুমোদন</span>
            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${pendingApprovals.length > 0 ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{pendingApprovals.length}টি</span>
          </div>
          {pendingApprovals.length === 0 ? (
            <div className={`text-center py-3 text-xs font-bold ${pendingApprovals.length > 0 ? 'text-white/70' : 'text-slate-400'}`}>সব অনুমোদন সম্পন্ন</div>
          ) : (
            <div className="space-y-1.5">
              {pendingApprovals.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                  <span className="font-bold truncate">{a.targetDescription || a.type}</span>
                </div>
              ))}
              {pendingApprovals.length > 3 && <div className="text-[10px] opacity-70 font-bold">আরও {pendingApprovals.length - 3}টি...</div>}
              <button onClick={() => onNavigate('approvals')} className="flex items-center gap-1 text-[11px] font-black mt-1 hover:underline">
                সব দেখুন <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Day-by-day ghat-by-ghat breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-teal-600" />
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">দিন ভিত্তিক ঘাট সামারি</h3>
        </div>

        {/* Date pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
          {datePills.map((p) => {
            const isActive = p.date === selectedDate;
            return (
              <button key={p.date} onClick={() => setSelectedDate(p.date)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                <div className="text-[10px] font-semibold opacity-80">{p.date.slice(5)}</div>
                <div className="font-mono">{p.count} ট্রাক</div>
              </button>
            );
          })}
        </div>

        {dateError && <p role="alert" className="mb-3 text-xs text-destructive">{dateError}</p>}
        {/* Selected date stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <div className="text-lg font-black font-mono text-slate-800">{dateStats.trucks}</div>
            <div className="text-[10px] text-slate-500 font-bold">ট্রাক</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <div className="text-lg font-black font-mono text-slate-800">{fN(dateStats.bags)}</div>
            <div className="text-[10px] text-slate-500 font-bold">ব্যাগ</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <div className="text-lg font-black font-mono text-slate-800">{fMT(dateStats.net)}</div>
            <div className="text-[10px] text-slate-500 font-bold">নেট MT</div>
          </div>
        </div>

        {/* Ghat breakdown */}
        {loadingDate ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>
        ) : ghatBreakdown.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-400 font-bold">এই দিনে কোনো এন্ট্রি নেই</div>
        ) : (
          <div className="space-y-2">
            {ghatBreakdown.map((g) => (
              <div key={g.ghat} className="rounded-xl border border-slate-200 overflow-hidden">
                <button onClick={() => setExpandedGhat(expandedGhat === g.ghat ? null : g.ghat)}
                  className="w-full flex items-center gap-2 p-3 bg-gradient-to-r from-slate-50 to-white hover:from-teal-50 hover:to-white transition-all">
                  <MapPin className="h-4 w-4 text-teal-600 shrink-0" />
                  <span className="font-black text-sm text-slate-800">{g.ghat}</span>
                  <span className="text-[10px] text-slate-500 font-bold">{g.lighterCount} লাইটার</span>
                  <div className="ml-auto flex items-center gap-3 text-xs">
                    <span className="font-mono font-black text-slate-700">{g.trucks} ট্রাক</span>
                    <span className="font-mono font-bold text-amber-600">{fN(g.bags)}</span>
                    <span className="font-mono font-bold text-teal-600">{fMT(g.net)}</span>
                    <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${expandedGhat === g.ghat ? 'rotate-90' : ''}`} />
                  </div>
                </button>
                {expandedGhat === g.ghat && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-2 space-y-1">
                    {g.lighters.map((l) => (
                      <div key={l.lighterId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white text-xs">
                        <span className="font-bold text-slate-700 truncate">{l.lighterId === '~' ? '—' : lighterName(l.lighterId)}</span>
                        <div className="ml-auto flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-600">{l.trucks} ট্রাক</span>
                          <span className="font-mono font-bold text-amber-600">{fN(l.bags)}</span>
                          <span className="font-mono font-bold text-teal-600">{fMT(l.net)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}