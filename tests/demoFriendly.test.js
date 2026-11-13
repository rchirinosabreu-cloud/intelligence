import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_CONNECTION_CODE, DEMO_CONNECTION_MESSAGE, isDemoConnectionMessage, demoFriendlyPayload } from '../src/lib/demoMode.js';
import { createDemoFriendlyErrors } from '../src/middlewares/demoFriendlyErrors.js';
import { demoBriaAnswer } from '../src/lib/demoBriaAnswers.js';

// La demo sin errores (Rodny, 13 de noviembre de 2026: «no le puedes mostrar errores en el demo a la persona … que
// diga un mensaje, por ejemplo, que esta función depende de una conexión real»; Bria con «respuestas inventadas»).

test('el mensaje de la demo cabe en un aviso y se reconoce, aunque venga con otro texto alrededor', () => {
    assert.ok(DEMO_CONNECTION_MESSAGE.length <= 70);
    assert.equal(isDemoConnectionMessage(DEMO_CONNECTION_MESSAGE), true);
    assert.equal(isDemoConnectionMessage(`No se pudo guardar: ${DEMO_CONNECTION_MESSAGE}`), true);
    assert.equal(isDemoConnectionMessage('Ocurrió un error inesperado'), false);
    assert.equal(isDemoConnectionMessage(null), false);
});

test('fuera de la demo un error del servidor sale tal cual', () => {
    assert.equal(demoFriendlyPayload(503, { message: 'Bria no está disponible' }, {}), null);
    assert.equal(demoFriendlyPayload(500, { error: 'X' }, { DEMO_MODE: 'false' }), null);
});

test('en la demo un fallo del servidor dice que depende de una conexión real', () => {
    const env = { DEMO_MODE: 'true' };
    assert.deepEqual(demoFriendlyPayload(500, { error: 'INTERNAL_SERVER_ERROR', message: 'Ocurrió un error inesperado' }, env), { error: DEMO_CONNECTION_CODE, message: DEMO_CONNECTION_MESSAGE });
    assert.deepEqual(demoFriendlyPayload(503, { message: 'Bria no está disponible' }, env)?.error, DEMO_CONNECTION_CODE);
    // Lo que no es un fallo del servidor (validaciones, permisos, conflictos) se respeta: le dice a la persona qué corregir.
    assert.equal(demoFriendlyPayload(400, { error: 'Faltan campos' }, env), null);
    assert.equal(demoFriendlyPayload(409, { error: 'Conflicto' }, env), null);
    assert.equal(demoFriendlyPayload(200, { ok: true }, env), null);
});

test('el filtro de la demo reemplaza la respuesta de error de una ruta de la API', () => {
    const middleware = createDemoFriendlyErrors({ env: { DEMO_MODE: 'true' } });
    const sent = [];
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { sent.push([this.statusCode, body]); return this; } };
    middleware({}, res, () => {});
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Ocurrió un error inesperado' });
    res.status(200).json({ ok: true });
    assert.deepEqual(sent[0], [503, { error: DEMO_CONNECTION_CODE, message: DEMO_CONNECTION_MESSAGE }]);
    assert.deepEqual(sent[1], [200, { ok: true }]);
});

test('fuera de la demo el filtro no toca nada', () => {
    let called = false;
    const middleware = createDemoFriendlyErrors({ env: {} });
    const res = { json() { called = true; } };
    const original = res.json;
    middleware({}, res, () => {});
    assert.equal(res.json, original);
    res.json();
    assert.equal(called, true);
});

test('Bria responde en la demo según el tema, sin prometer nada que no hizo', () => {
    const person = { name: 'Valentina Ruiz' };
    assert.match(demoBriaAnswer('¿Cómo amaneció la agencia hoy?', person), /Valentina/);
    assert.match(demoBriaAnswer('qué pendientes tengo para hoy', person), /pendiente/i);
    assert.match(demoBriaAnswer('cómo va la parrilla de Café Altura', person), /parrilla/i);
    assert.match(demoBriaAnswer('quién debe plata, la cartera', person), /cartera|cobr/i);
    assert.match(demoBriaAnswer('cómo va la pauta', person), /pauta/i);
    const unknown = demoBriaAnswer('cuéntame un chiste de astronautas', person);
    assert.ok(unknown.length > 40);
    // Crear algo desde el chat no se finge: se dice dónde hacerlo.
    assert.match(demoBriaAnswer('créame un pendiente para Laura', person), /Gestión|Nueva tarea/);
    assert.doesNotMatch(demoBriaAnswer('créame un pendiente para Laura', person), /^Listo/);
});
