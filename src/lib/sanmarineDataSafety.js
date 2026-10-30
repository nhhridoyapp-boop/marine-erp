import { base44 } from '@/api/base44Client';

// Conservative heuristics for demo/test data. NEVER matches the Master Super Admin or real (gmail) users.
const TEST_EMAIL_DOMAIN = '@test.local';
const TEST_PREFIX = 'ZQ795645';
const TEST_TRUCK_RE = /^DMT9\d+$/;

export const isTestUser = (u) => {
  if (!u) return false;
  if (u.role === 'Master Super Admin') return false; // Master Super Admin — never
  if ((u.email || '').endsWith(TEST_EMAIL_DOMAIN)) return true;
  if ((u.name || '').startsWith(TEST_PREFIX)) return true;
  if ((u.employeeId || '').startsWith(TEST_PREFIX)) return true;
  return false;
};

// Production entities that must never be bulk-wiped.
export const PRODUCTION_ENTITIES = [
  'TruckEntry', 'EmptyWeight', 'Alert', 'ERPUser', 'MotherVessel', 'LighterVessel', 'Ghat', 'Consignee',
  'Cargo', 'Scale', 'VesselClosing', 'LighterDailyDocument', 'AuditLog', 'ApprovalRequest', 'ScaleGhatMapping',
  'Setting', 'TrustedDevice', 'OtpCode', 'BackupLog',
];

// Guard: block empty or overly-broad destructive bulk ops on production entities.
export function assertSafeBulkOp(entityName, query, op) {
  if (!PRODUCTION_ENTITIES.includes(entityName)) return;
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error(`[${op}] "${entityName}"-এ অবৈধ query — production bulk ${op} নিষিদ্ধ।`);
  }
  const keys = Object.keys(query);
  if (keys.length === 0) {
    throw new Error(`[${op}] "${entityName}"-এ empty query ${op} নিষিদ্ধ — পুরো টেবিল মুছে/বদলে যাবে।`);
  }
}

