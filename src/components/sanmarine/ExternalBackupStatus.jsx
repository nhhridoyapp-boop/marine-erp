import React, { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card } from './formParts';

// Honest status of the independent (external) backup. The app's own server storage is NOT counted as independent.
export default function ExternalBackupStatus() {
  const [last, setLast] = useState(undefined);
  useEffect(() => {
    base44.entities.AuditLog.filter({ action: 'BACKUP_DOWNLOADED' }, { sort: '-created_date', limit: 1 })
      .then((p) => setLast((p.items && p.items[0]) || null))
      .catch(() => setLast(null));
  }, []);

  const when = last ? new Date(last.timestamp || last.created_date) : null;
  const days = when ? Math.floor((Date.now() - when.getTime()) / 86400000) : null;
  const stale = last === null || (days !== null && days >= 7);

  return (
    <Card className="space-y-2 border-rose-200">
      <div className="flex items-center gap-2 text-sm font-black text-rose-700"><CloudOff className="h-4 w-4" /> Independent External Backup: NOT CONFIGURED</div>
      <p className="text-xs text-slate-600">Google Drive বা অন্য কোনো বাইরের ক্লাউড স্টোরেজ এখনো সংযুক্ত নেই। অ্যাপের নিজস্ব সার্ভার-স্টোরেজে রাখা ব্যাকআপ "ইনডিপেনডেন্ট ব্যাকআপ" হিসেবে গণ্য করা হয় না।</p>
      <p className="text-xs text-slate-600">যতদিন সংযুক্ত না হচ্ছে, নিচের "ডাউনলোড" দিয়ে ব্যাকআপ ফাইল নিয়মিত আপনার কম্পিউটার বা নিজের Google Drive-এ সংরক্ষণ করুন।</p>
      <div className={`text-[11px] font-bold ${stale ? 'text-amber-700' : 'text-emerald-700'}`}>
        {last === undefined && 'সর্বশেষ ডাউনলোড যাচাই হচ্ছে...'}
        {last === null && 'এখনো কোনো ব্যাকআপ ডিভাইসে ডাউনলোড করা হয়নি — এখনই একটি ডাউনলোড করুন।'}
        {when && `সর্বশেষ ডিভাইসে ডাউনলোড: ${when.toLocaleString('en-GB')} (${days} দিন আগে)${stale ? ' — ৭ দিনের বেশি, আবার ডাউনলোড করুন।' : ''}`}
      </div>
    </Card>
  );
}