import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SCHEDULED_ITEM_STATUS, PUBLISHABLE_ITEM_STATUSES,
  hasArmedPublication, itemStatusForQueue, publishMomentLabel, publicationTaskCloseProblem, queueOwnedStatusProblem
} from '../src/lib/socialPublishing.js';
import { APPROVED_STATUSES, isSettled, needsClientReview } from '../src/lib/contentApproval.js';
import { pieceStage } from '../src/lib/clientOperations.js';
import { createSocialPublishingService } from '../src/services/socialPublishingService.js';

// El estado «Programado» (Rodny, 15 de octubre de 2026).
//
// Ese día se programó un reel de Pablo Hoff a las 09:12 y, antes de su hora, su pendiente «Publicar»
// se movió a realizado con la certeza de que iba a salir. El espejo pendiente→pieza lo dejó en
// PUBLICADO y a las 10:00:28 el publicador, que vuelve a comprobar todo antes de salir, lo encontró
// publicado y falló las dos redes diciendo «Esta pieza ya está publicada». No salió a su hora: hubo
// que notarlo, devolverle el estado a mano y reprogramarlo, y salió a las 12:01 en las dos redes.
//
// Faltaba un estado entre «Realizado» y «Publicado» que dijera «ya está en la cola esperando su hora»,
// y faltaba que nadie tuviera que mover nada a mano para que eso pasara.

const ARMED = [{ status: 'SCHEDULED' }];
const piece = (extra = {}) => ({ publishDate: '2026-10-15', publishTime: '10:00', ...extra });

test('«Programado» va entre realizado y publicado, y es un estado del que se puede salir a publicar', () => {
  assert.equal(SCHEDULED_ITEM_STATUS, 'PROGRAMADO');
  // Si no fuera publicable, reintentar una red después de que otra salió respondería «la pieza tiene
  // que estar aprobada», que es falso: el cliente la aprobó antes de programarla.
  assert.ok(PUBLISHABLE_ITEM_STATUSES.includes('PROGRAMADO'));
  const enum_ = readFileSync('prisma/schema.prisma', 'utf8');
  assert.match(enum_, /enum ContentItemStatus \{[^}]*\bPROGRAMADO\b/s, 'el enum tiene que llevar el valor');
  const chain = JSON.parse(readFileSync('package.json', 'utf8')).scripts.start;
  assert.match(chain, /ensure-content-scheduled-status-schema\.js/, 'el valor del enum se crea al arrancar');
});

test('el estado de la pieza lo decide su cola, no cada pantalla por su cuenta', () => {
  // Programada y esperando: ni suelta ni publicada.
  assert.equal(itemStatusForQueue({ status: 'REALIZADO', publications: ARMED }), 'PROGRAMADO');
  assert.equal(itemStatusForQueue({ status: 'APROBADO', publications: [{ status: 'PUBLISHING' }] }), 'PROGRAMADO');
  // Todas fuera: publicada.
  assert.equal(itemStatusForQueue({ status: 'PROGRAMADO', publications: [{ status: 'PUBLISHED' }, { status: 'PUBLISHED' }] }), 'PUBLICADO');
  // Una cancelada deja pasar; una fallida no, porque una red pedida no salió.
  assert.equal(itemStatusForQueue({ status: 'PROGRAMADO', publications: [{ status: 'PUBLISHED' }, { status: 'CANCELLED' }] }), 'PUBLICADO');
  assert.equal(itemStatusForQueue({ status: 'PROGRAMADO', publications: [{ status: 'PUBLISHED' }, { status: 'FAILED' }] }), 'PROGRAMADO');
  // Sin nada vivo en la cola vuelve al equipo: es lo que permite volver a marcarla a mano.
  assert.equal(itemStatusForQueue({ status: 'PROGRAMADO', publications: [{ status: 'FAILED' }] }), 'REALIZADO');
  assert.equal(itemStatusForQueue({ status: 'PROGRAMADO', publications: [] }), 'REALIZADO');
  // Una pieza que nunca se programó no la toca la cola.
  assert.equal(itemStatusForQueue({ status: 'BORRADOR', publications: [] }), null);
  assert.equal(itemStatusForQueue({ status: 'APROBADO', publications: [{ status: 'CANCELLED' }] }), null);
  assert.equal(hasArmedPublication([{ status: 'CANCELLED' }, { status: 'FAILED' }]), false);
  assert.equal(hasArmedPublication(ARMED), true);
});

