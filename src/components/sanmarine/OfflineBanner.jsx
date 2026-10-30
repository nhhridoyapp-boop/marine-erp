import React, { useState, useEffect } from 'react';

// Shown when the device has no internet: data can be viewed but entries/photos cannot be saved.
export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return <div className="bg-amber-500 text-slate-950 text-xs font-bold text-center py-1.5 px-3">ইন্টারনেট সংযোগ নেই — নতুন এন্ট্রি ও ছবি সংরক্ষণ করা যাবে না। সংযোগ ফিরলে আবার চেষ্টা করুন।</div>;
}