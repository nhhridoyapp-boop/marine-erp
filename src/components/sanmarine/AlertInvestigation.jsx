import React, { useState, useEffect } from 'react';
import { X, Loader2, ShieldAlert, FileText, AlertTriangle, CheckCircle2, ArrowDown } from 'lucide-react';
import { fetchCurrentEntry, fetchPreviousEntry, fetchTripEvidence, evidenceList, missingDocuments, problemSummary, weightComparison, ALERT_TYPE_LABEL, PRIORITY_LABEL } from '@/lib/sanmarineInvestigation';
import { FLAG_META } from '@/lib/sanmarineRules';
import { alertType } from '@/lib/sanmarineAlertView';
import { Card, Notice, inputCls, ghostBtn, primaryBtn } from './formParts';
import PhotoThumb from './PhotoThumb';
import TripDocuments from './TripDocuments';

const SEV_CHIP = { critical: 'bg-rose-600 text-white', high: 'bg-rose-500 text-white', warning: 'bg-amber-500 text-slate-950', medium: 'bg-amber-400 text-slate-950', low: 'bg-sky-500 text-white', info: 'bg-slate-500 text-white' };
const STATUS_LABEL = { OPEN: 'ওপেন', INVESTIGATING: 'তদন্তাধীন', RESOLVED: 'সমাধান' };

