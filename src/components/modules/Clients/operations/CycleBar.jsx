import React from 'react';
import { cn } from '@/lib/utils';
import { cycleSegments } from '@/lib/clientOperations';
import { STAGE_LABEL, STAGE_TONE } from './operationTones';

/** Una sola barra por ciclo: cada pieza pintada en la etapa más avanzada que alcanzó. */
export default function CycleBar({ cycle, className }) {
  const segments = cycleSegments(cycle);
  const total = Math.max(cycle?.quota || 0, cycle?.created || 0) || 1;
  const summary = segments.filter((s) => s.count).map((s) => `${s.count} ${STAGE_LABEL[s.key].toLowerCase()}`).join(', ');
  return (
    <div role="img" aria-label={summary || 'Sin piezas'} title={summary}
      className={cn('flex h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5', className)}>
      {segments.map((s) => s.count > 0 && (
        <span key={s.key} className={cn('h-full', STAGE_TONE[s.key], s.key !== 'faltante' && 'border-r border-white/70 last:border-r-0 dark:border-zinc-900/70')}
          style={{ width: `${(s.count / total) * 100}%` }} />
      ))}
    </div>
  );
}
