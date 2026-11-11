import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPartyRows } from '../src/lib/clientDirectoryRows.js';
import { listThirdParties } from '../src/services/thirdPartyService.js';
import { financialPartyChoices } from '../src/services/financialPartySelection.js';

// Rodny, 10 de noviembre de 2026: «no entiendo por qué Jarlan sigue apareciendo … él ya no está en
// Brain e incluso está desactivado su usuario». Su ficha de nómina del Excel seguía marcada activa.
// Una ficha de nómina sigue a su persona en Equipo: con la cuenta desactivada no se lista ni se ofrece.

test('Terceros no lista la ficha de nómina de quien ya no está en Equipo', async () => {
    let where;
    const prismaClient = {
        thirdParty: { findMany: async () => [] },
        financialCollaborator: { findMany: async (args) => { where = args.where; return []; } }
    };
    await listThirdParties(prismaClient, { includeInactive: true });
    assert.deepEqual(where, { isActive: true, OR: [{ userId: null }, { user: { isActive: true } }] });
});

test('los selectores de persona (préstamo, canje, pago) tampoco la ofrecen', async () => {
    let where;
    const tx = {
        thirdParty: { findMany: async () => [] },
        client: { findMany: async () => [] },
        teamMember: { findMany: async () => [] },
        financialCollaborator: { findMany: async (args) => { where = args.where; return []; } }
    };
    await financialPartyChoices(tx);
    assert.deepEqual(where.OR, [{ userId: null }, { user: { isActive: true } }]);
    assert.equal(where.isActive, true);
});

test('la ficha de nómina de alguien de Equipo va en su fila, no en otra con el mismo nombre', () => {
    const rows = buildPartyRows([], [], {}, [{ id: 'tm-elisa', name: 'Elisa Mestra', isActive: true, userId: 'u-elisa' }], [
        { id: 'fc-elisa', displayName: 'Elisa Mestra', thirdPartyId: null, userId: 'u-elisa' },
        { id: 'fc-sin-cuenta', displayName: 'Persona sin cuenta', thirdPartyId: null, userId: null }
    ]);
    const elisa = rows.filter(row => row.name === 'Elisa Mestra');
    assert.equal(elisa.length, 1, 'una sola fila por persona');
    assert.equal(elisa[0].collaborator.id, 'fc-elisa');
    assert.ok(rows.some(row => row.sourceId === 'payroll:fc-sin-cuenta'), 'una ficha sin cuenta sigue apareciendo sola');
});
