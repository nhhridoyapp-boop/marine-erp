import { base44 } from '@/api/base44Client';
import { dedupe } from '@/lib/sanmarineNet';
export const COMPANIES = ['SAN MARINE SURVEY & INSPECTION', 'SEAQUANT MARINE SERVICES'];
export const COMPANY_VALUES = [COMPANIES[0], 'SAN MARINE', COMPANIES[1], 'SEAQUANT'];
export const canonicalCompany = (value) => { const v = String(value || '').trim().toUpperCase(); return v === COMPANIES[0] || v === 'SAN MARINE' ? COMPANIES[0] : v === COMPANIES[1] || v === 'SEAQUANT' ? COMPANIES[1] : ''; };
export const companyValues = (value) => { const c = canonicalCompany(value); if (!c) throw new Error('কোম্পানি নির্বাচন করুন; অনির্ধারিত কোম্পানির রিপোর্ট হবে না।'); return c === COMPANIES[0] ? [COMPANIES[0], 'SAN MARINE'] : [COMPANIES[1], 'SEAQUANT']; };
export const andQuery = (...queries) => ({ $and: queries.filter(Boolean) });
export async function readScopeRows(entity, query, fields) {
  const rows = []; let cursor;
  do { const page = await entity.filter(query, { limit: 100, cursor, ...(fields ? { fields } : {}) }); rows.push(...page.items); cursor = page.has_more ? page.next_cursor : null; } while (cursor);
  return rows;
}
export function recordCompany(record, ctx) {
  const lighter = (ctx.lighters || []).find((l) => l.id === record.lighterVesselId);
  const vessel = (ctx.vessels || []).find((v) => v.id === (record.motherVesselId || lighter?.motherVesselId));
  if (lighter && record.motherVesselId && lighter.motherVesselId !== record.motherVesselId) return '';
  const values = [record.company, lighter?.company, vessel?.company].filter((v) => v != null && v !== '');
  const companies = values.map(canonicalCompany);
  return companies.length && companies.every((c) => c && c === companies[0]) ? companies[0] : '';
}
export function consigneeName(ctx, lighterId, record = {}) {
  const lighter = (ctx.lighters || []).find((l) => l.id === lighterId);
  if (!lighter || record.consigneeId && record.consigneeId !== lighter.consigneeId) return 'Not Assigned';
  const source = (ctx.consignees || []).find((c) => c.id === lighter.consigneeId);
  if (!source) return 'Not Assigned';
  const own = canonicalCompany(source.company);
  const links = (ctx.lighters || []).filter((l) => l.consigneeId === source.id);
  const resolved = links.map((l) => recordCompany({ lighterVesselId: l.id, motherVesselId: l.motherVesselId }, ctx));
  const company = recordCompany({ lighterVesselId: lighter.id, motherVesselId: lighter.motherVesselId }, ctx);
  if (!company || source.company && !own || own && own !== company || !own && (!resolved.length || resolved.some((c) => c !== company))) return 'Not Assigned';
  return source.name || 'Unavailable';
}
export const getCompanyScope = (company) => dedupe(`company-scope:${company}`, async () => {
  const aliases = companyValues(company), canonical = canonicalCompany(company);
  const companyQuery = { company: { $in: aliases } };
  const vessels = await readScopeRows(base44.entities.MotherVessel, companyQuery);
  const vesselIds = vessels.map((v) => v.id);
  const lighters = await readScopeRows(base44.entities.LighterVessel, { ...companyQuery, motherVesselId: { $in: vesselIds } });
  const lighterIds = lighters.map((l) => l.id);
  const relations = lighters.length ? { $or: lighters.map((l) => ({ motherVesselId: l.motherVesselId, lighterVesselId: l.id })) } : { id: { $in: [] } };
  // Use companyQuery directly for trucks/empty/alerts/docs — avoids reading every record to build ID lists.
  // Records without a company field are historical review records, not part of any company's live scope.
  const trucks = companyQuery;
  const empty = companyQuery;
  const docs = andQuery(companyQuery, relations);
  const closings = relations;
  const alerts = companyQuery;
  return { company: canonical, aliases, vessels, lighters, trucks, empty, alerts, docs, closings };
});