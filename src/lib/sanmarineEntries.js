import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { normalizeTruckNumber, formatTruckDisplay } from '@/utils/truckUtils';
import * as R from '@/lib/sanmarineRules';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';
import { canonicalCompany } from '@/components/sanmarine/company/companyScope';

// Saving / editing / matching of empty-weight (1st weighing) and loading (2nd weighing) records,
// including duplicate blocking, trip matching, problem flags and alerts.

const E = () => base44.entities;
const UNLINKED = [{ loadingEntryId: '' }, { loadingEntryId: { $exists: false } }];
const truckCond = (raw) => {
  const n = normalizeTruckNumber(raw);
  const d = n.replace(/\D/g, '');
  return d.length >= 5 ? { $regex: `${d}$` } : n;
};
const latest = (items, dKey, tKey) => [...items].sort((a, b) => R.toMs(b[dKey], b[tKey]) - R.toMs(a[dKey], a[tKey]))[0] || null;
const stripPrev = (flags) => flags.map((f) => { const { previous, ...rest } = f; return rest; });
const audit = (u, action, type, id, details, oldV, newV) => api.addAuditLog({
  userId: u.id, userName: u.name, userEmail: u.email, userRole: u.role, action, recordType: type, recordId: id || '', details: details || '',
  oldValue: oldV ? JSON.stringify(oldV) : '', newValue: newV ? JSON.stringify(newV) : '', success: true,
});

async function makeAlerts(flags, base) {
  if (!flags.length) return [];
  // Every alert is tied to the exact record it came from, and one unresolved alert per problem per record is
  // enough: re-saving the same entry (or a retry) must never pile up duplicate alerts of the same problem.
  const rel = base.relatedLoadingId ? { relatedLoadingId: base.relatedLoadingId }
    : base.relatedEmptyId ? { relatedEmptyId: base.relatedEmptyId } : null;
  let existing = new Set();
  if (rel) {
    const page = await E().Alert.filter({ ...rel, status: { $ne: 'RESOLVED' }, category: { $in: flags.map((f) => f.code) } }, { limit: 50, fields: ['category'] });
    existing = new Set(page.items.map((a) => a.category));
  }
  return Promise.all(flags.filter((f) => !existing.has(f.code)).map((f) => api.createAlert({
    ...base, ...R.alertFromFlag(f, base.truckNumber), previousRecord: f.previous ? JSON.stringify(f.previous) : undefined,
  })));
}

// A weight difference over the tolerance is held for an admin decision instead of being saved. The request
// carries the exact submitted form, so an approved entry is created exactly as the operator submitted it.
async function requestWeightApproval(kind, { truckNumber, label, detail, summary, form, me }) {
  return E().ApprovalRequest.create({
    type: 'WEIGHT_MISMATCH', targetId: '',
    targetDescription: `${label} ওজন গড়মিল — ট্রাক ${truckNumber}: ${summary}`,
    details: detail || '',
    payload: JSON.stringify({ kind, form, submitter: { id: me.id, name: me.name, role: me.role, employeeId: me.employeeId || '' } }),
    requestedBy: me.id, requestedByName: me.name, requestedRole: me.role, requestedAt: api.nowISO(), status: 'pending',
  });
}

async function resolveAlerts(query, note) {
  const page = await E().Alert.filter({ ...query, status: { $ne: 'RESOLVED' } }, { limit: 20 });
  await Promise.all(page.items.map((a) => api.updateAlert(a.id, { status: 'RESOLVED', investigationNotes: note })));
}

export async function assertLighterOpen(lighterId) {
  if (!lighterId) return;
  const locked = await E().VesselClosing.filter({ lighterVesselId: lighterId, status: 'LOCKED' }, { limit: 1 });
  if (locked.items && locked.items.length) throw new Error('এই লাইটারের ক্লোজিং সম্পন্ন (LOCKED)। নতুন এন্ট্রি সম্ভব নয়।');
}

