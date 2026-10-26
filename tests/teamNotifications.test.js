import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_NOTIFICATION_PREFERENCES,
    TEAM_COMPLETION_NOTIFICATION_TYPE,
    normalizeNotificationPreferences,
    teamCompletionMessage,
    teamCompletionRecipients,
    wantsTeamCompletions
} from '../src/lib/teamNotifications.js';

// «Avísame cuando el equipo termine un pendiente» (Rodny y la project manager, 26 de
// octubre de 2026). Seguir un pendiente ya existía; lo que faltaba era seguirlo todo sin
// pulsar la campana una por una.

const persona = (id, teamCompletions) => ({ id, notificationPreferences: { teamCompletions } });
const tareaAbierta = { id: 'tarea', isPrivate: false };

test('el interruptor nace apagado y solo lo enciende un sí explícito', () => {
    assert.deepEqual(DEFAULT_NOTIFICATION_PREFERENCES, { teamCompletions: false });
    assert.equal(wantsTeamCompletions(undefined), false);
    assert.equal(wantsTeamCompletions({}), false);
    assert.equal(wantsTeamCompletions({ teamCompletions: 'true' }), false, 'un texto no es un sí');
    assert.equal(wantsTeamCompletions({ teamCompletions: 1 }), false);
    assert.equal(wantsTeamCompletions({ teamCompletions: true }), true);
});

test('solo se guardan las claves conocidas', () => {
    assert.deepEqual(
        normalizeNotificationPreferences({ teamCompletions: true, loQueSea: true, __proto__: {} }),
        { teamCompletions: true }
    );
    for (const valor of [null, 'texto', 42, []]) {
        assert.deepEqual(normalizeNotificationPreferences(valor), { teamCompletions: false }, `«${valor}»`);
    }
});

test('avisa a quien lo encendió', () => {
    const destinatarios = teamCompletionRecipients({
        candidates: [persona('pm', true), persona('otra', false)],
        task: tareaAbierta,
        completedById: 'melissa'
    });
    assert.deepEqual(destinatarios, ['pm']);
});

test('quien cerró la tarea no se avisa a sí mismo', () => {
    const destinatarios = teamCompletionRecipients({
        candidates: [persona('pm', true)],
        task: tareaAbierta,
        completedById: 'pm'
    });
    assert.deepEqual(destinatarios, []);
});

// El aviso de seguidor ya le llegó por su camino de siempre.
test('quien ya seguía la tarea no recibe dos avisos', () => {
    const destinatarios = teamCompletionRecipients({
        candidates: [persona('pm', true), persona('rodny', true)],
        task: tareaAbierta,
        followerIds: ['pm'],
        completedById: 'melissa'
    });
    assert.deepEqual(destinatarios, ['rodny']);
});

// Ningún rol entra por su cargo: ni admin ni project manager.
test('un pendiente privado que no puede abrir no le genera aviso', () => {
    const privada = { id: 'tarea', isPrivate: true, creatorId: 'rodny', assignee: { userId: 'melissa' }, viewers: [] };
    assert.deepEqual(
        teamCompletionRecipients({ candidates: [persona('pm', true)], task: privada, completedById: 'melissa' }),
        []
    );
    // Pero sí a quien la reservó, si la sigue todo y no fue quien la cerró.
    assert.deepEqual(
        teamCompletionRecipients({ candidates: [persona('rodny', true)], task: privada, completedById: 'melissa' }),
        ['rodny']
    );
});

test('una persona de la lista de un privado sí recibe el aviso', () => {
    const privada = {
        id: 'tarea', isPrivate: true, creatorId: 'rodny',
        assignee: { userId: 'melissa' }, viewers: [{ userId: 'pm' }]
    };
    assert.deepEqual(
        teamCompletionRecipients({ candidates: [persona('pm', true)], task: privada, completedById: 'melissa' }),
        ['pm']
    );
});

test('nadie recibe el mismo aviso dos veces ni una fila sin persona rompe el reparto', () => {
    const destinatarios = teamCompletionRecipients({
        candidates: [persona('pm', true), persona('pm', true), null, { id: null }, persona('rodny', true)],
        task: tareaAbierta,
        completedById: 'melissa'
    });
    assert.deepEqual(destinatarios, ['pm', 'rodny']);
});

test('el texto dice quién terminó qué, y de qué cuenta si la hay', () => {
    assert.equal(
        teamCompletionMessage({ actorName: 'Melissa', taskTitle: 'Reel de agosto', clientName: 'Pablo Hoff' }),
        'Melissa terminó «Reel de agosto» · Pablo Hoff'
    );
    assert.equal(
        teamCompletionMessage({ actorName: 'Melissa', taskTitle: 'Reel de agosto' }),
        'Melissa terminó «Reel de agosto»'
    );
    // Nunca sale un hueco en blanco en la campana.
    assert.equal(teamCompletionMessage({}), 'Alguien del equipo terminó «un pendiente»');
});

// El push manda a la categoría `tasks`, que viene encendida; este aviso es de campana.
test('el tipo no entra en la categoría de push de las tareas', () => {
    assert.equal(TEAM_COMPLETION_NOTIFICATION_TYPE, 'TEAM_TASK_COMPLETED');
    assert.equal(TEAM_COMPLETION_NOTIFICATION_TYPE.startsWith('TASK_'), false);
});
