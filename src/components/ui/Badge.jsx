import React from 'react';
import { cn } from '@/lib/utils';

export const Badge = ({ children, variant = 'default', className }) => {
  const variants = {
    default: "bg-zinc-800 text-zinc-300 border-zinc-700",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    danger: "bg-red-500/10 text-red-400 border-red-500/20",
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  };

  const variantClass = variants[variant] || variants.default;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
        variantClass,
        className
      )}
    >
      {children}
    </span>
  );
};
