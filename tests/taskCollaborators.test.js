import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TASK_WORKER_STATE,
    collaboratorElapsedMs,
    isWorkingNow,
    openSessionFor,
    taskStatusFromSessions,
    taskTotalElapsedMs,
    workerBreakdown
} from '../src/lib/taskCollaborators.js';

// Co-responsables (Rodny, 28 de septiembre de 2026). Hoy conviven dos relojes: el de la
// tarea (`startedAt` + `accumulatedWorkMs`) y el de las sesiones (`TaskWorkSession`, que
// ya guarda `workerId`). Con una sola persona miden lo mismo; con dos dejan de hacerlo,
// y **el bueno pasa a ser el de las sesiones**, porque es el único que sabe de quién es
// el tiempo. Estas reglas derivan todo de las sesiones: nada de un contador por tarea.

const AHORA = new Date('2026-09-28T15:00:00.000Z');
const hace = (minutos) => new Date(AHORA.getTime() - minutos * 60_000);
const minutos = (n) => n * 60_000;

const melissa = 'u-melissa';
const rodny = 'u-rodny';

// Melissa lleva 40 minutos trabajando ahora mismo y ya tenía 30 de antes.
// Rodny cerró una sesión de 20 minutos y ahora no está.
const sesiones = [
    { id: 's1', workerId: melissa, startedAt: hace(200), endedAt: hace(170), durationMs: minutos(30) },
    { id: 's2', workerId: rodny, startedAt: hace(120), endedAt: hace(100), durationMs: minutos(20) },
    { id: 's3', workerId: melissa, startedAt: hace(40), endedAt: null, durationMs: null }
];

test('el tiempo de cada quien sale de sus propias sesiones', () => {
    assert.equal(collaboratorElapsedMs(sesiones, melissa, AHORA), minutos(70), 'Melissa: 30 cerrados + 40 corriendo');
    assert.equal(collaboratorElapsedMs(sesiones, rodny, AHORA), minutos(20), 'Rodny: solo sus 20 cerrados');
});

// La pregunta exacta de Rodny: «si Melissa la pone en proceso y yo no he empezado,
// cómo empezaría el tiempo del coresponsable».
test('que otro empiece no arranca tu reloj', () => {
    const soloMelissa = [{ id: 's1', workerId: melissa, startedAt: hace(40), endedAt: null }];

    assert.equal(isWorkingNow(soloMelissa, melissa), true);
    assert.equal(isWorkingNow(soloMelissa, rodny), false);
    assert.equal(collaboratorElapsedMs(soloMelissa, rodny, AHORA), 0, 'el reloj de Rodny sigue en cero');
    // Y la tarjeta sí se ve en proceso, porque alguien está trabajando.
    assert.equal(taskStatusFromSessions(soloMelissa, 'PENDIENTE'), 'EN_CURSO');
});

test('el reloj de cada uno arranca cuando esa persona empieza, no antes', () => {
    let abiertas = [];
    assert.equal(collaboratorElapsedMs(abiertas, rodny, AHORA), 0);

    abiertas = openSessionFor(abiertas, rodny, hace(15));
    assert.equal(collaboratorElapsedMs(abiertas, rodny, AHORA), minutos(15));
    assert.equal(collaboratorElapsedMs(abiertas, melissa, AHORA), 0);
});

// Dos personas a la vez sobre la misma tarea es justamente lo que hoy no se puede
// representar con un solo `status` y un solo `startedAt`.
test('dos relojes pueden correr a la vez sobre la misma tarea', () => {
    const dos = [
        { id: 'a', workerId: melissa, startedAt: hace(40), endedAt: null },
        { id: 'b', workerId: rodny, startedAt: hace(10), endedAt: null }
    ];

    assert.equal(isWorkingNow(dos, melissa), true);
    assert.equal(isWorkingNow(dos, rodny), true);
    assert.equal(collaboratorElapsedMs(dos, melissa, AHORA), minutos(40));
    assert.equal(collaboratorElapsedMs(dos, rodny, AHORA), minutos(10));
});

test('una persona no puede tener dos sesiones abiertas en la misma tarea', () => {
    const abierta = openSessionFor([], melissa, hace(30));
    const otra = openSessionFor(abierta, melissa, hace(5));

    assert.equal(otra.filter((s) => s.workerId === melissa && !s.endedAt).length, 1, 'se reutiliza la que ya estaba abierta');
    assert.equal(collaboratorElapsedMs(otra, melissa, AHORA), minutos(30), 'y no se pierde el tiempo ya corrido');
});

test('el total de la tarea es la suma de todos, no el de una persona', () => {
    assert.equal(taskTotalElapsedMs(sesiones, AHORA), minutos(90));
});

// El historial deja de decir «4:20» y pasa a decir de quién es cada tramo.
test('el desglose dice cuánto puso cada quien y quién sigue trabajando', () => {
    const desglose = workerBreakdown(sesiones, AHORA);

    assert.deepEqual(desglose.map((fila) => fila.workerId), [melissa, rodny], 'de mayor a menor tiempo');
    assert.equal(desglose[0].elapsedMs, minutos(70));
    assert.equal(desglose[0].state, TASK_WORKER_STATE.WORKING);
    assert.equal(desglose[1].elapsedMs, minutos(20));
    assert.equal(desglose[1].state, TASK_WORKER_STATE.PAUSED);
});

// Quien está en la lista pero no ha tocado la tarea aparece con su reloj en cero: si no
// saliera, no habría forma de ver que le falta empezar.
test('un co-responsable que no ha empezado aparece en cero, no desaparece', () => {
    const desglose = workerBreakdown(sesiones, AHORA, [melissa, rodny, 'u-bruno']);

    const bruno = desglose.find((fila) => fila.workerId === 'u-bruno');
    assert.ok(bruno, 'tiene que aparecer aunque no tenga sesiones');
    assert.equal(bruno.elapsedMs, 0);
    assert.equal(bruno.state, TASK_WORKER_STATE.NOT_STARTED);
});

test('sin sesiones abiertas la tarea vuelve al estado que tenía', () => {
    const cerradas = sesiones.filter((s) => s.endedAt);
    assert.equal(taskStatusFromSessions(cerradas, 'PENDIENTE'), 'PENDIENTE');
    // Y una tarea ya realizada no se reabre sola porque alguien tenga el reloj corriendo.
    assert.equal(taskStatusFromSessions(sesiones, 'REALIZADA'), 'REALIZADA');
});

test('una lista vacía o nula no revienta', () => {
    assert.equal(collaboratorElapsedMs(null, melissa, AHORA), 0);
    assert.equal(taskTotalElapsedMs(undefined, AHORA), 0);
    assert.deepEqual(workerBreakdown([], AHORA), []);
    assert.equal(isWorkingNow(null, melissa), false);
});
