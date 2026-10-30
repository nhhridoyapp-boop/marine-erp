import { base44 } from '@/api/base44Client';
import { withRetry, safeCount } from '@/lib/sanmarineNet';
import { captureUserGuard, verifyUserGuard } from '@/components/sanmarine/company/userGuard';

// Current app version (date-prefixed so a newer version is always recognisable). On a NEWER version the first admin session
// runs BACKUP -> VERIFY -> MIGRATION check -> VERIFY DATABASE before the version is stamped.
export const APP_VERSION = '2026.10.07-stability';

// Order matters: parents before children so references can be re-mapped while restoring.
const ENTITIES = [
  'Ghat', 'Cargo', 'Scale', 'Consignee', 'MotherVessel', 'LighterVessel', 'ERPUser', 'ScaleGhatMapping', 'Setting',
  'EmptyWeight', 'TruckEntry', 'Alert', 'LighterDailyDocument', 'VesselClosing', 'ApprovalRequest', 'AuditLog',
  'HistoricalEmptyWeight', 'HistoricalImportLog', 'TrustedDevice', 'OtpCode',
];
const SYSTEM_KEYS = ['id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'];
const REFS = {
  LighterVessel: ['motherVesselId', 'consigneeId'],
  TruckEntry: ['motherVesselId', 'lighterVesselId', 'consigneeId', 'ghatId'],
  EmptyWeight: ['enteredById'],
  LighterDailyDocument: ['motherVesselId', 'lighterVesselId', 'ghatId', 'consigneeId'],
  VesselClosing: ['motherVesselId', 'lighterVesselId', 'consigneeId', 'ghatId', 'closedBy'],
  AuditLog: ['userId'],
  ApprovalRequest: ['requestedBy', 'reviewedBy'],
  TrustedDevice: ['userId'],
  OtpCode: ['userId'],
};
const LATE_REFS = {
  EmptyWeight: ['loadingEntryId'],
  TruckEntry: ['emptyWeightId'],
  Alert: ['relatedEmptyId', 'relatedLoadingId'],
  ApprovalRequest: ['targetId'],
};

async function fetchAll(ent) {
  const items = [];
  let cursor;
  for (;;) {
    const page = await withRetry(() => ent.filter({}, { sort: '-created_date', limit: 1000, cursor }), { tries: 4, base: 900, timeoutMs: 30000 });
    items.push(...(page.items || []));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return items;
}

const strip = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SYSTEM_KEYS.includes(k)));
const remap = (name, rec, idMap) => {
  const out = { ...rec };
  (REFS[name] || []).forEach(f => { if (out[f] && idMap[out[f]]) out[f] = idMap[out[f]]; });
  return out;
};

// SHA-256 hash of the canonical backup payload (browser SubtleCrypto).
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function backupAll() {
  const session = await base44.auth.me();
  if (session.role !== 'admin') throw new Error('সব User ও Login Security-এর পূর্ণ ব্যাকআপের জন্য প্ল্যাটফর্ম Admin লগইন আবশ্যক; আংশিক ব্যাকআপকে Verified বলা হবে না।');
  const data = {};
  const counts = {};
  for (const name of ENTITIES) {
    data[name] = await fetchAll(base44.entities[name]);
    counts[name] = data[name].length;
  }
  const createdAt = new Date().toISOString();
  const core = { app: 'SAN MARINE SURVEY & INSPECTION', version: 2, createdAt, counts, data };
  core.hash = await sha256(JSON.stringify({ app: core.app, version: core.version, createdAt, counts, data }));
  return core;
}

