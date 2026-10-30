import React, { useState } from 'react';
import DailyReportPanel from './DailyReportPanel';
import SummaryTablePanel from './SummaryTablePanel';

const TABS = [['daily', 'Daily Report'], ['summary', 'Final Summary Table']];

export default function ReportsView({ vessels, lighters, consignees, ghats, settings }) {
  const [type, setType] = useState('daily');
  return (
    <div className="max-w-4xl mx-auto p-3.5 sm:p-5 space-y-4 pb-24">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">Reports</h1>
          <p className="text-xs text-slate-500">Daily Discharge ও Final Summary রিপোর্ট তৈরি করুন</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setType(id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${type === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
          ))}
        </div>
      </div>
      {type === 'daily'
        ? <DailyReportPanel vessels={vessels} lighters={lighters} consignees={consignees} ghats={ghats} />
        : <SummaryTablePanel vessels={vessels} settings={settings} />}
    </div>
  );
}