// Historical records of a closed (LOCKED) lighter are immutable until it is reopened.
export async function assertNotLocked(kind, rec) {
  let lighterId = kind === 'loading' ? rec.lighterVesselId : '';
  if (kind === 'empty' && rec.loadingEntryId) {
    try { lighterId = (await E().TruckEntry.get(rec.loadingEntryId)).lighterVesselId; } catch (e) { lighterId = ''; }
  }
  if (!lighterId) return;
  const locked = await E().VesselClosing.filter({ lighterVesselId: lighterId, status: 'LOCKED' }, { limit: 1 });
  if (locked.items && locked.items.length) throw new Error('এই লাইটারের ক্লোজিং সম্পন্ন (LOCKED) — ঐতিহাসিক রেকর্ড পরিবর্তন বা মোছা যাবে না। আগে লাইটার পুনরায় খুলুন।');
}

// Previous trip information for the entry forms.
export async function getTruckContext(truckRaw) {
  const cond = truckCond(truckRaw);
  const [loads, empties] = await Promise.all([
    E().TruckEntry.filter({ normalizedTruckNumber: cond }, { sort: '-date', limit: 3 }),
    E().EmptyWeight.filter({ normalizedTruckNumber: cond }, { sort: '-emptyWeightDate', limit: 3 }),
  ]);
  return { lastLoad: latest(loads.items, 'date', 'time'), lastEmpty: latest(empties.items, 'emptyWeightDate', 'emptyWeightTime') };
}

// Serial is per LIGHTER and only exists for a completed loading (an empty-weight save never consumes a serial).
async function nextSerial(lighterId) {
  const n = await E().TruckEntry.count({ lighterVesselId: lighterId });
  for (let i = 0; i < 5; i += 1) {
    const s = String(n + 1 + i).padStart(3, '0');
    if (!(await E().TruckEntry.count({ lighterVesselId: lighterId, serial: s }))) return s;
  }
  return `${n + 1}-${String(Date.now()).slice(-4)}`;
}

// Adds vessel / lighter names (previous and current trip) to a same-time-different-ghat alert.
async function annotateGhatConflict(flags, prevRec, cur) {
  const i = flags.findIndex((f) => f.code === 'SAME_TIME_GHAT_CONFLICT');
  if (i < 0) return;
  let prevNote = '';
  if (prevRec && prevRec.lighterVesselId) {
    const [mv, lv] = await Promise.all([
      prevRec.motherVesselId ? E().MotherVessel.get(prevRec.motherVesselId).catch(() => null) : null,
      E().LighterVessel.get(prevRec.lighterVesselId).catch(() => null),
    ]);
    prevNote = ` | আগের ভেসেল: ${(mv && mv.name) || '—'}, লাইটার: ${(lv && lv.name) || '—'}`;
  }
  const curNote = cur ? ` | এখনকার ভেসেল: ${cur.vessel || '—'}, লাইটার: ${cur.lighter || '—'}` : '';
  flags[i] = { ...flags[i], detail: `${flags[i].detail}${prevNote}${curNote}` };
}

// One weighing slip = one entry. The slip's truck number, date and time decide its identity — the scale name is
// never part of it, so the same slip entered under a different scale name is still caught as a duplicate.
// `d` = { truckNumber, date, time, secondWeightDate, secondWeightTime } (a loading slip counts from either side).
export async function findDuplicateSlip(kind, d) {
  const dateFields = kind === 'empty' ? ['emptyWeightDate'] : ['date', 'secondWeightDate'];
  const timeFields = kind === 'empty' ? ['emptyWeightTime'] : ['time', 'secondWeightTime'];
  const dates = [...new Set([d.date, d.secondWeightDate].filter(Boolean))];
  if (!dates.length) return null;
  const wanted = kind === 'empty' ? [[d.date, d.time]] : [[d.date, d.time], [d.secondWeightDate, d.secondWeightTime]];
  const query = { normalizedTruckNumber: truckCond(d.truckNumber), $or: dateFields.map((f) => ({ [f]: { $in: dates } })) };
  const page = await (kind === 'empty' ? E().EmptyWeight : E().TruckEntry).filter(query, { sort: '-created_date', limit: 50 });
  return page.items.find((r) => wanted.some(([date, time]) => date && time && dateFields.some((df, i) => r[df] === date && R.sameSlipTime(r[timeFields[i]], time)))) || null;
}