// Re-count the live database and compare to a backup's recorded counts + hash.
// `liveIn` lets one set of live counts serve several checks (fewer requests). A count that could not be READ is reported
// as "unknown" — never mistaken for "records lost", and never silently accepted as verified either.
export async function verifyBackupIntegrity(backup, liveIn) {
  const live = liveIn || await liveCounts();
  const mismatches = {};
  const unknown = [];
  let countOk = true;
  for (const name of ENTITIES) {
    const backupCount = (backup.counts && backup.counts[name]) || 0;
    const now = live[name];
    if (now === undefined || now < 0) { unknown.push(name); continue; }
    // The live count may legitimately be HIGHER (entries added while the backup ran); LOWER means records were lost.
    if (now < backupCount) { countOk = false; mismatches[name] = { backup: backupCount, live: now }; }
  }
  let hashOk = true;
  if (backup.hash) {
    try {
      const recomputed = await sha256(JSON.stringify({ app: backup.app, version: backup.version, createdAt: backup.createdAt, counts: backup.counts, data: backup.data }));
      hashOk = recomputed === backup.hash;
    } catch (e) { hashOk = false; }
  }
  const totalBackup = Object.values(backup.counts || {}).reduce((a, b) => a + b, 0);
  return { ok: countOk && hashOk && unknown.length === 0, countOk, hashOk, mismatches, unknown, totalBackup };
}

function tierFor(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDate();
  if (day <= 3) return 'monthly';
  if (day % 7 === 0) return 'weekly';
  return 'daily';
}

// Create a verified backup: export → upload → re-count + hash-verify → log.
const auditSys = (user, action, details, id) => base44.entities.AuditLog.create({
  timestamp: new Date().toISOString(), userId: (user && user.id) || '', userName: (user && user.name) || 'System', userRole: (user && user.role) || '',
  action, recordType: 'System', recordId: id || '', details: details || '',
}).catch(() => {});

// Every backup (daily, manual, pre-update, pre-migration, pre-restore) is audit-logged: created, verified or failed.
export async function createAutoBackup(user, kind = 'auto', reason = '') {
  let r;
  try {
    r = await createBackupCore(user, kind, reason);
  } catch (e) {
    await auditSys(user, 'BACKUP_FAILED', `${kind}: ${(e && e.message ? e.message : 'অজানা ত্রুটি').slice(0, 160)}`);
    throw e;
  }
  const id = r.log && r.log.id;
  await auditSys(user, 'BACKUP_CREATED', `${kind}: ${r.total} রেকর্ড`, id);
  await auditSys(user, r.verified ? 'BACKUP_VERIFIED' : 'BACKUP_FAILED', `${kind}: ${(r.log && r.log.verifyDetails) || ''}`, id);
  return r;
}

async function createBackupCore(user, kind, reason) {
  const backup = await backupAll();
  const stamp = backup.createdAt.slice(0, 19).replace(/[:T]/g, '-');
  const file = new File([JSON.stringify(backup)], `sanmarine-${kind}-${stamp}.json`, { type: 'application/json' });
  const res = await base44.integrations.Core.UploadPrivateFile({ file });
  if (!res || !res.file_uri) throw new Error('ব্যাকআপ ফাইল সংরক্ষণ করা যায়নি — কাজটি বন্ধ রাখা হয়েছে।');
  const total = Object.values(backup.counts).reduce((a, b) => a + b, 0);
  let verified = false;
  let verifyDetails = '';
  try {
    // VERIFY BACKUP: (1) the exported data matches its hash and the live database lost nothing;
    // (2) the stored file is re-read from storage and must be identical to what was exported.
    const live = await liveCounts();
    const v = await verifyBackupIntegrity(backup, live);
    let storedState = 'not-reread';
    try {
      const stored = await loadBackupFile(res.file_uri);
      const sv = await verifyBackupIntegrity(stored, live);
      storedState = sv.hashOk && stored.hash === backup.hash ? 'ok' : 'mismatch';
    } catch (re) { storedState = 'not-reread'; }
    const users = await verifyUserGuard(await captureUserGuard(backup.data));
    verified = v.ok && users.ok && storedState === 'ok';
    const storedTxt = storedState === 'ok' ? 'সংরক্ষিত ফাইল পুনরায় পড়ে ✓' : storedState === 'mismatch' ? 'সংরক্ষিত ফাইল মেলেনি ✗' : 'সংরক্ষিত ফাইল পুনরায় পড়া যায়নি';
    verifyDetails = verified ? `${total} রেকর্ড, hash ✓, count ✓, ${storedTxt}` : `verify fail: ${storedTxt}; ${JSON.stringify(v.mismatches).slice(0, 80)}${v.unknown.length ? ` · গণনা পড়া যায়নি: ${v.unknown.join(',').slice(0, 60)}` : ''}`;
  } catch (e) { verifyDetails = 'verify error: ' + (e.message || '').slice(0, 80); }
  const tier = tierFor(backup.createdAt);
  const log = await base44.entities.BackupLog.create({
    createdAt: backup.createdAt, kind, reason, fileUri: res.file_uri, counts: JSON.stringify(backup.counts),
    totalRecords: total, createdByName: (user && user.name) || 'System', tier, hash: backup.hash, verified, verifyDetails,
  });
  await base44.entities.Setting.update((await base44.entities.Setting.filter({}, { limit: 1 })).items[0].id, { lastBackupAt: backup.createdAt }).catch(() => {});
  return { log, verified, total, hash: backup.hash };
}

