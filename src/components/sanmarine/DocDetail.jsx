import React from 'react';
import { reconcileDocs } from '@/lib/sanmarineRules';
import { parsePhotos } from '@/lib/sanmarinePhotos';
import { docRows } from '@/lib/sanmarineKhataRows';
import DocReconcilePanel from './DocReconcilePanel';
import PhotoThumb from './PhotoThumb';
import useSystemTrucks from './useSystemTrucks';

const safeJoin = (s) => { try { return JSON.parse(s || '[]').join('\n'); } catch (e) { return ''; } };

const Group = ({ title, uris }) => (
  <div>
    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{title} ({uris.length}টি ছবি)</div>
    <div className="flex flex-wrap gap-2">
      {uris.length ? uris.map((u, i) => <PhotoThumb key={`${u}-${i}`} uri={u} label={`${title} ${i + 1}`} size="h-20 w-20" />) : <PhotoThumb uri="" label={title} size="h-20 w-20" />}
    </div>
  </div>
);

// Opened details of a saved daily document: all photos + sheet vs khata vs system comparison (also truck by truck bags).
export default function DocDetail({ d }) {
  const sys = useSystemTrucks({ date: d.date, lighterVesselId: d.lighterVesselId, ghatName: d.ghatName });
  const rec = reconcileDocs({ wsText: safeJoin(d.weighmentTruckNumbers), pkText: safeJoin(d.pointKhataTruckNumbers), wsBags: d.scaleTotalBags, pkBags: d.pointKhataTotalBags });
  const wsRows = docRows(d.weighmentRows, d.weighmentTruckNumbers);
  const pkRows = docRows(d.pointKhataRows, d.pointKhataTruckNumbers);
  return (
    <div className="space-y-2">
      <Group title="ওয়েইমেন্ট শিট" uris={parsePhotos(d.weighmentSheetPhoto)} />
      <Group title="পয়েন্ট খাতা" uris={parsePhotos(d.pointKhataPhoto)} />
      <DocReconcilePanel rec={rec} wsBags={d.scaleTotalBags} pkBags={d.pointKhataTotalBags} sys={sys} wsRows={wsRows} pkRows={pkRows} />
    </div>
  );
}