async function blockDuplicateEntry(kind, found, base, label) {
  if (!found) return;
  const when = `${found.emptyWeightDate || found.date} ${found.emptyWeightTime || found.time}`;
  const f = { ...R.flag('DUPLICATE_SAME_TIME', `${base.truckNumber} — ${label} হিসেবে আগেই এন্ট্রি আছে (${when}, স্কেল ${found.scaleName || '—'}, সিরিয়াল ${found.serial || '—'}); তাই এই স্লিপে নতুন এন্ট্রি নেওয়া হয়নি।`), previous: found };
  await makeAlerts([f], { ...base, ...(kind === 'empty' ? { relatedEmptyId: found.id } : { relatedLoadingId: found.id }) });
  throw new Error(`এই গাড়ি আগে ${label} হিসেবে এন্ট্রি হয়েছে (${when}) — একই স্লিপে আবার এন্ট্রি হবে না, অ্যালার্ট তৈরি হয়েছে। একই গাড়ি ভিন্ন তারিখ বা ভিন্ন সময়ে এন্ট্রি করলে সেটা ডুপ্লিকেট নয়, স্বাভাবিকভাবে জমা হবে।`);
}

// A loading record entered before its empty weight gets linked as soon as the empty weight is saved.
async function linkEmptyToPendingLoad(empty, rules) {
  // An empty weight carries no company of its own: the company is decided at loading time by the
  // Mother Vessel → Lighter chain. So matching is by truck number, and the empty record then adopts the
  // load's company. If the candidate loads span more than one company, it is left for Admin Review.
  const page = await E().TruckEntry.filter({ normalizedTruckNumber: truckCond(empty.truckNumber), emptyWeightMatched: { $ne: true } }, { sort: 'date', limit: 20 });
  const emptyMs = R.toMs(empty.emptyWeightDate, empty.emptyWeightTime);
  const candidates = page.items.filter((l) => R.toMs(l.date, l.time) >= emptyMs).sort((a, b) => R.toMs(a.date, a.time) - R.toMs(b.date, b.time));
  if (!candidates.length) return null;
  if (new Set(candidates.map((l) => canonicalCompany(l.company))).size > 1) return null;
  const load = candidates[0];
  const match = R.matchFlags({ date: load.date, time: load.time, ghat: load.ghatName, tare: load.tare, weightIn: load.weightIn }, empty, rules);
  const flags = R.mergeFlags(R.parseFlags(load), R.MATCH_FLAG_CODES, match);
  await E().TruckEntry.update(load.id, {
    emptyWeightMatched: true, emptyWeightId: empty.id, emptyWeightDate: empty.emptyWeightDate, emptyWeightTime: empty.emptyWeightTime,
    tareDate: load.tareDate || empty.emptyWeightDate, tareTime: load.tareTime || empty.emptyWeightTime, emptyMonitorWeight: empty.monitorWeight,
    emptyDocMissing: false, missingDocs: R.docFlags('loading', load).length > 0,
    loadedVsEmptyDiff: (Number(load.tare) || 0) - (Number(empty.monitorWeight) || 0), problemFlags: JSON.stringify(flags),
  });
  await E().EmptyWeight.update(empty.id, { loadingEntryId: load.id, company: canonicalCompany(load.company) });
  await resolveAlerts({ relatedLoadingId: load.id, category: 'EMPTY_WEIGHT_MISSING' }, 'খালি ওজন পরে এন্ট্রি হয়েছে ও যুক্ত হয়েছে');
  await makeAlerts(match, { truckNumber: load.truckNumber, normalizedTruckNumber: load.normalizedTruckNumber, ghat: load.ghatName, enteredByName: load.enteredBy, company: canonicalCompany(load.company), motherVesselId: load.motherVesselId, lighterVesselId: load.lighterVesselId, relatedLoadingId: load.id, relatedEmptyId: empty.id });
  return load;
}

const requireMsg = (missing) => { if (missing.length) throw new Error(`আবশ্যক তথ্য/ডকুমেন্ট অসম্পূর্ণ — জমা হয়নি: ${missing.join(', ')}`); };

