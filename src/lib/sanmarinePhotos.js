import { base44 } from '@/api/base44Client';

// Photos are stored privately (no public URL). Entities keep only the returned file_uri;
// a short-lived signed URL is created whenever a photo is shown.
const urlCache = new Map();

async function compress(file, maxDim = 1600, quality = 0.8) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], `${(file.name || 'photo').replace(/\.\w+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch (e) {
    return file;
  }
}

export async function uploadPhoto(file) {
  if (!file) return '';
  // Some phone gallery pickers return an empty MIME type (e.g. HEIC): accept by extension too.
  const isImage = /^image\//.test(file.type || '') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '');
  if (!isImage) throw new Error(`${file.name || 'ফাইল'}: শুধু ছবি (JPG/PNG) আপলোড করা যাবে।`);
  const small = await compress(file);
  const res = await base44.integrations.Core.UploadPrivateFile({ file: small });
  if (!res || !res.file_uri) throw new Error('ছবি আপলোড ব্যর্থ। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।');
  return res.file_uri;
}

// A document can have several photos: they are stored as a JSON list in the same text field.
// Older records that hold a single file_uri keep working (read as a list of one).
export function parsePhotos(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  const s = String(v).trim();
  if (s.startsWith('[')) {
    try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter(Boolean) : []; } catch (e) { return []; }
  }
  return s ? [s] : [];
}
export const packPhotos = (arr) => (arr && arr.length ? JSON.stringify(arr) : '');

export async function getPhotoUrl(uri) {
  if (!uri) return '';
  const hit = urlCache.get(uri);
  if (hit && hit.exp > Date.now()) return hit.url;
  const res = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
  urlCache.set(uri, { url: res.signed_url, exp: Date.now() + 50 * 60 * 1000 });
  return res.signed_url;
}