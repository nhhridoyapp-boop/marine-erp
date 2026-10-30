import React from 'react';
import ProfileAvatar from './ProfileAvatar';

export default function ProfileCard({ user }) {
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/70 p-3">
      <ProfileAvatar className="h-14 w-14" />
      <div className="min-w-0">
        <div className="truncate text-sm font-black text-white">{user.name}</div>
        <div className="text-[11px] font-bold text-teal-300">{user.role}</div>
        <div className="truncate text-[10px] text-slate-400">{[user.employeeId, user.email].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}