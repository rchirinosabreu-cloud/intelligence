import React, { useMemo } from 'react';
import { ArrowUpRight, CalendarClock } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { cn } from '@/lib/utils';

const BOGOTA = 'America/Bogota';

const dayKeyOf = (value) => {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  } catch {
    return null;
  }
};

const shiftDayKey = (dayKey, days) => {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

export const dayLabelFor = (dayKey, now = new Date()) => {
  const today = dayKeyOf(now);
  if (dayKey === today) return 'Hoy';
  if (dayKey === shiftDayKey(today, 1)) return 'Mañana';
  const [year, month, day] = dayKey.split('-').map(Number);
  return capitalize(new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(Date.UTC(year, month - 1, day))).replace(/\./g, ''));
};

// Proximity tones from the brand palette on a small dot: the closer, the warmer. Cards keep a full soft border.
const toneForOffset = (offset) => {
  if (offset <= 0) return 'bg-destructive';
  if (offset === 1) return 'bg-brand-coral';
  if (offset <= 3) return 'bg-brand-yellow';
  return 'bg-brand-cyan';
};

export const groupTasksByDay = (tasks = [], now = new Date()) => {
  const today = dayKeyOf(now);
  const groups = new Map();
  for (const task of tasks) {
    const dayKey = dayKeyOf(task.dueDate);
    if (!dayKey) continue;
    if (!groups.has(dayKey)) groups.set(dayKey, []);
    groups.get(dayKey).push(task);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dayKey, items]) => ({
      dayKey,
      label: dayLabelFor(dayKey, now),
      offsetDays: today ? Math.round((Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : 99,
      items
    }));
};

const DashboardUpcomingTasks = ({ tasks = [], className, limit = 8, now = new Date() }) => {
  const groups = useMemo(() => groupTasksByDay(tasks.slice(0, limit), now), [tasks, limit, now]);

  return (
    <section className={cn('brain-glass flex flex-col p-0', className)} aria-labelledby="dashboard-upcoming-title">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200/70 px-5 py-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-cyan/10 dark:bg-brand-cyan/15">
            <CalendarClock className="h-[18px] w-[18px] text-brand-cyan-deep dark:text-brand-cyan" />
          </span>
          <div>
            <h3 id="dashboard-upcoming-title" className="text-base font-semibold text-zinc-950 dark:text-white">Próximos pendientes</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Lo que vence en los próximos días</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-lg"
          title="Abrir gestión"
          aria-label="Abrir gestión"
          onClick={() => { window.location.href = '/gestion'; }}
        >
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4 px-5 py-4">
        {groups.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200/80 px-4 py-6 text-center dark:border-white/10">
            <CalendarClock className="mb-2 h-7 w-7 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Sin próximos vencimientos</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">No hay tareas futuras con fecha asignada.</p>
          </div>
        ) : groups.map((group) => (
          <div key={group.dayKey}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{group.label}</p>
            <ul className="space-y-2">
              {group.items.map((task) => (
                <li key={task.id}>
                  <a
                    href={`/gestion?taskId=${task.id}`}
                    className="flex items-start gap-3 rounded-xl border border-zinc-200/80 bg-white/60 px-3 py-2.5 transition-colors hover:border-zinc-300 hover:bg-white dark:border-white/10 dark:bg-zinc-950/30 dark:hover:border-white/20 dark:hover:bg-zinc-950/60"
                  >
                    {task.client && <ClientAvatar client={task.client} size={20} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{task.title}</span>
                      <span className="flex items-center gap-1.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', toneForOffset(group.offsetDays))} aria-hidden="true" />
                        {task.client?.name || 'Sin cliente'}
                        {task.isPriority ? ' · Prioritaria' : ''}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};

export default DashboardUpcomingTasks;
