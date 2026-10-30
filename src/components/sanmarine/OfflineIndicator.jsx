import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineIndicator() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-full bg-rose-600 text-white text-xs font-black flex items-center gap-2 shadow-lg print:hidden">
      <WifiOff className="h-4 w-4" /> ইন্টারনেট সংযোগ নেই — ডাটা সংরক্ষণ হবে না
    </div>
  );
}