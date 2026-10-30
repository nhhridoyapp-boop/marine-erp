import React, { useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';

// In-app password prompt. The browser's prompt() window never appears inside the Android app (it returns
// null), so an admin password reset typed there could never be entered from the phone.
export default function ResetPasswordModal({ user, onClose, onSave }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setErr('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'); return; }
    setBusy(true); setErr('');
    try { await onSave(password); } catch (ex) { setErr(ex.message || 'পাসওয়ার্ড রিসেট ব্যর্থ।'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-black text-slate-800"><KeyRound className="h-4 w-4 text-amber-600" /> পাসওয়ার্ড রিসেট</div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="বন্ধ করুন" className="text-slate-400 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-slate-600">{user?.name}-এর জন্য নতুন পাসওয়ার্ড দিন (কমপক্ষে ৬ অক্ষর)।</p>
        {err && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-700">{err}</div>}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="নতুন পাসওয়ার্ড"
          autoFocus
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
        />
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-black text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} রিসেট করুন
        </button>
      </form>
    </div>
  );
}