export async function saveEmptyWeight(d, actor, rules, opts = {}) {
  const me = await requireActor(actor);
  // On an approved mismatch the record belongs to whoever did the weighing, not to the admin who approved it.
  const by = opts.approved && opts.enteredBy ? opts.enteredBy : me;
  const truckNumber = formatTruckDisplay(d.truckNumber);
  const norm = normalizeTruckNumber(truckNumber);
  const ghat = (d.ghat || '').toUpperCase();
  const scale = (d.scaleName || '').toUpperCase().trim();
  const tally = Number(d.tallyWeight) || 0;
  const monitor = Number(d.monitorWeight) || 0;
  requireMsg([
    !norm && 'ট্রাক নম্বর', !ghat && 'ঘাট', !d.emptyWeightDate && 'তারিখ', !d.emptyWeightTime && 'সময়',
    !(tally > 0) && 'খালি গাড়ির ওজন', !(monitor > 0) && 'মনিটর ওজন', !d.tallyOriginalPhoto && 'খালি ওজন স্লিপ ছবি', !d.monitorPhoto && 'মনিটর ছবি',
  ].filter(Boolean));

  const base0 = { truckNumber, normalizedTruckNumber: norm, ghat, enteredByName: by.name, company: canonicalCompany(d.company) };
  await blockDuplicateEntry('empty', await findDuplicateSlip('empty', { truckNumber, date: d.emptyWeightDate, time: d.emptyWeightTime }), base0, 'খালি ওজন');

  const [pend, loads, scaleCheck, pastEmpties] = await Promise.all([
    E().EmptyWeight.filter({ normalizedTruckNumber: truckCond(truckNumber), $or: UNLINKED }, { sort: '-emptyWeightDate', limit: 5 }),
    E().TruckEntry.filter({ normalizedTruckNumber: truckCond(truckNumber) }, { sort: '-date', limit: 3 }),
    api.checkScaleMapping(scale, ghat),
    E().EmptyWeight.filter({ normalizedTruckNumber: truckCond(truckNumber) }, { sort: '-emptyWeightDate', limit: 5 }),
  ]);
  const flags = [...R.emptyWeightFlags({ tally, monitor })];
  // Video is optional at submission (confirmed by the entry form), but a missing video always raises an alert.
  if (!d.emptyTruckVideo) flags.push(R.flag('EMPTY_VIDEO_MISSING', 'খালি গাড়ির ভিডিও সংরক্ষিত হয়নি — অনুগ্রহ করে পরে ভিডিও যোগ করুন।'));
  const previous = latest(pend.items, 'emptyWeightDate', 'emptyWeightTime');
  if (previous && previous.emptyWeightDate === d.emptyWeightDate) {
    flags.push({ ...R.flag('DUPLICATE_EMPTY_WEIGHT', 'এই ট্রাকের খালি ওজন আজ আগেই নেওয়া হয়েছে এবং এখনো লোড এন্ট্রি হয়নি।'), previous });
  } else if (previous) {
    flags.push({ ...R.flag('PREVIOUS_TRIP_PENDING', `আগের খালি ওজন (${previous.emptyWeightDate} ${previous.emptyWeightTime}) এখনো লোড এন্ট্রির সাথে মেলেনি।`), previous });
  }
  const prevLoad = latest(loads.items.filter((l) => R.toMs(l.date, l.time) <= R.toMs(d.emptyWeightDate, d.emptyWeightTime)), 'date', 'time');
  flags.push(...R.tripGapFlags({ date: d.emptyWeightDate, time: d.emptyWeightTime }, prevLoad, rules));
  // Previous vs current EMPTY weight of this truck (any ghat): > 50 KG = high priority alert with the exact KG.
  const curMs = R.toMs(d.emptyWeightDate, d.emptyWeightTime);
  const prevEmpty = latest(pastEmpties.items.filter((x) => R.toMs(x.emptyWeightDate, x.emptyWeightTime) < curMs), 'emptyWeightDate', 'emptyWeightTime');
  flags.push(...R.emptyHistoryFlags(tally, prevEmpty));
  // Same truck at a different ghat within the trip-gap window = red alert (previous point = latest earlier load or empty weight).
  const points = [
    prevLoad && { date: prevLoad.date, time: prevLoad.time, ghat: prevLoad.ghatName, rec: prevLoad },
    prevEmpty && { date: prevEmpty.emptyWeightDate, time: prevEmpty.emptyWeightTime, ghat: prevEmpty.ghat, rec: prevEmpty },
  ].filter(Boolean).sort((a, b) => R.toMs(b.date, b.time) - R.toMs(a.date, a.time));
  flags.push(...R.ghatTimeFlags({ date: d.emptyWeightDate, time: d.emptyWeightTime, ghat }, points[0], rules, truckNumber));
  await annotateGhatConflict(flags, points[0] && points[0].rec, null);
  if (scaleCheck.status === 'conflict') flags.push(R.flag('SCALE_GHAT_CONFLICT', `স্কেল ${scale} আগে ${scaleCheck.mapping.ghatName} ঘাটে ছিল, এখন ${ghat} ঘাটে।`));

  const mismatch = flags.some((f) => f.code === 'WEIGHT_MISMATCH');
  // A monitor-vs-slip difference over the tolerance is not recorded straight away: the submission becomes an
  // approval request, and the entry is created only when an admin approves it.
  if (mismatch && !opts.approved) {
    const wf = flags.find((f) => f.code === 'WEIGHT_MISMATCH');
    const approval = await requestWeightApproval('empty', {
      truckNumber, label: 'খালি ওজন', detail: wf.detail, form: d, me,
      summary: `স্লিপ ${tally} KG, মনিটর ${monitor} KG (পার্থক্য ${monitor - tally} KG) · ${d.emptyWeightDate} ${d.emptyWeightTime} · ঘাট ${ghat}`,
    });
    return { pendingApproval: true, approval, flags };
  }
  const record = await E().EmptyWeight.create({
    truckNumber, normalizedTruckNumber: norm, emptyWeightDate: d.emptyWeightDate, emptyWeightTime: d.emptyWeightTime, ghat, company: canonicalCompany(d.company), scaleName: scale,
    latitude: d.latitude, longitude: d.longitude, locationName: d.locationName || '', gpsCapturedAt: d.gpsCapturedAt || '',
    tallyWeight: tally, monitorWeight: monitor, difference: monitor - tally, matchStatus: mismatch ? 'WEIGHT_MISMATCH' : 'MATCHED',
    tallyOriginalPhoto: d.tallyOriginalPhoto, monitorPhoto: d.monitorPhoto,
    emptyTruckVideo: d.emptyTruckVideo || '', emptyTruckVideoName: d.emptyTruckVideoName || '', remarks: d.remarks || '',
    enteredById: by.id, enteredByName: by.name, enteredByRole: by.role, employeeId: by.employeeId || '',
    createdTime: api.nowISO(), verificationStatus: mismatch && !opts.approved ? 'FLAG_FOR_REVIEW' : 'VERIFIED', loadingEntryId: '',
    problemFlags: JSON.stringify(stripPrev(flags)),
    auditTrail: JSON.stringify([
      { timestamp: api.nowISO(), performedBy: by.name, action: 'EMPTY_WEIGHT_CREATED' },
      ...(opts.approved ? [{ timestamp: api.nowISO(), performedBy: me.name, action: 'ADMIN_APPROVED_WEIGHT_MISMATCH' }] : []),
    ]),
  });
  const generatedAlerts = await makeAlerts(flags, { ...base0, relatedEmptyId: record.id, currentRecord: JSON.stringify(record) });
  if (scale) await api.upsertScaleGhatMapping(scale, ghat);
  const linkedLoad = await linkEmptyToPendingLoad(record, rules);
  return { record, generatedAlerts, linkedLoad };
}

