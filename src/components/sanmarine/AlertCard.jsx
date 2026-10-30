import React, { useState } from 'react';
import { Truck, MapPin, Scale, Ship, Clock, User, AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react';
import { Card, ghostBtn, primaryBtn } from './formParts';
import { PRIORITY_LABEL } from '@/lib/sanmarineInvestigation';
import { alertType, alertKg, alertCompare } from '@/lib/sanmarineAlertView';

const SEV = {
  critical: { pill: 'bg-rose-600 text-white', stripe: 'border-l-rose-600' },
  high: { pill: 'bg-rose-500 text-white', stripe: 'border-l-rose-500' },
  warning: { pill: 'bg-amber-500 text-slate-950', stripe: 'border-l-amber-500' },
  medium: { pill: 'bg-amber-400 text-slate-950', stripe: 'border-l-amber-400' },
  low: { pill: 'bg-sky-500 text-white', stripe: 'border-l-sky-500' },
  info: { pill: 'bg-slate-500 text-white', stripe: 'border-l-slate-400' },
};
const STATUS_LABEL = { OPEN: 'ওপেন', INVESTIGATING: 'তদন্তাধীন', RESOLVED: 'সমাধান' };

const Meta = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
    <Icon className="h-3 w-3 text-slate-400" />{children}
  </span>
);

// The documents this alert stands on. An alert can only be trusted once its trip's documents are attached,
// so the admin sees exactly which ones are there before deciding — and which are missing.
function DocCheck({ docs }) {
  if (!docs || !docs.length) return null;
  const missing = docs.filter((d) => d.required && !d.ok);
  return (
    <div className={`rounded-xl border p-2 ${missing.length ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
      <div className={`text-[10px] font-black flex items-start gap-1 ${missing.length ? 'text-amber-800' : 'text-emerald-800'}`}>
        {missing.length ? <FileWarning className="h-3.5 w-3.5 shrink-0 mt-px" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-px" />}
        <span>ডকুমেন্ট যাচাই: {missing.length ? `অসম্পূর্ণ — নেই: ${missing.map((d) => d.label).join(', ')}` : 'প্রয়োজনীয় সব ডকুমেন্ট আছে'}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {docs.map((d) => (
          <span key={d.label} className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border bg-white ${d.ok ? 'border-emerald-300 text-emerald-700' : d.required ? 'border-rose-300 text-rose-700' : 'border-slate-200 text-slate-500'}`}>
            {d.ok ? '✓' : '✗'} {d.label}{d.required ? '' : ' (ঐচ্ছিক)'}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AlertCard({ alert, canHandle, onChange, onOpen, docs }) {
  const [notes, setNotes] = useState(alert.investigationNotes || '');
  const [busy, setBusy] = useState(false);
  const update = async (status) => {
    setBusy(true);
    await onChange(alert, { status, investigationNotes: notes });
    setBusy(false);
  };

  const sev = SEV[alert.severity] || SEV.info;
  const kg = alertKg(alert);
  const cmp = alertCompare(alert);

  return (
    <Card className={`space-y-2 border-l-4 ${sev.stripe}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${sev.pill}`}>{PRIORITY_LABEL[alert.severity] || alert.severity}</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{STATUS_LABEL[alert.status] || alert.status}</span>
        {alert.truckNumber && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white">
            <Truck className="h-3 w-3" /><span className="font-mono font-black text-[11px] tracking-wide">{alert.truckNumber}</span>
          </span>
        )}
        {kg != null && <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 text-[11px] font-black">পার্থক্য {kg} KG</span>}
      </div>

      {/* এক নজরে: শিরোনামেই বলা আছে সমস্যাটা কী। */}
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
        <div className="font-black text-[15px] text-slate-900 leading-snug">{alertType(alert)}</div>
      </div>

      {alert.description && (
        <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-2 border border-slate-100">{alert.description}</div>
      )}
      {cmp && (
        <div className="text-[11px] font-bold text-slate-700">
          তুলনা: <span className="text-slate-500 font-mono">{cmp[0]}</span> ↔ <span className="text-rose-700 font-mono">{cmp[1]}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {alert.ghat && <Meta icon={MapPin}>{alert.ghat}</Meta>}
        {alert.lighterVesselName && <Meta icon={Ship}>{alert.lighterVesselName}</Meta>}
        {alert.motherVesselName && <Meta icon={Ship}>{alert.motherVesselName}</Meta>}
        {alert.scaleName && <Meta icon={Scale}>{alert.scaleName}</Meta>}
        {alert.enteredByName && <Meta icon={User}>{alert.enteredByName}</Meta>}
        {alert.createdTime && <Meta icon={Clock}>{new Date(alert.createdTime).toLocaleString('en-GB')}</Meta>}
      </div>

      <DocCheck docs={docs} />

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => onOpen(alert)} className={primaryBtn + ' !py-1.5 !text-xs'}>তদন্ত খুলুন (Open)</button>
        {canHandle && alert.status !== 'INVESTIGATING' && <button disabled={busy} onClick={() => update('INVESTIGATING')} className={ghostBtn}>তদন্ত শুরু</button>}
        {canHandle && alert.status !== 'RESOLVED' && <button disabled={busy} onClick={() => update('RESOLVED')} className={`${ghostBtn} !bg-emerald-100 !text-emerald-700`}>সমাধান</button>}
        {canHandle && alert.status === 'RESOLVED' && <button disabled={busy} onClick={() => update('OPEN')} className={ghostBtn}>পুনরায় খুলুন</button>}
      </div>
    </Card>
  );
}