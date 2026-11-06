import test from 'node:test';
import assert from 'node:assert/strict';
import { currentImportantNotice } from '../src/services/importantNoticeService.js';
import { planNoticePlan } from '../src/lib/planCloseNotices.js';

test('un PM marcado también Administrativo no recibe cartera si no tiene acceso financiero', async () => {
  const notice = { id: 'deuda', userId: 'pm', kind: 'CARTERA_UNICO', subjectId: 'r', message: 'Saldo privado', level: 'IMPORTANTE', createdAt: new Date(), resolvedAt: null };
  const db = {
    user: { findUnique: async () => ({ id: 'pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { clientes: true, financiero: false }, teamMember: { isActive: true, areas: ['ADMINISTRATIVA', 'PROJECT_MANAGEMENT'] } }) },
    teamMember: { findFirst: async () => ({ areas: ['ADMINISTRATIVA', 'PROJECT_MANAGEMENT'] }) },
    importantNotice: { findMany: async () => [notice], findFirst: async () => null, update: async () => { throw new Error('no debe consultar ni modificar la deuda'); } },
    accountsReceivable: { findUnique: async () => { throw new Error('no debe consultar la deuda'); } },
  };
  assert.equal((await currentImportantNotice(db, 'pm')).notice, null);
});

test('un cambio de piezas pendientes actualiza la banda sin sustituir el aviso ni perder Recordarme', () => {
  const row = { clientId: 'c', clientName: 'Faro', slug: 'faro', cycle: { year: 2026, month: 11, label: 'Noviembre', end: '2026-11-30' }, overdue: 2 };
  const wanted = planNoticePlan({ pending: [row], today: '2026-11-06' }).create[0];
  const open = [{ ...wanted, id: 'n', snoozedUntil: new Date('2026-11-07T13:00:00Z') }];
  const result = planNoticePlan({ pending: [{ ...row, overdue: 3 }], open, today: '2026-11-06' });
  assert.equal(result.close.length, 0);
  assert.equal(result.create.length, 0);
  assert.equal(result.update[0].id, 'n');
  assert.match(result.update[0].message, /3 piezas/);
});
