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

test('el panel de la tarea pone el «+» junto al responsable y no deja añadir sin responsable', () => {
    const picker = readFileSync(new URL('../src/components/tasks/TaskCollaboratorsPicker.jsx', import.meta.url), 'utf8');
    const panel = readFileSync(new URL('../src/components/modules/TaskSidePanel.jsx', import.meta.url), 'utf8');
    assert.match(panel, /<TaskCollaboratorsPicker/);
    assert.match(picker, /aria-label="Añadir co-responsables"/);
    assert.match(picker, /Elige primero el responsable/);
    assert.match(picker, /role="menuitemcheckbox"/);
    assert.match(picker, /aria-checked/);
    assert.match(picker, /brain-popover-surface/);
    assert.match(picker, /Escape/);
    assert.doesNotMatch(picker, /<select|type="checkbox"/, 'selección múltiple con control propio, nunca un select simple');
});
