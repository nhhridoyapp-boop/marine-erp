import React from 'react';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import AlertCard from './AlertCard';

const SEV_DOT = {
  critical: 'bg-rose-600', high: 'bg-rose-500', warning: 'bg-amber-500',
  medium: 'bg-amber-400', low: 'bg-sky-500', info: 'bg-slate-400',
};

export default function GhatAlertGroup({ name, items, canHandle, onChange, onOpen, collapsed, onToggle, evidence }) {
  const open = items.filter((a) => a.status === 'OPEN').length;
  const dots = [...new Set(items.map((a) => a.severity))].slice(0, 4);
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-left">
        {collapsed ? <ChevronRight className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        <MapPin className="h-4 w-4 text-teal-600" />
        <span className="font-black text-sm text-slate-800">{name}</span>
        <span className="text-[11px] font-bold text-slate-500">{items.length}টি অ্যালার্ট{open ? ` · ${open} ওপেন` : ''}</span>
        <div className="ml-auto flex gap-1">
          {dots.map((s) => <span key={s} className={`h-2 w-2 rounded-full ${SEV_DOT[s] || SEV_DOT.info}`} />)}
        </div>
      </button>
      {!collapsed && (
        <div className="p-2 sm:p-3 space-y-2">
          {items.map((a) => <AlertCard key={a.id} alert={a} docs={evidence && evidence[a.id] && evidence[a.id].docs} canHandle={canHandle} onChange={onChange} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}