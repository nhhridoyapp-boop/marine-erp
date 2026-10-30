import React from 'react';
import { Briefcase, BadgeCheck, HelpCircle } from 'lucide-react';

const POSITIONS = [
  { id: 'Admin', sub: 'অ্যাডমিন' },
  { id: 'Supervisor', sub: 'সুপারভাইজার' },
  { id: 'Staff', sub: 'স্টাফ' },
];
const LBL = 'block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5';
const pick = (on) => `py-2 px-2 rounded-xl border text-center transition-all ${on ? 'bg-teal-600 border-teal-600 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-teal-300'}`;

// Join Request: the applicant picks the position they are applying for and either enters their own ID or says they have none.
// Both are only a REQUEST — the final role and any new ID are decided by an authorised Admin/Super Admin at approval.
export default function JoinRequestFields({ position, setPosition, hasId, setHasId, empId, setEmpId }) {
  return (
    <div className="space-y-3">
      <div>
        <label className={LBL}><Briefcase className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />আবেদনের পদ (Position) *</label>
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map((p) => (
            <button key={p.id} type="button" aria-pressed={position === p.id} onClick={() => setPosition(p.id)} className={pick(position === p.id)}>
              <span className="block text-xs font-black">{p.id}</span>
              <span className="block text-[10px] font-semibold opacity-80">{p.sub}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">এটি শুধু আবেদন — চূড়ান্ত পদ অ্যাডমিন/সুপার অ্যাডমিন অনুমোদনের সময় নির্ধারণ করবেন।</p>
      </div>

      <div>
        <label className={LBL}><BadgeCheck className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />স্টাফ আইডি (ID) *</label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={hasId === 'yes'} onClick={() => setHasId('yes')} className={pick(hasId === 'yes')}><span className="block text-xs font-black">আমার আইডি আছে</span></button>
          <button type="button" aria-pressed={hasId === 'no'} onClick={() => setHasId('no')} className={pick(hasId === 'no')}><span className="block text-xs font-black">আমার আইডি নেই</span></button>
        </div>
        {hasId === 'yes' && (
          <div className="mt-2">
            <input type="text" value={empId} onChange={(e) => setEmpId(e.target.value)} placeholder="আপনার নিজের আইডি লিখুন"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm font-mono uppercase" />
            <p className="text-[10px] text-slate-500 mt-1">আপনার দেওয়া আইডি অ্যাডমিন যাচাই করবেন; সঠিক না হলে অনুমোদনের সময় বদলে দেওয়া হবে।</p>
          </div>
        )}
        {hasId === 'no' && (
          <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-sky-50 border border-sky-100 text-[11px] text-sky-900">
            <HelpCircle className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
            <span>আইডি নিজে তৈরি করা যায় না। অনুমোদনের সময় অথরাইজড অ্যাডমিন/সুপার অ্যাডমিন আপনাকে আইডি দেবেন — আইডি না পাওয়া পর্যন্ত লগইন চালু হবে না।</span>
          </div>
        )}
      </div>
    </div>
  );
}