import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, ScanLine, X } from 'lucide-react';
import { uploadPhoto } from '@/lib/sanmarinePhotos';
import PhotoThumb from './PhotoThumb';

// Camera + gallery photo input. value = stored private file_uri.
// onOcr: optional callback — after upload, triggers OCR to auto-fill form fields from the slip photo.
export default function PhotoField({ label, value, onChange, onOcr, ocrBusy, required, disabled }) {
  const camRef = useRef(null);
  const galRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const uri = await uploadPhoto(file);
      onChange(uri);
      if (onOcr) onOcr(uri);
    }
    catch (ex) { setErr(ex.message || 'আপলোড ব্যর্থ।'); }
    finally { setBusy(false); }
  };

  const btn = 'px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50';
  return (
    <div>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">{label}{required ? ' *' : ''}</span>
      <div className={`flex items-center gap-2 p-2 rounded-xl border ${value ? 'border-emerald-200 bg-emerald-50/40' : required ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50'}`}>
        <PhotoThumb uri={value} label={label} />
        <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
          <button type="button" disabled={disabled || busy} onClick={() => camRef.current?.click()} className={btn}><Camera className="h-3.5 w-3.5" /> ক্যামেরা</button>
          <button type="button" disabled={disabled || busy} onClick={() => galRef.current?.click()} className={btn}><ImagePlus className="h-3.5 w-3.5" /> গ্যালারি</button>
          {value && !disabled && <button type="button" onClick={() => onChange('')} className={`${btn} !text-rose-600`}><X className="h-3.5 w-3.5" /></button>}
          {busy && <span className="text-[11px] font-bold text-teal-700 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> আপলোড হচ্ছে...</span>}
          {ocrBusy && <span className="text-[11px] font-bold text-purple-700 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> OCR হচ্ছে...</span>}
          {value && onOcr && !busy && !ocrBusy && <button type="button" onClick={() => onOcr(value)} className={btn}><ScanLine className="h-3.5 w-3.5" /> স্ক্যান</button>}
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
        <input ref={galRef} type="file" accept="image/*" onChange={pick} className="hidden" />
      </div>
      {err && <span className="block text-[11px] font-semibold text-rose-600 mt-1">{err}</span>}
    </div>
  );
}