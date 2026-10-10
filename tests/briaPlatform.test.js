import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaPlatformClient, normalizePlatformPath } from '../src/lib/briaPlatformClient.js';
import { createBriaActionService } from '../src/services/briaActionService.js';
import { createBriaPlatformTools } from '../src/services/briaPlatformTools.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
import { actionStage, actionReply } from '../src/lib/briaActions.js';
import { buildInstructions } from '../src/lib/briaAssistant.js';

// Las manos de Bria en toda la plataforma (Rodny, 10 de octubre de 2026): habla con la API con la sesión de la
// persona, lee de una vez y escribe solo tras «Confirmar». Datos inventados; nada llega a una API real.

const admin = { userId: 'u-rodny', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true, clientes: true, parrillas: true } };
const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };
const session = { token: 'token-de-la-persona' };
const jsonResponse = (status, body) => ({ status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });

test('the client sends the person’s own token, the Bria mark and JSON, and never a session of its own', async () => {
  const calls = [];
  const client = createBriaPlatformClient({ baseUrl: 'http://127.0.0.1:3000', fetchFn: async (url, init) => { calls.push([url, init]); return jsonResponse(201, { id: 'n1' }); } });
  const out = await client.call({ token: session.token, method: 'POST', path: '/api/user/notes', body: { title: 'Hola', content: 'x' } });
  assert.equal(calls[0][0], 'http://127.0.0.1:3000/api/user/notes');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer token-de-la-persona');
  assert.equal(calls[0][1].headers['x-brain-via'], 'bria');
  assert.equal(calls[0][1].body, '{"title":"Hola","content":"x"}');
  assert.deepEqual([out.ok, out.status, out.data], [true, 201, { id: 'n1' }]);
  await assert.rejects(() => client.call({ token: '', method: 'GET', path: '/tasks' }), /no trae tu sesión/);
  assert.equal(normalizePlatformPath('/api/tasks?x=1'), '/tasks?x=1');
  assert.throws(() => normalizePlatformPath('tasks'), /empezar por/);
  assert.throws(() => normalizePlatformPath('/tasks/../users'), /no es válida/);
});

test('errors come back in words, GET carries no body, and a long answer is cut', async () => {
  const client = createBriaPlatformClient({ fetchFn: async (_url, init) => init.method === 'GET' ? jsonResponse(200, { rows: 'x'.repeat(500) }) : jsonResponse(403, { error: 'No tienes permisos para acceder al módulo: financiero' }), limit: 100 });
  const read = await client.call({ token: 't', method: 'GET', path: '/tasks' });
  assert.equal(read.truncated, true);
  assert.match(read.text, /respuesta recortada: 5\d\d caracteres/);
  const denied = await client.call({ token: 't', method: 'POST', path: '/financials/records', body: {} });
  assert.deepEqual([denied.ok, denied.status, denied.error], [false, 403, 'No tienes permisos para acceder al módulo: financiero']);
  const bare = createBriaPlatformClient({ fetchFn: async () => ({ status: 404, headers: { get: () => 'text/html' }, text: async () => '<html>' }) });
  assert.equal((await bare.call({ token: 't', path: '/tasks' })).error, 'Eso no existe.');
});

const permissions = async (key) => ({ 'POST /global-announcements': { roles: ['MANAGER'] }, 'POST /client-operations/:clientId/observations': { modules: ['clientes'], roles: ['MANAGER'] }, 'GET /service-health': { roles: ['ADMIN'] } }[key] || null);

