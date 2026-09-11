import React from 'react';
import { Trophy } from '@/components/ui/icons';
import { useRecognitionExperience } from './RecognitionContext';
import { recognitionTitlesForTask } from '@/lib/recognitionPresentation';

export default function TaskRecognitionLabels({ task }) {
  const experience = useRecognitionExperience();
  const events = Array.isArray(task?.recognitions) ? task.recognitions : experience?.events || [];
  const titles = recognitionTitlesForTask(task, events);
  if (!titles.length) return null;
  return <div data-task-recognitions aria-label="Reconocimientos de esta tarea" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-teal-700 dark:text-teal-300">
    {titles.map(title => <span key={title} className="inline-flex items-center gap-1.5"><Trophy className="h-3 w-3 shrink-0" aria-hidden="true" />{title}</span>)}
  </div>;
}
