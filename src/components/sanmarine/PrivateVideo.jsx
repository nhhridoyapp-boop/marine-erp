import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getPhotoUrl } from '@/lib/sanmarinePhotos';

export default function PrivateVideo({ uri, name = '', label = 'খালি গাড়ির ভিডিও' }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl(''); setError(''); setUnsupported(false);
    if (uri) getPhotoUrl(uri).then((value) => { if (active) setUrl(value); }).catch((e) => { if (active) setError(e.message || 'ভিডিও খোলা যায়নি।'); });
    return () => { active = false; };
  }, [uri]);
  if (!uri) return null;
  return <div className="space-y-2 text-sm text-foreground">
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!url && !error && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />ভিডিও খুলছে...</p>}
    {url && <>
      <video key={url} src={url} controls playsInline preload="metadata" aria-label={label} onError={() => setUnsupported(true)} className="w-full max-h-64 rounded-xl bg-muted" />
      {unsupported && <p className="text-xs text-muted-foreground">এই ব্রাউজারে ফরম্যাটটি চলে না; ডাউনলোড করে ভিডিও প্লেয়ারে দেখুন।</p>}
      <a href={url} target="_blank" rel="noopener noreferrer" download={name || true} className="inline-block break-all font-semibold underline">ভিডিও খুলুন / ডাউনলোড করুন{name ? ` — ${name}` : ''}</a>
    </>}
  </div>;
}