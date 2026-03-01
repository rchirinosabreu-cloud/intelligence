import React from 'react';
import Avatar from 'boring-avatars';
import { cn } from '../../lib/utils';

// Brainstudio palette (purples, dark blues, soft teals)
const brainstudioColors = ["#4f46e5", "#3730a3", "#0f172a", "#38bdf8", "#818cf8"];

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

  // Use the image if provided
  if (avatarUrl) {
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

  // Fallback to boring-avatars
  return (
    <div
      className={cn(
        "rounded-full shrink-0 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center bg-white",
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
    </div>
  );
}
