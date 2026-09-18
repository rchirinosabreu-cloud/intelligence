import React, { useMemo, useRef } from 'react';
import { ArrowUpRight, CalendarDays, Video } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dayLabelFor } from './DashboardUpcomingTasks';

const BOGOTA = 'America/Bogota';

const timeOf = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-CO', { timeZone: BOGOTA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  } catch {
    return '';
  }
};

const RESPONSE_LABELS = {
  accepted: { label: 'Confirmada', className: 'bg-brand-green/15 text-brand-green-deep dark:text-brand-green' },
  tentative: { label: 'Por confirmar', className: 'bg-brand-yellow/25 text-brand-yellow-deep dark:text-brand-yellow' },
  declined: { label: 'Rechazada', className: 'bg-destructive/10 text-destructive' },
  needsAction: { label: 'Sin responder', className: 'bg-zinc-200/70 text-zinc-600 dark:bg-white/10 dark:text-zinc-300' }
};

export const groupMeetingsByDay = (meetings = [], now = new Date()) => {
  const groups = new Map();
  for (const meeting of meetings) {
    const dayKey = meeting.dayKey;
    if (!dayKey) continue;
    if (!groups.has(dayKey)) groups.set(dayKey, []);
    groups.get(dayKey).push(meeting);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dayKey, items]) => ({ dayKey, label: dayLabelFor(dayKey, now), items }));
};

/** Reuniones donde la persona está citada (payload `dashboard.meetings`), agrupadas por día. */
const DashboardMeetings = ({ meetings = [], className, now }) => {
  // Fixed once per mount: a `new Date()` default would change every render and defeat the memo.
  const nowRef = useRef(now || new Date());
  const groups = useMemo(() => groupMeetingsByDay(meetings, nowRef.current), [meetings]);

  return (
    <section className={cn('brain-glass flex min-w-0 flex-col overflow-hidden p-0', className)} aria-labelledby="dashboard-meetings-title">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200/70 px-5 py-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-green/10 dark:bg-brand-green/15">
            <CalendarDays className="h-[18px] w-[18px] text-brand-green-deep dark:text-brand-green" />
          </span>
          <div>
            <h3 id="dashboard-meetings-title" className="text-base font-semibold text-zinc-950 dark:text-white">Reuniones</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Donde estás citado esta semana</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-lg"
          title="Abrir actividad"
          aria-label="Abrir actividad"
          onClick={() => { window.location.href = '/actividad'; }}
        >
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-w-0 space-y-4 px-5 py-4">
        {groups.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200/80 px-4 py-6 text-center dark:border-white/10">
            <CalendarDays className="mb-2 h-7 w-7 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Sin reuniones próximas</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Cuando te citen a una reunión en Actividad o Google Calendar, aparecerá aquí.</p>
          </div>
        ) : groups.map((group) => (
          <div key={group.dayKey}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{group.label}</p>
            <ul className="space-y-2">
              {group.items.map((meeting) => {
                const response = RESPONSE_LABELS[meeting.responseStatus] || null;
                return (
                  <li
                    key={meeting.occurrenceKey || meeting.id}
                    className="flex min-w-0 items-start gap-3 rounded-xl border border-zinc-200/80 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-950/30"
                    title={meeting.title}
                  >
                    <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                      {meeting.isAllDay ? 'Todo el día' : timeOf(meeting.startAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{meeting.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {!meeting.isAllDay && meeting.endAt && <span>hasta {timeOf(meeting.endAt)}</span>}
                        {response && (
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', response.className)}>{response.label}</span>
                        )}
                      </span>
                    </span>
                    {meeting.meetingLink && (
                      <a
                        href={meeting.meetingLink}
                        target="_blank"
                        rel="noreferrer noopener"
                        title="Entrar a la reunión"
                        aria-label={`Entrar a ${meeting.title}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-brand-cyan-deep transition-colors hover:bg-brand-cyan/10 dark:text-brand-cyan"
                      >
                        <Video className="h-4 w-4" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};

export default DashboardMeetings;
