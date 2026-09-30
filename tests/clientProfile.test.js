import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeClientProfile,
    CLIENT_PROFILE_FIELDS,
    emptyClientProfile,
    clientProfileFrom,
    changedClientProfile
} from '../src/lib/clientProfile.js';
import { validateClientEdit } from '../src/lib/clientEdit.js';

// La ficha completa del cliente (Rodny, 30 de septiembre de 2026: «necesitamos tener base
// de datos de cliente … al crear un cliente nuevo se desplieguen todos los campos propios
// de un cliente, no es solo el nombre»). Una sola regla para Clientes, el directorio de
// Financiero y la cuenta por cobrar.

test('la ficha tiene nombre, identidad, contacto y ubicación', () => {
    assert.deepEqual(CLIENT_PROFILE_FIELDS, [
        'name', 'legalName', 'documentType', 'documentNumber',
        'contactName', 'email', 'phone', 'address', 'city', 'country'
    ]);
});

test('al crear, el nombre es lo único obligatorio', () => {
    const missing = normalizeClientProfile({ legalName: 'X' }, { requireName: true });
    assert.equal(missing.valid, false);
    assert.match(missing.errors.name, /nombre/);

    const minimal = normalizeClientProfile({ name: ' Fundación Grit ' }, { requireName: true });
    assert.deepEqual(minimal, { valid: true, data: { name: 'Fundación Grit' } });
});

test('una ficha completa se guarda limpia', () => {
    const result = normalizeClientProfile({
        name: 'Fundación Grit',
        legalName: 'FUNDACIÓN GRIT COLOMBIA',
        documentType: 'nit',
        documentNumber: '901.234.567-1',
        contactName: ' María Pérez ',
        email: ' Pagos@Grit.org ',
        phone: '+57 300 123 4567',
        address: 'Calle 64 # 17A-16',
        city: 'Cartagena',
        country: 'Colombia'
    }, { requireName: true });
    assert.deepEqual(result, {
        valid: true,
        data: {
            name: 'Fundación Grit',
            legalName: 'FUNDACIÓN GRIT COLOMBIA',
            documentType: 'NIT',
            documentNumber: '901.234.567-1',
            contactName: 'María Pérez',
            email: 'pagos@grit.org',
            phone: '+57 300 123 4567',
            address: 'Calle 64 # 17A-16',
            city: 'Cartagena',
            country: 'Colombia'
        }
    });
});

test('al editar, solo cambia lo que viene; vacío es borrar', () => {
    assert.deepEqual(normalizeClientProfile({ email: '' }), { valid: true, data: { email: null } });
    assert.deepEqual(normalizeClientProfile({ city: 'Bogotá' }), { valid: true, data: { city: 'Bogotá' } });
    assert.deepEqual(normalizeClientProfile({ documentType: '', documentNumber: '' }), { valid: true, data: { documentType: null, documentNumber: null } });
});

test('un correo o un teléfono mal escritos se dicen, y el documento va entero', () => {
    assert.match(normalizeClientProfile({ email: 'pagos@grit' }).errors.email, /correo/);
    assert.match(normalizeClientProfile({ phone: 'llamar después' }).errors.phone, /teléfono/);
    assert.equal(normalizeClientProfile({ documentType: 'NIT' }).valid, false);
    assert.equal(normalizeClientProfile({ name: '' }).valid, false, 'un nombre enviado vacío tampoco');
    assert.equal(normalizeClientProfile({ address: 'x'.repeat(201) }).valid, false);
});

test('el formulario arranca vacío o con la ficha, y manda solo lo que cambió', () => {
    const empty = emptyClientProfile();
    assert.deepEqual(Object.keys(empty), CLIENT_PROFILE_FIELDS);
    assert.ok(Object.values(empty).every((value) => value === ''));

    const original = clientProfileFrom({ name: 'Titanes', legalName: null, email: 'a@b.co', city: 'Cartagena', slug: 'titanes' });
    assert.equal(original.legalName, '');
    assert.equal(original.email, 'a@b.co');
    assert.equal(original.slug, undefined, 'solo campos de la ficha');

    const draft = { ...original, legalName: ' CORPORACIÓN ', city: 'Cartagena ', email: '' };
    assert.deepEqual(changedClientProfile(original, draft), { legalName: 'CORPORACIÓN', email: '' });
    // El documento viaja entero aunque cambie solo una mitad: se valida junto.
    assert.deepEqual(changedClientProfile(original, { ...original, documentNumber: '123' }), { documentType: '', documentNumber: '123' });
});

test('Clientes usa la misma regla: guarda contacto y ubicación', () => {
    assert.deepEqual(validateClientEdit({ contactName: 'María', email: 'pagos@grit.org', city: '' }), { contactName: 'María', email: 'pagos@grit.org', city: null });
    assert.throws(() => validateClientEdit({ email: 'no-es-correo' }), (error) => error.statusCode === 400 && /correo/.test(error.message));
});
