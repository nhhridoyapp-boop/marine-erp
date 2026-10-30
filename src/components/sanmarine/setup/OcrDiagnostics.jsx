import React from 'react';
import { Stethoscope } from 'lucide-react';
import { validateOcrWorkerUrl } from '@/lib/geminiOcrConfig';
import { ocrFetch, postOcr } from '@/lib/geminiOcrTransport';

export default function OcrDiagnostics({ url, disabled, onBusy, onMessage }) {
  const diagnose = async () => {
    onBusy('diag'); onMessage('');
    try {
      const value = validateOcrWorkerUrl(url);
      if (!value) throw new Error('আগে Worker-এর ঠিকানা দিন।');
      const response = await ocrFetch(value + '?diagnostic=1', { signal: AbortSignal.timeout(20000), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.service !== 'san-marine-ocr') throw new Error(data.error || 'Worker পৌঁছায়নি।');
      if (!data.version) throw new Error('পুরোনো Worker চালু আছে। এই কার্ডের নতুন OCR Worker ডাউনলোড করে Cloudflare-এ Deploy করুন; URL ও গোপন API key আগেরটাই থাকবে।');
      if (!data.configured) throw new Error('Cloudflare-এ GEMINI_API_KEY Secret যোগ করুন।');
      if (!data.listOk) throw new Error(`মডেল তালিকার অনুরোধ ব্যর্থ (${data.listStatus || 'সংযোগ'})। ${data.geminiMessage || ''}`);
      if (!data.eligibleModels?.length) throw new Error('এই key-এর তালিকায় সমর্থিত ফ্রী-টায়ার OCR মডেল নেই। Google AI Studio-তে Free tier প্রকল্প ও কোটা দেখুন।');
      const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 200;
      const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, 900, 200);
      context.fillStyle = '#000000'; context.font = 'bold 64px monospace'; context.fillText('DMT-12-3456', 30, 110);
      const scan = await postOcr(value, { image: { mimeType: 'image/png', data: canvas.toDataURL('image/png').split(',')[1] }, prompt: 'Read the truck registration printed in this synthetic diagnostic image. Return truckNumber exactly as printed.', schema: { type: 'object', properties: { truckNumber: { type: 'string' } } } }, AbortSignal.timeout(90000));
      const result = scan.data;
      const truck = String(result.truckNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (truck !== 'DMT123456') throw new Error(`সংযোগ আছে, কিন্তু পরীক্ষার ট্রাক নম্বর সঠিক পড়েনি (${result.truckNumber || 'পাওয়া যায়নি'})।`);
      onMessage(`প্রকৃত OCR সফল — পরীক্ষার ট্রাক DMT-12-3456 পড়েছে (${scan.model || data.model})। কোনো ব্যক্তিগত ছবি পাঠানো হয়নি; এই পরীক্ষা ফ্রী কোটার একটি OCR অনুরোধ ব্যবহার করে। বিনামূল্যে রাখতে Google প্রকল্প Free tier-এ রাখুন।`);
    } catch (error) {
      onMessage(['TimeoutError', 'AbortError'].includes(error.name) ? 'OCR যাচাইয়ের সময় শেষ; পরে আবার চেষ্টা করুন।' : error.message === 'Failed to fetch' ? 'Worker বা ALLOWED_ORIGINS যাচাই করুন; প্রকাশিত অ্যাপে চেষ্টা করুন।' : error.message);
    } finally { onBusy(''); }
  };
  return <button type="button" onClick={diagnose} disabled={disabled || !url} className="rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:opacity-50"><Stethoscope className="inline h-4 w-4 mr-1" />মডেল ও OCR যাচাই</button>;
}