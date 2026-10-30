import { base44 } from '@/api/base44Client';
import { recordProblems, FLAG_META } from '@/lib/sanmarineRules';
import { normalizeTruckNumber } from '@/utils/truckUtils';
import companyReportEntities from '@/components/sanmarine/company/companyReportEntities';
import companyGroupReports from '@/components/sanmarine/company/companyGroupReports';
import { getCompanyScope, canonicalCompany, companyValues, recordCompany, consigneeName } from '@/components/sanmarine/company/companyScope';

// Reports are built from the live database: grouped reports use server-side aggregates,
// row reports read only the requested date range.
const UNLINKED = [{ loadingEntryId: '' }, { loadingEntryId: { $exists: false } }];
const CAP = 5000;
const E = (p) => companyReportEntities(p.scope);
const num = (n) => Number(n) || 0;
const nameOf = (list, id) => (list.find((x) => x.id === id) || {}).name || 'Unavailable';
const companyOf = (ctx, vesselId, lighterId) => recordCompany({ motherVesselId: vesselId, lighterVesselId: lighterId }, ctx) || 'Not Assigned';
const consigneeOf = (ctx, lighterId, record) => consigneeName(ctx, lighterId, record);
const range = (field, from, to) => ({ [field]: { $gte: from, $lte: to } });
const col = (key, label, isNum) => ({ key, label, num: !!isNum });
const sumBy = (rows, key) => rows.reduce((s, r) => s + num(r[key]), 0);

export const REPORT_TYPES = [
  ['daily_lighter', 'দৈনিক লাইটার/ঘাট রিপোর্ট'],
  ['daily', 'দৈনিক রিপোর্ট (বিস্তারিত)'], ['ghat', 'ঘাটভিত্তিক রিপোর্ট'], ['vessel', 'ভেসেলভিত্তিক রিপোর্ট'], ['lighter', 'লাইটারভিত্তিক রিপোর্ট'],
  ['staff', 'স্টাফভিত্তিক রিপোর্ট'], ['truck', 'ট্রাক হিস্ট্রি'], ['problem', 'সমস্যা / অ্যালার্ট রিপোর্ট'], ['closing', 'ফাইনাল ক্লোজিং রিপোর্ট'],
  ['doc_status', 'ঘাট/লাইটার ডকুমেন্ট ও খালি গাড়ি স্ট্যাটাস'],
];

