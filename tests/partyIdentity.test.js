import test from 'node:test';
import assert from 'node:assert/strict';
import {
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

test('los cuatro tipos están y cada uno tiene su etiqueta', () => {
    assert.deepEqual(PARTY_DOCUMENT_TYPES.map((type) => type.value), ['CC', 'NIT', 'CE', 'PAS']);
    for (const type of PARTY_DOCUMENT_TYPES) {
        assert.ok(type.label && type.name, `${type.value} necesita etiqueta y nombre`);
    }
    assert.equal(partyDocumentType('nit').label, 'NIT:');
    assert.equal(partyDocumentType('inventado'), null);
});

test('la ficha guarda los tres datos juntos o los vacía juntos', () => {
    const saved = validateClientEdit({ legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', documentType: 'NIT', documentNumber: '901378858' });
    assert.deepEqual(saved, { legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', documentType: 'NIT', documentNumber: '901378858' });

    const cleared = validateClientEdit({ legalName: '', documentType: '', documentNumber: '' });
    assert.deepEqual(cleared, { legalName: null, documentType: null, documentNumber: null });
});

test('no se puede guardar media identidad en la ficha', () => {
    assert.throws(
        () => validateClientEdit({ legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', documentType: 'NIT', documentNumber: '' }),
        (error) => error.statusCode === 400 && /número del documento/.test(error.message)
    );
});

test('editar solo el nombre del cliente sigue funcionando como antes', () => {
    assert.deepEqual(validateClientEdit({ name: 'Titanes' }), { name: 'Titanes' });
    assert.throws(() => validateClientEdit({}), (error) => error.statusCode === 400);
});

// Emitir sin la identidad no puede producir un documento con el nombre corto del
// equipo ni sin cédula: se niega y dice dónde completarlo.
test('no se emite una cuenta de cobro si la ficha del cliente no tiene identidad', async () => {
    const receivable = {
        id: 'debt-1', clientId: 'client-1', amount: 100, status: 'DEBE', number: null, payments: [],
        period: new Date('2026-09-01T12:00:00Z'), year: 2026, month: 9,
        client: { id: 'client-1', name: 'Titanes', legalName: null, documentType: null, documentNumber: null }
    };
    const prismaClient = {
        $transaction: async (callback) => callback({
            accountsReceivable: { findUnique: async () => receivable },
            financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) }
        })
    };

    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', {
            concept: 'Servicios', items: [{ description: 'Fee', amount: 1000 }], servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30'
        }, { id: 'user-1' }),
        // Se dice a quién le falta y los dos sitios donde se puede escribir: aquí
        // mismo, o en su ficha.
        (error) => error.code === 'RECEIVABLE_CLIENT_IDENTITY_MISSING'
            && error.statusCode === 409
            && /«Titanes»/.test(error.message)
            && /en este mismo formulario/.test(error.message)
            && /Clientes → «⋯» → Editar Cliente/.test(error.message)
    );
});
