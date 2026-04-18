import React from 'react';
import { cn } from '@/lib/utils';

/**
 * PixelAvatar - A pixel-art representation of team members for Mission Control.
 * This component uses a mix of pixelated silhouettes and specific color palettes
 * to identify team members (Rodny, Melissa, Camila, Gabriel, Pablo).
 */
const PixelAvatar = ({ name, status, className }) => {
  const memberName = name?.toLowerCase() || ''; const getPalette = (n) => { if (n.includes('rodny')) return palettes.rodny; if (n.includes('melissa')) return palettes.melissa; if (n.includes('camila')) return palettes.camila; if (n.includes('gabriel')) return palettes.gabriel; if (n.includes('pablo')) return palettes.pablo; return palettes.default; };

  // Color Palettes based on member characteristics/branding
  const palettes = {
    rodny: { primary: '#4f46e5', secondary: '#818cf8', accent: '#312e81' }, // Indigo
    melissa: { primary: '#db2777', secondary: '#f472b6', accent: '#831843' }, // Pink
    camila: { primary: '#059669', secondary: '#34d399', accent: '#064e3b' }, // Emerald
    gabriel: { primary: '#d97706', secondary: '#fbbf24', accent: '#78350f' }, // Amber
    pablo: { primary: '#2563eb', secondary: '#60a5fa', accent: '#1e3a8a' }, // Blue
    default: { primary: '#4b5563', secondary: '#9ca3af', accent: '#111827' } // Gray
  };

  const palette = getPalette(memberName);
  const isUnavailable = status === 'unavailable' || status === 'off';

  return (
    <div className={cn("relative inline-block", className)}>
      {/* 8-bit Style Container */}
      <div
        className="relative w-16 h-16 bg-white border-2 border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        style={{ imageRendering: 'pixelated' }}
      >
        {/* Simplified 8-bit Face Silhouette using SVG for crisp pixel edges */}
        <svg viewBox="0 0 16 16" className="w-full h-full">
          {/* Background Layer */}
          <rect x="0" y="0" width="16" height="16" fill="#fce7f3" fillOpacity="0.3" />

          {/* Hair/Head Base Layer (Pixelated Shape) */}
          <rect x="4" y="2" width="8" height="8" fill={palette.accent} />
          <rect x="3" y="4" width="10" height="6" fill={palette.accent} />

          {/* Face Layer */}
          <rect x="5" y="5" width="6" height="6" fill="#fef3c7" />

          {/* Eyes (Pixelated) */}
          <rect x="6" y="7" width="1" height="1" fill="#000" />
          <rect x="9" y="7" width="1" height="1" fill="#000" />

          {/* Body/Shoulders */}
          <rect x="3" y="11" width="10" height="5" fill={palette.primary} />
          <rect x="5" y="10" width="6" height="2" fill={palette.secondary} />

          {/* Overlay if Unavailable */}
          {isUnavailable && (
            <rect x="0" y="0" width="16" height="16" fill="rgba(0,0,0,0.4)" />
          )}
        </svg>
      </div>

      {/* Unavailable Badge */}
      {isUnavailable && (
        <div className="absolute -top-1 -right-1 bg-red-500 border-2 border-black p-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <X_Icon />
        </div>
      )}
    </div>
  );
};

// Internal pixelated X icon
const X_Icon = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 1L7 7M7 1L1 7" stroke="white" strokeWidth="2" strokeLinecap="square"/>
  </svg>
);

export default PixelAvatar;
