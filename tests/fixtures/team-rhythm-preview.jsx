import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ManagerTaskAnalytics from '@/components/modules/ManagerTaskAnalytics';
import { analyzeTeamRhythm } from '@/lib/teamRhythm';
import { buildLoadMap, loadSignals } from '@/lib/teamLoad';
import '@/index.css';

// Muestra local de la pestaña Ritmo de Manager con personas y tareas inventadas y la API simulada en el navegador.
// `?tab=ritmo` abre Ritmo (por defecto aquí), `?tab=observer` la bandeja, `&dark` modo oscuro,
// `&sinlectura` muestra la semana sin lectura todavía (Fase A, 10 de octubre de 2026).
const params = new URLSearchParams(location.search);
if (!params.get('tab')) history.replaceState(null, '', `${location.pathname}?tab=ritmo${params.has('dark') ? '&dark' : ''}${params.has('sinlectura') ? '&sinlectura' : ''}`);
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

// Mapa de carga: tareas abiertas inventadas sobre los próximos días hábiles a partir del viernes 9 de octubre de 2026.
let openSeq = 0;
const openTask = (personId, workType, dueDay, clientName, estimateMs) => ({ id: `o${++openSeq}`, title: `${workType}: ${clientName} ${openSeq}`, status: 'PENDIENTE', personId, workType, dueDay, clientName, estimateMs });
const openTasks = [
  openTask('a', 'Video', '2026-10-13', 'Nutresa', 4 * H), openTask('a', 'Video', '2026-10-13', 'Alpina', 4 * H), openTask('a', 'Video', '2026-10-13', 'Colanta', 4 * H),
  openTask('a', 'Reel', '2026-10-14', 'Nutresa', 2.6 * H), openTask('a', 'Reel', '2026-10-14', 'Alpina', 2.6 * H), openTask('a', 'Reel', '2026-10-14', 'Colanta', 2.6 * H),
  openTask('a', 'Video', '2026-10-16', 'Endova', 4 * H), openTask('a', 'Reel', '2026-10-20', 'Nutresa', 2.6 * H),
  openTask('b', 'Post', '2026-10-09', 'Alpina', 45 * M), openTask('b', 'Post', '2026-10-13', 'Alpina', 45 * M), openTask('b', 'Reel', '2026-10-15', 'Endova', 1.5 * H), openTask('b', 'Post', '2026-10-06', 'Nutresa', 45 * M), openTask('b', 'Post', '2026-10-07', 'Nutresa', 45 * M),
  openTask('c', 'Publicación', '2026-10-13', 'Colanta', 25 * M), openTask('c', 'Operaciones & Reuniones', null, 'Endova', H)
];
const loadMap = buildLoadMap({ people: people.map((p) => ({ personId: p.personId, personName: p.personName, avatarUrl: null })), tasks: openTasks, estimates: { byPersonType: {}, byType: {} }, today: '2026-10-09' });
const load = { ...loadMap, signals: loadSignals(loadMap) };

