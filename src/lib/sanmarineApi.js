// San Marine ERP data-access layer (database, authentication and business rules).
import { base44 } from '@/api/base44Client';
import { hashPasswordV2 } from '@/lib/sanmarineCrypto';
import { ROLE_SETS } from '@/lib/erpRoles';
import { runLimited, dedupe, withRetry } from '@/lib/sanmarineNet';
import companyDashboard from '@/components/sanmarine/company/companyDashboard';
import { getCompanyScope, andQuery } from '@/components/sanmarine/company/companyScope';

const nowISO = () => new Date().toISOString();
// Local calendar date (not UTC) so night-shift entries after midnight get the right day.
const pad2 = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const timeStr = () => new Date().toTimeString().slice(0, 5);
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// The reserved Master Super Admin identity is decided by ROLE in the database — never by a hardcoded address.

async function all(entity, query = {}, sort = '-created_date', limit = 1000, maxPages = 5) {
  const items = [];
  let cursor = undefined;
  let hasMore = true;
  let pages = 0;
  while (hasMore && pages < maxPages) {
    const page = await withRetry(() => entity.filter(query, { sort, limit, cursor }), { tries: 4, base: 1500, timeoutMs: 20000, label: 'all-page' });
    if (page && Array.isArray(page.items)) items.push(...page.items);
    hasMore = page && page.has_more;
    cursor = page && page.next_cursor;
    pages += 1;
    if (!cursor) break;
  }
  return items;
}

function stripUser(u) {
  if (!u) return u;
  const { passwordHash, trustedDevices, ...rest } = u;
  return rest;
}

// A backend rejection carries the real reason in its response body. Show that text instead of the raw HTTP
// status line ("Request failed with status code 400"), which told the user nothing about what went wrong.
export const erpError = (e) => {
  const d = (e && (e.data || (e.response && e.response.data))) || {};
  return Object.assign(new Error(d.error || (e && e.message) || 'কাজ ব্যর্থ।'), { code: d.code, status: (e && e.status) || (e && e.response && e.response.status) });
};

// Server-side role hierarchy for user-management actions. The actor's role is always re-read from
// the database (never trusted from the client). Nobody can act on themselves or on a role at or
// above their own level; only Master Super Admin can touch Master Super Admin accounts.
const RANK = { 'Master Super Admin': 6, 'Super Admin': 5, 'Admin': 4, 'Operations Admin': 3, 'Supervisor': 2, 'Staff': 1 };
async function assertUserAction(actor, targetId, { newRole } = {}) {
  if (!actor || !actor.id) throw new Error('সেশন বৈধ নয়। আবার লগইন করুন।');
  const session = await base44.auth.me();
  if (session.role !== 'admin') throw new Error('ইউজার পরিবর্তনের আগে অ্যাপের Admin অনুমতি দরকার; বিদ্যমান role বা profile পরিবর্তিত হয়নি।');
  const me = await base44.entities.ERPUser.get(actor.id).catch(() => null);
  if (me && (me.email || '').trim().toLowerCase() !== session.email.trim().toLowerCase()) throw new Error('পরিচয় যাচাই করা অ্যাকাউন্টের নিজের Admin profile ব্যবহার করুন।');
  if (!me || !['approved', 'active'].includes((me.status || '').toLowerCase())) throw new Error('আপনার অ্যাকাউন্ট আর সক্রিয় নয়।');
  if (!ROLE_SETS.ADMIN.includes(me.role)) throw new Error('ইউজার ম্যানেজমেন্টের অনুমতি শুধু Admin ও তার উপরের রোলের।');
  if (targetId && targetId === me.id) throw new Error('নিজের অ্যাকাউন্টে এই পরিবর্তন করা যাবে না।');
  let target = null;
  if (targetId) {
    target = await base44.entities.ERPUser.get(targetId).catch(() => null);
    if (!target) throw new Error('ইউজার পাওয়া যায়নি।');
    if (target.role === 'Master Super Admin') throw new Error('এই Master Super Admin অ্যাকাউন্ট কেউ পরিবর্তন, স্থগিত বা মুছতে পারবে না।');
  }
  const aRank = RANK[me.role] || 0;
  const tRank = target ? (RANK[target.role] || 0) : 0;
  if (target) {
    if (target.role === 'Master Super Admin' && me.role !== 'Master Super Admin') throw new Error('শুধু Master Super Admin এই অ্যাকাউন্ট পরিবর্তন করতে পারে।');
    if (target.role === 'Super Admin' && aRank < RANK['Super Admin']) throw new Error('শুধু Master Super Admin/Super Admin এই অ্যাকাউন্ট পরিবর্তন করতে পারে।');
    if (tRank >= aRank && me.role !== 'Master Super Admin') throw new Error('আপনার রোলের সমান বা উচ্চতর রোলের ইউজার পরিবর্তন করার অনুমতি নেই।');
  }
  if (newRole) {
    if (!RANK[newRole]) throw new Error('অবৈধ রোল।');
    if (newRole === 'Master Super Admin' && me.role !== 'Master Super Admin') throw new Error('শুধু Master Super Admin নতুন Master Super Admin তৈরি করতে পারে।');
    if (newRole === 'Super Admin' && aRank < RANK['Super Admin']) throw new Error('শুধু Master Super Admin/Super Admin নতুন Super Admin তৈরি করতে পারে।');
    if (RANK[newRole] >= aRank && me.role !== 'Master Super Admin') throw new Error('আপনার রোলের সমান বা উচ্চতর রোল দেওয়ার অনুমতি নেই।');
  }
  return { me, target };
}
function maskEmail(e) { if (!e) return ''; const [a, b] = e.split('@'); return (a ? a.slice(0, 2) : '') + '***@' + (b || ''); }
function maskMobile(m) { if (!m) return ''; return m.slice(0, 3) + '***' + m.slice(-2); }