test('con la publicación armada nadie cambia el estado a mano, y se dice el motivo con su hora', () => {
  const reason = queueOwnedStatusProblem({ item: piece(), publications: ARMED });
  assert.match(reason, /el 15 de octubre a las 10:00/);
  assert.match(reason, /cancela primero la publicación/i, 'un motivo sin salida no vale');
  assert.equal(queueOwnedStatusProblem({ item: piece(), publications: [{ status: 'FAILED' }] }), null,
    'si Meta falla, la cola deja de mandar y el equipo puede volver a marcarla a mano');

  const taskReason = publicationTaskCloseProblem({ item: piece(), publications: ARMED });
  assert.match(taskReason, /se cierra solo/, 'el community manager no tiene que mover nada');
  assert.equal(publicationTaskCloseProblem({ item: piece(), publications: [] }), null,
    'lo que se publica por fuera de la plataforma se sigue cerrando a mano');

  // La fecha y la hora son texto plano: ninguna conversión de zona puede correr el día.
  assert.equal(publishMomentLabel(piece()), 'el 15 de octubre a las 10:00');
  assert.equal(publishMomentLabel(piece({ publishTime: null })), 'el 15 de octubre');
  assert.equal(publishMomentLabel({}), null);
});

test('una pieza programada sigue estando aprobada por el cliente y contada como programada', () => {
  // Sin esto el portal habría devuelto la pieza a «por revisar» el día que se programa, y el avance
  // del mes habría bajado solo.
  assert.ok(APPROVED_STATUSES.includes('PROGRAMADO'));
  assert.equal(isSettled({ status: 'PROGRAMADO' }), true);
  assert.equal(needsClientReview({ status: 'PROGRAMADO', revisionRequestedAt: new Date() }), true);
  // Operación: redactada, diseñada, aprobada y programada; publicada solo cuando lo está.
  assert.equal(pieceStage({ status: 'PROGRAMADO', captionText: 'hola', hasFinalAsset: true }), 4);
  assert.equal(pieceStage({ status: 'PUBLICADO', captionText: 'hola', hasFinalAsset: true }), 5);
});

