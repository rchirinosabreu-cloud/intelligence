import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ClientOperationDialog from '@/components/modules/Clients/operations/ClientOperationDialog';
import ClientOperationPage from '@/components/modules/Clients/operations/ClientOperationPage';
import { cycleOf, summarizeCycle, evaluateClientOperation, normalizeOperationProfile, contractQuota } from '@/lib/clientOperations';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

const today = '2026-11-04';
const current = { ...summarizeCycle(cycleOf(2026, 11), [
  { id: 'piece-one', planId: 'plan-fiction', date: '2026-11-02', format: 'Reel', title: 'Presentación del taller ficticio', status: 'PUBLICADO' },
  { id: 'piece-two', planId: 'plan-fiction', date: '2026-11-10', format: 'Reel', title: 'Una idea para la comunidad', status: 'APROBADO' },
  { id: 'piece-three', planId: 'plan-fiction', date: '2026-11-18', format: 'Reel', title: 'El proceso en tres pasos', status: 'REALIZADO' },
  { id: 'piece-four', planId: 'plan-fiction', date: '2026-11-26', format: 'Reel', title: 'Cierre de la campaña de muestra', status: 'EN_REVISION' },
], { quota: 4, today }), report: { status: 'EN_ELABORACION' }, close: null };
const initial = {
  id: 'fiction-scope-client', name: 'Taller Horizonte · muestra', slug: 'taller-horizonte-muestra', agency: 'BRAIN', complexity: 'MEDIA',
  description: 'Marca ficticia para revisar el alcance operativo y sus unidades.',
  projectManager: { id: 'fiction-pm', name: 'Ángela Muestra' }, communityManager: { id: 'fiction-cm', name: 'Tomás Muestra' },
  contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-10-01', endDate: '2027-03-31', cutDay: 1, deliverables: [{ format: 'Reel', quantity: 4 }], storiesPerWeek: 3, productionDays: 1, monthlyReport: true, notes: '',
    scopeDetails: { version: 1, contentLimits: [{ format: 'Reel', quantity: 6, rule: 'MAXIMO' }],
      contentGroups: [{ formats: ['Reel', 'Video'], quantity: 6, rule: 'MAXIMO' }],
      stories: { quantity: 8, period: 'MES', perOccasion: null },
      production: { included: true, quantity: 2, period: 'CONTRATO', hours: 4, rule: 'EXACTA', hoursRule: 'MAXIMO' },
      additionalServices: [{ id: 'fiction-blog', category: 'BLOG', label: 'Artículos del taller', quantity: 2, unit: 'artículos', frequency: 'MES', notes: 'Contenido editorial separado de las piezas para redes.' }],
      reviewPending: 'Confirmar la fecha de la segunda jornada.',
    } },
  cycles: { current }, history: [], observations: [], openTasks: [], work: { openTasks: 0, plans: ['noviembre'] },
};
const dark = new URLSearchParams(window.location.search).get('theme') === 'dark';
const scenario = new URLSearchParams(window.location.search).get('scenario');
if (scenario === 'no-renewal') {
  Object.assign(initial.contract, { endDate: '2026-10-31', renewalDecision: 'NO_RENOVAR', renewalDecisionAt: '2026-10-20T15:00:00Z', renewalDecisionByName: 'Ángela Muestra' });
  initial.canAuthorizeWork = true;
  initial.canSuspend = true;
  initial.suspensionCandidate = { fromCycle: '2026-12' };
}
if (scenario === 'shared') {
  initial.contract.deliverables = [{ format: 'Sin clasificar', quantity: 6 }];
  initial.contract.scopeDetails.contentLimits = [];
  initial.contract.scopeDetails.contentGroups = [{ formats: ['Post', 'Carrusel', 'Reel'], quantity: 6, rule: 'EXACTA' }];
  initial.contract.scopeDetails.reviewPending = null;
} else if (scenario === 'flexible') {
  initial.contract.deliverables = [{ format: 'Sin clasificar', quantity: 20 }];
  initial.contract.scopeDetails.contentLimits = [{ format: 'Carrusel', quantity: 4, rule: 'MAXIMO' }, { format: 'Post', quantity: 10, rule: 'MAXIMO' }];
  initial.contract.scopeDetails.contentGroups = [{ formats: ['Reel', 'Video', 'Carrusel', 'Post'], quantity: 20, rule: 'EXACTA' }, { formats: ['Reel', 'Video'], quantity: 6, rule: 'MAXIMO' }];
  initial.contract.scopeDetails.reviewPending = null;
} else if (scenario === 'partial') {
  initial.contract.deliverables = [{ format: 'Post', quantity: 4 }, { format: 'Video', quantity: 6 }, { format: 'Sin clasificar', quantity: 2 }];
  initial.contract.scopeDetails.contentLimits = [];
  initial.contract.scopeDetails.contentGroups = [];
  initial.contract.scopeDetails.reviewPending = 'Confirmar el formato de 2 contenidos.';
}
initial.cycles.current = { ...summarizeCycle(cycleOf(2026, 11), current.pieces, { quota: contractQuota(initial.contract), today }), report: current.report, close: null };
document.documentElement.classList.toggle('dark', dark);

function Preview() {
  const [client, setClient] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('Prueba local · Todos los datos son ficticios.');
  const save = async input => {
    const check = normalizeOperationProfile(input);
    if (!check.valid) throw Object.assign(new Error('Revisa los campos marcados.'), { errors: check.errors });
    setClient(value => ({ ...value, contract: { ...value.contract, ...check.value.contract }, ...Object.fromEntries(['description', 'instagramUrl', 'agency', 'complexity'].map(key => [key, check.value[key]])) }));
    window.__scopeSaved = structuredClone(input);
    setNotice('Cambios guardados solo en la memoria de esta muestra.');
    setEditing(false);
  };
  return <main className="min-h-screen bg-background px-6 py-5 text-foreground">
    <div className="mx-auto mb-4 max-w-7xl rounded-xl border border-border px-4 py-2 text-xs text-muted-foreground" role="status">{notice}</div>
    <ClientOperationPage client={client} evaluation={evaluateClientOperation(client, { today })} today={today} canManage currentUserId="fiction-pm" isAdmin
      onEditProfile={() => setEditing(true)} onNewTask={() => setNotice('La tarea no se crea en esta muestra.')} onOpenWorkspace={() => setNotice('Espacio ficticio del cliente.')} onOpenPlan={() => setNotice('Parrilla ficticia de la muestra.')} onOpenTask={() => {}}
      onAddObservation={async () => {}} onDeleteObservation={async () => {}}
      onSaveReport={async () => {}} onConfirmClose={async () => {}} onReopenClose={async () => {}} onMarkPublished={() => {}} onUndoPublished={() => {}} />
    {editing && <ClientOperationDialog client={client} team={[{ id: 'fiction-other', name: 'Otra persona de muestra' }]} onClose={() => setEditing(false)} onSave={save} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><Preview /></MemoryRouter>);
