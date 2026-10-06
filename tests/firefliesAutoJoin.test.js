import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    FIREFLIES_BOT_EMAIL,
    shouldInviteFireflies,
    withFirefliesInvite
} from '../src/lib/firefliesAutoJoin.js';

// Fireflies en toda reunión (Rodny, 6 de octubre de 2026). Antes había una casilla
// «Invitar a Fireflies» y por defecto estaba apagada: en 60 días se marcó en 17 de 158
// reuniones, y no por descuido —141 de esas reuniones ni siquiera se crean en la
// plataforma, llegan del calendario de Google—. La casilla no podía cumplir «siempre».
// Ahora la decisión no se pregunta: toda reunión lleva a Fred.

test('toda reunión invita a Fireflies, sin preguntar', () => {
    assert.equal(shouldInviteFireflies('MEETING'), true);
    assert.equal(shouldInviteFireflies('meeting'), true);
});

// Lo que no es una reunión no lleva bot: una ausencia o un bloque de producción no se graba.
test('lo que no es una reunión no lleva a Fireflies', () => {
    for (const tipo of ['PRODUCTION', 'PROJECT', 'ABSENCE', 'BREAK']) {
        assert.equal(shouldInviteFireflies(tipo), false, `${tipo} no debería invitar al bot`);
    }
    assert.equal(shouldInviteFireflies(null), false);
    assert.equal(shouldInviteFireflies(undefined), false);
});

test('el bot se añade una sola vez, venga como venga escrito', () => {
    assert.deepEqual(withFirefliesInvite('MEETING', []), [FIREFLIES_BOT_EMAIL]);
    assert.deepEqual(withFirefliesInvite('MEETING', ['cliente@ejemplo.test']), ['cliente@ejemplo.test', FIREFLIES_BOT_EMAIL]);
    // Ya invitado a mano, en mayúsculas y con espacios: no se duplica.
    assert.deepEqual(withFirefliesInvite('MEETING', [' Fred@Fireflies.AI ']), [FIREFLIES_BOT_EMAIL]);
});

test('una reunión que deja de serlo pierde el bot', () => {
    assert.deepEqual(withFirefliesInvite('ABSENCE', ['fred@fireflies.ai', 'cliente@ejemplo.test']), ['cliente@ejemplo.test']);
});

test('una lista nula o con huecos no revienta', () => {
    assert.deepEqual(withFirefliesInvite('MEETING', null), [FIREFLIES_BOT_EMAIL]);
    assert.deepEqual(withFirefliesInvite('MEETING', ['', null, 'a@b.test']), ['a@b.test', FIREFLIES_BOT_EMAIL]);
});

// El servidor es quien decide: si dependiera de lo que mande la pantalla, cualquier
// cliente viejo —o una pestaña sin recargar— seguiría creando reuniones sin Fred.
test('la decisión la toma el servidor, no el formulario', async () => {
    const service = await readFile(new URL('../src/services/operationalEventService.js', import.meta.url), 'utf8');

    assert.match(service, /from '\.\.\/lib\/firefliesAutoJoin\.js'/);
    assert.match(service, /withFirefliesInvite/);
    assert.doesNotMatch(service, /if \(data\.captureWithFireflies\)/, 'ya no se mira la casilla del formulario');
    assert.doesNotMatch(service, /if \(captureWithFireflies\)/, 'ya no se mira la casilla del formulario');
});

// La casilla se retira de la pantalla: dejarla apagada mentía sobre lo que iba a pasar.
test('la pantalla ya no pregunta por Fireflies', async () => {
    const calendar = await readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

    assert.doesNotMatch(calendar, /Invitar a Fireflies/);
    assert.doesNotMatch(calendar, /formData\.captureWithFireflies/);
    assert.doesNotMatch(calendar, /captureWithFireflies:\s*event\.target\.checked/);
    // Y en su lugar se dice lo que de verdad ocurre.
    assert.match(calendar, /data-fireflies-always/);
});
