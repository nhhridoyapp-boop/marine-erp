// Fills Date / Ghat / Mother Vessel / Lighter from what the OCR read on the paper — but only when it clearly matches
// a master-data record (exact name, or one single unambiguous partial match). Nothing is guessed, nothing already chosen is overwritten.
const nrm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9\u0980-\u09FF]/g, '');

function pickOne(list, name) {
  const n = nrm(name);
  if (n.length < 2) return null;
  const exact = list.filter((x) => nrm(x.name) === n);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const part = list.filter((x) => { const m = nrm(x.name); return m.length >= 4 && n.length >= 4 && (m.includes(n) || n.includes(m)); });
  return part.length === 1 ? part[0] : null;
}

const dayDiff = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;

export function matchHeader(r, f, { vessels = [], lighters = [], ghats = [], allowDate = false }) {
  const patch = {};
  const filled = [];
  let dateIgnored = false;

  if (!f.ghatName) {
    const g = pickOne(ghats, r.ghatName);
    if (g) { patch.ghatName = g.name.toUpperCase(); filled.push('ঘাট'); }
  }
  let vesselId = f.motherVesselId;
  if (!vesselId) {
    const v = pickOne(vessels, r.vesselName);
    if (v) { patch.motherVesselId = v.id; vesselId = v.id; filled.push('মাদার ভেসেল'); }
  }
  if (!f.lighterVesselId) {
    const pool = vesselId ? lighters.filter((l) => l.motherVesselId === vesselId) : lighters;
    const l = pickOne(pool, r.lighterName);
    if (l) {
      patch.lighterVesselId = l.id;
      if (!vesselId) patch.motherVesselId = l.motherVesselId;
      filled.push('লাইটার');
    }
  }
  if (r.date && r.date !== f.date) {
    // The paper date is only used for a NEW document and only when it is plausible (within a year of today).
    if (allowDate && !Number.isNaN(new Date(r.date).getTime()) && dayDiff(r.date, new Date().toISOString().slice(0, 10)) <= 366) { patch.date = r.date; filled.push('তারিখ'); }
    else dateIgnored = true;
  }
  return { patch, filled, dateIgnored };
}