test('ningún camino humano puede dejar en PUBLICADO una pieza con la cola armada', () => {
  // Los dos caminos del accidente, cerrados en el servidor y en un solo sitio cada uno.
  const gate = readFileSync('src/services/taskUpdateGate.js', 'utf8');
  assert.match(gate, /publicationTaskCloseProblem/, 'la puerta que comparten Gestión y Bria');
  assert.match(gate, /gateError\(409/, 'se niega con su motivo, no con un 500');

  const content = readFileSync('src/services/contentService.js', 'utf8');
  assert.match(content, /queueOwnedStatusProblem/, 'el desplegable de Estado pasa por la misma regla');

  // El espejo pendiente→pieza no puede borrar el «Programado» que acaba de poner la cola.
  const tasks = readFileSync('src/services/nativeTaskService.js', 'utf8');
  assert.match(tasks, /ACTIVE_PUBLICATION_STATUSES/, 'el espejo calla mientras haya algo esperando salir');
  assert.doesNotMatch(tasks, /Marking ContentItem .* as PUBLICADO/, 'el segundo update a PUBLICADO se retiró');

  // «Ya se publicó» cancela lo programado en vez de dejarlo fallar solo a su hora.
  const operations = readFileSync('src/services/clientOperationsService.js', 'utf8');
  assert.match(operations, /cancelItemPublications\(\{ itemId: item\.id/);
});

// --- Lo que de verdad hace el servicio, con una base de datos en memoria -----------------------------

const account = { id: 'acc-ig', clientId: 'c1', platform: 'INSTAGRAM', externalId: '1', displayName: '@pablohoff', pageId: '9', encryptedToken: 'enc', isActive: true };
const NOW = new Date('2026-10-15T14:00:00.000Z'); // 09:00 en Bogotá

const memoryDb = ({ status = 'REALIZADO', publications = [], tasks = [] } = {}) => {
  const state = {
    item: {
      id: 'item-1', planId: 'plan-1', format: 'Reel', status, captionText: 'Hola',
      publishDate: new Date('2026-10-15T00:00:00.000Z'), publishTime: '10:00', deletedAt: null,
      finalAssets: [{ id: 'a1', name: 'reel.mp4', mimeType: 'video/mp4', size: 1024, storageKey: 'k' }],
      plan: { id: 'plan-1', clientId: 'c1', deletedAt: null, client: { id: 'c1', socialAccounts: [account] } }
    },
    publications: publications.map((row) => ({ contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', ...row })),
    tasks: tasks.map((row) => ({ contentItemId: 'item-1', ...row }))
  };
  const db = {
    contentItem: {
      findUnique: async () => ({ ...state.item, publications: state.publications }),
      update: async ({ data }) => { Object.assign(state.item, data); return state.item; }
    },
    socialPublication: {
      findUnique: async ({ where }) => state.publications.find((row) => row.id === where.id) || null,
      upsert: async ({ create, update }) => {
        const existing = state.publications.find((row) => row.socialAccountId === create.socialAccountId);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { id: 'pub-1', ...create };
        state.publications.push(row);
        return row;
      },
      update: async ({ where, data }) => { const row = state.publications.find((r) => r.id === where.id); Object.assign(row, data); return row; },
      updateMany: async ({ data }) => { state.publications.forEach((row) => Object.assign(row, data)); return { count: state.publications.length }; },
      findMany: async () => state.publications,
      count: async () => state.publications.length
    },
    task: { findMany: async () => state.tasks.filter((row) => row.status !== 'REALIZADA') }
  };
  return { db, state };
};

const build = ({ db, closed = [] }) => ({
  closed,
  service: createSocialPublishingService({
    db, meta: {}, now: () => NOW, decrypt: (v) => v,
    mediaUrlFor: async () => 'https://signed.example/k',
    notify: async (d) => d,
    completeTask: async (taskId, data, updaterId) => { closed.push([taskId, data.status, updaterId]); return {}; },
    randomId: () => 'lease', logger: { error() {} }
  })
});

test('programar deja la pieza en «Programado» y cancelar la devuelve a «Realizado»', async () => {
  const { db, state } = memoryDb();
  const { service } = build({ db });
  await service.schedulePublications({ itemId: 'item-1', platforms: ['INSTAGRAM'], actorUserId: 'u1' });
  assert.equal(state.item.status, 'PROGRAMADO');

  await service.cancelPublication({ publicationId: 'pub-1' });
  assert.equal(state.item.status, 'REALIZADO', 'sin cola viva la pieza vuelve al equipo');
});

test('una red fallida deja de mandar: la pieza vuelve al equipo y nadie le cierra el pendiente', async () => {
  const { db, state } = memoryDb({
    status: 'PROGRAMADO',
    publications: [{ id: 'pub-1', status: 'SCHEDULED' }],
    tasks: [{ id: 'task-publicar', title: '[Publicar] Reel: Jean Day', status: 'PENDIENTE', assignee: { userId: 'user-sara' } }]
  });
  const { service, closed } = build({ db });
  await service.cancelPublication({ publicationId: 'pub-1' });
  assert.equal(state.item.status, 'REALIZADO');
  assert.deepEqual(closed, [], 'una publicación cancelada no cierra el pendiente de nadie');
});

test('reintentar devuelve la pieza a la cola, aunque hubiera quedado marcada como publicada', async () => {
  // Lo que pasó el 15 de octubre de 2026: la pieza quedó en PUBLICADO por error, las dos redes
  // fallaron por eso y reintentar no bastaba, porque la fila se rearmaba pero la pieza seguía
  // «publicada» y el publicador la rechazaba otra vez. Hubo que corregir el estado a mano.
  const { db, state } = memoryDb({ status: 'PUBLICADO', publications: [{ id: 'pub-1', status: 'FAILED', error: 'Esta pieza ya está publicada.', scheduledAt: NOW }] });
  const { service } = build({ db });
  await service.retryPublication({ publicationId: 'pub-1', actorUserId: 'u1' });
  assert.equal(state.publications[0].status, 'SCHEDULED');
  assert.equal(state.item.status, 'PROGRAMADO', 'vuelve a estar en la cola, así que puede volver a salir');
});

test('«Ya se publicó» cancela lo que estuviera programado antes de marcar la pieza', async () => {
  const { db, state } = memoryDb({ status: 'REALIZADO', publications: [{ id: 'pub-1', status: 'SCHEDULED' }] });
  const { service } = build({ db });
  const count = await service.cancelItemPublications({ itemId: 'item-1', reason: 'Se marcó a mano como ya publicada.' });
  assert.equal(count, 1);
  assert.equal(state.publications[0].status, 'CANCELLED');
  assert.equal(state.publications[0].error, 'Se marcó a mano como ya publicada.',
    'el motivo se guarda: el equipo tiene que poder leer por qué no salió');
});