// Account lookups are server-side queries (never "load every user and search in memory"), so the number of
// accounts can grow without limit and logins/registrations stay a handful of cheap calls.
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function findOne(query) {
  const p = await base44.entities.ERPUser.filter(query, { limit: 1 });
  return (p.items && p.items[0]) || null;
}
async function findByEmail(email) {
  const e = (email || '').trim();
  if (!e) return null;
  return (await findOne({ email: e.toLowerCase() })) || (await findOne({ email: { $regex: `^${escRx(e)}$`, $options: 'i' } }));
}
// email → staff ID → mobile, in that priority, so one person's staff ID/mobile can never shadow another's email.
async function findByIdentifier(identifier) {
  const raw = (identifier || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const byMail = await findByEmail(raw);
    if (byMail) return byMail;
  }
  return (await findOne({ employeeId: raw.toUpperCase() }))
    || (await findOne({ employeeId: raw }))
    || (await findOne({ employeeId: { $regex: `^${escRx(raw)}$`, $options: 'i' } }))
    || (await findOne({ mobile: raw }));
}
async function assertIdentityFree({ email, mobile, employeeId }) {
  if (email) {
    // No reserved address is hardcoded: an existing account already blocks re-use of its email.
    if (await findByEmail(email)) throw new Error('এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট রয়েছে।');
  }
  if (mobile && (await findOne({ mobile }))) throw new Error('এই মোবাইল নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট রয়েছে।');
  if (employeeId && (await findOne({ employeeId }))) throw new Error('এই স্টাফ আইডি ইতিমধ্যে ব্যবহৃত হয়েছে।');
}
async function nextStaffId(prefix) {
  const n = (await base44.entities.ERPUser.count({})) + 1;
  for (let i = 0; i < 50; i += 1) {
    const c = prefix + String(1000 + n + i);
    if (!(await findOne({ employeeId: c }))) return c;
  }
  return prefix + Date.now();
}

// ---- Join Request helpers ----
// A self-registering user may only REQUEST a position; the account is always created as Staff + pending.
const REQUESTABLE_ROLES = ['Admin', 'Supervisor', 'Staff'];
const ID_FORMAT = /^[A-Z0-9][A-Z0-9._/-]{2,29}$/;
// IDs that only the system / a Super Admin may hand out — never claimable by a self-registering user.
const SELF_RESERVED_ID = /^(MASTER|SUPER|ADMIN|SYSTEM|STAFF-)/;
function checkIdValue(raw, { selfClaim } = {}) {
  const v = (raw || '').trim().toUpperCase();
  if (!ID_FORMAT.test(v)) throw new Error('আইডি ৩–৩০ অক্ষরের হতে হবে (ইংরেজি অক্ষর, সংখ্যা এবং - . / _)।');
  if (/^MASTER/.test(v) || (selfClaim && SELF_RESERVED_ID.test(v))) throw new Error('এই আইডিটি সংরক্ষিত। নিজের প্রকৃত আইডি লিখুন অথবা "আমার আইডি নেই" নির্বাচন করুন।');
  return v;
}

