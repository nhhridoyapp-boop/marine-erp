// Only called after platform authentication, with an ERP id resolved from that session's email.
// Never returns device identifiers or records to the browser.
export async function isTrustedDevice(base44, userId, deviceId) {
  if (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > 200) return false;
  const count = await base44.asServiceRole.entities.TrustedDevice.count({ userId, deviceId: deviceId.trim() });
  return count > 0;
}