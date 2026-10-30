import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';

const ROLES = ['Master Super Admin', 'Super Admin', 'Admin', 'Operations Admin', 'Supervisor', 'Staff'];
const EMP_TYPES = ['Staff', 'Supervisor', 'Admin', 'Permanent Staff'];

// Edit existing staff: name, email, mobile, employeeId, designation, department, joiningDate, employeeType, role.
// Preserves all historical records — only the ERPUser record is patched. Backend enforces ERP role hierarchy.
export default function EditStaffModal({ user, currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: user.name || '', email: user.email || '', mobile: user.mobile || '',
    employeeId: user.employeeId || '', designation: user.designation || '',
    department: user.department || '', joiningDate: user.joiningDate || '',
    employeeType: user.employeeType || 'Staff', role: user.role || 'Staff',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const isMaster = currentUser?.role === 'Master Super Admin';
  const isSuper = isMaster || currentUser?.role === 'Super Admin';
  const allowedRoles = ROLES.filter(r => !(r === 'Master Super Admin') && !(r === 'Super Admin' && !isSuper));

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.name.trim()) { setErr('নাম আবশ্যক।'); return; }
    setBusy(true);
    try {
      await requireActor(currentUser, ROLE_SETS.ADMIN);
      await api.editStaff(user.id, form, currentUser);
      onSaved();
    } catch (ex) {
      setErr(ex.message || 'পরিবর্তন ব্যর্থ।');
    } finally { setBusy(false); }
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm';
  const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="font-black text-sm text-slate-800">স্টাফ পরিবর্তন — {user.name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <form onSubmit={save} className="p-4 space-y-3">
          {err && <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>পূর্ণ নাম *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>মোবাইল</label><input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>ইমেইল</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>স্টাফ আইডি</label><input value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} placeholder={form.employeeType === 'Permanent Staff' ? 'Permanent Staff — আইডি ঐচ্ছিক' : 'আইডি'} className={`${inputCls} font-mono uppercase`} /></div>
            <div><label className={labelCls}>পদবি</label><input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>বিভাগ</label><input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>যোগদানের তারিখ</label><input type="date" value={form.joiningDate} onChange={e => setForm({ ...form, joiningDate: e.target.value })} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>কর্মচারী শ্রেণি</label>
              <select value={form.employeeType} onChange={e => setForm({ ...form, employeeType: e.target.value })} className={inputCls}>
                {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>রোল</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inputCls} disabled={user.role === 'Master Super Admin' || (user.role === 'Super Admin' && !isMaster)}>
                {allowedRoles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          {form.employeeType === 'Permanent Staff' && (
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-100 text-[11px] text-sky-900">
              Permanent Staff হিসেবে চিহ্নিত করলে স্টাফ আইডি ঐচ্ছিক। আইডি না থাকলে "Not Assigned" দেখাবে।
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">বাতিল</button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} সংরক্ষণ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}