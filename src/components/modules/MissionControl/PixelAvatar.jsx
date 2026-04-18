import React from 'react';

/**
 * PixelAvatar - Generates a pixel-art character SVG based on a name or ID.
 * This supports the "Habbo" style for the team.
 */
const PixelAvatar = ({ member, size = 64, state = 'working', className = "" }) => {
  const name = member?.name || "Member";

  // Simple deterministic color generation based on name for dynamic avatars
  const getHash = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
  };

  const hash = getHash(name);
  const skinTone = `hsl(${30 + (hash % 10)}, 60%, ${70 + (hash % 10)}%)`;
  const hairColor = `hsl(${(hash % 360)}, 40%, 30%)`;
  const shirtColor = member?.role === 'ADMIN' ? '#4f46e5' : `hsl(${(hash + 120) % 360}, 50%, 50%)`;

  // State-based offsets or animations can be added here
  const isWorking = state === 'working';
  const isMeeting = state === 'meeting';

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 16 16"
        className="w-full h-full"
        style={{ imageRendering: 'pixelated' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Simple Pixel Human Shape */}
        {/* Legs */}
        <rect x="6" y="12" width="2" height="3" fill="#333" />
        <rect x="9" y="12" width="2" height="3" fill="#333" />

        {/* Body */}
        <rect x="5" y="7" width="7" height="6" fill={shirtColor} />

        {/* Arms */}
        <rect x="4" y="7" width="1" height="4" fill={shirtColor} />
        <rect x="12" y="7" width="1" height="4" fill={shirtColor} />

        {/* Head */}
        <rect x="6" y="2" width="5" height="5" fill={skinTone} />

        {/* Hair */}
        <rect x="6" y="1" width="5" height="2" fill={hairColor} />
        <rect x="5" y="2" width="1" height="2" fill={hairColor} />
        <rect x="11" y="2" width="1" height="2" fill={hairColor} />

        {/* Eyes */}
        <rect x="7" y="4" width="1" height="1" fill="#000" />
        <rect x="10" y="4" width="1" height="1" fill="#000" />

        {/* Interaction indicator (Pixel style bubble if chating/working) */}
        {isWorking && (
          <circle cx="14" cy="3" r="1" fill="#22c55e" className="animate-pulse" />
        )}
      </svg>
    </div>
  );
};

export default PixelAvatar;
