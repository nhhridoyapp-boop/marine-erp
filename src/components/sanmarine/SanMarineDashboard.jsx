import React from 'react';
import {
  Truck, Package, Scale, Layers, Ship, CheckCircle2, AlertTriangle, AlertCircle, Clock,
  Plus, ShieldAlert, Anchor, TrendingUp, FileCheck, Video,
} from 'lucide-react';
import DashboardCharts from './DashboardCharts';
import SupervisorSummary from './SupervisorSummary';

export default function SanMarineDashboard({ company, stats, vessels, lighters = [], alerts = [], approvals = [], todayEntries = [], currentUser, onNavigate }) {
  // Every number comes from the server (counts / one aggregate) — never from loading all records.
  const s = stats || {};
  const sums = s.sums || {};
  const todayTrucksCount = s.todayLoads || 0;
  const todayBags = sums.todayBags || 0;
  const todayNetKg = sums.todayNet || 0;
  const totalEntriesCount = s.totalLoads || 0;
  const totalEmptyCount = s.totalEmpty || 0;
  const totalBagsAll = sums.bags || 0;
  const totalNetKgAll = sums.net || 0;

  const fN = (n) => (isNaN(n) ? '0' : Number(n).toLocaleString('en-IN'));
  const fMT = (kg) => (kg > 0 ? (kg / 1000).toFixed(3) : '0.000');

  const todayEmptyCount = s.todayEmpty || 0;
  const okMatched = s.okMatched || 0;
  const pendingEmpty = s.pendingEmpty || 0;
  const noEmpty = s.noEmpty || 0;
  const missingDocsCount = s.missingDocs || 0;
  const missingVideoCount = s.missingVideo || 0;

  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status !== 'RESOLVED');
  const highAlerts = alerts.filter(a => (a.severity === 'high' || a.severity === 'warning') && a.status !== 'RESOLVED');
  const pendingApprovals = approvals.filter(a => a.status === 'pending');

  const activeVessels = vessels.filter(v => v.status === 'Active');
  const activeLighters = lighters.filter(l => l.status === 'Active');

  const Kpi = ({ n, label, sub, value, color, onClick, icon: Icon }) => (
    <div onClick={onClick} className={`p-3 bg-white border border-slate-200 hover:border-slate-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all ${color || ''}`}>
      <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
        <span>{n}. {label}</span>{Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}
      </div>
      <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-1">{value}</div>
      <span className="text-[10px] text-slate-400">{sub}</span>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-3.5 sm:p-6 space-y-6 pb-28">
      {/* Quick Launchpad */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button onClick={() => onNavigate('entry', { mode: 'empty' })}
          className="p-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-between shadow transition-all active:scale-95 group">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-600/50"><Scale className="h-4 w-4" /></div>
            <div className="text-left"><span className="block text-[10px] text-amber-100 uppercase font-semibold">১ম ধাপ</span><span className="text-xs sm:text-sm font-black">খালি গাড়ী ওজন</span></div>
          </div>
          <Plus className="h-4 w-4 opacity-75 group-hover:opacity-100" />
        </button>
        <button onClick={() => onNavigate('entry', { mode: 'loading' })}
          className="p-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-between shadow transition-all active:scale-95 group">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-700/50"><Truck className="h-4 w-4" /></div>
            <div className="text-left"><span className="block text-[10px] text-teal-100 uppercase font-semibold">২য় ধাপ</span><span className="text-xs sm:text-sm font-black">লোড গাড়ী ওজন</span></div>
          </div>
          <Plus className="h-4 w-4 opacity-75 group-hover:opacity-100" />
        </button>
        <button onClick={() => onNavigate('pending')}
          className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-between shadow transition-all active:scale-95">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-slate-800"><Clock className="h-4 w-4 text-amber-400" /></div>
            <div className="text-left"><span className="block text-[10px] text-slate-400 uppercase font-semibold">কার্যক্রম</span><span className="text-xs sm:text-sm font-black">পেন্ডিং সেন্টার</span></div>
          </div>
          {pendingEmpty > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-mono font-black text-[11px]">{pendingEmpty}</span>}
        </button>
        <button onClick={() => onNavigate('alerts')}
          className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-between shadow transition-all active:scale-95">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-slate-800"><ShieldAlert className="h-4 w-4 text-rose-400" /></div>
            <div className="text-left"><span className="block text-[10px] text-slate-400 uppercase font-semibold">তদারকি</span><span className="text-xs sm:text-sm font-black">অ্যালার্ট সেন্টার</span></div>
          </div>
          {criticalAlerts.length > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-mono font-black text-[11px] animate-pulse">{s.criticalAlerts || 0}</span>}
        </button>
      </div>

      {/* 15 KPI Metrics */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2"><Layers className="h-4 w-4 text-purple-600" /><span>সমন্বিত মেকানিক্স বোর্ড (15 KPI METRICS)</span></h2>
          <span className="text-[11px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-md">সব কার্ড ক্লিকযোগ্য</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          <Kpi n="১" label="মোট লোড ট্রাক" sub="সর্বমোট লোড সম্পন্ন" value={fN(totalEntriesCount)} icon={Truck} onClick={() => onNavigate('entries')} />
          <div onClick={() => onNavigate('entries', { filterStatus: 'today' })} className="p-3 bg-teal-50/70 border border-teal-200 hover:border-teal-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-teal-800 text-[11px] font-bold"><span>২. আজকের ট্রাক</span><Truck className="h-3.5 w-3.5 text-teal-600" /></div>
            <div className="text-xl sm:text-2xl font-black font-mono text-teal-950 mt-1">{todayTrucksCount}</div><span className="text-[10px] text-teal-700">আজ লোড করা ট্রাক</span>
          </div>
          <div onClick={() => onNavigate('entries', { filterStatus: 'pending_empty' })} className="p-3 bg-amber-50/70 border border-amber-200 hover:border-amber-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-amber-800 text-[11px] font-bold"><span>৩. মোট খালি ওজন</span><Scale className="h-3.5 w-3.5 text-amber-600" /></div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-950 mt-1">{fN(totalEmptyCount)}</div><span className="text-[10px] text-amber-700">খালি গাড়ী রেকর্ড</span>
          </div>
          <Kpi n="৪" label="আজকের খালি ট্রাক" sub="আজ খালি ওজন" value={fN(todayEmptyCount)} icon={Scale} onClick={() => onNavigate('pending')} />
          <Kpi n="৫" label="মোট ব্যাগ" sub="সর্বমোট ব্যাগ" value={fN(totalBagsAll)} icon={Package} onClick={() => onNavigate('entries')} />
          <Kpi n="৬" label="মোট নেট (KG)" sub="সর্বমোট নেট ওজন" value={fN(totalNetKgAll)} icon={TrendingUp} onClick={() => onNavigate('entries')} />
          <Kpi n="৭" label="মোট নেট (MT)" sub="মেট্রিক টন" value={fMT(totalNetKgAll)} icon={TrendingUp} onClick={() => onNavigate('entries')} />
          <div onClick={() => onNavigate('entries', { filterStatus: 'matched' })} className="p-3 bg-emerald-50/70 border border-emerald-200 hover:border-emerald-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-emerald-800 text-[11px] font-bold"><span>৮. সব ওকে</span><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /></div>
            <div className="text-xl sm:text-2xl font-black font-mono text-emerald-950 mt-1">{okMatched}</div><span className="text-[10px] text-emerald-700">ম্যাচড ও সম্পূর্ণ</span>
          </div>
          <div onClick={() => onNavigate('pending')} className="p-3 bg-amber-50/70 border border-amber-200 hover:border-amber-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-amber-800 text-[11px] font-bold"><span>৯. পেন্ডিং খালি</span><Clock className="h-3.5 w-3.5 text-amber-600" /></div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-950 mt-1">{pendingEmpty}</div><span className="text-[10px] text-amber-700">খালি হয়েছে, লোড বাকি</span>
          </div>
          <div onClick={() => onNavigate('alerts')} className="p-3 bg-rose-50/70 border border-rose-200 hover:border-rose-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-rose-800 text-[11px] font-bold"><span>১০. খালি ওজন নেই</span><AlertCircle className="h-3.5 w-3.5 text-rose-600" /></div>
            <div className="text-xl sm:text-2xl font-black font-mono text-rose-950 mt-1">{noEmpty}</div><span className="text-[10px] text-rose-700">লোড হলেও খালি নেই</span>
          </div>
          <div onClick={() => onNavigate('alerts')} className="p-3 bg-orange-50/70 border border-orange-200 hover:border-orange-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-orange-800 text-[11px] font-bold"><span>১১. ডক মিসিং</span><FileCheck className="h-3.5 w-3.5 text-orange-600" /></div>
            <div className="text-xl sm:text-2xl font-black font-mono text-orange-950 mt-1">{missingDocsCount}</div><span className="text-[10px] text-orange-700">স্কেল ডকুমেন্ট নেই</span>
          </div>
          <div onClick={() => onNavigate('pending')} className="p-3 bg-amber-50/70 border border-amber-200 hover:border-amber-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-amber-800 text-[11px] font-bold"><span>১৬. ভিডিও মিসিং</span><Video className="h-3.5 w-3.5 text-amber-600" /></div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-950 mt-1">{missingVideoCount}</div><span className="text-[10px] text-amber-700">আজ খালি গাড়ির ভিডিও নেই</span>
          </div>
          <Kpi n="১২" label="সক্রিয় ভেসেল" sub="Active Mother Vessel" value={s.activeVessels || 0} icon={Ship} onClick={() => onNavigate('vessels')} />
          <Kpi n="১৩" label="সক্রিয় লাইটার" sub="Active Lighter" value={s.activeLighters || 0} icon={Anchor} onClick={() => onNavigate('lighters')} />
          <div onClick={() => onNavigate('alerts')} className="p-3 bg-rose-50/70 border border-rose-200 hover:border-rose-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-rose-800 text-[11px] font-bold"><span>১৪. ক্রিটিক্যাল</span><ShieldAlert className="h-3.5 w-3.5 text-rose-600" /></div>
            <div className="text-xl sm:text-2xl font-black font-mono text-rose-950 mt-1">{s.criticalAlerts || 0}</div><span className="text-[10px] text-rose-700">গুরুতর অ্যালার্ট</span>
          </div>
          <div onClick={() => onNavigate('alerts')} className="p-3 bg-amber-50/70 border border-amber-200 hover:border-amber-400 rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-amber-800 text-[11px] font-bold"><span>১৫. হাই/ওয়ার্নিং</span><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /></div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-950 mt-1">{s.highAlerts || 0}</div><span className="text-[10px] text-amber-700">মাঝারি অ্যালার্ট</span>
          </div>
        </div>
      </div>

      {/* Visual analytics charts */}
      <DashboardCharts stats={stats} />

      {/* Supervisor live summary: today's entries, pending approvals, day-by-day ghat-by-ghat */}
      <SupervisorSummary key={company} company={company} scope={stats.scope} stats={stats} approvals={approvals} todayEntries={todayEntries} dateRows={stats?.dateRows} lighters={lighters} onNavigate={onNavigate} />

      {/* Status summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />আজকের সারাংশ</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-teal-50"><div className="text-lg font-black text-teal-900 font-mono">{todayTrucksCount}</div><div className="text-[10px] text-teal-700 font-semibold">ট্রাক</div></div>
            <div className="p-2 rounded-xl bg-amber-50"><div className="text-lg font-black text-amber-900 font-mono">{fN(todayBags)}</div><div className="text-[10px] text-amber-700 font-semibold">ব্যাগ</div></div>
            <div className="p-2 rounded-xl bg-purple-50"><div className="text-lg font-black text-purple-900 font-mono">{fN(todayNetKg)}</div><div className="text-[10px] text-purple-700 font-semibold">নেট KG</div></div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2"><Layers className="h-4 w-4 text-slate-600" />স্ট্যাটাস বিভাজন</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs"><span className="text-emerald-700 font-bold flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />সব ওকে (ম্যাচড)</span><span className="font-mono font-black">{okMatched}</span></div>
            <div className="flex items-center justify-between text-xs"><span className="text-amber-700 font-bold flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />পেন্ডিং খালি</span><span className="font-mono font-black">{pendingEmpty}</span></div>
            <div className="flex items-center justify-between text-xs"><span className="text-rose-700 font-bold flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />খালি ওজন নেই</span><span className="font-mono font-black">{noEmpty}</span></div>
            <div className="flex items-center justify-between text-xs"><span className="text-orange-700 font-bold flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" />ডকুমেন্ট মিসিং</span><span className="font-mono font-black">{missingDocsCount}</span></div>
          </div>
        </div>
      </div>

      {pendingApprovals.length > 0 && (
        <div onClick={() => onNavigate('approvals')} className="bg-purple-50 border border-purple-200 rounded-2xl p-4 cursor-pointer hover:border-purple-400 transition-all">
          <div className="flex items-center gap-2 text-purple-800"><ShieldAlert className="h-5 w-5" /><span className="font-black text-sm">{pendingApprovals.length} টি অনুমোদন অপেক্ষায়</span></div>
        </div>
      )}
    </div>
  );
}