async function fetchAll(ent) {
  const items = [];
  let cursor;
  for (;;) {
    const page = await ent.filter({}, { sort: '-created_date', limit: 1000, cursor });
    items.push(...(page.items || []));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return items;
}

// Scan the whole database for demo/test candidates. Returns grouped lists — nothing is deleted.
export async function identifyTestData() {
  const users = await fetchAll(base44.entities.ERPUser);
  const testUsers = users.filter(isTestUser);
  const testUserIds = new Set(testUsers.map((u) => u.id));

  const trucks = await fetchAll(base44.entities.TruckEntry);
  const truckTests = trucks.filter(
    (r) => (r.enteredBy || '').includes(TEST_PREFIX)
      || (r.ghatName || '').startsWith(TEST_PREFIX)
      || TEST_TRUCK_RE.test(r.truckNumber || '')
      || testUserIds.has(r.createdBy)
  );

  const empties = await fetchAll(base44.entities.EmptyWeight);
  const emptyTests = empties.filter(
    (r) => (r.enteredByName || '').includes(TEST_PREFIX)
      || (r.ghat || '').startsWith(TEST_PREFIX)
      || testUserIds.has(r.enteredById)
  );

  const alerts = await fetchAll(base44.entities.Alert);
  const alertTests = alerts.filter(
    (r) => (r.enteredByName || '').includes(TEST_PREFIX)
      || TEST_TRUCK_RE.test(r.truckNumber || '')
      || (r.normalizedTruckNumber || '').startsWith(TEST_PREFIX)
      || (r.ghat || '').startsWith(TEST_PREFIX)
  );

  // Device and OTP records are server-only now: they stay unreadable from the browser, so a scan simply
  // reports none instead of failing.
  const td = await fetchAll(base44.entities.TrustedDevice).catch(() => []);
  const tdTests = td.filter((r) => testUserIds.has(r.userId));

  const otp = await fetchAll(base44.entities.OtpCode).catch(() => []);
  const otpTests = otp.filter((r) => testUserIds.has(r.userId));

  const sm = await fetchAll(base44.entities.ScaleGhatMapping);
  const smTests = sm.filter((r) => (r.scaleName || '').startsWith(TEST_PREFIX) || (r.ghatName || '').startsWith(TEST_PREFIX));

  const closings = await fetchAll(base44.entities.VesselClosing);
  const closingTests = closings.filter((r) => (r.lighterVesselName || '').startsWith(TEST_PREFIX) || testUserIds.has(r.closedBy));

  const approvals = await fetchAll(base44.entities.ApprovalRequest);
  const approvalTests = approvals.filter((r) => (r.requestedByName || '').includes(TEST_PREFIX) || testUserIds.has(r.requestedBy));

  const ghats = (await fetchAll(base44.entities.Ghat)).filter((r) => (r.name || '').startsWith(TEST_PREFIX));
  const vessels = (await fetchAll(base44.entities.MotherVessel)).filter((r) => (r.name || '').startsWith(TEST_PREFIX));
  const lighters = (await fetchAll(base44.entities.LighterVessel)).filter((r) => (r.name || '').startsWith(TEST_PREFIX));
  const consignees = (await fetchAll(base44.entities.Consignee)).filter((r) => (r.name || '').startsWith(TEST_PREFIX));
  const cargos = (await fetchAll(base44.entities.Cargo)).filter((r) => (r.name || '').startsWith(TEST_PREFIX));

  const groups = {
    testUsers, trucks: truckTests, empties: emptyTests, alerts: alertTests,
    trustedDevices: tdTests, otpCodes: otpTests, scaleMappings: smTests,
    closings: closingTests, approvals: approvalTests, ghats, vessels, lighters, consignees, cargos,
  };
  let total = 0;
  Object.values(groups).forEach((arr) => { total += arr.length; });
  return { groups, total, testUserIds: [...testUserIds] };
}

// Delete the identified test records in dependency order (children first). Each delete is guarded.
export async function deleteTestData(candidates, user) {
  const g = candidates.groups || candidates;
  const del = async (entName, items) => {
    for (const it of items) {
      assertSafeBulkOp(entName, { id: it.id }, 'delete');
      await base44.entities[entName].delete(it.id).catch(() => {});
    }
  };
  await del('Alert', g.alerts || []);
  await del('TruckEntry', g.trucks || []);
  await del('EmptyWeight', g.empties || []);
  await del('VesselClosing', g.closings || []);
  await del('ApprovalRequest', g.approvals || []);
  await del('ScaleGhatMapping', g.scaleMappings || []);
  await del('TrustedDevice', g.trustedDevices || []);
  await del('OtpCode', g.otpCodes || []);
  await del('LighterVessel', g.lighters || []);
  await del('MotherVessel', g.vessels || []);
  await del('Ghat', g.ghats || []);
  await del('Consignee', g.consignees || []);
  await del('Cargo', g.cargos || []);
  await del('ERPUser', g.testUsers || []);
  return true;
}

// Live database integrity: per-entity counts + orphan references.
export async function integrityCheck() {
  const counts = {};
  for (const n of PRODUCTION_ENTITIES) {
    try { counts[n] = await base44.entities[n].count({}); } catch (e) { counts[n] = -1; }
  }
  const orphans = [];
  try {
    const lighters = new Set((await fetchAll(base44.entities.LighterVessel)).map((l) => l.id));
    const trucks = await fetchAll(base44.entities.TruckEntry);
    const orphanTruckLighter = trucks.filter((r) => r.lighterVesselId && !lighters.has(r.lighterVesselId)).length;
    if (orphanTruckLighter) orphans.push({ type: 'TruckEntry → LighterVessel', count: orphanTruckLighter });
  } catch (e) {}
  const total = Object.values(counts).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  return { counts, orphans, total };
}