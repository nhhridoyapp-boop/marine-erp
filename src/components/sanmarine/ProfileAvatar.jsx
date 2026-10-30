import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import { Image } from '@/components/ui/image';

// Default profile picture for every user: the scale (দাঁড়িপাল্লা) artwork; falls back to a scale icon when offline.
const AVATAR_URL = 'https://media.base44.com/images/public/6ac0a307a078cddcdc7973b9/180c04224_generated_image.png';

export default function ProfileAvatar({ className = 'h-10 w-10' }) {
  const [ok, setOk] = useState(true);
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`${className} relative block rounded-full overflow-hidden bg-card border border-border shrink-0`}>
      {(!loaded || !ok) && <Scale aria-label="প্রোফাইল" className="absolute inset-0 m-auto h-3/4 w-3/4 text-primary" />}
      {ok && <Image src={AVATAR_URL} alt="প্রোফাইল" fittingType="fit" loading="eager" decoding="async"
        className={`absolute inset-0 h-full w-full ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)} onError={() => setOk(false)} />}
    </span>
  );
}