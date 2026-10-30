import { withTimeout } from '@/lib/startupGuard';

// A network / server hiccup is TRANSIENT: it is retried and NEVER a reason to sign the user out.
// Only a clear 4xx answer (other than timeout / too-many-requests) is treated as a real failure.
export function isTransient(e) {
  const s = e && (e.status || (e.response && e.response.status));
  if (!s) return true;
  return s === 408 || s === 425 || s === 429 || s >= 500;
}

// Runs fn with a time limit and retries transient failures with exponential backoff.
export async function withRetry(fn, { tries = 3, base = 800, timeoutMs = 25000, label = 'request' } = {}) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await withTimeout(fn(), timeoutMs, label);
    } catch (e) {
      last = e;
      if (!isTransient(e) || i === tries - 1) break;
      const r429 = e && (e.status === 429 || (e.response && e.response.status) === 429);
      await new Promise((r) => setTimeout(r, (r429 ? base * 3 : base) * 2 ** i + Math.random() * 300)); // 429: back off 3x longer to let the rate limit recover
    }
  }
  throw last;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Identical reads that are already in flight share ONE request (nothing is cached once it finishes, so data is never stale).
const inflight = new Map();
export function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// Record count with retries. Returns -1 ("could not read") instead of throwing — a failed read is NEVER treated as "0 records".
export async function safeCount(ent, query = {}) {
  for (let i = 0; i < 4; i += 1) {
    try {
      return await withTimeout(ent.count(query), 20000, 'count');
    } catch (e) {
      if (!isTransient(e) || i === 3) return -1;
      await sleep(700 * 2 ** i + Math.random() * 300);
    }
  }
  return -1;
}

// Runs async thunks with at most `limit` in flight (keeps the app under the server's request-rate limit).
// Thunks must handle their own errors. Results keep the input order.
export async function runLimited(thunks, limit = 4) {
  const out = new Array(thunks.length);
  let next = 0;
  const worker = async () => {
    while (next < thunks.length) {
      const i = next;
      next += 1;
      out[i] = await thunks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return out;
}