import { normalizeTruckNumber, formatTruckDisplay } from '@/utils/truckUtils';

export const COMPANIES = ['SAN MARINE SURVEY & INSPECTION', 'SEAQUANT MARINE SERVICES'];
export const text = (value) => value == null ? '' : String(value).trim();
export async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function dateValue(value) {
  const s = text(value);
  const match = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]00:00:00)?$/);
  if (!match) return '';
  const at = new Date(`${match[1]}T00:00:00Z`);
  return Number.isFinite(at.getTime()) && at.toISOString().slice(0, 10) === match[1] ? match[1] : '';
}
export function timeValue(value) {
  const match = text(value).match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM)?$/i);
  if (!match) return '';
  let hour = Number(match[1]);
  if (match[4]) { if (hour < 1 || hour > 12) return ''; hour = hour % 12 + (match[4].toUpperCase() === 'PM' ? 12 : 0); }
  if (hour > 23) return '';
  return `${String(hour).padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
}
export function naturalKey(record) {
  return JSON.stringify([record.normalizedTruckNumber, record.weighmentDate, record.weighmentTime, record.tareWeight, text(record.ghat).toUpperCase(), text(record.scaleName).toUpperCase()]);
}
export const tripKey = (record) => JSON.stringify([record.normalizedTruckNumber, record.weighmentDate, record.weighmentTime]);
export async function historicalCandidate(row, source) {
  const truck = text(row.truck), date = dateValue(row.date), time = timeValue(row.time);
  const norm = normalizeTruckNumber(truck), issues = [];
  if (!truck || !/\d{5,7}$/.test(norm)) issues.push('ট্রাক নম্বর অসম্পূর্ণ');
  if (typeof row.weight !== 'number' || !Number.isFinite(row.weight) || row.weight <= 0) issues.push('খালি ওজন অবৈধ/অনুপস্থিত');
  if (!date) issues.push('ওজনের তারিখ অবৈধ/অনুপস্থিত');
  const record = { truckNumber: formatTruckDisplay(truck), normalizedTruckNumber: norm, tareWeight: row.weight, weighmentDate: date, weighmentTime: time, weighedAt: `${date} ${time}`, ghat: text(row.ghat), scaleName: text(row.scale), recordType: 'HISTORICAL_EMPTY_WEIGHT', sourceFileName: source.file.name, sourceSection: source.section, sourceRow: row.row, sourceRecordId: text(row.id), sourceHash: source.hash, rawTruckNumber: truck, rawDate: text(row.rawDate ?? row.date), rawTime: text(row.rawTime ?? row.time) };
  const review = [];
  if (!time) review.push('সময় অনুপস্থিত/অস্পষ্ট; অনুমান করা হয়নি');
  if (!/\d{6}$/.test(norm) || /\d{7}$/.test(norm)) review.push('ট্রাক নম্বর যাচাই দরকার');
  if (text(row.company) && !COMPANIES.includes(text(row.company))) review.push('কোম্পানির নাম অচেনা');
  if (COMPANIES.includes(text(row.company))) record.company = text(row.company);
  record.sourceKey = await digest(`${source.hash}|${source.section}|${row.id || row.row}`);
  record.recordKey = await digest(naturalKey(record));
  return { record, status: row.deleted ? 'SKIPPED' : issues.length ? 'INVALID' : review.length ? 'REVIEW' : 'VALID', reason: row.deleted ? 'Source-এ deleted; Import নয়' : [...issues, ...review].join(' · ') };
}