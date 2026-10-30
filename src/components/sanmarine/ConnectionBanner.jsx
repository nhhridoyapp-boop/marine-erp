import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, X } from 'lucide-react';

// Non-blocking notice: the user stays signed in and keeps their open form; data reloads automatically when the connection recovers.
export default function ConnectionBanner({ message, onRetry, busy }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(false); }, [message]);
  if (dismissed || !message) return null;
  return (
    <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-3 py-1.5 flex items-center gap-2 text-[11px] font-bold">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-0 truncate">{message}</span>
      <button type="button" onClick={onRetry} disabled={busy} className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-60">
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> আবার চেষ্টা
      </button>
      <button type="button" onClick={() => setDismissed(true)} className="shrink-0 p-1 rounded-lg hover:bg-amber-200 text-amber-700" aria-label="বন্ধ করুন">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}