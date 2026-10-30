import React, { useState, useEffect, useRef } from 'react';
import { Save, X, Loader2 } from 'lucide-react';
import { Field, Card, Notice, inputCls, primaryBtn, ghostBtn } from './formParts';
import SearchSelect from './SearchSelect';
import { api } from '@/lib/sanmarineApi';

export default function MasterForm({ cfg, kind, initial, lookups, onSave, onCancel, busy }) {
  const [v, setV] = useState(() => Object.fromEntries(cfg.fields.map(f => [f.key, initial?.[f.key] ?? f.default ?? ''])));
  const [err, setErr] = useState('');
  const [matches, setMatches] = useState([]);
  const [exactDup, setExactDup] = useState(null);
  const [matching, setMatching] = useState(false);
  const tRef = useRef(null);
  const optionsOf = (f) => (f.options ? f.options.map(o => ({ value: o, label: o })) : (lookups[f.from] || []).map(o => ({ value: o.id, label: o.name })));
  const isNew = !initial?.id;
  const nameField = cfg.fields.find(f => f.key === 'name');

  // Fuzzy duplicate check while typing a new name: shows existing close/exact matches so the user
  // picks the existing one instead of creating a duplicate from a spelling mistake.
  useEffect(() => {
    if (!isNew || !nameField || !kind) return;
    const q = String(v.name || '').trim();
    if (tRef.current) clearTimeout(tRef.current);
    if (q.length < 2) { setMatches([]); setExactDup(null); return; }
    setMatching(true);
    tRef.current = setTimeout(async () => {
      try {
        const res = await api.matchMasters(kind, q, v.company);
        const ms = res.matches || [];
        setMatches(ms);
        setExactDup(ms.find(m => m.exact) || null);
      } catch (e) { setMatches([]); setExactDup(null); }
      finally { setMatching(false); }
    }, 300);
    return () => tRef.current && clearTimeout(tRef.current);
  }, [v.name, v.company, kind, isNew]);

  const submit = (e) => {
    e.preventDefault();
    if (exactDup) { setErr(`"${exactDup.name}" আগে থেকেই আছে — ডুপ্লিকেট এন্ট্রি হতে পারবে না।`); return; }
    const miss = cfg.fields.find(f => f.required && !String(v[f.key]).trim());
    if (miss) { setErr(`${miss.label} আবশ্যক।`); return; }
    const data = {};
    cfg.fields.forEach(f => {
      const x = typeof v[f.key] === 'string' ? v[f.key].trim() : v[f.key];
      if (x === '') return;
      data[f.key] = f.type === 'number' ? Number(x) : x;
    });
    onSave(cfg.beforeSave ? cfg.beforeSave(data, lookups) : data);
  };

  const pickMatch = (m) => {
    setV(p => ({ ...p, name: m.name, ...(m.company ? { company: m.company } : {}) }));
  };

  const renderNameField = (f) => (
    <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
      <div className="relative">
        <input type={f.type || 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={v[f.key]}
          onChange={e => setV(p => ({ ...p, [f.key]: e.target.value }))} className={inputCls} autoComplete="off" />
        {(matching || (matches.length > 0)) && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
            {matching && <div className="px-3 py-2 text-xs text-slate-400">অনুরূপ নাম খোঁজা হচ্ছে...</div>}
            {!matching && matches.map(m => (
              <button type="button" key={m.id} onClick={() => pickMatch(m)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0 ${m.exact ? 'bg-rose-50' : ''}`}>
                <span className="font-bold text-slate-800">{m.name}</span>
                {m.company && <span className="text-slate-400"> · {m.company}</span>}
                {m.exact
                  ? <span className="float-right text-rose-600 font-bold">হুবহু মিল</span>
                  : <span className="float-right text-amber-600">কাছাকাছি মিল</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </Field>
  );

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm font-black text-slate-800">{initial?.id ? 'সম্পাদনা' : 'নতুন যুক্ত করুন'} — {cfg.title}</div>
        {err && <Notice kind="error">{err}</Notice>}
        {exactDup && <Notice kind="error">⚠️ "{exactDup.name}" আগে থেকেই আছে — ডুপ্লিকেট এন্ট্রি ব্লক করা হয়েছে। অনুগ্রহ করে এই নামটি ব্যবহার করুন, নতুন এন্ট্রি করবেন না।</Notice>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cfg.fields.map(f => (
            f.key === 'name' && isNew
              ? renderNameField(f)
              : <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
                  {f.options || f.from
                    ? <SearchSelect value={v[f.key]} onChange={x => setV(p => ({ ...p, [f.key]: x }))} options={optionsOf(f)} />
                    : <input type={f.type || 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={v[f.key]} onChange={e => setV(p => ({ ...p, [f.key]: e.target.value }))} className={inputCls} />}
                </Field>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={busy || !!exactDup} className={`${primaryBtn} flex-1`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} সংরক্ষণ</button>
          <button type="button" onClick={onCancel} className={ghostBtn}><X className="h-4 w-4" /> বাতিল</button>
        </div>
      </form>
    </Card>
  );
}