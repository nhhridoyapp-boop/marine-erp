import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const ID_LABEL = {
  CLAIMED: { text: 'নিজের দেওয়া আইডি — যাচাই বাকি', cls: 'bg-amber-100 text-amber-800' },
  NEEDS_ID: { text: 'আইডি নেই — অ্যাডমিনকে দিতে হবে', cls: 'bg-rose-100 text-rose-700' },
};

// One pending Join Request: shows the requested position + ID status and lets an authorised admin decide the final role and ID.
export default function PendingRequestCard({ u, busy, isSuperAdmin, onApprove, onReject }) {
  const allowed = isSuperAdmin ? ['Admin', 'Supervisor', 'Staff'] : ['Supervisor', 'Staff'];
  const requested = u.requestedRole || 'Staff';
  const [role, setRole] = useState(allowed.includes(requested) ? requested : 'Staff');
  const [newId, setNewId] = useState('');
  const [empType, setEmpType] = useState('Staff');
  const needsId = u.idStatus === 'NEEDS_ID' || !u.employeeId;
  const isPermanent = empType === 'Permanent Staff';
  const idInfo = ID_LABEL[u.idStatus];
  const blocked = needsId && !newId.trim() && !isPermanent;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-black shrink-0">{(u.name || '?').charAt(0).toUpperCase()}</div>
        <div className="min-w-0">
          <div className="font-black text-sm text-slate-800 truncate">{u.name}</div>
          <div className="text-[11px] text-slate-500 truncate">{u.email || '—'} · {u.mobile || '—'}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">আবেদন: {u.requestDateTime ? new Date(u.requestDateTime).toLocaleString('en-GB') : '—'}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
        <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">আবেদিত পদ: {requested}</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">ID: {needsId && u.idStatus === 'NEEDS_ID' ? '—' : (u.employeeId || '—')}</span>
        {idInfo && <span className={`px-2 py-0.5 rounded-full ${idInfo.cls}`}>{idInfo.text}</span>}
      </div>

      {requested === 'Admin' && !isSuperAdmin && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Admin পদ শুধু Super Admin দিতে পারেন। আপনি নিচের পদগুলো থেকে দিতে পারবেন।
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-[10px] font-bold uppercase text-slate-500">চূড়ান্ত পদ
          <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold normal-case">
            {allowed.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase text-slate-500">কর্মচারী শ্রেণি
          <select value={empType} onChange={(e) => setEmpType(e.target.value)} className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold normal-case">
            <option value="Staff">Staff</option>
            <option value="Supervisor">Supervisor</option>
            <option value="Admin">Admin</option>
            <option value="Permanent Staff">Permanent Staff</option>
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase text-slate-500">{needsId ? (isPermanent ? 'আইডি (ঐচ্ছিক)' : 'স্টাফ আইডি দিন *') : 'আইডি বদলাতে চাইলে'}
          <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder={isPermanent ? 'Permanent Staff — ঐচ্ছিক' : (needsId ? 'নতুন আইডি' : 'ফাঁকা = বর্তমান')} className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono uppercase normal-case" />
        </label>
      </div>

      <div className="flex gap-2">
        <button disabled={busy || blocked} onClick={() => onApprove(u, { role, employeeId: newId.trim(), employeeType: empType })} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">
          <CheckCircle2 className="h-4 w-4" /> অনুমোদন
        </button>
        <button disabled={busy} onClick={() => onReject(u)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold disabled:opacity-50">
          <XCircle className="h-4 w-4" /> বাতিল
        </button>
      </div>
    </div>
  );
}