import React, { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { normalizeTruckNumber } from '@/utils/truckUtils';
import { History } from 'lucide-react';

export default function HistoricalWeightHistory({ truckNumber, currentWeight }) {
  const [norm, setNorm] = useState('');
  useEffect(() => { setNorm(''); const timer = setTimeout(() => setNorm(normalizeTruckNumber(truckNumber)), 500); return () => clearTimeout(timer); }, [truckNumber]);
  const ready = /\d{5,7}$/.test(norm);
  const q = useInfiniteQuery({ queryKey: ['historical-empty-weight', norm], enabled: ready, initialPageParam: undefined, retry: false, staleTime: 0, gcTime: 0,
    queryFn: async ({ pageParam }) => {
      if (!await base44.auth.isAuthenticated()) throw new Error('সুরক্ষিত পুরোনো ইতিহাস দেখতে Google/প্ল্যাটফর্ম লগইন প্রয়োজন।');
      return base44.entities.HistoricalEmptyWeight.filter({ normalizedTruckNumber: norm, recordType: 'HISTORICAL_EMPTY_WEIGHT' }, { sort: '-weighedAt', limit: 20, cursor: pageParam, fields: ['truckNumber', 'tareWeight', 'weighmentDate', 'weighmentTime', 'ghat', 'scaleName', 'sourceFileName', 'sourceRow'] });
    }, getNextPageParam: (page) => page.has_more ? page.next_cursor : undefined });
  if (!ready || norm !== normalizeTruckNumber(truckNumber)) return null;
  const rows = q.data?.pages.flatMap((p) => p.items) || [], weight = Number(currentWeight);
  // কোনো Historical ডেটা আপলোড না হলে বা query ব্যর্থ হলে (rate limit সহ) পুরো সেকশন দেখাবে না।
  if (!q.isSuccess || !rows.length) return null;
  return <section className="rounded-xl border border-border bg-muted p-3 text-xs space-y-2">
    <h3 className="flex items-center gap-2 font-bold"><History className="h-4 w-4" /> Historical Empty Weight — পুরোনো ওজন</h3>
    <p className="text-muted-foreground">শুধু তুলনার জন্য; বর্তমান এন্ট্রিতে স্বয়ংক্রিয়ভাবে বসবে না বা ট্রিপের সঙ্গে যুক্ত হবে না।</p>
    {rows.map((r) => <article key={r.id} className="border-t border-border pt-2">
      <p className="font-semibold">{r.truckNumber} · {r.tareWeight} KG · {r.weighmentDate} {r.weighmentTime || 'সময় নেই'}</p>
      <p>ঘাট: {r.ghat || 'তথ্য নেই'} · স্কেল: {r.scaleName || 'তথ্য নেই'}</p>
      <p className="text-muted-foreground">উৎস: {r.sourceFileName} · সারি {r.sourceRow}</p>
      {Number.isFinite(weight) && weight > 0 && <p>বর্তমান ওজনের পার্থক্য: {(weight - r.tareWeight).toLocaleString('en-IN')} KG</p>}
    </article>)}
    {q.hasNextPage && <button type="button" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} className="font-semibold underline">{q.isFetchingNextPage ? 'লোড হচ্ছে...' : 'আরও পুরোনো রেকর্ড'}</button>}
  </section>;
}