import React, { useEffect, useState } from 'react';
import { formatElapsedTime, getTaskElapsedMs } from '@/lib/taskTiming';

export default function TaskTimerBadge({ task }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (String(task?.status || '').toUpperCase() !== 'EN_CURSO') return undefined;
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [task?.status, task?.startedAt]);

  if (String(task?.status || '').toUpperCase() !== 'EN_CURSO') return null;

  return (
    <span
      className="ml-0.5 text-[10px] font-bold uppercase tracking-tighter tabular-nums text-zinc-500"
      aria-label={`Tiempo de trabajo ${formatElapsedTime(getTaskElapsedMs(task, now))}`}
    >
      {formatElapsedTime(getTaskElapsedMs(task, now))}
    </span>
  );
}
