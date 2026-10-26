import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyTeamCompletion } from '../src/services/teamCompletionNoticeService.js';

// El reparto real del aviso «X terminó Y» (26 de octubre de 2026).

const tarea = {
    id: 'tarea-1',
    title: 'Reel de agosto',
    isPrivate: false,
    creatorId: 'rodny',
    assignee: { userId: 'melissa' },
    viewers: [],
    collaborators: [],
    client: { name: 'Pablo Hoff' }
};

const dobles = ({ task = tarea, users = [], actor = { name: 'Melissa' }, falla = false } = {}) => {
    const enviados = [];
    const db = {
        task: { findUnique: async () => { if (falla) throw new Error('base caída'); return task; } },
        user: {
            findMany: async () => users,
            findUnique: async () => actor
        }
    };
    const notifier = async (payload) => { enviados.push(payload); return payload; };
    return { db, notifier, enviados };
};

const quiere = (id) => ({ id, notificationPreferences: { teamCompletions: true } });
const noQuiere = (id) => ({ id, notificationPreferences: { teamCompletions: false } });

test('avisa a quien encendió el interruptor, con quién terminó qué y de qué cuenta', async () => {
    const { db, notifier, enviados } = dobles({ users: [quiere('pm'), noQuiere('otra')] });

    const destinatarios = await notifyTeamCompletion(
        { taskId: 'tarea-1', completedById: 'melissa' },
        { db, notifier }
    );

    assert.deepEqual(destinatarios, ['pm']);
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].userId, 'pm');
    assert.equal(enviados[0].message, 'Melissa terminó «Reel de agosto» · Pablo Hoff');
    assert.equal(enviados[0].type, 'TEAM_TASK_COMPLETED');
    assert.equal(enviados[0].taskId, 'tarea-1', 'el aviso abre la tarea');
});

test('a un seguidor no se le repite el aviso que ya recibió', async () => {
    const { db, notifier, enviados } = dobles({ users: [quiere('pm')] });

    const destinatarios = await notifyTeamCompletion(
        { taskId: 'tarea-1', completedById: 'melissa', followerIds: ['pm'] },
        { db, notifier }
    );

    assert.deepEqual(destinatarios, []);
    assert.deepEqual(enviados, []);
});

test('un pendiente privado que no puede abrir no sale de la plataforma', async () => {
    const privada = { ...tarea, isPrivate: true, creatorId: 'rodny', viewers: [] };
    const { db, notifier, enviados } = dobles({ task: privada, users: [quiere('pm')] });

    await notifyTeamCompletion({ taskId: 'tarea-1', completedById: 'melissa' }, { db, notifier });

    assert.deepEqual(enviados, [], 'ni el título, porque el clic daría 403');
});

// Un aviso que no sale no puede deshacer un pendiente que sí se terminó.
test('si la base falla no se rompe el cierre de la tarea', async () => {
    const { db, notifier, enviados } = dobles({ users: [quiere('pm')], falla: true });

    const destinatarios = await notifyTeamCompletion(
        { taskId: 'tarea-1', completedById: 'melissa' },
        { db, notifier }
    );

    assert.deepEqual(destinatarios, []);
    assert.deepEqual(enviados, []);
});

test('una falla en un destinatario no frena a los demás', async () => {
    const { db } = dobles({ users: [quiere('pm'), quiere('rodny')] });
    const enviados = [];
    const notifier = async (payload) => {
        if (payload.userId === 'pm') throw new Error('se cayó');
        enviados.push(payload.userId);
    };

    const destinatarios = await notifyTeamCompletion(
        { taskId: 'tarea-1', completedById: 'melissa' },
        { db, notifier }
    );

    assert.deepEqual(destinatarios, ['pm', 'rodny']);
    assert.deepEqual(enviados, ['rodny']);
});

test('sin tarea no se inventa un aviso', async () => {
    const { db, notifier, enviados } = dobles({ task: null, users: [quiere('pm')] });
    assert.deepEqual(await notifyTeamCompletion({ taskId: 'tarea-1' }, { db, notifier }), []);
    assert.deepEqual(enviados, []);
});
