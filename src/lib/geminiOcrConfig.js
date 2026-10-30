// The URL is shared through the existing Setting record; the API key is never stored in the app.
export const GEMINI_OCR_WORKER_URL = '';
let configuredUrl = '';
export const setOcrWorkerUrl = (value) => { configuredUrl = (value || '').trim(); };
export const getOcrWorkerUrl = () => configuredUrl || GEMINI_OCR_WORKER_URL;
export function validateOcrWorkerUrl(value) {
  if (!value.trim()) return ''; // Empty disables OCR; manual entry remains available.
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('শুধু Worker-এর HTTPS ঠিকানা দিন; API key বা অতিরিক্ত query দেবেন না।');
  return url.href.replace(/\/$/, '');
}