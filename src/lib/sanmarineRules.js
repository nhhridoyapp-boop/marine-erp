import { normalizeTruckNumber } from '@/utils/truckUtils';

// Pure business rules (no database access): weight tolerances, problem flags, required-document checks,
// daily-document (weighment sheet vs point khata) reconciliation.

// 50 KG: cross-slip (loaded Weight In vs empty slip) and previous-vs-current empty weight of a truck.
export const WEIGHT_TOLERANCE_KG = 50;
// 10 KG: monitor weight vs scale/slip weight of the same weighing.
export const MONITOR_TOLERANCE_KG = 10;
// More than 45 bags difference between Weighment Sheet and Point Khata = high priority alert.
export const DOC_BAG_ALERT_THRESHOLD = 45;
export const DEFAULT_RULES = { oldEmptyWeightHours: 24, minTripGapMinutes: 60, pendingEmptyAlertHours: 12 };

const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
export const getRules = (s) => ({
  oldEmptyWeightHours: num(s?.oldEmptyWeightHours, DEFAULT_RULES.oldEmptyWeightHours),
  minTripGapMinutes: num(s?.minTripGapMinutes, DEFAULT_RULES.minTripGapMinutes),
  pendingEmptyAlertHours: num(s?.pendingEmptyAlertHours, DEFAULT_RULES.pendingEmptyAlertHours),
});

export const toMs = (date, time) => (date ? new Date(`${date}T${(time || '00:00').slice(0, 5)}:00`).getTime() : NaN);
const diffKg = (a, b) => (Number(a) || 0) - (Number(b) || 0);

// Clock minutes of a slip time, so "10:30", "10:30:00", "10.30" and "10:30 AM" are treated as one time.
const toMinutes = (t) => {
  const s = String(t || '').trim().toUpperCase();
  const m = s.match(/(\d{1,2})\D?(\d{2})/);
  if (!m) return null;
  const pm = s.includes('PM');
  const h = pm || s.includes('AM') ? (Number(m[1]) % 12) + (pm ? 12 : 0) : Number(m[1]);
  return h * 60 + Number(m[2]);
};
// One weighing slip is identified by its truck number, date and time — never by the scale name, because the
// same slip entered under a different scale name is still the same weighing.
export const sameSlipTime = (a, b) => {
  const x = toMinutes(a), y = toMinutes(b);
  if (x !== null && y !== null) return x === y;
  return String(a || '').trim() === String(b || '').trim();
};

