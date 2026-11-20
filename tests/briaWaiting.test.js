// «Esperando por ti» dentro de Bria, etapa 1 (Rodny, 20 de noviembre de 2026: «lo de Manager me gustaría realmente
// moverlo a Bria eventualmente»). Una sola lista con lo que espera una decisión de la persona, y cada fila lleva al
// lugar donde hoy se resuelve. Manager no cambia en esta etapa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWaiting, WAITING_ACTIONS } from '../src/lib/briaWaiting.js';
import { createBriaWaitingService } from '../src/services/briaWaitingService.js';

test('the list says what is waiting with its count and where it is solved; nothing waiting, nothing shown', () => {
  assert.deepEqual(buildWaiting({}), []);
  assert.deepEqual(buildWaiting({ decisions: 0, meetings: 0, mail: 0, actions: [] }), []);
  assert.deepEqual(buildWaiting({ decisions: 6, meetings: 1, mail: 2, actions: [{ id: 'c1', title: 'Pendiente de Aristea' }] }), [
    { kind: 'DECISIONES', count: 6, text: '6 decisiones de la lectura y de lo que Bria detectó', to: '/manager' },
    { kind: 'REUNIONES', count: 1, text: '1 pendiente de reuniones por aprobar', to: '/manager?tab=reuniones' },
    { kind: 'CORREO', count: 2, text: '2 correos importantes esperan respuesta', ask: 'Muéstrame los correos importantes que siguen sin respuesta.' },
    { kind: 'ACCION', count: 1, text: 'Una acción lista para confirmar en «Pendiente de Aristea»', conversationId: 'c1' }
  ]);
  const many = buildWaiting({ actions: Array.from({ length: WAITING_ACTIONS + 2 }, (_, i) => ({ id: `c${i}`, title: '' })) });
  assert.equal(many.length, WAITING_ACTIONS);
  assert.equal(many[0].text, 'Una acción lista para confirmar en una conversación');
});

test('each person gets only what they can decide, and a source that fails does not hide the rest', async () => {
  const calls = [];
  const sources = {
    decisions: { pulse: async () => { calls.push('decisions'); return { keys: ['a', 'b'] }; } },
    meetings: { pulse: async () => { calls.push('meetings'); return { keys: ['m'] }; } },
    mail: { waitingCount: async () => { calls.push('mail'); return 3; } },
    chats: { waitingActions: async (actor) => { calls.push(`chats:${actor.ref}`); return [{ id: 'c1', title: 'Parrilla' }]; } }
  };
  const admin = { id: 'u-rodny', role: 'ADMIN', modulePermissions: { bria: true, manager: true } };
  const service = createBriaWaitingService({ ...sources, logger: { error() {} } });
  const full = await service.forUser(admin);
  assert.deepEqual(full.items.map((item) => [item.kind, item.count]), [['DECISIONES', 2], ['REUNIONES', 1], ['CORREO', 3], ['ACCION', 1]]);
  assert.deepEqual(full.failed, []);
  calls.length = 0;
  assert.deepEqual(await service.forUser({ id: 'u-mel', role: 'EDITOR', modulePermissions: { bria: true } }), { items: [], failed: [] });
  assert.deepEqual(calls, [], 'Bria is for direction: nobody else is even looked up');
  const pm = await service.forUser({ id: 'u-kam', role: 'PROJECT_MANAGER', modulePermissions: { bria: true } });
  assert.deepEqual(pm.items.map((item) => item.kind), ['CORREO', 'ACCION'], 'a project manager without Manager sees the mail but not the board');
  assert.deepEqual(calls, ['mail', 'chats:u-kam'], 'without Manager the board sources are not even asked');
  assert.deepEqual(await service.forUser({ id: 'u-x', role: 'ADMIN', modulePermissions: {} }), { items: [], failed: [] }, 'without Bria there is no list');
  const broken = createBriaWaitingService({ ...sources, decisions: { pulse: async () => { throw new Error('postgres://secreto'); } }, logger: { error() {} } });
  const partial = await broken.forUser(admin);
  assert.deepEqual(partial.items.map((item) => item.kind), ['REUNIONES', 'CORREO', 'ACCION']);
  assert.deepEqual(partial.failed, ['decisiones']);
});

test('the queries behind it: actions ready in the last turn of a chat, and mails with a draft or already reported', () => {
  const chats = readFileSync('src/services/briaConversationRepository.js', 'utf8');
  assert.match(chats, /async waitingActions\(actor/);
  assert.match(chats, /metadata->'pendingAction'->>'status'/);
  assert.match(chats, /NOT IN \('DONE','CANCELLED'\)/);
  const mail = readFileSync('src/services/mailAccountRepository.js', 'utf8');
  assert.match(mail, /async waitingCount\(/);
  assert.match(mail, /answered_at IS NULL AND s\.replied_at IS NULL AND \(s\.draft_reply IS NOT NULL OR s\.unanswered_notified_at IS NOT NULL\)/);
});

test('the block lives in Bria’s home, the route is for people with Bria, and Manager stays as it is', () => {
  const panel = readFileSync('src/components/bria/BriaConversation.jsx', 'utf8');
  assert.match(panel, /<BriaWaiting /);
  const block = readFileSync('src/components/bria/BriaWaiting.jsx', 'utf8');
  assert.match(block, /data-bria-waiting/);
  assert.match(block, /Esperando por ti/);
  assert.match(readFileSync('src/routes/index.js', 'utf8'), /router\.use\('\/bria\/waiting', createBriaWaitingRouter\(\)\)/);
  assert.match(readFileSync('src/routes/api/briaWaiting.js', 'utf8'), /canUseBria\(req\.user\)/);
});
