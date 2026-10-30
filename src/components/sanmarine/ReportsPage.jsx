import React, { useState, useRef } from 'react';
import { FileText, Loader2, Printer, FileDown, FileSpreadsheet, Copy, Send, Check } from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { canHandleAlerts } from '@/lib/erpRoles';
import { REPORT_TYPES, buildReport } from '@/lib/sanmarineReports';
import { downloadCsv, downloadExcel, printReport, downloadPdf, reportWhatsappText, copyToClipboard, shareToWhatsapp } from '@/lib/sanmarineExport';
import ReportView from './ReportView';
import CompanySelector from '@/components/sanmarine/company/CompanySelector';
import { recordCompany } from '@/components/sanmarine/company/companyScope';
import { PageShell, PageHeader, Card, Field, Select, Notice, inputCls, primaryBtn, ghostBtn } from './formParts';

export default function ReportsPage({ company, onCompanyChange, scope, vessels, lighters, consignees, ghats, closings, settings, currentUser, users }) {
  const allLookups = { vessels, lighters, consignees, ghats, closings };
  const companyVessels = scope?.vessels || [], companyLighters = scope?.lighters || [];
  const companyClosings = closings.filter((c) => recordCompany(c, allLookups) === company);
  const types = REPORT_TYPES.filter(([id]) => id !== 'staff' || canHandleAlerts(currentUser));
  const [type, setType] = useState('daily_lighter');
  const [p, setP] = useState({ from: api.todayStr(), to: api.todayStr(), ghat: '', vesselId: '', lighterId: '', truck: '', closingId: '', shift: '', staff: '' });
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const viewRef = useRef(null);
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  // Every export uses the company captured with the generated report.
  const header = { companyName: report?.company || company, reportHeader: settings.reportHeader || '' };
  const usesRange = ['daily_lighter', 'daily', 'ghat', 'vessel', 'lighter', 'staff', 'problem', 'doc_status'].includes(type);

  const run = async () => {
    setBusy('build'); setMsg(null); setReport(null);
    try { setReport(await buildReport(type, { ...p, company }, allLookups)); }
    catch (e) { setMsg({ kind: 'error', text: e.message || 'রিপোর্ট তৈরি ব্যর্থ।' }); }
    finally { setBusy(''); }
  };
  const exportAs = async (kind) => {
    setBusy(kind); setMsg(null);
    try {
      if (kind === 'print') printReport(report, header);
      if (kind === 'csv') downloadCsv(report, header);
      if (kind === 'xlsx') downloadExcel(report, header);
      if (kind === 'pdf') await downloadPdf(viewRef.current, report);
      if (kind === 'copy') {
        const text = reportWhatsappText(report, header);
        await copyToClipboard(text);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
        setMsg({ kind: 'success', text: 'রিপোর্ট কপি হয়েছে — WhatsApp-এ পেস্ট করুন।' });
      }
      if (kind === 'wa') {
        const text = reportWhatsappText(report, header);
        await shareToWhatsapp(text);
      }
    } catch (e) { setMsg({ kind: 'error', text: e.message || 'এক্সপোর্ট ব্যর্থ।' }); }
    finally { setBusy(''); }
  };

  return (
    <PageShell>
      <PageHeader icon={FileText} title="রিপোর্টস" sub="বাস্তব ডাটাবেজ থেকে — কপি, WhatsApp, প্রিন্ট, PDF, Excel" />
      <CompanySelector company={company} onChange={onCompanyChange} reports />
      <Card className="space-y-3">
        <Field label="রিপোর্টের ধরন"><Select value={type} onChange={(v) => { setType(v || 'daily_lighter'); setReport(null); }} options={types.map(([id, l]) => ({ value: id, label: l }))} placeholder="দৈনিক লাইটার/ঘাট রিপোর্ট" /></Field>
        {usesRange && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="শুরু তারিখ"><input type="date" value={p.from} onChange={(e) => set('from', e.target.value)} className={inputCls} /></Field>
            <Field label="শেষ তারিখ"><input type="date" value={p.to} onChange={(e) => set('to', e.target.value)} className={inputCls} /></Field>
          </div>
        )}
        {type === 'daily_lighter' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="শিফট"><Select value={p.shift} onChange={(v) => set('shift', v)} options={[{ value: 'Day', label: 'ডে' }, { value: 'Night', label: 'নাইট' }]} placeholder="সব শিফট" /></Field>
            <Field label="ঘাট"><Select value={p.ghat} onChange={(v) => set('ghat', v)} options={ghats.map((g) => ({ value: g.name.toUpperCase(), label: g.name.toUpperCase() }))} placeholder="সব ঘাট" /></Field>
            <Field label="মাদার ভেসেল"><Select value={p.vesselId} onChange={(v) => { set('vesselId', v); set('lighterId', ''); }} options={companyVessels.map((v) => ({ value: v.id, label: v.name }))} placeholder="সব ভেসেল" /></Field>
            <Field label="লাইটার"><Select value={p.lighterId} onChange={(v) => set('lighterId', v)} options={companyLighters.filter((l) => !p.vesselId || l.motherVesselId === p.vesselId).map((l) => ({ value: l.id, label: l.name }))} placeholder="সব লাইটার" /></Field>
            <Field label="স্টাফ/সুপারভাইজার"><Select value={p.staff} onChange={(v) => set('staff', v)} options={(users || []).map((u) => ({ value: u.name, label: `${u.name} (${u.role})` }))} placeholder="সব স্টাফ" /></Field>
          </div>
        )}
        {(type === 'daily' || type === 'doc_status') && <Field label="ঘাট (ঐচ্ছিক)"><Select value={p.ghat} onChange={(v) => set('ghat', v)} options={ghats.map((g) => ({ value: g.name.toUpperCase(), label: g.name.toUpperCase() }))} placeholder="সব ঘাট" /></Field>}
        {type === 'daily' && <Field label="শিফট (ঐচ্ছিক)"><Select value={p.shift} onChange={(v) => set('shift', v)} options={[{ value: 'Day', label: 'ডে' }, { value: 'Night', label: 'নাইট' }]} placeholder="সব শিফট" /></Field>}
        {type === 'vessel' && <Field label="মাদার ভেসেল (ঐচ্ছিক)"><Select value={p.vesselId} onChange={(v) => set('vesselId', v)} options={companyVessels.map((v) => ({ value: v.id, label: v.name }))} placeholder="সব ভেসেল" /></Field>}
        {type === 'lighter' && <Field label="লাইটার (ঐচ্ছিক)"><Select value={p.lighterId} onChange={(v) => set('lighterId', v)} options={companyLighters.map((l) => ({ value: l.id, label: l.name }))} placeholder="সব লাইটার" /></Field>}
        {type === 'truck' && <Field label="ট্রাক নম্বর *"><input value={p.truck} onChange={(e) => set('truck', e.target.value)} placeholder="যেমন: DMT-123456" className={`${inputCls} uppercase font-mono`} /></Field>}
        {type === 'closing' && <Field label="ক্লোজিং রেকর্ড *"><Select value={p.closingId} onChange={(v) => set('closingId', v)} options={companyClosings.map((c) => ({ value: c.id, label: `${c.lighterVesselName} · ${c.closingDate} · ${c.status}` }))} /></Field>}
        <button onClick={run} disabled={!!busy} className={`${primaryBtn} w-full`}>{busy === 'build' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} রিপোর্ট তৈরি করুন</button>
      </Card>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button onClick={() => exportAs('copy')} disabled={!!busy} className={ghostBtn}>{copied ? <Check className="h-4 w-4 text-teal-600" /> : <Copy className="h-4 w-4" />} {copied ? 'কপি হয়েছে' : 'কপি রিপোর্ট'}</button>
            <button onClick={() => exportAs('wa')} disabled={!!busy} className={ghostBtn}><Send className="h-4 w-4" /> WhatsApp</button>
            <button onClick={() => exportAs('print')} disabled={!!busy} className={ghostBtn}><Printer className="h-4 w-4" /> প্রিন্ট</button>
            <button onClick={() => exportAs('pdf')} disabled={!!busy} className={ghostBtn}>{busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF</button>
            <button onClick={() => exportAs('csv')} disabled={!!busy} className={ghostBtn}><FileSpreadsheet className="h-4 w-4" /> CSV</button>
            <button onClick={() => exportAs('xlsx')} disabled={!!busy} className={ghostBtn}><FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)</button>
          </div>
          <ReportView ref={viewRef} report={report} header={header} />
        </>
      )}
    </PageShell>
  );
}