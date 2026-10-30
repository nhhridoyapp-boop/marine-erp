import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, ScanLine, X, RefreshCw } from 'lucide-react';
import { uploadPhoto, parsePhotos, packPhotos } from '@/lib/sanmarinePhotos';
import { runLimited } from '@/lib/sanmarineNet';
import PhotoThumb from './PhotoThumb';

// Several photos for ONE document (e.g. all pages of a Weighment Sheet / Point Khata): camera (tap again for the next page),
// gallery (multi-select), preview, replace or remove each photo on its own. value = packed list (see packPhotos).
// Files upload a few at a time; one bad file never stops the others, and the list is always rebuilt from the latest value.
export default function MultiPhotoField({ label, value, onChange, onScan, scanBusy, required, disabled, onBusy }) {
  const camRef = useRef(null);
  const galRef = useRef(null);
  const replRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [replaceAt, setReplaceAt] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = parsePhotos(value);

  const addFiles = async (files) => {
    setBusy(true); onBusy?.(true); setErr('');
    const results = await runLimited(files.map((f) => async () => {
      try { return { uri: await uploadPhoto(f) }; } catch (ex) { return { error: ex.message || 'আপলোড ব্যর্থ।' }; }
    }), 3);
    const added = results.filter((r) => r.uri).map((r) => r.uri);
    const failed = results.filter((r) => r.error);
    if (added.length) onChange(packPhotos([...parsePhotos(valueRef.current), ...added]));
    if (failed.length) setErr(`${failed.length}টি ছবি আপলোড হয়নি: ${failed[0].error}`);
    setBusy(false); onBusy?.(false);
  };
  const replaceFile = async (file) => {
    if (!file || replaceAt < 0) return;
    setBusy(true); onBusy?.(true); setErr('');
    try {
      const uri = await uploadPhoto(file);
      onChange(packPhotos(parsePhotos(valueRef.current).map((u, i) => (i === replaceAt ? uri : u))));
    } catch (ex) { setErr(ex.message || 'আপলোড ব্যর্থ।'); }
    setBusy(false); onBusy?.(false); setReplaceAt(-1);
  };
  const pick = (e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) addFiles(files); };
  const pickReplace = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; replaceFile(f); };

  const btn = 'px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50';
  const mini = 'p-1 rounded-md bg-white/95 border border-slate-200 shadow-sm disabled:opacity-50';
  return (
    <div>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">{label}{required ? ' *' : ''} <span className="normal-case text-slate-400">({list.length}টি ছবি)</span></span>
      <div className={`p-2 rounded-xl border space-y-2 ${list.length ? 'border-emerald-200 bg-emerald-50/40' : required ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50'}`}>
        {list.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {list.map((uri, i) => (
              <div key={`${uri}-${i}`} className="relative">
                <PhotoThumb uri={uri} label={`${label} ${i + 1}`} size="h-20 w-20" />
                {!disabled && (
                  <div className="absolute -top-1.5 -right-1.5 flex gap-1">
                    <button type="button" disabled={busy} title="বদলান" onClick={() => { setReplaceAt(i); replRef.current?.click(); }} className={mini}><RefreshCw className="h-3 w-3 text-slate-600" /></button>
                    <button type="button" disabled={busy} title="মুছুন" onClick={() => onChange(packPhotos(parsePhotos(valueRef.current).filter((_, k) => k !== i)))} className={mini}><X className="h-3 w-3 text-rose-600" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 items-center">
          <button type="button" disabled={disabled || busy} onClick={() => camRef.current?.click()} className={btn}><Camera className="h-3.5 w-3.5" /> ক্যামেরা (পরের পাতায় আবার চাপুন)</button>
          <button type="button" disabled={disabled || busy} onClick={() => galRef.current?.click()} className={btn}><ImagePlus className="h-3.5 w-3.5" /> গ্যালারি (একাধিক)</button>
          {onScan && list.length > 0 && !busy && !scanBusy && <button type="button" onClick={onScan} className={`${btn} !bg-purple-100 !text-purple-800`}><ScanLine className="h-3.5 w-3.5" /> সব ছবি স্ক্যান</button>}
          {busy && <span className="text-[11px] font-bold text-teal-700 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> আপলোড হচ্ছে...</span>}
          {scanBusy && <span className="text-[11px] font-bold text-purple-700 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> সব পৃষ্ঠা স্ক্যান হচ্ছে...</span>}
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
        <input ref={galRef} type="file" accept="image/*,.heic,.heif" multiple onChange={pick} className="hidden" />
        <input ref={replRef} type="file" accept="image/*,.heic,.heif" onChange={pickReplace} className="hidden" />
      </div>
      {err && <span className="block text-[11px] font-semibold text-rose-600 mt-1">{err}</span>}
    </div>
  );
}