import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Big-number tile for the commercial dashboard.
 * tone: 'neutral' | 'hero' (brand gradient) | 'positive' | 'attention' | 'negative' | 'magenta'
 */
const tones = {
  neutral: { card: 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950', value: 'text-zinc-950 dark:text-zinc-50', label: 'text-zinc-500 dark:text-zinc-400', icon: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300' },
  hero: { card: 'brain-gradient-primary border-transparent shadow-md shadow-brand-cyan/20', value: 'text-white', label: 'text-white/80', icon: 'bg-white/20 text-white' },
  positive: { card: 'border-status-positive/30 bg-status-positive/[0.07] dark:border-status-positive/30 dark:bg-status-positive/10', value: 'text-zinc-950 dark:text-zinc-50', label: 'text-zinc-500 dark:text-zinc-400', icon: 'bg-status-positive text-white' },
  attention: { card: 'border-status-attention/40 bg-status-attention/[0.12] dark:border-status-attention/30 dark:bg-status-attention/10', value: 'text-zinc-950 dark:text-zinc-50', label: 'text-zinc-500 dark:text-zinc-400', icon: 'bg-status-attention text-zinc-900' },
  negative: { card: 'border-destructive/25 bg-destructive/[0.06] dark:border-destructive/30 dark:bg-destructive/10', value: 'text-zinc-950 dark:text-zinc-50', label: 'text-zinc-500 dark:text-zinc-400', icon: 'bg-destructive text-white' },
  magenta: { card: 'border-brand-magenta/25 bg-brand-magenta/[0.06] dark:border-brand-magenta/30 dark:bg-brand-magenta/10', value: 'text-zinc-950 dark:text-zinc-50', label: 'text-zinc-500 dark:text-zinc-400', icon: 'bg-brand-magenta text-white' }
};

const CrmStatCard = ({ icon: Icon, label, value, detail, tone = 'neutral', className, onClick, ...props }) => {
  const style = tones[tone] || tones.neutral;
  const Tag = onClick ? 'button' : 'article';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-h-[7.5rem] flex-col justify-between rounded-2xl border p-4 text-left transition-shadow sm:p-5',
        onClick && 'cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        style.card, className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn('text-xs font-medium', style.label)}>{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', style.icon)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div>
        <p className={cn('text-3xl font-bold tracking-tight tabular-nums sm:text-4xl', style.value)}>{value ?? '—'}</p>
        {detail && <p className={cn('mt-1 text-xs leading-5', style.label)}>{detail}</p>}
      </div>
    </Tag>
  );
};

export default CrmStatCard;
