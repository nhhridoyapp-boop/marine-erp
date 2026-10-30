// Real OCR extraction from scale slip and monitor photos: photo → private storage → the app's ocrProxy backend
// → structured JSON → normalize → form auto-fill. The backend tries Google's free Gemini tier first and falls
// back to the platform's own vision model when Gemini is busy or out of quota, so a scan still completes.
import { callGeminiOcr, isGeminiQuotaError } from '@/lib/geminiOcrClient';
import { MONITOR_TOLERANCE_KG } from '@/lib/sanmarineRules';

const asciiDigits = (value) => String(value).replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)));

// Normalize various date formats to YYYY-MM-DD (HTML date input format).
export function normalizeDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = asciiDigits(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-YYYY or DD/MM/YYYY
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // YYYY/MM/DD
  m = s.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // DD-MM-YY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Normalize various time formats to HH:MM 24-hour (HTML time input format).
function normalizeTime(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = asciiDigits(raw).trim().toUpperCase();
  let m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (m) {
    let h = parseInt(m[1], 10);
    if (m[3] === 'PM' && h < 12) h += 12;
    if (m[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  }
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return null;
}

// Clean truck number: strip whitespace, normalize separators, uppercase.
export function normalizeTruck(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = asciiDigits(raw).trim().toUpperCase().replace(/[‐‑–—−]/g, '-').replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  if (!s || s === 'NULL' || s === 'N/A' || s === 'NONE') return null;
  return s;
}

export function cleanStr(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.toUpperCase() === 'NULL' || s.toUpperCase() === 'N/A' || s.toUpperCase() === 'NONE') return null;
  return s;
}

export function cleanNum(raw) {
  if (raw == null) return null;
  const n = Number(asciiDigits(raw).replace(/[,\s]/g, ''));
  if (isNaN(n) || n <= 0) return null;
  return n;
}

// Weighbridge indicators show whole kilograms. A speck of dust, a scratch on the protective cover or the gap
// between segments is often read as a decimal point, so a true 40510 comes back as "405.10" — 405.1 kg, which
// then looks like a 40-ton mismatch against the printed slip. A truck never weighs a fraction of a ton, so when
// a monitor reading looks like exactly that split (under 1 ton as written, but the digits together form a real
// truck weight) the decimal point was a speck and is dropped.
export function cleanMonitorWeight(raw) {
  const n = cleanNum(raw);
  if (n == null) return null;
  if (Math.trunc(n) >= 1000) return n;                 // already a plausible truck weight — leave it alone
  const merged = Number(asciiDigits(raw).replace(/[^0-9]/g, ''));
  return merged >= 1000 ? merged : n;
}

function cleanResult(res, isLoaded, fromMonitor) {
  const out = {
    truckNumber: normalizeTruck(res.truckNumber),
    date: normalizeDate(res.date),
    time: normalizeTime(res.time),
    scaleName: cleanStr(res.scaleName),
    slipNumber: cleanStr(res.slipNumber),
    slipType: cleanStr(res.slipType),
  };
  if (isLoaded) {
    out.weightIn = cleanNum(res.weightIn);
    out.weightOut = fromMonitor ? cleanMonitorWeight(res.weightOut) : cleanNum(res.weightOut);
    out.netWeight = cleanNum(res.netWeight);
    out.bags = cleanNum(res.bags);
  } else {
    out.emptyWeight = fromMonitor ? cleanMonitorWeight(res.emptyWeight) : cleanNum(res.emptyWeight);
  }
  return out;
}

// The OCR instructions and answer schema live on the server (base44/shared/ocrTasks.ts); the app only
// selects which task to run, so the model can never be steered from the browser.
async function ocrPhoto(fileUri, task, fromMonitor) {
  if (!fileUri) return {};
  const res = await callGeminiOcr(fileUri, task, fromMonitor);
  return res || {};
}

// Extract data from an empty/tare weight scale slip.
export async function extractFromEmptySlip(fileUri, fromMonitor = false) {
  const raw = await ocrPhoto(fileUri, 'empty', fromMonitor);
  return cleanResult(raw, false, fromMonitor);
}

// Extract data from a loaded truck scale slip (second weighing).
export async function extractFromLoadedSlip(fileUri, fromMonitor = false) {
  const raw = await ocrPhoto(fileUri, 'loaded', fromMonitor);
  return cleanResult(raw, true, fromMonitor);
}

// Compare two OCR extractions (e.g. scale copy vs monitor photo) and return mismatched fields.
export function compareExtractions(a, b) {
  if (!a || !b) return [];
  const mismatches = [];
  const norm = (s) => (s || '').toString().replace(/[\s\-_]/g, '').toUpperCase();
  if (a.truckNumber && b.truckNumber && norm(a.truckNumber) !== norm(b.truckNumber))
    mismatches.push({ field: 'ট্রাক নম্বর', a: a.truckNumber, b: b.truckNumber });
  if (a.date && b.date && a.date !== b.date)
    mismatches.push({ field: 'তারিখ', a: a.date, b: b.date });
  if (a.time && b.time && a.time !== b.time)
    mismatches.push({ field: 'সময়', a: a.time, b: b.time });
  const wA = a.emptyWeight != null ? a.emptyWeight : a.weightOut;
  const wB = b.emptyWeight != null ? b.emptyWeight : b.weightOut;
  if (wA != null && wB != null && Math.abs(Number(wA) - Number(wB)) > MONITOR_TOLERANCE_KG)
    mismatches.push({ field: `ওজন (সীমা ${MONITOR_TOLERANCE_KG} KG)`, a: wA, b: wB });
  if (a.scaleName && b.scaleName && norm(a.scaleName) !== norm(b.scaleName))
    mismatches.push({ field: 'স্কেল', a: a.scaleName, b: b.scaleName });
  return mismatches;
}

// True when the OCR call failed because of a quota limit, a timeout, or missing Worker config (not a bad photo).
// The caller should show a "manual entry still works" message instead of a scary error.
export function isOcrQuotaError(e) {
  if (isGeminiQuotaError(e)) return true;
  if (e && (e.code === 'OCR_NOT_CONFIGURED' || e.code === 'OCR_TIMEOUT')) return true;
  const msg = ((e && e.message) || '').toLowerCase();
  return msg.includes('limit of integrations') || msg.includes('upgrade your plan') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests');
}

// True when the OCR-detected slip type does not match the form it was uploaded into (e.g. a loaded slip in the empty form).
// Returns false when the type is unknown — never block entry on an uncertain reading.
export function wrongSlipType(data, expected) {
  if (!data || !data.slipType) return false;
  const t = String(data.slipType).toLowerCase();
  if (t !== 'empty' && t !== 'loaded') return false;
  return t !== expected;
}

// Weighment Sheet / Point Khata extraction (per-page rows of truck + bags) lives in sanmarineKhataOcr.js.