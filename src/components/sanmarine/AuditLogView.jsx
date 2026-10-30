import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldAlert, Search, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { PageShell, PageHeader, Card, Empty, inputCls, ghostBtn } from './formParts';

const ACTION_STYLE = {
  CREATE: 'bg-emerald-100 text-emerald-700',
  EDIT: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-rose-100 text-rose-700',
  APPROVE: 'bg-teal-100 text-teal-700',
  REJECT: 'bg-amber-100 text-amber-700',
  ROLE_CHANGE: 'bg-purple-100 text-purple-700',
  PASSWORD_RESET: 'bg-orange-100 text-orange-700',
  STATUS_CHANGE: 'bg-slate-100 text-slate-700',
  LOGIN: 'bg-indigo-100 text-indigo-700',
};
const actionColor = (a) => {
  if (!a) return 'bg-slate-100 text-slate-700';
  if (a.endsWith('_FAILED')) return 'bg-rose-200 text-rose-800';
  return ACTION_STYLE[a] || 'bg-slate-100 text-slate-700';
};

export default function AuditLogView() {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});
  const reqRef = useRef(0);

  const load = useCallback(async (cursor) => {
    const id = ++reqRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'auditList', search: search.trim(), cursor, limit: 40 });
      if (id !== reqRef.current) return;
      const data = res.data;
      setItems(prev => (cursor ? [...prev, ...data.items] : data.items));
      setNext(data.hasMore ? data.nextCursor : null);
    } catch (e) {
      if (id !== reqRef.current) return;
      setError(e.response?.data?.error || e.message || 'অডিট লগ লোড হয়নি।');
      if (!cursor) setItems([]);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const fmtVal = (v) => {
    if (!v) return '—';
    try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; }
  };

  return (
    <PageShell>
      <PageHeader icon={ShieldAlert} title="সিস্টেম অডিট লগ" sub="কে কী করেছে — সম্পূর্ণ ইতিহাস" />
      {error && <div className="rounded-xl border border-destructive bg-muted p-3 text-sm text-destructive">{error}</div>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ইউজার, অ্যাকশন, ইমেইল বা বিবরণ খুঁজুন..." className={`${inputCls} pl-10`} />
      </div>
      {!loading && !error && items.length === 0 && <Empty text="কোনো লগ নেই।" />}
      <div className="space-y-2">
        {items.map(l => {
          const isOpen = expanded[l.id];
          const hasDetails = l.oldValue || l.newValue;
          return (
            <Card key={l.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${actionColor(l.action)}`}>{l.action}</span>
                <span className="text-[11px] font-bold text-slate-700">{l.userName}</span>
                {l.userEmail && <span className="text-[10px] text-slate-400">({l.userEmail})</span>}
                {l.userRole && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] font-bold">{l.userRole}</span>}
                {l.success === false && <span className="flex items-center gap-0.5 text-[10px] font-bold text-rose-600"><XCircle className="h-3 w-3" /> ব্যর্থ</span>}
                {l.success !== false && <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600"><CheckCircle2 className="h-3 w-3" /> সফল</span>}
              </div>
              <div className="text-xs text-slate-600 mt-1">{l.recordType}{l.recordId ? ` · ${l.recordId.slice(-8)}` : ''}{l.details ? ` — ${l.details}` : ''}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{l.timestamp ? new Date(l.timestamp).toLocaleString('en-GB') : ''}</div>
              {hasDetails && (
                <button onClick={() => toggle(l.id)} className="flex items-center gap-1 mt-1 text-[10px] font-bold text-teal-600 hover:underline">
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} পরিবর্তনের বিস্তারিত
                </button>
              )}
              {isOpen && hasDetails && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                  {l.oldValue && (
                    <div className="rounded-lg bg-rose-50 border border-rose-100 p-2">
                      <div className="font-bold text-rose-700 mb-1">পূর্বে</div>
                      <pre className="whitespace-pre-wrap break-words text-slate-600">{fmtVal(l.oldValue)}</pre>
                    </div>
                  )}
                  {l.newValue && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2">
                      <div className="font-bold text-emerald-700 mb-1">পরে</div>
                      <pre className="whitespace-pre-wrap break-words text-slate-600">{fmtVal(l.newValue)}</pre>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>}
      {next && !loading && <button onClick={() => load(next)} className={`${ghostBtn} w-full`}>আরও দেখুন</button>}
    </PageShell>
  );
}