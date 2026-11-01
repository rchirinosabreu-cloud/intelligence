// Los compromisos de una reunión a pendientes (Rodny, 14 de octubre de 2026, segundo punto del plan «llevar a Bria a
// más niveles»: «cuando analiza una reunión, que prepare los pendientes que salieron de ahí, con responsable y fecha
// propuestos, y tú confirmas»). Mismo contrato que toda acción: Bria prepara, pregunta de a una cosa, resume, y solo
// «Confirmar» crea, tarea por tarea por la misma vía que el botón. Nunca dos veces: cada compromiso recuerda su tarea.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { minuteItems, guessClient, matchOwner, parseItemDate, minuteLabel } from '../src/lib/minuteTasks.js';
import { createBriaActionService, ACTION_PERMISSION } from '../src/services/briaActionService.js';
import { createBriaActionTools } from '../src/services/briaActionTools.js';
import { actionStage, actionReply } from '../src/lib/briaActions.js';
import { buildInstructions, toolProgressLabel } from '../src/lib/briaAssistant.js';
import { rankByName } from '../src/lib/fuzzyMatch.js';

const NOW = () => new Date('2026-10-13T15:00:00.000Z'); // martes 13 de octubre, 10:00 de Bogotá
const pm = { userId: 'u-pm', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true, minutas: true } };
const members = [{ id: 'm-kam', name: 'Kamila Pérez', email: 'kamila@brain.test', isActive: true, userId: 'u-pm' }, { id: 'm-jar', name: 'Jarlan Pérez', email: 'jarlan@brain.test', isActive: true, userId: 'u-jar' }, { id: 'm-mel', name: 'Melissa Castaño', email: 'melissa@brain.test', isActive: true, userId: 'u-mel' }, { id: 'm-mro', name: 'Melissa Rojas', email: 'mrojas@brain.test', isActive: true, userId: 'u-mro' }];
const clients = [{ id: 'c-end', name: 'Endova', slug: 'endova', isArchived: false }, { id: 'c-ari', name: 'Aristea', slug: 'aristea', isArchived: false }];
const minuteOf = (over = {}) => ({
  id: 'mm-1', title: 'Reunión Endova octubre', meetingAt: new Date('2026-10-13T14:00:00Z'), status: 'READY', deletedAt: null, participants: [],
  actionItems: [
    { task: 'Enviar el guion del reel de lanzamiento', owner: 'Kamila', dueDate: '2026-10-17', priority: 'alta' },
    { task: 'Revisar el logo nuevo con el cliente', owner: 'Jarlan Peres', dueDate: null, priority: 'media' },
    { task: 'Cotizar la impresión del catálogo', owner: 'Carlos (cliente)', dueDate: null, priority: null }
  ],
  ...over
});
const fold = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const fakeDb = (minutes = [minuteOf()]) => ({
  minutes, created: [],
  meetingMinute: {
    findFirst: async ({ where }) => minutes.find((m) => m.id === where.id && !m.deletedAt) || null,
    findMany: async ({ where, take = 50 }) => minutes.filter((m) => !m.deletedAt && m.status === 'READY' && (!where.title || fold(m.title).includes(fold(where.title.contains)))).slice(0, take),
    update: async ({ where, data }) => { const row = minutes.find((m) => m.id === where.id); Object.assign(row, data); return row; }
  },
  teamMember: { findMany: async ({ where }) => where?.OR ? members.filter((m) => where.OR.some((c) => (c.name && fold(m.name).includes(fold(c.name.contains))) || (c.email && m.email === c.email.equals))) : members, findUnique: async ({ where }) => members.find((m) => m.id === where.id) || null },
  client: { findMany: async ({ where }) => where?.OR ? clients.filter((c) => where.OR.some((x) => x.id === c.id || (x.name && fold(c.name).includes(fold(x.name.contains))))) : clients, findUnique: async ({ where }) => clients.find((c) => c.id === where.id) || null },
  task: { findUnique: async () => null, findMany: async () => [] }
});
const build = (db, over = {}) => createBriaActionService({ db, updateTask: async () => { throw new Error('No debe escribir'); }, createTask: async (input) => { const task = { id: `t-${db.created.length + 1}`, ...input }; db.created.push(task); return task; }, notify: async () => {}, now: NOW, ...over });