function Header({ alert, current }) {
  const truck = alert.truckNumber || (current && current.record && current.record.truckNumber) || '—';
  const ghat = alert.ghat || (current && current.record && (current.kind === 'loading' ? current.record.ghatName : current.record.ghat)) || '—';
  const lighter = (current && current.lighterName) || '—';
  const vessel = (current && current.vesselName) || '—';
  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-amber-400">সবচেয়ে গুরুত্বপূর্ণ তথ্য</div>
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
        <div className="text-base font-black leading-snug">{alertType(alert)}</div>
      </div>
      {alert.description && <div className="text-[11px] text-slate-300 leading-relaxed">{alert.description}</div>}
      <div className="grid grid-cols-1 gap-1.5">
        <div className="text-xl font-black font-mono">ট্রাক: {truck}</div>
        <div className="text-base font-black">ঘাট: {ghat}</div>
        <div className="text-base font-black">লাইটার: {lighter}</div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pt-2 border-t border-white/20">
        <div><span className="text-slate-400">মাদার ভেসেল:</span> <b>{vessel}</b></div>
        <div><span className="text-slate-400">তারিখ ও সময়:</span> <b>{alert.createdTime ? new Date(alert.createdTime).toLocaleString('en-GB') : '—'}</b></div>
        <div><span className="text-slate-400">এন্ট্রি করেছেন:</span> <b>{alert.enteredByName || '—'}</b></div>
        <div><span className="text-slate-400">অ্যালার্ট টাইপ:</span> <b>{ALERT_TYPE_LABEL[alert.category] || alert.category}</b></div>
        <div><span className="text-slate-400">প্রায়োরিটি:</span> <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${SEV_CHIP[alert.severity] || SEV_CHIP.info}`}>{PRIORITY_LABEL[alert.severity] || alert.severity}</span></div>
        <div><span className="text-slate-400">স্ট্যাটাস:</span> <b>{STATUS_LABEL[alert.status] || alert.status}</b></div>
      </div>
    </div>
  );
}

function EntryBlock({ title, entry }) {
  if (!entry || !entry.record) return <Card><div className="text-xs font-black text-slate-700 mb-1">{title}</div><div className="text-xs text-slate-400">কোনো রেকর্ড পাওয়া যায়নি।</div></Card>;
  const r = entry.record;
  const isLoad = entry.kind === 'loading';
  return (
    <Card className="space-y-1.5">
      <div className="text-xs font-black text-slate-700">{title}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Field label="ট্রাক" value={r.truckNumber} mono />
        <Field label="ঘাট" value={isLoad ? r.ghatName : r.ghat} />
        <Field label="লাইটার" value={entry.lighterName || '—'} />
        <Field label="মাদার ভেসেল" value={entry.vesselName || '—'} />
        <Field label="তারিখ" value={isLoad ? r.date : r.emptyWeightDate} />
        <Field label="সময়" value={isLoad ? r.time : r.emptyWeightTime} />
        <Field label="খালি/টেয়ার ওজন" value={`${isLoad ? r.tare : r.tallyWeight} KG`} />
        <Field label="গ্রস ওজন" value={isLoad ? `${r.gross} KG` : '—'} />
        <Field label="নেট ওজন" value={isLoad ? `${r.net} KG` : '—'} />
        <Field label="ব্যাগ" value={isLoad ? (r.bags || 0) : '—'} />
        <Field label="এন্ট্রি করেছেন" value={isLoad ? r.enteredBy : r.enteredByName} />
        <Field label="স্কেল" value={r.scaleName || '—'} />
      </div>
    </Card>
  );
}

function Field({ label, value, mono }) {
  return <div><span className="text-slate-400">{label}:</span> <b className={mono ? 'font-mono text-slate-800' : 'text-slate-800'}>{value || '—'}</b></div>;
}

function CompareRow({ label, prev, cur }) {
  const diff = (cur != null && prev != null) ? (Number(cur) - Number(prev)) : null;
  const bad = diff != null && diff !== 0;
  return (
    <div className="grid grid-cols-3 gap-2 text-[11px] py-1 border-b border-slate-100 last:border-0">
      <div className="text-slate-500 font-bold">{label}</div>
      <div className="text-slate-700 font-mono">{prev ?? '—'}</div>
      <div className={`font-mono font-black ${bad ? 'text-rose-600' : 'text-emerald-600'}`}>{cur ?? '—'}{bad ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}</div>
    </div>
  );
}

export default function AlertInvestigation({ alert, currentUser, onClose, onChange }) {
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState(alert.investigationNotes || '');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('flow');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr('');
    (async () => {
      try {
        const cur = await fetchCurrentEntry(alert);
        if (cancelled) return;
        setCurrent(cur);
        const [prev, ev] = await Promise.all([
          fetchPreviousEntry(alert, cur),
          cur ? fetchTripEvidence(alert.truckNumber, cur.kind === 'loading' ? cur.record.date : cur.record.emptyWeightDate, cur.kind === 'loading' ? cur.record.time : cur.record.emptyWeightTime) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setPrevious(prev);
        setEvidence(ev);
      } catch (e) {
        if (!cancelled) setErr(e.message || 'তদন্ত তথ্য আনা যায়নি।');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [alert.id]);

  const saveStatus = async (status) => {
    setBusy(true);
    try { await onChange(alert, { status, investigationNotes: notes }); } finally { setBusy(false); }
  };

  const wc = weightComparison(alert, current, previous);
  const missing = evidence ? missingDocuments(evidence, alert.truckNumber, current ? (current.kind === 'loading' ? current.record.date : current.record.emptyWeightDate) : '') : [];
  const problemLines = problemSummary(alert, current, previous);
  const curDate = current && (current.kind === 'loading' ? current.record.date : current.record.emptyWeightDate);
  const curTime = current && (current.kind === 'loading' ? current.record.time : current.record.emptyWeightTime);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-50 w-full sm:max-w-2xl max-h-[94vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-rose-600" /><h2 className="text-sm font-black text-slate-800">অ্যালার্ট তদন্ত</h2></div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex gap-1.5 px-3 py-2 bg-white border-b border-slate-200 overflow-x-auto shrink-0">
          {[['flow', 'তদন্ত ফ্লো'], ['compare', 'তুলনা'], ['documents', 'ডকুমেন্ট'], ['problem', 'সমস্যা']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${tab === id ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-rose-600" /></div>}
          {err && <Notice kind="error">{err}</Notice>}
          {!loading && (
            <>
              <Header alert={alert} current={current} />

              {tab === 'flow' && (
                <div className="space-y-2">
                  <SectionTitle>তদন্ত ফ্লো</SectionTitle>
                  <FlowStep n={1} title="Current Entry"><EntryBlock title="বর্তমান এন্ট্রি" entry={current} /></FlowStep>
                  <ArrowDown className="h-4 w-4 text-slate-400 mx-auto" />
                  <FlowStep n={2} title="Previous Entry / Trip"><EntryBlock title="আগের এন্ট্রি / ট্রিপ" entry={previous} /></FlowStep>
                  <ArrowDown className="h-4 w-4 text-slate-400 mx-auto" />
                  <FlowStep n={3} title="Problem Detection"><Notice kind="warn">{problemLines[0] || '—'}{problemLines[1] ? <><br />{problemLines[1]}</> : null}</Notice></FlowStep>
                  <ArrowDown className="h-4 w-4 text-slate-400 mx-auto" />
                  <FlowStep n={4} title="Document Verification">{missing.length ? <Notice kind="warn">{missing.map((m) => `MISSING — ${m.label}`).join(' · ')}</Notice> : <Notice kind="success">সব প্রয়োজনীয় ডকুমেন্ট আছে।</Notice>}</FlowStep>
                  <ArrowDown className="h-4 w-4 text-slate-400 mx-auto" />
                  <FlowStep n={5} title="Evidence">{evidence && evidenceList(evidence).length ? <div className="text-xs text-slate-600">{evidenceList(evidence).length}টি ডকুমেন্ট — "ডকুমেন্ট" ট্যাবে দেখুন।</div> : <div className="text-xs text-rose-600 font-bold">কোনো evidence নেই।</div>}</FlowStep>
                  <ArrowDown className="h-4 w-4 text-slate-400 mx-auto" />
                  <FlowStep n={6} title="Missing Evidence">{missing.length ? <ul className="text-xs text-rose-600 font-bold list-disc pl-4">{missing.map((m) => <li key={m.key}>MISSING — {m.label}</li>)}</ul> : <div className="text-xs text-emerald-600 font-bold">কোনো evidence missing নেই।</div>}</FlowStep>
                  <ArrowDown className="h-4 w-4 text-slate-400 mx-auto" />
                  <FlowStep n={7} title="Exact Problem Details"><div className="text-xs text-slate-700 space-y-0.5">{problemLines.map((l, i) => <div key={i}>{l}</div>)}</div></FlowStep>
                  <ArrowDown className="h-4 w-4 text-slate-400 mx-auto" />
                  <FlowStep n={8} title="Investigation Status"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${alert.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-700' : alert.status === 'INVESTIGATING' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{STATUS_LABEL[alert.status] || alert.status}</span></FlowStep>
                </div>
              )}

              {tab === 'compare' && (
                <div className="space-y-2">
                  <SectionTitle>Current বনাম Previous তুলনা</SectionTitle>
                  <Card>
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-black uppercase text-slate-400 pb-1 border-b border-slate-200">
                      <div>ঘর</div><div>আগের</div><div>বর্তমান</div>
                    </div>
                    {current && previous ? (
                      <>
                        <CompareRow label="তারিখ" prev={previous.kind === 'loading' ? previous.record.date : previous.record.emptyWeightDate} cur={current.kind === 'loading' ? current.record.date : current.record.emptyWeightDate} />
                        <CompareRow label="সময়" prev={previous.kind === 'loading' ? previous.record.time : previous.record.emptyWeightTime} cur={current.kind === 'loading' ? current.record.time : current.record.emptyWeightTime} />
                        <CompareRow label="ঘাট" prev={previous.kind === 'loading' ? previous.record.ghatName : previous.record.ghat} cur={current.kind === 'loading' ? current.record.ghatName : current.record.ghat} />
                        <CompareRow label="লাইটার" prev={previous.lighterName} cur={current.lighterName} />
                        <CompareRow label="খালি/টেয়ার" prev={previous.kind === 'loading' ? previous.record.tare : previous.record.tallyWeight} cur={current.kind === 'loading' ? current.record.tare : current.record.tallyWeight} />
                        <CompareRow label="গ্রস" prev={previous.kind === 'loading' ? previous.record.gross : null} cur={current.kind === 'loading' ? current.record.gross : null} />
                        <CompareRow label="নেট" prev={previous.kind === 'loading' ? previous.record.net : null} cur={current.kind === 'loading' ? current.record.net : null} />
                        <CompareRow label="ব্যাগ" prev={previous.kind === 'loading' ? previous.record.bags : null} cur={current.kind === 'loading' ? current.record.bags : null} />
                      </>
                    ) : <div className="text-xs text-slate-400 py-2">আগের রেকর্ড নেই — তুলনা সম্ভব নয়।</div>}
                  </Card>
                  {wc.difference != null && (
                    <Card>
                      <div className="text-xs font-black text-slate-700 mb-1">ওজন তুলনা ({wc.source})</div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><div className="text-slate-400 text-[10px]">Expected</div><div className="font-black font-mono text-slate-800">{wc.expected} KG</div></div>
                        <div><div className="text-slate-400 text-[10px]">Actual</div><div className="font-black font-mono text-slate-800">{wc.actual} KG</div></div>
                        <div><div className="text-slate-400 text-[10px]">Difference</div><div className={`font-black font-mono ${wc.difference > 0 ? 'text-rose-600' : 'text-amber-600'}`}>{wc.difference > 0 ? '+' : ''}{wc.difference} KG</div></div>
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {tab === 'documents' && (
                <div className="space-y-2">
                  <SectionTitle>সংশ্লিষ্ট ডকুমেন্ট ও Evidence</SectionTitle>
                  {current ? <TripDocuments truckNumber={alert.truckNumber} date={curDate} time={curTime} /> : <Notice kind="warn">বর্তমান এন্ট্রি পাওয়া যায়নি — ডকুমেন্ট দেখানো সম্ভব নয়।</Notice>}
                </div>
              )}

              {tab === 'problem' && (
                <div className="space-y-2">
                  <SectionTitle>সম্পূর্ণ সমস্যার বিবরণ</SectionTitle>
                  <Card className="space-y-1">{problemLines.map((l, i) => <div key={i} className="text-xs text-slate-700">{l}</div>)}</Card>
                  {wc.difference != null && (
                    <Card>
                      <div className="text-xs font-black text-slate-700 mb-1">ওজন পার্থক্য</div>
                      <div className="text-xs space-y-0.5">
                        <div>Expected Value: <b className="font-mono">{wc.expected} KG</b></div>
                        <div>Actual Value: <b className="font-mono">{wc.actual} KG</b></div>
                        <div>Exact Difference: <b className="font-mono text-rose-600">{wc.difference > 0 ? '+' : ''}{wc.difference} KG</b></div>
                        <div className="text-slate-400">উৎস: {wc.source}</div>
                      </div>
                    </Card>
                  )}
                  <Card>
                    <div className="text-xs font-black text-slate-700 mb-1">তদন্ত ফলাফল</div>
                    <div className="text-xs space-y-0.5">
                      <div>Problem Found: <b className="text-rose-600">{ALERT_TYPE_LABEL[alert.category] || alert.category}</b></div>
                      <div>Evidence Available: <b>{evidence ? evidenceList(evidence).length : 0}টি</b></div>
                      <div>Missing Evidence: <b className={missing.length ? 'text-rose-600' : 'text-emerald-600'}>{missing.length ? missing.map((m) => m.label).join(', ') : 'নেই'}</b></div>
                      <div>Investigation Status: <b>{STATUS_LABEL[alert.status] || alert.status}</b></div>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-3 bg-white border-t border-slate-200 space-y-2 shrink-0">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="তদন্তের নোট..." className={inputCls} />
          <div className="flex gap-2 flex-wrap">
            {alert.status !== 'INVESTIGATING' && <button disabled={busy} onClick={() => saveStatus('INVESTIGATING')} className={ghostBtn}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}তদন্ত শুরু</button>}
            {alert.status !== 'RESOLVED' && <button disabled={busy} onClick={() => saveStatus('RESOLVED')} className={`${primaryBtn} !bg-emerald-600`}>সমাধান হয়েছে</button>}
            {alert.status === 'RESOLVED' && <button disabled={busy} onClick={() => saveStatus('OPEN')} className={ghostBtn}>পুনরায় খুলুন</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 pt-1">{children}</div>;
}

function FlowStep({ n, title, children }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-5 w-5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center">{n}</div>
        <div className="text-xs font-black text-slate-700">{title}</div>
      </div>
      {children}
    </div>
  );
}