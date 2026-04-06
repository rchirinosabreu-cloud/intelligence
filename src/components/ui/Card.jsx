import React from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        // Base Layout & Transition
        "rounded-2xl p-6 transition-all duration-300 ease-out group relative overflow-hidden",

        // Light Mode Styles (Glassmorphism)
        "bg-white/70 backdrop-blur-xl border border-zinc-200/50 shadow-sm hover:shadow-md hover:bg-white/80 hover:border-zinc-300/50",

        // Dark Mode Styles (Glassmorphism)
        "dark:bg-zinc-900/60 dark:backdrop-blur-xl dark:border-white/10",
        "dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] dark:ring-1 dark:ring-white/5",

        // Dark Mode Interactive States
        "dark:hover:bg-zinc-900/70 dark:hover:border-indigo-500/20 dark:hover:ring-indigo-500/20 dark:hover:shadow-[0_20px_48px_-12px_rgba(99,102,241,0.15)]",

        className
      )}
      {...props}
    >
      {/* Subtle Gradient Overlay for Depth (Dark Mode Only) */}
      <div className="absolute inset-0 pointer-events-none opacity-0 dark:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/[0.02] to-transparent" />

      {children}
    </div>
  );
};
