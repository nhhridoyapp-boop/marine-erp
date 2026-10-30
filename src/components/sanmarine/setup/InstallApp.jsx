import React, { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import usePwaInstall from '@/components/sanmarine/setup/pwaInstall';

export default function InstallApp() {
  const { isInstalled, canInstall, install } = usePwaInstall();
  const [message, setMessage] = useState('');
  const embedded = window.self !== window.top;
  const run = async () => { try { await install(); } catch { setMessage('Chrome-এর ⋮ মেনু থেকে Install app / Add to Home screen নির্বাচন করুন।'); } };
  return <section className="rounded-2xl border border-border bg-card p-4 space-y-3 text-card-foreground">
    <h2 className="font-heading font-bold">ফোনে PWA ইনস্টল</h2>
    {isInstalled ? <p className="text-sm">এই অ্যাপ এখন ইনস্টল করা মোডে চলছে।</p> : <>
      {canInstall && !embedded ? <button type="button" onClick={run} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"><Download className="h-4 w-4" />PWA ইনস্টল</button> : <p className="text-sm">ফোনের Chrome-এ প্রকাশিত অ্যাপ খুলুন → ⋮ → Install app / Add to Home screen। iPhone-এ Safari → Share → Add to Home Screen।</p>}
      <a href="https://san-marine-survey-inspection-scale-monitoring.base44.app/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm underline"><ExternalLink className="h-4 w-4" />প্রকাশিত অ্যাপ খুলুন</a>
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <p className="text-xs text-muted-foreground">Editor preview / WhatsApp-এর browser-এ ইনস্টল নাও হতে পারে। প্রকাশনার পরে Chrome থেকে চেষ্টা করুন। PWA APK নয়; লাইভ ডেটা, নতুন এন্ট্রি ও OCR-এর জন্য ইন্টারনেট দরকার।</p>
  </section>;
}