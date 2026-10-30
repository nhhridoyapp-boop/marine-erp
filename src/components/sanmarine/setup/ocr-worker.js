// Download this file from San Marine Settings and deploy it on Cloudflare Workers.
// Store GEMINI_API_KEY as a Cloudflare secret. Never put the key in this file.
const APP_ORIGIN = 'https://san-marine-survey-inspection-scale-monitoring.base44.app';
const APP_ID = '6ac0a307a078cddcdc7973b9';
const EXTRA_ORIGINS = [];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const VERSION = '2026-10-11-free-ocr-v5';
// The installed Android/iOS app loads the app code from a local origin on the user's own device.
const APP_SHELL_ORIGINS = ['https://localhost', 'capacitor://localhost'];
// Only this app's own Base44 hosts (its app id or slug); other Base44 apps are never allowed.
const APP_MARKERS = [APP_ID, 'san-marine-survey-inspection-scale-monitoring'];

function isAppOwnHost(origin) {
  try {
    const caller = new URL(origin);
    if (caller.protocol !== 'https:' || caller.port) return false;
    return /\.base44\.(app|com)$/.test(caller.hostname) && APP_MARKERS.some((marker) => caller.hostname.includes(marker));
  } catch { return false; }
}
// Exact image-input models with a documented free tier; never use paid-only models or moving aliases.
const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const SUPPORTED_MODELS = [PRIMARY_MODEL, ...FALLBACK_MODELS];

function nullableSchema(schema) {
  const result = { ...schema };
  if (schema.properties) result.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, nullableSchema(value)]));
  if (schema.items) result.items = nullableSchema(schema.items);
  if (['string', 'number', 'integer', 'boolean'].includes(schema.type)) result.type = [schema.type, 'null'];
  if (schema.properties) result.required = Object.keys(schema.properties);
  return result;
}

async function callGemini(model, apiKey, body, controller) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: controller.signal,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let geminiError = null;
    try { const errData = await response.json(); geminiError = errData.error || null; } catch (e) { /* not JSON */ }
    // Safe log: status + Gemini's own status/message only — never the API key.
    console.log(`OCR Gemini error: model=${model} status=${response.status} geminiStatus=${geminiError?.status || ''} message=${geminiError?.message || ''}`);
    return { ok: false, status: response.status, geminiError };
  }
  const result = await response.json();
  return { ok: true, result };
}

