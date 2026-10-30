import { base44 } from '@/api/base44Client';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';
import { digest, historicalCandidate, naturalKey, tripKey } from '@/components/sanmarine/history/historicalValues';
import parseHistoricalXlsx from '@/components/sanmarine/history/parseHistoricalXlsx';
import historicalExisting from '@/components/sanmarine/history/historicalExisting';

export async function assertHistoryAdmin(actor) {
  const session = await base44.auth.me();
  if (session.role !== 'admin') throw new Error('Historical Import-এর জন্য প্ল্যাটফর্ম Admin লগইন দরকার; ERP পদবি একা যথেষ্ট নয়।');
  await requireActor(actor, ROLE_SETS.SUPER);
}
export const previewCounts = (candidates) => candidates.reduce((out, c) => ({ ...out, [c.status]: (out[c.status] || 0) + 1 }), { VALID: 0, DUPLICATE: 0, INVALID: 0, REVIEW: 0, SKIPPED: 0 });
export async function buildHistoricalPreview(files, actor) {
  await assertHistoryAdmin(actor);
  if (!files.length) throw new Error('JSON বা XLSX নির্বাচন করুন।');
  const sources = [], candidates = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer(), hash = await digest(buffer);
    let rows, section;
    if (/\.json$/i.test(file.name)) {
      const data = JSON.parse(new TextDecoder().decode(buffer));
      if (!Array.isArray(data.loading_entries)) throw new Error(`${file.name}: loading_entries তালিকা নেই; অন্য বিভাগ Import করা হবে না।`);
      section = 'loading_entries';
      rows = data.loading_entries.map((r, i) => ({ row: i + 1, id: r.id, truck: r.truck_number, weight: r.tw, date: r.tw_date, time: r.tw_time, ghat: r.ghat, scale: r.scale_name || r.scale, company: r.company, deleted: r.is_deleted === true }));
    } else if (/\.xlsx$/i.test(file.name)) { section = 'Entry'; rows = await parseHistoricalXlsx(buffer); }
    else throw new Error('শুধু দেওয়া JSON backup এবং XLSX Entry sheet সমর্থিত।');
    const source = { file, hash, section, rows: rows.length }; sources.push(source);
    for (let i = 0; i < rows.length; i += 100) candidates.push(...await Promise.all(rows.slice(i, i + 100).map((r) => historicalCandidate(r, source))));
  }
  const trips = new Map(), seen = new Map();
  candidates.filter((c) => c.status === 'VALID').forEach((c) => { const k = tripKey(c.record); if (!trips.has(k)) trips.set(k, new Set()); trips.get(k).add(naturalKey(c.record)); });
  const localCandidates = candidates.map((c) => {
    if (c.status !== 'VALID') return c;
    if (trips.get(tripKey(c.record)).size > 1) return { ...c, status: 'REVIEW', reason: 'Source-এ একই ট্রাক/তারিখ/সময়ে ওজন/ঘাট/স্কেলের বিরোধ; হাতে যাচাই দরকার' };
    const key = naturalKey(c.record), previous = seen.get(key);
    if (previous) return { ...c, status: 'DUPLICATE', reason: `Source duplicate: ${previous.sourceFileName}, সারি ${previous.sourceRow}; কোনো রেকর্ড মোছা হবে না` };
    seen.set(key, c.record); return c;
  });
  const compared = await historicalExisting(localCandidates);
  return { sources, localCandidates, candidates: compared, counts: previewCounts(compared) };
}
export function downloadHistoricalSummary(value, fileName = 'historical-import-preview.json') {
  const data = { sources: value.sources.map((s) => ({ fileName: s.file.name, hash: s.hash, section: s.section, rows: s.rows })), counts: value.counts, records: value.candidates };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}