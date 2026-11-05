import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ClientProjects from '@/components/modules/Clients/operations/ClientProjects';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

const team = [{ id: 'pm-lucia', name: 'Lucía Torres', isActive: true }, { id: 'pm-omar', name: 'Omar Ríos', isActive: true }];
const acceptedAt = '2026-11-02T14:00:00.000Z';
const makeProject = (id, title, modality, code, extra = {}) => ({
  id, formalizationId: `formalization-${id}`, clientId: 'client-aurora', title, modality,
  startDate: '2026-11-05', endDate: '2026-12-04', projectManagerId: team[0].id, projectManager: team[0],
  productionDays: 0, productionHours: null, reportRequired: false,
  deliverables: [{ id: `deliverable-${id}`, label: title, description: 'Alcance operativo aprobado.', quantity: 1, unit: 'entrega' }],
  notes: '', reviewStatus: 'PENDIENTE', revision: 1, reviewedAt: null, reviewedBy: null,
  createdAt: acceptedAt, updatedAt: acceptedAt, formalizationStatus: 'HABILITADO', enabledAt: acceptedAt,
  source: { quotationId: `quotation-${id}`, code, acceptedAt, quotationUpdatedAt: acceptedAt,
    scenarioId: 'approved', scenarioName: 'Alcance aprobado', title, execution: null,
    services: [{ id: `service-${id}`, label: title, description: 'Alcance operativo aprobado.', quantity: 1, billingType: modality === 'MENSUAL' ? 'MONTHLY' : 'ONE_TIME', group: '', execution: null }], phases: [] },
  missing: [], ...extra,
});
const store = {
  projects: [
    makeProject('monthly', 'Contenidos mensuales Aurora', 'MENSUAL', 'COT-0101', { reviewStatus: 'REVISADO', revision: 3, reviewedAt: '2026-11-05T02:00:00.000Z', reviewedBy: team[0] }),
    makeProject('catalog', 'Catálogo Aurora', 'PUNTUAL', 'COT-0102'),
    makeProject('pending', 'Página Aurora', null, 'COT-0103', { formalizationStatus: 'PENDIENTE', enabledAt: null, missing: ['Falta revisar el alcance.'] }),
  ],
  legacyContract: { id: 'legacy-monthly', serviceType: 'PARRILLA', deliverables: [{ format: 'Reel', quantity: 4 }], cutDay: 5 },
  calls: [], reloads: 0, failure: null,
};
const params = new URLSearchParams(location.search);
if (params.has('ambiguous')) {
  const project = store.projects.find(row => row.id === 'catalog');
  project.source = { ...project.source, scenarioId: null, scenarioName: null, issue: 'SCENARIO_UNRESOLVED', services: [] };
}
document.documentElement.classList.toggle('dark', params.has('dark'));
localStorage.setItem('currentUser', JSON.stringify({ id: 'project-preview-user', name: 'Persona de prueba' }));

function Preview() {
  const [projects, setProjects] = useState(() => structuredClone(store.projects));
  const [error, setError] = useState(null);
  window.__projectPreview = {
    state: () => structuredClone(store),
    failNext: (kind) => { store.failure = kind; },
    failRead: () => { setError('No se pudieron cargar los proyectos.'); },
  };
  const onRetry = async () => {
    store.reloads += 1;
    setError(null);
    const current = structuredClone(store.projects);
    setProjects(current);
    return current;
  };
  const onSave = async (project, input) => {
    store.calls.push({ id: project.id, input: structuredClone(input) });
    const current = store.projects.find(row => row.id === project.id);
    if (store.failure === 'conflict') {
      current.revision += 1;
      current.notes = 'Nota guardada por otra persona';
      store.failure = null;
      throw Object.assign(new Error('La ficha cambió en otra sesión. Carga su versión actual.'), { status: 409, code: 'PROJECT_REVISION_CONFLICT' });
    }
    if (store.failure === 'error') {
      store.failure = null;
      throw Object.assign(new Error('No se pudo guardar la ficha de prueba.'), { status: 500 });
    }
    if (input.expectedRevision !== current.revision) throw Object.assign(new Error('La revisión ya no está vigente.'), { status: 409, code: 'PROJECT_REVISION_CONFLICT' });
    if (current.formalizationStatus !== 'HABILITADO') throw Object.assign(new Error('El proyecto aún no está habilitado.'), { status: 409, code: 'PROJECT_NOT_ENABLED' });
    if (input.review && current.source.issue) throw Object.assign(new Error('Primero debe quedar resuelta la alternativa comercial aprobada.'), { status: 409, code: 'PROJECT_SOURCE_UNRESOLVED' });
    const { expectedRevision: _expectedRevision, review, ...fields } = input;
    const updated = { ...current, ...fields, revision: current.revision + 1,
      projectManager: team.find(person => person.id === fields.projectManagerId) || null,
      reviewStatus: review ? 'REVISADO' : 'PENDIENTE', updatedAt: '2026-11-04T16:00:00.000Z' };
    store.projects = store.projects.map(row => row.id === project.id ? updated : row);
    setProjects(structuredClone(store.projects));
    return structuredClone(updated);
  };
  return <BrowserRouter><main className="min-h-screen bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-8" data-preview-ready>
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Aurora · Operación del cliente</h1>
      <section aria-label="Contrato mensual existente" className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Contrato mensual existente</h2><p>4 reels por mes · Corte el día 5</p>
      </section>
      <ClientProjects projects={projects} team={team} loading={false} error={error} onRetry={onRetry} onSave={onSave} />
    </div>
  </main></BrowserRouter>;
}

createRoot(document.getElementById('root')).render(<Preview />);
