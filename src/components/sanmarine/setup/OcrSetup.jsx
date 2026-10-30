import React, { useState } from 'react';
import { Loader2, ScanLine } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { callGeminiOcr } from '@/lib/geminiOcrClient';

// OCR runs entirely through the app's own backend function (ocrProxy): the browser never calls a
// third-party origin, so CORS / ALLOWED_ORIGINS settings can no longer break it. The Gemini key is
// stored as an app secret on the server — there is nothing here for the user to configure.
export default function OcrSetup() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const test = async () => {
    setBusy(true); setMessage('');
    try {
      // A synthetic image only — no personal paperwork leaves the device for this check.
      const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 200;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 900, 200);
      ctx.fillStyle = '#000000'; ctx.font = 'bold 64px monospace'; ctx.fillText('DMT-12-3456', 30, 110);
      // The page is uploaded to the app's own private storage (stored privately) — OCR only ever reads
      // the app's own uploads, and the instructions/schema come from the server.
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const upload = await base44.integrations.Core.UploadPrivateFile({ file: new File([blob], 'ocr-test.png', { type: 'image/png' }) });
      const res = await callGeminiOcr(upload.file_uri, 'empty');
      const truck = String((res && res.truckNumber) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (truck !== 'DMT123456') throw new Error(`OCR সংযোগ আছে, কিন্তু পরীক্ষার ট্রাক নম্বর সঠিক পড়েনি (${(res && res.truckNumber) || 'পাওয়া যায়নি'})।`);
      setMessage('✓ OCR সফল — পরীক্ষার ট্রাক DMT-12-3456 পড়া গেছে। ছবি দিলে তথ্য স্বয়ংক্রিয়ভাবে বসবে।');
    } catch (e) {
      setMessage('OCR পরীক্ষা ব্যর্থ: ' + (e.message || 'অজানা ত্রুটি'));
    } finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-border bg-card p-4 space-y-3 text-card-foreground">
    <h2 className="font-heading font-bold flex items-center gap-2"><ScanLine className="h-5 w-5" />OCR (স্বয়ংক্রিয় তথ্য পড়া)</h2>
    <p className="text-xs text-muted-foreground">OCR অ্যাপের নিজস্ব সুরক্ষিত সার্ভার দিয়ে চলে — কোনো Cloudflare Worker বা অনুমতি (ALLOWED_ORIGINS) সেটিং দরকার নেই। ছবি আপলোড করলে তথ্য স্বয়ংক্রিয়ভাবে বসবে; না পড়লে হাতে লেখার সুযোগ সবসময় থাকবে।</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={test} disabled={busy} className="rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:opacity-50">{busy ? <Loader2 className="inline h-4 w-4 animate-spin mr-1" /> : null}OCR পরীক্ষা করুন</button>
    </div>
    {message && <p role="status" className="rounded-xl bg-muted p-3 text-sm break-words">{message}</p>}
  </section>;
}