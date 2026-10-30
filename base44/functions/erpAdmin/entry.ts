import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';

// ERP Admin backend: all user-management operations are authorized by the actor's ERP role
// (read server-side via asServiceRole, never from the client), not the Base44 app-level role.
// This lets designated Main Super Admin / Super Admin accounts manage the ERP even when
// their Base44 App Users role is "user", while keeping self-promotion impossible.

const RANK = { 'Master Super Admin': 6, 'Super Admin': 5, 'Admin': 4, 'Operations Admin': 3, 'Supervisor': 2, 'Staff': 1 };
const ADMIN_ROLES = ['Master Super Admin', 'Super Admin', 'Admin', 'Operations Admin'];
const SUPER_ROLES = ['Master Super Admin', 'Super Admin'];
const MASTER_ADD_ROLES = ['Master Super Admin', 'Super Admin', 'Admin', 'Operations Admin', 'Supervisor', 'Staff'];
const MASTER_MAP = {
  vessels: { entity: 'MotherVessel', nameField: 'name', companyScoped: true, label: 'ভেসেল' },
  lighters: { entity: 'LighterVessel', nameField: 'name', companyScoped: false, label: 'লাইটার' },
  ghats: { entity: 'Ghat', nameField: 'name', companyScoped: false, label: 'ঘাট' },
  cargos: { entity: 'Cargo', nameField: 'name', companyScoped: false, label: 'কার্গো' },
  scales: { entity: 'Scale', nameField: 'name', companyScoped: false, label: 'স্কেল' },
  consignees: { entity: 'Consignee', nameField: 'name', companyScoped: true, label: 'আমদানিকারক' },
};
// Explicit allowlist of writable fields per master kind — prevents mass assignment of arbitrary client keys.
const MASTER_FIELDS = {
  vessels: ['name', 'company', 'cargoType', 'capacityMT', 'totalCargoMT', 'arrivalDate', 'status'],
  lighters: ['name', 'motherVesselId', 'consigneeId', 'consigneeName', 'status'],
  ghats: ['name', 'location'],
  cargos: ['name', 'type', 'unit'],
  scales: ['name', 'note'],
  consignees: ['name', 'company', 'address', 'contactPerson', 'phone'],
};
const ALLOWED_USER_STATUSES = ['approved', 'pending', 'rejected', 'deactivated', 'ACTIVE', 'SUSPENDED', 'suspended'];
const normName = (s) => String(s || '').toUpperCase().trim().replace(/[\s.\-_/]+/g, '');
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[n];
}
const similarity = (a, b) => { const d = levenshtein(a, b); const max = Math.max(a.length, b.length); return max ? 1 - d / max : 1; };
const ITERATIONS = 150000;

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function derive(plain, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}
async function hashPasswordV2(plain) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(plain, salt, ITERATIONS))}`;
}

function stripUser(u) {
  if (!u) return u;
  const { passwordHash, trustedDevices, ...rest } = u;
  return rest;
}

const nowISO = () => new Date().toISOString();
const escRx = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mask = (e) => { if (!e) return ''; const [a, b] = e.split('@'); return (a ? a.slice(0, 2) : '') + '***@' + (b || ''); };

// CSPRNG-based 6-digit OTP (rejection sampling for uniform distribution).
function secureOtp() {
  const max = 900000;
  const limit = Math.floor(0xFFFFFFFF / max) * max;
  const buf = new Uint32Array(1);
  let v;
  do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
  return String(100000 + (v % max));
}
// CSPRNG-based opaque challenge id.
function secureId() {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Server-side password verification — PBKDF2 only. No legacy format is accepted any more.
async function verifyPasswordServer(plain, stored) {
  if (!stored) return { ok: false, needsUpgrade: false };
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 4) return { ok: false, needsUpgrade: false };
    const salt = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
    const iterations = parseInt(parts[1], 10);
    const actual = toB64(await derive(plain, salt, iterations));
    return { ok: actual === parts[3], needsUpgrade: false };
  }
  // The ported ERP's legacy single-pass SHA-256 format — and the static salt it needed — is gone, so no
  // hardcoded credential material stays in the source. An account still on that format signs in with
  // Google, or gets a fresh password through an admin reset.
  return { ok: false, needsUpgrade: false };
}

async function findUserByIdentifier(E, identifier) {
  const raw = (identifier || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const p = await E.ERPUser.filter({ email: { $regex: `^${escRx(raw)}$`, $options: 'i' } }, { limit: 1 });
    if (p.items[0]) return p.items[0];
  }
  let p = await E.ERPUser.filter({ employeeId: raw.toUpperCase() }, { limit: 1 });
  if (!p.items.length) p = await E.ERPUser.filter({ employeeId: { $regex: `^${escRx(raw)}$`, $options: 'i' } }, { limit: 1 });
  if (!p.items.length) p = await E.ERPUser.filter({ mobile: raw }, { limit: 1 });
  return p.items[0] || null;
}

// Canonical form of an address for duplicate detection: case and spaces are ignored, and for Gmail the dots
// and +tag that Gmail itself ignores are stripped too — a.b+1@gmail.com and ab@gmail.com are the SAME mailbox.
function canonicalEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  const at = raw.lastIndexOf('@');
  if (at < 1) return raw;
  const local = raw.slice(0, at), domain = raw.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
  return `${local}@${domain}`;
}

// ONE account per email. Every creation path asks this first, so a second staff ID for the same Gmail can
// never be created again — not from self-registration, not from Google sign-in, not by an admin by hand.
async function findEmailHolder(E, email, excludeId) {
  const want = canonicalEmail(email);
  if (!want) return null;
  const page = await E.ERPUser.filter({}, { limit: 1000, fields: ['id', 'name', 'email', 'employeeId', 'role', 'status'] });
  return page.items.find((u) => u.id !== excludeId && canonicalEmail(u.email) === want) || null;
}

// HMAC integrity tag for OTP records — proves the record was created by the server, not forged by a client.
// The OtpCode entity's create rule is admin-only, but this is defense-in-depth: even if a record is inserted
// through another path, it cannot pass verification without the server's HMAC key.
async function hmacSign(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Server-only key material for OTP integrity tags. The dedicated secret is used when it is configured;
// otherwise the key is derived from the app's other server-side secret, so device verification can never
// break in production just because a secret was not set. Neither value ever reaches the browser.
function otpKeyMaterial() {
  const dedicated = secrets.get('OTP_INTEGRITY_KEY');
  if (dedicated) return dedicated;
  const base = secrets.get('GEMINI_API_KEY');
  return base ? `sanmarine-otp-integrity|${base}` : '';
}
async function signOtp(challengeId, userId, purpose, codeHash) {
  const key = otpKeyMaterial();
  if (!key) throw new Error('OTP integrity key not configured.');
  return hmacSign(key, `${challengeId}|${userId}|${purpose}|${codeHash}`);
}
async function verifyOtpIntegrity(rec) {
  if (!rec || !rec.integrityTag) return false;
  const key = otpKeyMaterial();
  if (!key) return false;
  const expected = await hmacSign(key, `${rec.challengeId}|${rec.userId}|${rec.purpose}|${rec.codeHash}`);
  return expected === rec.integrityTag;
}
// Validate that a caller-supplied passwordHash matches the server's PBKDF2 scheme (prevents arbitrary/weak hashes).
function validatePasswordHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('pbkdf2$')) return false;
  const parts = hash.split('$');
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 100000) return false;
  try { Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0)); } catch { return false; }
  try { Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0)); } catch { return false; }
  return true;
}

async function getActor(base44) {
  const session = await base44.auth.me();
  if (!session?.email) return null;
  const email = session.email.trim().toLowerCase();
  const page = await base44.asServiceRole.entities.ERPUser.filter(
    { email: { $regex: `^${escRx(email)}$`, $options: 'i' }, status: { $in: ['approved', 'active', 'ACTIVE'] } },
    { limit: 2, fields: ['name', 'email', 'employeeId', 'role', 'status', 'verificationStatus', 'mobile', 'designation'] }
  );
  if (page.items.length === 0) return null;
  if (page.items.length > 1) return { ambiguous: true };
  return { ...page.items[0], _platformEmail: email, _platformId: session.id, _platformRole: session.role || '' };
}

async function readAllMaster(entity) {
  const rows = []; let cursor;
  do {
    const page = await entity.filter({}, { limit: 500, cursor });
    rows.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

async function logAudit(base44, actor, action, recordType, recordId, details, oldValue, newValue, success = true) {
  await base44.asServiceRole.entities.AuditLog.create({
    timestamp: nowISO(),
    userId: actor.id, userName: actor.name, userEmail: actor.email || actor._platformEmail, userRole: actor.role,
    action: success ? action : `${action}_FAILED`, recordType, recordId,
    details: details || '', oldValue: oldValue ? JSON.stringify(oldValue) : '', newValue: newValue ? JSON.stringify(newValue) : '',
    success,
  }).catch(() => {});
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    const E = base44.asServiceRole.entities;

    // ── Self-service actions: only need a verified platform session, not an ERP profile. ──
    if (action === 'register') {
      const session = await base44.auth.me();
      if (!session?.email) return Response.json({ error: 'Google সেশন পাওয়া যায়নি।' }, { status: 403 });
      const { name, mobile, email, employeeId, hasId, requestedRole, designation, joiningInfo, passwordHash } = body;
      if (!name?.trim()) return Response.json({ error: 'নাম আবশ্যক।' }, { status: 400 });
      if (!passwordHash) return Response.json({ error: 'পাসওয়ার্ড হ্যাশ পাওয়া যায়নি।' }, { status: 400 });
      if (!validatePasswordHash(passwordHash)) return Response.json({ error: 'পাসওয়ার্ড হ্যাশ সঠিক নয়।' }, { status: 400 });
      const emailLower = (email || '').trim().toLowerCase();
      if (!emailLower && !mobile) return Response.json({ error: 'ইমেইল অথবা মোবাইল আবশ্যক।' }, { status: 400 });
      if (emailLower) {
        const holder = await findEmailHolder(E, emailLower);
        if (holder) return Response.json({ error: `এই ইমেইল (${holder.name}) দিয়ে ইতিমধ্যে অ্যাকাউন্ট রয়েছে — একই ইমেইলে দুটি স্টাফ আইডি হতে পারে না।` }, { status: 400 });
      }
      if (mobile) {
        const ex = await E.ERPUser.filter({ mobile }, { limit: 1 });
        if (ex.items.length) return Response.json({ error: 'এই মোবাইল দিয়ে অ্যাকাউন্ট রয়েছে।' }, { status: 400 });
      }
      const claims = hasId === undefined ? !!(employeeId || '').trim() : !!hasId;
      let empId;
      let idStatus = 'NEEDS_ID';
      if (claims) {
        if (!(employeeId || '').trim()) return Response.json({ error: 'আপনার আইডি লিখুন অথবা "আমার আইডি নেই" নির্বাচন করুন।' }, { status: 400 });
        empId = (employeeId || '').trim().toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9._/-]{2,29}$/.test(empId)) return Response.json({ error: 'আইডি ৩–৩০ অক্ষরের হতে হবে।' }, { status: 400 });
        if (/^(MASTER|SUPER|ADMIN|SYSTEM|STAFF-)/.test(empId)) return Response.json({ error: 'এই আইডিটি সংরক্ষিত।' }, { status: 400 });
        const ex = await E.ERPUser.filter({ employeeId: empId }, { limit: 1 });
        if (ex.items.length) return Response.json({ error: 'এই স্টাফ আইডি ব্যবহৃত হয়েছে।' }, { status: 400 });
        idStatus = 'CLAIMED';
      }
      const reqRole = ['Admin', 'Supervisor', 'Staff'].includes(requestedRole) ? requestedRole : 'Staff';
      const user = await E.ERPUser.create({
        name: name.trim(), mobile: (mobile || '').trim(), email: emailLower || undefined,
        employeeId: empId, designation: designation || 'Scale Monitor', joiningInfo: joiningInfo || undefined,
        role: 'Staff', requestedRole: reqRole, idStatus, status: 'pending', verificationStatus: 'VERIFICATION PENDING',
        requestDateTime: nowISO(), passwordHash,
      });
      return Response.json({ user: stripUser(user) });
    }

    if (action === 'googleCreate') {
      const session = await base44.auth.me();
      if (!session?.email) return Response.json({ error: 'Google সেশন পাওয়া যায়নি।' }, { status: 403 });
      const emailLower = session.email.trim().toLowerCase();
      const name = body.name || (session.full_name || session.name) || 'New User';
      const holder = await findEmailHolder(E, emailLower);
      if (holder) return Response.json({ user: stripUser(holder) });
      let user;
      // Bootstrap: the first Google-verified account becomes Master Super Admin only while the app has no
      // Master Super Admin at all. No address is hardcoded anywhere in the source.
      const masterPage = await E.ERPUser.filter({ role: 'Master Super Admin' }, { limit: 1 });
      if (!masterPage.items.length) {
        user = await E.ERPUser.create({
          name: name || 'Master Super Admin', email: emailLower, mobile: '', employeeId: 'MASTER-SUPER-ADMIN',
          role: 'Master Super Admin', status: 'approved', verificationStatus: 'VERIFIED',
          requestDateTime: nowISO(), approvedAt: nowISO(), approvedByName: 'Google Bootstrap',
        });
      } else {
        user = await E.ERPUser.create({
          name, email: emailLower, mobile: '',
          role: 'Staff', requestedRole: 'Staff', idStatus: 'NEEDS_ID', status: 'pending', verificationStatus: 'VERIFICATION PENDING',
          requestDateTime: nowISO(),
        });
      }
      return Response.json({ user: stripUser(user) });
    }

    // ── Self-service password recovery (no ERP profile required). ──
    if (action === 'requestPasswordReset') {
      // Uniform response regardless of whether the identifier exists — no account enumeration.
      // Throttled: no new code/email if an unexpired unconsumed one exists for the user (min 60s gap).
      const { identifier } = body;
      const dummyChallenge = 'reset_' + secureId();
      const dummySentTo = mask((identifier || '').trim());
      if (!identifier) return Response.json({ challengeId: dummyChallenge, sentTo: dummySentTo, message: 'যদি অ্যাকাউন্ট থাকে, ইমেইলে রিসেট কোড পাঠানো হয়েছে।' });
      const raw = identifier.trim();
      let user = null;
      if (raw.includes('@')) {
        const page = await E.ERPUser.filter({ email: { $regex: `^${escRx(raw)}$`, $options: 'i' } }, { limit: 1 });
        user = page.items[0];
      } else {
        let page = await E.ERPUser.filter({ employeeId: raw.toUpperCase() }, { limit: 1 });
        if (!page.items.length) page = await E.ERPUser.filter({ employeeId: { $regex: `^${escRx(raw)}$`, $options: 'i' } }, { limit: 1 });
        if (!page.items.length) page = await E.ERPUser.filter({ mobile: raw }, { limit: 1 });
        user = page.items[0];
      }
      if (!user || !user.email) return Response.json({ challengeId: dummyChallenge, sentTo: dummySentTo, message: 'যদি অ্যাকাউন্ট থাকে, ইমেইলে রিসেট কোড পাঠানো হয়েছে।' });
      const recent = await E.OtpCode.filter({ userId: user.id, purpose: 'PASSWORD_RESET', consumed: false, expiresAt: { $gte: nowISO() } }, { sort: '-created_date', limit: 1 });
      if (recent.items.length) {
        const created = new Date(recent.items[0].createdAt || recent.items[0].created_date || nowISO()).getTime();
        if (Date.now() - created < 60000) return Response.json({ challengeId: recent.items[0].challengeId, sentTo: mask(user.email), message: 'আগের কোড এখনও কার্যকর। ইমেইল দেখুন।' });
      }
      const code = secureOtp();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const codeHash = `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(code, salt, ITERATIONS))}`;
      const challengeId = 'reset_' + secureId();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await E.OtpCode.create({ challengeId, userId: user.id, identifier: user.email, codeHash, purpose: 'PASSWORD_RESET', integrityTag: await signOtp(challengeId, user.id, 'PASSWORD_RESET', codeHash), expiresAt, attempts: 0, consumed: false, createdAt: nowISO() });
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({ to: user.email, subject: 'SAN MARINE ERP — পাসওয়ার্ড রিসেট কোড', body: `প্রিয় ${user.name},\n\nআপনার পাসওয়ার্ড রিসেট কোড: ${code}\nএই কোড ১০ মিনিটের জন্য কার্যকর এবং একবার ব্যবহারযোগ্য।\n\nSAN MARINE SURVEY & INSPECTION` });
      } catch (e) {
        return Response.json({ challengeId, sentTo: mask(user.email), message: 'ইমেইল পাঠানো যায়নি। কাস্টম ডোমেইন কনফিগার করা প্রয়োজন।' });
      }
      return Response.json({ challengeId, sentTo: mask(user.email), message: 'রিসেট কোড পাঠানো হয়েছে।' });
    }

    if (action === 'confirmPasswordReset') {
      const { challengeId, otpCode, newPasswordHash } = body;
      if (!challengeId || !otpCode || !newPasswordHash) return Response.json({ error: 'সব তথ্য আবশ্যক।' }, { status: 400 });
      if (!validatePasswordHash(newPasswordHash)) return Response.json({ error: 'পাসওয়ার্ড হ্যাশ সঠিক নয়।' }, { status: 400 });
      const page = await E.OtpCode.filter({ challengeId, purpose: 'PASSWORD_RESET', consumed: false }, { limit: 1 });
      const rec = page.items[0];
      if (!rec) return Response.json({ error: 'ভেরিফিকেশন সেশন পাওয়া যায়নি।' }, { status: 404 });
      if (!(await verifyOtpIntegrity(rec))) return Response.json({ error: 'ভেরিফিকেশন সেশন পাওয়া যায়নি।' }, { status: 404 });
      if (new Date(rec.expiresAt) < new Date()) return Response.json({ error: 'কোডের মেয়াদ শেষ।' }, { status: 400 });
      if ((rec.attempts || 0) >= 5) return Response.json({ error: 'অনেকবার ভুল কোড। আবার চেষ্টা করুন।' }, { status: 400 });
      const parts = rec.codeHash.split('$');
      if (parts.length !== 4 || parts[0] !== 'pbkdf2') return Response.json({ error: 'কোড যাচাই ব্যর্থ।' }, { status: 500 });
      const salt = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
      const iterations = parseInt(parts[1], 10);
      const expectedHash = parts[3];
      const actualHash = toB64(await derive(String(otpCode).trim(), salt, iterations));
      if (actualHash !== expectedHash) {
        await E.OtpCode.update(rec.id, { attempts: (rec.attempts || 0) + 1 });
        return Response.json({ error: 'ভুল ভেরিফিকেশন কোড।' }, { status: 400 });
      }
      await E.OtpCode.update(rec.id, { consumed: true });
      await E.ERPUser.update(rec.userId, { passwordHash: newPasswordHash, failedLoginCount: 0, lockedUntil: '' });
      return Response.json({ ok: true });
    }

    // ── Login device-trust + email-OTP, enforced server-side so the open TrustedDevice entity ──
    // ── cannot be used to skip the OTP second factor (create is admin-only via RLS). ──
    if (action === 'resolveDeviceTrust') {
      const session = await base44.auth.me();
      if (!session?.email) return Response.json({ error: 'সেশন পাওয়া যায়নি।' }, { status: 403 });
      const { targetId, deviceId, deviceName } = body;
      if (!targetId || !deviceId) return Response.json({ error: 'তথ্য অসম্পূর্ণ।' }, { status: 400 });
      const target = await E.ERPUser.get(targetId).catch(() => null);
      if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
      if ((target.email || '').toLowerCase() !== session.email.trim().toLowerCase())
        return Response.json({ error: 'শুধু নিজের ডিভাইস ট্রাস্ট করা যায়।' }, { status: 403 });
      const devId = String(deviceId).trim();
      const ex = await E.TrustedDevice.filter({ userId: targetId, deviceId: devId }, { limit: 1 });
      if (ex.items.length) {
        await E.TrustedDevice.update(ex.items[0].id, { lastUsedAt: nowISO() });
        return Response.json({ deviceTrusted: true });
      }
      const count = await E.TrustedDevice.count({ userId: targetId });
      if (count === 0) {
        await E.TrustedDevice.create({ userId: targetId, deviceId: devId, deviceName: deviceName || 'Unknown', trustedAt: nowISO(), lastUsedAt: nowISO() });
        return Response.json({ deviceTrusted: true, firstDevice: true });
      }
      return Response.json({ requiresOtp: true });
    }

    if (action === 'grantDeviceTrust') {
      const session = await base44.auth.me();
      if (!session?.email) return Response.json({ error: 'সেশন পাওয়া যায়নি।' }, { status: 403 });
      const { targetId, deviceId, deviceName } = body;
      if (!targetId || !deviceId) return Response.json({ error: 'তথ্য অসম্পূর্ণ।' }, { status: 400 });
      const target = await E.ERPUser.get(targetId).catch(() => null);
      if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
      if ((target.email || '').toLowerCase() !== session.email.trim().toLowerCase())
        return Response.json({ error: 'শুধু নিজের ডিভাইস ট্রাস্ট করা যায়।' }, { status: 403 });
      const devId = String(deviceId).trim();
      const ex = await E.TrustedDevice.filter({ userId: targetId, deviceId: devId }, { limit: 1 });
      if (ex.items.length) { await E.TrustedDevice.update(ex.items[0].id, { lastUsedAt: nowISO() }); return Response.json({ deviceTrusted: true }); }
      await E.TrustedDevice.create({ userId: targetId, deviceId: devId, deviceName: deviceName || 'Unknown', trustedAt: nowISO(), lastUsedAt: nowISO() });
      return Response.json({ deviceTrusted: true });
    }

    if (action === 'sendLoginOtp') {
      const session = await base44.auth.me();
      if (!session?.email) return Response.json({ error: 'সেশন পাওয়া যায়নি।' }, { status: 403 });
      const { targetId } = body;
      const target = await E.ERPUser.get(targetId).catch(() => null);
      if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
      if ((target.email || '').toLowerCase() !== session.email.trim().toLowerCase())
        return Response.json({ error: 'শুধু নিজের অ্যাকাউন্টের কোড পাঠানো যায়।' }, { status: 403 });
      if (!target.email) return Response.json({ error: 'অ্যাকাউন্টে ইমেইল নেই।' }, { status: 400 });
      // Throttle: don't email a new code if an unexpired unconsumed one was created in the last 60s.
      const recent = await E.OtpCode.filter({ userId: targetId, purpose: 'LOGIN_DEVICE_VERIFY', consumed: false, expiresAt: { $gte: nowISO() } }, { sort: '-created_date', limit: 1 });
      if (recent.items.length) {
        const created = new Date(recent.items[0].createdAt || recent.items[0].created_date || nowISO()).getTime();
        if (Date.now() - created < 60000) return Response.json({ challengeId: recent.items[0].challengeId, sentTo: mask(target.email), delivered: true, throttled: true });
      }
      const code = secureOtp();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const codeHash = `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(code, salt, ITERATIONS))}`;
      const challengeId = 'ch_' + secureId();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await E.OtpCode.create({ challengeId, userId: targetId, identifier: target.email, codeHash, purpose: 'LOGIN_DEVICE_VERIFY', integrityTag: await signOtp(challengeId, targetId, 'LOGIN_DEVICE_VERIFY', codeHash), expiresAt, attempts: 0, consumed: false, createdAt: nowISO() });
      let delivered = false;
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({ to: target.email, subject: 'SAN MARINE SURVEY & INSPECTION — লগইন ভেরিফিকেশন কোড', body: `প্রিয় ${target.name},\n\nআপনার লগইন ভেরিফিকেশন কোড: ${code}\nএই কোড ১০ মিনিটের জন্য কার্যকর এবং একবার ব্যবহারযোগ্য।\n\nSAN MARINE SURVEY & INSPECTION` });
        delivered = true;
      } catch (e) { delivered = false; }
      return Response.json({ challengeId, sentTo: mask(target.email), delivered });
    }

    if (action === 'resendLoginOtp') {
      const session = await base44.auth.me();
      if (!session?.email) return Response.json({ error: 'সেশন পাওয়া যায়নি।' }, { status: 403 });
      const { challengeId } = body;
      const page = await E.OtpCode.filter({ challengeId, purpose: 'LOGIN_DEVICE_VERIFY' }, { limit: 1 });
      const rec = page.items[0];
      if (!rec) return Response.json({ error: 'ভেরিফিকেশন সেশন পাওয়া যায়নি।' }, { status: 404 });
      if (rec.consumed) return Response.json({ error: 'কোড ইতিমধ্যে ব্যবহৃত।' }, { status: 400 });
      const target = await E.ERPUser.get(rec.userId).catch(() => null);
      if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
      if ((target.email || '').toLowerCase() !== session.email.trim().toLowerCase())
        return Response.json({ error: 'সেশন ও কোড মেলেনি।' }, { status: 403 });
      if (!target.email) return Response.json({ error: 'অ্যাকাউন্টে ইমেইল নেই।' }, { status: 400 });
      const created = new Date(rec.createdAt || rec.created_date || nowISO()).getTime();
      if (Date.now() - created < 60000) return Response.json({ challengeId, sentTo: mask(target.email), delivered: true, throttled: true });
      const code = secureOtp();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const codeHash = `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(code, salt, ITERATIONS))}`;
      const newChallengeId = 'ch_' + secureId();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await E.OtpCode.update(rec.id, { consumed: true });
      await E.OtpCode.create({ challengeId: newChallengeId, userId: target.id, identifier: target.email, codeHash, purpose: 'LOGIN_DEVICE_VERIFY', integrityTag: await signOtp(newChallengeId, target.id, 'LOGIN_DEVICE_VERIFY', codeHash), expiresAt, attempts: 0, consumed: false, createdAt: nowISO() });
      let delivered = false;
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({ to: target.email, subject: 'SAN MARINE SURVEY & INSPECTION — লগইন ভেরিফিকেশন কোড', body: `প্রিয় ${target.name},\n\nআপনার লগইন ভেরিফিকেশন কোড: ${code}\nএই কোড ১০ মিনিটের জন্য কার্যকর এবং একবার ব্যবহারযোগ্য।\n\nSAN MARINE SURVEY & INSPECTION` });
        delivered = true;
      } catch (e) { delivered = false; }
      return Response.json({ challengeId: newChallengeId, sentTo: mask(target.email), delivered });
    }

    if (action === 'verifyLoginOtp') {
      const session = await base44.auth.me();
      if (!session?.email) return Response.json({ error: 'সেশন পাওয়া যায়নি।' }, { status: 403 });
      const { challengeId, otpCode, deviceId, deviceName } = body;
      if (!challengeId || !otpCode) return Response.json({ error: 'তথ্য অসম্পূর্ণ।' }, { status: 400 });
      const page = await E.OtpCode.filter({ challengeId, purpose: 'LOGIN_DEVICE_VERIFY', consumed: false }, { limit: 1 });
      const rec = page.items[0];
      if (!rec) return Response.json({ error: 'ভেরিফিকেশন সেশন পাওয়া যায়নি।' }, { status: 404 });
      if (!(await verifyOtpIntegrity(rec))) return Response.json({ error: 'ভেরিফিকেশন সেশন পাওয়া যায়নি।' }, { status: 404 });
      if (new Date(rec.expiresAt) < new Date()) return Response.json({ error: 'কোডের মেয়াদ শেষ।' }, { status: 400 });
      if ((rec.attempts || 0) >= 5) return Response.json({ error: 'অনেকবার ভুল কোড। আবার লগইন করুন।' }, { status: 400 });
      const parts = rec.codeHash.split('$');
      if (parts.length !== 4 || parts[0] !== 'pbkdf2') return Response.json({ error: 'কোড যাচাই ব্যর্থ।' }, { status: 500 });
      const salt = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
      const actual = toB64(await derive(String(otpCode).trim(), salt, parseInt(parts[1], 10)));
      if (actual !== parts[3]) {
        await E.OtpCode.update(rec.id, { attempts: (rec.attempts || 0) + 1 });
        return Response.json({ error: 'ভুল ভেরিফিকেশন কোড।' }, { status: 400 });
      }
      await E.OtpCode.update(rec.id, { consumed: true });
      const target = await E.ERPUser.get(rec.userId).catch(() => null);
      if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
      if ((target.email || '').toLowerCase() !== session.email.trim().toLowerCase())
        return Response.json({ error: 'সেশন ও কোড মেলেনি।' }, { status: 403 });
      // Grant device trust server-side (TrustedDevice create is admin-only via RLS).
      const devId = String(deviceId || '').trim();
      if (devId) {
        const ex = await E.TrustedDevice.filter({ userId: target.id, deviceId: devId }, { limit: 1 });
        if (ex.items.length) await E.TrustedDevice.update(ex.items[0].id, { lastUsedAt: nowISO() });
        else await E.TrustedDevice.create({ userId: target.id, deviceId: devId, deviceName: deviceName || 'Unknown', trustedAt: nowISO(), lastUsedAt: nowISO() });
      }
      return Response.json({ user: stripUser(target), deviceTrusted: true });
    }

    if (action === 'loginWithPassword') {
      // ERP password is verified SERVER-SIDE — the hash never leaves the server, and the browser
      // cannot bypass the password/OTP second factor by skipping client-side checks.
      const session = await base44.auth.me();
      if (!session?.email) return Response.json({ error: 'প্রথমে আপনার অনুমোদিত ইমেইল দিয়ে Google লগইন করুন অথবা ইমেইল যাচাই করুন। পরিচয় যাচাই ছাড়া স্টাফ আইডি/মোবাইল দিয়ে প্রবেশ করা যাবে না।', code: 'PLATFORM_LOGIN_REQUIRED' }, { status: 403 });
      const { identifier, password, deviceId, deviceName } = body;
      if (!identifier || !password) return Response.json({ error: 'আইডি ও পাসওয়ার্ড আবশ্যক।', code: 'MISSING' }, { status: 400 });
      const user = await findUserByIdentifier(E, identifier);
      if (!user) return Response.json({ error: 'এই আইডি দিয়ে কোনো ইউজার পাওয়া যায়নি। অনুগ্রহ করে যাচাই করুন।', code: 'NOT_FOUND' }, { status: 404 });
      if ((user.email || '').toLowerCase() !== session.email.trim().toLowerCase())
        return Response.json({ error: 'যে ইমেইল দিয়ে পরিচয় যাচাই করেছেন সেই অ্যাকাউন্টের স্টাফ আইডি ব্যবহার করুন।', code: 'EMAIL_MISMATCH' }, { status: 403 });
      const st = (user.status || '').toLowerCase();
      if (st === 'pending') return Response.json({ error: 'আপনার রেজিস্ট্রেশন অ্যাডমিন অনুমোদনের অপেক্ষায় আছে।', code: 'PENDING' }, { status: 403 });
      if (['rejected', 'suspended', 'deactivated'].includes(st)) return Response.json({ error: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।', code: 'REJECTED' }, { status: 403 });
      if (!['approved', 'active'].includes(st)) return Response.json({ error: 'আপনার অ্যাকাউন্ট এখনও সক্রিয় নয়। অ্যাডমিনের সাথে যোগাযোগ করুন।', code: 'NOT_ACTIVE' }, { status: 403 });
      if ((user.verificationStatus || '') !== 'VERIFIED') return Response.json({ error: 'আপনার অ্যাকাউন্ট ভেরিফিকেশন সম্পূর্ণ হয়নি। অ্যাডমিনের সাথে যোগাযোগ করুন।', code: 'NOT_VERIFIED' }, { status: 403 });
      if (!user.passwordHash) {
        const msg = user.role === 'Master Super Admin' ? 'এই অ্যাকাউন্টে শুধু "Google দিয়ে লগইন" ব্যবহার করা যাবে।' : 'অ্যাকাউন্টে পাসওয়ার্ড সেট করা হয়নি। অ্যাডমিনের সাথে যোগাযোগ করুন।';
        return Response.json({ error: msg, code: 'NO_PASSWORD' }, { status: 400 });
      }
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date())
        return Response.json({ error: 'অনেকবার ভুল পাসওয়ার্ড দেওয়ায় অ্যাকাউন্ট সাময়িকভাবে লক। কিছুক্ষণ পর আবার চেষ্টা করুন।', code: 'LOCKED' }, { status: 403 });
      const check = await verifyPasswordServer(String(password), user.passwordHash);
      if (!check.ok) {
        const fails = (user.failedLoginCount || 0) + 1;
        const patch = { failedLoginCount: fails };
        if (fails >= 5) { patch.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString(); patch.failedLoginCount = 0; }
        await E.ERPUser.update(user.id, patch);
        return Response.json({ error: 'পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।', code: 'WRONG_PASSWORD' }, { status: 401 });
      }
      const okPatch = {};
      if (check.needsUpgrade) okPatch.passwordHash = await hashPasswordV2(String(password));
      if (user.failedLoginCount || user.lockedUntil) { okPatch.failedLoginCount = 0; okPatch.lockedUntil = ''; }
      if (Object.keys(okPatch).length) await E.ERPUser.update(user.id, okPatch);
      // Device-trust decision (server-side): trusted device → done; otherwise email OTP.
      const devId = String(deviceId || '').trim();
      if (devId) {
        const ex = await E.TrustedDevice.filter({ userId: user.id, deviceId: devId }, { limit: 1 });
        if (ex.items.length) {
          await E.TrustedDevice.update(ex.items[0].id, { lastUsedAt: nowISO() });
          return Response.json({ user: stripUser(user), deviceTrusted: true });
        }
        const count = await E.TrustedDevice.count({ userId: user.id });
        if (count === 0) {
          await E.TrustedDevice.create({ userId: user.id, deviceId: devId, deviceName: deviceName || 'Unknown', trustedAt: nowISO(), lastUsedAt: nowISO() });
          return Response.json({ user: stripUser(user), deviceTrusted: true, firstDevice: true });
        }
      }
      // New device → CSPRNG OTP, hashed + emailed server-side; the browser never sees the code.
      const otpCode = secureOtp();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const codeHash = `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(otpCode, salt, ITERATIONS))}`;
      const challengeId = 'ch_' + secureId();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await E.OtpCode.create({ challengeId, userId: user.id, identifier: user.email, codeHash, purpose: 'LOGIN_DEVICE_VERIFY', integrityTag: await signOtp(challengeId, user.id, 'LOGIN_DEVICE_VERIFY', codeHash), expiresAt, attempts: 0, consumed: false, createdAt: nowISO() });
      let delivered = false;
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({ to: user.email, subject: 'SAN MARINE SURVEY & INSPECTION — লগইন ভেরিফিকেশন কোড', body: `প্রিয় ${user.name},\n\nআপনার লগইন ভেরিফিকেশন কোড: ${otpCode}\nএই কোড ১০ মিনিটের জন্য কার্যকর এবং একবার ব্যবহারযোগ্য।\n\nSAN MARINE SURVEY & INSPECTION` });
        delivered = true;
      } catch (e) { delivered = false; }
      return Response.json({ requiresOtp: true, challengeId, otpSentTo: mask(user.email), delivered, userId: user.id });
    }

    if (action === 'deleteSelf') {
      const session = await base44.auth.me();
      if (!session?.email) return Response.json({ error: 'সেশন পাওয়া যায়নি।' }, { status: 403 });
      const emailLower = session.email.trim().toLowerCase();
      const ex = await E.ERPUser.filter({ email: { $regex: `^${escRx(emailLower)}$`, $options: 'i' } }, { limit: 1 });
      if (!ex.items.length) return Response.json({ error: 'অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 });
      const user = ex.items[0];
      if (user.role === 'Master Super Admin')
        return Response.json({ error: 'Master Super Admin অ্যাকাউন্ট সরিয়ে ফেলা যাবে না।' }, { status: 403 });
      await E.TrustedDevice.deleteMany({ userId: user.id }).catch(() => {});
      await E.OtpCode.deleteMany({ userId: user.id }).catch(() => {});
      await E.AuditLog.create({
        timestamp: nowISO(), userId: user.id, userName: user.name, userEmail: user.email,
        userRole: user.role, action: 'ACCOUNT_SELF_DELETE', recordType: 'ERPUser', recordId: user.id,
        details: 'স্ব-সেবা অ্যাকাউন্ট মুছে ফেলা হয়েছে', success: true,
      }).catch(() => {});
      await E.ERPUser.delete(user.id);
      return Response.json({ ok: true });
    }

    // ── Admin actions: require an approved ERP profile. ──
    const actor = await getActor(base44);
    if (!actor) return Response.json({ error: 'অনুমোদিত ERP প্রোফাইল পাওয়া যায়নি।' }, { status: 403 });
    if (actor.ambiguous) return Response.json({ error: 'একই ইমেইলে একাধিক প্রোফাইল; Admin Review প্রয়োজন।' }, { status: 409 });

    const actorRank = RANK[actor.role] || 0;

    switch (action) {
      case 'list': {
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'স্টাফ তালিকা দেখার অনুমতি নেই।' }, { status: 403 });
        const page = await E.ERPUser.filter({}, { sort: '-created_date', limit: 1000 });
        return Response.json({ users: page.items.map(stripUser) });
      }

      case 'listApprovals': {
        // Approval requests are read with the service role. The entity itself is readable only by the platform
        // "admin" role, so an ERP Admin/Super Admin whose app role is "user" saw an empty approval screen and
        // never received the weight-mismatch requests, even though they were created.
        // ERP Admin and above — plus the platform admin, who could always read these requests — can see the list.
        if (!ADMIN_ROLES.includes(actor.role) && actor._platformRole !== 'admin')
          return Response.json({ error: 'অনুমোদন তালিকা দেখার অনুমতি নেই।' }, { status: 403 });
        const page = await E.ApprovalRequest.filter({}, { sort: '-created_date', limit: 200 });
        return Response.json({ approvals: page.items });
      }

      case 'decideApproval': {
        // The decision is authorised and recorded here, server-side: an ERP Admin whose platform role is not
        // "admin" could not write this record from the browser at all, and the status can never be forged.
        const { approvalId, decision, note } = body;
        if (!['approved', 'rejected'].includes(decision))
          return Response.json({ error: 'অবৈধ সিদ্ধান্ত।' }, { status: 400 });
        const rec = await E.ApprovalRequest.get(approvalId).catch(() => null);
        if (!rec) return Response.json({ error: 'অনুরোধ পাওয়া যায়নি।' }, { status: 404 });
        if (rec.status !== 'pending') return Response.json({ error: 'এই অনুরোধ ইতিমধ্যে নিষ্পত্তি হয়েছে।' }, { status: 409 });
        // A held weight-mismatch entry is decided by an Admin; edit/delete/reopen requests stay Super Admin only.
        const allowed = rec.type === 'WEIGHT_MISMATCH' ? ADMIN_ROLES : SUPER_ROLES;
        const mayDecide = allowed.includes(actor.role) || (rec.type === 'WEIGHT_MISMATCH' && actor._platformRole === 'admin');
        if (!mayDecide)
          return Response.json({ error: rec.type === 'WEIGHT_MISMATCH' ? 'ওজন গড়মিল অনুমোদনের জন্য Admin অনুমতি দরকার।' : 'এই অনুরোধ নিষ্পত্তির জন্য Super Admin অনুমতি দরকার।' }, { status: 403 });
        const updated = await E.ApprovalRequest.update(approvalId, {
          status: decision, reviewedBy: actor.id, reviewedByName: actor.name, reviewedAt: nowISO(), reviewNotes: note || '',
        });
        await logAudit(base44, actor, decision === 'approved' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED', 'ApprovalRequest', approvalId, rec.targetDescription);
        return Response.json({ approval: updated });
      }

      case 'updateRole': {
        if (!SUPER_ROLES.includes(actor.role))
          return Response.json({ error: 'রোল পরিবর্তনের অনুমতি নেই।' }, { status: 403 });
        const { targetId, newRole } = body;
        if (!RANK[newRole]) return Response.json({ error: 'অবৈধ রোল।' }, { status: 400 });
        if (targetId === actor.id) return Response.json({ error: 'নিজের রোল পরিবর্তন করা যাবে না।' }, { status: 400 });
        const target = await E.ERPUser.get(targetId).catch(() => null);
        if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
        if (target.role === 'Master Super Admin' && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'শুধু Master Super Admin এই অ্যাকাউন্ট পরিবর্তন করতে পারে।' }, { status: 403 });
        if (newRole === 'Master Super Admin' && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'শুধু Master Super Admin নতুন Master Super Admin তৈরি করতে পারে।' }, { status: 403 });
        if (RANK[newRole] >= actorRank && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'আপনার রোলের সমান বা উচ্চতর রোল দেওয়ার অনুমতি নেই।' }, { status: 403 });
        const oldRole = target.role;
        const updated = await E.ERPUser.update(targetId, { role: newRole });
        await logAudit(base44, actor, 'ROLE_CHANGE', 'ERPUser', targetId,
          `${target.name}: ${oldRole} → ${newRole}`, { role: oldRole }, { role: newRole });
        return Response.json({ user: stripUser(updated) });
      }

      case 'updateStatus': {
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'স্ট্যাটাস পরিবর্তনের অনুমতি নেই।' }, { status: 403 });
        const { targetId, status, rejectionReason } = body;
        if (targetId === actor.id) return Response.json({ error: 'নিজের স্ট্যাটাস পরিবর্তন করা যাবে না।' }, { status: 400 });
        const target = await E.ERPUser.get(targetId).catch(() => null);
        if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
        if (target.role === 'Super Admin' && !SUPER_ROLES.includes(actor.role))
          return Response.json({ error: 'Super Admin অ্যাকাউন্ট পরিবর্তন করতে Super Admin প্রয়োজন।' }, { status: 403 });
        if (target.role === 'Master Super Admin' && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'Master Super Admin অ্যাকাউন্ট পরিবর্তন করা যাবে না।' }, { status: 403 });
        if (RANK[target.role] >= actorRank && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'আপনার রোলের সমান বা উচ্চতর রোলের ইউজারের স্ট্যাটাস পরিবর্তনের অনুমতি নেই।' }, { status: 403 });
        if (!ALLOWED_USER_STATUSES.includes(status))
          return Response.json({ error: 'অবৈধ স্ট্যাটাস।' }, { status: 400 });
        const patch = { status };
        if (status === 'approved') {
          patch.approvedBy = actor.id; patch.approvedByName = actor.name;
          patch.approvedAt = nowISO(); patch.verificationStatus = 'VERIFIED';
        }
        if (status === 'rejected') {
          patch.rejectedBy = actor.id; patch.rejectedByName = actor.name;
          patch.rejectedAt = nowISO();
          if (rejectionReason) patch.rejectionReason = rejectionReason;
        }
        const oldStatus = target.status;
        const updated = await E.ERPUser.update(targetId, patch);
        await logAudit(base44, actor,
          status === 'approved' ? 'APPROVE' : status === 'rejected' ? 'REJECT' : 'STATUS_CHANGE',
          'ERPUser', targetId, `${target.name}: ${oldStatus} → ${status}`,
          { status: oldStatus }, { status });
        return Response.json({ user: stripUser(updated) });
      }

      case 'delete': {
        if (!SUPER_ROLES.includes(actor.role))
          return Response.json({ error: 'ইউজার মুছতে শুধু Super Admin পারেন।' }, { status: 403 });
        const { targetId, reason } = body;
        if (targetId === actor.id) return Response.json({ error: 'নিজের অ্যাকাউন্ট মুছা যাবে না।' }, { status: 400 });
        const target = await E.ERPUser.get(targetId).catch(() => null);
        if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
        if (target.role === 'Master Super Admin')
          return Response.json({ error: 'Master Super Admin অ্যাকাউন্ট মুছা যাবে না।' }, { status: 403 });
        const snapshot = stripUser(target);
        await E.ERPUser.delete(targetId);
        await logAudit(base44, actor, 'DELETE', 'ERPUser', targetId,
          `${target.name} (${target.email || target.employeeId || ''}) মোছা হয়েছে${reason ? ': ' + reason : ''}`,
          snapshot, null);
        return Response.json({ ok: true });
      }

      case 'create': {
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'ইউজার তৈরির অনুমতি নেই।' }, { status: 403 });
        const { name, email, mobile, employeeId, role, passwordHash, designation } = body;
        if (!name?.trim()) return Response.json({ error: 'নাম আবশ্যক।' }, { status: 400 });
        if (!email && !mobile) return Response.json({ error: 'ইমেইল অথবা মোবাইল আবশ্যক।' }, { status: 400 });
        if (!passwordHash) return Response.json({ error: 'পাসওয়ার্ড হ্যাশ পাওয়া যায়নি।' }, { status: 400 });
        if (!validatePasswordHash(passwordHash)) return Response.json({ error: 'পাসওয়ার্ড হ্যাশ সঠিক নয়।' }, { status: 400 });
        const targetRole = role || 'Staff';
        if (!RANK[targetRole]) return Response.json({ error: 'অবৈধ রোল।' }, { status: 400 });
        if (RANK[targetRole] >= actorRank && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'আপনার রোলের সমান বা উচ্চতর রোল দেওয়ার অনুমতি নেই।' }, { status: 403 });
        const emailLower = (email || '').trim().toLowerCase();
        if (emailLower) {
          const holder = await findEmailHolder(E, emailLower);
          if (holder) return Response.json({ error: `এই ইমেইল (${holder.name}) দিয়ে ইতিমধ্যে অ্যাকাউন্ট রয়েছে — একই ইমেইলে দুটি স্টাফ আইডি হতে পারে না।` }, { status: 400 });
        }
        if (mobile) {
          const ex = await E.ERPUser.filter({ mobile }, { limit: 1 });
          if (ex.items.length) return Response.json({ error: 'এই মোবাইল দিয়ে অ্যাকাউন্ট রয়েছে।' }, { status: 400 });
        }
        let empId = (employeeId || '').trim().toUpperCase() || undefined;
        if (empId) {
          const ex = await E.ERPUser.filter({ employeeId: empId }, { limit: 1 });
          if (ex.items.length) return Response.json({ error: 'এই স্টাফ আইডি ব্যবহৃত হয়েছে।' }, { status: 400 });
        } else {
          const count = await E.ERPUser.count({});
          for (let i = 0; i < 50; i++) {
            const c = 'STAFF-' + String(1000 + count + i);
            const ex = await E.ERPUser.filter({ employeeId: c }, { limit: 1 });
            if (!ex.items.length) { empId = c; break; }
          }
          if (!empId) empId = 'STAFF-' + Date.now();
        }
        const user = await E.ERPUser.create({
          name: name.trim(), mobile: (mobile || '').trim(), email: emailLower || undefined,
          employeeId: empId, designation: designation || '', role: targetRole,
          status: 'approved', verificationStatus: 'VERIFIED',
          passwordHash, requestDateTime: nowISO(),
          approvedByName: actor.name, approvedAt: nowISO(),
        });
        await logAudit(base44, actor, 'CREATE', 'ERPUser', user.id,
          `নতুন ইউজার: ${user.name} (${targetRole})`, null,
          { name: user.name, role: targetRole, email: emailLower, employeeId: empId });
        return Response.json({ user: stripUser(user) });
      }

      case 'resetPassword': {
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'পাসওয়ার্ড রিসেটের অনুমতি নেই।' }, { status: 403 });
        const { targetId, passwordHash } = body;
        if (!passwordHash)
          return Response.json({ error: 'পাসওয়ার্ড হ্যাশ পাওয়া যায়নি।' }, { status: 400 });
        if (!validatePasswordHash(passwordHash))
          return Response.json({ error: 'পাসওয়ার্ড হ্যাশ সঠিক নয়।' }, { status: 400 });
        const target = await E.ERPUser.get(targetId).catch(() => null);
        if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
        if (target.role === 'Master Super Admin' && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'Master Super Admin-এর পাসওয়ার্ড শুধু Master Super Admin রিসেট করতে পারেন।' }, { status: 403 });
        if (target.role === 'Master Super Admin' && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'Master Super Admin অ্যাকাউন্ট পরিবর্তন করা যাবে না।' }, { status: 403 });
        if (target.role === 'Super Admin' && !SUPER_ROLES.includes(actor.role))
          return Response.json({ error: 'Super Admin অ্যাকাউন্ট পরিবর্তন করতে Super Admin প্রয়োজন।' }, { status: 403 });
        if (RANK[target.role] >= actorRank && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'আপনার রোলের সমান বা উচ্চতর রোলের ইউজারের পাসওয়ার্ড রিসেটের অনুমতি নেই।' }, { status: 403 });
        await E.ERPUser.update(targetId, { passwordHash, failedLoginCount: 0, lockedUntil: '' });
        await logAudit(base44, actor, 'PASSWORD_RESET', 'ERPUser', targetId,
          `${target.name}-এর পাসওয়ার্ড রিসেট হয়েছে`, null, null);
        return Response.json({ ok: true });
      }

      case 'approveJoin': {
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'অনুমোদনের অনুমতি নেই।' }, { status: 403 });
        const { targetId, role, employeeId, employeeType } = body;
        const target = await E.ERPUser.get(targetId).catch(() => null);
        if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
        // Already decided (a second tap, or the list had not refreshed yet). Return the record as a success
        // instead of an error, so a repeated tap never looks like a failed approval.
        if ((target.status || '').toLowerCase() !== 'pending')
          return Response.json({ user: stripUser(target), alreadyDecided: true });
        const targetRole = role || target.role || 'Staff';
        if (!RANK[targetRole]) return Response.json({ error: 'অবৈধ রোল।' }, { status: 400 });
        if (RANK[targetRole] >= actorRank && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'আপনার রোলের সমান বা উচ্চতর রোল দেওয়ার অনুমতি নেই।' }, { status: 403 });
        const patch = {
          status: 'approved', verificationStatus: 'VERIFIED',
          approvedBy: actor.id, approvedByName: actor.name, approvedAt: nowISO(),
          idReviewedByName: actor.name, idReviewedAt: nowISO(),
        };
        if (role) patch.role = role;
        if (employeeId?.trim()) {
          const empId = employeeId.trim().toUpperCase();
          const ex = await E.ERPUser.filter({ employeeId: empId }, { limit: 1 });
          if (ex.items.length && ex.items[0].id !== targetId)
            return Response.json({ error: 'এই স্টাফ আইডি ব্যবহৃত হয়েছে।' }, { status: 400 });
          patch.employeeId = empId;
          patch.idStatus = 'ASSIGNED';
        } else if (employeeType === 'Permanent Staff' || target.employeeType === 'Permanent Staff') {
          // Permanent Staff may be approved without an official Employee ID.
          patch.idStatus = 'PERMANENT_NO_ID';
          if (employeeType) patch.employeeType = employeeType;
        } else {
          if (!target.employeeId) return Response.json({ error: 'অনুমোদনের আগে স্টাফ আইডি দিন অথবা Permanent Staff হিসেবে অনুমোদন করুন।' }, { status: 400 });
          patch.idStatus = 'VERIFIED';
        }
        if (employeeType && !patch.employeeType) patch.employeeType = employeeType;
        const oldValues = { status: target.status, role: target.role, idStatus: target.idStatus };
        const updated = await E.ERPUser.update(targetId, patch);
        await logAudit(base44, actor, 'APPROVE', 'ERPUser', targetId,
          `${target.name}: পদ ${target.requestedRole || 'Staff'} → ${patch.role || target.role}`,
          oldValues, { status: 'approved', role: patch.role || target.role });
        return Response.json({ user: stripUser(updated) });
      }

      case 'loginUpdate': {
        // Self-only password update. Lockout counters (failedLoginCount/lockedUntil) are server-only
        // (managed by loginWithPassword); passwordHash is validated against the PBKDF2 scheme.
        const { targetId, patch } = body;
        if (!targetId) return Response.json({ error: 'Target ID আবশ্যক।' }, { status: 400 });
        const target = await E.ERPUser.get(targetId).catch(() => null);
        if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
        if ((target.email || '').toLowerCase() !== actor._platformEmail)
          return Response.json({ error: 'শুধু নিজের লগইন তথ্য পরিবর্তন করা যায়।' }, { status: 403 });
        const safePatch = {};
        if ('passwordHash' in patch) {
          if (!validatePasswordHash(patch.passwordHash))
            return Response.json({ error: 'পাসওয়ার্ড হ্যাশ সঠিক নয়।' }, { status: 400 });
          safePatch.passwordHash = patch.passwordHash;
        }
        if (Object.keys(safePatch).length === 0)
          return Response.json({ error: 'কোনো পরিবর্তন নেই।' }, { status: 400 });
        const updated = await E.ERPUser.update(targetId, safePatch);
        await logAudit(base44, actor, 'PASSWORD_SELF_UPDATE', 'ERPUser', targetId,
          `${target.name}-এর পাসওয়ার্ড পরিবর্তন করা হয়েছে`);
        return Response.json({ user: stripUser(updated) });
      }

      case 'editStaff': {
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'স্টাফ পরিবর্তনের অনুমতি নেই।' }, { status: 403 });
        const { targetId, name, email, mobile, employeeId, designation, department, joiningDate, employeeType, role } = body;
        if (!targetId) return Response.json({ error: 'Target ID আবশ্যক।' }, { status: 400 });
        if (targetId === actor.id) return Response.json({ error: 'নিজের অ্যাকাউন্ট এখানে পরিবর্তন করা যায় না।' }, { status: 400 });
        const target = await E.ERPUser.get(targetId).catch(() => null);
        if (!target) return Response.json({ error: 'ইউজার পাওয়া যায়নি।' }, { status: 404 });
        if (target.role === 'Master Super Admin' && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'Master Super Admin অ্যাকাউন্ট পরিবর্তন করা যাবে না।' }, { status: 403 });
        // Identity fields (email/mobile/employeeId) are the login-redirect vector: a lower-tier admin must not
        // retarget a higher-tier account's recovery identity. Apply the same rank hierarchy as role changes.
        const identityChange = email !== undefined || mobile !== undefined || employeeId !== undefined;
        if (identityChange && RANK[target.role] >= actorRank && actor.role !== 'Master Super Admin')
          return Response.json({ error: 'আপনার রোলের সমান বা উচ্চতর রোলের ইউজারের পরিচয় (ইমেইল/মোবাইল/আইডি) পরিবর্তনের অনুমতি নেই।' }, { status: 403 });
        const patch = {};
        if (name?.trim()) patch.name = name.trim();
        if (mobile !== undefined) patch.mobile = (mobile || '').trim();
        if (designation !== undefined) patch.designation = designation || '';
        if (department !== undefined) patch.department = department || '';
        if (joiningDate !== undefined) patch.joiningDate = joiningDate || '';
        if (employeeType && ['Staff', 'Supervisor', 'Admin', 'Permanent Staff'].includes(employeeType)) patch.employeeType = employeeType;
        if (email !== undefined) {
          const emailLower = (email || '').trim().toLowerCase();
          if (emailLower && emailLower !== (target.email || '').toLowerCase()) {
            const holder = await findEmailHolder(E, emailLower, targetId);
            if (holder)
              return Response.json({ error: `এই ইমেইল (${holder.name}) অন্য অ্যাকাউন্টে ব্যবহৃত হচ্ছে — একই ইমেইলে দুটি স্টাফ আইডি হতে পারে না।` }, { status: 400 });
            patch.email = emailLower;
          }
        }
        if (employeeId !== undefined) {
          const empId = (employeeId || '').trim().toUpperCase() || '';
          if (empId && empId !== (target.employeeId || '').toUpperCase()) {
            const ex = await E.ERPUser.filter({ employeeId: empId }, { limit: 1 });
            if (ex.items.length && ex.items[0].id !== targetId)
              return Response.json({ error: 'এই স্টাফ আইডি অন্য অ্যাকাউন্টে ব্যবহৃত হচ্ছে।' }, { status: 400 });
            patch.employeeId = empId;
            if (empId) patch.idStatus = target.idStatus === 'PERMANENT_NO_ID' ? 'ASSIGNED' : (target.idStatus || 'ASSIGNED');
          } else if (empId === '' && employeeType === 'Permanent Staff') {
            patch.employeeId = '';
            patch.idStatus = 'PERMANENT_NO_ID';
          }
        }
        if (role && RANK[role]) {
          if (RANK[role] >= actorRank && actor.role !== 'Master Super Admin')
            return Response.json({ error: 'আপনার রোলের সমান বা উচ্চতর রোল দেওয়ার অনুমতি নেই।' }, { status: 403 });
          if (target.role === 'Master Super Admin' && actor.role !== 'Master Super Admin')
            return Response.json({ error: 'Master Super Admin অ্যাকাউন্ট পরিবর্তন করা যাবে না।' }, { status: 403 });
          if (target.role === 'Super Admin' && !SUPER_ROLES.includes(actor.role))
            return Response.json({ error: 'Super Admin অ্যাকাউন্ট পরিবর্তন করতে Super Admin প্রয়োজন।' }, { status: 403 });
          patch.role = role;
        }
        if (Object.keys(patch).length === 0) return Response.json({ error: 'কোনো পরিবর্তন নেই।' }, { status: 400 });
        const before = { name: target.name, email: target.email, mobile: target.mobile, employeeId: target.employeeId, designation: target.designation, department: target.department, joiningDate: target.joiningDate, employeeType: target.employeeType, role: target.role };
        const updated = await E.ERPUser.update(targetId, patch);
        await logAudit(base44, actor, 'STAFF_EDITED', 'ERPUser', targetId,
          `${target.name}-এর তথ্য পরিবর্তন করা হয়েছে`, before, patch);
        return Response.json({ user: stripUser(updated) });
      }

      case 'updateSettings': {
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'সেটিংস পরিবর্তনের অনুমতি নেই।' }, { status: 403 });
        const { companyName, reportHeader, oldEmptyWeightHours, minTripGapMinutes, pendingEmptyAlertHours } = body;
        if (!companyName?.trim()) return Response.json({ error: 'কোম্পানির নাম আবশ্যক।' }, { status: 400 });
        const list = await E.Setting.filter({}, { limit: 1 });
        const settings = list.items[0];
        if (!settings) return Response.json({ error: 'সেটিংস রেকর্ড পাওয়া যায়নি।' }, { status: 404 });
        const patch = {
          companyName: companyName.trim(),
          reportHeader: (reportHeader || '').trim(),
          oldEmptyWeightHours: Number(oldEmptyWeightHours) || 24,
          minTripGapMinutes: Number(minTripGapMinutes) >= 0 ? Number(minTripGapMinutes) : 60,
          pendingEmptyAlertHours: Number(pendingEmptyAlertHours) || 12,
        };
        const before = { companyName: settings.companyName, reportHeader: settings.reportHeader, oldEmptyWeightHours: settings.oldEmptyWeightHours, minTripGapMinutes: settings.minTripGapMinutes, pendingEmptyAlertHours: settings.pendingEmptyAlertHours };
        const updated = await E.Setting.update(settings.id, patch);
        await logAudit(base44, actor, 'SETTINGS_UPDATED', 'Setting', settings.id,
          'সিস্টেম সেটিংস পরিবর্তন করা হয়েছে', before, patch);
        return Response.json({ settings: updated });
      }

      case 'duplicateAudit': {
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'ডুপ্লিকেট অডিটের অনুমতি নেই।' }, { status: 403 });
        const page = await E.ERPUser.filter({}, { sort: '-created_date', limit: 1000, fields: ['id', 'name', 'email', 'mobile', 'employeeId', 'role', 'status', 'verificationStatus', 'idStatus', 'employeeType', 'created_date'] });
        const rows = page.items;
        const byEmail = {}, byMobile = {}, byEmpId = {};
        for (const r of rows) {
          const mailKey = canonicalEmail(r.email);
          if (mailKey) { (byEmail[mailKey] ||= []).push(r); }
          if (r.mobile) { (byMobile[r.mobile] ||= []).push(r); }
          if (r.employeeId) { (byEmpId[r.employeeId] ||= []).push(r); }
        }
        const dupEmails = Object.entries(byEmail).filter(([k, v]) => v.length > 1).map(([k, v]) => ({ key: k, count: v.length, records: v }));
        const dupMobiles = Object.entries(byMobile).filter(([k, v]) => v.length > 1).map(([k, v]) => ({ key: k, count: v.length, records: v }));
        const dupEmpIds = Object.entries(byEmpId).filter(([k, v]) => v.length > 1).map(([k, v]) => ({ key: k, count: v.length, records: v }));
        return Response.json({ total: rows.length, duplicateEmails: dupEmails, duplicateMobiles: dupMobiles, duplicateEmployeeIds: dupEmpIds });
      }

      case 'dedupeAccounts': {
        // Cleans up the extra IDs that share one email but never recorded any work. The ID that holds the
        // entries is kept; an ID that does have entries is never removed — it is reported for a manual call.
        if (!SUPER_ROLES.includes(actor.role))
          return Response.json({ error: 'ডুপ্লিকেট অ্যাকাউন্ট মুছতে Super Admin অনুমতি দরকার।' }, { status: 403 });
        const page = await E.ERPUser.filter({}, { sort: 'created_date', limit: 1000 });
        const groups = new Map();
        for (const u of page.items) {
          const key = canonicalEmail(u.email);
          if (!key) continue;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(u);
        }
        const entryUse = async (u) => {
          const [loads, empties] = await Promise.all([
            E.TruckEntry.count({ createdBy: u.id }).catch(() => 0),
            E.EmptyWeight.count({ enteredById: u.id }).catch(() => 0),
          ]);
          const own = loads + empties;
          let viaId = 0;
          const emp = String(u.employeeId || '').trim();
          // Nothing is deleted while records still carry this person's staff ID, even if they were saved
          // before the account IDs existed — an admin decides those by hand.
          if (own === 0 && emp) {
            const [l2, e2] = await Promise.all([
              E.TruckEntry.count({ employeeId: emp }).catch(() => 0),
              E.EmptyWeight.count({ employeeId: emp }).catch(() => 0),
            ]);
            viaId = l2 + e2;
          }
          return { own, viaId };
        };
        const deleted = [], kept = [], skipped = [];
        let dupGroups = 0;
        for (const [email, list] of groups) {
          if (list.length < 2) continue;
          dupGroups += 1;
          const rows = [];
          for (const u of list) rows.push({ u, ...(await entryUse(u)) });
          // Keep the record that actually holds the work. Ties go to the account that can sign in (VERIFIED),
          // then to a usable English staff ID, then to the higher role, and finally to the oldest record.
          const asciiId = (u) => (/^[\x20-\x7E]+$/.test(String(u.employeeId || '').trim()) ? 1 : 0);
          rows.sort((a, b) => (b.own - a.own)
            || (b.viaId - a.viaId)
            || (Number(b.u.verificationStatus === 'VERIFIED') - Number(a.u.verificationStatus === 'VERIFIED'))
            || (asciiId(b.u) - asciiId(a.u))
            || ((RANK[b.u.role] || 0) - (RANK[a.u.role] || 0))
            || String(a.u.created_date || '').localeCompare(String(b.u.created_date || '')));
          const primary = rows[0];
          const primaryEmp = String(primary.u.employeeId || '').trim();
          kept.push({ id: primary.u.id, name: primary.u.name, employeeId: primaryEmp, entries: primary.own });
          for (const row of rows.slice(1)) {
            if (row.u.role === 'Master Super Admin') { skipped.push({ name: row.u.name, email, reason: 'Master Super Admin' }); continue; }
            // Records saved under this staff ID are not lost when the kept record carries the same ID.
            const sharedEmp = String(row.u.employeeId || '').trim() !== '' && String(row.u.employeeId || '').trim() === primaryEmp;
            if (row.own > 0 || (row.viaId > 0 && !sharedEmp)) { skipped.push({ name: row.u.name, email, employeeId: row.u.employeeId || '', entries: row.own + row.viaId, reason: 'এন্ট্রি আছে' }); continue; }
            const snapshot = { name: row.u.name, email, employeeId: row.u.employeeId || '', role: row.u.role, status: row.u.status || '' };
            await E.TrustedDevice.deleteMany({ userId: row.u.id }).catch(() => {});
            await E.OtpCode.deleteMany({ userId: row.u.id }).catch(() => {});
            await E.ERPUser.delete(row.u.id);
            await logAudit(base44, actor, 'DUPLICATE_ACCOUNT_DELETED', 'ERPUser', row.u.id,
              `${row.u.name} (${email}) — একই ইমেইলের ডুপ্লিকেট, কোনো এন্ট্রি নেই; রাখা হয়েছে: ${primary.u.name}`, snapshot, null);
            deleted.push(snapshot);
          }
        }
        return Response.json({ duplicateGroups: dupGroups, deleted, kept, skipped });
      }

      case 'auditList': {
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'অডিট লগ দেখার অনুমতি নেই।' }, { status: 403 });
        const { search, cursor, limit } = body;
        const term = (search || '').trim();
        const rx = { $regex: escRx(term), $options: 'i' };
        const q = term ? { $or: [{ userName: rx }, { action: rx }, { details: rx }, { userEmail: rx }, { recordType: rx }] } : {};
        const page = await E.AuditLog.filter(q, {
          sort: '-created_date', limit: limit || 40, cursor: cursor || undefined,
        });
        return Response.json({
          items: page.items,
          nextCursor: page.has_more ? page.next_cursor : null,
          hasMore: !!page.has_more,
        });
      }

      case 'saveMaster': {
        // Add or edit master data. Runs as service role so platform RLS (admin-only create) doesn't block
        // ERP Staff/Supervisor. ERP role + exact-duplicate name enforced here.
        const { kind, id, data } = body;
        const cfg = MASTER_MAP[kind];
        if (!cfg) return Response.json({ error: 'অবৈধ ধরন।' }, { status: 400 });
        if (!id && !MASTER_ADD_ROLES.includes(actor.role))
          return Response.json({ error: 'নতুন তথ্য যোগ করার অনুমতি নেই।' }, { status: 403 });
        if (id && !ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'সম্পাদনা করতে অ্যাডমিন অনুমতি দরকার।' }, { status: 403 });
        const name = String(data?.[cfg.nameField] || '').trim();
        if (!name) return Response.json({ error: 'নাম আবশ্যক।' }, { status: 400 });
        // Duplicate check: exact normalized name within same company (where scoped). Excludes self on edit.
        const all = await readAllMaster(E[cfg.entity]);
        const want = normName(name);
        const dup = all.find((x) => x.id !== id && (!cfg.companyScoped || (x.company || '') === (data.company || '')) && normName(x[cfg.nameField]) === want);
        if (dup) return Response.json({ error: `"${name}" আগে থেকেই আছে (${cfg.label})। ডুপ্লিকেট এন্ট্রি হতে পারবে না।`, duplicate: { id: dup.id, name: dup[cfg.nameField] } }, { status: 409 });
        // Build payload from an explicit allowlist — never spread the raw client object (mass assignment).
        const payload = {};
        for (const f of MASTER_FIELDS[kind]) if (data && f in data) payload[f] = data[f];
        payload[cfg.nameField] = (kind === 'ghats' || kind === 'scales') ? name.toUpperCase() : name;
        if (kind === 'lighters' && payload.motherVesselId) {
          const vessel = await E.MotherVessel.get(payload.motherVesselId).catch(() => null);
          if (vessel) payload.company = vessel.company;
          if (payload.consigneeId) { const c = await E.Consignee.get(payload.consigneeId).catch(() => null); if (c) payload.consigneeName = c.name; }
        }
        const result = id ? await E[cfg.entity].update(id, payload) : await E[cfg.entity].create(payload);
        await logAudit(base44, actor, id ? 'MASTER_UPDATED' : 'MASTER_CREATED', cfg.entity, id || result.id, name);
        return Response.json({ ok: true, record: result });
      }

      case 'deleteMaster': {
        const { kind, id } = body;
        const cfg = MASTER_MAP[kind];
        if (!cfg) return Response.json({ error: 'অবৈধ ধরন।' }, { status: 400 });
        if (!ADMIN_ROLES.includes(actor.role))
          return Response.json({ error: 'মুছতে অ্যাডমিন অনুমতি দরকার।' }, { status: 403 });
        const rec = await E[cfg.entity].get(id).catch(() => null);
        if (!rec) return Response.json({ error: 'রেকর্ড পাওয়া যায়নি।' }, { status: 404 });
        if (kind === 'vessels') {
          const linked = await E.LighterVessel.filter({ motherVesselId: id }, { limit: 1 });
          if (linked.items.length) return Response.json({ error: 'এই ভেসেলের অধীনে লাইটার আছে — আগে লাইটার মুছুন।' }, { status: 409 });
        }
        if (kind === 'consignees') {
          const linked = await E.LighterVessel.filter({ consigneeId: id }, { limit: 1 });
          if (linked.items.length) return Response.json({ error: 'এই আমদানিকারকের লাইটার আছে — আগে লাইটার থেকে সরান।' }, { status: 409 });
        }
        if (kind === 'lighters') {
          const [loads, closings] = await Promise.all([
            E.TruckEntry.filter({ lighterVesselId: id }, { limit: 1 }),
            E.VesselClosing.filter({ lighterVesselId: id }, { limit: 1 }),
          ]);
          if (loads.items.length || closings.items.length) return Response.json({ error: 'এই লাইটারের এন্ট্রি/ক্লোজিং আছে — মুছা যাবে না।' }, { status: 409 });
        }
        await E[cfg.entity].delete(id);
        await logAudit(base44, actor, 'MASTER_DELETED', cfg.entity, id, rec[cfg.nameField], rec);
        return Response.json({ ok: true });
      }

      case 'matchMasters': {
        // Fuzzy match for the "new" form: returns existing names close to the typed value so the user
        // picks the existing one instead of creating a duplicate from a spelling mistake.
        const { kind, name, company } = body;
        const cfg = MASTER_MAP[kind];
        if (!cfg) return Response.json({ matches: [] });
        const q = normName(name || '');
        if (q.length < 2) return Response.json({ matches: [] });
        const all = await readAllMaster(E[cfg.entity]);
        const matches = all
          .filter((x) => !cfg.companyScoped || !company || (x.company || '') === company)
          .map((x) => {
            const xn = normName(x[cfg.nameField]);
            return { id: x.id, name: x[cfg.nameField], company: x.company, score: similarity(q, xn), exact: xn === q, partial: xn.includes(q) || q.includes(xn) };
          })
          .filter((m) => m.exact || m.partial || m.score >= 0.6)
          .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score)
          .slice(0, 6);
        return Response.json({ matches });
      }

      default:
        return Response.json({ error: 'অজানা অ্যাকশন।' }, { status: 400 });
    }
  } catch (error) {
    const status = error.status || error.response?.status || 500;
    return Response.json({ error: error.message || 'সার্ভার ত্রুটি।' }, { status });
  }
}