// Listing a model does not prove generateContent works. Keep methods and test actual OCR in Settings.
async function listAvailableModels(apiKey, signal) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
    headers: { 'x-goog-api-key': apiKey }, signal,
  });
  const data = await res.json();
  if (!res.ok) return { listOk: false, listStatus: res.status, geminiStatus: data.error?.status || '', geminiMessage: data.error?.message || '' };
  const availableModels = (data.models || []).map((m) => m.name.replace(/^models\//, ''));
  const generationModels = (data.models || []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  const eligibleModels = SUPPORTED_MODELS.filter((name) => generationModels.includes(name));
  return { listOk: true, availableModels, generationModels, eligibleModels };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = [APP_ORIGIN, ...EXTRA_ORIGINS, ...APP_SHELL_ORIGINS, ...(env.ALLOWED_ORIGINS || '').split(',')].map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
    // The published app covers the editor preview of this same app; exact custom-domain settings still apply.
    const originAllowed = allowed.includes(origin) || isAppOwnHost(origin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Access-Control-Expose-Headers': 'X-OCR-Model' };
    if (originAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
    }
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !originAllowed) return reply({ error: 'এই অ্যাপের ঠিকানা ALLOWED_ORIGINS-এ যোগ করুন।', rejectedOrigin: origin }, 403);
    // Preflight is independent of model/key validation: browsers must be able to read actual POST errors.
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    // Old 1.5/2.0 configuration is ignored: those models are retired, not viable fallbacks.
    const requestedModel = (env.GEMINI_MODEL || PRIMARY_MODEL).trim().replace(/^models\//, '');
    const configuredModel = /^gemini-(1\.5|2\.0)-/.test(requestedModel) ? PRIMARY_MODEL : requestedModel;
    if (!SUPPORTED_MODELS.includes(configuredModel)) return reply({ error: 'GEMINI_MODEL সরিয়ে দিন অথবা gemini-3.1-flash-lite দিন; কেবল সমর্থিত ফ্রী-টায়ার OCR মডেল চলবে।' }, 400);
    if (request.method === 'GET') {
      const health = { service: 'san-marine-ocr', version: VERSION, configured: Boolean(env.GEMINI_API_KEY), model: configuredModel, fallbacks: FALLBACK_MODELS };
      if (new URL(request.url).searchParams.get('diagnostic') === '1' && env.GEMINI_API_KEY) {
        try {
          const diag = await listAvailableModels(env.GEMINI_API_KEY, AbortSignal.timeout(15000));
          return reply({ ...health, ...diag }, diag.listOk ? 200 : diag.listStatus);
        } catch { return reply({ ...health, error: 'Gemini মডেল তালিকার সংযোগ বা সময়সীমার সমস্যা।' }, 504); }
      }
      return reply(health);
    }
    if (!origin || !originAllowed) return reply({ error: 'Allowed app origin required' }, 403);
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    // Shared-secret auth: the Origin header alone is forgeable by non-browser clients, so require a
    // secret that only the app's authenticated backend would know. Fail closed if unset.
    if (!env.OCR_SHARED_SECRET) return reply({ error: 'Worker এ OCR_SHARED_SECRET সেট করা নেই।' }, 503);
    if ((request.headers.get('X-OCR-Secret') || '') !== env.OCR_SHARED_SECRET) return reply({ error: 'অননুমোদিত অনুরোধ।' }, 403);
    if (!env.GEMINI_API_KEY) return reply({ error: 'Cloudflare Settings → Variables and Secrets-এ GEMINI_API_KEY যোগ করুন।' }, 503);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75000);
    try {
      if (Number(request.headers.get('Content-Length') || 0) > 8 * 1024 * 1024) return reply({ error: 'ছবি সর্বোচ্চ ৫ MB হতে পারে।' }, 413);
      const input = await request.json();
      const { image, prompt, schema } = input;
      if (!image || !['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) || typeof image.data !== 'string' || !image.data.length || image.data.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) return reply({ error: 'Valid JPG, PNG or WebP image required (maximum 5 MB)' }, 400);
      if (typeof prompt !== 'string' || !prompt.length || prompt.length > 15000 || !schema || schema.type !== 'object') return reply({ error: 'Valid OCR prompt and object schema required' }, 400);
      const catalog = await listAvailableModels(env.GEMINI_API_KEY, controller.signal);
      if (!catalog.listOk) return reply({ error: `Gemini মডেল তালিকার অনুরোধ ব্যর্থ (${catalog.listStatus})।`, geminiStatus: catalog.geminiStatus, geminiMessage: catalog.geminiMessage }, catalog.listStatus);
      const tryModels = [configuredModel, ...SUPPORTED_MODELS.filter((m) => m !== configuredModel)].filter((m) => catalog.eligibleModels.includes(m));
      if (!tryModels.length) return reply({ error: 'এই API key-এর তালিকায় generateContent সমর্থিত ফ্রী-টায়ার OCR মডেল নেই। Free tier প্রকল্প ও কোটা যাচাই করুন; হাতে এন্ট্রি চালু আছে।' }, 503);
      const body = {
        contents: [{ parts: [{ text: prompt + '\nReturn only the requested JSON. Inspect the whole image, including rotated Bengali/English vehicle registration fields. Unreadable fields must be null; never guess.' }, { inlineData: { mimeType: image.mimeType, data: image.data } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseJsonSchema: nullableSchema(schema), maxOutputTokens: 8192 },
      };
      const attempts = [];
      let lastError = null;
      let busyError = null;
      for (const model of tryModels) {
        const reqBody = model.startsWith('gemini-2.5') ? { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingBudget: 0 } } } : body;
        const r = await callGemini(model, env.GEMINI_API_KEY, reqBody, controller);
        attempts.push({ model, status: r.status || 200 });
        if (r.ok) {
          const text = (r.result.candidates?.[0]?.content?.parts || []).filter((part) => !part.thought).map((part) => part.text || '').join('');
          if (!text || r.result.candidates?.[0]?.finishReason === 'MAX_TOKENS') return reply({ error: 'সম্পূর্ণ OCR পাওয়া যায়নি। একটি পরিষ্কার পৃষ্ঠা দিয়ে আবার চেষ্টা করুন।' }, 502);
          const data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
          if (!data || typeof data !== 'object' || Array.isArray(data)) return reply({ error: 'Invalid OCR response' }, 502);
          headers['X-OCR-Model'] = model;
          return reply(data);
        }
        lastError = r;
        // A busy (503) model may use another eligible free-tier model; quota/auth errors still stop.
        if (r.status === 503) busyError = r;
        if (![404, 503].includes(r.status)) break;
      }
      // Do not hide a real busy response behind a later model-not-found error.
      if (lastError.status === 404 && busyError) lastError = busyError;
      // Forward the actual Gemini error (message + status only — never the API key) so the user can diagnose.
      const status = lastError.status;
      const geminiMsg = lastError.geminiError?.message || '';
      const geminiStatus = lastError.geminiError?.status || '';
      const safeMessages = {
        400: 'Gemini অনুরোধ গ্রহণ করেনি (400)।',
        403: 'Gemini API key বা অঞ্চলের অনুমতি নেই (403)।',
        404: 'তালিকায় মডেল থাকলেও Gemini ছবি পড়ার অনুরোধ গ্রহণ করছে না (404)। সিস্টেম সেটিংসে মডেল ও OCR যাচাই করুন।',
        429: 'Gemini কোটা শেষ বা অনুরোধ বেশি (429)। পরে চেষ্টা করুন; হাতে এন্ট্রি চালু আছে।',
        503: 'Gemini সার্ভার এখন ব্যস্ত (503)। ফ্রী-টায়ার বিকল্পও পাওয়া যায়নি; একটু পরে আবার স্ক্যান করুন।',
      };
      const baseMsg = safeMessages[status] || `Gemini সাময়িকভাবে অনুপলব্ধ (${status})। হাতে এন্ট্রি করুন।`;
      const detail = geminiStatus ? ` [${geminiStatus}]` : '';
      return reply({ error: baseMsg + detail, geminiStatus, geminiMessage: geminiMsg, attempts }, status);
    } catch (error) {
      return reply({ error: error.name === 'AbortError' ? 'OCR সময় শেষ। হাতে এন্ট্রি করুন অথবা পরে চেষ্টা করুন।' : 'OCR অনুরোধ সম্পন্ন হয়নি। ছবি ও Worker সেটিংস যাচাই করুন।' }, error.name === 'AbortError' ? 504 : 502);
    } finally {
      clearTimeout(timer);
    }
  },
};