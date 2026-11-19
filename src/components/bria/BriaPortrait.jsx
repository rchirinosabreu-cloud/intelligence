import React from 'react';
import portraitUrl from '@/assets/bria-3d/cara.png';
import { Bria3D } from '@/components/bria/BriaBrand';

// Vite versions this asset by content so an older cached mascot cannot survive a redesign.
// Every static Bria portrait uses this identity: the 3D Bria (18 de noviembre de 2026). The small portrait is her face;
// with `mood` the whole character appears, animated, in that emotion (dialogs, the plan review).
export default function BriaPortrait({ alt = '', className = '', mood = null, ...props }) {
  if (mood) return <Bria3D {...props} mood={mood} alt={alt} data-bria-portrait className={className} />;
  return <img {...props} src={portraitUrl} alt={alt} data-bria-portrait data-bria-design="3d" className={`object-contain ${className}`} />;
}