export async function listBackups() {
  return (await base44.entities.BackupLog.filter({}, { sort: '-created_date', limit: 50 })).items;
}

export async function loadBackupFile(fileUri) {
  const res = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 300 });
  const r = await fetch(res.signed_url);
  if (!r.ok) throw new Error('ব্যাকআপ ফাইল পড়া যায়নি।');
  return r.json();
}

// Runs at most once per 24 hours (first admin to open the app after that).
export async function ensureDailyBackup(user) {
  const recent = (await base44.entities.BackupLog.filter({}, { sort: '-created_date', limit: 8 })).items;
  const age = (b) => Date.now() - new Date(b.createdAt).getTime();
  // Any verified backup from the last 24 hours (daily, manual or pre-update) is enough — no second full export is made.
  if (recent.some((b) => b.verified && age(b) < 24 * 3600 * 1000)) return null;
  // A failed attempt in the last 2 hours is not repeated at once (keeps the server from being hammered).
  if (recent.some((b) => age(b) < 2 * 3600 * 1000)) return null;
  return createAutoBackup(user, 'auto', 'দৈনিক স্বয়ংক্রিয় ব্যাকআপ');
}

export function downloadBackup(backup) {
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sanmarine-backup-${backup.createdAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Additive restore: never deletes or overwrites. Records whose id (or user email) already exists are skipped.
export async function restoreBackup(backup) {
  if (!backup || typeof backup.data !== 'object') throw new Error('অবৈধ ব্যাকআপ ফাইল।');
  const users = await fetchAll(base44.entities.ERPUser);
  const userIds = new Set(users.map((u) => u.id));
  if ((backup.data.ERPUser || []).some((u) => !userIds.has(u.id))) throw new Error('ব্যাকআপের User ID অনুপস্থিত: স্বয়ংক্রিয়ভাবে Account তৈরি/Merge/ID বদলে Restore করা হবে না; অনুমোদিত পরিচয়-সংরক্ষণকারী Recovery দরকার।');
  const idMap = {};
  const created = {};
  const skipped = {};
  const createdRecs = [];

  for (const name of ENTITIES) {
    const rows = Array.isArray(backup.data[name]) ? backup.data[name] : [];
    if (!rows.length) continue;
    const ent = base44.entities[name];
    const existing = await fetchAll(ent);
    const existingIds = new Set(existing.map(r => r.id));
    const emailToId = name === 'ERPUser' ? new Map(existing.filter(u => u.email).map(u => [u.email.toLowerCase(), u.id])) : null;
    created[name] = 0;
    skipped[name] = 0;

    if (name === 'Setting' && existing.length) {
      rows.forEach(r => { idMap[r.id] = existing[0].id; });
      skipped[name] = rows.length;
      continue;
    }

    const todo = [];
    rows.forEach(r => {
      const sameUser = emailToId && r.email ? emailToId.get(r.email.toLowerCase()) : null;
      if (existingIds.has(r.id)) { idMap[r.id] = r.id; skipped[name] += 1; }
      else if (sameUser) { idMap[r.id] = sameUser; skipped[name] += 1; }
      else todo.push(r);
    });

    for (let i = 0; i < todo.length; i += 10) {
      const chunk = todo.slice(i, i + 10);
      const made = await Promise.all(chunk.map(r => ent.create(remap(name, strip(r), idMap))));
      made.forEach((m, k) => {
        idMap[chunk[k].id] = m.id;
        createdRecs.push({ name, id: m.id, src: chunk[k] });
        created[name] += 1;
      });
    }
  }

  for (const { name, id, src } of createdRecs) {
    const fields = LATE_REFS[name];
    if (!fields) continue;
    const patch = {};
    fields.forEach(f => { if (src[f] && idMap[src[f]] && idMap[src[f]] !== src[f]) patch[f] = idMap[src[f]]; });
    if (Object.keys(patch).length) await base44.entities[name].update(id, patch).catch(() => {});
  }
  return { created, skipped };
}

// Pre-migration safety backup — called by SanMarineApp when the stored app version changes.
export async function preMigrationBackup(user, fromVersion, toVersion) {
  return createAutoBackup(user, 'pre-migration', `ভার্সন আপডেট: ${fromVersion || '?'} → ${toVersion} (মাইগ্রেশনের আগে সেফটি ব্যাকআপ)`);
}

// One at a time with a short pause and retries, so a rate limit cannot turn into "could not read" for half the tables.
async function liveCounts() {
  const out = {};
  for (const name of ENTITIES) {
    out[name] = await safeCount(base44.entities[name]);
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

// Update sequence: BACKUP → VERIFY BACKUP → SAFE MIGRATION → VERIFY DATABASE → RUN NEW VERSION.
// Nothing here deletes, resets, replaces or overwrites a record. The caller stamps the new version ONLY when ok=true;
// on any failure the production data is left exactly as it was.
export async function safeVersionUpgrade(user, fromVersion) {
  await auditSys(user, 'MIGRATION_STARTED', `${fromVersion || '?'} → ${APP_VERSION}`);
  const before = await liveCounts();
  const protectedUsers = await captureUserGuard();
  const b = await preMigrationBackup(user, fromVersion, APP_VERSION); // backup + verification
  if (!b.verified) return { ok: false, stage: 'VERIFY BACKUP', details: (b.log && b.log.verifyDetails) || 'ব্যাকআপ ভেরিফাই হয়নি' };
  // SAFE MIGRATION: schema changes are additive (new optional fields) — no record is rewritten, so there is nothing to apply.
  const after = await liveCounts(); // VERIFY DATABASE: no entity may have fewer records than before.
  const lost = ENTITIES.filter((n) => before[n] >= 0 && after[n] < before[n]);
  const unknown = ENTITIES.filter((n) => before[n] < 0 || after[n] < 0 || before[n] === undefined || after[n] === undefined);
  const users = await verifyUserGuard(protectedUsers);
  if (!users.ok || lost.length || unknown.length) return { ok: false, stage: 'VERIFY DATABASE', details: `User ID/সুরক্ষিত তথ্য যাচাই=${users.ok}; কমেছে: ${lost.join(', ') || 'নেই'}; যাচাই হয়নি: ${unknown.join(', ') || 'নেই'}` };
  await auditSys(user, 'MIGRATION_COMPLETED', `${fromVersion || '?'} → ${APP_VERSION}: কোনো রেকর্ড কমেনি (${b.total} রেকর্ড ব্যাকআপে)`);
  return { ok: true, total: b.total, backupId: b.log && b.log.id };
}

// Retention: keep last 7 daily, 4 weekly, 12 monthly BackupLog entries; older log entries pruned.
// NOTE: Base44 has no delete-file API, so underlying private files remain — only the log entries are pruned.
export async function enforceRetention() {
  const all = (await base44.entities.BackupLog.filter({}, { sort: '-createdAt', limit: 500 })).items;
  const keep = { daily: 7, weekly: 4, monthly: 12 };
  const byTier = { daily: [], weekly: [], monthly: [] };
  for (const b of all) (byTier[b.tier || 'daily'] || byTier.daily).push(b);
  let removed = 0;
  for (const t of Object.keys(keep)) {
    const list = byTier[t];
    for (const b of list.slice(keep[t])) { await base44.entities.BackupLog.delete(b.id).catch(() => {}); removed += 1; }
  }
  return { removed, kept: all.length - removed };
}