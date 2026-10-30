import React, { useState } from 'react';
import { Download, Smartphone, Loader2, Lock, Zap, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { isSuperAdmin } from '@/lib/erpRoles';
import AndroidArchitectureGuide from '@/components/sanmarine/setup/AndroidArchitectureGuide';
import AndroidRepairGuide from '@/components/sanmarine/setup/AndroidRepairGuide';
import IndependentHostingPlan from '@/components/sanmarine/setup/IndependentHostingPlan';

// TWA launcher ZIP — private storage, signed URL on demand (Super Admin only).
const KIT_URI = 'mp/private/6ac0a307a078cddcdc7973b9/d32c44f72_san-marine-android-kit.zip';
// Full ERP source archive (ZIP) — for Capacitor real-app build. Windows-এ সরাসরি Extract হবে।
const SOURCE_URI = 'mp/private/6ac0a307a078cddcdc7973b9/637cbe586_san-marine-full-source-2026-10-13.zip';

export default function AndroidSetup({ currentUser }) {
  const [fingerprint, setFingerprint] = useState('');
  const [message, setMessage] = useState('');
  const [srcMessage, setSrcMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [srcBusy, setSrcBusy] = useState(false);
  const owner = isSuperAdmin(currentUser);

  const download = async () => {
    setMessage('');
    if (!owner) { setMessage('এই ডাউনলোড শুধু মালিক / সুপার অ্যাডমিনের জন্য।'); return; }
    setBusy(true);
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: KIT_URI, expires_in: 300 });
      if (!signed_url) throw new Error('URL তৈরি ব্যর্থ।');
      const a = document.createElement('a');
      a.href = signed_url;
      a.download = 'san-marine-android-kit.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setMessage('ডাউনলোড শুরু হয়েছে (লিংক ৫ মিনিটের জন্য কার্যকর)।');
    } catch (e) {
      setMessage('ডাউনলোড ব্যর্থ: ' + (e.message || 'অজানা ত্রুটি'));
    } finally { setBusy(false); }
  };

  const downloadSource = async () => {
    setSrcMessage('');
    if (!owner) { setSrcMessage('এই ডাউনলোড শুধু মালিক / সুপার অ্যাডমিনের জন্য।'); return; }
    setSrcBusy(true);
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: SOURCE_URI, expires_in: 300 });
      if (!signed_url) throw new Error('URL তৈরি ব্যর্থ।');
      const a = document.createElement('a');
      a.href = signed_url;
      a.download = 'san-marine-full-source-2026-10-13.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setSrcMessage('ডাউনলোড শুরু হয়েছে (লিংক ৫ মিনিটের জন্য কার্যকর)।');
    } catch (e) {
      setSrcMessage('ডাউনলোড ব্যর্থ: ' + (e.message || 'অজানা ত্রুটি'));
    } finally { setSrcBusy(false); }
  };

  const assetLinks = () => {
    const value = fingerprint.trim().toUpperCase();
    if (!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value)) { setMessage('Release certificate-এর SHA-256 দিন: ৩২ জোড়া অক্ষর/সংখ্যা, মাঝে কোলন। Keystore / password দেবেন না।'); return; }
    const data = [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.sanmarine.surveyinspection', sha256_cert_fingerprints: [value] } }];
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'assetlinks.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('ফাইল তৈরি হয়েছে; পূর্ণস্ক্রিনের জন্য প্রকাশিত host-এর /.well-known/assetlinks.json ঠিকানায় এটি দিতে হবে।');
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4 text-card-foreground">
      <h2 className="font-heading font-bold flex items-center gap-2"><Smartphone className="h-5 w-5" />Android অ্যাপ বানান</h2>

      {/* Capacitor — Real App */}
      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <h3 className="font-bold text-emerald-900">পদ্ধতি ১: Capacitor — Real Android App (পরামর্শিত)</h3>
        </div>
        <p className="text-sm text-emerald-900">
          এটি একটি <b>আসল Android অ্যাপ</b> — কোনো browser address bar থাকবে না।
          পুরো ERP React কোড native WebView-এর ভিতরে থাকে; camera, GPS ও file access বাস্তব ফোনে যাচাই করতে হবে।
        </p>
        {owner ? (
          <div className="space-y-2">
            <button type="button" onClick={downloadSource} disabled={srcBusy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {srcBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {srcBusy ? 'তৈরি হচ্ছে...' : 'সংশোধিত ERP সোর্স ডাউনলোড (ZIP)'}
            </button>
            {srcMessage && <p role="status" className="text-xs break-words text-emerald-800">{srcMessage}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-white border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-800">
            <Lock className="h-4 w-4 shrink-0" /> শুধু সুপার অ্যাডমিনের জন্য।
          </div>
        )}
        <ol className="list-decimal pl-5 text-sm space-y-1.5 text-emerald-900">
          <li>উপরের বাটন থেকে <b>সংশোধিত পূর্ণ ERP সোর্স</b> ডাউনলোড করুন; পুরোনো ZIP নয়।</li>
          <li>কম্পিউটারে ফাইলটিতে Right-click → <b>Extract All</b> → একটি ফোল্ডারে খুলুন (Windows-এ সরাসরি হয়, কোনো অতিরিক্ত সফটওয়্যার লাগবে না)।</li>
          <li>Extract হওয়া ফোল্ডারে Command Prompt / Terminal খুলে <code className="bg-emerald-100 px-1 rounded">npm install</code> চালান (ইন্টারনেট দরকার, ~৫ মিনিট)।</li>
          <li><code className="bg-emerald-100 px-1 rounded">npm run build:android</code> চালান — এটি web build বানিয়ে Android-এ sync করবে।</li>
          <li><code className="bg-emerald-100 px-1 rounded">npm run android:open</code> দিয়ে Android Studio-তে খুলুন (Android Studio ইনস্টল থাকতে হবে)।</li>
          <li>Android Studio → <b>Build → Generate Signed Bundle / APK → APK</b> → <b>Create new...</b> → keystore তৈরি করুন → <b>release</b> → <b>Finish</b>।</li>
          <li>Signed APK ফোনে দিন → <b>Install unknown apps</b> অনুমতি দিন।</li>
        </ol>
        <p className="text-xs text-emerald-800 bg-emerald-100 rounded-lg p-2">
          <b>কমান্ড:</b> <code>npm run build:android</code> (build+sync) · <code>npm run android:apk</code> (debug APK) · <code>npm run android:release</code> (release APK) · <code>npm run android:aab</code> (Play Store AAB)
        </p>
        <p className="text-xs text-emerald-800">
          বিস্তারিত গাইড: <code className="bg-emerald-100 px-1 rounded">ANDROID_BUILD.md</code> ফাইলে।
        </p>
      </div>

      {/* TWA — Quick Launcher */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-600 shrink-0" />
          <h3 className="font-bold text-amber-900">পদ্ধতি ২: TWA Launcher (দ্রুত — কিন্তু browser bar থাকবে)</h3>
        </div>
        <p className="text-sm text-amber-900">
          এটি একটি হালকা launcher — Chrome browser দিয়ে প্রকাশিত অ্যাপ খোলে।
          <b> উপরে browser address bar দেখাবে</b> যতক্ষণ না Digital Asset Links যাচাই হয়।
          পূর্ণ ERP সোর্স এতে নেই।
        </p>
        {owner ? (
          <button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? 'তৈরি হচ্ছে...' : 'TWA Launcher ZIP ডাউনলোড'}
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-white border border-amber-200 px-3 py-2 text-sm font-bold text-amber-800">
            <Lock className="h-4 w-4 shrink-0" /> শুধু সুপার অ্যাডমিনের জন্য।
          </div>
        )}
        {message && <p role="status" className="text-xs break-words text-amber-800">{message}</p>}
      </div>

      <AndroidRepairGuide />
      <AndroidArchitectureGuide />
      <IndependentHostingPlan />

      <details className="rounded-xl border border-border p-3 text-sm">
        <summary className="cursor-pointer font-bold">পূর্ণস্ক্রিন APK-এর সংযোগ ফাইল (TWA-র জন্য)</summary>
        <label className="block mt-3">Release certificate SHA-256<input value={fingerprint} onChange={(event) => setFingerprint(event.target.value)} placeholder="AA:BB:…" className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs" /></label>
        <button type="button" onClick={assetLinks} className="mt-2 rounded-xl bg-secondary px-3 py-2 text-secondary-foreground font-bold">assetlinks.json ডাউনলোড</button>
      </details>
    </section>
  );
}