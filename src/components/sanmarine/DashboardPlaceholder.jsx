import React from 'react';
import { Loader2, WifiOff, RefreshCw } from 'lucide-react';

// Shown in place of the dashboard numbers until they have been loaded. The rest of the app (menu, other screens) stays usable.
export default function DashboardPlaceholder({ syncing, error, onRetry }) {
  return (
    <div className="max-w-md mx-auto p-6 mt-10 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
      {error
        ? <WifiOff className="h-8 w-8 text-amber-500 mx-auto" />
        : <Loader2 className="h-8 w-8 text-teal-600 animate-spin mx-auto" />}
      <p className="text-sm font-black text-slate-800">
        {error ? 'সার্ভার সংযোগ নেই — ড্যাশবোর্ড সাময়িকভাবে খালি' : 'ড্যাশবোর্ড লোড হচ্ছে...'}
      </p>
      <p className="text-xs text-slate-500 font-medium">
        আপনি লগইন আছেন এবং সংরক্ষিত ডাটা নিরাপদ। সংযোগ ঠিক হলে নিজে থেকেই লোড হবে — অন্য মেনুও ব্যবহার করতে পারেন।
      </p>
      <button type="button" onClick={onRetry} disabled={syncing} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> আবার চেষ্টা করুন
      </button>
    </div>
  );
}