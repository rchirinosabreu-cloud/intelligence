import assert from 'node:assert/strict';
import { briaAssistantTools } from '../../src/services/briaAssistantTools.js';
import { createTaskLifecycleFixture } from './briaTaskLifecycleFixture.js';

export const createInvestigationFixture = (ai, assistantOptions = {}) => {
  let consultedTasks = 0, consultedContent = 0, consultedActivity = 0;
  const piece = { id: 'piece-aurora', objective: 'Portada del taller', format: 'Post', publishDate: '2026-10-25T12:00:00Z', status: 'APROBADO', revisionRequestedAt: '2026-10-24T16:00:00Z', copyText: 'Portada', captionText: 'Taller Aurora', finalAssetKey: 'new-cover', _count: { finalAssets: 1 }, publications: [], tasks: [] };
  const fixture = createTaskLifecycleFixture(ai, {
    assistantOptions,
    knowledge: { list: async () => [], propose: async () => assert.fail('Investigation must not write knowledge') },
    assistantTools: briaAssistantTools.filter(tool => ['buscar_cliente', 'tareas_de_cliente', 'parrilla_de_cliente'].includes(tool.name)),
    assistantContext: {
      getTasks: async () => { consultedTasks++; return [{ id: 'task-aurora', title: 'Entregar portada del taller', status: 'PENDIENTE', dueDate: '2026-10-25T12:00:00Z', client: { name: 'Taller Aurora Ficticio' }, assignee: { name: 'Nora Sáenz' }, accumulatedWorkMs: 0 }]; },
      readActivity: async () => { consultedActivity++; return [{ id: 'lifecycle-nora', name: 'Nora Sáenz', status: 'REUNION', currentTask: null, currentEvent: { id: 'meeting', title: 'Revisión creativa', type: 'MEETING', startAt: '2026-10-24T16:00:00Z', endAt: '2026-10-24T18:00:00Z' } }]; }
    },
    extraDb: { contentPlan: { findFirst: async () => { consultedContent++; return { id: 'plan-aurora', month: 10, year: 2026, status: 'EN_PROCESO', client: { name: 'Taller Aurora Ficticio' }, contentItems: [piece] }; } } }
  });
  return { ...fixture, counts: () => ({ consultedTasks, consultedContent, consultedActivity }) };
};

export const runInvestigationScenario = async fixture => {
  const first = await fixture.send('Me preocupa entregar la portada del Taller Aurora Ficticio mañana. Investiga cómo está el trabajo, qué aprobación tenemos y si Nora está disponible ahora. Compara alternativas, dime qué información te falta y deja el asunto en seguimiento. No prepares ni ejecutes cambios todavía.');
  assert.ok(first.investigation, 'the investigation must be stored, not just described');
  assert.equal(first.pendingAction, undefined);
  assert.ok(first.investigation.alternativas.length >= 2);
  assert.equal(first.investigation.ejecucionAutorizada, false);
  assert.notEqual(first.investigation.estado, 'RESUELTO');
  for (const area of ['TAREAS', 'CONTENIDO', 'ACTIVIDAD']) assert.equal(first.investigation.cobertura.find(row => row.area === area)?.estado, 'CONSULTADA');
  const before = fixture.counts();
  assert.ok(Object.values(before).every(n => n > 0));
  const second = await fixture.send('Ya existe una tarea para esa entrega. ¿Eso basta para darlo por resuelto? Revisa otra vez las condiciones que dejaste y conserva el objetivo original.');
  assert.equal(second.investigation?.id, first.investigation.id);
  assert.notEqual(second.investigation.estado, 'RESUELTO', 'a pending task and new material awaiting approval do not resolve delivery');
  assert.deepEqual(second.investigation.comprobaciones.map(row => [row.id, row.criterio]), first.investigation.comprobaciones.map(row => [row.id, row.criterio]));
  assert.equal(fixture.created.length, 0);
  assert.equal(second.pendingAction, undefined);
  // The fixture meeting ends at 18:00 UTC = 13:00 Bogotá. Do not pass a run that
  // interprets UTC as local availability, even if its workflow assertions pass.
  for (const turn of [first, second]) assert.doesNotMatch(turn.text, /18:00|6\s*(?:p\.?\s*m\.?|de la tarde)/iu, 'meeting time must be stated in Bogotá, not UTC');
  const after = fixture.counts();
  assert.ok(after.consultedTasks > before.consultedTasks && after.consultedContent > before.consultedContent, 'follow-up uses new reads');
};
