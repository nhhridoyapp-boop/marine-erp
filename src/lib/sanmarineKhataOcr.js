// Real OCR (vision AI) for Weighment Sheet / Point Khata pages: every page is read on its own (better accuracy on long
// handwritten tables), rows are merged in page order. Each row = truck number + its bag count.
// NOTHING IS GUESSED: a cell that is not clearly readable stays empty and the row is flagged "Needs Verification".
import { callGeminiOcr } from '@/lib/geminiOcrClient';
import { runLimited } from '@/lib/sanmarineNet';
import { normalizeDate, normalizeTruck, cleanStr, cleanNum } from '@/lib/sanmarineOcr';
import { convertBengaliToEnglishDigits } from '@/utils/truckUtils';



const blankRow = () => ({ truck: '', bags: '', verify: true });

// The page instructions and answer schema live on the server (base44/shared/ocrTasks.ts).
async function scanPage(uri, kind) {
  const res = await callGeminiOcr(uri, kind === 'ws' ? 'ws' : 'pk');
  const r = res || {};
  const rows = (Array.isArray(r.rows) ? r.rows : []).map((x) => {
    const truck = normalizeTruck(x && x.truckNumber) || '';
    const n = cleanNum(x && x.bags);
    const bags = n != null && Number.isInteger(n) ? n : null; // a fractional bag count is a misread, not a value
    return { truck, bags: bags != null ? String(bags) : '', verify: !truck || bags == null || (x && x.certain === false) };
  }).filter((x) => x.truck || x.bags);
  // A "written total" is only accepted when the quoted total line really contains that number (the AI must not add rows up itself).
  const line = convertBengaliToEnglishDigits(cleanStr(r.totalLineText) || '').replace(/[,\s]/g, '');
  const written = (n) => { const v = cleanNum(n); return v != null && line && line.includes(String(v)) ? v : null; };
  const unclear = Math.min(Math.max(Number(r.unclearRows) || 0, 0), 50);
  for (let i = 0; i < unclear; i += 1) rows.push(blankRow());
  return {
    rows, date: normalizeDate(r.date), vesselName: cleanStr(r.vesselName), lighterName: cleanStr(r.lighterName), ghatName: cleanStr(r.ghatName),
    totalTrucksWritten: written(r.totalTrucksWritten), totalBags: written(r.totalBags), notes: cleanStr(r.notes),
  };
}

const first = (pages, k) => { const p = pages.find((x) => x[k] != null); return p ? p[k] : null; };
const last = (pages, k) => { const p = [...pages].reverse().find((x) => x[k] != null); return p ? p[k] : null; };

// kind: 'ws' | 'pk'. Throws only when NO page could be scanned at all.
export async function extractFromKhata(fileUris, kind) {
  const uris = (fileUris || []).filter(Boolean);
  if (!uris.length) return null;
  const results = await runLimited(uris.map((uri, i) => async () => {
    try { return await scanPage(uri, kind); } catch (e) { return { failed: true, error: e }; }
  }), 2);
  const pages = results.filter((p) => !p.failed);
  if (!pages.length) throw (results[0] && results[0].error) || new Error('কোনো পৃষ্ঠা স্ক্যান করা যায়নি।');
  return {
    rows: pages.flatMap((p) => p.rows),
    pagesScanned: pages.length,
    failedPages: results.map((p, i) => (p.failed ? i + 1 : 0)).filter(Boolean),
    date: first(pages, 'date'), vesselName: first(pages, 'vesselName'), lighterName: first(pages, 'lighterName'), ghatName: first(pages, 'ghatName'),
    totalTrucksWritten: last(pages, 'totalTrucksWritten'), totalBags: last(pages, 'totalBags'),
  };
}