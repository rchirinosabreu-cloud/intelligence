import React from 'react';

/**
 * PixelAvatar - High-fidelity Habbo-style pixel art characters.
 */
const PixelAvatar = ({ member, size = 64, state = 'working', className = "" }) => {
  const name = member?.name || "Member";

  // Custom profiles for the core team to match their "pixel soul"
  const getProfile = (name) => {
    const n = name.toLowerCase();
    if (n.includes('rodny')) return { hair: '#402010', shirt: '#4f46e5', skin: '#fcd34d', accessory: 'headphones' };
    if (n.includes('melissa')) return { hair: '#d97706', shirt: '#db2777', skin: '#fde68a', accessory: 'glasses' };
    if (n.includes('camila')) return { hair: '#1e1b4b', shirt: '#059669', skin: '#fef3c7', accessory: 'flower' };
    if (n.includes('gabriel')) return { hair: '#451a03', shirt: '#2563eb', skin: '#fcd34d', accessory: 'cap' };
    if (n.includes('pablo')) return { hair: '#71717a', shirt: '#1e293b', skin: '#fde68a', accessory: 'coffee' };
    if (n.includes('nájera') || n.includes('najera')) return { hair: '#1c1917', shirt: '#7c3aed', skin: '#fcd34d', accessory: 'watch' };

    // Default dynamic profile
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return {
      hair: `hsl(${hash % 360}, 30%, 20%)`,
      shirt: `hsl(${(hash + 120) % 360}, 60%, 50%)`,
      skin: '#fde68a'
    };
  };

  const profile = getProfile(name);
  const isMeeting = state === 'meeting';

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 16 20"
        className="w-full h-full drop-shadow-2xl"
        style={{ imageRendering: 'pixelated' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Shadow */}
        <ellipse cx="8" cy="18" rx="4" ry="1.5" fill="rgba(0,0,0,0.15)" />

        {/* Legs / Pants */}
        <rect x="6" y="14" width="2" height="4" fill="#1e293b" />
        <rect x="9" y="14" width="2" height="4" fill="#1e293b" />
        <rect x="6" y="17" width="2" height="1" fill="#000" />
        <rect x="9" y="17" width="2" height="1" fill="#000" />

        {/* Torso / Shirt */}
        <rect x="5" y="8" width="7" height="7" fill={profile.shirt} />
        <rect x="6" y="8" width="5" height="1" fill="rgba(0,0,0,0.1)" /> {/* Neck shadow */}

        {/* Arms */}
        <rect x="4" y="8" width="1" height="5" fill={profile.shirt} />
        <rect x="12" y="8" width="1" height="5" fill={profile.shirt} />
        <rect x="4" y="12" width="1" height="1" fill={profile.skin} /> {/* Hands */}
        <rect x="12" y="12" width="1" height="1" fill={profile.skin} />

        {/* Head */}
        <rect x="5" y="3" width="7" height="6" fill={profile.skin} />

        {/* Hair */}
        <rect x="5" y="2" width="7" height="2" fill={profile.hair} />
        <rect x="4" y="3" width="1" height="3" fill={profile.hair} />
        <rect x="12" y="3" width="1" height="3" fill={profile.hair} />

        {/* Eyes */}
        <rect x="6" y="5" width="1" height="1" fill="#000" />
        <rect x="10" y="5" width="1" height="1" fill="#000" />

        {/* Mouth */}
        <rect x="7" y="7" width="3" height="1" fill="rgba(0,0,0,0.1)" />

        {/* Accessories */}
        {profile.accessory === 'cap' && (
          <rect x="5" y="1" width="7" height="2" fill="#ef4444" />
        )}
        {profile.accessory === 'glasses' && (
           <rect x="5" y="5" width="7" height="1" fill="rgba(0,0,0,0.5)" />
        )}
        {profile.accessory === 'headphones' && (
          <>
            <rect x="4" y="3" width="1" height="4" fill="#1e293b" />
            <rect x="12" y="3" width="1" height="4" fill="#1e293b" />
            <rect x="5" y="2" width="7" height="1" fill="#1e293b" />
          </>
        )}

        {/* Interaction State Indicators */}
        {isMeeting && (
           <circle cx="14" cy="4" r="1.5" fill="#f59e0b" className="animate-pulse" />
        )}
        {!isMeeting && (
           <circle cx="14" cy="4" r="1.5" fill="#10b981" className="animate-pulse" />
        )}
      </svg>
    </div>
  );
};

export default PixelAvatar;
