import React from 'react';
import Avatar from 'boring-avatars';
import { cn } from '../../lib/utils';

// Vibrant, high-contrast palette for easy identification
const brainstudioColors = ["#ef4444", "#eab308", "#22c55e", "#06b6d4", "#d946ef", "#f97316"];

/**
 * TeamAvatar - A globally consistent avatar component for team members.
 *
 * @param {Object} props
 * @param {Object} props.member - The member object containing `name` and optionally `avatarUrl`.
 * @param {string} props.className - Tailwind classes to override the sizing/styling (e.g. "w-10 h-10").
 * @param {number} props.size - The size in pixels for the boring-avatar fallback. Default: 32.
 */
export default function TeamAvatar({ member, className, size = 32 }) {
  if (!member) {
    return (
      <div
        className={cn(
          "rounded-full flex items-center justify-center text-white shrink-0 shadow-sm overflow-hidden",
          "w-8 h-8", // Default sizing
          className
        )}
        title="Desconocido"
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
  const avatarUrl = typeof member === 'string' ? null : member.avatarUrl;

  // Use the image if provided AND not empty string
  if (avatarUrl && avatarUrl.trim() !== '' && !avatarUrl.includes('null')) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={name}
        className={cn(
          "rounded-full object-cover shrink-0 shadow-sm border border-slate-200 dark:border-slate-800",
          "w-8 h-8", // Default sizing
          className
        )}
      />
    );
  }

  // Fallback with initials (Max 2 letters) inside the boring-avatar style
  // We use the boring-avatar as the base and overlay the initials for clarity
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "rounded-full shrink-0 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center bg-white relative",
        "w-8 h-8", // Default sizing
        className
      )}
      title={name}
    >
      <Avatar
        size={size}
        name={name}
        variant="beam"
        colors={brainstudioColors}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/10">
        <span className="text-[10px] font-black text-white drop-shadow-md tracking-tighter">
          {initials}
        </span>
      </div>
    </div>
  );
}
