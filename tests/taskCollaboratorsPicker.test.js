import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collaboratorCandidates, normalizeCollaboratorIds } from '../src/lib/taskCollaborators.js';

// Añadir co-responsables al crear o editar una tarea (Rodny, 5 de octubre de 2026: opción A, «cada
// quien su reloj, un solo responsable que cierra», y un «+» al lado del campo Responsable).

const equipo = [
    { id: 'm-rodny', name: 'Rodny Chirinos', role: 'Director' },
    { id: 'm-melissa', name: 'Melissa Ortega', role: 'Community Manager' },
    { id: 'm-bruno', name: 'Bruno Salas', role: 'Diseñador' },
    { id: 'm-angela', name: 'Ángela Pérez', role: 'Diseñadora' }
];

test('el responsable nunca aparece como co-responsable ni se repite nadie', () => {
    assert.deepEqual(normalizeCollaboratorIds(['m-bruno', 'm-rodny', 'm-bruno', '', null], 'm-rodny'), ['m-bruno']);
    // Si el responsable pasa a ser quien estaba de co-responsable, sale de la lista.
    assert.deepEqual(normalizeCollaboratorIds(['m-melissa', 'm-bruno'], 'm-melissa'), ['m-bruno']);
    assert.deepEqual(normalizeCollaboratorIds(undefined, 'm-rodny'), []);
});

test('la lista para elegir deja fuera al responsable y busca sin importar tildes ni mayúsculas', () => {
    assert.deepEqual(collaboratorCandidates(equipo, 'm-rodny').map((m) => m.id), ['m-melissa', 'm-bruno', 'm-angela']);
    assert.deepEqual(collaboratorCandidates(equipo, 'm-rodny', 'angela').map((m) => m.id), ['m-angela']);
    assert.deepEqual(collaboratorCandidates(equipo, 'm-rodny', 'DISEÑ').map((m) => m.id), ['m-bruno', 'm-angela']);
    assert.deepEqual(collaboratorCandidates(null, 'm-rodny'), []);
});

test('un colaborador mueve la tarea entre Pendiente y En proceso, y nada más', async () => {
    const { collaboratorMoveProblem } = await import('../src/lib/taskCollaborators.js');
    assert.equal(collaboratorMoveProblem({ currentStatus: 'PENDIENTE', payload: { status: 'EN_CURSO' } }), null);
    assert.equal(collaboratorMoveProblem({ currentStatus: 'EN_CURSO', payload: { status: 'PENDIENTE' } }), null);
    assert.match(collaboratorMoveProblem({ currentStatus: 'EN_CURSO', payload: { status: 'REALIZADA' } }), /responsable/);
    assert.ok(collaboratorMoveProblem({ currentStatus: 'DEVUELTA', payload: { status: 'PENDIENTE' } }), 'reintegrar es del responsable');
    assert.ok(collaboratorMoveProblem({ currentStatus: 'REALIZADA', payload: { status: 'PENDIENTE' } }), 'reabrir es del responsable');
    assert.ok(collaboratorMoveProblem({ currentStatus: 'PENDIENTE', payload: { status: 'EN_CURSO', title: 'Otro título' } }), 'solo el estado');
    assert.ok(collaboratorMoveProblem({ currentStatus: 'PENDIENTE', payload: {} }));
});

test('al pasar a En proceso una tarea con equipo: aviso con dos botones, sin abrirla ni arrancar relojes', () => {
    const notice = readFileSync(new URL('../src/components/tasks/TeamTaskStartNotice.jsx', import.meta.url), 'utf8');
    const board = readFileSync(new URL('../src/components/modules/NativeTasks.jsx', import.meta.url), 'utf8');
    // Texto de Rodny, 5 de octubre de 2026.
    assert.match(notice, /En este tipo de tareas, el cronómetro no se activa de forma automática, recuerda poner en marcha tu reloj de forma manual\./);
    assert.match(notice, />\s*Abrir tarea\s*</);
    assert.match(notice, /Empezar mi reloj/);
    assert.match(notice, /\/work\/start/);
    // El éxito se anuncia después de la respuesta del servidor.
    assert.ok(notice.indexOf('await fetch') < notice.indexOf("toast.success"));
    // En el tablero: sin reloj optimista para tareas con equipo y el aviso solo tras confirmar el servidor.
    assert.match(board, /newStatusEnum === 'EN_CURSO' && sourceColumnId !== 'en-proceso' && !isTeamTask/);
    assert.ok(board.indexOf('setTeamStartTask(movedTask)') > board.indexOf('throw Object.assign(new Error("Failed to update status in backend")'));
});

test('el filtro por persona del tablero incluye las tareas donde colabora', async () => {
    const { isTaskOfPerson, workingMemberIds } = await import('../src/lib/taskCollaborators.js');
    const tarea = {
        assigneeName: 'Rodny Chirinos',
        collaborators: [{ id: 'm-melissa', name: 'Melissa Ortega' }],
        openSessions: [{ workerId: 'm-melissa' }, { workerId: 'm-rodny' }, { workerId: 'm-melissa' }]
    };
    assert.equal(isTaskOfPerson(tarea, 'Melissa Ortega'), true);
    assert.equal(isTaskOfPerson(tarea, 'Rodny Chirinos'), true);
    assert.equal(isTaskOfPerson(tarea, 'Bruno Salas'), false);
    assert.equal(isTaskOfPerson(tarea, 'Todos'), true);
    assert.equal(isTaskOfPerson({ assigneeName: null }, 'Desconocido'), true);
    assert.deepEqual(workingMemberIds(tarea), ['m-melissa', 'm-rodny']);
});

test('el panel de la tarea pone el «+» junto al responsable y no deja añadir sin responsable', () => {
    const picker = readFileSync(new URL('../src/components/tasks/TaskCollaboratorsPicker.jsx', import.meta.url), 'utf8');
    const panel = readFileSync(new URL('../src/components/modules/TaskSidePanel.jsx', import.meta.url), 'utf8');
    assert.match(panel, /<TaskCollaboratorsPicker/);
    assert.match(picker, /aria-label="Añadir colaboradores"/);
    // Texto de Rodny, 5 de octubre de 2026.
    assert.match(picker, /Cada colaborador registra su tiempo por separado\. Solo el responsable cierra la tarea\./);
    assert.match(picker, /Elige primero el responsable/);
    assert.match(picker, /role="menuitemcheckbox"/);
    assert.match(picker, /aria-checked/);
    assert.match(picker, /brain-popover-surface/);
    assert.match(picker, /Escape/);
    assert.doesNotMatch(picker, /<select|type="checkbox"/, 'selección múltiple con control propio, nunca un select simple');
});
