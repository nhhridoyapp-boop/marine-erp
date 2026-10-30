import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { getOcrTask } from '../../shared/ocrTasks.ts';

// Server-side OCR gateway. The browser uploads the photo bytes to this function (same origin, no CORS),
// and only the server talks to Gemini with the app's GEMINI_API_KEY secret. This removes the whole class of
// browser-to-third-party connection / ALLOWED_ORIGINS failures from OCR.
// Only models that answer for this key, ordered by live-measured speed. Google's free tier is shared with
// everyone else, so under load it replies "high demand" (503) and, once the key's free quota is spent, 429.
// Neither ends a scan any more: the next model is tried, and when none of them answers the platform's own
// vision model reads the photo instead (see platformOcr below).
// Live timing shows the 3.x preview models hang for 20 s+ without ever answering, so they are NOT in this
// chain — for the operator a hang is worse than a miss. Everything listed here fails fast instead.
const MODEL_CHAIN = [
  'gemini-3.6-flash',      // answers in about 1 s
  'gemini-3.5-flash',      // answers in about 2 s
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];
const ROUND_PAUSE_MS = 1200;     // pause before a second pass over the chain
const MODEL_TIMEOUT_MS = 10000;  // per model: a stuck attempt must never hold the operator
const MAX_GEMINI_ROUNDS = 2;     // then hand over to the platform model — hammering Google is what caused the 429
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// The model must be allowed to answer null for a field it cannot read (never guess a value).
function nullableSchema(schema) {
  const result = { ...schema };
  if (schema.properties) result.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, nullableSchema(value)]));
  if (schema.items) result.items = nullableSchema(schema.items);
  if (['string', 'number', 'integer', 'boolean'].includes(schema.type)) result.type = [schema.type, 'null'];
  if (schema.properties) result.required = Object.keys(schema.properties);
  return result;
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  const chunks = [];
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

async function callGemini(model, apiKey, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let geminiError = null;
    try { const data = await response.json(); geminiError = data.error || null; } catch (e) { /* not JSON */ }
    // Safe log: status + Gemini's own status only — never the API key or the image.
    console.log(`OCR Gemini error: model=${model} status=${response.status} geminiStatus=${geminiError?.status || ''}`);
    return { ok: false, status: response.status, geminiError };
  }
  return { ok: true, result: await response.json() };
}