test('the pure pieces: numbered items with parsed dates and priorities, the client named by the title, and owners matched without guessing', () => {
  const items = minuteItems(minuteOf(), '2026-10-13');
  assert.deepEqual(items.map((i) => [i.n, i.title, i.owner, i.dueDay, i.priority, i.taskId]), [[1, 'Enviar el guion del reel de lanzamiento', 'Kamila', '2026-10-17', 'ALTA', null], [2, 'Revisar el logo nuevo con el cliente', 'Jarlan Peres', null, 'NORMAL', null], [3, 'Cotizar la impresión del catálogo', 'Carlos (cliente)', null, 'NORMAL', null]]);
  assert.equal(parseItemDate('2026-10-17T12:00:00Z', '2026-10-13'), '2026-10-17');
  assert.equal(parseItemDate('viernes', '2026-10-13'), '2026-10-16');
  assert.equal(parseItemDate('la próxima semana', '2026-10-13'), null, 'what is not a day is not a date');
  assert.deepEqual(guessClient(minuteOf(), clients), clients[0]);
  assert.equal(guessClient(minuteOf({ title: 'Reunión Endova y Aristea' }), clients), null, 'two clients named is no guess');
  const rank = (rows, term) => rankByName(rows, term, (row) => row.name);
  assert.equal(matchOwner('Kamila', members, rank)?.id, 'm-kam', 'a first name that only one person has');
  assert.equal(matchOwner('Jarlan Peres', members, rank)?.id, 'm-jar', 'a misspelt full name');
  assert.equal(matchOwner('Melissa', members, rank), null, 'two Melissas is a question, never a guess');
  assert.equal(matchOwner('Carlos (cliente)', members, rank), null);
  assert.equal(minuteLabel(minuteOf()), '«Reunión Endova octubre» del 13 de octubre');
});

test('preparing: the meeting is found by title, the client by the title, owners by name, and what is missing is asked one thing at a time', async () => {
  const db = fakeDb();
  const service = build(db);
  const first = await service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { reunion: 'endova octubre' } });
  assert.equal(actionStage(first), 'MISSING');
  assert.deepEqual(first.missing[0], { field: 'fecha', question: '2 compromisos no traen fecha (2 y 3). ¿Qué fecha les pongo?', options: ['Mañana', 'Viernes', 'Sin fecha'] });
  assert.match(first.summary[0], /Reunión: \*\*«Reunión Endova octubre» del 13 de octubre\*\*/);
  assert.match(first.summary[1], /Cliente: \*\*Endova\*\* \(por el título de la reunión\)/);
  const second = await service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { reunion: null, fecha: 'viernes' }, previous: first });
  assert.equal(second.id, first.id);
  assert.deepEqual(second.missing[0], { field: 'responsable', question: '¿A quién le asigno el compromiso 3, «Cotizar la impresión del catálogo»? «Carlos (cliente)» no está en el equipo.', options: ['Jarlan Pérez', 'Kamila Pérez', 'Melissa Castaño', 'Melissa Rojas', 'Omitirlo'] });
  const third = await service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { ajustes: [{ n: 3, omitir: true }] }, previous: second });
  assert.equal(actionStage(third), 'READY');
  assert.deepEqual(third.payload.items.map((i) => [i.n, i.title, i.assigneeId, i.dueDate, i.priority]), [[1, 'Enviar el guion del reel de lanzamiento', 'm-kam', '2026-10-17T12:00:00.000Z', 'ALTA'], [2, 'Revisar el logo nuevo con el cliente', 'm-jar', '2026-10-16T12:00:00.000Z', 'NORMAL']]);
  assert.equal(third.payload.clientId, 'c-end');
  assert.match(third.summary.join('\n'), /Pendientes que se crean \(2\):\n1\. «Enviar el guion del reel de lanzamiento» → Kamila Pérez · 17 de octubre · prioridad alta\n2\. «Revisar el logo nuevo con el cliente» → Jarlan Pérez · 16 de octubre/);
  assert.match(third.warnings.join('\n'), /«Jarlan Peres» lo entendí como Jarlan Pérez/);
  assert.match(third.warnings.join('\n'), /No se crea \(lo pediste\): 3 «Cotizar la impresión del catálogo»/);
  assert.deepEqual(actionReply(third).quickReplies, ['Confirmar', 'Cancelar']);
  assert.equal(db.created.length, 0, 'preparing never writes');
});

