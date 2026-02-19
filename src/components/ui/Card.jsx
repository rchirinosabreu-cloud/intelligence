import React from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        // Glassmorphism Base
        "bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6",

        // Shadow & Glow
        "shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] ring-1 ring-white/5",

        // Interactive States
        "transition-all duration-500 ease-out",
        "hover:bg-zinc-900/60 hover:border-indigo-500/20 hover:ring-indigo-500/20 hover:shadow-[0_20px_48px_-12px_rgba(99,102,241,0.15)]",
        "group relative overflow-hidden",

        className
      )}
      {...props}
    >
      {/* Subtle Gradient Overlay for Depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

      {/* Content z-index fix */}
      <div className="relative z-10">
          {children}
      </div>
    </div>
  );
};
