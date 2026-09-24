import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PRIVATE_TASK_HINT,
    canChangeTaskPrivacy,
    canCreatePrivateTask,
    canOpenTask,
    nextPrivateAttempt,
    redactTaskBody,
    taskPrivacyFilter
} from '../src/lib/taskPrivacy.js';

// Pendientes privados (Rodny, 23 de septiembre de 2026): privado significa **que no se
// puede abrir**, no que no se pueda ver. El título, el responsable, el cliente y el
// estado los ve todo el equipo —así nadie parece desocupado y la carga del tablero
// sigue diciendo la verdad—; la descripción, los adjuntos y la conversación solo los
// abren quien la creó, quien la ejecuta y las personas elegidas.

const publicTask = { id: 't1', title: 'Parrilla de octubre', isPrivate: false, creatorId: 'u-jefe', assignee: { userId: 'u-maria' } };
const privateTask = {
    id: 't2',
    title: 'Revisión de salario de Marcela',
    comments: 'Confidencial: propuesta de ajuste',
    isPrivate: true,
    creatorId: 'u-jefe',
    clientId: 'c1',
    client: { name: 'Titanes' },
    assigneeId: 'm-maria',
    assignee: { id: 'm-maria', userId: 'u-maria', name: 'María' },
    viewers: [{ userId: 'u-elisa' }],
    status: 'EN_CURSO',
    dueDate: '2026-10-01T12:00:00.000Z',
    priority: 'ALTA',
    aiCategory: 'Estratégico',
    referenceUrl: 'https://drive.example/nomina',
    taskAttachments: [{ id: 'a1', name: 'nomina.pdf' }],
    taskComments: [{ id: 'c1', content: 'Le subimos un 12%' }]
};

test('una tarea que no es privada la abre cualquiera', () => {
    assert.equal(canOpenTask(publicTask, 'u-quien-sea'), true);
    assert.equal(canOpenTask(publicTask, null), true);
});

test('la abren quien la creó, quien la ejecuta y las personas elegidas', () => {
    assert.equal(canOpenTask(privateTask, 'u-jefe'), true);
    assert.equal(canOpenTask(privateTask, 'u-maria'), true);
    assert.equal(canOpenTask(privateTask, 'u-elisa'), true);
});

test('ningún rol entra por su cargo, ni siquiera un administrador', () => {
    assert.equal(canOpenTask(privateTask, 'u-otro'), false);
    assert.equal(canOpenTask({ ...privateTask, viewers: [] }, 'u-elisa'), false);
    assert.equal(canOpenTask(privateTask, null), false);
});

// Comparar un id de `TeamMember` con uno de `User` es un error que este proyecto ya
// cometió en otra parte; aquí queda cerrado con una prueba.
test('la identidad que manda es la del usuario, no la del miembro de equipo', () => {
    assert.equal(canOpenTask(privateTask, 'm-maria'), false);
});

// Lo que sostiene el tablero y la carga de trabajo sigue a la vista: si el título
// desapareciera, la persona parecería desocupada.
test('sin poder abrirla se sigue viendo de quién es y en qué estado está', () => {
    const visible = redactTaskBody(privateTask);

    assert.equal(visible.title, 'Revisión de salario de Marcela');
    assert.equal(visible.status, 'EN_CURSO');
    assert.equal(visible.assignee.name, 'María');
    assert.equal(visible.client.name, 'Titanes');
    assert.equal(visible.dueDate, '2026-10-01T12:00:00.000Z');
    assert.equal(visible.priority, 'ALTA');
    // Y la pantalla sabe que no puede abrirla, con el motivo escrito para la persona.
    assert.equal(visible.isLocked, true);
    assert.equal(visible.privateHint, PRIVATE_TASK_HINT);
});

test('lo que hay dentro no sale en la respuesta', () => {
    const visible = redactTaskBody(privateTask);

    for (const field of ['comments', 'taskComments', 'taskAttachments', 'referenceUrl', 'aiCategory', 'viewers']) {
        assert.equal(visible[field], undefined, `una tarea que no se puede abrir no puede llevar «${field}»`);
    }
    // Ni escondido en el JSON, que es lo que viaja por la red.
    const serialized = JSON.stringify(visible);
    assert.doesNotMatch(serialized, /Confidencial/);
    assert.doesNotMatch(serialized, /12%/);
    assert.doesNotMatch(serialized, /nomina\.pdf/);
    assert.doesNotMatch(serialized, /drive\.example/);
});

test('quien sí puede abrirla recibe la tarea intacta', () => {
    const [same] = [privateTask].map(taskPrivacyFilter('u-maria'));
    assert.equal(same, privateTask);
    assert.equal(same.comments, 'Confidencial: propuesta de ajuste');
});

