import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { resetAppShellAndReload } from '@/lib/startupGuard';

// Full-screen loading / error state used while the app starts. Never blank: always shows the brand, a message and,
// when loading is slow or something failed, a Retry button.
export default function StartupScreen({
  state = 'loading', message = '', detail = '', onRetry, retryLabel = 'আবার চেষ্টা করুন', secondary, slowAfterMs = 8000,
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (state !== 'loading') return undefined;
    setSlow(false);
    const t = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(t);
  }, [state, slowAfterMs]);

  const isError = state === 'error';
  const showActions = isError || slow;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center bg-[#0B2A4A] text-white">
      <img src="/sanmarine-logo.png" alt="" className="h-16 w-16 rounded-2xl object-contain mb-3" />
      <div className="text-sm font-black tracking-wide">SAN MARINE SURVEY &amp; INSPECTION</div>
      <div className="mt-5">
        {isError
          ? <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto" />
          : <Loader2 className="h-8 w-8 text-teal-300 animate-spin mx-auto" />}
      </div>
      {message && <p className="mt-3 text-sm font-bold text-slate-100 max-w-sm">{message}</p>}
      {!isError && slow && <p className="mt-2 text-xs text-slate-300 max-w-sm">নেটওয়ার্ক ধীর মনে হচ্ছে। অপেক্ষা করুন অথবা আবার চেষ্টা করুন।</p>}
      {detail && <p className="mt-2 text-[10px] font-mono text-slate-400 max-w-sm break-words">{detail}</p>}
      {showActions && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button type="button" onClick={onRetry} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black">
              <RefreshCw className="h-4 w-4" /> {retryLabel}
            </button>
          )}
          {secondary && (
            <button type="button" onClick={secondary.onClick} className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold">{secondary.label}</button>
          )}
          <button type="button" onClick={resetAppShellAndReload} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600">অ্যাপ রিফ্রেশ</button>
        </div>
      )}
      {showActions && <p className="mt-4 text-[10px] text-slate-400 max-w-xs">আপনার সংরক্ষিত ডাটা সার্ভারে নিরাপদ আছে — রিফ্রেশে কিছু মুছে যায় না।</p>}
    </div>
  );
}