test('preparing a platform operation: only what the map knows, with the route’s permission checked up front and a summary in words', async () => {
  const service = createBriaActionService({ platform: { call: async () => { throw new Error('no debe llamar al preparar'); } }, routePermissions: permissions });
  const action = await service.prepare({ user: admin, type: 'PLATFORM', args: { metodo: 'POST', ruta: '/global-announcements', cuerpo: { content: 'Mañana no hay reunión', type: 'INFO' }, que_hace: 'Publicar el anuncio de que mañana no hay reunión' } });
  assert.equal(actionStage(action), 'READY');
  assert.deepEqual(action.payload, { method: 'POST', path: '/global-announcements', body: { content: 'Mañana no hay reunión', type: 'INFO' } });
  assert.deepEqual(action.permission, { roles: ['MANAGER'] });
  assert.deepEqual(action.summary, ['Publicar el anuncio de que mañana no hay reunión', 'Operación: Publica un anuncio general para todo el equipo.', 'content: Mañana no hay reunión', 'type: INFO']);
  assert.deepEqual(actionReply(action).quickReplies, ['Confirmar', 'Cancelar']);
  await assert.rejects(() => service.prepare({ user: pm, type: 'PLATFORM', args: { metodo: 'POST', ruta: '/client-operations/c1/observations', cuerpo: { text: 'x' }, que_hace: 'Anotar' } }), /módulo Clientes/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'PLATFORM', args: { metodo: 'POST', ruta: '/user/mfa/reset/u1', cuerpo: null, que_hace: 'Reset' } }), /no se hace desde el chat/);
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', args: { metodo: 'POST', ruta: '/inventada', cuerpo: null, que_hace: 'x' } }), /No encuentro «POST \/inventada»/);
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', args: { metodo: 'GET', ruta: '/tasks', cuerpo: null, que_hace: 'x' } }), /consultar_plataforma/);
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', args: { metodo: 'POST', ruta: '/global-announcements', cuerpo: {}, que_hace: '' } }), /que_hace/);
  const money = await service.prepare({ user: admin, type: 'PLATFORM', args: { metodo: 'POST', ruta: '/financials/records', cuerpo: { type: 'INGRESO', amount: 1200000, date: '2026-10-10', concept: 'Abono' }, que_hace: 'Registrar el ingreso de Aristea' } });
  assert.match(money.warnings[0], /Es dinero/);
  const removal = await service.prepare({ user: admin, type: 'PLATFORM', args: { metodo: 'DELETE', ruta: '/user/notes/n1', cuerpo: null, que_hace: 'Borrar la nota' } });
  assert.match(removal.warnings[0], /Es un borrado/);
  assert.equal(removal.summary.length, 3, 'the path parameter is listed');
});

test('executing calls the API with the person’s session, re-checks the permission and tells what the platform answered or refused', async () => {
  const calls = [];
  const platform = { call: async (input) => { calls.push(input); return input.path.includes('fail') ? { ok: false, status: 400, error: 'Falta el contenido.' } : { ok: true, status: 201, data: { id: 'a1' }, text: '{"id":"a1"}' }; } };
  const service = createBriaActionService({ platform, routePermissions: permissions });
  const action = await service.prepare({ user: admin, type: 'PLATFORM', args: { metodo: 'POST', ruta: '/global-announcements', cuerpo: { content: 'Hola', type: 'INFO' }, que_hace: 'Publicar un anuncio' } });
  const out = await service.execute({ user: admin, action, session });
  assert.deepEqual(calls[0], { token: 'token-de-la-persona', method: 'POST', path: '/global-announcements', body: { content: 'Hola', type: 'INFO' } });
  assert.match(out.text, /^Listo: Publicar un anuncio\./);
  await assert.rejects(() => service.execute({ user: { ...admin, role: 'EDITOR' }, action, session }), { status: 403 }, 'a role that changed since the summary is refused');
  await assert.rejects(() => service.execute({ user: { ...admin, userId: 'otra' }, action, session }), /otra persona/);
  const failing = { ...action, payload: { ...action.payload, path: '/global-announcements' }, target: { key: 'POST /global-announcements', path: '/global-announcements' } };
  platform.call = async () => ({ ok: false, status: 400, error: 'Falta el contenido.' });
  await assert.rejects(() => service.execute({ user: admin, action: failing, session }), /La plataforma no lo aceptó: Falta el contenido\./);
  const noPlatform = createBriaActionService({ routePermissions: permissions });
  await assert.rejects(() => noPlatform.execute({ user: admin, action, session }), /no puede operar/);
});

