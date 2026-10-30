import { base44 } from '@/api/base44Client';
import { normalizeTruckNumber } from '@/utils/truckUtils';
import { parsePhotos } from '@/lib/sanmarinePhotos';
import { FLAG_META } from '@/lib/sanmarineRules';

// Data gathering for alert investigation and trip documents.
// Nothing here writes or deletes — it only reads records and matches them by
// truck number + date + time (never by truck number alone) so a wrong truck's
// documents can never leak into another trip's investigation.

const E = () => base44.entities;
const truckCond = (raw) => {
  const n = normalizeTruckNumber(raw);
  const d = n.replace(/\D/g, '');
  return d.length >= 5 ? { $regex: `${d}$` } : n;
};
const safeJSON = (s, fallback) => { try { const v = JSON.parse(s); return v == null ? fallback : v; } catch (e) { return fallback; } };
const toMs = (d, t) => (d ? new Date(`${d}T${(t || '00:00').slice(0, 5)}:00`).getTime() : NaN);
const absMs = (d, t) => Math.abs(toMs(d, t) || 0);

// Closest record by date+time to a target point.
const closest = (items, targetDate, targetTime, dKey, tKey) => {
  if (!items.length || !targetDate) return null;
  const target = toMs(targetDate, targetTime);
  return [...items].sort((a, b) => absMs(a[dKey], a[tKey]) - target - (absMs(b[dKey], b[tKey]) - target))[0];
};

// Resolve vessel + lighter names for a loading entry.
async function resolveVesselLighter(entry) {
  if (!entry || (!entry.motherVesselId && !entry.lighterVesselId)) return { vesselName: '', lighterName: '' };
  const [v, l] = await Promise.all([
    entry.motherVesselId ? E().MotherVessel.get(entry.motherVesselId).catch(() => null) : null,
    entry.lighterVesselId ? E().LighterVessel.get(entry.lighterVesselId).catch(() => null) : null,
  ]);
  return { vesselName: (v && v.name) || '', lighterName: (l && l.name) || '' };
}

// Fetch the current record behind an alert: the loading entry if present, else the empty weight.
export async function fetchCurrentEntry(alert) {
  if (alert.relatedLoadingId) {
    const load = await E().TruckEntry.get(alert.relatedLoadingId).catch(() => null);
    if (load) return { kind: 'loading', record: load, ...(await resolveVesselLighter(load)) };
  }
  if (alert.relatedEmptyId) {
    const empty = await E().EmptyWeight.get(alert.relatedEmptyId).catch(() => null);
    if (empty) return { kind: 'empty', record: empty, vesselName: '', lighterName: '' };
  }
  // Fallback: the alert itself may carry a currentRecord snapshot.
  const snap = safeJSON(alert.currentRecord, null);
  if (snap) {
    const kind = snap.date ? 'loading' : 'empty';
    return { kind, record: snap, ...(kind === 'loading' ? await resolveVesselLighter(snap) : { vesselName: '', lighterName: '' }) };
  }
  return null;
}

// Fetch the previous record behind an alert (previous trip / previous empty weight).
// Source priority: explicit previousRecord snapshot → related empty weight (for a loading alert)
// → the truck's previous loading entry by date+time.
export async function fetchPreviousEntry(alert, current) {
  const snap = safeJSON(alert.previousRecord, null);
  if (snap) {
    const kind = snap.date ? 'loading' : 'empty';
    return { kind, record: snap, ...(kind === 'loading' ? await resolveVesselLighter(snap) : { vesselName: '', lighterName: '' }) };
  }
  const truck = alert.normalizedTruckNumber || normalizeTruckNumber(alert.truckNumber || '');
  if (!truck) return null;
  const curDate = current && (current.kind === 'loading' ? current.record.date : current.record.emptyWeightDate);
  const curTime = current && (current.kind === 'loading' ? current.record.time : current.record.emptyWeightTime);
  const cond = truckCond(alert.truckNumber);
  const [loads, empties] = await Promise.all([
    E().TruckEntry.filter({ normalizedTruckNumber: cond }, { sort: '-date', limit: 10 }),
    E().EmptyWeight.filter({ normalizedTruckNumber: cond }, { sort: '-emptyWeightDate', limit: 10 }),
  ]);
  const curMs = toMs(curDate, curTime);
  const prevLoad = loads.items.filter((l) => toMs(l.date, l.time) < curMs).sort((a, b) => toMs(b.date, b.time) - toMs(a.date, a.time))[0];
  const prevEmpty = empties.items.filter((e) => toMs(e.emptyWeightDate, e.emptyWeightTime) < curMs).sort((a, b) => toMs(b.emptyWeightDate, b.emptyWeightTime) - toMs(a.emptyWeightDate, a.emptyWeightTime))[0];
  // Prefer whichever is closer in time to the current entry.
  const candidates = [
    prevLoad && { kind: 'loading', record: prevLoad, ...(await resolveVesselLighter(prevLoad)) },
    prevEmpty && { kind: 'empty', record: prevEmpty, vesselName: '', lighterName: '' },
  ].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const ad = a.kind === 'loading' ? a.record.date : a.record.emptyWeightDate;
    const at = a.kind === 'loading' ? a.record.time : a.record.emptyWeightTime;
    const bd = b.kind === 'loading' ? b.record.date : b.record.emptyWeightDate;
    const bt = b.kind === 'loading' ? b.record.time : b.record.emptyWeightTime;
    return absMs(bd, bt) - curMs - (absMs(ad, at) - curMs);
  });
  return candidates[0];
}

