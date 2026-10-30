import { base44 } from '@/api/base44Client';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';
import { createAutoBackup } from '@/lib/sanmarineBackup';
import { captureUserGuard, verifyUserGuard } from '@/components/sanmarine/company/userGuard';
import { COMPANY_VALUES, canonicalCompany, companyValues, recordCompany, readScopeRows } from '@/components/sanmarine/company/companyScope';
import companyReviewRows from '@/components/sanmarine/company/companyReviewRows';
export async function reviewCompanyMappings(cursor) {
  const vessels = await readScopeRows(base44.entities.MotherVessel, {}, ['name', 'company']);
  const lighters = await readScopeRows(base44.entities.LighterVessel, {}, ['name', 'company', 'motherVesselId', 'consigneeId']);
  const ctx = { vessels, lighters }, missing = { company: { $nin: COMPANY_VALUES } };
  const validLighters = lighters.filter((l) => recordCompany({ motherVesselId: l.motherVesselId, lighterVesselId: l.id }, ctx));
  const validPairs = validLighters.map((l) => ({ motherVesselId: l.motherVesselId, lighterVesselId: l.id, company: { $in: companyValues(recordCompany({ motherVesselId: l.motherVesselId, lighterVesselId: l.id }, ctx)) } }));
  const orphanQuery = validPairs.length ? { $or: [missing, { $nor: validPairs }] } : {};
  const pages = await companyReviewRows({ consignees: missing, entries: orphanQuery, empties: missing, documents: orphanQuery, alerts: missing }, cursor);
  const consignees = pages.consignees, entries = pages.entries;
  const candidates = consignees.items.map((c) => {
    const links = lighters.filter((l) => l.consigneeId === c.id);
    const companies = links.map((l) => vessels.some((v) => v.id === l.motherVesselId) ? recordCompany({ motherVesselId: l.motherVesselId, lighterVesselId: l.id }, ctx) : '');
    const proposed = !c.company && companies.length && companies.every((v) => v && v === companies[0]) ? companies[0] : '';
    return { entity: 'Consignee', id: c.id, label: c.name, proposed, reason: proposed ? 'Consignee ID → সব linked Lighter → Mother Vessel একই কোম্পানির' : 'নির্ভরযোগ্য একক কোম্পানি সম্পর্ক নেই বা বর্তমান মান অস্পষ্ট' };
  });
  entries.items.forEach((r) => { const company = recordCompany(r, ctx); const lighter = lighters.find((l) => l.id === r.lighterVesselId); const vessel = vessels.find((v) => v.id === r.motherVesselId); candidates.push({ entity: 'TruckEntry', id: r.id, label: r.truckNumber, proposed: !r.company && lighter && vessel && lighter.motherVesselId === vessel.id ? company : '', reason: !lighter || !vessel ? 'Mother/Lighter reference বর্তমান database-এ নেই; পুনর্গঠন বা অনুমান করা হবে না' : 'সংশ্লিষ্ট কোম্পানি সম্পর্ক যাচাই দরকার' }); });
  pages.empties.items.forEach((r) => candidates.push({ entity: 'EmptyWeight', id: r.id, label: `${r.truckNumber} · ${r.emptyWeightDate || ''}`, proposed: '', reason: 'কোম্পানি অনির্ধারিত; কোনো কোম্পানির মোটে রাখা বা পুরোনো ওজন থেকে অনুমান করে Assign করা হবে না। মালিককে উৎস দেখে নিশ্চিত করতে হবে।' }));
  pages.documents.items.forEach((r) => candidates.push({ entity: 'LighterDailyDocument', id: r.id, label: `${r.lighterVesselName || 'লাইটার'} · ${r.date || ''}`, proposed: '', reason: 'Company/Mother/Lighter সম্পর্কের Review প্রয়োজন; বর্তমান রেকর্ড অপরিবর্তিত আছে।' }));
  pages.alerts.items.forEach((r) => candidates.push({ entity: 'Alert', id: r.id, label: r.title || r.truckNumber || 'অ্যালার্ট', proposed: '', reason: 'পুরোনো অ্যালার্টের Company নিশ্চিত নয়; অ্যালার্ট মুছে বা কোম্পানি অনুমান করে বদলানো হয়নি।' }));
  return { candidates, consigneeCount: consignees.count, entryCount: entries.count, emptyCount: pages.empties.count, documentCount: pages.documents.count, alertCount: pages.alerts.count, next: Object.fromEntries(Object.entries(pages).map(([key, page]) => [key, page.next])) };
}
export async function applyConfirmedCompanyMapping(candidate, actor) {
  const session = await base44.auth.me(); if (session.role !== 'admin') throw new Error('সুরক্ষিত প্ল্যাটফর্ম Admin লগইন দরকার।');
  const me = await requireActor(actor, ROLE_SETS.ADMIN);
  const now = await reviewCompanyMappings(), confirmed = now.candidates.find((r) => r.entity === candidate.entity && r.id === candidate.id);
  if (!confirmed?.proposed || confirmed.proposed !== candidate.proposed) throw new Error('সম্পর্ক বদলেছে বা নিশ্চিত নয়; আবার Review করুন।');
  const before = await captureUserGuard(), backup = await createAutoBackup(me, 'manual', 'নিশ্চিত Company Mapping-এর আগে পূর্ণ সেফটি ব্যাকআপ');
  if (!backup.verified) throw new Error('সংরক্ষিত ব্যাকআপ/User ID যাচাই ব্যর্থ; Mapping হয়নি।');
  const record = await base44.entities[confirmed.entity].get(confirmed.id);
  if (record.company) throw new Error('বিদ্যমান Company overwrite করা হবে না; Mapping বন্ধ।');
  const latest = (await reviewCompanyMappings()).candidates.find((r) => r.id === confirmed.id && r.entity === confirmed.entity);
  if (latest?.proposed !== confirmed.proposed) throw new Error('ব্যাকআপের পরে সম্পর্ক বদলেছে; Mapping বন্ধ।');
  await base44.entities[confirmed.entity].update(confirmed.id, { company: canonicalCompany(confirmed.proposed) });
  const saved = await base44.entities[confirmed.entity].get(confirmed.id);
  const users = await verifyUserGuard(before);
  if (saved.company !== confirmed.proposed || !users.ok) throw new Error('Save/User যাচাই সম্পূর্ণ হয়নি; কোনো User reset করা হবে না।');
  await base44.entities.AuditLog.create({ timestamp: new Date().toISOString(), userId: me.id, userName: me.name, userRole: me.role, action: 'COMPANY_MAPPING_CONFIRMED', recordType: confirmed.entity, recordId: confirmed.id, details: `${confirmed.label}: ${confirmed.proposed}; Backup ${backup.log.id}`, oldValue: JSON.stringify({ company: record.company ?? null }), newValue: JSON.stringify({ company: confirmed.proposed }) });
  return { label: confirmed.label, company: saved.company, backupId: backup.log.id };
}