import React from 'react';
import portraitUrl from '@/assets/bria-chispa/idle.png';

// Vite versions this asset by content so an older cached mascot cannot survive a redesign.
// Every static Bria portrait, including the animated mascot's fallback, uses this identity.
export default function BriaPortrait({ alt = '', className = '', ...props }) {
  return <img {...props} src={portraitUrl} alt={alt} data-bria-portrait data-bria-design="chispa" className={`object-contain ${className}`} />;
}
