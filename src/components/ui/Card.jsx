import React from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        "bg-zinc-900/50 backdrop-blur-sm border border-zinc-800/60 rounded-2xl p-6",
        "transition-all duration-300 hover:border-zinc-700/80 hover:bg-zinc-900/80",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