export async function saveLoadingEntry(d, actor, rules, opts = {}) {
  const me = await requireActor(actor);
  // On an approved mismatch the record belongs to whoever did the weighing, not to the admin who approved it.
  const by = opts.approved && opts.enteredBy ? opts.enteredBy : me;
  await assertLighterOpen(d.lighterVesselId);
  const truckNumber = formatTruckDisplay(d.truckNumber);
  const norm = normalizeTruckNumber(truckNumber);
  const ghat = (d.ghatName || '').toUpperCase();
  const scale = (d.scaleName || '').toUpperCase().trim();
  const gross = Number(d.gross) || 0;
  const tare = Number(d.tare) || 0;
  const secondWeight = Number(d.secondWeight) || 0;
  const net = gross - tare;
  requireMsg([
    !norm && 'ট্রাক নম্বর', !d.date && 'লোড তারিখ', !d.time && 'লোড সময়', !d.motherVesselId && 'মাদার ভেসেল', !d.lighterVesselId && 'লাইটার', !ghat && 'ঘাট', !(gross > 0) && 'গ্রস ওজন',
    !(tare > 0) && 'খালি গাড়ির ওজন', !(secondWeight > 0) && 'মনিটর ওয়েট', !d.secondWeightDate && 'সেকেন্ড ওয়েট তারিখ', !d.secondWeightTime && 'সেকেন্ড ওয়েট সময়',
    ...R.docFlags('loading', { bags: d.bags, scalePhoto: d.scalePhoto, monitorPhoto: d.monitorPhoto }).map((f) => f.detail),
  ].filter(Boolean));
  if (net <= 0) throw new Error('নেট ওজন শূন্যের বেশি হতে হবে (গ্রস > টেয়ার)।');

  // Mother Vessel → Lighter → Consignee → Cargo must be a valid chain (checked here, not only in the form).
  const [lighterRec, vesselRec] = await Promise.all([
    E().LighterVessel.get(d.lighterVesselId).catch(() => null),
    E().MotherVessel.get(d.motherVesselId).catch(() => null),
  ]);
  if (!lighterRec || !vesselRec || lighterRec.motherVesselId !== vesselRec.id) throw new Error('অবৈধ সংযোগ: নির্বাচিত লাইটার এই মাদার ভেসেলের অধীনে নয় — এন্ট্রি বাতিল করা হয়েছে।');
  const company = canonicalCompany(vesselRec.company);
  if (!company || lighterRec.company && canonicalCompany(lighterRec.company) !== company) throw new Error('Mother/Lighter-এর কোম্পানি অনির্ধারিত বা বিরোধপূর্ণ — Admin Review দরকার।');

  const base0 = { truckNumber, normalizedTruckNumber: norm, ghat, enteredByName: by.name, company, motherVesselId: vesselRec.id, lighterVesselId: lighterRec.id, consigneeId: lighterRec.consigneeId || '' };
  await blockDuplicateEntry('loading', await findDuplicateSlip('loading', { truckNumber, date: d.date, time: d.time, secondWeightDate: d.secondWeightDate, secondWeightTime: d.secondWeightTime }), base0, 'লোড এন্ট্রি');

  let empty = null;
  if (d.emptyWeightId) {
    empty = await E().EmptyWeight.get(d.emptyWeightId).catch(() => null);
    if (empty && empty.loadingEntryId) throw new Error('এই খালি ওজন রেকর্ড ইতিমধ্যে অন্য লোড এন্ট্রির সাথে যুক্ত। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।');
    // An empty weight has no company of its own until it is loaded; only a genuinely conflicting company blocks the link.
    if (empty && canonicalCompany(empty.company) && canonicalCompany(empty.company) !== company) throw new Error('অন্য কোম্পানির খালি ওজনের সঙ্গে এই Load যুক্ত করা যাবে না; আগে Admin Review করুন।');
  }
  const [loads, dupPage, scaleCheck, serial] = await Promise.all([
    E().TruckEntry.filter({ normalizedTruckNumber: truckCond(truckNumber) }, { sort: '-date', limit: 3 }),
    E().TruckEntry.filter({ normalizedTruckNumber: norm, date: d.date, gross, tare }, { limit: 1 }),
    api.checkScaleMapping(scale, ghat),
    nextSerial(d.lighterVesselId),
  ]);
  const prev = latest(loads.items.filter((l) => R.toMs(l.date, l.time) <= R.toMs(d.date, d.time)), 'date', 'time');
  const flags = [
    ...R.loadWeightFlags({ gross, secondWeight }),
    ...R.matchFlags({ date: d.date, time: d.time, ghat, tare, weightIn: d.weightIn }, empty, rules),
    ...R.tripGapFlags({ date: d.date, time: d.time }, prev, rules),
    ...R.ghatTimeFlags({ date: d.date, time: d.time, ghat }, prev && { date: prev.date, time: prev.time, ghat: prev.ghatName }, rules, truckNumber),
  ];
  await annotateGhatConflict(flags, prev, { vessel: vesselRec.name, lighter: lighterRec.name });
  if (dupPage.items[0]) flags.push({ ...R.flag('DUPLICATE_LOADING', 'একই তারিখে একই ট্রাক, একই গ্রস ও টেয়ার ওজনে আগেই এন্ট্রি আছে।'), previous: dupPage.items[0] });
  if (scaleCheck.status === 'conflict') flags.push(R.flag('SCALE_GHAT_CONFLICT', `স্কেল ${scale} আগে ${scaleCheck.mapping.ghatName} ঘাটে ছিল, এখন ${ghat} ঘাটে।`));

  // A gross-vs-monitor difference over the tolerance is not recorded straight away: the submission becomes an
  // approval request, and the entry is created only when an admin approves it.
  const loadMismatch = flags.find((f) => f.code === 'LOAD_WEIGHT_MISMATCH');
  if (loadMismatch && !opts.approved) {
    const approval = await requestWeightApproval('loading', {
      truckNumber, label: 'লোড এন্ট্রি', detail: loadMismatch.detail, form: d, me,
      summary: `গ্রস ${gross} KG, মনিটর ওয়েট ${secondWeight} KG (পার্থক্য ${secondWeight - gross} KG) · ${d.date} ${d.time} · নেট ${net} KG`,
    });
    return { pendingApproval: true, approval, flags };
  }

  const entry = await E().TruckEntry.create({
    date: d.date, time: d.time, shift: d.shift || 'Day', serial,
    motherVesselId: d.motherVesselId, lighterVesselId: d.lighterVesselId, consigneeId: lighterRec.consigneeId || d.consigneeId || '', consigneeName: lighterRec.consigneeName || d.consigneeName || '',
    company, latitude: d.latitude, longitude: d.longitude, locationName: d.locationName || '', gpsCapturedAt: d.gpsCapturedAt || '',
    ghatId: d.ghatId || '', ghatName: ghat, scaleName: scale, cargoType: d.cargoType || vesselRec.cargoType || '', cargoName: d.cargoName || d.cargoType || vesselRec.cargoType || '',
    truckNumber, normalizedTruckNumber: norm, bags: Number(d.bags) || 0, gross, tare, net,
    weightIn: Number(d.weightIn) || 0, weightOut: Number(d.weightOut) || Number(d.gross) || 0,
    secondWeight, secondWeightDate: d.secondWeightDate, secondWeightTime: d.secondWeightTime,
    scalePhoto: d.scalePhoto, monitorPhoto: d.monitorPhoto,
    emptyWeightMatched: !!empty, emptyWeightId: empty ? empty.id : '', emptyWeightDate: empty ? empty.emptyWeightDate : '', emptyWeightTime: empty ? empty.emptyWeightTime : '',
    emptyMonitorWeight: empty ? empty.monitorWeight : undefined, tareDate: d.tareDate || '', tareTime: d.tareTime || '',
    missingDocs: !empty, emptyDocMissing: !empty, loadedVsEmptyDiff: empty ? tare - (Number(empty.monitorWeight) || 0) : 0,
    problemFlags: JSON.stringify(stripPrev(flags)),
    createdBy: by.id, enteredBy: by.name, enteredRole: by.role, employeeId: by.employeeId || '', remarks: d.remarks || '', createdAt: api.nowISO(),
  });
  if (empty) {
    await E().EmptyWeight.update(empty.id, { loadingEntryId: entry.id, company });
    await resolveAlerts({ relatedEmptyId: empty.id, category: 'EMPTY_PENDING' }, 'লোড এন্ট্রি হয়েছে');
  }
  if (scale) await api.upsertScaleGhatMapping(scale, ghat);
  const generatedAlerts = await makeAlerts(flags, { ...base0, relatedLoadingId: entry.id, relatedEmptyId: empty ? empty.id : '', currentRecord: JSON.stringify(entry) });
  return { ...entry, generatedAlerts };
}

