// Shared client for Gemini Vision OCR through the app's own secure backend function (ocrProxy).
// The browser sends only the private file_uri; the backend fetches the image and talks to Gemini
// with the app's GEMINI_API_KEY secret. No client-side fetch to a signed URL (no CORS failures).
import { base44 } from '@/api/base44Client';

export async function callGeminiOcr(fileUri, task, fromMonitor) {
  try {
    const res = await base44.functions.invoke('ocrProxy', { fileUri, task, fromMonitor: fromMonitor === true });
    const payload = (res && res.data) || {};
    if (payload.error) throw Object.assign(new Error(payload.error), { code: payload.code || 'OCR_ERROR', status: res.status });
    return payload.data || {};
  } catch (e) {
    const body = (e && (e.response?.data || e.data)) || {};
    const err = new Error(body.error || (e && e.message) || 'OCR অনুরোধ ব্যর্থ হয়েছে। হাতে লিখুন।');
    err.code = body.code || (e && e.code) || 'OCR_ERROR';
    err.status = body.status || (e && e.response?.status);
    throw err;
  }
}

export function isGeminiQuotaError(e) {
  if (!e) return false;
  // OCR_RATE_LIMITED is our own hourly cap: show it as a gentle warning ("manual entry still works"),
  // never as a hard error, so a reached cap never looks like a broken app.
  if (e.code === 'OCR_QUOTA_EXHAUSTED' || e.code === 'OCR_RATE_LIMITED') return true;
  const msg = ((e && e.message) || '').toLowerCase();
  return msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429');
}