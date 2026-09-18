import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Sparkles, X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { pickDashboardTip } from '@/lib/dashboardTips';

const storageKey = (userId, dayKey) => `brain:dashboard-tip:${userId || 'anon'}:${dayKey}`;

const readDismissed = (userId, dayKey) => {
  try {
    const raw = localStorage.getItem(storageKey(userId, dayKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Recordatorio o consejo del día: sale de la situación real de la persona (o, algunos días, de la
 * plataforma). Se puede ocultar por hoy en este dispositivo; mañana vuelve a decidirse.
 */
const DashboardTip = ({ dashboard, user, className, now = new Date() }) => {
  const userId = user?.id || user?.userId;
  const [dismissedIds, setDismissedIds] = useState([]);
  const tip = useMemo(() => pickDashboardTip({ dashboard, user, now, dismissedIds }), [dashboard, user, now, dismissedIds]);

  useEffect(() => {
    const initial = pickDashboardTip({ dashboard, user, now });
    if (initial?.dayKey) setDismissedIds(readDismissed(userId, initial.dayKey));
  }, [dashboard, user, now, userId]);

  if (!tip) return null;
  const isReminder = tip.kind === 'reminder';

  const dismiss = () => {
    const next = [...dismissedIds, tip.id];
    setDismissedIds(next);
    try { localStorage.setItem(storageKey(userId, tip.dayKey), JSON.stringify(next)); } catch { /* per-device convenience only */ }
  };

  return (
    <section className={cn('brain-glass flex items-start gap-3 p-4', className)} aria-labelledby="dashboard-tip-title" data-dashboard-tip={tip.id}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', isReminder ? 'bg-brand-coral/15 text-brand-coral-deep dark:text-brand-coral' : 'bg-brand-yellow/25 text-brand-yellow-deep dark:text-brand-yellow')}>
        <Sparkles className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{isReminder ? 'Recordatorio' : 'Consejo'}</p>
        <h3 id="dashboard-tip-title" className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-white">{tip.title}</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{tip.body}</p>
        {tip.actionUrl && (
          <a href={tip.actionUrl} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-cyan-deep hover:underline dark:text-brand-cyan">
            {tip.actionLabel || 'Abrir'}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Ocultar por hoy"
        title="Ocultar por hoy"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
};

export default DashboardTip;
