import React, { forwardRef } from 'react';

const show = (v, c) => (c.num && typeof v === 'number' ? v.toLocaleString('en-IN') : (v ?? ''));
const fmtDate = (d) => { const p = (d || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d || ''; };
const fN = (n) => Number(n || 0).toLocaleString('en-IN');
const fMT = (kg) => (kg > 0 ? (kg / 1000).toFixed(3) : '0.000');

const ReportView = forwardRef(function ReportView({ report, header }, ref) {
  return (
    <div ref={ref} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="text-center">
        <div className="font-black text-base text-slate-900">{header.companyName}</div>
        <div className="text-xs text-slate-500">{header.reportHeader}</div>
        <div className="font-black text-sm text-teal-800 mt-1">{report.title}</div>
        <div className="text-[11px] text-slate-500">{report.subtitle}</div>
      </div>
      {report.meta && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
          {report.meta.map((m, i) => <div key={i} className="flex justify-between border-b border-slate-100 py-0.5"><span className="text-slate-500">{m[0]}</span><span className="font-bold text-slate-800">{typeof m[1] === 'number' ? m[1].toLocaleString('en-IN') : m[1]}</span></div>)}
        </div>
      )}
      {report.type === 'daily_lighter' && report.sections ? (
        <div className="space-y-3">
          {report.sections.map((s, i) => (
            <div key={i} className="border border-slate-200 rounded-xl p-3 space-y-1">
              <div className="text-xs font-black text-teal-800">{fmtDate(s.date)} · {s.shift === 'Day' ? 'ডে' : 'নাইট'} · {s.ghat}</div>
              <div className="text-[11px] text-slate-600">M.V. {s.motherVessel} · {s.cargo}{s.company ? ` · ${s.company}` : ''}</div>
              <div className="text-[11px] text-slate-600">Lighter: {s.lighter} · Consignee: {s.consignee}</div>
              <div className="grid grid-cols-5 gap-2 mt-2 text-[11px]">
                <div><div className="text-slate-400">ট্রাক</div><div className="font-black">{s.trucks}</div></div>
                <div><div className="text-slate-400">ব্যাগ</div><div className="font-black">{fN(s.bags)}</div></div>
                <div><div className="text-slate-400">নেট (KG)</div><div className="font-black">{fN(s.net)}</div></div>
                <div><div className="text-slate-400">A/B (KG)</div><div className="font-black">{s.ab}</div></div>
                <div><div className="text-slate-400">Bag Avg</div><div className="font-black">{s.bagAverage?.toFixed(2)}</div></div>
              </div>
              {s.cumTrucks != null && (
                <div className="text-[10px] font-bold text-teal-700 mt-1">
                  সামারি (শুরু থেকে {fmtDate(s.date)} পর্যন্ত মোট): {s.cumTrucks} ট্রাক · {fN(s.cumBags)} ব্যাগ · {fMT(s.cumNet)} M/T
                </div>
              )}
            </div>
          ))}
          {report.lighterSummaries && report.lighterSummaries.length > 0 && (
            <div className="border-2 border-teal-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-black text-teal-800">Lighter Final Summary</div>
              {report.summaryTo && <div className="text-[10px] text-slate-500">শুরু থেকে {fmtDate(report.summaryTo)} পর্যন্ত সব দিনের মোট (প্রতিদিনের রিপোর্টের সাথে আগের দিনগুলো যোগ করা)</div>}
              {report.lighterSummaries.map((l, i) => (
                <div key={i} className="text-[11px] border-b border-slate-100 pb-1">
                  <div className="font-bold">{l.lighter}</div>
                  <div className="text-[10px] text-slate-500">{l.company || ''}{l.consignee && l.consignee !== '—' ? `${l.company ? ' · ' : ''}Consignee: ${l.consignee}` : ''}</div>
                  <div className="grid grid-cols-5 gap-1 mt-1">
                    <span>ট্রাক: {l.totalTrucks}</span><span>ব্যাগ: {fN(l.totalBags)}</span><span>নেট: {fMT(l.totalNet)} M/T</span><span>A/B: {l.ab} KG</span><span>Avg: {l.bagAverage?.toFixed(2)} KG</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {report.vesselSummaries && report.vesselSummaries.length > 0 && (
            <div className="border-2 border-indigo-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-black text-indigo-800">Mother Vessel Final Summary</div>
              {report.summaryTo && <div className="text-[10px] text-slate-500">শুরু থেকে {fmtDate(report.summaryTo)} পর্যন্ত সব দিনের মোট</div>}
              {report.vesselSummaries.map((v, i) => (
                <div key={i} className="text-[11px] border-b border-slate-100 pb-1">
                  <div className="font-bold">{v.vessel}</div>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    <span>Lighter: {v.totalLighters}</span><span>ট্রাক: {v.totalTrucks}</span><span>ব্যাগ: {fN(v.totalBags)}</span>
                    <span>Weight: {fMT(v.totalNet)} M/T</span><span>A/B: {v.ab} KG</span><span>Avg: {v.bagAverage?.toFixed(2)} KG</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div data-scroll className="overflow-x-auto">
          <table className="min-w-full text-[11px] border-collapse">
            <thead>
              <tr>{report.columns.map((c) => <th key={c.key} className={`border border-slate-200 bg-slate-100 px-2 py-1 font-black ${c.num ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr key={i}>{report.columns.map((c) => <td key={c.key} className={`border border-slate-200 px-2 py-1 ${c.num ? 'text-right font-mono' : ''}`}>{show(r[c.key], c)}</td>)}</tr>
              ))}
              {report.rows.length === 0 && <tr><td colSpan={report.columns.length} className="border border-slate-200 px-2 py-4 text-center text-slate-400 font-bold">এই সময়ে কোনো তথ্য নেই</td></tr>}
              {report.totals && (
                <tr>{report.columns.map((c) => <td key={c.key} className={`border border-slate-200 bg-slate-50 px-2 py-1 font-black ${c.num ? 'text-right font-mono' : ''}`}>{show(report.totals[c.key], c)}</td>)}</tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {report.vesselSummary && (
        <div className="border-2 border-indigo-200 bg-indigo-50 rounded-xl p-3 space-y-1">
          <div className="text-xs font-black text-indigo-800">Vessel Final Summary</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div><span className="text-slate-500">Total Truck:</span> <span className="font-black">{report.vesselSummary.totalTrucks}</span></div>
            <div><span className="text-slate-500">Total Bag:</span> <span className="font-black">{fN(report.vesselSummary.totalBags)} PP</span></div>
            <div><span className="text-slate-500">Total Weight:</span> <span className="font-black">{fMT(report.vesselSummary.totalWeight)} M/T</span></div>
            <div><span className="text-slate-500">Total A/B:</span> <span className="font-black">{report.vesselSummary.ab} KG</span></div>
            <div><span className="text-slate-500">Overall Bag Average:</span> <span className="font-black">{report.vesselSummary.bagAverage?.toFixed(2)} KG</span></div>
          </div>
        </div>
      )}
      {report.bagDeduction && (
        <div className="border-2 border-amber-200 bg-amber-50 rounded-xl p-3 space-y-1">
          <div className="text-xs font-black text-amber-800">বস্তার ওজন বাদ (Bag Weight Deduction)</div>
          <div className="text-[11px] text-slate-600">মোট ব্যাগ: {fN(report.bagDeduction.totalBags)} PP</div>
          <div className="text-[11px] text-slate-600">প্রতি বস্তার ওজন: {report.bagDeduction.bagWeightPerBag} গ্রাম ({report.bagDeduction.bagWeightPerBagKg} KG)</div>
          <div className="text-[11px] text-slate-600">মোট বস্তার ওজন: {fN(report.bagDeduction.totalBagWeight)} KG</div>
          <div className="border-t border-slate-200 mt-2 pt-2 space-y-1">
            <div className="text-[11px] font-bold">Gross Weight: {fN(report.bagDeduction.grossWeight)} KG</div>
            <div className="text-[11px] font-bold">− Total Bag Weight: {fN(report.bagDeduction.totalBagWeight)} KG</div>
            <div className="text-[11px] font-black text-teal-700">= Final Net Weight: {fN(report.bagDeduction.finalNetWeight)} KG ({report.bagDeduction.finalNetMT} M/T)</div>
          </div>
        </div>
      )}
      {(report.notes || []).map((n, i) => <div key={i} className="text-xs font-bold text-slate-600">{n}</div>)}
    </div>
  );
});

export default ReportView;