// group: weight | empty | duplicate | previous | conflict | doc   (used by Ghat Summary)
// `headline` is what the alert card shows in big text: one plain line that says exactly what the problem is,
// so a list of alerts is understandable without opening any of them.
export const FLAG_META = {
  WEIGHT_MISMATCH: { label: 'খালি গাড়ির ওজন অমিল', headline: 'খালি ওজন গড়মিল — স্লিপের ওজন ও মনিটর ওজন মিলছে না', severity: 'high', group: 'weight' },
  EMPTY_WEIGHT_DIFFERENCE: { label: 'খালি ওজনের পার্থক্য (আগের বনাম এখন)', headline: 'খালি ওজনে পার্থক্য — এই ট্রাকের আগের খালি ওজনের সাথে মিলছে না', severity: 'high', group: 'weight' },
  LOAD_WEIGHT_MISMATCH: { label: 'গ্রস-মনিটর ওয়েট অমিল', headline: 'লোড ওজন গড়মিল — স্কেলের গ্রস ওজন ও মনিটর ওয়েট মিলছে না', severity: 'high', group: 'weight' },
  CROSS_SLIP_WEIGHT_MISMATCH: { label: 'লোড-খালি স্লিপ ওজন অমিল', headline: 'লোড স্লিপ ও খালি স্লিপের ওজন আলাদা', severity: 'critical', group: 'weight' },
  CROSS_SLIP_TRUCK_MISMATCH: { label: 'লোড-খালি স্লিপ ট্রাক অমিল', headline: 'লোড স্লিপ ও খালি স্লিপের ট্রাক নম্বর আলাদা', severity: 'critical', group: 'duplicate' },
  EMPTY_WEIGHT_MISSING: { label: 'লোডিং আছে, খালি ওজন নেই (LOADING WITHOUT EMPTY WEIGHT)', headline: 'লোড এন্ট্রি আছে কিন্তু এই ট্রাকের খালি ওজন নেই', severity: 'warning', group: 'empty' },
  EMPTY_PENDING: { label: 'খালি ওজন পেন্ডিং (EMPTY WEIGHT PENDING)', headline: 'খালি ওজন নেওয়া হয়েছে কিন্তু লোড এন্ট্রি এখনো হয়নি', severity: 'warning', group: 'empty' },
  EMPTY_DATE_DIFF: { label: 'খালি ও লোড তারিখ আলাদা', headline: 'খালি ওজনের তারিখ ও লোডের তারিখ আলাদা', severity: 'medium', group: 'empty' },
  OLD_EMPTY_WEIGHT: { label: 'পুরোনো খালি ওজন', headline: 'পুরোনো খালি ওজন দিয়ে লোড হয়েছে — সময়সীমার চেয়ে বেশি পুরোনো', severity: 'high', group: 'empty' },
  GHAT_CONFLICT: { label: 'ঘাট কনফ্লিক্ট', headline: 'ঘাট মিলছে না — খালি ওজন ও লোড ভিন্ন ঘাটে', severity: 'high', group: 'conflict' },
  SCALE_GHAT_CONFLICT: { label: 'স্কেল অন্য ঘাটে', headline: 'স্কেল ভিন্ন ঘাটে ব্যবহার হচ্ছে', severity: 'high', group: 'conflict' },
  SAME_TIME_GHAT_CONFLICT: { label: 'একই সময়ে ভিন্ন ঘাটে ট্রাক', headline: 'একই সময়ে দুই ঘাটে একই ট্রাক', severity: 'critical', group: 'conflict' },
  DUPLICATE_SAME_TIME: { label: 'ডুপ্লিকেট এন্ট্রি আটকানো', headline: 'একই স্লিপ (একই গাড়ি, একই তারিখ ও সময়) — তাই নতুন এন্ট্রি নেওয়া হয়নি', severity: 'critical', group: 'duplicate' },
  DUPLICATE_EMPTY_WEIGHT: { label: 'ডুপ্লিকেট খালি ওজন', headline: 'একই দিনে এই ট্রাকের খালি ওজন দুইবার নেওয়া হয়েছে', severity: 'critical', group: 'duplicate' },
  DUPLICATE_LOADING: { label: 'ডুপ্লিকেট লোড এন্ট্রি', headline: 'একই ট্রাক, একই তারিখ ও একই ওজনে লোড এন্ট্রি দুইবার', severity: 'critical', group: 'duplicate' },
  TRIP_GAP: { label: 'ট্রিপ গ্যাপ কম', headline: 'দুই ট্রিপের মাঝে সময় খুব কম', severity: 'high', group: 'previous' },
  PREVIOUS_TRIP_PENDING: { label: 'আগের ট্রিপ অসম্পূর্ণ', headline: 'আগের ট্রিপের লোড এন্ট্রি এখনো হয়নি', severity: 'warning', group: 'previous' },
  BAG_MISSING: { label: 'ব্যাগ তথ্য নেই', headline: 'ব্যাগ সংখ্যা দেওয়া হয়নি', severity: 'high', group: 'doc' },
  MONITOR_PHOTO_MISSING: { label: 'মনিটর ছবি নেই', headline: 'মনিটর ছবি জমা হয়নি', severity: 'high', group: 'doc' },
  SCALE_PHOTO_MISSING: { label: 'স্কেল/স্লিপ ছবি নেই', headline: 'স্কেল/স্লিপ কপির ছবি জমা হয়নি', severity: 'high', group: 'doc' },
  EMPTY_VIDEO_MISSING: { label: 'খালি গাড়ির ভিডিও নেই', headline: 'খালি গাড়ির ভিডিও জমা হয়নি', severity: 'warning', group: 'doc' },
  DOC_MISMATCH: { label: 'ডেইলি ডকুমেন্ট অমিল', headline: 'ডেইলি ডকুমেন্ট মিলছে না — ওয়েইমেন্ট শিট ও পয়েন্ট খাতা', severity: 'high', group: 'doc' },
  DOC_TRUCK_MISMATCH: { label: 'ডকুমেন্ট: ট্রাক অমিল', headline: 'ডেইলি ডকুমেন্টে ট্রাক মিলছে না — ওয়েইমেন্ট শিট ও পয়েন্ট খাতা', severity: 'high', group: 'doc' },
  DOC_BAG_MISMATCH: { label: 'ডকুমেন্ট: ব্যাগ অমিল', headline: 'ডেইলি ডকুমেন্টে ব্যাগ মিলছে না — শিট ও খাতার ব্যাগ সংখ্যা আলাদা', severity: 'critical', group: 'doc' },
};

