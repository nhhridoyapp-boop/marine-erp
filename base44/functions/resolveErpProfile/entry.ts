import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { isTrustedDevice } from '../../shared/deviceTrust.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me();
    if (!session?.email) return Response.json({ error: 'লগইন করে পরিচয় যাচাই করুন।' }, { status: 401 });
    // This is a self-profile lookup, not an admin roster. All caller-supplied identifiers are ignored.
    const email = session.email.trim().toLowerCase();
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query = { email: { $regex: `^${escaped}$`, $options: 'i' } };
    const fields = ['name', 'employeeId', 'email', 'mobile', 'role', 'status', 'verificationStatus', 'requestedRole', 'idStatus', 'designation', 'approvedAt', 'approvedByName'];
    // Elevation is solely to find this authenticated email's own historical profile, including legacy email
    // casing. No hashes, OTP records or device identifiers are ever returned.
    const entity = base44.asServiceRole.entities.ERPUser;
    const active = await entity.filter({ ...query, status: { $in: ['approved', 'active', 'ACTIVE'] } }, { limit: 2, fields });
    const rows = active.items.length ? active.items : (await entity.filter(query, { limit: 2, fields })).items;
    if (rows.length > 1)
      return Response.json({ error: 'একই ইমেইলের একাধিক প্রোফাইল অস্পষ্ট। Admin Review প্রয়োজন; কোনো পুরোনো রেকর্ড পরিবর্তন করা হয়নি।', code: 'PROFILE_REVIEW_REQUIRED' }, { status: 409 });
    const profile = rows[0] || null;
    if (!profile) return Response.json({ profile: null });
    const body = await req.json().catch(() => ({}));
    const deviceId = body && typeof body.deviceId === 'string' ? body.deviceId : '';
    if (!deviceId) return Response.json({ profile });
    // Device trust is answered here, so the browser never needs read access to device records.
    try {
      return Response.json({ profile, deviceTrusted: await isTrustedDevice(base44, profile.id, deviceId) });
    } catch (e) {
      return Response.json({ profile }); // could not check — the client keeps the session
    }
  } catch (error) {
    const status = error.status || error.response?.status || 500;
    return Response.json({ error: status === 401 ? 'লগইন করে পরিচয় যাচাই করুন।' : 'স্টাফ প্রোফাইল যাচাই করা যায়নি; আবার চেষ্টা করুন।' }, { status });
  }
}