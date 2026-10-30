import React, { useState } from 'react';
import {
  Users, UserPlus, ShieldCheck, Clock, CheckCircle2, XCircle, KeyRound,
  Trash2, BadgeCheck, Search, Crown, Loader2,
} from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';
import PendingRequestCard from './PendingRequestCard';
import EditStaffModal from './EditStaffModal';
import DuplicateAuditPanel from './DuplicateAuditPanel';
import ConfirmDialog from './ConfirmDialog';
import ResetPasswordModal from './ResetPasswordModal';
import { Copy, Edit3 } from 'lucide-react';

const ROLES = ['Master Super Admin', 'Super Admin', 'Admin', 'Operations Admin', 'Supervisor', 'Staff'];
const STATUS_STYLE = {
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  suspended: 'bg-slate-200 text-slate-600 border-slate-300',
  deactivated: 'bg-slate-200 text-slate-600 border-slate-300',
};

export default function UserManagement({ currentUser, users, usersError, onRefresh }) {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  const isSuperAdmin = currentUser?.role === 'Master Super Admin' || currentUser?.role === 'Super Admin';
  const isMasterSuperAdmin = currentUser?.role === 'Master Super Admin';
  const isAdmin = isSuperAdmin || currentUser?.role === 'Admin';

  const pendingUsers = users.filter(u => (u.status || '').toLowerCase() === 'pending');
  const activeUsers = users.filter(u => (u.status || '').toLowerCase() !== 'pending');

  const filteredActive = activeUsers.filter(u => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.employeeId || '').toLowerCase().includes(q) || (u.mobile || '').includes(q);
  });

  // Every action re-checks the signed-in user's role from the database before running.
  const act = async (fn, okMsg, roles = ROLE_SETS.ADMIN) => {
    setBusy(true); setMsg('');
    try { await requireActor(currentUser, roles); await fn(); setMsg(okMsg); await onRefresh(); }
    catch (e) { setMsg(e.message || 'কাজ ব্যর্থ।'); }
    finally { setBusy(false); setTimeout(() => setMsg(''), 3500); }
  };

  const approve = (u, opts) => act(async () => { await api.approveJoinRequest(u.id, opts, currentUser); }, `${u.name} অনুমোদিত হয়েছে (${opts.role})। এখন তিনি লগইন করতে পারবেন।`);
  const reject = (u) => act(async () => { await api.updateUserStatus(u.id, 'rejected', currentUser); }, `${u.name}-এর আবেদন বাতিল করা হয়েছে।`);
  const deactivate = (u) => act(async () => { await api.updateUserStatus(u.id, 'suspended', currentUser); }, `${u.name} স্থগিত করা হয়েছে।`);
  const reactivate = (u) => act(async () => { await api.updateUserStatus(u.id, 'approved', currentUser); }, `${u.name} পুনরায় সক্রিয় করা হয়েছে।`);
  const changeRole = (u, role) => act(async () => { await api.updateUserRole(u.id, role, currentUser); }, `${u.name}-এর রোল পরিবর্তন করা হয়েছে।`);
  // Delete and the password prompt open in-app dialogs. The browser's own confirm()/prompt() windows are
  // never shown inside the Android app (they return "no"/null), which is why those buttons did nothing there.
  const remove = (u) => setConfirmTarget(u);
  const doRemove = () => { const u = confirmTarget; setConfirmTarget(null); if (u) act(() => api.deleteUser(u.id, currentUser), `${u.name} মুছে ফেলা হয়েছে।`, ROLE_SETS.SUPER); };
  const resetPass = (u) => setResetTarget(u);
  const doResetPass = async (password) => {
    const u = resetTarget;
    setBusy(true); setMsg('');
    try {
      await requireActor(currentUser, ROLE_SETS.ADMIN);
      await api.resetUserPassword(u.id, password, currentUser);
      await onRefresh();
      setResetTarget(null);
      setMsg(`${u.name}-এর পাসওয়ার্ড রিসেট হয়েছে।`);
      setTimeout(() => setMsg(''), 3500);
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-teal-600 text-white flex items-center justify-center"><Users className="h-5 w-5" /></div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-slate-800">ইউজার ম্যানেজমেন্ট</h1>
            <p className="text-[11px] text-slate-500 font-medium">স্টাফ/সুপারভাইজার অনুমোদন, রোল ও অ্যাক্সেস ব্যবস্থাপনা</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(s => !s)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">
            <UserPlus className="h-4 w-4" /> নতুন ইউজার
          </button>
        )}
      </div>

      {usersError && <p role="alert" className="rounded-xl border border-destructive bg-muted p-3 text-sm text-destructive">{usersError}</p>}
      {msg && <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">{msg}</div>}

      {showCreate && isAdmin && <CreateUserForm currentUser={currentUser} onDone={() => { setShowCreate(false); onRefresh(); }} />}

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold w-full sm:w-auto">
        <button onClick={() => setTab('pending')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg ${tab === 'pending' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}>
          <Clock className="h-4 w-4" /> অনুমোদনের অপেক্ষায় <span className="px-1.5 rounded-full bg-amber-500 text-white">{pendingUsers.length}</span>
        </button>
        <button onClick={() => setTab('all')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg ${tab === 'all' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>
          <Users className="h-4 w-4" /> সকল ইউজার <span className="px-1.5 rounded-full bg-slate-300 text-slate-700">{users.length}</span>
        </button>
        {isAdmin && (
          <button onClick={() => setTab('duplicates')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg ${tab === 'duplicates' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}>
            <Copy className="h-4 w-4" /> ডুপ্লিকেট
          </button>
        )}
      </div>

      {tab === 'pending' && (
        <div className="space-y-2">
          {pendingUsers.length === 0 && (
            <div className="text-center py-10 text-slate-400">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm font-bold">কোনো অনুমোদনের অপেক্ষায় আবেদন নেই।</p>
            </div>
          )}
          {pendingUsers.map(u => (
            <PendingRequestCard key={u.id} u={u} busy={busy} isSuperAdmin={isSuperAdmin} onApprove={approve} onReject={reject} />
          ))}
        </div>
      )}

      {tab === 'all' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="নাম, ইমেইল, স্টাফ আইডি বা মোবাইল দিয়ে খুঁজুন..." className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm" />
          </div>
          {filteredActive.map(u => (
            <div key={u.id} className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-black shrink-0">{(u.name || '?').charAt(0).toUpperCase()}</div>
                  <div className="min-w-0">
                    <div className="font-black text-sm text-slate-800 truncate flex items-center gap-1.5">
                      {u.name}
                      {u.role === 'Super Admin' && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{u.email || '—'} · {u.employeeId || '—'} · {u.mobile || '—'}</div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${(STATUS_STYLE[(u.status || '').toLowerCase()] || 'bg-slate-100 text-slate-600 border-slate-200')}`}>{u.status || '—'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase">রোল:</span>
                <select value={u.role || 'Staff'} onChange={e => changeRole(u, e.target.value)} disabled={busy || u.id === currentUser?.id || (u.role === 'Super Admin' && !isMasterSuperAdmin) || u.role === 'Master Super Admin'}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold disabled:opacity-50">
                  {ROLES.filter(r => !(r === 'Master Super Admin') && !(r === 'Super Admin' && !isSuperAdmin)).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {isAdmin && u.id !== currentUser?.id && (
                  <>
                    <button disabled={busy} onClick={() => setEditTarget(u)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-100 text-teal-700 text-xs font-bold disabled:opacity-50"><Edit3 className="h-3.5 w-3.5" /> পরিবর্তন</button>
                    <button disabled={busy} onClick={() => resetPass(u)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold disabled:opacity-50"><KeyRound className="h-3.5 w-3.5" /> পাসওয়ার্ড রিসেট</button>
                    {(u.status || '').toLowerCase() === 'suspended' || (u.status || '').toLowerCase() === 'deactivated'
                      ? <button disabled={busy} onClick={() => reactivate(u)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold disabled:opacity-50"><BadgeCheck className="h-3.5 w-3.5" /> সক্রিয় করুন</button>
                      : <button disabled={busy} onClick={() => deactivate(u)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> স্থগিত</button>}
                    {isSuperAdmin && <button disabled={busy} onClick={() => remove(u)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-100 text-rose-700 text-xs font-bold disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> মুছুন</button>}
                  </>
                )}
              </div>
            </div>
          ))}
          {!usersError && filteredActive.length === 0 && <div className="text-center py-8 text-slate-400 text-sm font-bold">কোনো ইউজার পাওয়া যায়নি।</div>}
        </div>
      )}

      {tab === 'duplicates' && isAdmin && <DuplicateAuditPanel currentUser={currentUser} />}

      {editTarget && <EditStaffModal user={editTarget} currentUser={currentUser} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); onRefresh(); }} />}

      <ConfirmDialog
        open={!!confirmTarget}
        title={confirmTarget ? `${confirmTarget.name} মুছে ফেলতে চান?` : ''}
        message={confirmTarget ? `${confirmTarget.email || confirmTarget.employeeId || ''}\n\nএই অ্যাকাউন্ট ও তার ট্রাস্টেড ডিভাইস স্থায়ীভাবে মুছে যাবে। ফিরিয়ে আনা যাবে না।` : ''}
        confirmLabel="মুছে ফেলুন"
        onConfirm={doRemove}
        onClose={() => setConfirmTarget(null)}
      />
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} onSave={doResetPass} />}
    </div>
  );
}

function CreateUserForm({ currentUser, onDone }) {
  const isSuperAdmin = currentUser?.role === 'Master Super Admin' || currentUser?.role === 'Super Admin';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('Staff');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) { setErr('নাম দিন।'); return; }
    if (!email.trim() && !mobile.trim()) { setErr('ইমেইল অথবা মোবাইল নম্বর দিন।'); return; }
    if (!password || password.length < 6) { setErr('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের।'); return; }
    setBusy(true);
    try {
      await api.createUserByAdmin(currentUser, { name, email, mobile, role, password });
      onDone();
    } catch (ex) { setErr(ex.message || 'তৈরিতে সমস্যা।'); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-black text-slate-800"><ShieldCheck className="h-4 w-4 text-teal-600" /> সরাসরি ইউজার তৈরি (পূর্ব-অনুমোদিত)</div>
      {err && <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{err}</div>}
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="পূর্ণ নাম *" className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm" />
        <input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="মোবাইল নম্বর (লগইন আইডি)" className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm" />
      </div>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ইমেইল (অপশনাল — OTP-এর জন্য দিলে ভালো)" className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <select value={role} onChange={e => setRole(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold">
          {ROLES.filter(r => !(r === 'Master Super Admin') && !(r === 'Super Admin' && !isSuperAdmin)).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="পাসওয়ার্ড *" className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm" />
      </div>
      <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} ইউজার তৈরি করুন
      </button>
    </form>
  );
}