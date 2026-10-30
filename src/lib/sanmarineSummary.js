import { base44 } from '@/api/base44Client';
import { recordProblems, FLAG_META } from '@/lib/sanmarineRules';

// Ghat daily summary: Date → Ghat → Mother Vessel → Lighter → Truck → Problem details.
const CAP = 5000;

async function fetchRange(entity, query) {
  const items = [];
  let cursor;
  for (;;) {
    const page = await entity.filter(query, { sort: 'created_date', limit: 1000, cursor });
    items.push(...(page.items || []));
    if (!page.has_more || !page.next_cursor || items.length >= CAP) break;
    cursor = page.next_cursor;
  }
  return { items, truncated: items.length >= CAP };
}

export async function loadSummaryData(from, to) {
  const [loads, empties] = await Promise.all([
    fetchRange(base44.entities.TruckEntry, { date: { $gte: from, $lte: to } }),
    fetchRange(base44.entities.EmptyWeight, { emptyWeightDate: { $gte: from, $lte: to } }),
  ]);
  return { loads: loads.items, empties: empties.items, truncated: loads.truncated || empties.truncated };
}

export const newStats = () => ({ total: 0, completed: 0, pending: 0, problemTrucks: 0, weightProblems: 0, kgDiff: 0, missingDocs: 0, monitorMissing: 0, scaleMissing: 0, duplicateConflict: 0, previousTrip: 0, bags: 0, net: 0 });

const grp = (p) => FLAG_META[p.code]?.group;

function addStats(s, kind, rec, problems) {
  s.total += 1;
  if (kind === 'loading') { s.completed += 1; s.bags += Number(rec.bags) || 0; s.net += Number(rec.net) || 0; } else s.pending += 1;
  if (problems.length) s.problemTrucks += 1;
  const weight = problems.filter((p) => grp(p) === 'weight');
  if (weight.length) { s.weightProblems += 1; s.kgDiff += weight.reduce((a, p) => a + (Number(p.kg) || 0), 0); }
  if (problems.some((p) => grp(p) === 'doc')) s.missingDocs += 1;
  if (problems.some((p) => p.code === 'MONITOR_PHOTO_MISSING')) s.monitorMissing += 1;
  if (problems.some((p) => p.code === 'SCALE_PHOTO_MISSING')) s.scaleMissing += 1;
  if (problems.some((p) => grp(p) === 'duplicate')) s.duplicateConflict += 1;
  if (problems.some((p) => grp(p) === 'previous')) s.previousTrip += 1;
}

const child = (map, key, label) => {
  if (!map.has(key)) map.set(key, { key, label, stats: newStats(), kids: new Map(), trucks: [] });
  return map.get(key);
};
const finish = (map, desc = false) => [...map.values()]
  .sort((a, b) => (desc ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)))
  .map((n) => ({ ...n, kids: finish(n.kids) }));

export function buildTree(loads, empties, { vessels, lighters }) {
  const vName = (id) => (vessels.find((v) => v.id === id) || {}).name || 'অজানা ভেসেল';
  const lName = (id) => (lighters.find((l) => l.id === id) || {}).name || 'অজানা লাইটার';
  const rows = [
    ...loads.map((r) => ({ kind: 'loading', rec: r, date: r.date, ghat: r.ghatName || '—', vessel: r.motherVesselId, lighter: r.lighterVesselId, time: r.time })),
    ...empties.filter((e) => !e.loadingEntryId).map((e) => ({ kind: 'empty', rec: e, date: e.emptyWeightDate, ghat: e.ghat || '—', vessel: '', lighter: '', time: e.emptyWeightTime })),
  ];
  const root = new Map();
  const total = newStats();
  rows.forEach((r) => {
    const problems = recordProblems(r.kind, r.rec);
    const d = child(root, r.date || '—', r.date || '—');
    const g = child(d.kids, r.ghat, r.ghat);
    const v = child(g.kids, r.vessel || '~', r.vessel ? vName(r.vessel) : 'পেন্ডিং — লোড বাকি');
    const l = child(v.kids, r.lighter || '~', r.lighter ? lName(r.lighter) : 'খালি ওজন নেওয়া হয়েছে');
    [total, d.stats, g.stats, v.stats, l.stats].forEach((s) => addStats(s, r.kind, r.rec, problems));
    l.trucks.push({ id: r.rec.id, kind: r.kind, truckNumber: r.rec.truckNumber, time: r.time || '', bags: r.rec.bags, net: r.rec.net, tally: r.rec.tallyWeight, problems });
  });
  return { tree: finish(root, true), total };
}