// All documents/evidence for ONE trip: matched by truck number + date (+ time when available).
// We never match by truck number alone — date is always required so a different trip's photos
// cannot appear here.
export async function fetchTripEvidence(truckRaw, date, time) {
  const truck = normalizeTruckNumber(truckRaw);
  if (!truck || !date) return { empties: [], loads: [], dailyDocs: [] };
  const cond = truckCond(truckRaw);
  const [empties, loads, dailyDocs] = await Promise.all([
    E().EmptyWeight.filter({ normalizedTruckNumber: cond, emptyWeightDate: date }, { sort: '-emptyWeightTime', limit: 10 }),
    E().TruckEntry.filter({ normalizedTruckNumber: cond, date }, { sort: '-time', limit: 10 }),
    E().LighterDailyDocument.filter({ date }, { sort: '-created_date', limit: 50 }),
  ]);
  // Narrow daily docs to those whose truck lists contain this truck.
  const inList = (jsonStr) => {
    const arr = safeJSON(jsonStr, null);
    if (Array.isArray(arr)) return arr.some((t) => normalizeTruckNumber(t) === truck);
    return false;
  };
  const matchedDocs = dailyDocs.items.filter((d) => inList(d.weighmentTruckNumbers) || inList(d.pointKhataTruckNumbers));
  // If a time was given, prefer the closest empty/load to that time; otherwise return all for the day.
  let chosenEmpties = empties.items;
  let chosenLoads = loads.items;
  if (time) {
    const target = toMs(date, time);
    const nearestEmpty = closest(empties.items, date, time, 'emptyWeightDate', 'emptyWeightTime');
    const nearestLoad = closest(loads.items, date, time, 'date', 'time');
    chosenEmpties = nearestEmpty ? [nearestEmpty] : empties.items;
    chosenLoads = nearestLoad ? [nearestLoad] : loads.items;
  }
  return { empties: chosenEmpties, loads: chosenLoads, dailyDocs: matchedDocs };
}

// Build the structured evidence list for the investigation UI.
export function evidenceList({ empties, loads, dailyDocs }) {
  const out = [];
  empties.forEach((e) => {
    parsePhotos(e.tallyOriginalPhoto).forEach((uri, i) => out.push({ type: 'Empty Weight Scale Slip', uri, uploadedBy: e.enteredByName, date: e.emptyWeightDate, time: e.emptyWeightTime, truck: e.truckNumber, trip: `${e.emptyWeightDate} ${e.emptyWeightTime || ''}`, index: i }));
    parsePhotos(e.monitorPhoto).forEach((uri, i) => out.push({ type: 'Empty Weight Monitor Photo', uri, uploadedBy: e.enteredByName, date: e.emptyWeightDate, time: e.emptyWeightTime, truck: e.truckNumber, trip: `${e.emptyWeightDate} ${e.emptyWeightTime || ''}`, index: i }));
  });
  loads.forEach((l) => {
    parsePhotos(l.scalePhoto).forEach((uri, i) => out.push({ type: 'Loading Scale Slip', uri, uploadedBy: l.enteredBy, date: l.date, time: l.time, truck: l.truckNumber, trip: `${l.date} ${l.time || ''}`, index: i }));
    parsePhotos(l.monitorPhoto).forEach((uri, i) => out.push({ type: 'Loading Monitor Photo', uri, uploadedBy: l.enteredBy, date: l.date, time: l.time, truck: l.truckNumber, trip: `${l.date} ${l.time || ''}`, index: i }));
  });
  dailyDocs.forEach((d) => {
    parsePhotos(d.weighmentSheetPhoto).forEach((uri, i) => out.push({ type: 'Weighment Sheet', uri, uploadedBy: d.uploadedBy, date: d.date, time: '', truck: '', trip: d.date, index: i }));
    parsePhotos(d.pointKhataPhoto).forEach((uri, i) => out.push({ type: 'Point Khata', uri, uploadedBy: d.uploadedBy, date: d.date, time: '', truck: '', trip: d.date, index: i }));
  });
  return out;
}