// values = [[label, number], [label, number]] — the two numbers that were compared, so the alert carries
// them as data (and not only inside the sentence) and every screen can show the same comparison.
export const flag = (code, detail = '', kg = 0, values = null) => ({ code, detail, kg: kg || 0, values: values || null });

export function parseFlags(rec) {
  try {
    const a = JSON.parse((rec && rec.problemFlags) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}

export const mergeFlags = (oldFlags, replaceCodes, newFlags) => [...oldFlags.filter((f) => !replaceCodes.includes(f.code)), ...newFlags];

// Required documents / data that must exist on a record. Checked live so the summary is always current.
export function docFlags(kind, rec) {
  const out = [];
  if (kind === 'loading') {
    if (!(Number(rec.bags) > 0)) out.push(flag('BAG_MISSING', 'ব্যাগ সংখ্যা নেই'));
    if (!rec.scalePhoto) out.push(flag('SCALE_PHOTO_MISSING', 'সেকেন্ড ওয়েট স্কেল কপি নেই'));
  } else if (!rec.tallyOriginalPhoto) {
    out.push(flag('SCALE_PHOTO_MISSING', 'খালি ওজন স্লিপ ছবি নেই'));
  }
  if (!rec.monitorPhoto) out.push(flag('MONITOR_PHOTO_MISSING', 'মনিটর ছবি নেই'));
  return out;
}

// All problems of a stored record: saved flags + live document checks + legacy fallbacks.
export function recordProblems(kind, rec) {
  const map = new Map(parseFlags(rec).map((f) => [f.code, f]));
  docFlags(kind, rec).forEach((f) => map.set(f.code, f));
  if (kind === 'loading' && !rec.emptyWeightMatched && !map.has('EMPTY_WEIGHT_MISSING')) {
    map.set('EMPTY_WEIGHT_MISSING', flag('EMPTY_WEIGHT_MISSING', 'খালি ওজন রেকর্ডের সাথে মেলেনি'));
  }
  if (kind === 'empty' && rec.matchStatus === 'WEIGHT_MISMATCH' && !map.has('WEIGHT_MISMATCH')) {
    map.set('WEIGHT_MISMATCH', flag('WEIGHT_MISMATCH', `খালি গাড়ির ওজন ${rec.tallyWeight} KG, মনিটর ${rec.monitorWeight} KG`, Math.abs(Number(rec.difference) || 0)));
  }
  return [...map.values()];
}

export function emptyWeightFlags({ tally, monitor }) {
  const d = diffKg(monitor, tally);
  return Math.abs(d) > MONITOR_TOLERANCE_KG ? [flag('WEIGHT_MISMATCH', `খালি গাড়ির ওজন ${tally} KG, মনিটর ${monitor} KG, পার্থক্য ${d} KG (সীমা ${MONITOR_TOLERANCE_KG} KG)`, Math.abs(d), [['স্লিপ', tally], ['মনিটর', monitor]])] : [];
}

export function loadWeightFlags({ gross, secondWeight }) {
  if (!(Number(secondWeight) > 0)) return [];
  const d = diffKg(secondWeight, gross);
  return Math.abs(d) > MONITOR_TOLERANCE_KG ? [flag('LOAD_WEIGHT_MISMATCH', `গ্রস ${gross} KG, মনিটর ওয়েট ${secondWeight} KG, পার্থক্য ${d} KG`, Math.abs(d), [['স্কেল গ্রস', gross], ['মনিটর ওয়েট', secondWeight]])] : [];
}

// Flags that describe how a loading record relates to its empty-weight record.
export function matchFlags({ date, time, ghat, tare, weightIn }, empty, rules) {
  if (!empty) return [flag('EMPTY_WEIGHT_MISSING', 'এই ট্রাকের অলিঙ্কড খালি ওজন রেকর্ড পাওয়া যায়নি')];
  const out = [];
  if (empty.emptyWeightDate && date && empty.emptyWeightDate !== date) {
    const days = Math.round(Math.abs(toMs(date, '00:00') - toMs(empty.emptyWeightDate, '00:00')) / 86400000);
    out.push(flag('EMPTY_DATE_DIFF', `খালি ওজন ${empty.emptyWeightDate}, লোড ${date} (${days} দিনের পার্থক্য)`));
  }
  const ageH = (toMs(date, time) - toMs(empty.emptyWeightDate, empty.emptyWeightTime)) / 3600000;
  if (ageH > rules.oldEmptyWeightHours) out.push(flag('OLD_EMPTY_WEIGHT', `খালি ওজন ${Math.round(ageH)} ঘণ্টা আগের (সীমা ${rules.oldEmptyWeightHours} ঘণ্টা)`));
  if (empty.ghat && ghat && empty.ghat.toUpperCase() !== ghat.toUpperCase()) out.push(flag('GHAT_CONFLICT', `খালি ওজন: ${empty.ghat}, লোড: ${ghat}`));
  const ed = diffKg(empty.monitorWeight, empty.tallyWeight);
  if (Math.abs(ed) > WEIGHT_TOLERANCE_KG) out.push(flag('EMPTY_WEIGHT_DIFFERENCE', `খালি স্লিপে গাড়ির ওজন ${empty.tallyWeight} KG, মনিটর ${empty.monitorWeight} KG`, Math.abs(ed), [['খালি স্লিপ', empty.tallyWeight], ['মনিটর', empty.monitorWeight]]));
  // Cross-slip verification: compare the loaded slip's printed "Weight In" against the empty slip's printed weight.
  // (slip-to-slip; the loaded form's tare field is the matched empty record's tally, so it is not a separate source)
  const wIn = Number(weightIn) > 0 ? Number(weightIn) : (Number(tare) > 0 ? Number(tare) : 0);
  const emptySlipW = Number(empty.tallyWeight) > 0 ? Number(empty.tallyWeight) : Number(empty.monitorWeight);
  if (wIn > 0 && emptySlipW > 0) {
    const cd = diffKg(wIn, emptySlipW);
    if (Math.abs(cd) > WEIGHT_TOLERANCE_KG)
      out.push(flag('CROSS_SLIP_WEIGHT_MISMATCH', `লোড স্লিপের Weight In ${wIn} KG, খালি স্লিপের ওজন ${emptySlipW} KG — পার্থক্য ${cd} KG`, Math.abs(cd), [['খালি স্লিপ', emptySlipW], ['লোড স্লিপ Weight In', wIn]]));
  }
  return out;
}
export const MATCH_FLAG_CODES = ['EMPTY_WEIGHT_MISSING', 'EMPTY_DATE_DIFF', 'OLD_EMPTY_WEIGHT', 'GHAT_CONFLICT', 'EMPTY_WEIGHT_DIFFERENCE', 'CROSS_SLIP_WEIGHT_MISMATCH'];

// Previous vs current EMPTY weight of the same truck (any ghat). More than 50 KG apart = HIGH PRIORITY alert with the exact KG.
export function emptyHistoryFlags(tally, prev) {
  if (!prev || !(Number(tally) > 0) || !(Number(prev.tallyWeight) > 0)) return [];
  const d = diffKg(tally, prev.tallyWeight);
  if (Math.abs(d) <= WEIGHT_TOLERANCE_KG) return [];
  return [flag('EMPTY_WEIGHT_DIFFERENCE', `আগের খালি ওজন ${prev.tallyWeight} KG (${prev.emptyWeightDate} ${prev.emptyWeightTime || ''}, ${prev.ghat || '—'}) → এখন ${tally} KG; পার্থক্য ${d > 0 ? '+' : ''}${d} KG`, Math.abs(d), [['আগের ওজন', prev.tallyWeight], ['এখনকার ওজন', tally]])];
}

// Same truck at a DIFFERENT ghat within the trip-gap window (same / overlapping time) = RED alert.
// cur / prev = { date, time, ghat }.
export function ghatTimeFlags(cur, prev, rules, truck = '') {
  if (!prev || !cur.ghat || !prev.ghat || cur.ghat.toUpperCase() === prev.ghat.toUpperCase()) return [];
  const windowMin = Math.max(Number(rules && rules.minTripGapMinutes) || 0, 1);
  const gap = (toMs(cur.date, cur.time) - toMs(prev.date, prev.time)) / 60000;
  if (!(gap >= 0 && gap < windowMin)) return [];
  return [flag('SAME_TIME_GHAT_CONFLICT', `ট্রাক ${truck}: আগের ঘাট ${prev.ghat} (${prev.date} ${prev.time || ''}) → এখনকার ঘাট ${cur.ghat} (${cur.date} ${cur.time || ''}), মাত্র ${Math.round(gap)} মিনিটের ব্যবধান`)];
}

// prev = { date, time } of the same truck's previous trip.
export function tripGapFlags({ date, time }, prev, rules) {
  if (!prev || !(rules.minTripGapMinutes > 0)) return [];
  const gap = (toMs(date, time) - toMs(prev.date, prev.time)) / 60000;
  if (gap >= 0 && gap < rules.minTripGapMinutes) {
    return [flag('TRIP_GAP', `আগের ট্রিপ (${prev.date} ${prev.time || ''}) থেকে মাত্র ${Math.round(gap)} মিনিট; ন্যূনতম ${rules.minTripGapMinutes} মিনিট`)];
  }
  return [];
}

export function alertFromFlag(f, truck) {
  const meta = FLAG_META[f.code] || { label: f.code, severity: 'warning' };
  const left = f.values && f.values[0];
  const right = f.values && f.values[1];
  const kg = Math.abs(Number(f.kg) || 0);
  return {
    category: f.code,
    severity: meta.severity,
    title: `${meta.headline || meta.label} — ${truck}`,
    description: f.detail || meta.headline || meta.label,
    differenceKg: kg > 0 ? kg : undefined,
    expectedValue: left ? `${left[0]} ${left[1]} KG` : undefined,
    actualValue: right ? `${right[0]} ${right[1]} KG` : undefined,
  };
}

// ---- Daily documents: weighment sheet vs point khata ----
export const parseTruckList = (text) => (text || '').split(/[\n,;،]+/).map((s) => s.trim()).filter(Boolean);

const countBy = (arr) => arr.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());

export function reconcileDocs({ wsText, pkText, wsBags, pkBags }) {
  const ws = parseTruckList(wsText).map(normalizeTruckNumber).filter(Boolean);
  const pk = parseTruckList(pkText).map(normalizeTruckNumber).filter(Boolean);
  const wsM = countBy(ws);
  const pkM = countBy(pk);
  const missingInPointKhata = [...wsM.keys()].filter((t) => !pkM.has(t));
  const missingInWeighmentSheet = [...pkM.keys()].filter((t) => !wsM.has(t));
  const inBoth = [...wsM.keys()].filter((t) => pkM.has(t));
  const duplicates = [
    ...[...wsM].filter(([, c]) => c > 1).map(([t, c]) => `${t} (শিট ×${c})`),
    ...[...pkM].filter(([, c]) => c > 1).map(([t, c]) => `${t} (খাতা ×${c})`),
  ];
  const truckDifference = ws.length - pk.length;
  const bagDifference = (Number(wsBags) || 0) - (Number(pkBags) || 0);
  const truckBad = truckDifference !== 0 || missingInPointKhata.length > 0 || missingInWeighmentSheet.length > 0;
  const bagBad = bagDifference !== 0;
  let status = 'MATCHED';
  if (truckBad && bagBad) status = 'TRUCK_AND_BAG_MISMATCH';
  else if (truckBad) status = 'TRUCK_MISMATCH';
  else if (bagBad) status = 'BAG_MISMATCH';
  return { ws, pk, wsCount: ws.length, pkCount: pk.length, truckDifference, bagDifference, missingInPointKhata, missingInWeighmentSheet, inBoth, duplicates, status };
}

// Weighment sheet / point khata vs the truck entries actually saved in the system (same date + lighter + ghat).
// sysTrucks = normalised truck numbers of saved entries; sysBags = their total bags.
const truckKey = (t) => { const d = (t || '').replace(/\D/g, ''); return d.length >= 5 ? d : t; };
export function reconcileWithSystem(rec, sysTrucks, sysBags) {
  const docKeys = new Map([...rec.ws, ...rec.pk].map((t) => [truckKey(t), t]));
  const sysM = new Map();
  sysTrucks.forEach((t) => { const k = truckKey(t); const e = sysM.get(k) || { t, c: 0 }; e.c += 1; sysM.set(k, e); });
  const missingInSystem = [...docKeys].filter(([k]) => !sysM.has(k)).map(([, t]) => t);
  const extraInSystem = [...sysM].filter(([k]) => !docKeys.has(k)).map(([, e]) => e.t);
  const sysDuplicates = [...sysM.values()].filter((e) => e.c > 1).map((e) => `${e.t} (সিস্টেম ×${e.c})`);
  const sysCount = sysTrucks.length;
  return {
    sysCount, sysBags: Number(sysBags) || 0, missingInSystem, extraInSystem, sysDuplicates,
    wsTruckDiff: rec.wsCount - sysCount, pkTruckDiff: rec.pkCount - sysCount,
    ok: missingInSystem.length === 0 && extraInSystem.length === 0 && rec.wsCount === sysCount && rec.pkCount === sysCount,
  };
}

export const DOC_STATUS_LABEL = {
  MATCHED: 'ম্যাচড', MISMATCH: 'অমিল', TRUCK_AND_BAG_MISMATCH: 'ট্রাক ও ব্যাগ অমিল',
  TRUCK_MISMATCH: 'ট্রাক অমিল', BAG_MISMATCH: 'ব্যাগ অমিল', PENDING: 'পেন্ডিং',
};