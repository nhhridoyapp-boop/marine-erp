// OCR-only transport. Never changes storage, operational records, or authentication.
export async function ocrFetch(url, options = {}, stage = 'worker') {
  try { return await fetch(url, options); }
  catch (error) {
    if (error.name !== 'TypeError') throw error;
    const origin = window.location.origin;
    const message = stage === 'photo'
      ? 'OCR-এর জন্য সংরক্ষিত ছবি ডাউনলোডের সংযোগ ব্যর্থ। ছবিটি আবার আপলোড করে স্ক্যান করুন।'
      : `OCR Worker-এর সঙ্গে ব্রাউজারের সংযোগ ব্যর্থ। Cloudflare-এ এই ঠিকানার অনুমতি দিন: ${origin} (ALLOWED_ORIGINS)। ইন্টারনেট, VPN বা Worker-এর ঠিকানাও যাচাই করুন।`;
    throw Object.assign(new Error(message), { code: stage === 'photo' ? 'OCR_PHOTO_CONNECTION' : 'OCR_WORKER_CONNECTION', stage, origin });
  }
}

function pause(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('OCR cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 2500);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function postOcr(workerUrl, payload, signal) {
  // One bounded retry only for an explicitly busy upstream response, never for quota/auth errors.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await ocrFetch(workerUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal,
    });
    const data = await response.json().catch(() => ({ error: `OCR সার্ভার সঠিক উত্তর দেয়নি (${response.status})।` }));
    if (response.status === 503 && attempt === 0 && data.geminiStatus === 'UNAVAILABLE') { await pause(signal); continue; }
    if (!response.ok) {
      const detail = data.geminiMessage ? ` — ${data.geminiMessage}` : '';
      throw Object.assign(new Error((data.error || `OCR সার্ভার ত্রুটি (${response.status})`) + detail), {
        code: response.status === 429 ? 'OCR_QUOTA_EXHAUSTED' : response.status === 503 ? 'OCR_SERVICE_BUSY' : 'OCR_ERROR',
        geminiStatus: data.geminiStatus || '', status: response.status, stage: 'worker',
      });
    }
    return { data, model: response.headers.get('X-OCR-Model') || '' };
  }
}