import React, { useState } from 'react';
import { Trash2, Pencil, Image as ImageIcon } from 'lucide-react';
import { recordProblems, FLAG_META } from '@/lib/sanmarineRules';
import { Card } from './formParts';
import PhotoThumb from './PhotoThumb';

const SEV_CHIP = { critical: 'bg-rose-600 text-white', high: 'bg-rose-100 text-rose-700', warning: 'bg-amber-100 text-amber-800', medium: 'bg-amber-100 text-amber-800' };

export default function EntryRow({ kind, item, vessels, lighters, onDelete, onEdit, onOpen }) {
  const [photos, setPhotos] = useState(false);
  const isLoading = kind === 'loading';
  const matched = isLoading ? !!item.emptyWeightMatched : !!item.loadingEntryId;
  const lighter = isLoading ? lighters.find((l) => l.id === item.lighterVesselId) : null;
  const vessel = isLoading ? vessels.find((v) => v.id === item.motherVesselId) : null;
  const date = isLoading ? item.date : item.emptyWeightDate;
  const time = isLoading ? item.time : item.emptyWeightTime;
  const ghat = isLoading ? item.ghatName : item.ghat;
  const problems = recordProblems(kind, item);
  const pics = isLoading
    ? [[item.scalePhoto, 'সেকেন্ড ওয়েট স্কেল কপি'], [item.monitorPhoto, 'মনিটর ছবি']]
    : [[item.tallyOriginalPhoto, 'খালি ওজন স্লিপ'], [item.monitorPhoto, 'মনিটর ছবি']];

  return (
    <Card className="flex items-start gap-3">
      <button type="button" onClick={() => onOpen && onOpen(item)} className="flex-1 min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-black text-sm font-mono text-slate-800">{item.truckNumber}</span>
          {isLoading && item.serial && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">#{item.serial}</span>}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${matched ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {isLoading ? (matched ? 'খালি ওজন ম্যাচড' : 'খালি ওজন বাকি') : (matched ? 'লোড হয়েছে' : 'লোড বাকি')}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">{date} {time} · {ghat || '—'}{item.scaleName ? ` · ${item.scaleName}` : ''}</div>
        {isLoading && <div className="text-[11px] text-slate-500">{vessel?.name || '—'} › {lighter?.name || '—'}{item.consigneeName ? ` · ${item.consigneeName}` : ''}{item.cargoName ? ` · ${item.cargoName}` : ''}</div>}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] font-bold text-slate-700 mt-1">
          {isLoading ? (
            <>
              <span>ব্যাগ: {item.bags || 0}</span><span>গ্রস: {item.gross}</span><span>খালি গাড়ি: {item.tare}</span>
              {item.secondWeight ? <span>সেকেন্ড: {item.secondWeight}</span> : null}
              <span className="text-teal-700">নেট: {item.net} KG</span>
            </>
          ) : (
            <><span>খালি গাড়ি: {item.tallyWeight}</span><span>মনিটর: {item.monitorWeight}</span><span>পার্থক্য: {item.difference}</span></>
          )}
        </div>
        {problems.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {problems.map((p) => (
              <span key={p.code} title={p.detail} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SEV_CHIP[FLAG_META[p.code]?.severity] || 'bg-slate-100 text-slate-600'}`}>{FLAG_META[p.code]?.label || p.code}</span>
            ))}
          </div>
        )}
        {photos && <div className="flex gap-2 mt-2">{pics.map(([uri, label]) => <PhotoThumb key={label} uri={uri} label={label} />)}</div>}
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {item.enteredByName || item.enteredBy ? <span className="text-[10px] text-slate-400">এন্ট্রি: {item.enteredByName || item.enteredBy}</span> : null}
          {item.createdAt && <span className="text-[10px] text-slate-400 font-mono">লগ: {new Date(item.createdAt).toLocaleString('en-GB')}</span>}
          {item.lastEditedAt && <span className="text-[10px] text-amber-500 font-mono">সম্পাদনা: {new Date(item.lastEditedAt).toLocaleString('en-GB')}</span>}
          <button type="button" onClick={(e) => { e.stopPropagation(); setPhotos((s) => !s); }} className="text-[10px] font-bold text-teal-700 flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {photos ? 'ছবি লুকান' : 'ছবি দেখুন'}</button>
        </div>
      </button>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={() => onEdit(item)} className="p-2 rounded-lg bg-slate-100 text-slate-600" title="সম্পাদনা"><Pencil className="h-4 w-4" /></button>
        <button onClick={() => onDelete(item)} className="p-2 rounded-lg bg-rose-50 text-rose-600" title="মুছুন"><Trash2 className="h-4 w-4" /></button>
      </div>
    </Card>
  );
}