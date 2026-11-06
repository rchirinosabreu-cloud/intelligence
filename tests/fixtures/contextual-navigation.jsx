import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from '@/components/modules/Dashboard';
import Manager from '@/components/modules/ManagerTaskAnalytics';
import Quotations from '@/components/modules/Quotations/QuotationsLayout';
import BackToOrigin, { useScrollMemory } from '@/components/layout/BackToOrigin';
import { RHYTHM_POLICY } from '@/lib/workPrediction';

// Componentes de navegación reales; respuestas ficticias, sin sesión ni servicios externos.
const day = '2026-11-05';
const task = { id: 'task-demo', title: 'Diseñar una pieza de muestra', clientName: 'Cliente Faro', dueDay: day, dueDate: `${day}T18:00:00Z`, source: 'sin_estimacion', ms: 0, risk: 'unknown' };
const person = { personId: 'person-demo', personName: 'Ana Ejemplo', status: 'sin_datos', dueCount: 1, overdueCount: 0, riskCount: 1, tightCount: 0, tasks: [task], weekMs: 0, overdue: { count: 0 }, undated: { count: 0 }, cells: [{ day, count: 1, ms: 0, level: 'libre', tasks: [task] }] };
const json = value => Promise.resolve(new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
window.fetch = (input, options = {}) => {
  if (options.method && options.method !== 'GET') throw new Error('La muestra no admite escrituras');
  const url = new URL(String(input), location.origin);
  if (url.pathname === '/api/team') return json([{ id: 'person-demo', userId: 'user-ana', name: 'Ana Ejemplo', role: 'Diseño' }]);
  if (url.pathname === '/api/clients') return json([]);
  if (url.pathname.startsWith('/api/dashboard/personal/')) return json({ member: { userId: url.pathname.split('/').at(-1), name: 'Ana Ejemplo' }, stats: {}, achievements: [], upcomingTasks: [task], meetings: [{ id: 'meeting-demo', title: 'Reunión de muestra', dayKey: day, startAt: `${day}T18:00:00Z`, meetingLink: 'https://meet.example.invalid/demo' }], clients: [] });
  if (url.pathname === '/api/manager/rhythm/load') return json({ days: [day], today: day, capacityMs: 28800000, people: [person], forecast: { policy: RHYTHM_POLICY, window: url.searchParams.get('window') || 'week', days: [day], weekEnd: day, summary: { dueCount: 1, attentionCount: 1, withSpace: 0 }, people: [person] } });
  if (url.pathname === '/api/manager/rhythm') return json({ period: { days: Number(url.searchParams.get('days')) || 30 }, team: { measured: 0, closed: 0, coverage: 0 }, people: [], types: [], profiles: [], hours: [] });
  if (url.pathname === '/api/manager/rhythm/reading') return json({ isCurrentWeek: true, reading: { generatedBy: 'Bria', generatedAt: `${day}T12:00:00Z`, reading: { predictionPolicy: RHYTHM_POLICY, summary: 'Lectura ficticia para verificar el regreso.', decisions: [{ title: 'Revisar la pieza de ejemplo', why: 'Hace falta revisar su alcance.', action: { kind: 'REVISAR_TAREA', taskId: task.id, label: 'Abrir pendiente de ejemplo' } }] } } });
  if (url.pathname === '/api/manager/task-analytics') return json({ overview: {}, byCategory: [], byClient: [], byComplexity: [], byResponsible: [], recentSessions: [], dataQuality: {} });
  if (url.pathname === '/api/quotations') return json([
    { id: 'quote-demo', client_name: 'Ana Ejemplo', client_company: 'Cliente Faro', consecutive_formatted: 'COT-0001', created_at: `${day}T12:00:00Z`, status: 'ACTIVA', total_amount: 100000, currency: 'COP', items: [], uuid_slug: 'public-demo' },
    { id: 'quote-other', client_name: 'Bea Muestra', client_company: 'Cliente Brisa', consecutive_formatted: 'COT-0002', created_at: `${day}T12:00:00Z`, status: 'BORRADOR', total_amount: 50000, currency: 'COP', items: [] },
  ]);
  throw new Error(`Lectura no prevista en la muestra: ${url.pathname}`);
};

function Shell() {
  const current = useLocation(), navigate = useNavigate();
  useScrollMemory();
  window.__navigationState = current;
  window.__go = (to, state) => navigate(to, { state });
  return <main className="mx-auto max-w-7xl space-y-6 p-4 text-foreground sm:p-6"><BackToOrigin /><Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/manager" element={<Manager />} />
    <Route path="/cotizaciones" element={<Quotations />} />
    <Route path="*" element={<h1 data-destination className="text-xl font-semibold">Destino de prueba: {current.pathname}</h1>} />
  </Routes></main>;
}
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
createRoot(document.getElementById('root')).render(<BrowserRouter><QueryClientProvider client={queryClient}><Shell /></QueryClientProvider></BrowserRouter>);