test('el filtro de una lista solo recorta lo que hace falta', () => {
    const [publica, privada] = [publicTask, privateTask].map(taskPrivacyFilter('u-otro'));

    assert.equal(publica, publicTask, 'una tarea pública no se toca');
    assert.equal(privada.title, 'Revisión de salario de Marcela');
    assert.equal(privada.comments, undefined);
    assert.equal(privada.isLocked, true);
});

test('una lista vacía no revienta', () => {
    assert.deepEqual([].map(taskPrivacyFilter('u-otro')), []);
});

// Rodny, 24 de septiembre de 2026: reservar trabajo del resto del equipo es una
// decisión de quien dirige, no de cualquiera.
test('solo administradores y project managers crean un pendiente privado', () => {
    assert.equal(canCreatePrivateTask({ role: 'ADMIN' }), true);
    assert.equal(canCreatePrivateTask({ role: 'PROJECT_MANAGER' }), true);
    assert.equal(canCreatePrivateTask({ role: 'admin' }), true, 'el rol no distingue mayúsculas');

    assert.equal(canCreatePrivateTask({ role: 'EDITOR' }), false);
    assert.equal(canCreatePrivateTask({ role: 'MEMBER' }), false);
    assert.equal(canCreatePrivateTask({}), false);
    assert.equal(canCreatePrivateTask(null), false);
});

// Ni otro admin, ni el responsable: abrir al equipo algo que otro reservó no le toca a
// nadie más.
test('solo quien lo creó puede cambiar su privacidad', () => {
    const task = { creatorId: 'u-jefe', assignee: { userId: 'u-maria' } };

    assert.equal(canChangeTaskPrivacy(task, { userId: 'u-jefe', role: 'ADMIN' }), true);
    assert.equal(canChangeTaskPrivacy(task, { userId: 'u-jefe', role: 'PROJECT_MANAGER' }), true);

    assert.equal(canChangeTaskPrivacy(task, { userId: 'u-otro-admin', role: 'ADMIN' }), false, 'otro admin no');
    assert.equal(canChangeTaskPrivacy(task, { userId: 'u-maria', role: 'EDITOR' }), false, 'el responsable no');
    // Y si quien la creó deja de dirigir, tampoco.
    assert.equal(canChangeTaskPrivacy(task, { userId: 'u-jefe', role: 'EDITOR' }), false);
    assert.equal(canChangeTaskPrivacy(task, null), false);
    assert.equal(canChangeTaskPrivacy(null, { userId: 'u-jefe', role: 'ADMIN' }), false);
});

// Poder cambiar la privacidad y poder abrirla son cosas distintas: quien la creó puede
// las dos, pero el responsable solo abre.
test('cambiar la privacidad no es lo mismo que poder abrirla', () => {
    const task = { isPrivate: true, creatorId: 'u-jefe', assignee: { userId: 'u-maria' }, viewers: [] };

    assert.equal(canOpenTask(task, 'u-maria'), true);
    assert.equal(canChangeTaskPrivacy(task, { userId: 'u-maria', role: 'ADMIN' }), false);
});

// Al primer toque la tarjeta vibra; al segundo sale el aviso. **Siempre al segundo**
// (Rodny, 23 de septiembre de 2026): sin ventana de tiempo, porque una espera haría
// que el mismo gesto diera resultados distintos sin que nadie sepa por qué.
test('el aviso sale siempre al segundo toque, sin depender del reloj', () => {
    const primero = nextPrivateAttempt();
    assert.equal(primero.reaction, 'shake');

    const segundo = nextPrivateAttempt(primero.attempts);
    assert.equal(segundo.reaction, 'explain');

    // Y vuelve a empezar: el siguiente toque vibra otra vez, no repite el cartel.
    assert.equal(nextPrivateAttempt(segundo.attempts).reaction, 'shake');
});

// El aviso nombra a las tres partes que sí pueden abrirlo: si se quedara en «el creador
// y el responsable», estaría mintiendo en cuanto alguien añada a una tercera persona a
// la lista. Y dice a quién acudir, que es lo único que quien lee esto puede hacer.
test('el aviso dice quién puede abrirlo, incluidos los demás elegidos, y a quién escribirle', () => {
    assert.match(PRIVATE_TASK_HINT, /creador/);
    assert.match(PRIVATE_TASK_HINT, /responsable/);
    assert.match(PRIVATE_TASK_HINT, /otros miembros del equipo/);
    assert.match(PRIVATE_TASK_HINT, /escríbele al creador de la tarea/);
});
