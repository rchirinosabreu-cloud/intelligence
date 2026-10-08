import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';
import { createBriaTaskDraftService } from '../../src/services/briaTaskDraftService.js';
import { createBriaConversationService } from '../../src/services/briaConversationService.js';
import { createBriaTaskTools } from '../../src/services/briaTaskTools.js';
import { runAssistant } from '../../src/lib/briaAssistant.js';
const output = process.env.SCREENSHOT_DIR || 'output/bria-tasks'; await mkdir(output, { recursive: true });
const chats = new Map(), tasks = new Map(), sent = [];
const client = { id: 'client', name: 'Empresa demo', slug: 'demo', isArchived: false }, member = { id: 'member', name: 'Lucía demo', isActive: true };
const taskDrafts = createBriaTaskDraftService({ db: { client: { findMany: async () => [client], findUnique: async () => client }, teamMember: { findMany: async () => [member], findUnique: async () => member }, task: { findUnique: async ({ where }) => tasks.get(where.id) } }, now: () => new Date('2026-10-08T17:00:00Z'), createTask: async (payload, { taskId }) => { const row = { id: taskId, ...payload }; tasks.set(taskId, row); return row; } });
const repository = {
  list: async () => [...chats.values()], create: async () => { const row = { id: randomUUID(), revision: 0, title: 'Nueva conversación', turns: [] }; chats.set(row.id, row); return row; }, get: async (_actor, id) => chats.get(id),
  append: async (_actor, id, revision, question, result) => { const row = chats.get(id); assert.equal(row.revision, revision); const reply = typeof result === 'function' ? await result() : result; row.turns.push({ role: 'user', text: question }, { role: 'assistant', text: reply.answer, ...reply }); row.revision++; return row; }
};
const assistant = { ask: async request => {
  let called = false;
  return runAssistant({ ...request, tools: createBriaTaskTools(taskDrafts), today: '2026-10-08', person: { name: 'Kamila' }, context: { taskDraft: request.taskDraft, taskAttachments: request.taskAttachments, taskEvidence: request.taskEvidence }, ai: { generate: async () => {
    if (called) return { text: 'El borrador está preparado.' }; called = true;
    const args = request.taskDraft?.client ? { contexto: 'Preparar tres piezas del lanzamiento; adaptar el diseño al brief actualizado.', prioridad: 'urgente' } : { titulo: 'Preparar piezas del lanzamiento', contexto: 'Preparar tres piezas para revisión interna.', cliente: 'Empresa demo', responsable: 'Lucía', fecha: 'mañana' };
    return { functionCalls: [{ id: 'prepare', name: 'preparar_pendiente', args }], output: [{ type: 'function_call', call_id: 'prepare', name: 'preparar_pendiente', arguments: JSON.stringify(args) }] };
  } } });
} };
const service = createBriaConversationService({ repository, taskDrafts, assistant, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }) });
const preview = await createBriaPreview({ port: 3741, conversationService: service });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().endsWith('/messages')) sent.push(JSON.parse(request.postData()).question); });
try {
  await page.goto(`${preview.origin}/?abierta&role=admin`);
  const panel = page.getByRole('region', { name: 'Conversación con Bria' }), composer = page.getByLabel('Mensaje para Bria');
  await panel.waitFor(); await page.waitForFunction(() => !document.querySelector('[aria-label="Nueva conversación"]')?.disabled);
  await composer.fill('Necesito crear un pendiente para Lucía, para mañana, para Empresa demo: preparar tres piezas para revisión interna.'); await composer.press('Enter');
  await panel.getByRole('button', { name: 'Continuar sin insumos', exact: true }).click();
  await panel.getByRole('button', { name: 'Alta', exact: true }).click();
  await panel.getByRole('button', { name: 'Crear pendiente', exact: true }).waitFor(); assert.equal(tasks.size, 0);
  await composer.fill('Cambia la prioridad a urgente y añade al contexto: adaptar el diseño al brief actualizado.'); await composer.press('Enter');
  await page.getByText('Prioridad: Urgente', { exact: false }).last().waitFor();
  await page.screenshot({ path: path.join(output, 'bria-pendiente-resumen.png') });
  await page.goto(`${preview.origin}/?abierta&role=admin&dark`);
  await panel.getByRole('button', { name: 'Crear pendiente', exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'bria-pendiente-oscuro.png') });
  await page.goto(`${preview.origin}/?abierta&role=admin`);
  await panel.getByRole('button', { name: 'Crear pendiente', exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Crear pendiente', exact: true }).click();
  await panel.getByRole('link', { name: 'Abrir en Gestión' }).waitFor();
  assert.equal(tasks.size, 1); const task = [...tasks.values()][0];
  assert.equal(task.priority, 'URGENTE'); assert.match(task.initial_comments[0].content, /brief actualizado/);
  assert.equal(task.dueDate, '2026-10-09T12:00:00.000Z');
  await composer.fill('Crear pendiente'); await composer.press('Enter');
  await page.getByText('Este pendiente ya está creado.', { exact: false }).waitFor(); assert.equal(tasks.size, 1);
  await page.screenshot({ path: path.join(output, 'bria-pendiente-creado.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'bria-pendiente-movil.png') });
  assert.deepEqual(errors, []); assert.ok(sent.includes('Alta')); assert.equal(await composer.inputValue(), '');
  console.log(JSON.stringify({ passed: true, simulatedModelAndDatabase: true, realConversationAndTaskOrchestration: true, tasksCreated: tasks.size, correctionSaved: true, duplicatePrevented: true }));
} finally { await browser.close(); await preview.close(); }
