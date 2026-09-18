import React from 'react';
import { Smartphone as Phone, Mail, MessageCircle, Link2, Video, FileText, MessageSquareText, StickyNote, ArrowRight } from '@/components/ui/icons';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { activityLabel, formatDateTime, formatDate, stageLabel } from './crmPresentation';

const icons = {
  LLAMADA: Phone, CORREO: Mail, WHATSAPP: MessageCircle, MENSAJE_LINKEDIN: Link2, REUNION: Video,
  PROPUESTA_ENVIADA: FileText, RESPUESTA_CLIENTE: MessageSquareText, NOTA: StickyNote, CAMBIO_ETAPA: ArrowRight
};

const tones = {
  RESPUESTA_CLIENTE: 'bg-brand-green/15 text-brand-green-deep dark:text-brand-green',
  REUNION: 'bg-brand-green/15 text-brand-green-deep dark:text-brand-green',
  PROPUESTA_ENVIADA: 'bg-brand-magenta/10 text-brand-magenta-deep dark:text-brand-magenta',
  CAMBIO_ETAPA: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  NOTA: 'bg-status-attention/20 text-status-attention-fg'
};

/** Chronological log of everything that happened with the lead. Newest first, nothing gets deleted. */
const CrmActivityTimeline = ({ activities = [], emptyMessage = 'Todavía no hay gestiones registradas. La primera llamada, correo o mensaje aparece aquí.' }) => {
  if (activities.length === 0) {
    return <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">{emptyMessage}</p>;
  }
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-zinc-200 dark:before:bg-zinc-800" data-crm-timeline>
      {activities.map(activity => {
        const Icon = icons[activity.type] || StickyNote;
        const isStage = activity.type === 'CAMBIO_ETAPA';
        return (
          <li key={activity.id} className="relative flex gap-3 pl-0">
            <span className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-zinc-950', tones[activity.type] || 'bg-brand-cyan/12 text-brand-cyan-deep dark:text-brand-cyan')}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className={cn('min-w-0 flex-1 rounded-xl border px-4 py-3', isStage ? 'border-dashed border-zinc-200 bg-transparent dark:border-zinc-800' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950')}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {isStage ? <>{activity.fromStage ? stageLabel(activity.fromStage) : 'Inicio'} <ArrowRight className="mx-1 inline h-3 w-3 text-zinc-400" /> {stageLabel(activity.toStage)}</> : activityLabel(activity.type)}
                </p>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{formatDateTime(activity.occurredAt)}{activity.editedAt ? ' · editada' : ''}</span>
              </div>
              {activity.note && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-200">{activity.note}</p>}
              {activity.result && (
                <p className="mt-1.5 text-sm leading-6 text-zinc-700 dark:text-zinc-200"><span className="font-semibold text-zinc-500 dark:text-zinc-400">Resultado: </span>{activity.result}</p>
              )}
              {(activity.nextAction || activity.nextFollowUpAt) && (
                <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 rounded-lg bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <span className="font-semibold">Siguiente:</span> {activity.nextAction || '—'}
                  {activity.nextFollowUpAt && <span className="text-zinc-400">· {formatDate(activity.nextFollowUpAt)}</span>}
                </p>
              )}
              {activity.author && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <TeamAvatar member={activity.author} className="h-4 w-4" size={16} showTitle={false} /> {activity.author.name}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default CrmActivityTimeline;