async function fetchRows(entity, query, sort) {
  const items = [];
  let cursor;
  for (;;) {
    const page = await entity.filter(query, { sort, limit: 1000, cursor });
    items.push(...(page.items || []));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return items;
}
const agg = async (entity, query, groupBy, sum) => { const result = await entity.aggregate({ query, groupBy, sum, limit: 1000 }); if (result.truncated) throw new Error('Report grouping অসম্পূর্ণ; ছোট date range দিন।'); return result.rows || []; };
const period = (p) => `${p.from} থেকে ${p.to}`;

async function daily(p, ctx) {
  const gq = p.ghat ? { ghatName: p.ghat } : {};
  const [loads, pending] = await Promise.all([
    fetchRows(E(p).TruckEntry, { ...range('date', p.from, p.to), ...gq, ...(p.shift ? { shift: p.shift } : {}) }, 'date'),
    E(p).EmptyWeight.count({ ...range('emptyWeightDate', p.from, p.to), ...(p.ghat ? { ghat: p.ghat } : {}), $or: UNLINKED }),
  ]);
  const rows = loads.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((r) => ({
    serial: r.serial || '', date: r.date, time: r.time || '', truck: r.truckNumber, ghat: r.ghatName || '', company: companyOf(ctx, r.motherVesselId, r.lighterVesselId), vessel: nameOf(ctx.vessels, r.motherVesselId),
    lighter: nameOf(ctx.lighters, r.lighterVesselId), consignee: consigneeOf(ctx, r.lighterVesselId, r), bags: num(r.bags), gross: num(r.gross), tare: num(r.tare), net: num(r.net), location: r.locationName || '',
  }));
  return {
    title: 'দৈনিক ডিসচার্জ রিপোর্ট', subtitle: `${period(p)}${p.ghat ? ` · ঘাট: ${p.ghat}` : ''}`,
    columns: [col('serial', 'সিরিয়াল'), col('date', 'তারিখ'), col('time', 'সময়'), col('truck', 'ট্রাক'), col('ghat', 'ঘাট'), col('company', 'কোম্পানি'), col('vessel', 'ভেসেল'), col('lighter', 'লাইটার'), col('consignee', 'আমদানিকারক'),
      col('bags', 'ব্যাগ', 1), col('gross', 'গ্রস', 1), col('tare', 'খালি গাড়ির ওজন', 1), col('net', 'নেট (KG)', 1), col('location', 'ঠিকানা (GPS)')],
    rows, totals: { truck: rows.length, bags: sumBy(rows, 'bags'), gross: sumBy(rows, 'gross'), tare: sumBy(rows, 'tare'), net: sumBy(rows, 'net') },
    notes: [`খালি ওজন নেওয়া হয়েছে কিন্তু লোড বাকি: ${pending}টি ট্রাক`],
  };
}

async function byGhat(p) {
  const [loads, empties, pend] = await Promise.all([
    agg(E(p).TruckEntry, { ...range('date', p.from, p.to) }, 'ghatName', ['net', 'bags']),
    agg(E(p).EmptyWeight, { ...range('emptyWeightDate', p.from, p.to) }, 'ghat'),
    agg(E(p).EmptyWeight, { ...range('emptyWeightDate', p.from, p.to), $or: UNLINKED }, 'ghat'),
  ]);
  const names = [...new Set([...loads.map((r) => r.ghatName || '—'), ...empties.map((r) => r.ghat || '—')])].sort();
  const rows = names.map((g) => {
    const l = loads.find((r) => (r.ghatName || '—') === g) || {};
    return {
      ghat: g, trucks: num(l.count), bags: num(l.sum_bags), net: num(l.sum_net), mt: +(num(l.sum_net) / 1000).toFixed(3),
      empties: num((empties.find((r) => (r.ghat || '—') === g) || {}).count), pending: num((pend.find((r) => (r.ghat || '—') === g) || {}).count),
    };
  });
  return {
    title: 'ঘাটভিত্তিক রিপোর্ট', subtitle: period(p),
    columns: [col('ghat', 'ঘাট'), col('trucks', 'লোড ট্রাক', 1), col('bags', 'ব্যাগ', 1), col('net', 'নেট (KG)', 1), col('mt', 'নেট (MT)', 1), col('empties', 'খালি ওজন', 1), col('pending', 'লোড বাকি', 1)],
    rows, totals: { ghat: 'মোট', trucks: sumBy(rows, 'trucks'), bags: sumBy(rows, 'bags'), net: sumBy(rows, 'net'), mt: +(sumBy(rows, 'net') / 1000).toFixed(3), empties: sumBy(rows, 'empties'), pending: sumBy(rows, 'pending') },
  };
}

async function byVessel(p, ctx) {
  const q = { ...range('date', p.from, p.to), ...(p.vesselId ? { motherVesselId: p.vesselId } : {}) };
  const data = await agg(E(p).TruckEntry, q, 'motherVesselId', ['net', 'bags']);
  const rows = data.map((r) => {
    const v = ctx.vessels.find((x) => x.id === r.motherVesselId) || {};
    return { vessel: v.name || '—', company: v.company || '', cargo: v.cargoType || '', declared: num(v.totalCargoMT), trucks: num(r.count), bags: num(r.sum_bags), net: num(r.sum_net), mt: +(num(r.sum_net) / 1000).toFixed(3) };
  });
  return {
    title: 'ভেসেলভিত্তিক রিপোর্ট', subtitle: period(p),
    columns: [col('vessel', 'মাদার ভেসেল'), col('company', 'কোম্পানি'), col('cargo', 'কার্গো'), col('declared', 'ঘোষিত (MT)', 1), col('trucks', 'ট্রাক', 1), col('bags', 'ব্যাগ', 1), col('net', 'নেট (KG)', 1), col('mt', 'নেট (MT)', 1)],
    rows, totals: { vessel: 'মোট', trucks: sumBy(rows, 'trucks'), bags: sumBy(rows, 'bags'), net: sumBy(rows, 'net'), mt: +(sumBy(rows, 'net') / 1000).toFixed(3) },
  };
}

async function byLighter(p, ctx) {
  const q = { ...range('date', p.from, p.to), ...(p.lighterId ? { lighterVesselId: p.lighterId } : {}) };
  const data = await agg(E(p).TruckEntry, q, 'lighterVesselId', ['net', 'bags']);
  const rows = data.map((r) => {
    const l = ctx.lighters.find((x) => x.id === r.lighterVesselId) || {};
    return { lighter: l.name || '—', company: companyOf(ctx, l.motherVesselId, l.id), vessel: nameOf(ctx.vessels, l.motherVesselId), consignee: consigneeOf(ctx, l.id), trucks: num(r.count), bags: num(r.sum_bags), net: num(r.sum_net), mt: +(num(r.sum_net) / 1000).toFixed(3) };
  });
  return {
    title: 'লাইটারভিত্তিক রিপোর্ট', subtitle: period(p),
    columns: [col('lighter', 'লাইটার'), col('company', 'কোম্পানি'), col('vessel', 'মাদার ভেসেল'), col('consignee', 'আমদানিকারক'), col('trucks', 'ট্রাক', 1), col('bags', 'ব্যাগ', 1), col('net', 'নেট (KG)', 1), col('mt', 'নেট (MT)', 1)],
    rows, totals: { lighter: 'মোট', trucks: sumBy(rows, 'trucks'), bags: sumBy(rows, 'bags'), net: sumBy(rows, 'net'), mt: +(sumBy(rows, 'net') / 1000).toFixed(3) },
  };
}

async function byStaff(p) {
  const [loads, empties] = await Promise.all([
    agg(E(p).TruckEntry, { ...range('date', p.from, p.to) }, 'enteredBy', ['net', 'bags']),
    agg(E(p).EmptyWeight, { ...range('emptyWeightDate', p.from, p.to) }, 'enteredByName'),
  ]);
  const names = [...new Set([...loads.map((r) => r.enteredBy || '—'), ...empties.map((r) => r.enteredByName || '—')])].sort();
  const rows = names.map((n) => {
    const l = loads.find((r) => (r.enteredBy || '—') === n) || {};
    return { staff: n, loads: num(l.count), bags: num(l.sum_bags), net: num(l.sum_net), empties: num((empties.find((r) => (r.enteredByName || '—') === n) || {}).count) };
  });
  return {
    title: 'স্টাফভিত্তিক রিপোর্ট', subtitle: period(p),
    columns: [col('staff', 'স্টাফ'), col('empties', 'খালি ওজন এন্ট্রি', 1), col('loads', 'লোড এন্ট্রি', 1), col('bags', 'ব্যাগ', 1), col('net', 'নেট (KG)', 1)],
    rows, totals: { staff: 'মোট', empties: sumBy(rows, 'empties'), loads: sumBy(rows, 'loads'), bags: sumBy(rows, 'bags'), net: sumBy(rows, 'net') },
  };
}

async function truckHistory(p, ctx) {
  const n = normalizeTruckNumber(p.truck || '');
  if (!n) throw new Error('ট্রাক নম্বর লিখুন।');
  const d = n.replace(/\D/g, '');
  const cond = d.length >= 5 ? { $regex: `${d}$` } : n;
  const [loads, empties] = await Promise.all([
    fetchRows(E(p).TruckEntry, { normalizedTruckNumber: cond }, 'date'),
    fetchRows(E(p).EmptyWeight, { normalizedTruckNumber: cond }, 'emptyWeightDate'),
  ]);
  const label = (kind, rec) => recordProblems(kind, rec).map((f) => FLAG_META[f.code]?.label || f.code).join(', ');
  const rows = [
    ...empties.map((r) => ({ type: 'খালি ওজন', date: r.emptyWeightDate, time: r.emptyWeightTime || '', ghat: r.ghat || 'Unavailable', company: p.company, consignee: consigneeOf(ctx, loads.find((l) => l.id === r.loadingEntryId)?.lighterVesselId), where: 'Not Assigned', bags: 0, weight: `${num(r.tallyWeight)} / ${num(r.monitorWeight)}`, net: 0, location: r.locationName || '', problems: label('empty', r) })),
    ...loads.map((r) => ({ type: 'লোড', date: r.date, time: r.time || '', ghat: r.ghatName || '', company: companyOf(ctx, r.motherVesselId, r.lighterVesselId), consignee: consigneeOf(ctx, r.lighterVesselId, r), where: `${nameOf(ctx.vessels, r.motherVesselId)} › ${nameOf(ctx.lighters, r.lighterVesselId)}`, bags: num(r.bags), weight: `${num(r.gross)} / ${num(r.tare)}`, net: num(r.net), location: r.locationName || '', problems: label('loading', r) })),
  ].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return {
    title: `ট্রাক হিস্ট্রি — ${p.truck.toUpperCase()}`, subtitle: `মোট ${loads.length}টি লোড ট্রিপ · ${empties.length}টি খালি ওজন`,
    columns: [col('type', 'ধরন'), col('date', 'তারিখ'), col('time', 'সময়'), col('ghat', 'ঘাট'), col('company', 'কোম্পানি'), col('consignee', 'আমদানিকারক'), col('where', 'ভেসেল › লাইটার'), col('bags', 'ব্যাগ', 1), col('weight', 'খালি: গাড়ির ওজন/মনিটর · লোড: গ্রস/খালি গাড়ির ওজন'), col('net', 'নেট (KG)', 1), col('location', 'ঠিকানা (GPS)'), col('problems', 'সমস্যা')],
    rows, totals: { type: 'মোট', bags: sumBy(rows, 'bags'), net: sumBy(rows, 'net') },
  };
}

async function problems(p, ctx) {
  const alerts = await fetchRows(E(p).Alert, { createdTime: { $gte: p.from, $lte: `${p.to}T23:59:59.999Z` } }, 'created_date');
  const linked = await fetchRows(E(p).TruckEntry, { id: { $in: alerts.map((a) => a.relatedLoadingId).filter(Boolean) } }, 'date');
  const rows = alerts.map((a) => ({
    company: p.company, consignee: consigneeOf(ctx, a.lighterVesselId || linked.find((r) => r.id === a.relatedLoadingId)?.lighterVesselId),
    date: (a.createdTime || '').slice(0, 10), severity: a.severity, category: FLAG_META[a.category]?.label || a.category, truck: a.truckNumber || '', ghat: a.ghat || '',
    title: a.title, status: a.status, by: a.enteredByName || '',
  }));
  const bySev = (s) => rows.filter((r) => r.severity === s).length;
  return {
    title: 'সমস্যা / অ্যালার্ট রিপোর্ট', subtitle: period(p),
    columns: [col('date', 'তারিখ'), col('company', 'কোম্পানি'), col('consignee', 'আমদানিকারক'), col('severity', 'মাত্রা'), col('category', 'ধরন'), col('truck', 'ট্রাক'), col('ghat', 'ঘাট'), col('title', 'শিরোনাম'), col('status', 'স্ট্যাটাস'), col('by', 'এন্ট্রিকারী')],
    rows, totals: { date: 'মোট', severity: rows.length },
    notes: [`ক্রিটিক্যাল ${bySev('critical')} · হাই ${bySev('high')} · ওয়ার্নিং/মিডিয়াম ${bySev('warning') + bySev('medium')} · ওপেন ${rows.filter((r) => r.status !== 'RESOLVED').length}`],
  };
}

async function dailyLighter(p, ctx) {
  const q = { ...range('date', p.from, p.to) };
  if (p.shift) q.shift = p.shift;
  if (p.ghat) q.ghatName = p.ghat;
  if (p.vesselId) q.motherVesselId = p.vesselId;
  if (p.lighterId) q.lighterVesselId = p.lighterId;
  if (p.staff) q.enteredBy = p.staff;
  const grouped = await agg(E(p).TruckEntry, q, ['date', 'shift', 'ghatName', 'lighterVesselId'], ['net', 'bags']);
  const groups = new Map(grouped.map((r, i) => [i, { date: r.date, shift: r.shift || 'Day', ghat: (r.ghatName || '').toUpperCase(), lighterVesselId: r.lighterVesselId, trucks: num(r.count), bags: num(r.sum_bags), net: num(r.sum_net) }]));
  const sections = [...groups.values()].map((g) => {
    const lighter = ctx.lighters.find((l) => l.id === g.lighterVesselId) || {};
    const vessel = ctx.vessels.find((v) => v.id === lighter.motherVesselId) || {};
    const ghat = (ctx.ghats || []).find((x) => x.name.toUpperCase() === g.ghat) || {};
    const trucks = g.trucks;
    const bags = g.bags;
    const net = g.net;
    const ab = bags > 0 ? Math.round(net / bags) : 0;
    const bagAverage = bags > 0 ? +(net / bags).toFixed(2) : 0;
    return { date: g.date, shift: g.shift, ghat: g.ghat, lighterVesselId: g.lighterVesselId, ghatLocation: ghat.location || '', company: companyOf(ctx, vessel.id, lighter.id), motherVessel: vessel.name || 'Unavailable', lighter: lighter.name || 'Unavailable', consignee: consigneeOf(ctx, lighter.id), cargo: vessel.cargoType || 'Unavailable', trucks, bags, net, ab, bagAverage, mt: +(net / 1000).toFixed(3) };
  }).sort((a, b) => `${a.date}${a.shift}${a.ghat}${a.lighter}`.localeCompare(`${b.date}${b.shift}${b.ghat}${b.lighter}`));
  // The sections above stay day-wise (প্রতিদিনের রিপোর্ট). Everything below is CUMULATIVE: a lighter / mother
  // vessel totals from its start up to the given date, not just the days selected — the summaries used to add up
  // only the selected days, so picking one day made them repeat that same day's figures.
  const activeLighterIds = [...new Set(grouped.map((r) => r.lighterVesselId).filter(Boolean))];
  const cumQ = { date: { $lte: p.to } };
  if (p.ghat) cumQ.ghatName = p.ghat;
  if (p.vesselId) cumQ.motherVesselId = p.vesselId;
  if (p.staff) cumQ.enteredBy = p.staff;
  if (activeLighterIds.length) cumQ.lighterVesselId = { $in: activeLighterIds };
  const cumRows = activeLighterIds.length ? await agg(E(p).TruckEntry, cumQ, ['lighterVesselId', 'date'], ['net', 'bags']) : [];
  const cumByLighter = new Map();
  const lm = new Map();
  const vm = new Map();
  for (const r of cumRows) {
    const lighter = ctx.lighters.find((l) => l.id === r.lighterVesselId) || {};
    const vessel = ctx.vessels.find((v) => v.id === lighter.motherVesselId) || {};
    const lighterName = lighter.name || 'Unavailable';
    const vesselName = vessel.name || 'Unavailable';
    const trucks = num(r.count), bags = num(r.sum_bags), net = num(r.sum_net);
    if (!cumByLighter.has(r.lighterVesselId)) cumByLighter.set(r.lighterVesselId, []);
    cumByLighter.get(r.lighterVesselId).push({ date: String(r.date), trucks, bags, net, running: null });
    if (!lm.has(r.lighterVesselId)) lm.set(r.lighterVesselId, { lighter: lighterName, company: companyOf(ctx, vessel.id, lighter.id), vessel: vesselName, consignee: consigneeOf(ctx, lighter.id), totalTrucks: 0, totalBags: 0, totalNet: 0 });
    const l = lm.get(r.lighterVesselId); l.totalTrucks += trucks; l.totalBags += bags; l.totalNet += net;
    const vKey = lighter.motherVesselId || vesselName;
    if (!vm.has(vKey)) vm.set(vKey, { vessel: vesselName, totalLighters: new Set(), totalTrucks: 0, totalBags: 0, totalNet: 0 });
    const v = vm.get(vKey); v.totalLighters.add(r.lighterVesselId); v.totalTrucks += trucks; v.totalBags += bags; v.totalNet += net;
  }
  // Running total for each lighter per day: that day plus every earlier day of the same lighter.
  for (const arr of cumByLighter.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
    let t = 0, b = 0, n = 0;
    for (const row of arr) { t += row.trucks; b += row.bags; n += row.net; row.running = { trucks: t, bags: b, net: n }; }
  }
  // Each day's own section carries its running total, so the exported "Summery" block shows the total up to that
  // day instead of repeating the day's report.
  for (const s of sections) {
    const arr = cumByLighter.get(s.lighterVesselId) || [];
    const row = arr.find((r) => r.date === String(s.date));
    const run = (row && row.running) || { trucks: s.trucks, bags: s.bags, net: s.net };
    s.cumTrucks = run.trucks; s.cumBags = run.bags; s.cumNet = run.net;
    s.cumAb = run.bags > 0 ? Math.round(run.net / run.bags) : 0;
    s.cumBagAverage = run.bags > 0 ? +(run.net / run.bags).toFixed(2) : 0;
  }
  const lighterSummaries = [...lm.values()].map((l) => ({ ...l, ab: l.totalBags > 0 ? Math.round(l.totalNet / l.totalBags) : 0, bagAverage: l.totalBags > 0 ? +(l.totalNet / l.totalBags).toFixed(2) : 0, mt: +(l.totalNet / 1000).toFixed(3) }));
  const vesselSummaries = [...vm.values()].map((v) => ({ ...v, totalLighters: v.totalLighters.size, ab: v.totalBags > 0 ? Math.round(v.totalNet / v.totalBags) : 0, bagAverage: v.totalBags > 0 ? +(v.totalNet / v.totalBags).toFixed(2) : 0, mt: +(v.totalNet / 1000).toFixed(3) }));
  return {
    type: 'daily_lighter',
    title: 'দৈনিক লাইটার/ঘাট রিপোর্ট', subtitle: `${period(p)}${p.shift ? ` · ${p.shift === 'Day' ? 'ডে' : 'নাইট'}` : ''}${p.ghat ? ` · ঘাট: ${p.ghat}` : ''}`,
    sections, lighterSummaries, vesselSummaries, summaryTo: p.to,
    columns: [col('date', 'তারিখ'), col('shift', 'শিফট'), col('ghat', 'ঘাট'), col('company', 'কোম্পানি'), col('motherVessel', 'মাদার ভেসেল'), col('lighter', 'লাইটার'), col('consignee', 'আমদানিকারক'), col('cargo', 'কার্গো'), col('trucks', 'ট্রাক', 1), col('bags', 'ব্যাগ', 1), col('net', 'নেট (KG)', 1), col('ab', 'A/B (KG)', 1), col('bagAverage', 'Bag Avg', 1)],
    rows: sections, totals: { lighter: 'মোট', trucks: sumBy(sections, 'trucks'), bags: sumBy(sections, 'bags'), net: sumBy(sections, 'net') },
  };
}

async function finalClosing(p, ctx) {
  const c = ctx.closings.find((x) => x.id === p.closingId);
  if (!c) throw new Error('ক্লোজিং নির্বাচন করুন।');
  const groups = await agg(E(p).TruckEntry, { lighterVesselId: c.lighterVesselId }, ['date', 'shift', 'ghatName'], ['bags', 'net', 'gross']);
  const dayBreakdown = groups.map((r) => ({ date: r.date, shift: r.shift || 'Day', ghat: r.ghatName || 'Unavailable', lighter: c.lighterVesselName || 'Unavailable', trucks: num(r.count), bags: num(r.sum_bags), net: num(r.sum_net), gross: num(r.sum_gross), ab: r.sum_bags > 0 ? Math.round(r.sum_net / r.sum_bags) : 0, bagAverage: r.sum_bags > 0 ? +(r.sum_net / r.sum_bags).toFixed(2) : 0 })).sort((a, b) => `${a.date}${a.shift}`.localeCompare(`${b.date}${b.shift}`));
  const totalTrucks = sumBy(dayBreakdown, 'trucks');
  const totalBags = sumBy(dayBreakdown, 'bags');
  const totalNet = sumBy(dayBreakdown, 'net');
  const totalGross = sumBy(dayBreakdown, 'gross');
  const bagAvg = totalBags > 0 ? Math.round(totalNet / totalBags) : 0;
  const bagAverageDec = totalBags > 0 ? +(totalNet / totalBags).toFixed(2) : 0;
  const bagTareGrams = num(c.bagTareWeightGrams);
  const bagTareKg = num(c.totalBagTareWeightKg);
  const finalNet = num(c.finalNetWeightKg);
  return {
    type: 'closing',
    title: `ফাইনাল ক্লোজিং রিপোর্ট — ${c.lighterVesselName}`, subtitle: `${c.motherVesselName || ''} · ক্লোজিং তারিখ ${c.closingDate} · ${c.status}`,
    meta: [
      ['কোম্পানি', companyOf(ctx, c.motherVesselId, c.lighterVesselId)],
      ['মাদার ভেসেল', c.motherVesselName || 'Unavailable'], ['কার্গো', c.cargoName || 'Unavailable'], ['আমদানিকারক', consigneeOf(ctx, c.lighterVesselId, c)],
      ['ঘোষিত কার্গো (MT)', num(c.declaredCargoMT)], ['আগমন তারিখ', c.arrivalDate || '—'],
      ['মোট ট্রাক', totalTrucks], ['মোট ব্যাগ', totalBags], ['মোট নেট (KG)', totalNet], ['ব্যাগ গড় (KG)', bagAvg],
    ],
    dayBreakdown,
    vesselSummary: { totalTrucks, totalBags, totalWeight: totalNet, ab: bagAvg, bagAverage: bagAverageDec, totalGross },
    bagDeduction: { totalBags, bagWeightPerBag: bagTareGrams, bagWeightPerBagKg: +(bagTareGrams / 1000).toFixed(3), totalBagWeight: bagTareKg, grossWeight: totalGross, finalNetWeight: finalNet, finalNetMT: +num(c.finalNetWeightMT).toFixed(3) },
    columns: [col('date', 'তারিখ'), col('shift', 'শিফট'), col('ghat', 'ঘাট'), col('lighter', 'লাইটার'), col('trucks', 'ট্রাক', 1), col('bags', 'ব্যাগ', 1), col('net', 'নেট (KG)', 1), col('gross', 'গ্রস (KG)', 1), col('ab', 'A/B (KG)', 1), col('bagAverage', 'Bag Avg', 1)],
    rows: dayBreakdown, totals: { date: 'মোট', trucks: totalTrucks, bags: totalBags, net: totalNet, gross: totalGross, ab: bagAvg, bagAverage: bagAverageDec },
  };
}

// Per-lighter document & empty-weight status: which required docs are missing for each ghat/lighter in the range.
// Uses the same LighterDailyDocument + TruckEntry tables — no duplicated data.
async function docStatus(p, ctx) {
  const [docs, loads] = await Promise.all([
    fetchRows(E(p).LighterDailyDocument, { date: { $gte: p.from, $lte: p.to }, ...(p.ghat ? { ghatName: p.ghat } : {}) }, 'date'),
    fetchRows(E(p).TruckEntry, { ...range('date', p.from, p.to), ...(p.ghat ? { ghatName: p.ghat } : {}) }, 'date'),
  ]);
  const map = new Map();
  const key = (l, g) => `${l}|${g}`;
  const ensure = (lid, ghat, vid) => {
    const k = key(lid, ghat);
    if (!map.has(k)) map.set(k, { lighterId: lid, ghat, vesselId: vid, ws: false, pk: false, scaleOk: true, monOk: true, emptyOk: true, trucks: 0 });
    return map.get(k);
  };
  for (const d of docs) {
    const g = (d.ghatName || '—').toUpperCase();
    const row = ensure(d.lighterVesselId, g, d.motherVesselId);
    if (d.weighmentSheetPhoto) row.ws = true;
    if (d.pointKhataPhoto) row.pk = true;
  }
  for (const r of loads) {
    const g = (r.ghatName || '—').toUpperCase();
    const row = ensure(r.lighterVesselId, g, r.motherVesselId);
    row.trucks += 1;
    if (!r.scalePhoto) row.scaleOk = false;
    if (!r.monitorPhoto) row.monOk = false;
    if (!r.emptyWeightMatched) row.emptyOk = false;
  }
  const rows = [...map.values()].map((row) => {
    const missing = [];
    if (!row.ws) missing.push('ওয়েইমেন্ট শিট');
    if (!row.pk) missing.push('পয়েন্ট খাতা');
    if (!row.scaleOk) missing.push('স্কেল ছবি');
    if (!row.monOk) missing.push('মনিটর ছবি');
    if (!row.emptyOk) missing.push('খালি ওজন');
    return {
      ghat: row.ghat, company: companyOf(ctx, row.vesselId, row.lighterId), consignee: consigneeOf(ctx, row.lighterId), vessel: nameOf(ctx.vessels, row.vesselId), lighter: nameOf(ctx.lighters, row.lighterId),
      trucks: row.trucks, ws: row.ws ? '✓' : '✗', pk: row.pk ? '✓' : '✗', scale: row.scaleOk ? '✓' : '✗',
      monitor: row.monOk ? '✓' : '✗', empty: row.emptyOk ? '✓' : '✗',
      status: missing.length ? missing.join(', ') : 'সব ঠিক',
    };
  }).filter((r) => !p.company || r.company === p.company).sort((a, b) => `${a.ghat}${a.lighter}`.localeCompare(`${b.ghat}${b.lighter}`));
  const okCount = rows.filter((r) => r.status === 'সব ঠিক').length;
  return {
    title: 'ঘাট/লাইটার ডকুমেন্ট ও খালি গাড়ি স্ট্যাটাস', subtitle: `${period(p)}${p.ghat ? ` · ঘাট: ${p.ghat}` : ''}`,
    columns: [col('ghat', 'ঘাট'), col('company', 'কোম্পানি'), col('consignee', 'আমদানিকারক'), col('vessel', 'মাদার ভেসেল'), col('lighter', 'লাইটার'), col('trucks', 'ট্রাক', 1), col('ws', 'ওয়েইমেন্ট শিট'), col('pk', 'পয়েন্ট খাতা'), col('scale', 'স্কেল ছবি'), col('monitor', 'মনিটর ছবি'), col('empty', 'খালি ওজন'), col('status', 'স্ট্যাটাস')],
    rows, totals: { ghat: 'মোট', trucks: sumBy(rows, 'trucks') },
    notes: [`সমস্যামুক্ত লাইটার: ${okCount}টি · সমস্যাযুক্ত: ${rows.length - okCount}টি`],
  };
}

// Formal Daily/Final Discharging Report — groups loads by date+shift (no ghat split),
// matching the official San Marine closing report format.
export async function buildFormalClosingReport(closingId, ctx) {
  const c = ctx.closings.find((x) => x.id === closingId);
  if (!c) throw new Error('ক্লোজিং নির্বাচন করুন।');
  const company = recordCompany(c, ctx); companyValues(company);
  const p = { company, scope: await getCompanyScope(company) };
  const query = { lighterVesselId: c.lighterVesselId };
  const grouped = await agg(E(p).TruckEntry, query, ['date', 'shift'], ['bags', 'net', 'gross']);
  const rows = grouped.map((r) => ({ date: r.date, shift: r.shift || 'Day', trucks: num(r.count), bags: num(r.sum_bags), net: num(r.sum_net), gross: num(r.sum_gross) })).sort((a, b) => `${a.date}${a.shift}`.localeCompare(`${b.date}${b.shift}`));
  const [firstPage, lastPage] = await Promise.all([E(p).TruckEntry.filter({ ...query, date: rows[0]?.date || '' }, { sort: 'time', limit: 1, fields: ['date', 'time'] }), E(p).TruckEntry.filter({ ...query, date: rows[rows.length - 1]?.date || '' }, { sort: '-time', limit: 1, fields: ['date', 'time'] })]);
  const first = firstPage.items[0], last = lastPage.items[0];
  return {
    closing: { ...c, consigneeName: consigneeOf(ctx, c.lighterVesselId, c) },
    company: companyOf(ctx, c.motherVesselId, c.lighterVesselId),
    rows,
    totalTrucks: sumBy(rows, 'trucks'),
    totalBags: sumBy(rows, 'bags'),
    totalGross: sumBy(rows, 'gross'),
    totalNet: num(c.finalNetWeightKg) || sumBy(rows, 'net'),
    totalGrossMT: +(sumBy(rows, 'gross') / 1000).toFixed(3),
    totalNetMT: +num(c.finalNetWeightMT).toFixed(3),
    commenceDate: first ? first.date : c.arrivalDate || '',
    commenceTime: first ? first.time || '' : '',
    completionDate: last ? last.date : c.closingDate || '',
    completionTime: last ? last.time || '' : '',
  };
}

export async function buildReport(type, p, ctx) {
  const company = canonicalCompany(p.company); companyValues(company);
  const scope = await getCompanyScope(company);
  const graph = { ...ctx, vessels: [...(ctx.vessels || []).filter((v) => canonicalCompany(v.company) !== company), ...scope.vessels], lighters: [...(ctx.lighters || []).filter((l) => recordCompany({ lighterVesselId: l.id, motherVesselId: l.motherVesselId }, ctx) !== company), ...scope.lighters] };
  if (type === 'closing') { const closing = ctx.closings.find((c) => c.id === p.closingId); if (!closing || recordCompany(closing, graph) !== company) throw new Error('এই কোম্পানির নিশ্চিত Closing নির্বাচন করুন।'); }
  const map = { daily_lighter: dailyLighter, daily, ghat: byGhat, vessel: byVessel, lighter: byLighter, staff: byStaff, truck: truckHistory, problem: problems, closing: finalClosing, doc_status: docStatus };
  const params = { ...p, company, scope };
  const result = ['ghat', 'staff', 'vessel'].includes(type) ? await companyGroupReports(type, params, graph) : await map[type](params, graph);
  const names = [...new Set((result.sections || result.rows || []).map((r) => r.consignee).filter((n) => n && n !== 'Not Assigned'))];
  const meta = (result.meta || []).filter(([key]) => key !== 'কোম্পানি' && key !== 'আমদানিকারক');
  return { ...result, company, meta: [['কোম্পানি', company], ['আমদানিকারক', names.join(', ') || (type === 'closing' ? consigneeOf(graph, ctx.closings.find((c) => c.id === p.closingId).lighterVesselId) : 'Not Assigned')], ...meta], notes: [...(result.notes || []), 'অনিশ্চিত/বিরোধপূর্ণ Company Mapping-এর রেকর্ড বাদ; Admin Review-এ যাচাই করুন।'] };
}