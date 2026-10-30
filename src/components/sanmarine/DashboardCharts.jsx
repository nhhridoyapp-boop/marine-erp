import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import { TrendingUp, BarChart3, PieChart as PieIcon } from 'lucide-react';

const STATUS_COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#fb923c'];
const TREND_COLOR = '#0d9488';

const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit' },
  labelStyle: { fontWeight: 800, color: '#0f172a' },
};

export default function DashboardCharts({ stats }) {
  const s = stats || {};
  const dateRows = (s.dateRows || []).map((r) => ({
    date: r.date ? r.date.slice(5) : '',
    trucks: r.count || 0,
    net: Math.round((r.sum_net || 0) / 1000 * 10) / 10,
  }));
  const ghatRows = (s.ghatRows || []).map((r) => ({
    ghat: r.ghatName || 'অজানা',
    trucks: r.count || 0,
  }));
  const statusData = [
    { name: 'সব ওকে', value: s.okMatched || 0 },
    { name: 'পেন্ডিং খালি', value: s.pendingEmpty || 0 },
    { name: 'খালি নেই', value: s.noEmpty || 0 },
    { name: 'ডক মিসিং', value: s.missingDocs || 0 },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <BarChart3 className="h-4 w-4 text-teal-600" />
        <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">ভিজ্যুয়াল অ্যানালিটিক্স</h2>
      </div>

      {/* Truck entry trend — last 30 days */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-teal-600" />
          <h3 className="text-xs font-black text-slate-700">ট্রাক এন্ট্রি ট্রেন্ড (৩০ দিন)</h3>
        </div>
        {dateRows.length === 0 ? (
          <p className="text-center text-xs text-slate-400 font-bold py-8">কোনো ডেটা নেই</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dateRows} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="truckGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TREND_COLOR} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={TREND_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" minTickGap={20} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="trucks" name="ট্রাক" stroke={TREND_COLOR} strokeWidth={2.5} fill="url(#truckGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Ghat activity — horizontal bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-teal-600" />
            <h3 className="text-xs font-black text-slate-700">ঘাট অনুযায়ী ট্রাক</h3>
          </div>
          {ghatRows.length === 0 ? (
            <p className="text-center text-xs text-slate-400 font-bold py-8">কোনো ডেটা নেই</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ghatRows} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
                <YAxis type="category" dataKey="ghat" tick={{ fontSize: 10, fill: '#475569' }} width={80} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="trucks" name="ট্রাক" fill="#0d9488" radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status distribution — donut */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <PieIcon className="h-4 w-4 text-teal-600" />
            <h3 className="text-xs font-black text-slate-700">স্ট্যাটাস বিভাজন</h3>
          </div>
          {statusData.length === 0 ? (
            <p className="text-center text-xs text-slate-400 font-bold py-8">কোনো ডেটা নেই</p>
          ) : (
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3}>
                    {statusData.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {statusData.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-1">
              {statusData.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                  {d.name}: <span className="font-mono font-black text-slate-800">{d.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}