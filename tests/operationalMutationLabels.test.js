import test from 'node:test';
import assert from 'node:assert/strict';
import { describePlatformMutation } from '../src/middlewares/operationalAuditMiddleware.js';
import { getOperationalTrace } from '../src/services/operationalTraceService.js';

const actor = { id: 'user-1', name: 'Rodny Chirinos', role: 'ADMIN', avatarUrl: null };
const occurredAt = new Date('2026-09-14T12:17:00Z');
const event = (id, metadata) => ({ id, eventType: 'PLATFORM_MUTATION', actorId: actor.id,
  subjectUserId: actor.id, actor, subjectUser: actor, taskId: null, occurredAt, metadata });

async function timeline(events) {
  return getOperationalTrace({ requester: actor, now: occurredAt, db: {
    user: { findMany: async () => [actor] },
    operationalTraceEvent: { findMany: async () => events },
    task: { findMany: async () => [] },
  } });
}

test('new trace metadata uses platform names rather than internal routes', () => {
  for (const [pathname, module] of [
    ['/api/fireflies/graphql', 'Minutas'], ['/api/minutes/meeting-1', 'Minutas'],
    ['/api/recognitions/claim', 'Logros recientes'], ['/api/unknown-internal-route/1', 'la plataforma'],
  ]) {
    assert.equal(describePlatformMutation({ method: 'POST', pathname }).module, module);
  }
});

test('legacy recognition checks and acknowledgements are automatic, not user-created awards', async () => {
  const events = [
    event('check', { module: 'recognitions', path: '/api/recognitions/claim', method: 'POST', action: 'creó o ejecutó', resource: 'un registro' }),
    event('ack', { module: 'recognitions', path: '/api/recognitions/:id/acknowledge', method: 'POST', action: 'creó o ejecutó' }),
  ];
  const original = structuredClone(events);
  const result = await timeline(events);
  assert.equal(result.timeline[0].displayLabel, 'Comprobación de reconocimientos');
  assert.equal(result.timeline[0].description, 'El sistema comprobó si había avisos de reconocimiento pendientes para Rodny Chirinos.');
  assert.equal(result.timeline[1].displayLabel, 'Aviso de reconocimiento');
  assert.equal(result.timeline[1].description, 'El sistema confirmó la preparación de un aviso de reconocimiento para Rodny Chirinos.');
  assert.equal(result.summary.platformMutations, 0);
  assert.equal(result.summary.totalEvents, 2, 'keep the administrative evidence');
  assert.deepEqual(events, original, 'do not rewrite stored history');
});

test('legacy Minutas proxy requests do not claim that a minute was created or successfully read', async () => {
  const result = await timeline([event('minutes', { module: 'fireflies', path: '/api/fireflies/graphql', method: 'POST', action: 'creó o ejecutó', resource: 'un registro' })]);
  assert.equal(result.timeline[0].displayLabel, 'Solicitud de Minutas');
  assert.equal(result.timeline[0].description, 'Rodny Chirinos realizó una solicitud en Minutas.');
  assert.equal(result.summary.platformMutations, 0);
});

test('normal edits retain their action and legacy aliases without route evidence stay non-specific', async () => {
  const result = await timeline([
    event('client', { module: 'Clientes', path: '/api/clients/:id', method: 'PATCH', action: 'actualizó', resource: 'un registro de cliente' }),
    event('legacy', { module: 'recognitions', action: 'creó o ejecutó', resource: 'un registro' }),
    event('legacy-minutes', { module: 'fireflies', action: 'creó o ejecutó', resource: 'un registro' }),
    event('unknown', { module: 'unknown-internal-route', action: 'actualizó', resource: 'un registro' }),
  ]);
  assert.equal(result.timeline[0].description, 'Rodny Chirinos actualizó un registro de cliente en Clientes.');
  assert.equal(result.timeline[1].description, 'Se registró actividad en Logros recientes asociada a Rodny Chirinos.');
  assert.equal(result.timeline[2].description, 'Se registró actividad en Minutas asociada a Rodny Chirinos.');
  assert.equal(result.timeline[3].description, 'Rodny Chirinos actualizó un registro en la plataforma.');
  assert.equal(result.summary.platformMutations, 2);
});

test('a similarly named endpoint is not mistaken for an automatic recognition check', async () => {
  const result = await timeline([event('similar', { path: '/api/recognitions/claim-settings', method: 'PATCH', module: 'recognitions', action: 'actualizó', resource: 'un registro' })]);
  assert.doesNotMatch(result.timeline[0].description, /comprobó si había/);
  assert.equal(result.summary.platformMutations, 1);
});