// Reads the JSON a Gemini model returned. Null when the answer is missing, truncated or not an object, so the
// caller can simply try the next model instead of failing the whole scan on one bad answer.
function readGeminiJson(result) {
  const text = (result.candidates?.[0]?.content?.parts || []).filter((part) => !part.thought).map((part) => part.text || '').join('');
  if (!text || result.candidates?.[0]?.finishReason === 'MAX_TOKENS') return null;
  try {
    const data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch (e) { return null; }
}

// Second engine, used when Google's free tier is busy (503) or out of quota (429). The platform's own vision
// model runs on this app's integration credits — capacity the plan reserves, not a free tier shared with the
// whole internet — so it answers when Gemini will not. Measured at about 2.4 s on a full mobile screenshot,
// Bengali included. This is what keeps a scan from ever ending in an error for the operator.
async function platformOcr(base44, signedUrl, prompt, schema) {
  const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: prompt + '\nReturn only the requested JSON. Inspect the whole image, including rotated Bengali/English vehicle registration fields. Unreadable fields must be null; never guess.',
    file_urls: [signedUrl],
    response_json_schema: schema,
  });
  return res && typeof res === 'object' && !Array.isArray(res) ? res : null;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me();
    if (!session?.email) return Response.json({ error: 'অনুমতি নেই — আগে লগইন করুন।', code: 'OCR_UNAUTHORIZED' }, { status: 401 });

    // Require an approved ERP profile — not just any platform session — so self-registered accounts
    // cannot drain the app's Gemini quota.
    const escRx = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const erpPage = await base44.asServiceRole.entities.ERPUser.filter(
      { email: { $regex: `^${escRx(session.email)}$`, $options: 'i' }, status: { $in: ['approved', 'active', 'ACTIVE'] } },
      { limit: 1, fields: ['id', 'role', 'status'] }
    );
    if (!erpPage.items.length) return Response.json({ error: 'OCR শুধু অনুমোদিত স্টাফের জন্য। আপনার অ্যাকাউন্ট এখনও অনুমোদিত নয়।', code: 'OCR_NOT_APPROVED' }, { status: 403 });
    const erpUser = erpPage.items[0];

    // The caller selects a task; the instructions given to the model and the shape of its answer both come
    // from the server. An injected prompt or schema is ignored, so this endpoint cannot be turned into a
    // general-purpose LLM or used to read arbitrary text out of a photo.
    const input = await req.json().catch(() => ({}));
    const task = getOcrTask(input);
    const fileUri = input?.fileUri;
    if (!task) return Response.json({ error: 'OCR অনুরোধ সঠিক নয়।', code: 'OCR_BAD_REQUEST' }, { status: 400 });
    // Only this app's own private uploads may be opened: a caller cannot make the server fetch an outside URL.
    if (!fileUri || typeof fileUri !== 'string' || fileUri.length > 500 || !fileUri.startsWith(`mp/private/${secrets.get('BASE44_APP_ID')}/`))
      return Response.json({ error: 'ছবি খোলা যায়নি। আবার চেষ্টা করুন।', code: 'OCR_BAD_IMAGE' }, { status: 400 });

    // Per-user hourly cap — counts SUCCESSFUL scans only. A failed scan (Gemini busy, unreadable photo,
    // unclear page, bad request, closed image) never consumes the user's quota, so a few bad photos can
    // never lock an operator out of OCR for the rest of the hour. Charging happens on the success return
    // below — moving it there is what removes the old "limit reached" lockout.
    const hourKey = new Date().toISOString().slice(0, 13);
    const HOURLY_LIMIT = 100;
    const usagePage = await base44.asServiceRole.entities.OcrUsage.filter({ userId: erpUser.id, hourKey }, { limit: 1 });
    const usage = usagePage.items[0];
    const usedThisHour = (usage && usage.count) || 0;
    if (usedThisHour >= HOURLY_LIMIT)
      return Response.json({
        error: `ঘন্টায় ${HOURLY_LIMIT}টি সফল স্ক্যানের সীমা শেষ। কিছুক্ষণ পরে আবার চেষ্টা করুন — ব্যর্থ স্ক্যান সীমায় ধরা হয় না, আর হাতে এন্ট্রি সবসময় চালু আছে।`,
        code: 'OCR_RATE_LIMITED', quotaRemaining: 0,
      }, { status: 429 });
    // Charged only when the scan actually returns a result (see the success return below).
    const chargeQuota = async () => {
      try {
        if (usage) await base44.asServiceRole.entities.OcrUsage.update(usage.id, { count: usedThisHour + 1 });
        else await base44.asServiceRole.entities.OcrUsage.create({ userId: erpUser.id, hourKey, count: 1 });
      } catch (e) { /* a failed counter write must never fail the scan itself */ }
    };

    const apiKey = secrets.get('GEMINI_API_KEY');
    if (!apiKey) return Response.json({ error: 'OCR কী সেট করা হয়নি (GEMINI_API_KEY)। অ্যাডমিনকে জানান।', code: 'OCR_NOT_CONFIGURED' }, { status: 503 });

    // Fetch the image server-side (no browser CORS). Create a short-lived signed URL from the private file_uri.
    let signedUrl;
    try {
      const signRes = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 300 });
      signedUrl = signRes.signed_url;
    } catch (e) {
      return Response.json({ error: 'ছবি খোলা যায়নি। আবার চেষ্টা করুন।', code: 'OCR_BAD_IMAGE' }, { status: 400 });
    }
    const imgRes = await fetch(signedUrl, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!imgRes || !imgRes.ok)
      return Response.json({ error: 'ছবি খোলা যায়নি। আবার চেষ্টা করুন।', code: 'OCR_BAD_IMAGE' }, { status: 400 });
    let mimeType = (imgRes.headers.get('content-type') || '').split(';')[0].trim();
    if (!ALLOWED_MIME.includes(mimeType)) mimeType = 'image/jpeg';
    const imgBuf = await imgRes.arrayBuffer();
    if (imgBuf.byteLength > MAX_IMAGE_BYTES)
      return Response.json({ error: 'OCR ছবি সর্বোচ্চ ৫ MB হতে পারে। ছোট JPG/PNG ছবি দিন।', code: 'OCR_BAD_IMAGE' }, { status: 400 });
    const imageData = bufToB64(imgBuf);

    const body = {
      contents: [{ parts: [{ text: task.prompt + '\nReturn only the requested JSON. Unreadable fields must be null; never guess.' }, { inlineData: { mimeType, data: imageData } }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseJsonSchema: nullableSchema(task.schema), maxOutputTokens: 8192 },
    };

    // Gemini (free) goes first: when it is not under load it answers in about a second and costs nothing.
    let lastError = null;
    let exhausted = false;
    for (let round = 0; round < MAX_GEMINI_ROUNDS && !exhausted; round += 1) {
      if (round > 0) await new Promise((resolve) => setTimeout(resolve, ROUND_PAUSE_MS));
      for (const model of MODEL_CHAIN) {
        if (exhausted) break;
        const r = await callGemini(model, apiKey, body);
        if (r.ok) {
          const data = readGeminiJson(r.result);
          if (data) {
            await chargeQuota();
            return Response.json({ data, model, quotaRemaining: Math.max(0, HOURLY_LIMIT - (usedThisHour + 1)) });
          }
          lastError = { status: 502 };
          continue;
        }
        lastError = r;
        // 429 means this key's free quota is spent: every further Gemini call would fail identically. Stop
        // asking Google at once and hand the scan over — hammering on is exactly what produced the 429.
        if (r.status === 429) exhausted = true;
      }
    }

    // Google could not answer. The platform's own vision model reads the photo instead, so the operator sees a
    // slightly slower scan rather than an error: OCR can no longer block the day's entry work.
    try {
      const data = await platformOcr(base44, signedUrl, task.prompt, task.schema);
      if (data) {
        await chargeQuota();
        return Response.json({ data, model: 'platform', quotaRemaining: Math.max(0, HOURLY_LIMIT - (usedThisHour + 1)) });
      }
    } catch (e) {
      console.log(`OCR platform fallback failed: ${(e && e.message) || e}`);
    }

    // Reached only when both engines failed — readable, and without the raw Google status tag.
    const status = (lastError && lastError.status) || 502;
    return Response.json({
      error: 'OCR এখন সাড়া দিচ্ছে না। ছবি সংরক্ষিত আছে — হাতে লিখে এন্ট্রি সম্পন্ন করুন, অথবা একটু পরে আবার স্ক্যান করুন।',
      code: status === 429 ? 'OCR_QUOTA_EXHAUSTED' : status === 503 ? 'OCR_SERVICE_BUSY' : 'OCR_ERROR',
      status,
    }, { status: 502 });
  } catch (error) {
    return Response.json({ error: error.message || 'OCR অনুরোধ সম্পন্ন হয়নি। হাতে এন্ট্রি করুন।', code: 'OCR_ERROR' }, { status: 500 });
  }
}