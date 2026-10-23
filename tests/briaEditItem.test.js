import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaActionService } from '../src/services/briaActionService.js';
import { actionReply, actionStage } from '../src/lib/briaActions.js';
import { isPlainAgreement, ACTION_VERBS } from '../src/lib/briaAgreement.js';

// Editar una pieza de la parrilla conversando (22 de octubre de 2026). Es lo que más hace el equipo en la plataforma:
// 4.310 ediciones de 11 personas en 60 días, y Bria solo sabía moverles la fecha.

const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, parrillas: true } };
const item = { id: 'i1', objective: 'Lanzamiento del menú de otoño', format: 'Reel', status: 'EN_REVISION', publishDate: new Date('2026-10-23T12:00:00Z'), publishTime: '18:00', planId: 'p1', copyText: 'ESCENA 1', captionText: 'Llegó el otoño 🍂', internalNotes: null, plan: { month: 10, year: 2026, status: 'ACTIVO', client: { name: 'Aristea', isArchived: false } }, publications: [] };
const build = (row = item) => {
  const updates = [];
  const service = createBriaActionService({
    db: { contentItem: { findFirst: async ({ where }) => (where.id === row.id ? row : null) } },
    updateContentItem: async (id, data) => { updates.push([id, data]); return { id }; },
    now: () => new Date('2026-10-22T17:00:00Z')
  });
  return { service, updates };
};
const none = { objetivo: null, formato: null, guion: null, texto: null, estado: null, nota: null };

test('cambiar el texto y el estado: un párrafo con lo que queda, y al confirmar se guarda por la vía de la pantalla', async () => {
  const { service, updates } = build();
  const action = await service.prepare({ user: pm, type: 'EDIT_ITEM', args: { pieza: 'i1', ...none, texto: 'Llegó el otoño a Aristea 🍂 Reserva ya.', estado: 'aprobado' } });
  assert.equal(actionStage(action), 'READY');
  const reply = actionReply(action);
  assert.equal(reply.answer.split('\n\n')[0], 'Cambio «Lanzamiento del menú de otoño» (Reel de Aristea, viernes 23 de octubre): el texto de la publicación queda «Llegó el otoño a Aristea 🍂 Reserva ya.» y pasa a Aprobado.');
  assert.deepEqual(reply.quickReplies, ['Confirmar', 'Cancelar']);
  const out = await service.execute({ user: pm, action });
  assert.deepEqual(updates, [['i1', { captionText: 'Llegó el otoño a Aristea 🍂 Reserva ya.', status: 'APROBADO' }]]);
  assert.equal(out.text, 'Listo, quedó cambiada.\n\n[Abrir la pieza](/parrillas/p1?item=i1)');
});

test('el guion y el objetivo; un cambio sin nada nuevo no se prepara; un texto largo se resume', async () => {
  const { service } = build();
  const script = await service.prepare({ user: pm, type: 'EDIT_ITEM', args: { pieza: 'i1', ...none, guion: 'ESCENA 1: plano del menú. VOZ: «llegó el otoño».', objetivo: 'Menú de otoño' } });
  assert.equal(actionReply(script).answer.split('\n\n')[0], 'Cambio «Lanzamiento del menú de otoño» (Reel de Aristea, viernes 23 de octubre): el objetivo queda «Menú de otoño» y el guion queda «ESCENA 1: plano del menú. VOZ: «llegó el otoño».».');
  assert.deepEqual(script.payload.data, { objective: 'Menú de otoño', copyText: 'ESCENA 1: plano del menú. VOZ: «llegó el otoño».' });
  await assert.rejects(() => service.prepare({ user: pm, type: 'EDIT_ITEM', args: { pieza: 'i1', ...none, texto: 'Llegó el otoño 🍂' } }), /ya dice eso/);
  const long = await service.prepare({ user: pm, type: 'EDIT_ITEM', args: { pieza: 'i1', ...none, texto: 'x'.repeat(400) } });
  assert.match(actionReply(long).answer, /el texto de la publicación queda «x{160}…»/);
  assert.equal(long.payload.data.captionText.length, 400, 'lo que se guarda va entero');
});

test('lo que la pantalla tampoco deja: estados de la cola, piezas publicadas, formatos que no existen; y avisa si el cliente ya aprobó', async () => {
  const { service } = build();
  for (const estado of ['programado', 'publicado']) {
    await assert.rejects(() => service.prepare({ user: pm, type: 'EDIT_ITEM', args: { pieza: 'i1', ...none, estado } }), /no se pone a mano/);
  }
  await assert.rejects(() => service.prepare({ user: pm, type: 'EDIT_ITEM', args: { pieza: 'i1', ...none, formato: 'TikTok' } }), /Reel, Carrusel, Post, Video o Historia/);
  const published = build({ ...item, status: 'PUBLICADO' });
  await assert.rejects(() => published.service.prepare({ user: pm, type: 'EDIT_ITEM', args: { pieza: 'i1', ...none, texto: 'Nuevo' } }), /ya se publicó/);
  const approved = build({ ...item, status: 'APROBADO' });
  const edit = await approved.service.prepare({ user: pm, type: 'EDIT_ITEM', args: { pieza: 'i1', ...none, texto: 'Otro texto' } });
  assert.match(actionReply(edit).answer, /El cliente ya la aprobó/);
  await assert.rejects(() => service.prepare({ user: { ...pm, modulePermissions: { bria: true } }, type: 'EDIT_ITEM', args: { pieza: 'i1', ...none, texto: 'x' } }), { status: 403 });
  assert.equal(isPlainAgreement('sí, cámbiala', { verbs: ACTION_VERBS.EDIT_ITEM }), true);
});
