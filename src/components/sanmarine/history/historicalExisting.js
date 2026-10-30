import { base44 } from '@/api/base44Client';
import { withRetry } from '@/lib/sanmarineNet';
import { naturalKey, tripKey, timeValue } from '@/components/sanmarine/history/historicalValues';

async function readMatches(entity, query, fields) {
  const items = []; let cursor;
  do {
    const page = await withRetry(() => entity.filter(query, { limit: 100, cursor, fields }), { tries: 2, base: 1500 });
    items.push(...page.items); cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return items;
}
export default async function historicalExisting(candidates) {
  const valid = candidates.filter((c) => c.status === 'VALID');
  const norms = [...new Set(valid.map((c) => c.record.normalizedTruckNumber))];
  const dates = [...new Set(valid.map((c) => c.record.weighmentDate))];
  const exact = new Map(), trips = new Map(), sources = new Set();
  const remember = (r, kind) => {
    exact.set(naturalKey(r), { id: r.id, kind });
    const key = tripKey(r); if (!trips.has(key)) trips.set(key, new Set());
    trips.get(key).add(naturalKey(r)); if (r.sourceKey) sources.add(r.sourceKey);
  };
  for (let i = 0; i < norms.length; i += 50) {
    const truckQuery = { normalizedTruckNumber: { $in: norms.slice(i, i + 50) } };
    const historic = await readMatches(base44.entities.HistoricalEmptyWeight, { ...truckQuery, weighmentDate: { $in: dates } }, ['normalizedTruckNumber', 'tareWeight', 'weighmentDate', 'weighmentTime', 'ghat', 'scaleName', 'sourceKey']);
    historic.forEach((r) => remember(r, 'Historical'));
    const empties = await readMatches(base44.entities.EmptyWeight, { ...truckQuery, emptyWeightDate: { $in: dates } }, ['normalizedTruckNumber', 'tallyWeight', 'emptyWeightDate', 'emptyWeightTime', 'ghat', 'scaleName']);
    empties.forEach((r) => remember({ ...r, tareWeight: r.tallyWeight, weighmentDate: r.emptyWeightDate, weighmentTime: timeValue(r.emptyWeightTime) }, 'EmptyWeight'));
    const loads = await readMatches(base44.entities.TruckEntry, { ...truckQuery, $or: [{ tareDate: { $in: dates } }, { emptyWeightDate: { $in: dates } }] }, ['normalizedTruckNumber', 'tare', 'tareDate', 'tareTime', 'emptyWeightDate', 'emptyWeightTime', 'ghatName', 'scaleName']);
    loads.forEach((r) => remember({ ...r, tareWeight: r.tare, weighmentDate: r.tareDate || r.emptyWeightDate, weighmentTime: timeValue(r.tareTime || r.emptyWeightTime), ghat: r.ghatName }, 'TruckEntry'));
  }
  return candidates.map((c) => {
    if (c.status !== 'VALID') return c;
    const key = naturalKey(c.record), match = exact.get(key);
    if (match || sources.has(c.record.sourceKey)) return { ...c, status: 'DUPLICATE', reason: match ? `বিদ্যমান ${match.kind} · ${match.id}; অপরিবর্তিত রাখা হবে` : 'এই source row আগেই Import হয়েছে' };
    if (trips.has(tripKey(c.record))) return { ...c, status: 'REVIEW', reason: 'একই ট্রাক/তারিখ/সময়, কিন্তু বিদ্যমান ওজন/ঘাট/স্কেল আলাদা; কোনোটিই বদলানো হবে না' };
    return c;
  });
}