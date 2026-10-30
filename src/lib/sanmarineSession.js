import { base44 } from '@/api/base44Client';

const statusOf = (e) => e && (e.status || (e.response && e.response.status));

// Re-reads the signed-in ERP user from the database so role/status always come from the record.
// Returns: the fresh user | null = the account/device is DEFINITELY no longer valid (confirmed by a second read)
//          | undefined = could not check (network, timeout, server error, rate limit) — the caller must keep the session.
export async function refreshSession(userId, deviceId) {
  try {
    // The server binds the profile and device lookup to the authenticated email. Password hashes,
    // OTP records and device identifiers never need to be readable from client-side entities.
    const response = await base44.functions.invoke('resolveErpProfile', { deviceId });
    const { profile, deviceTrusted } = response.data || {};
    if (!profile || profile.id !== userId) return null;
    if (!['approved', 'active'].includes(String(profile.status || '').toLowerCase())) return null;
    if (deviceId && deviceTrusted !== true) return deviceTrusted === false ? null : undefined;
    return profile;
  } catch (error) {
    return undefined; // Network/server errors never sign the operator out.
  }
}

export const localDeviceId = () => {
  try { return localStorage.getItem('sanmarine_device_id') || ''; } catch (e) { return ''; }
};

// Every sensitive action re-checks the actor's current role + status + trusted device from the database.
// If the check itself cannot be made (network/server), the action fails with a retry message — it never signs anyone out.
export async function requireActor(user, roles) {
  if (!user || !user.id) throw new Error('সেশন বৈধ নয়। আবার লগইন করুন।');
  const fresh = await refreshSession(user.id, localDeviceId());
  if (fresh === undefined) throw new Error('সার্ভারের সাথে সংযোগ হয়নি। আপনার লগইন নিরাপদ আছে — আবার চেষ্টা করুন।');
  if (!fresh) throw new Error('আপনার সেশন, অ্যাকাউন্ট বা ডিভাইস আর সক্রিয় নয়। আবার লগইন করুন।');
  if (roles && !roles.includes(fresh.role)) throw new Error('এই কাজের অনুমতি আপনার রোলে নেই।');
  return fresh;
}