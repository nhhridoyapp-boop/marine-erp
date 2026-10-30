import { normalizeTruckNumber } from '@/utils/truckUtils';

// A Weighment Sheet / Point Khata is a list of rows: { truck, bags, verify }.
// `verify` = the OCR was not sure about this row ("Needs Verification"); editing the row clears it.
export const newRow = () => ({ truck: '', bags: '', verify: false });

export function parseRows(json) {
  try {
    const a = typeof json === 'string' ? JSON.parse(json || '[]') : json;
    if (!Array.isArray(a)) return [];
    return a.map((r) => ({ truck: String((r && r.truck) ?? ''), bags: r && r.bags != null && r.bags !== '' ? String(r.bags) : '', verify: !!(r && r.verify) }));
  } catch (e) { return []; }
}

// Older documents only have a truck list (no per-truck bags): show it as rows without bags.
export function rowsFromTruckList(json) {
  try {
    const a = JSON.parse(json || '[]');
    return Array.isArray(a) ? a.map((t) => ({ truck: String(t), bags: '', verify: false })) : [];
  } catch (e) { return []; }
}

export function docRows(rowsJson, truckListJson) {
  const r = parseRows(rowsJson);
  return r.length ? r : rowsFromTruckList(truckListJson);
}

export const cleanRows = (rows) => (rows || []).filter((r) => (r.truck || '').trim() || (r.bags !== '' && r.bags != null) || r.verify);

const truckKey = (t) => { const n = normalizeTruckNumber(t || ''); const d = n.replace(/\D/g, ''); return d.length >= 5 ? d : n; };
const bagsOf = (r) => { const n = Number(r && r.bags); return n > 0 ? n : 0; };

export const needsCheck = (row, anyBags) => !!row.verify || !(row.truck || '').trim() || (anyBags && !(Number(row.bags) > 0));

// Total Truck = UNIQUE readable truck numbers; Total Bags = sum of every row's bag count.
export function summarizeRows(rows) {
  const list = rows || [];
  const anyBags = list.some((r) => bagsOf(r) > 0);
  const seen = new Map();
  list.forEach((r) => { const k = truckKey(r.truck); if (k) seen.set(k, (seen.get(k) || 0) + 1); });
  return {
    lines: list.length,
    trucks: seen.size,
    duplicates: [...seen].filter(([, c]) => c > 1).length,
    bags: list.reduce((s, r) => s + bagsOf(r), 0),
    anyBags,
    unresolved: list.filter((r) => needsCheck(r, anyBags)).length,
  };
}

// Returns the form with the rows set and the fields the saved record / reconciliation use kept in step:
// truck list text, and total bags (the row sum when any row has bags; otherwise the typed total stays).
export function withRows(f, kind, rows) {
  const k = kind === 'ws' ? { rows: 'wsRows', text: 'wsText', bags: 'wsBags' } : { rows: 'pkRows', text: 'pkText', bags: 'pkBags' };
  const s = summarizeRows(rows);
  return {
    ...f,
    [k.rows]: rows,
    [k.text]: rows.map((r) => (r.truck || '').trim()).filter(Boolean).join('\n'),
    [k.bags]: s.anyBags ? String(s.bags) : f[k.bags],
  };
}

// Bags per truck that disagree between the sources that actually have a bag count for that truck.
// sysEntries = [{ truck, bags }] from the saved truck entries. Repeated trips of one truck are added up per source.
export function truckBagDiffs(wsRows, pkRows, sysEntries) {
  const agg = (items, getT, getB) => {
    const m = new Map();
    (items || []).forEach((it) => {
      const raw = getT(it);
      const k = truckKey(raw);
      if (!k) return;
      const e = m.get(k) || { truck: normalizeTruckNumber(raw) || raw, bags: 0, has: false };
      const b = Number(getB(it)) || 0;
      if (b > 0) { e.bags += b; e.has = true; }
      m.set(k, e);
    });
    return m;
  };
  const ws = agg(wsRows, (r) => r.truck, (r) => r.bags);
  const pk = agg(pkRows, (r) => r.truck, (r) => r.bags);
  const sys = agg(sysEntries, (e) => e.truck, (e) => e.bags);
  const val = (e) => (e && e.has ? e.bags : null);
  const out = [];
  new Set([...ws.keys(), ...pk.keys(), ...sys.keys()]).forEach((k) => {
    const vals = [val(ws.get(k)), val(pk.get(k)), val(sys.get(k))];
    const known = vals.filter((v) => v != null);
    if (known.length >= 2 && new Set(known).size > 1) out.push({ truck: (ws.get(k) || pk.get(k) || sys.get(k)).truck, ws: vals[0], pk: vals[1], sys: vals[2] });
  });
  return out;
}