export const api = {
  // ---- Master data ----
  // Reads that several screens may ask for at the same moment share one in-flight request (see dedupe).
  getErpVessels: () => dedupe('vessels', () => all(base44.entities.MotherVessel)),
  getErpLighters: () => dedupe('lighters', () => all(base44.entities.LighterVessel)),
  getErpConsignees: () => dedupe('consignees', () => all(base44.entities.Consignee)),
  getErpGhats: () => dedupe('ghats', () => all(base44.entities.Ghat)),
  getErpCargos: () => dedupe('cargos', () => all(base44.entities.Cargo)),

  // ---- Operational records ----
  getErpEntries: () => all(base44.entities.TruckEntry),
  getEmptyWeights: () => all(base44.entities.EmptyWeight),
  getErpScales: () => dedupe('scales', () => all(base44.entities.Scale)),
  // Only what the screens need: recent alerts/approvals (one page), not the whole table.
  // Every unresolved alert (so badge/dashboard counts are exact at any volume) + the latest resolved ones.
  getAlerts: (company) => dedupe(`alerts:${company || 'legacy'}`, async () => {
    if (company) { const scope = await getCompanyScope(company); return all(base44.entities.Alert, andQuery(scope.alerts, { status: { $ne: 'RESOLVED' } }), '-created_date', 200, 5); }
    const [open, done] = await Promise.all([
      all(base44.entities.Alert, { status: { $ne: 'RESOLVED' } }),
      base44.entities.Alert.filter({ status: 'RESOLVED' }, { sort: '-created_date', limit: 100 }),
    ]);
    return [...open, ...done.items];
  }),
  getErpDocuments: async () => (await base44.entities.LighterDailyDocument.filter({}, { sort: '-created_date', limit: 200 })).items,
  getErpClosings: () => dedupe('closings', async () => (await base44.entities.VesselClosing.filter({}, { sort: '-created_date', limit: 200 })).items),
  // Approval requests are read through the backend: the entity is readable only by the platform "admin" role,
  // so an ERP Admin/Super Admin whose app role is "user" saw an empty approval screen and received no requests.
  getErpApprovals: () => dedupe('approvals', async () => {
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'listApprovals' });
      return res.data.approvals || [];
    } catch (e) { return []; }
  }),
  getErpAuditLogs: async () => (await base44.entities.AuditLog.filter({}, { sort: '-created_date', limit: 500 })).items,
  getScaleGhatMappings: () => all(base44.entities.ScaleGhatMapping),
  // Operational lists kept in memory: only records that still need action.
  // An empty weight carries no company of its own until loading: unassigned pending ones are visible in
  // every company view so the company whose lighter loads them can claim them.
  getUnlinkedEmptyWeights: (company) => dedupe(`unlinkedEmpty:${company || 'legacy'}`, async () => {
    const scope = company ? await getCompanyScope(company) : null;
    const scopeQuery = scope ? { $or: [scope.empty, { company: '' }, { company: { $exists: false } }] } : null;
    return (await base44.entities.EmptyWeight.filter(andQuery(scopeQuery, { $or: [{ loadingEntryId: '' }, { loadingEntryId: { $exists: false } }] }), { sort: '-created_date', limit: company ? 50 : 500 })).items;
  }),
  getLoadsWithoutEmpty: (company) => dedupe(`loadsNoEmpty:${company || 'legacy'}`, async () => { const scope = company ? await getCompanyScope(company) : null; return (await base44.entities.TruckEntry.filter(andQuery(scope?.trucks, { emptyWeightMatched: { $ne: true } }), { sort: '-created_date', limit: company ? 50 : 300 })).items; }),
  // Today's entries (bounded by today's date) — used by the dashboard supervisor summary.
  getTodayEntries: (company) => dedupe(`todayEntries:${company || 'legacy'}`, async () => { const scope = company ? await getCompanyScope(company) : null; return (await base44.entities.TruckEntry.filter(andQuery(scope?.trucks, { date: todayStr() }), { sort: 'time', limit: 50 })).items; }),

  // Dashboard numbers come from the server (counts / one aggregate), never by loading every record.
  // When `company` is set, every counter and aggregate is scoped to that company.
  async getDashboardStats(prev, company) {
    if (company) return companyDashboard(company);
    const E = base44.entities;
    const today = todayStr();
    const cf = company ? { company } : {};
    const unlinked = { $or: [{ loadingEntryId: '' }, { loadingEntryId: { $exists: false } }] };
    let counts = prev && prev.counts;
    if (!counts || Date.now() - counts.at > 60000) {
      // At most 4 counters at a time keeps the dashboard under the server's request-rate limit.
      // Each counter retries on its own (rate limit / slow network) so one hiccup does not throw the whole dashboard away.
      const C = (ent, q) => async () => { const n = await ent.count(q); if (!Number.isFinite(n)) throw new Error('Dashboard count unavailable'); return n; };
      const [totalLoads, todayLoads, totalEmpty, todayEmpty, okMatched, pendingEmpty, noEmpty, missingDocs, missingVideo] = await runLimited([
        C(E.TruckEntry, { ...cf }), C(E.TruckEntry, { ...cf, date: today }), C(E.EmptyWeight, { ...cf }), C(E.EmptyWeight, { ...cf, emptyWeightDate: today }),
        C(E.TruckEntry, { ...cf, emptyWeightMatched: true, missingDocs: { $ne: true } }), C(E.EmptyWeight, { ...cf, ...unlinked }),
        C(E.TruckEntry, { ...cf, emptyWeightMatched: { $ne: true } }), C(E.TruckEntry, { ...cf, missingDocs: true }),
        C(E.EmptyWeight, { ...cf, emptyWeightDate: today, $or: [{ emptyTruckVideo: '' }, { emptyTruckVideo: { $exists: false } }] }),
      ], 3);
      counts = { at: Date.now(), totalLoads, todayLoads, totalEmpty, todayEmpty, okMatched, pendingEmpty, noEmpty, missingDocs, missingVideo };
    }
    let sums = prev && prev.sums;
    let dateRows = prev && prev.dateRows;
    let ghatRows = prev && prev.ghatRows;
    if (!sums || Date.now() - sums.at > 90000) {
      try {
        const [agg, ghatAgg] = await Promise.all([
          withRetry(() => E.TruckEntry.aggregate({ query: { ...cf }, groupBy: 'date', sum: ['net', 'bags'], limit: 1000 }), { tries: 2, base: 1500, timeoutMs: 15000 }),
          withRetry(() => E.TruckEntry.aggregate({ query: { ...cf }, groupBy: 'ghatName', sum: ['net', 'bags'], sort: '-count', limit: 20 }), { tries: 2, base: 1500, timeoutMs: 15000 }),
        ]);
        const rows = agg.rows || [];
        const todayRow = rows.find((r) => r.date === today) || {};
        sums = { at: Date.now(), bags: rows.reduce((s, r) => s + (r.sum_bags || 0), 0), net: rows.reduce((s, r) => s + (r.sum_net || 0), 0), todayBags: todayRow.sum_bags || 0, todayNet: todayRow.sum_net || 0 };
        dateRows = rows.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(-30);
        ghatRows = (ghatAgg.rows || []).filter((r) => r.ghatName);
      } catch (e) { sums = sums || { at: 0, bags: 0, net: 0, todayBags: 0, todayNet: 0 }; }
    }
    return { ...counts, counts, sums, dateRows, ghatRows };
  },

  getErpUsersList: async () => {
    const res = await base44.functions.invoke('erpAdmin', { action: 'list' });
    return res.data.users;
  },

  async deleteSelfAccount() {
    const res = await base44.functions.invoke('erpAdmin', { action: 'deleteSelf' });
    return res.data;
  },

  // One shared request even if several places ask at once — also stops two parallel calls from both creating the default settings.
  getErpSettings: () => dedupe('settings', () => api._readSettings()),
  async _readSettings() {
    const list = await base44.entities.Setting.filter({}, { limit: 1 });
    if (list && list.items && list.items.length > 0) return list.items[0];
    // create default
    const created = await base44.entities.Setting.create({ companyName: 'SAN MARINE SURVEY & INSPECTION', reportHeader: 'Daily Discharge Report' });
    return created;
  },

  // ---- Auth ----
  // ---- Auth (secure) ----
  // Role is always read from the ERPUser DB record — never trusted from client request/headers.
  async loginErp(identifier, password, { deviceId, deviceName } = {}) {
    // ERP password is verified SERVER-SIDE in erpAdmin (loginWithPassword). The browser never sees
    // passwordHash and cannot bypass the password/OTP second factor by skipping client-side checks.
    const session = await base44.auth.me().catch(() => null);
    if (!session?.email) throw Object.assign(new Error('প্রথমে আপনার অনুমোদিত ইমেইল দিয়ে Google লগইন করুন অথবা ইমেইল যাচাই করুন। পরিচয় যাচাই ছাড়া স্টাফ আইডি/মোবাইল দিয়ে প্রবেশ করা যাবে না।'), { code: 'PLATFORM_LOGIN_REQUIRED' });
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'loginWithPassword', identifier, password, deviceId: (deviceId || '').trim(), deviceName });
      const data = res.data;
      if (data.requiresOtp) return { requiresOtp: true, challengeId: data.challengeId, otpSentTo: data.otpSentTo, delivered: data.delivered, userId: data.userId };
      return { user: data.user, token: 'sm_' + data.user.id, deviceTrusted: true, firstDevice: !!data.firstDevice };
    } catch (e) {
      const d = e?.data || e?.response?.data || {};
      throw Object.assign(new Error(d.error || e.message || 'লগইন ব্যর্থ।'), { code: d.code });
    }
  },

  // Login email-OTP is generated, stored, emailed and verified server-side in erpAdmin (sendLoginOtp /
  // resendLoginOtp / verifyLoginOtp). The browser never sees the code and never writes TrustedDevice directly.
  async resendLoginOtp(challengeId) {
    const res = await base44.functions.invoke('erpAdmin', { action: 'resendLoginOtp', challengeId });
    return res.data;
  },

  async verifyLoginOtp(challengeId, code, { deviceId, deviceName } = {}) {
    const res = await base44.functions.invoke('erpAdmin', { action: 'verifyLoginOtp', challengeId, otpCode: String(code).trim(), deviceId: (deviceId || '').trim(), deviceName });
    const data = res.data || {};
    if (!data.user) throw new Error(data.error || 'ভেরিফিকেশন ব্যর্থ।');
    return { user: data.user, token: 'sm_' + data.user.id, deviceTrusted: true };
  },

  // Join Request: `requestedRole` (Admin/Supervisor/Staff) and the ID choice are only saved for an admin to review.
  // hasId=true  → the applicant's own ID is stored as CLAIMED (verified by an admin at approval).
  // hasId=false → no ID is created here; an authorised Admin/Super Admin assigns one at approval (NEEDS_ID).
  async registerErp({ name, mobile, email, employeeId, hasId, requestedRole, designation, joiningInfo, password }) {
    const passwordHash = await hashPasswordV2(password);
    const res = await base44.functions.invoke('erpAdmin', { action: 'register', name, mobile, email, employeeId, hasId, requestedRole, designation, joiningInfo, passwordHash });
    return { user: res.data.user };
  },

  // Approves a pending Join Request. The final role and the ID are decided here by an authorised admin:
  // the role is checked against the approver's own rank (assertUserAction) and an applicant without an ID must be given one.
  async approveJoinRequest(userId, { role, employeeId, employeeType } = {}, admin) {
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'approveJoin', targetId: userId, role, employeeId, employeeType });
      return res.data.user;
    } catch (e) { throw erpError(e); }
  },

  // Admin creates a user (pre-approved). Enforces role hierarchy; nobody can self-promote to Super Admin.
  async createUserByAdmin(admin, { name, mobile, email, employeeId, role, password, designation }) {
    if (!admin || !admin.id) throw new Error('সেশন বৈধ নয়। আবার লগইন করুন।');
    const passwordHash = await hashPasswordV2(password);
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'create', name, mobile, email, employeeId, role, passwordHash, designation });
      return res.data.user;
    } catch (e) { throw erpError(e); }
  },

  async resetUserPassword(userId, newPassword, admin) {
    if (!newPassword || newPassword.length < 6) throw new Error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
    const passwordHash = await hashPasswordV2(newPassword);
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'resetPassword', targetId: userId, passwordHash });
      return res.data;
    } catch (e) { throw erpError(e); }
  },

  // Self-service password recovery (no ERP session required)
  async requestPasswordReset(identifier) {
    const res = await base44.functions.invoke('erpAdmin', { action: 'requestPasswordReset', identifier });
    return res.data;
  },
  async confirmPasswordReset(challengeId, otpCode, newPassword) {
    if (!newPassword || newPassword.length < 6) throw new Error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
    const passwordHash = await hashPasswordV2(newPassword);
    const res = await base44.functions.invoke('erpAdmin', { action: 'confirmPasswordReset', challengeId, otpCode, newPasswordHash: passwordHash });
    return res.data;
  },

  // ---- Google login ----
  // Super Admin logs in directly via Google (no password). Staff/Supervisor who Google-login
  // before approval get a pending record and must be approved by Super Admin.
  async loginWithGoogle(callerProfile, { deviceId, deviceName } = {}) {
    // The identity is the platform-verified Google session — never the caller-supplied profile — so nobody can
    // claim another address (including the reserved Master Super Admin) by passing a fake email.
    const session = await base44.auth.me().catch(() => null);
    const email = ((session && session.email) || '').trim().toLowerCase();
    if (!email) throw Object.assign(new Error('Google অ্যাকাউন্টে ইমেইল পাওয়া যায়নি।'), { code: 'NO_EMAIL' });
    const googleProfile = { email, name: (session && (session.full_name || session.name)) || (callerProfile && callerProfile.name) || '' };
    let user;
    try {
      const response = await base44.functions.invoke('resolveErpProfile', {});
      user = response.data.profile;
    } catch (error) {
      throw new Error(error.response?.data?.error || error.data?.error || error.message || 'স্টাফ প্রোফাইল যাচাই করা যায়নি।');
    }

    // Existing accounts retain their assigned role, status, password hash and trusted devices.
    // Master bootstrap applies only to a genuinely new Google-verified account below.
    if (!user) {
      const res = await base44.functions.invoke('erpAdmin', { action: 'googleCreate', email, name: googleProfile.name });
      user = res.data.user;
    }

    const status = (user.status || '').toLowerCase();
    if (!['approved', 'active', 'rejected', 'suspended', 'deactivated'].includes(status)) return { pending: true, user: stripUser(user) };
    if (status === 'rejected' || status === 'suspended' || status === 'deactivated') return { blocked: true, user: stripUser(user) };
    if ((user.verificationStatus || '') !== 'VERIFIED') return { pending: true, user: stripUser(user) };

    // Approved & verified → trust device server-side (TrustedDevice create is admin-only via RLS).
    const devId = (deviceId || '').trim();
    if (devId) {
      await base44.functions.invoke('erpAdmin', { action: 'grantDeviceTrust', targetId: user.id, deviceId: devId, deviceName: deviceName || 'Google Device' }).catch(() => {});
    }
    return { user: stripUser(user), token: 'sm_' + user.id, viaGoogle: true };
  },

  // ---- Empty weight ---- (creation lives in sanmarineEntries.saveEmptyWeight)
  async deleteEmptyWeight(id) {
    await base44.entities.EmptyWeight.delete(id);
    return true;
  },

  // ---- Truck entry (loading) ---- (creation lives in sanmarineEntries.saveLoadingEntry)
  async deleteTruckEntry(id) {
    await base44.entities.TruckEntry.delete(id);
    return true;
  },

  // ---- Master data CRUD ----
  async addVessel(data) { return base44.entities.MotherVessel.create(data); },
  async addLighter(data) { return base44.entities.LighterVessel.create(data); },
  async addConsignee(data) { return base44.entities.Consignee.create(data); },
  async addGhat(data) { return base44.entities.Ghat.create(data); },
  async addCargo(data) { return base44.entities.Cargo.create(data); },
  async deleteVessel(id) { return base44.entities.MotherVessel.delete(id); },
  async deleteLighter(id) { return base44.entities.LighterVessel.delete(id); },
  async deleteConsignee(id) { return base44.entities.Consignee.delete(id); },
  async deleteGhat(id) { return base44.entities.Ghat.delete(id); },
  async deleteCargo(id) { return base44.entities.Cargo.delete(id); },

  // ---- Master data CRUD (server-side, asServiceRole — bypasses platform RLS so ERP Staff/Supervisor can
  //      add and Admin can delete; exact-duplicate names are blocked and fuzzy matches returned for the form) ----
  async saveMaster(kind, id, data) {
    const res = await base44.functions.invoke('erpAdmin', { action: 'saveMaster', kind, id: id || null, data });
    return res.data;
  },
  async deleteMaster(kind, id) {
    const res = await base44.functions.invoke('erpAdmin', { action: 'deleteMaster', kind, id });
    return res.data;
  },
  async matchMasters(kind, name, company) {
    const res = await base44.functions.invoke('erpAdmin', { action: 'matchMasters', kind, name, company });
    return res.data;
  },

  // ---- Alerts ----
  async createAlert(data) {
    return base44.entities.Alert.create({
      ...data,
      createdTime: data.createdTime || nowISO(),
      updatedTime: nowISO(),
      status: data.status || 'OPEN',
    });
  },
  async updateAlert(id, data) {
    return base44.entities.Alert.update(id, { ...data, updatedTime: nowISO() });
  },

  // ---- Audit log ----
  async addAuditLog(data) {
    return base44.entities.AuditLog.create({ timestamp: nowISO(), ...data });
  },

  // ---- User management ----
  async updateUserStatus(id, status, admin) {
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'updateStatus', targetId: id, status });
      return res.data.user;
    } catch (e) { throw erpError(e); }
  },
  async updateUserRole(id, role, admin) {
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'updateRole', targetId: id, newRole: role });
      return res.data.user;
    } catch (e) { throw erpError(e); }
  },
  // Records an approval decision server-side (ERP role re-checked there) — never a direct entity write,
  // which an ERP admin without the platform "admin" role could not make.
  async decideApproval(id, decision, note) {
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'decideApproval', approvalId: id, decision, note });
      return res.data.approval;
    } catch (e) { throw erpError(e); }
  },
  async deleteUser(id, admin) {
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'delete', targetId: id });
      return res.data;
    } catch (e) { throw erpError(e); }
  },

  // ---- Settings (backend-enforced ERP role check) ----
  async updateSettings(data) {
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'updateSettings', ...data });
      return res.data.settings;
    } catch (e) { throw erpError(e); }
  },

  // ---- Edit existing staff (backend-enforced ERP role check) ----
  async editStaff(targetId, patch, admin) {
    try {
      const res = await base44.functions.invoke('erpAdmin', { action: 'editStaff', targetId, ...patch });
      return res.data.user;
    } catch (e) { throw erpError(e); }
  },

  // ---- Duplicate audit (dry-run, read-only) ----
  async duplicateAudit() {
    const res = await base44.functions.invoke('erpAdmin', { action: 'duplicateAudit' });
    return res.data;
  },

  // Removes the extra IDs that share one email but recorded no entries, keeping the ID that holds them.
  async dedupeAccounts() {
    const res = await base44.functions.invoke('erpAdmin', { action: 'dedupeAccounts' });
    return res.data;
  },

  // ---- Scale-Ghat mapping ----
  // Scale → Ghat is remembered. A later use with another ghat is reported as a conflict (alert) and never
  // silently overwrites the remembered ghat or any historical record; an admin changes it explicitly.
  async checkScaleMapping(scaleName, ghatName) {
    const s = (scaleName || '').toUpperCase().trim();
    const g = (ghatName || '').toUpperCase().trim();
    if (!s || !g) return { status: 'none' };
    const ex = await base44.entities.ScaleGhatMapping.filter({ scaleName: s }, { limit: 1 });
    const m = ex && ex.items && ex.items[0];
    if (!m) return { status: 'new' };
    return { status: m.ghatName === g ? 'same' : 'conflict', mapping: m };
  },
  async upsertScaleGhatMapping(scaleName, ghatName) {
    const s = scaleName.toUpperCase().trim();
    const g = ghatName.toUpperCase().trim();
    const r = await api.checkScaleMapping(s, g);
    if (r.status === 'new') return base44.entities.ScaleGhatMapping.create({ scaleName: s, ghatName: g, lastUpdated: nowISO(), timesUsed: 1 });
    if (r.status === 'same') return base44.entities.ScaleGhatMapping.update(r.mapping.id, { lastUpdated: nowISO(), timesUsed: (r.mapping.timesUsed || 1) + 1 });
    return r;
  },

  todayStr,
  timeStr,
  nowISO,
};