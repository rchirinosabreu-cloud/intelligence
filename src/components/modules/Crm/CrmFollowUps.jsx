import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { AlertTriangle, CalendarClock, CalendarDays, HelpCircle, AlertCircle, Send } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import CrmFilters from './CrmFilters';
import CrmActivityForm from './CrmActivityForm';
import { useCrmFollowUps } from './crmApi';
import { StageBadge, TrafficLightDot, PriorityBadge, formatDate, relativeDays, leadTitle, leadSubtitle } from './crmPresentation';

const COLUMNS = [
  { key: 'VENCIDO', label: 'Vencidos', icon: AlertTriangle, tone: 'text-destructive', bar: 'bg-destructive', hint: 'Ya pasó la fecha. Gestiona o reprograma hoy.' },
  { key: 'HOY', label: 'Hoy', icon: CalendarClock, tone: 'text-brand-magenta-deep dark:text-brand-magenta', bar: 'bg-brand-magenta', hint: 'Lo que toca mover hoy.' },
  { key: 'SEMANA', label: 'Esta semana', icon: CalendarDays, tone: 'text-brand-cyan-deep dark:text-brand-cyan', bar: 'bg-brand-cyan', hint: 'Hasta el domingo.' },
  { key: 'SIN_FECHA', label: 'Sin fecha', icon: HelpCircle, tone: 'text-zinc-500 dark:text-zinc-400', bar: 'bg-zinc-400', hint: 'Abiertas sin próximo seguimiento. Ponles fecha.' }
];

const LeadCard = ({ lead, onOpen, onLog, bucket }) => (
  <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
    <button type="button" onClick={() => onOpen(lead.id)} className="block w-full text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{leadTitle(lead)}</p>
          <p className="truncate text-xs text-zinc-500">{leadSubtitle(lead) || lead.code}</p>
        </div>
        <TrafficLightDot value={lead.trafficLight?.value} className="mt-1.5" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StageBadge stage={lead.stage} />
        <PriorityBadge priority={lead.priority} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-700 dark:text-zinc-200">{lead.nextAction || <span className="text-zinc-400">Sin próxima acción definida</span>}</p>
    </button>
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
      <span className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        {lead.owner && <TeamAvatar member={lead.owner} className="h-5 w-5" size={20} />}
        {bucket === 'SIN_FECHA' ? 'Sin fecha' : `${formatDate(lead.nextFollowUpAt)} · ${relativeDays(lead.nextFollowUpAt)}`}
      </span>
      <button type="button" onClick={() => onLog(lead)} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">
        <Send className="h-3 w-3" /> Gestionar
      </button>
    </div>
  </article>
);

/** The daily work view: four buckets, each card can log a touch without leaving the screen. */
const CrmFollowUps = ({ filters, onFiltersChange, team, onOpenLead }) => {
  const { data, isLoading, error } = useCrmFollowUps(filters);
  const [logging, setLogging] = useState(null);
  const [active, setActive] = useState('VENCIDO');
  const buckets = data?.buckets || {};
  const counts = data?.counts || {};

  return (
    <div className="space-y-4">
      <CrmFilters filters={filters} onChange={onFiltersChange} team={team} show={['ownerId', 'priority', 'origin']} />

      {error && (
        <div className="brain-alert-surface rounded-2xl p-4 text-sm">
          <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> No pudimos cargar los seguimientos</div>
          <p className="mt-1 pl-6">{error.message}</p>
        </div>
      )}

      {/* Mobile: one bucket at a time */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-800/50 xl:hidden">
        {COLUMNS.map(column => (
          <button key={column.key} type="button" onClick={() => setActive(column.key)} className={cn('flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-semibold transition-colors', active === column.key ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500')}>
            {column.label} <span className="rounded-full bg-zinc-200 px-1.5 text-[10px] dark:bg-zinc-700">{counts[column.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {COLUMNS.map(column => {
          const Icon = column.icon;
          const items = buckets[column.key] || [];
          return (
            <section key={column.key} className={cn('flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40', active !== column.key && 'hidden xl:flex')} aria-label={column.label}>
              <div className={cn('h-1 rounded-t-2xl', column.bar)} />
              <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                <h2 className={cn('flex items-center gap-2 text-sm font-semibold', column.tone)}><Icon className="h-4 w-4" /> {column.label}</h2>
                <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{counts[column.key] ?? 0}</span>
              </header>
              <p className="px-4 pb-3 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{column.hint}</p>
              <div className="flex-1 space-y-2 px-3 pb-3">
                {isLoading ? [0, 1].map(item => <div key={item} className="h-28 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800" />) : items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-800">Nada por aquí.</p>
                ) : items.map(lead => <LeadCard key={lead.id} lead={lead} bucket={column.key} onOpen={onOpenLead} onLog={setLogging} />)}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={Boolean(logging)} onOpenChange={open => { if (!open) setLogging(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar gestión · {leadTitle(logging)}</DialogTitle>
            <DialogDescription>Queda en la bitácora y actualiza el próximo paso de la oportunidad.</DialogDescription>
          </DialogHeader>
          {logging && <CrmActivityForm leadId={logging.id} defaultNextAction="" compact onSaved={() => setLogging(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CrmFollowUps;
