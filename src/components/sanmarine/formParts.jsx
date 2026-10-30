import React from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none text-sm font-medium';
export const primaryBtn = 'px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-[0.98]';
export const ghostBtn = 'px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50';
export const dangerBtn = 'px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-[0.98]';

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">{label}</span>
      {children}
      {hint ? <span className="block text-[10px] text-slate-400 mt-1">{hint}</span> : null}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder = '— নির্বাচন করুন —', disabled }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className={inputCls}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 ${className}`}>{children}</div>;
}

export function PageShell({ children }) {
  return <div className="max-w-5xl mx-auto p-3 sm:p-5 space-y-4">{children}</div>;
}

export function PageHeader({ icon: Icon, title, sub, right }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-teal-600 text-white flex items-center justify-center"><Icon className="h-5 w-5" /></div>
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-800">{title}</h1>
          {sub ? <p className="text-[11px] text-slate-500 font-medium">{sub}</p> : null}
        </div>
      </div>
      {right}
    </div>
  );
}

const NOTICE = {
  info: 'bg-teal-50 border-teal-200 text-teal-900',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
  warn: 'bg-amber-50 border-amber-200 text-amber-900',
};
export function Notice({ kind = 'info', children }) {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'info' ? Info : AlertTriangle;
  return (
    <div className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${NOTICE[kind]}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" /><div className="min-w-0">{children}</div>
    </div>
  );
}

export function Empty({ text }) {
  return <div className="text-center py-10 text-slate-400 text-sm font-bold">{text}</div>;
}