import React from 'react';
import Avatar from 'boring-avatars';
import { cn } from '../../lib/utils';

// Vibrant, high-contrast palette for easy identification
const brainstudioColors = ["#ef4444", "#eab308", "#22c55e", "#06b6d4", "#d946ef", "#f97316"];

/**
 * TeamAvatar - RESTORED: A globally consistent avatar component for team members.
 * Supports real profile photos (avatarUrl or photo) with fallback to initials/beam.
 */
export default function TeamAvatar({ member, className, size = 32, showTitle = true }) {
  if (!member) {
    return (
      <div
        className={cn(
          "rounded-full flex items-center justify-center text-white shrink-0 shadow-sm overflow-hidden",
          "w-8 h-8", // Default sizing
          className
        )}
        title={showTitle ? "Desconocido" : undefined}
      >
        <Avatar
          size={size}
          name="Desconocido"
          variant="beam"
          colors={brainstudioColors}
        />
      </div>
    );
  }

  // Ensure member is an object (in case some old code passes just a string name)
  const name = typeof member === 'string' ? member : member.name || 'Desconocido';
  // Check for avatarUrl or photo (aliased in some responses)
  const avatarUrl = typeof member === 'string' ? null : (member.avatarUrl || member.photo);

  // Use the image if provided AND not empty string
  if (avatarUrl && avatarUrl.trim() !== '' && !avatarUrl.includes('null')) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={showTitle ? name : undefined}
        className={cn(
          "rounded-full object-cover shrink-0 shadow-sm border border-slate-200 dark:border-slate-800 transition-opacity duration-300",
          "w-8 h-8", // Default sizing
          className
        )}
        onError={(e) => {
            // If image fails, hide it to show initials or fallback if they were behind it
            // (but here we'll just let the browser show the alt text or we could implement a secondary state)
            e.target.style.display = 'none';
        }}
      />
    );
  }

  // Fallback with initials (Max 2 letters) - Exclusive logic
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  if (initials && initials.length > 0) {
    return (
      <div
        className={cn(
          "rounded-full shrink-0 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center bg-indigo-600",
          "w-8 h-8", // Default sizing
          className
        )}
        title={showTitle ? name : undefined}
      >
        <span className="text-[10px] font-black text-white tracking-tighter">
          {initials}
        </span>
      </div>
    );
  }

  // Final fallback to clean boring-avatar (no text)
  return (
    <div
      className={cn(
        "rounded-full shrink-0 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center bg-white",
        "w-8 h-8", // Default sizing
        className
      )}
      title={showTitle ? name : undefined}
    >
      <Avatar
        size={size}
        name={name}
        variant="beam"
        colors={brainstudioColors}
      />
    </div>
  );
}
