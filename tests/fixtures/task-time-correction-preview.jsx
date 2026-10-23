import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BrainToaster from '@/components/ui/BrainToaster';
import TaskWorkHistory from '@/components/modules/TaskWorkHistory';
import { correctionPlan } from '@/lib/taskWorkCorrection';
import '@/index.css';

// Muestra local de «Corregir el tiempo» (23 de octubre de 2026), con la API simulada y la regla real
// (`correctionPlan`). `?dark` modo oscuro; `?pm` un project manager, que ve las sesiones pero no corrige.
const params = new URLSearchParams(location.search);
localStorage.setItem('authToken', 'demo');
document.documentElement.classList.toggle('dark', params.has('dark'));
document.body.className = params.has('dark') ? 'bg-zinc-950' : 'bg-zinc-50';
const H = 3_600_000, M = 60_000;
const start = (hoursAgo) => new Date(Date.now() - hoursAgo * H).toISOString();
const state = {
  task: { id: 't1', title: 'Reel de Aristea', status: 'EN_CURSO', startedAt: start(19), accumulatedWorkMs: 9 * H + 12 * M, _count: { collaborators: 0 } },
  sessions: [
    { id: 's1', cycleId: 'c1', startedAt: start(30), endedAt: new Date(Date.parse(start(30)) + 9 * H + 12 * M).toISOString(), durationMs: 9 * H + 12 * M, closeReason: 'PAUSED', isCollaborator: false },
    { id: 's2', cycleId: 'c1', startedAt: start(19), endedAt: null, durationMs: null, closeReason: null, isCollaborator: false }
  ]
};
const history = () => ({ task: state.task, cycles: [{ id: 'c1', sequence: 1, kind: 'INITIAL', closedAt: null, sessions: state.sessions }], recordedSessionMs: 0, historicalBaselineMs: 0 });
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = String(input);
  if (url.includes('/work-history')) return json(history());
  const match = url.match(/work-sessions\/([^/]+)\/correction/);
  if (match) {
    const body = JSON.parse(init.body);
    const session = state.sessions.find((row) => row.id === match[1]);
    const plan = correctionPlan({ task: state.task, session, durationMs: body.durationMinutes * M, reason: body.reason, actorId: 'u-rodny' });
    Object.assign(session, plan.session, { endedAt: plan.session.endedAt.toISOString(), correctedAt: new Date().toISOString() });
    if (plan.task) Object.assign(state.task, plan.task);
    return json({ label: 'Tiempo corregido', task: { status: state.task.status, startedAt: state.task.startedAt, accumulatedWorkMs: state.task.accumulatedWorkMs } });
  }
  return realFetch(input, init);
};

function Preview() {
  const [task, setTask] = useState(state.task);
  const user = { id: 'u-rodny', role: params.has('pm') ? 'PROJECT_MANAGER' : 'ADMIN', name: 'Rodny Chirinos' };
  return (
    <main className="mx-auto max-w-md p-6 text-zinc-700 dark:text-zinc-200">
      <p className="mb-3 text-sm" data-preview-status>Estado de la tarea: {task.status === 'EN_CURSO' ? 'En proceso' : 'Pendiente'}</p>
      <TaskWorkHistory taskId="t1" status={task.status} startedAt={task.startedAt} accumulatedWorkMs={task.accumulatedWorkMs} currentUser={user} onCorrected={(result) => setTask((prev) => ({ ...prev, ...result.task }))} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<><Preview /><BrainToaster /></>);
