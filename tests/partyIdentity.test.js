import test from 'node:test';
import assert from 'node:assert/strict';
import {
    dropIncompleteDocument,
    normalizePartialPartyIdentity,
    normalizePartyIdentity,
    hasPartyIdentity,
    formatPartyDocument,
    formatPartyName,
    partyDocumentType,
    PARTY_DOCUMENT_TYPES
} from '../src/lib/partyIdentity.js';
import { validateClientEdit } from '../src/lib/clientEdit.js';
import { issueReceivableDocument } from '../src/services/receivableDocumentService.js';

// La ficha del cliente guarda el nombre legal y el documento una sola vez, para no
// repetirlos en cada cuenta de cobro (Rodny, 22 de septiembre de 2026).

const titanes = { name: 'Titanes', legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', documentType: 'NIT', documentNumber: '901378858' };
const elvira = { name: 'Elvira', legalName: 'Elvira Carolina Utria Camacho', documentType: 'CC', documentNumber: '33.334.977' };

test('reproduce la identidad de las cuentas de cobro reales', () => {
    assert.equal(formatPartyName(titanes), 'CORPORACIÓN DEPORTIVA LOS TITANES');
    assert.equal(formatPartyDocument(titanes), 'NIT: 901378858');
    assert.equal(formatPartyName(elvira), 'ELVIRA CAROLINA UTRIA CAMACHO');
    assert.equal(formatPartyDocument(elvira), 'CC. 33.334.977');
});

test('el nombre legal no es el nombre con el que el equipo llama al cliente', () => {
    // La ficha se llama «Titanes»; el documento dice la razón social completa.
    assert.notEqual(formatPartyName(titanes), titanes.name.toUpperCase());
    // Sin nombre legal se cae al de la ficha antes que dejar el documento en blanco.
    assert.equal(formatPartyName({ legalName: '' }, 'Titanes'), 'TITANES');
    assert.equal(formatPartyName({}, ''), null);
});

test('una identidad a medias no vale para un documento', () => {
    assert.equal(hasPartyIdentity(titanes), true);
    assert.equal(hasPartyIdentity({ ...titanes, documentNumber: '' }), false);
    assert.equal(hasPartyIdentity({ ...titanes, legalName: '   ' }), false);
    assert.equal(hasPartyIdentity({ ...titanes, documentType: 'INVENTADO' }), false);
    assert.equal(hasPartyIdentity(null), false);
    // Y si no está completa, no se escribe a medias.
    assert.equal(formatPartyDocument({ ...titanes, documentNumber: '' }), null);
});

test('el número se guarda tal como lo escriben, sin reformatear', () => {
    // «Arreglar» un documento de identidad es como se introducen errores en un dato
    // que va impreso y hay que cotejar contra una cédula.
    const result = normalizePartyIdentity({ legalName: 'Elvira', documentType: 'cc', documentNumber: ' 33.334.977 ' });
    assert.equal(result.valid, true);
    assert.equal(result.identity.documentNumber, '33.334.977');
    assert.equal(result.identity.documentType, 'CC');
    assert.equal(normalizePartyIdentity({ legalName: 'X', documentType: 'NIT', documentNumber: '901378858-1' }).identity.documentNumber, '901378858-1');
});

test('cada dato que falta dice qué falta', () => {
    const result = normalizePartyIdentity({ legalName: '  ', documentType: 'XX', documentNumber: '' });
    assert.equal(result.valid, false);
    assert.match(result.errors.legalName, /nombre completo/);
    assert.match(result.errors.documentType, /tipo de documento/);
    assert.match(result.errors.documentNumber, /número del documento/);
});

test('un número con letras solo se acepta en un pasaporte', () => {
    assert.equal(normalizePartyIdentity({ legalName: 'X', documentType: 'CC', documentNumber: 'AB123' }).valid, false);
    assert.equal(normalizePartyIdentity({ legalName: 'X', documentType: 'PAS', documentNumber: 'AB123456' }).valid, true);
});

// EIN: el número fiscal de una empresa de Estados Unidos (Rodny, 30 de septiembre de
// 2026: «si el cliente no tiene NIT o EIN»), como 2X Global.
test('los tipos están y cada uno tiene su etiqueta, incluido el EIN', () => {
    assert.deepEqual(PARTY_DOCUMENT_TYPES.map((type) => type.value), ['CC', 'NIT', 'CE', 'PAS', 'EIN']);
    assert.equal(partyDocumentType('ein').label, 'EIN:');
    assert.equal(normalizePartyIdentity({ legalName: '2X GLOBAL LLC', documentType: 'EIN', documentNumber: '12-3456789' }).valid, true);
    for (const type of PARTY_DOCUMENT_TYPES) {
        assert.ok(type.label && type.name, `${type.value} necesita etiqueta y nombre`);
    }
    assert.equal(partyDocumentType('nit').label, 'NIT:');
    assert.equal(partyDocumentType('inventado'), null);
});

test('la ficha guarda la identidad y la vacía', () => {
    const saved = validateClientEdit({ legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', documentType: 'NIT', documentNumber: '901378858' });
    assert.deepEqual(saved, { legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', documentType: 'NIT', documentNumber: '901378858' });

    const cleared = validateClientEdit({ legalName: '', documentType: '', documentNumber: '' });
    assert.deepEqual(cleared, { legalName: null, documentType: null, documentNumber: null });
});

// Desde el 30 de septiembre de 2026 el nombre legal va solo: una ficha puede tenerlo sin
// documento. Lo que no se guarda es un documento a medias.
test('el nombre legal va solo; el documento va entero o no va', () => {
    assert.deepEqual(validateClientEdit({ legalName: 'Fundación Grit', documentType: '', documentNumber: '' }), { legalName: 'Fundación Grit', documentType: null, documentNumber: null });
    assert.throws(
        () => validateClientEdit({ legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', documentType: 'NIT', documentNumber: '' }),
        (error) => error.statusCode === 400 && /número del documento/.test(error.message)
    );
});

test('editar solo el nombre del cliente sigue funcionando como antes', () => {
    assert.deepEqual(validateClientEdit({ name: 'Titanes' }), { name: 'Titanes' });
    assert.throws(() => validateClientEdit({}), (error) => error.statusCode === 400);
});

// Rodny, 30 de septiembre de 2026: «no me deja emitir cuenta de cobro si el cliente no
// tiene NIT o EIN o nro de documento registrado, necesito levantar esa restricción».
// La identidad sigue siendo lo que va impreso cuando existe, pero ya no es una puerta.
test('una ficha sin identidad ya no impide emitir la cuenta de cobro', async () => {
    const receivable = {
        id: 'debt-1', clientId: 'client-1', amount: 100, status: 'DEBE', number: null, payments: [],
        period: new Date('2026-09-01T12:00:00Z'), year: 2026, month: 9,
        client: { id: 'client-1', name: 'Titanes', legalName: null, documentType: null, documentNumber: null }
    };
    const prismaClient = {
        $transaction: async (callback) => callback({
            accountsReceivable: {
                findUnique: async () => receivable,
                aggregate: async () => ({ _max: { number: 392 } }),
                update: async (args) => ({ ...receivable, ...args.data, items: [] })
            },
            receivableItem: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 1 }) },
            financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
            financialAuditEvent: { create: async () => ({ id: 'audit-1' }) }
        })
    };

    const result = await issueReceivableDocument(prismaClient, 'debt-1', {
        concept: 'Servicios', items: [{ description: 'Fee', amount: 1000 }], servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30'
    }, { id: 'user-1' });
    assert.equal(result.document.formattedNumber, 'No. 0393');
});

// Sin documento el PDF dice el nombre de la ficha y se salta la línea del documento,
// en vez de imprimir una línea vacía o un «null».
test('sin documento no hay línea de documento, y el nombre sale de la ficha', () => {
    assert.equal(formatPartyDocument({ legalName: null, documentType: null, documentNumber: null }), null);
    assert.equal(formatPartyDocument({ legalName: null, documentType: 'NIT', documentNumber: '901378858' }), 'NIT: 901378858');
    assert.equal(formatPartyName({ legalName: null }, 'Titanes'), 'TITANES');
});

// Rodny, 30 de septiembre de 2026: emitir ya no exige el documento del cliente. Lo que se
// escriba se valida; lo que no, se deja vacío.
test('la identidad parcial acepta lo escrito y exige tipo y número juntos', () => {
    assert.deepEqual(normalizePartialPartyIdentity({}), { valid: true, identity: {} });
    assert.deepEqual(normalizePartialPartyIdentity({ legalName: '  2X Global LLC ' }), { valid: true, identity: { legalName: '2X Global LLC' } });
    assert.deepEqual(normalizePartialPartyIdentity({ documentType: 'nit', documentNumber: '900123456' }), { valid: true, identity: { documentType: 'NIT', documentNumber: '900123456' } });
    assert.equal(normalizePartialPartyIdentity({ documentType: 'NIT' }).valid, false);
    assert.equal(normalizePartialPartyIdentity({ documentNumber: '900123456' }).valid, false);
    assert.equal(normalizePartialPartyIdentity({ documentType: 'CC', documentNumber: 'abc' }).valid, false);
    assert.equal(normalizePartialPartyIdentity({ legalName: 'x'.repeat(201) }).valid, false);
});

// Rodny, 30 de septiembre de 2026: «si yo pongo en documento "sin definir" no tengo
// necesidad de poner el número. Debería poder emitir y simplemente no aparece nro de documento».
test('al emitir, un documento a medias no va, sin frenar nada', () => {
    assert.deepEqual(dropIncompleteDocument({ legalName: 'X', documentType: 'NIT', documentNumber: ' ' }), { legalName: 'X', documentType: '', documentNumber: '' });
    assert.deepEqual(dropIncompleteDocument({ legalName: 'X', documentType: '', documentNumber: '900123456' }), { legalName: 'X', documentType: '', documentNumber: '' });
    assert.equal(normalizePartialPartyIdentity(dropIncompleteDocument({ documentType: 'NIT', documentNumber: '' })).valid, true);
    assert.equal(normalizePartialPartyIdentity(dropIncompleteDocument({ documentType: '', documentNumber: '900123456' })).valid, true);
    assert.deepEqual(dropIncompleteDocument({ documentType: 'CC', documentNumber: '123' }), { documentType: 'CC', documentNumber: '123' });
    // Completo pero mal escrito sí se avisa: ese número iría impreso.
    assert.equal(normalizePartialPartyIdentity(dropIncompleteDocument({ documentType: 'NIT', documentNumber: 'abc' })).valid, false);
});
