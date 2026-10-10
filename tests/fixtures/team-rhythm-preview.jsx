import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import ManagerTaskAnalytics from '@/components/modules/ManagerTaskAnalytics';
import { analyzeTeamRhythm } from '@/lib/teamRhythm';
import '@/index.css';

// Muestra local de la pestaña Ritmo de Manager con personas y tareas inventadas y la API simulada en el navegador.
// `?tab=ritmo` abre Ritmo (por defecto aquí), `?tab=observer` la bandeja, `&dark` modo oscuro.
const params = new URLSearchParams(location.search);
if (!params.get('tab')) history.replaceState(null, '', `${location.pathname}?tab=ritmo${params.has('dark') ? '&dark' : ''}`);
localStorage.setItem('authToken', 'demo');
document.documentElement.classList.toggle('dark', params.has('dark'));
document.body.className = params.has('dark') ? 'bg-zinc-950' : 'bg-zinc-50';

const H = 3_600_000, M = 60_000;
let seq = 0;
const t = (personId, personName, workType, ms, day, extra = {}) => ({ id: `t${++seq}`, title: `${workType === 'Publicación' ? '[Publicar]' : '[Producción]'} ${workType}: Pieza de ejemplo ${seq}`, personId, personName, workType, completedDay: day, measuredMs: ms, reworkMs: 0, longestSessionMs: Math.min(ms, 3 * H), overlappedMs: 0, ...extra });
const tasks = [
  t('a', 'Andrés Ejemplo', 'Video', 4 * H, '2026-10-06'), t('a', 'Andrés Ejemplo', 'Video', 4 * H, '2026-10-06'), t('a', 'Andrés Ejemplo', 'Video', 30 * M, '2026-10-07'),
  t('a', 'Andrés Ejemplo', 'Reel', 2.6 * H, '2026-10-01'), t('a', 'Andrés Ejemplo', 'Reel', 2.8 * H, '2026-10-02'), t('a', 'Andrés Ejemplo', 'Reel', 2.4 * H, '2026-10-03'), t('a', 'Andrés Ejemplo', 'Reel', 0, '2026-10-04'),
  ...[40, 35, 50, 45, 38, 42].map((min, i) => t('b', 'Beatriz Muestra', 'Post', min * M, `2026-10-0${i + 1}`)), t('b', 'Beatriz Muestra', 'Post', 3 * H, '2026-10-08'),
  t('b', 'Beatriz Muestra', 'Reel', 1.4 * H, '2026-10-02'), t('b', 'Beatriz Muestra', 'Reel', 1.6 * H, '2026-10-03'), t('b', 'Beatriz Muestra', 'Reel', 1.5 * H, '2026-10-05'),
  t('b', 'Beatriz Muestra', 'Carrusel', 2 * H, '2026-10-04', { reworkMs: 1.5 * H }),
  ...[0, 0, 0, 0, 50 * M].map((ms, i) => t('c', 'Carlos Prueba', 'Operaciones & Reuniones', ms, `2026-10-0${i + 1}`)), t('c', 'Carlos Prueba', 'Publicación', 0, '2026-10-06', { overlappedMs: 4 * H }), t('c', 'Carlos Prueba', 'Publicación', 25 * M, '2026-10-06')
];
const { people, types } = analyzeTeamRhythm({ tasks });
const taskMap = Object.fromEntries(tasks.map((task) => [task.id, { title: task.title, workType: task.workType, day: task.completedDay, personName: task.personName, measuredMs: task.measuredMs }]));
const closed = people.reduce((s, p) => s + p.closed, 0), measured = people.reduce((s, p) => s + p.measured, 0);
const rhythm = { period: { days: 30 }, team: { closed, measured, coverage: measured / closed }, people, types, tasks: taskMap };
const analytics = {
  overview: { totalWorkMs: 64 * H, initialWorkMs: 58 * H, reworkMs: 6 * H, reworkRate: 0.09, medianSessionMs: 52 * M, p75SessionMs: 95 * M, completedTasks: closed, activeTasks: 4, openSessions: 1, sessionCount: 61, taskCount: 28 },
  byCategory: [{ label: 'Producción Audiovisual', workMs: 30 * H, sessions: 20, tasks: 10 }, { label: 'Creativo & Diseño', workMs: 18 * H, sessions: 15, tasks: 12 }],
  byClient: [{ label: 'Cliente de ejemplo', workMs: 22 * H, sessions: 14, tasks: 8 }], byComplexity: [{ label: 'MEDIA', workMs: 40 * H, sessions: 30, tasks: 20 }],
  byResponsible: [{ label: 'Andrés Ejemplo', workMs: 25 * H, sessions: 18, tasks: 7 }],
  dataQuality: { inProgressWithoutSession: 1, unclassifiedTasks: 0, sessionsWithoutTask: 0, overlappingSessions: 0 }, recentSessions: []
};

const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  if (url.pathname === '/api/manager/rhythm') return json(rhythm);
  if (url.pathname === '/api/manager/task-analytics') return json(analytics);
  if (url.pathname.startsWith('/api/manager/observer-signals')) return json({ signals: [], summary: { active: 0, unverified: 0 }, lastScanAt: null });
  return realFetch(input, init);
};

createRoot(document.getElementById('root')).render(<><ManagerTaskAnalytics /><Toaster /></>);
