import React, { useState } from 'react';
import { Settings, Save, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { base44 } from '@/api/base44Client';
import { isAdminRole, isSuperAdmin, ROLE_SETS } from '@/lib/erpRoles';
import { requireActor } from '@/lib/sanmarineSession';
import { getRules } from '@/lib/sanmarineRules';

import BackupRestore from './BackupRestore';
import OcrSetup from '@/components/sanmarine/setup/OcrSetup';
import InstallApp from '@/components/sanmarine/setup/InstallApp';
import AndroidSetup from '@/components/sanmarine/setup/AndroidSetup';
import { PageShell, PageHeader, Card, Field, Notice, inputCls, primaryBtn, dangerBtn, ghostBtn } from './formParts';

export default function SettingsPage({ settings, currentUser, onRefresh }) {
  const rules = getRules(settings);
  const [companyName, setCompanyName] = useState(settings.companyName || '');
  const [reportHeader, setReportHeader] = useState(settings.reportHeader || '');
  const [oldHours, setOldHours] = useState(String(rules.oldEmptyWeightHours));
  const [gap, setGap] = useState(String(rules.minTripGapMinutes));
  const [pendHours, setPendHours] = useState(String(rules.pendingEmptyAlertHours));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState(null);
  const canEdit = isAdminRole(currentUser);

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteBusy(true);
    try {
      await api.deleteSelfAccount();
      try { localStorage.removeItem('sanmarine_auth_user'); localStorage.removeItem('sanmarine_auth_token'); } catch (e) {}
      await base44.auth.logout();
      window.location.href = '/login';
    } catch (err) {
      setDeleteMsg({ kind: 'error', text: err.message || 'অ্যাকাউন্ট মুছতে সমস্যা হয়েছে।' });
      setDeleteBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) { setMsg({ kind: 'error', text: 'কোম্পানির নাম আবশ্যক।' }); return; }
    setBusy(true);
    try {
      await requireActor(currentUser, ROLE_SETS.ADMIN);
      await api.updateSettings({
        companyName: companyName.trim(), reportHeader: reportHeader.trim(),
        oldEmptyWeightHours: Number(oldHours) || 24, minTripGapMinutes: Number(gap) >= 0 ? Number(gap) : 60, pendingEmptyAlertHours: Number(pendHours) || 12,
      });
      setMsg({ kind: 'success', text: 'সেটিংস সংরক্ষিত হয়েছে।' });
      await onRefresh();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message || 'সংরক্ষণ ব্যর্থ।' });
    } finally { setBusy(false); }
  };

  return (
    <PageShell>
      <PageHeader icon={Settings} title="সিস্টেম সেটিংস" sub="কোম্পানি তথ্য, অ্যালার্ট সীমা, ব্যাকআপ" />
      <Card>
        <form onSubmit={save} className="space-y-3">
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <Field label="কোম্পানির নাম"><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!canEdit} className={inputCls} /></Field>
          <Field label="রিপোর্ট হেডার"><input value={reportHeader} onChange={(e) => setReportHeader(e.target.value)} disabled={!canEdit} className={inputCls} /></Field>
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 pt-1">অ্যালার্ট নিয়মের সীমা</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="পুরোনো খালি ওজন (ঘণ্টা)" hint="এর চেয়ে পুরোনো খালি ওজন দিয়ে লোড হলে অ্যালার্ট"><input type="number" min="1" value={oldHours} onChange={(e) => setOldHours(e.target.value)} disabled={!canEdit} className={inputCls} /></Field>
            <Field label="ন্যূনতম ট্রিপ গ্যাপ (মিনিট)" hint="০ দিলে বন্ধ"><input type="number" min="0" value={gap} onChange={(e) => setGap(e.target.value)} disabled={!canEdit} className={inputCls} /></Field>
            <Field label="পেন্ডিং খালি ওজন অ্যালার্ট (ঘণ্টা)" hint="লোড এন্ট্রি না হলে অ্যালার্ট"><input type="number" min="1" value={pendHours} onChange={(e) => setPendHours(e.target.value)} disabled={!canEdit} className={inputCls} /></Field>
          </div>
          {canEdit
            ? <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} সংরক্ষণ</button>
            : <Notice kind="info">সেটিংস পরিবর্তন করতে অ্যাডমিন রোল প্রয়োজন।</Notice>}
        </form>
      </Card>
      <OcrSetup settings={settings} currentUser={currentUser} onSaved={onRefresh} />
      <InstallApp />
      <AndroidSetup currentUser={currentUser} />
      {isSuperAdmin(currentUser) && <BackupRestore currentUser={currentUser} onDone={onRefresh} />}
      <Card className="border-rose-200 bg-rose-50/50">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-5 w-5 text-rose-600" />
          <h3 className="text-sm font-black text-rose-900">অ্যাকাউন্ট মুছে ফেলুন</h3>
        </div>
        <p className="text-xs text-rose-700 mb-3">আপনার অ্যাকাউন্ট এবং সম্পর্কিত সমস্ত ডেটা স্থায়ীভাবে মুছে যাবে। এই কাজটি ফিরিয়ে আনা যাবে না।</p>
        {deleteMsg && <Notice kind={deleteMsg.kind}>{deleteMsg.text}</Notice>}
        {deleteConfirm ? (
          <div className="space-y-2">
            <p className="text-xs font-bold text-rose-800">নিশ্চিত? আবার ক্লিক করলে আপনার অ্যাকাউন্ট স্থায়ীভাবে মুছে যাবে।</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleDeleteAccount} disabled={deleteBusy} className={dangerBtn}>
                {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} স্থায়ীভাবে মুছুন
              </button>
              <button type="button" onClick={() => { setDeleteConfirm(false); setDeleteMsg(null); }} className={ghostBtn}>বাতিল</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={handleDeleteAccount} className={`${dangerBtn} w-full`}>
            <Trash2 className="h-4 w-4" /> অ্যাকাউন্ট মুছে ফেলুন
          </button>
        )}
      </Card>
    </PageShell>
  );
}