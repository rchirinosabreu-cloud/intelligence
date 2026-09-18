import React from 'react';
import { ArrowUpRight, Target } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LIGHT_DOT = {
  ROJO: 'bg-destructive',
  AMARILLO: 'bg-brand-yellow',
  VERDE: 'bg-brand-green'
};

const BUCKET_LABEL = {
  VENCIDO: { label: 'Seguimiento vencido', className: 'text-destructive' },
  HOY: { label: 'Seguimiento hoy', className: 'text-brand-coral-deep dark:text-brand-coral' }
};

const formatFollowUp = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year) return null;
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day))).replace(/\./g, '');
};

/**
 * «Tu CRM pide atención»: personal, calculado en el servidor para el dueño del dashboard.
 * Sin permiso `crm` o sin oportunidades que lo pidan, no se pinta nada.
 */
const DashboardCrmAttention = ({ attention, className }) => {
  if (!attention?.enabled) return null;
  const items = attention.items || [];
  if (items.length === 0) return null;
  const counts = attention.counts || {};

  return (
    <section className={cn('brain-glass flex flex-col p-0', className)} aria-labelledby="dashboard-crm-title">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200/70 px-5 py-4 dark:border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-magenta/10 dark:bg-brand-magenta/15">
            <Target className="h-[18px] w-[18px] text-brand-magenta-deep dark:text-brand-magenta" />
          </span>
          <div className="min-w-0">
            <h3 id="dashboard-crm-title" className="text-base font-semibold text-zinc-950 dark:text-white">Tu CRM pide atención</h3>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {[
                counts.overdue ? `${counts.overdue} ${counts.overdue === 1 ? 'vencido' : 'vencidos'}` : null,
                counts.today ? `${counts.today} para hoy` : null,
                counts.red ? `${counts.red} en rojo` : null
              ].filter(Boolean).join(' · ') || 'Oportunidades a tu cargo'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-lg"
          title="Abrir CRM"
          aria-label="Abrir CRM"
          onClick={() => { window.location.href = '/crm'; }}
        >
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>

      <ul className="divide-y divide-zinc-200/70 dark:divide-white/10">
        {items.map((item) => {
          const bucket = BUCKET_LABEL[item.followUpBucket] || null;
          const isRed = item.trafficLight === 'ROJO';
          return (
            <li key={item.id}>
              <a
                href={`/crm/oportunidades/${item.id}`}
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-white/60 dark:hover:bg-white/5"
              >
                <span
                  className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', LIGHT_DOT[item.trafficLight] || 'bg-zinc-300')}
                  title={item.trafficLightReason || item.trafficLight || ''}
                  aria-label={`Semáforo ${item.trafficLight || 'sin dato'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.company || item.contactName || item.code}</span>
                    {isRed && <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">Rojo</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {item.stageLabel}
                    {item.nextAction ? ` · ${item.nextAction}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  {bucket && <span className={cn('block font-semibold', bucket.className)}>{bucket.label}</span>}
                  {!bucket && isRed && item.trafficLightReason && <span className="block max-w-[140px] truncate text-zinc-500 dark:text-zinc-400">{item.trafficLightReason}</span>}
                  {item.nextFollowUpAt && <span className="block text-zinc-400 dark:text-zinc-500">{formatFollowUp(item.nextFollowUpAt)}</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default DashboardCrmAttention;
