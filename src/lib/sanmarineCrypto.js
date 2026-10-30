// Only generates new PBKDF2 hashes with a random salt. Password verification and legacy migration
// belong exclusively to the authenticated server, never to the browser.
const ITERATIONS = 150000;
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function derive(plain, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPasswordV2(plain) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(plain, salt, ITERATIONS))}`;
}