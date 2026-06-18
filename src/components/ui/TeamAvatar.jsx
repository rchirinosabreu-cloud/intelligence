import React from 'react';
import { cn } from '../../lib/utils';
import { getDeterministicColor, getClientInitials } from '../../utils/avatarUtils';

/**
 * TeamAvatar - "Zero Image" Style.
 * Renders exclusively using deterministic initials and corporate colors.
 * Protocol: Initials (Deterministic BG) > Fallback Beam.
 */
export default function TeamAvatar({ member, className, size: customSize = 32, showTitle = true }) {

  // Guard against missing member
  if (!member) {
    return (
      <div
        className={cn(
          "rounded-full flex items-center justify-center bg-zinc-100 text-zinc-400 shrink-0 shadow-sm border border-zinc-200",
          "w-8 h-8",
          className
        )}
      >
        <span className="text-[10px] font-black">??</span>
      </div>
    );
  }

  const name = typeof member === 'string' ? member : member.name || 'Desconocido';
  const id = typeof member === 'string' ? name : member.id || name;

  const initials = getClientInitials(name);
  const bgColor = getDeterministicColor(id);

  // Standardizing sizes for team avatars too if needed,
  // but for now keeping compatibility with the existing w-8 h-8 default.
  return (
    <div
      className={cn(
        "rounded-full shrink-0 shadow-sm border border-white/10 overflow-hidden flex items-center justify-center transition-all",
        "w-8 h-8", // Default
        className
      )}
      style={{
        backgroundColor: bgColor,
        width: className?.includes('w-') ? undefined : customSize,
        height: className?.includes('h-') ? undefined : customSize
      }}
      title={showTitle ? name : undefined}
    >
      <span className="text-white font-black tracking-tighter select-none font-sans" style={{ fontSize: '11px' }}>
        {initials}
      </span>
    </div>
  );
}
