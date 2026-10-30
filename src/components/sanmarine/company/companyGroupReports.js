import companyReportEntities from '@/components/sanmarine/company/companyReportEntities';
import { consigneeName } from '@/components/sanmarine/company/companyScope';
const n = (v) => Number(v) || 0, col = (key, label, numeric) => ({ key, label, num: !!numeric });
const sum = (rows, field) => rows.reduce((v, r) => v + n(r[field]), 0);
const aggregate = async (entity, query, groupBy, sums) => { const r = await entity.aggregate({ query, groupBy, sum: sums, limit: 1000 }); if (r.truncated) throw new Error('Report grouping সীমা ছাড়িয়েছে; ছোট date range নির্বাচন করুন। কোনো অসম্পূর্ণ total দেখানো হয়নি।'); return r.rows; };
export default async function companyGroupReports(type, p, ctx) {
  const E = companyReportEntities(p.scope), field = type === 'ghat' ? 'ghatName' : type === 'staff' ? 'enteredBy' : 'motherVesselId';
  const query = { date: { $gte: p.from, $lte: p.to }, ...(p.vesselId && type === 'vessel' ? { motherVesselId: p.vesselId } : {}) };
  const groups = await aggregate(E.TruckEntry, query, [field, 'lighterVesselId'], ['net', 'bags']);
  let empties = [], pending = [];
  if (type !== 'vessel') empties = await aggregate(E.EmptyWeight, { emptyWeightDate: { $gte: p.from, $lte: p.to } }, type === 'ghat' ? 'ghat' : 'enteredByName');
  if (type === 'ghat') pending = await aggregate(E.EmptyWeight, { emptyWeightDate: { $gte: p.from, $lte: p.to }, $or: [{ loadingEntryId: '' }, { loadingEntryId: { $exists: false } }] }, 'ghat');
  const emptyField = type === 'ghat' ? 'ghat' : 'enteredByName';
  const keys = [...new Set([...groups.map((r) => r[field] || 'Unavailable'), ...empties.map((r) => r[emptyField] || 'Unavailable')])];
  const rows = keys.map((key) => {
    const g = groups.filter((r) => (r[field] || 'Unavailable') === key), totalNet = sum(g, 'sum_net');
    const names = [...new Set(g.map((r) => consigneeName(ctx, r.lighterVesselId)))];
    const common = { consignee: names.join(', ') || 'Not Assigned', company: p.company, trucks: sum(g, 'count'), bags: sum(g, 'sum_bags'), net: totalNet, mt: +(totalNet / 1000).toFixed(3) };
    const emptyCount = n(empties.find((r) => (r[emptyField] || 'Unavailable') === key)?.count);
    if (type === 'ghat') return { ...common, ghat: key, empties: emptyCount, pending: n(pending.find((r) => (r.ghat || 'Unavailable') === key)?.count) };
    if (type === 'staff') return { ...common, staff: key, loads: common.trucks, empties: emptyCount };
    const vessel = ctx.vessels.find((r) => r.id === key) || {};
    return { ...common, vessel: vessel.name || 'Unavailable', cargo: vessel.cargoType || 'Unavailable', declared: vessel.totalCargoMT ?? 'Unavailable' };
  }).sort((a, b) => String(a.ghat || a.staff || a.vessel).localeCompare(String(b.ghat || b.staff || b.vessel)));
  const numeric = type === 'ghat' ? ['trucks', 'bags', 'net', 'mt', 'empties', 'pending'] : type === 'staff' ? ['empties', 'loads', 'bags', 'net'] : ['trucks', 'bags', 'net', 'mt'];
  const columns = type === 'ghat' ? [col('ghat', 'ঘাট'), col('consignee', 'আমদানিকারক'), col('trucks', 'লোড ট্রাক', 1), col('bags', 'ব্যাগ', 1), col('net', 'নেট (KG)', 1), col('mt', 'নেট (MT)', 1), col('empties', 'খালি ওজন', 1), col('pending', 'লোড বাকি', 1)] : type === 'staff' ? [col('staff', 'স্টাফ'), col('consignee', 'আমদানিকারক'), col('empties', 'খালি ওজন এন্ট্রি', 1), col('loads', 'লোড এন্ট্রি', 1), col('bags', 'ব্যাগ', 1), col('net', 'নেট (KG)', 1)] : [col('vessel', 'মাদার ভেসেল'), col('company', 'কোম্পানি'), col('consignee', 'আমদানিকারক'), col('cargo', 'কার্গো'), col('declared', 'ঘোষিত (MT)', 1), col('trucks', 'ট্রাক', 1), col('bags', 'ব্যাগ', 1), col('net', 'নেট (KG)', 1), col('mt', 'নেট (MT)', 1)];
  return { title: type === 'ghat' ? 'ঘাটভিত্তিক রিপোর্ট' : type === 'staff' ? 'স্টাফভিত্তিক রিপোর্ট' : 'ভেসেলভিত্তিক রিপোর্ট', subtitle: `${p.from} থেকে ${p.to}`, rows, columns, totals: { [type === 'ghat' ? 'ghat' : type === 'staff' ? 'staff' : 'vessel']: 'মোট', ...Object.fromEntries(numeric.map((key) => [key, key === 'mt' ? +(sum(rows, 'net') / 1000).toFixed(3) : sum(rows, key)])) } };
}