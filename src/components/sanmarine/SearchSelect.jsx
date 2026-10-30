import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';
import { inputCls } from './formParts';

// Searchable combobox for dropdown fields. Preserves the onChange(value) API of the
// plain Select: the parent still gets the selected option's `value`. The user can type
// to filter, pick with mouse or keyboard, and the selected label is shown when closed.
// Existing auto-fill / data relationships are untouched — only the picker UI changes.
export default function SearchSelect({ value, onChange, options = [], placeholder = '— নির্বাচন করুন —', disabled, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.label || '').toLowerCase().includes(q) || (o.value || '').toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) { inputRef.current.focus(); setActive(0); }
  }, [open]);

  const pick = (o) => { onChange(o.value); setOpen(false); setQuery(''); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <div
        className={`${inputCls} flex items-center justify-between cursor-pointer ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={selected ? 'text-slate-800 truncate' : 'text-slate-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg max-h-64 flex flex-col">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKey}
              placeholder="লিখে খুঁজুন..."
              className="flex-1 outline-none text-sm font-medium bg-transparent"
            />
            {query && <button type="button" onClick={() => setQuery('')}><X className="h-3.5 w-3.5 text-slate-400" /></button>}
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400 font-medium">কোনো মিল পাওয়া যায়নি</div>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={o.value || i}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={`w-full text-left px-3 py-2 text-sm font-medium flex items-center justify-between gap-2 ${i === active ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'} ${o.value === value ? 'font-black' : ''}`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="h-4 w-4 text-teal-600 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}