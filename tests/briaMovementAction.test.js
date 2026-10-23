import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaActionService } from '../src/services/briaActionService.js';
import { actionReply, actionStage } from '../src/lib/briaActions.js';
import { isPlainAgreement, ACTION_VERBS } from '../src/lib/briaAgreement.js';

// «Registra este movimiento, este es el comprobante» (Rodny, 22 de octubre de 2026). Bria prepara, pregunta de a una
// cosa lo que falta —con botones— y, al confirmar, registra el movimiento por la misma vía que la pantalla y le pega el
// comprobante que llegó por el chat.

const contadora = { userId: 'u-eli', role: 'PROJECT_MANAGER', isActive: true, financialRole: 'EDITOR', modulePermissions: { bria: true, financiero: true } };
const accounts = [{ id: 'a1', name: 'Bancolombia ahorros', institution: 'Bancolombia', lastFour: '4321', currency: 'COP' }, { id: 'a2', name: 'Davivienda corriente', institution: 'Davivienda', lastFour: '9876', currency: 'COP' }];
const db = {
  financialAccount: { findMany: async () => accounts },
  client: { findMany: async ({ where }) => (JSON.stringify(where).includes('Aristea') ? [{ id: 'c1', name: 'Aristea', slug: 'aristea', isArchived: false }] : []) }
};
const receipt = { id: 'f1', name: 'recibo.jpg', status: 'IMAGE', current: true };
const build = (extra = {}) => {
  const calls = [];
  const service = createBriaActionService({
    db, now: () => new Date('2026-10-22T17:00:00Z'),
    recordMovement: async ({ input, user }) => { calls.push(['record', input, user.userId]); return { id: 'r1' }; },
    attachMovementDocument: async ({ recordId, file }) => { calls.push(['attach', recordId, file.originalname, file.mimetype, file.buffer.length]); return { id: 'd1' }; },
    ...extra
  });
  return { service, calls };
};
const args = (over = {}) => ({ tipo: 'egreso', valor: '1.200.000', fecha: 'ayer', cuenta: 'Bancolombia', categoria: 'Administrativo', cliente: null, concepto: 'Licencia de Canva', contraparte: 'Canva', referencia: null, comprobante: null, ...over });

test('con todo lo que dijo la persona y el comprobante del mensaje, sale un párrafo con sus botones', async () => {
  const { service } = build();
  const action = await service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: args(), attachments: [receipt] });
  assert.equal(actionStage(action), 'READY');
  const reply = actionReply(action);
  assert.equal(reply.answer, 'Registro un egreso de $1.200.000 del 21 de octubre de 2026 en Bancolombia ahorros, categoría Administrativo: Licencia de Canva, a Canva. Le pego el comprobante recibo.jpg.\n\n¿Lo hago así? También puedes pedirme cualquier ajuste.');
  assert.deepEqual(reply.quickReplies, ['Confirmar', 'Cancelar']);
  assert.deepEqual(action.payload, { type: 'EXPENSE', amount: 1200000, date: '2026-10-21', accountId: 'a1', category: 'ADMINISTRATIVO', clientId: null, description: 'Licencia de Canva', counterparty: 'Canva', reference: null, fileId: 'f1' });
});

test('lo que falta se pregunta de a una cosa, con las opciones como botones', async () => {
  const { service } = build();
  const noAccount = await service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: args({ cuenta: null }), attachments: [] });
  assert.equal(actionStage(noAccount), 'MISSING');
  assert.match(actionReply(noAccount).answer, /¿De qué cuenta salió\?/);
  assert.deepEqual(actionReply(noAccount).quickReplies, ['Bancolombia ahorros', 'Davivienda corriente']);
  const income = await service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: args({ tipo: 'ingreso', cuenta: null }), attachments: [] });
  assert.match(actionReply(income).answer, /¿A qué cuenta entró\?/);
  const noCategory = await service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: args({ categoria: 'algo raro' }), attachments: [] });
  assert.match(actionReply(noCategory).answer, /¿En qué categoría/);
  assert.ok(actionReply(noCategory).quickReplies.includes('Administrativo'));
  const nothing = await service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: args({ tipo: null, valor: null }), attachments: [] });
  assert.match(actionReply(nothing).answer, /¿Es un ingreso o un egreso\?/);
  assert.deepEqual(actionReply(nothing).quickReplies, ['Ingreso', 'Egreso']);
  // La respuesta completa lo que faltaba sin repetir lo demás.
  const completed = await service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: { ...Object.fromEntries(Object.keys(args()).map((key) => [key, null])), cuenta: 'Davivienda' }, previous: noAccount, attachments: [] });
  assert.equal(completed.payload.accountId, 'a2');
  assert.equal(completed.payload.amount, 1200000);
});

test('una sola cuenta no se pregunta; un cliente se busca; una cifra o una fecha imposibles se dicen', async () => {
  const single = build({ db: { ...db, financialAccount: { findMany: async () => [accounts[0]] } } });
  const action = await single.service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: args({ cuenta: null, tipo: 'ingreso', cliente: 'Aristea' }), attachments: [] });
  assert.equal(action.payload.accountId, 'a1');
  assert.equal(action.payload.clientId, 'c1');
  const { service } = build();
  const future = await service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: args({ fecha: 'mañana' }), attachments: [] });
  assert.match(actionReply(future).answer, /¿Qué día fue\?/);
});

test('al confirmar se registra y se le pega el comprobante; si el comprobante falla, el movimiento queda y se dice', async () => {
  const { service, calls } = build();
  const action = await service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: args(), attachments: [receipt] });
  const out = await service.execute({ user: contadora, action, loadAttachment: async (id) => (id === 'f1' ? { name: 'recibo.jpg', mime: 'image/jpeg', buffer: Buffer.from('jpeg') } : null) });
  assert.deepEqual(calls[0], ['record', { type: 'EXPENSE', amount: 1200000, date: '2026-10-21', accountId: 'a1', category: 'ADMINISTRATIVO', clientId: null, description: 'Licencia de Canva', counterparty: 'Canva', reference: null, notes: 'Registrado con Bria.' }, 'u-eli']);
  assert.deepEqual(calls[1], ['attach', 'r1', 'recibo.jpg', 'image/jpeg', 4]);
  assert.equal(out.text, 'Listo, quedó registrado con su comprobante.\n\n[Abrir en Financiero](/financiero?tab=movimientos)');
  const broken = build({ attachMovementDocument: async () => { throw new Error('bucket caído'); } });
  const again = await broken.service.prepare({ user: contadora, type: 'FINANCIAL_RECORD', args: args(), attachments: [receipt] });
  const partial = await broken.service.execute({ user: contadora, action: again, loadAttachment: async () => ({ name: 'recibo.jpg', mime: 'image/jpeg', buffer: Buffer.from('x') }) });
  assert.match(partial.text, /^Listo, quedó registrado\. El comprobante no se pudo pegar: súbelo desde Financiero/);
});

test('sin escritura en Financiero no se prepara nada; «sí, regístralo» confirma', async () => {
  const { service } = build();
  await assert.rejects(() => service.prepare({ user: { ...contadora, financialRole: 'VIEWER' }, type: 'FINANCIAL_RECORD', args: args(), attachments: [] }), { status: 403 });
  await assert.rejects(() => service.prepare({ user: { ...contadora, modulePermissions: { bria: true } }, type: 'FINANCIAL_RECORD', args: args(), attachments: [] }), { status: 403 });
  assert.equal(isPlainAgreement('sí, regístralo', { verbs: ACTION_VERBS.FINANCIAL_RECORD }), true);
});
