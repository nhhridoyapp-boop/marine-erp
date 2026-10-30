import React, { useState, useEffect } from 'react';
import { ImageOff } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { getPhotoUrl } from '@/lib/sanmarinePhotos';

// Shows a privately stored photo via a short-lived signed URL; click opens the full image.
export default function PhotoThumb({ uri, label, size = 'h-16 w-16' }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(''); setFailed(false);
    if (uri) getPhotoUrl(uri).then((u) => { if (!cancelled) setUrl(u); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [uri]);

  if (!uri) return <div className={`${size} rounded-lg border border-dashed border-rose-300 bg-rose-50 text-rose-500 flex items-center justify-center`} title={`${label || 'ছবি'} নেই`}><ImageOff className="h-4 w-4" /></div>;
  if (failed || !url) return <div className={`${size} rounded-lg bg-slate-100 animate-pulse`} title={label} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={label} className="block shrink-0">
      <Image src={url} alt={label || 'ছবি'} className={`${size} rounded-lg object-cover border border-slate-200`} />
    </a>
  );
}