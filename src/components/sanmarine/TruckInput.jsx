import React, { useState, useRef, useEffect, useMemo } from 'react';
import { inputCls } from './formParts';

// Free-text truck-number input with autocomplete from existing records.
// The user can always type a brand-new number (manual entry is never blocked).
// Selecting a suggestion just fills the field — it does NOT create a duplicate
// master record. Truck normalization / duplicate detection / trip matching run
// downstream exactly as before.
export default function TruckInput({ value, onChange, suggestions = [], placeholder = 'যেমন: DMT-123456', disabled }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);

  const q = (value || '').trim().toUpperCase();
  const filtered = useMemo(() => {
    if (q.length < 1) return suggestions.slice(0, 30);
    const matches = suggestions.filter((s) => s.toUpperCase().includes(q));
    return matches.slice(0, 30);
  }, [suggestions, q]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const onKey = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); onChange(filtered[active]); setOpen(false); }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        disabled={disabled}
        className={`${inputCls} uppercase font-mono`}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={s + i}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => { onChange(s); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm font-mono font-bold uppercase ${i === active ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}