import React, { useState } from 'react';
import Select from '@/components/ui/Select';
import { BrainDatePicker, BrainTimePicker } from '@/components/ui/BrainDatePicker';
import { focusDeadlineIso, focusTimeFromIso } from '@/lib/taskFocus';
import TaskAssignmentForecast from '@/components/tasks/TaskAssignmentForecast';

export default function AssignmentScenario({ task, personId, people }) {
  const [assigneeId, setAssigneeId] = useState(personId), [dueDay, setDueDay] = useState(task.dueDay || '');
  const [hour, setHour] = useState(focusTimeFromIso(task.deadlineAt) || '');
  return <div className="mt-3 space-y-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900" data-assignment-scenario>
    <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">Compara otra asignación o fecha. La tarea conserva sus datos; esta simulación no guarda cambios. La publicación sigue siendo un límite si la pieza tiene hora.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400"><span className="block">Responsable del escenario</span><Select aria-label="Responsable del escenario" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>{people.map(p => <option key={p.personId} value={p.personId}>{p.personName}</option>)}</Select></label>
      <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400"><span className="block">Fecha del escenario</span><BrainDatePicker ariaLabel="Fecha del escenario" value={dueDay} onChange={setDueDay} /></label>
      <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400"><span className="block">Hora del escenario</span><BrainTimePicker className="h-11" ariaLabel="Hora del escenario" value={hour} onChange={setHour} /></label>
    </div>
    <TaskAssignmentForecast taskId={task.id} title={task.title} clientId={task.clientId} assigneeId={assigneeId} dueDay={dueDay} focusDeadlineAt={focusDeadlineIso(dueDay, hour)} />
  </div>;
}