// ---- Editing (Admin directly; Supervisor/Staff through a Super Admin approved request) ----
const EDITABLE = {
  loading: ['truckNumber', 'date', 'time', 'shift', 'ghatName', 'scaleName', 'cargoName', 'bags', 'gross', 'tare', 'secondWeight', 'secondWeightDate', 'secondWeightTime', 'remarks', 'scalePhoto', 'monitorPhoto'],
  empty: ['truckNumber', 'emptyWeightDate', 'emptyWeightTime', 'ghat', 'scaleName', 'tallyWeight', 'monitorWeight', 'tallyOriginalPhoto', 'monitorPhoto', 'emptyTruckVideo', 'emptyTruckVideoName', 'remarks'],
};
const NUMERIC = ['bags', 'gross', 'tare', 'secondWeight', 'tallyWeight', 'monitorWeight'];
export const pickEditable = (kind, patch) => Object.fromEntries(
  Object.entries(patch || {}).filter(([k]) => EDITABLE[kind].includes(k)).map(([k, v]) => [k, NUMERIC.includes(k) ? Number(v) || 0 : v]),
);

export async function applyRecordEdit(kind, id, rawPatch, actor, { approved = false } = {}) {
  const me = approved ? actor : await requireActor(actor, ROLE_SETS.ADMIN);
  const ent = kind === 'loading' ? E().TruckEntry : E().EmptyWeight;
  const rec = await ent.get(id);
  if (!rec) throw new Error('রেকর্ড পাওয়া যায়নি।');
  await assertNotLocked(kind, rec);
  const patch = pickEditable(kind, rawPatch);
  if (patch.truckNumber !== undefined) patch.truckNumber = formatTruckDisplay(patch.truckNumber);
  if (patch.ghatName) patch.ghatName = patch.ghatName.toUpperCase();
  if (patch.ghat) patch.ghat = patch.ghat.toUpperCase();
  if (patch.scaleName) patch.scaleName = patch.scaleName.toUpperCase().trim();
  const next = { ...rec, ...patch };
  const extra = { normalizedTruckNumber: normalizeTruckNumber(next.truckNumber) };
  if (kind === 'loading') {
    extra.net = (Number(next.gross) || 0) - (Number(next.tare) || 0);
    if (extra.net <= 0) throw new Error('নেট ওজন শূন্যের বেশি হতে হবে (গ্রস > টেয়ার)।');
    requireMsg(R.docFlags('loading', next).map((f) => f.detail));
    extra.problemFlags = JSON.stringify(R.mergeFlags(R.parseFlags(rec), ['LOAD_WEIGHT_MISMATCH'], R.loadWeightFlags(next)));
  } else {
    requireMsg([!(Number(next.tallyWeight) > 0) && 'খালি গাড়ির ওজন', !(Number(next.monitorWeight) > 0) && 'মনিটর ওজন', ...R.docFlags('empty', next).map((f) => f.detail)].filter(Boolean));
    const wf = R.emptyWeightFlags({ tally: next.tallyWeight, monitor: next.monitorWeight });
    extra.difference = (Number(next.monitorWeight) || 0) - (Number(next.tallyWeight) || 0);
    extra.matchStatus = wf.length ? 'WEIGHT_MISMATCH' : 'MATCHED';
    extra.verificationStatus = wf.length ? 'FLAG_FOR_REVIEW' : 'VERIFIED';
    extra.problemFlags = JSON.stringify(R.mergeFlags(R.parseFlags(rec), ['WEIGHT_MISMATCH'], wf));
  }
  const changed = Object.keys(patch).filter((k) => String(rec[k] ?? '') !== String(patch[k] ?? ''));
  if (!changed.length) return rec;
  const before = Object.fromEntries(changed.map((k) => [k, rec[k] ?? '']));
  const after = Object.fromEntries(changed.map((k) => [k, patch[k]]));
  const updated = await ent.update(id, { ...patch, ...extra, lastEditedBy: me.name, lastEditedAt: api.nowISO() });
  await audit(me, 'RECORD_EDITED', kind === 'loading' ? 'TruckEntry' : 'EmptyWeight', id, rec.truckNumber, before, after);
  return updated;
}

