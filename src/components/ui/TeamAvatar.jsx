import React from 'react';
import { cn } from '../../lib/utils';

/**
 * TeamAvatar - A globally consistent avatar component for team members.
 *
 * @param {Object} props
 * @param {Object} props.member - The member object containing `name` and optionally `avatarUrl`.
 * @param {string} props.className - Tailwind classes to override the sizing/styling (e.g. "w-10 h-10").
 * @param {string} props.fallbackColor - A fallback tailwind color class if no avatarUrl is present. Default: "bg-primary"
 */
export default function TeamAvatar({ member, className, fallbackColor = "bg-primary" }) {
  if (!member) {
    return (
      <div
        className={cn(
          "rounded-full flex items-center justify-center text-white shrink-0 shadow-sm",
          "w-8 h-8 text-xs font-bold", // Default sizing
          "bg-slate-500", // Default unknown color
          className
        )}
        title="Desconocido"
      >
        ??
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

  // Fallback to initials with a consistent background
  // If we really want to use ui-avatars globally to match Team.jsx, we can do this:
  // const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`;
  // Let's use the UI Avatars API for true consistency with the existing Team module.
  const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`;

  return (
    <img
        src={uiAvatarUrl}
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
