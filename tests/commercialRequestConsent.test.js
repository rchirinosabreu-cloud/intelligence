import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRIVACY_POLICY_VERSION, buildLeadDraft, validateStep, visibleSteps } from '../src/lib/commercialRequestForm.js';

// Autorización de datos en la solicitud comercial (27 de septiembre de 2026). El formulario
// público recoge nombre, correo y teléfono de personas que aún no son clientes: la Ley 1581
// exige su autorización previa, expresa e informada, y poder demostrarla después.

const contact = visibleSteps({}).find((step) => step.id === 'contacto');
const baseContact = {
    contactName: 'Ana Prospecto', company: 'Marca SAS', email: 'ana@marca.co', phone: '+57 300 000 0000', location: 'Cartagena, Colombia'
};

test('el primer paso pide la autorización, obligatoria y enlazada a la política', () => {
    const consent = contact.questions.find((question) => question.id === 'dataAuthorization');
    assert.ok(consent, 'falta la casilla de autorización');
    assert.equal(consent.type, 'consent');
    assert.equal(consent.required, true);
    assert.match(consent.label, /BRAIN STUDIO AGENCIA CREATIVA S\.A\.S\./);
    assert.equal(consent.policyHref, '/privacidad');
});

test('sin marcarla no se avanza; un «false» tampoco cuenta como autorización', () => {
    assert.ok(validateStep(contact, baseContact).dataAuthorization);
    assert.ok(validateStep(contact, { ...baseContact, dataAuthorization: false }).dataAuthorization);
    assert.ok(validateStep(contact, { ...baseContact, dataAuthorization: 'true' }).dataAuthorization, 'solo el booleano true');
    assert.deepEqual(validateStep(contact, { ...baseContact, dataAuthorization: true }), {});
});

test('la solicitud guarda la prueba de la autorización: cuándo y con qué versión de la política', () => {
    const receivedAt = new Date('2026-09-28T15:00:00Z');
    const { request } = buildLeadDraft({ ...baseContact, dataAuthorization: true }, { receivedAt });
    assert.deepEqual(request.dataAuthorization, {
        granted: true,
        grantedAt: '2026-09-28T15:00:00.000Z',
        policyVersion: PRIVACY_POLICY_VERSION
    });
});

test('el formulario dibuja la casilla con enlace a la política', async () => {
    const source = await readFile(new URL('../src/components/public/CommercialRequest/CommercialRequestForm.jsx', import.meta.url), 'utf8');
    assert.match(source, /case 'consent'/);
    assert.match(source, /type="checkbox"/);
    assert.match(source, /question\.policyHref/);
});
