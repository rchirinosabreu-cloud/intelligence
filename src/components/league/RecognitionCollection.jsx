import React from 'react';
import { Award, CalendarClock, Check, Flame, Sparkles, Sun } from '@/components/ui/icons';
import { recognitionLabels, recognitionMessages } from '@/lib/recognitionPresentation';
import { leagueMonthLabel } from '@/lib/platformLeague';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const badges = {
  FIRST_TASK: { icon: Sun, tone: 'bg-brand-yellow/20 text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow', face: 'bg-brand-yellow text-zinc-950 border-brand-yellow-deep/30' },
  EARLY_DELIVERY: { icon: Award, tone: 'bg-brand-cyan/10 text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan', face: 'bg-brand-cyan text-white border-brand-cyan-deep/40' },
  DAILY_EIGHT: { icon: Flame, tone: 'bg-brand-coral/15 text-brand-coral-deep dark:bg-brand-coral/15 dark:text-brand-coral', face: 'bg-brand-coral text-zinc-950 border-brand-coral-deep/40' },
  CAUGHT_UP: { icon: Check, tone: 'bg-brand-green/10 text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green', face: 'bg-brand-green text-zinc-950 border-brand-green-deep/40' },
  PLAN_APPROVED: { icon: CalendarClock, tone: 'bg-brand-magenta/10 text-brand-magenta-deep dark:bg-brand-magenta/15 dark:text-brand-coral', face: 'bg-brand-magenta text-white border-brand-magenta-deep/40' },
  WEEKLY_FIFTY: { icon: Sparkles, tone: 'bg-brand-yellow/15 text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow', face: 'bg-brand-yellow text-zinc-950 border-brand-yellow-deep/30' },
};

export function RecognitionMedal({ kind, earned = true, small = false }) {
  const badge = badges[kind] || badges.FIRST_TASK;
  const Icon = badge.icon;
  return <span aria-hidden="true" className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full', small ? 'h-10 w-10' : 'h-20 w-20', earned ? badge.tone : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500')}>
    {!small && <span className={cn('absolute -bottom-1 h-8 w-9 rounded-b-lg border-b-4 rotate-6', earned ? badge.face : 'border-zinc-300 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700')} />}
    <span className={cn('relative flex items-center justify-center rounded-full border-b-4 ring-4 ring-inset ring-white/25', small ? 'h-9 w-9' : 'h-16 w-16', earned ? badge.face : 'border-zinc-300 bg-zinc-200 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-400')}>
      <Icon className={small ? 'h-5 w-5' : 'h-8 w-8'} strokeWidth={2} />
    </span>
    {earned && !small && <Sparkles className="absolute -right-1 top-0 h-5 w-5" />}
  </span>;
}

const dateLabel = value => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }).format(new Date(value));

export function RecognitionHistory({ data, compact = false }) {
  const rows = compact ? data.recent.slice(0, 2) : data.recent;
  return <div data-recognition-history>
    {!rows.length ? <p className="py-3 text-sm text-zinc-500 dark:text-zinc-400">Tu colección de {leagueMonthLabel(data.month)} está por comenzar.</p> : <ul className="divide-y divide-zinc-100 dark:divide-white/5">
      {rows.map(row => <li key={row.id} className="flex items-center gap-3 py-3">
        <RecognitionMedal kind={row.kind} small />
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{recognitionLabels[row.kind]}</p><time dateTime={row.occurredAt} className="text-xs text-zinc-500 dark:text-zinc-400">{dateLabel(row.occurredAt)}</time></div>
        <Check aria-label="Obtenido" className="h-4 w-4 text-brand-green-deep dark:text-brand-green" />
      </li>)}
    </ul>}
    {!compact && data.hasMore && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Mostrando los 12 más recientes de {data.total} reconocimientos del mes.</p>}
  </div>;
}

export function RecognitionStatus({ query, children }) {
  if (query.isError) return <div role="alert" className="rounded-2xl border border-zinc-200 p-4 text-sm dark:border-white/10"><p>No pudimos cargar tus logros.</p><Button variant="ghost" className="mt-2" onClick={() => query.refetch()}>Reintentar logros</Button></div>;
  if (!query.data) return <p role="status" className="py-4 text-sm text-zinc-500 dark:text-zinc-400">Cargando tus logros…</p>;
  return children(query.data);
}

export default function RecognitionCollection({ data }) {
  return <>
    <div className="text-center"><p className="text-xl font-bold">Pequeñas victorias, grandes hábitos</p><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{data.total} {data.total === 1 ? 'reconocimiento' : 'reconocimientos'} en {leagueMonthLabel(data.month)}</p></div>
    <div data-recognition-collection className="grid grid-cols-2 gap-3">
      {Object.entries(recognitionLabels).map(([kind, label]) => {
        const count = data.counts[kind] || 0;
        return <details key={kind} data-recognition-badge={kind} data-earned={count > 0} className={cn('group rounded-2xl border bg-white dark:bg-zinc-900', count ? 'border-zinc-200 dark:border-white/15' : 'border-dashed border-zinc-200 dark:border-white/10')}>
          <summary className="flex cursor-pointer list-none flex-col items-center rounded-2xl px-2 py-4 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan [&::-webkit-details-marker]:hidden">
            <RecognitionMedal kind={kind} earned={count > 0} />
            <span className="mt-4 text-sm font-semibold">{label}</span>
            <span className={cn('mt-1 rounded-full px-2 py-0.5 text-xs', count ? badges[kind].tone : 'text-zinc-500 dark:text-zinc-400')}>{count ? `Obtenido ×${count}` : 'Por descubrir'}</span>
          </summary>
          <p className="px-3 pb-4 text-center text-xs leading-5 text-zinc-600 dark:text-zinc-300">{recognitionMessages[kind]}</p>
        </details>;
      })}
    </div>
    <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">Estas insignias celebran tus logros. Por ahora no añaden puntos al puntaje mensual.</p>
    <section><h3 className="text-sm font-semibold">Tus últimos logros</h3><RecognitionHistory data={data} /></section>
  </>;
}