test('the tools: the map searches, reading goes straight to the API with the session, writing only prepares', async () => {
  const calls = [];
  const platform = { call: async (input) => { calls.push(input); return { ok: true, status: 200, data: [{ id: 'l1', company: 'Aristea' }], text: '[…]', truncated: false }; } };
  const actions = createBriaActionService({ platform, routePermissions: permissions });
  const tools = createBriaPlatformTools({ actions, platform });
  assert.deepEqual(tools.map((t) => t.name), ['mapa_de_plataforma', 'consultar_plataforma', 'operar_en_plataforma']);
  const map = await tools[0].run({ busqueda: 'oportunidad etapa' });
  assert.ok(map.data.operaciones.some((row) => row.operacion === 'POST /crm/leads/:leadId/stage'));
  assert.match((await tools[0].run({ busqueda: 'zzzz' })).data.instruccion, /No hay ninguna operación/);
  const read = await tools[1].run({ ruta: '/crm/leads?stage=PROPUESTA_ENVIADA' }, { user: admin, session });
  assert.deepEqual(calls[0], { token: 'token-de-la-persona', method: 'GET', path: '/crm/leads?stage=PROPUESTA_ENVIADA' });
  assert.equal(read.data.operacion, 'GET /crm/leads');
  assert.match((await tools[1].run({ ruta: '/vault/credentials' }, { user: admin, session })).data.error, /bóveda/);
  assert.match((await tools[1].run({ ruta: '/no/existe' }, { user: admin, session })).data.error, /no está en el mapa/);
  const prepared = await tools[2].run({ metodo: 'POST', ruta: '/global-announcements', cuerpo: { content: 'Hola', type: 'INFO' }, que_hace: 'Publicar un anuncio' }, { user: admin, pendingAction: null });
  assert.equal(prepared.data.done, false);
  assert.equal(calls.length, 1, 'preparing never calls the API');
  assert.equal(createBriaPlatformTools({ actions: null, platform }).length, 0);
  const text = buildInstructions({ person: { name: 'Rodny', jobTitle: 'Director' }, today: '2026-10-10', tools });
  assert.match(text, /Tienes las manos de la persona en toda la plataforma/);
  assert.match(text, /Nunca digas que hiciste un cambio/);
});

test('in conversation, the session travels with the question and with the confirmation, and is never stored in a turn', async () => {
  const ready = { id: 'p1', ownerId: 'owner', type: 'PLATFORM', status: 'DRAFT', title: 'Publicar un anuncio', permission: { roles: ['MANAGER'] }, payload: { method: 'POST', path: '/global-announcements', body: { content: 'Hola' } }, summary: ['Publicar un anuncio'], warnings: [], missing: [] };
  let stored = { id: 'chat', revision: 1, turns: [{ role: 'assistant', text: '¿Lo hago así?', pendingAction: ready }] };
  const seen = [];
  const repository = { get: async () => stored, append: async (_a, _id, revision, question, result) => {
    const reply = typeof result === 'function' ? await result() : result;
    stored = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: reply.answer, ...reply }] }; return stored;
  } };
  const actions = { execute: async ({ session: s }) => { seen.push(['execute', s]); return { text: 'Listo.', sources: [] }; } };
  const user = { userId: 'owner', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
  const service = createBriaConversationService({ repository, actions, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }), assistant: { ask: async (request) => { seen.push(['ask', request.session]); return { answer: 'Respuesta', sources: [] }; } } });
  await service.send({ user, id: 'chat', question: 'Confirmar', session });
  await service.send({ user, id: 'chat', question: '¿Qué tengo hoy?', session });
  assert.deepEqual(seen, [['execute', session], ['ask', session]]);
  assert.equal(JSON.stringify(stored).includes('token-de-la-persona'), false, 'the token never lands in the conversation');
});
