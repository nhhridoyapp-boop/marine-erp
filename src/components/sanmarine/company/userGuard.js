import { base44 } from '@/api/base44Client';
const fields = ['name', 'employeeId', 'email', 'mobile', 'role', 'status', 'verificationStatus', 'trustedDevices'];
async function records(name) {
  const rows = []; let cursor;
  do { const p = await base44.entities[name].filter({}, { limit: 100, cursor }); rows.push(...p.items); cursor = p.has_more ? p.next_cursor : null; } while (cursor);
  return rows;
}
const fingerprint = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function captureUserGuard(data) {
  const users = data?.ERPUser || await records('ERPUser');
  const devices = data?.TrustedDevice || await records('TrustedDevice');
  const userHashes = Object.fromEntries(await Promise.all(users.map(async (u) => [u.id, await fingerprint(fields.map((f) => u[f] ?? null))])));
  const deviceHashes = Object.fromEntries(await Promise.all(devices.map(async (d) => [d.id, await fingerprint([d.userId, d.deviceId, d.trustedAt])])));
  return { userCount: users.length, userHashes, deviceHashes };
}
export async function verifyUserGuard(before) {
  const after = await captureUserGuard();
  const missing = Object.keys(before.userHashes).filter((id) => !(id in after.userHashes));
  const changed = Object.keys(before.userHashes).filter((id) => id in after.userHashes && before.userHashes[id] !== after.userHashes[id]);
  const deviceChanges = Object.keys(before.deviceHashes).filter((id) => before.deviceHashes[id] !== after.deviceHashes[id]);
  return { ok: !missing.length && !changed.length && !deviceChanges.length && after.userCount >= before.userCount, beforeCount: before.userCount, afterCount: after.userCount, missing, changed, deviceChanges };
}