test('an ambiguous meeting asks which one, an unknown one is refused with words, a client said by the person wins over the title, and «sin cliente» is accepted', async () => {
  const db = fakeDb([minuteOf(), minuteOf({ id: 'mm-2', title: 'Reunión Endova septiembre', meetingAt: new Date('2026-09-13T14:00:00Z') })]);
  const service = build(db);
  const which = await service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { reunion: 'endova' } });
  assert.deepEqual(which.missing[0], { field: 'reunion', question: '¿Cuál reunión?', options: ['Reunión Endova octubre (13 de octubre)', 'Reunión Endova septiembre (13 de septiembre)'] });
  await assert.rejects(service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { reunion: 'junta de vecinos' } }), (error) => error.status === 404 && /No encontré una reunión/.test(error.message));
  const aristea = await service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { reunion: 'mm-1', cliente: 'Aristea', fecha: 'sin fecha', ajustes: [{ n: 3, responsable: 'Melissa Castaño' }] } });
  assert.equal(actionStage(aristea), 'READY');
  assert.equal(aristea.payload.clientId, 'c-ari');
  assert.deepEqual(aristea.payload.items.map((i) => [i.n, i.assigneeId, i.dueDate]), [[1, 'm-kam', '2026-10-17T12:00:00.000Z'], [2, 'm-jar', null], [3, 'm-mel', null]]);
  const none = await service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { reunion: 'mm-1', cliente: 'sin cliente', fecha: 'sin fecha', ajustes: [{ n: 3, omitir: true }] } });
  assert.equal(none.payload.clientId, null);
  assert.match(none.summary.join('\n'), /Cliente: sin cliente/);
});

