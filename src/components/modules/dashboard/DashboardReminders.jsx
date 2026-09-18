import React, { useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Sparkles, Target, X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { bogotaDayKey, listDashboardReminders } from '@/lib/dashboardTips';

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

const BUCKET_LABEL = {
  VENCIDO: 'Seguimiento vencido',
  HOY: 'Seguimiento hoy'
};

const formatFollowUp = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year) return null;
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day))).replace(/\./g, '');
};

/** Oportunidades del CRM que piden atención, como recordatorios de la misma lista. */
const crmReminders = (attention) => {
  if (!attention?.enabled) return [];
  return (attention.items || []).map((item) => {
    const isRed = item.trafficLight === 'ROJO';
    const when = BUCKET_LABEL[item.followUpBucket] || (isRed ? 'Semáforo en rojo' : 'Oportunidad');
    const date = formatFollowUp(item.nextFollowUpAt);
    return {
      id: `crm-${item.id}`,
      kind: 'crm',
      isRed,
      title: item.company || item.contactName || item.code || 'Oportunidad',
      body: [item.stageLabel, item.nextAction].filter(Boolean).join(' · '),
      meta: [when, date].filter(Boolean).join(' · '),
      reason: item.trafficLightReason || null,
      actionLabel: 'Abrir oportunidad',
      actionUrl: `/crm/oportunidades/${item.id}`
    };
  });
};

const KIND_STYLE = {
  reminder: 'bg-brand-coral/15 text-brand-coral-deep dark:text-brand-coral',
  tip: 'bg-brand-yellow/25 text-brand-yellow-deep dark:text-brand-yellow',
  crm: 'bg-brand-magenta/10 text-brand-magenta-deep dark:text-brand-magenta'
};

const KIND_LABEL = { reminder: 'Recordatorio', tip: 'Consejo', crm: 'CRM' };

/**
 * «Recordatorios»: todo lo que pide atención en la gestión de esta persona hoy, a la altura de Anuncios.
 * Sin efectos: el reloj se fija una vez por montaje y las ocultaciones se leen en el estado inicial.
 * (Un efecto que dependía de `new Date()` congeló la plataforma el 18 de septiembre de 2026.)
 */
const DashboardReminders = ({ dashboard, user, className, now }) => {
  const nowRef = useRef(now || new Date());
  const userId = user?.id || user?.userId;
  const dayKey = bogotaDayKey(nowRef.current);
  const [dismissedIds, setDismissedIds] = useState(() => readDismissed(userId, dayKey));

  const items = useMemo(() => [
    ...(user ? listDashboardReminders({ dashboard, user, now: nowRef.current, dismissedIds }) : []),
    ...crmReminders(dashboard?.crmAttention)
  ], [dashboard, user, dismissedIds]);

  const dismiss = (tip) => {
    const next = [...dismissedIds, tip.id];
    setDismissedIds(next);
    try { localStorage.setItem(storageKey(userId, tip.dayKey || dayKey), JSON.stringify(next)); } catch { /* per-device convenience only */ }
  };

  const crmCount = items.filter((item) => item.kind === 'crm').length;
  const subtitle = items.length === 0
    ? 'Sobre tu gestión de hoy'
    : `${items.length} ${items.length === 1 ? 'punto' : 'puntos'} sobre tu gestión${crmCount ? ` · ${crmCount} del CRM` : ''}`;

  return (
    <section className={cn('brain-glass flex min-w-0 flex-col overflow-hidden p-0', className)} aria-labelledby="dashboard-reminders-title">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200/70 px-5 py-4 dark:border-white/10">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-coral/15 text-brand-coral-deep dark:text-brand-coral">
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 id="dashboard-reminders-title" className="text-base font-semibold text-zinc-950 dark:text-white">Recordatorios</h3>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto custom-scrollbar">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-6 text-center">
            <Sparkles className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Todo al día</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Cuando algo de tu gestión pida atención, aparecerá aquí.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/10">
            {items.map((item) => {
              const kind = KIND_STYLE[item.kind] ? item.kind : 'reminder';
              const Icon = kind === 'crm' ? Target : Sparkles;
              return (
                <li key={item.id} className="flex min-w-0 items-start gap-3 px-5 py-3" data-dashboard-reminder={item.id}>
                  <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', KIND_STYLE[kind])}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {KIND_LABEL[kind]}
                      {item.isRed && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-destructive">Rojo</span>}
                      {item.meta && <span className="normal-case tracking-normal text-brand-coral-deep dark:text-brand-coral">{item.meta}</span>}
                    </p>
                    <h4 className="mt-0.5 truncate text-sm font-semibold text-zinc-950 dark:text-white" title={item.title}>{item.title}</h4>
                    {item.body && <p className="mt-0.5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.body}</p>}
                    {item.reason && <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400" title={item.reason}>{item.reason}</p>}
                    {item.actionUrl && (
                      <a href={item.actionUrl} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-cyan-deep hover:underline dark:text-brand-cyan">
                        {item.actionLabel || 'Abrir'}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  {kind !== 'crm' && (
                    <button
                      type="button"
                      onClick={() => dismiss(item)}
                      aria-label="Ocultar por hoy"
                      title="Ocultar por hoy"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default DashboardReminders;
