import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ClientOperationPage from '@/components/modules/Clients/operations/ClientOperationPage';
import { cycleOf, summarizeCycle, evaluateClientOperation } from '@/lib/clientOperations';
import '@/index.css';

const today = '2026-11-05';
const previous = { ...summarizeCycle(cycleOf(2026, 10), Array.from({ length: 9 }, (_, i) => ({ id: `old-${i}`, planId: 'october-plan', date: `2026-10-${String(i + 2).padStart(2, '0')}`, status: 'PUBLICADO', format: 'Post', title: `Pieza anterior ${i + 1}` })), { quota: 12, today }), monthlyReport: true, report: { status: 'PENDIENTE' } };
const current = { ...summarizeCycle(cycleOf(2026, 11), [
  { id: 'late', planId: 'november-plan', date: '2026-11-03', status: 'EN_REVISION', format: 'Reel', title: 'Pieza con fecha pasada', copyText: 'Texto de prueba' },
  { id: 'next', planId: 'november-plan', date: '2026-11-25', status: 'APROBADO', format: 'Post', title: 'Pieza prevista para noviembre' },
], { quota: 12, today }), report: { status: 'PENDIENTE' } };
const client = {
  id: 'alerts-fiction', slug: 'fundacion-muestra', name: 'Fundación Muestra', agency: 'BRAIN', complexity: 'ALTA',
  projectManager: { id: 'pm', name: 'Ana Muestra' }, communityManager: { id: 'cm', name: 'Luis Muestra' },
  contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-09-01', endDate: '2026-10-31', cutDay: 1, deliverables: [{ format: 'Post', quantity: 4 }, { format: 'Reel', quantity: 8 }], productionDays: 1, monthlyReport: false },
  cycles: { current, previous }, history: [previous], work: { openTasks: 1, plans: ['noviembre'] },
  openTasks: [{ id: 'task', title: 'Ajustar publicación pendiente', overdue: true, dueDate: '2026-11-04', assignee: { id: 'pm', name: 'Ana Muestra' } }],
  observations: Array.from({ length: 6 }, (_, i) => ({ id: `note-${i}`, text: `Observación histórica ${i + 1}. Contexto conservado de la cuenta.`, source: 'EXCEL', label: 'Observaciones (MIO)', date: '2026-11-01' })),
};
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark');
window.__openedCycles = [];
const noOp = async () => {};
createRoot(document.getElementById('root')).render(<MemoryRouter><main className="min-h-screen bg-background p-6 text-foreground">
  <p className="mx-auto mb-4 max-w-7xl text-xs text-muted-foreground">Prueba local · datos ficticios para verificar alertas y navegación.</p>
  <ClientOperationPage client={client} evaluation={evaluateClientOperation(client, { today })} today={today} canManage currentUserId="pm" isAdmin
    onEditProfile={noOp} onNewTask={noOp} onOpenWorkspace={noOp} onOpenPlan={cycle => window.__openedCycles.push({ year: cycle.year, month: cycle.month })}
    onOpenTask={noOp} onAddObservation={async () => { throw new Error('Error ficticio de guardado'); }} onDeleteObservation={noOp}
    onSaveReport={noOp} onConfirmClose={noOp} onReopenClose={noOp} onMarkPublished={noOp} onUndoPublished={noOp} />
</main></MemoryRouter>);