const readingBody = {
  summary: 'Andrés tiene el martes y el miércoles por encima de lo que cabe en un día, mientras Beatriz y Carlos tienen espacio. La mayor parte de lo cerrado por Carlos no tiene tiempo medido, así que todavía no se puede leer su ritmo.',
  decisions: [
    { title: 'Repartir los videos del martes de Andrés', why: 'Tiene tres videos de cuatro horas para el mismo día, doce horas estimadas en una jornada de ocho, y el miércoles viene igual de cargado con tres reels.', evidence: ['12 h estimadas el 13 de octubre en 3 tareas', '7 h 48 min estimadas el 14 de octubre', 'Beatriz tiene 45 min comprometidos ese martes'], urgency: 'alta', action: { kind: 'REASIGNAR', label: 'Abrir Video Colanta', personName: 'Andrés Ejemplo', taskId: 'o3', suggestedMessage: null } },
    { title: 'Mover a Beatriz las dos tareas vencidas o cerrar su fecha', why: 'Tiene dos posts con fecha pasada que siguen abiertos; si ya se hicieron, hay que cerrarlos; si no, moverles la fecha para que cuenten en la semana.', evidence: ['2 tareas vencidas que suman 1 h 30 min', 'Ambas de Nutresa, del 6 y 7 de octubre'], urgency: 'media', action: { kind: 'REVISAR_TAREA', label: 'Abrir Post Nutresa', personName: 'Beatriz Muestra', taskId: 'o12', suggestedMessage: null } },
    { title: 'Pedirle a Carlos que use el cronómetro', why: 'De sus siete tareas cerradas solo dos tienen tiempo medido, así que no es posible saber cuánto le toma publicar ni cuándo necesita apoyo.', evidence: ['2 de 7 cerradas con tiempo medido (29 %)', 'Una sesión de 4 h quedó simultánea con otra'], urgency: 'media', action: { kind: 'CONVERSAR', label: 'Pedírselo a Bria', personName: 'Carlos Prueba', taskId: null, suggestedMessage: 'Crea un pendiente para Carlos Prueba: poner en marcha el cronómetro en cada tarea que pase a En proceso esta semana, para poder leer su ritmo.' } },
    { title: 'Revisar el carrusel de Beatriz con retrabajo', why: 'Le tomó dos horas y una hora y media más de retrabajo; conviene saber si el brief estaba claro antes de asignarle el siguiente.', evidence: ['Carrusel del 4 de octubre: 2 h más 1 h 30 min de retrabajo'], urgency: 'baja', action: { kind: 'CONVERSAR', label: 'Pedírselo a Bria', personName: 'Beatriz Muestra', taskId: null, suggestedMessage: 'Recuérdame hablar con Beatriz Muestra sobre el carrusel del 4 de octubre: qué faltó en el brief para que hubiera hora y media de retrabajo.' } }
  ]
};
let reading = params.has('sinlectura') ? null : { id: 'r1', weekKey: '2026-W41', trigger: 'AUTOMATICO', periodDays: 30, reading: readingBody, model: 'gpt-local', generatedBy: 'Bria', generatedAt: '2026-10-05T12:00:00.000Z' };

const analytics = {
  overview: { totalWorkMs: 64 * H, initialWorkMs: 58 * H, reworkMs: 6 * H, reworkRate: 0.09, medianSessionMs: 52 * M, p75SessionMs: 95 * M, completedTasks: closed, activeTasks: 4, openSessions: 1, sessionCount: 61, taskCount: 28 },
  byCategory: [{ label: 'Producción Audiovisual', workMs: 30 * H, sessions: 20, tasks: 10 }, { label: 'Creativo & Diseño', workMs: 18 * H, sessions: 15, tasks: 12 }],
  byClient: [{ label: 'Cliente de ejemplo', workMs: 22 * H, sessions: 14, tasks: 8 }], byComplexity: [{ label: 'MEDIA', workMs: 40 * H, sessions: 30, tasks: 20 }],
  byResponsible: [{ label: 'Andrés Ejemplo', workMs: 25 * H, sessions: 18, tasks: 7 }],
  dataQuality: { inProgressWithoutSession: 1, unclassifiedTasks: 0, sessionsWithoutTask: 0, overlappingSessions: 0 }, recentSessions: []
};

const json = (body, delay = 0) => new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })), delay));
const realFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  if (url.pathname === '/api/manager/rhythm') return json(rhythm);
  if (url.pathname === '/api/manager/rhythm/load') return json(load);
  if (url.pathname === '/api/manager/rhythm/reading' && init.method === 'POST') {
    reading = { id: 'r2', weekKey: '2026-W41', trigger: 'MANUAL', periodDays: 30, reading: readingBody, model: 'gpt-local', generatedBy: 'Rodny Chirinos', generatedAt: new Date().toISOString() };
    return json(reading, 1200);
  }
  if (url.pathname === '/api/manager/rhythm/reading') return json({ weekKey: '2026-W41', reading, isCurrentWeek: Boolean(reading) });
  if (url.pathname === '/api/manager/task-analytics') return json(analytics);
  if (url.pathname.startsWith('/api/manager/observer-signals')) return json({ signals: [], summary: { active: 0, unverified: 0 }, lastScanAt: null });
  return realFetch(input, init);
};

createRoot(document.getElementById('root')).render(<BrowserRouter><ManagerTaskAnalytics /><Toaster /></BrowserRouter>);