// Creates "pending empty weight" alerts for empty weights that waited too long for their loading entry.
export async function syncPendingAlerts(pending, rules) {
  if (!(rules.pendingEmptyAlertHours > 0)) return 0;
  const limitMs = rules.pendingEmptyAlertHours * 3600000;
  const overdue = pending.filter((e) => !e.loadingEntryId && Date.now() - R.toMs(e.emptyWeightDate, e.emptyWeightTime) > limitMs).slice(0, 20);
  let created = 0;
  for (const e of overdue) {
    const exists = await E().Alert.filter({ relatedEmptyId: e.id, category: 'EMPTY_PENDING' }, { limit: 1 });
    if (exists.items.length) continue;
    const f = R.flag('EMPTY_PENDING', `${e.truckNumber} — খালি ওজন (${e.emptyWeightDate} ${e.emptyWeightTime}) ${rules.pendingEmptyAlertHours} ঘণ্টার বেশি সময় ধরে লোড এন্ট্রির অপেক্ষায়।`);
    await makeAlerts([f], { truckNumber: e.truckNumber, normalizedTruckNumber: e.normalizedTruckNumber, ghat: e.ghat, enteredByName: e.enteredByName, company: canonicalCompany(e.company) || undefined, relatedEmptyId: e.id });
    created += 1;
  }
  return created;
}