// Human-readable problem summary for an alert, using its category + description + records.
export function problemSummary(alert, current, previous) {
  const meta = FLAG_META[alert.category] || { label: alert.category, severity: alert.severity };
  const lines = [];
  lines.push(`সমস্যার ধরন: ${meta.label}`);
  if (alert.description) lines.push(alert.description);
  if (current && current.record) {
    const r = current.record;
    if (current.kind === 'loading') {
      lines.push(`বর্তমান এন্ট্রি: ${r.truckNumber}, ${r.ghatName}, ${r.date} ${r.time || ''}, গ্রস ${r.gross} KG, খালি ${r.tare} KG, নেট ${r.net} KG, ব্যাগ ${r.bags || 0}, এন্ট্রি করেছেন ${r.enteredBy || '—'}`);
    } else {
      lines.push(`বর্তমান খালি ওজন: ${r.truckNumber}, ${r.ghat}, ${r.emptyWeightDate} ${r.emptyWeightTime || ''}, স্লিপ ${r.tallyWeight} KG, মনিটর ${r.monitorWeight} KG, এন্ট্রি করেছেন ${r.enteredByName || '—'}`);
    }
  }
  if (previous && previous.record) {
    const r = previous.record;
    if (previous.kind === 'loading') {
      lines.push(`আগের এন্ট্রি: ${r.truckNumber}, ${r.ghatName}, ${r.date} ${r.time || ''}, গ্রস ${r.gross} KG, খালি ${r.tare} KG, নেট ${r.net} KG, ব্যাগ ${r.bags || 0}, এন্ট্রি করেছেন ${r.enteredBy || '—'}`);
    } else {
      lines.push(`আগের খালি ওজন: ${r.truckNumber}, ${r.ghat}, ${r.emptyWeightDate} ${r.emptyWeightTime || ''}, স্লিপ ${r.tallyWeight} KG, মনিটর ${r.monitorWeight} KG, এন্ট্রি করেছেন ${r.enteredByName || '—'}`);
    }
  }
  if (alert.timeDifferenceMinutes) lines.push(`সময়ের পার্থক্য: ${Math.round(alert.timeDifferenceMinutes)} মিনিট`);
  return lines;
}

// Expected vs actual vs difference, derived from the alert category and the two records.
export function weightComparison(alert, current, previous) {
  const c = current && current.record;
  const p = previous && previous.record;
  const cat = alert.category;
  const out = { expected: null, actual: null, difference: null, source: '' };
  if (cat === 'WEIGHT_MISMATCH' && c && current.kind === 'empty') {
    out.expected = c.tallyWeight; out.actual = c.monitorWeight; out.difference = (Number(c.monitorWeight) || 0) - (Number(c.tallyWeight) || 0);
    out.source = 'খালি ওজন স্লিপ বনাম মনিটর ছবি';
  } else if (cat === 'LOAD_WEIGHT_MISMATCH' && c && current.kind === 'loading') {
    out.expected = c.gross; out.actual = c.secondWeight; out.difference = (Number(c.secondWeight) || 0) - (Number(c.gross) || 0);
    out.source = 'লোড স্কেল স্লিপ বনাম সেকেন্ড ওয়েট';
  } else if (cat === 'CROSS_SLIP_WEIGHT_MISMATCH' && c && p) {
    const wIn = Number(c.weightIn) > 0 ? Number(c.weightIn) : Number(c.tare);
    const emptyW = p.tallyWeight || p.monitorWeight;
    out.expected = emptyW; out.actual = wIn; out.difference = wIn - emptyW;
    out.source = 'লোড স্লিপের Weight In বনাম খালি স্লিপের ওজন';
  } else if (cat === 'EMPTY_WEIGHT_DIFFERENCE' && c && p) {
    const cur = c.tallyWeight || c.monitorWeight;
    const prev = p.tallyWeight || p.monitorWeight;
    out.expected = prev; out.actual = cur; out.difference = cur - prev;
    out.source = 'আগের খালি ওজন বনাম এখনকার খালি ওজন';
  }
  return out;
}

// Required documents for a trip and which are missing.
export function missingDocuments({ empties, loads, dailyDocs }, truck, date) {
  const has = (arr) => arr && arr.length > 0;
  const empty = empties[0];
  const load = loads[0];
  const doc = dailyDocs[0];
  const list = [
    { key: 'emptySlip', label: 'Empty Weight Scale Slip', missing: !empty || !parsePhotos(empty.tallyOriginalPhoto).length },
    { key: 'emptyMonitor', label: 'Empty Weight Monitor Photo', missing: !empty || !parsePhotos(empty.monitorPhoto).length },
    { key: 'loadSlip', label: 'Loading Scale Slip', missing: !load || !parsePhotos(load.scalePhoto).length },
    { key: 'loadMonitor', label: 'Loading Monitor Photo', missing: !load || !parsePhotos(load.monitorPhoto).length },
    { key: 'weighment', label: 'Weighment Sheet', missing: !doc || !parsePhotos(doc.weighmentSheetPhoto).length },
    { key: 'khata', label: 'Point Khata', missing: !doc || !parsePhotos(doc.pointKhataPhoto).length },
  ];
  return list.filter((d) => d.missing);
}

export const ALERT_TYPE_LABEL = Object.fromEntries(Object.entries(FLAG_META).map(([k, v]) => [k, v.label]));
export const PRIORITY_LABEL = { critical: 'ক্রিটিক্যাল', high: 'উচ্চ', warning: 'সতর্কতা', medium: 'মাঝারি', low: 'নিম্ন', info: 'তথ্য' };