test('confirming creates the tasks one by one through createTask with the meeting as context, writes each task id back to the minute, and a second confirmation creates nothing', async () => {
  const db = fakeDb();
  const notices = [];
  const service = build(db, { notify: async (notice) => { notices.push(notice); } });
  const action = await service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { reunion: 'mm-1', fecha: 'viernes', ajustes: [{ n: 3, omitir: true }] } });
  const result = await service.execute({ user: pm, action, revalidate: async () => {} });
  assert.equal(db.created.length, 2);
  assert.deepEqual(db.created.map((t) => [t.title, t.clientId, t.assigneeId, t.creatorId, t.dueDate, t.status, t.priority, t.isPriority]), [['Enviar el guion del reel de lanzamiento', 'c-end', 'm-kam', 'u-pm', '2026-10-17T12:00:00.000Z', 'PENDIENTE', 'ALTA', true], ['Revisar el logo nuevo con el cliente', 'c-end', 'm-jar', 'u-pm', '2026-10-16T12:00:00.000Z', 'PENDIENTE', 'NORMAL', false]]);
  assert.equal(db.created[0].initial_comments[0].content, 'De la reunión «Reunión Endova octubre» del 13 de octubre. Responsable según la reunión: Kamila. Compromiso: Enviar el guion del reel de lanzamiento');
  assert.deepEqual(db.minutes[0].actionItems.map((i) => i.taskId || null), ['t-1', 't-2', null], 'each commitment remembers its task; the omitted one stays free');
  assert.deepEqual(notices.map((n) => [n.userId, n.type, n.relatedId]), [['u-jar', 'TASK_ASSIGNED', 't-2']], 'the person who confirms is not notified about her own task');
  assert.match(result.text, /Creé 2 pendientes de la reunión «Reunión Endova octubre»:\n- \[Enviar el guion del reel de lanzamiento\]\(\/gestion\?taskId=t-1\) · Kamila Pérez · 17 de octubre\n- \[Revisar el logo nuevo con el cliente\]\(\/gestion\?taskId=t-2\) · Jarlan Pérez · 16 de octubre/);
  assert.deepEqual(result.sources.map((s) => s.id), ['t-1', 't-2']);
  const again = await service.execute({ user: pm, action, revalidate: async () => {} });
  assert.equal(db.created.length, 2, 'never twice');
  assert.match(again.text, /ya estaban creados/);
  // Preparar de nuevo la misma reunión: lo ya creado se dice y no se vuelve a ofrecer.
  const later = await service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { reunion: 'mm-1', fecha: 'sin fecha', ajustes: [{ n: 3, responsable: 'Kamila' }] } });
  assert.deepEqual(later.payload.items.map((i) => i.n), [3]);
  assert.match(later.warnings.join('\n'), /Ya son pendientes: 1 \[Enviar el guion del reel de lanzamiento\]\(\/gestion\?taskId=t-1\), 2 \[Revisar el logo nuevo con el cliente\]\(\/gestion\?taskId=t-2\)/);
  await assert.rejects(service.prepare({ user: pm, type: 'MINUTE_TASKS', args: { reunion: 'mm-1', fecha: 'sin fecha', ajustes: [{ n: 3, omitir: true }] } }), (error) => /No queda ningún compromiso por crear/.test(error.message));
});

test('the tool, the permission, the instruction, the progress line and the Minutes panel are wired', () => {
  const tools = createBriaActionTools({});
  const tool = tools.find((t) => t.name === 'pendientes_de_reunion');
  assert.ok(tool, 'the tool exists');
  assert.deepEqual(Object.keys(tool.parameters.properties), ['reunion', 'cliente', 'fecha', 'ajustes', 'nuevo']);
  assert.equal(tool.parameters.properties.ajustes.items.properties.omitir.type, 'boolean');
  assert.deepEqual(ACTION_PERMISSION.MINUTE_TASKS, ['gestion', 'minutas']);
  assert.equal(tool.allowed(pm), true);
  assert.equal(tool.allowed({ ...pm, modulePermissions: { bria: true, gestion: true } }), false, 'without Minutas there is no meeting to read');
  assert.match(buildInstructions({ tools: [tool], user: pm, today: '2026-10-13' }), /- pendientes_de_reunion/);
  // La guía vive en la descripción de la herramienta (31 de octubre de 2026).
  assert.match(tool.description, /compromisos de una reunión/);
  assert.match(tool.description, /No inventes responsables ni fechas que la reunión no diga/);
  assert.match(tool.description, /«Confirmar» sobre el resumen/);
  assert.equal(toolProgressLabel('pendientes_de_reunion'), 'Leyendo los compromisos de la reunión…');
  const panel = readFileSync('src/components/modules/Minutes/AutomaticMinutesPanel.jsx', 'utf8');
  assert.match(panel, /askBria\(`Prepara los pendientes de la reunión «\$\{minute\.title\}» \(id \$\{minute\.id\}\)`\)/, 'the panel leaves the request written for Bria; the person sends it');
  assert.match(panel, /Preparar pendientes con Bria/);
  assert.match(panel, /item\.taskId[\s\S]*\/gestion\?taskId=\$\{encodeURIComponent\(item\.taskId\)\}/, 'a commitment that already is a task links to it');
  assert.doesNotMatch(panel, /vosotros|tenéis|podéis/);
});
