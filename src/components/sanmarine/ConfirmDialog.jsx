import React from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

// In-app confirmation. The browser's own confirm() window never appears inside the Android app, so a
// destructive button wired to it silently does nothing there. Every such action uses this dialog instead.
export default function ConfirmDialog({ open, title, message, confirmLabel = 'নিশ্চিত করুন', danger = true, busy = false, onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-black text-slate-800">
            <AlertTriangle className={`h-4 w-4 shrink-0 ${danger ? 'text-rose-600' : 'text-teal-600'}`} /> {title}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="বন্ধ করুন" className="text-slate-400 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>
        {message && <p className="text-xs text-slate-600 whitespace-pre-line">{message}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">বাতিল</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black text-white disabled:opacity-50 ${danger ? 'bg-rose-600' : 'bg-teal-600'}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}