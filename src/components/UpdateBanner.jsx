import React from 'react';
import { RefreshCw } from 'lucide-react';
import useAppUpdate from '@/lib/appUpdate';

// "New version available" notice. Updating reloads the app files only — the login and all saved data stay as they are.
export default function UpdateBanner() {
  const { ready, apply, dismiss } = useAppUpdate();
  if (!ready) return null;
  return (
    <div className="fixed bottom-20 sm:bottom-4 inset-x-3 sm:inset-x-auto sm:right-4 sm:w-96 z-[90] bg-[#0B2A4A] text-white rounded-2xl shadow-2xl px-3.5 py-3 flex items-center gap-3">
      <RefreshCw className="h-5 w-5 text-teal-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-black">নতুন ভার্সন প্রস্তুত</div>
        <div className="text-[10px] text-slate-300 font-medium">আপডেট করলে আপনার লগইন ও ডাটা অক্ষত থাকবে।</div>
      </div>
      <button type="button" onClick={apply} className="px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black shrink-0">আপডেট</button>
      <button type="button" onClick={dismiss} className="text-[11px] text-slate-300 font-bold shrink-0">পরে</button>
    </div>
  );
}