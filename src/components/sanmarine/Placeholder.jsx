import React from 'react';
import { Construction } from 'lucide-react';

export default function Placeholder({ title, subtitle }) {
  return (
    <div className="max-w-6xl mx-auto p-6 pb-28">
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-teal-50 border border-teal-100 mb-3">
          <Construction className="h-6 w-6 text-teal-600" />
        </div>
        <h2 className="text-lg font-black text-slate-800">{title || 'এই সেকশনটি প্রস্তুত হচ্ছে'}</h2>
        <p className="text-sm text-slate-500 mt-1">{subtitle || 'এই অংশটি পরবর্তী ধাপে যুক্ত করা হবে।'}</p>
      </div>
    </div>
  );
}