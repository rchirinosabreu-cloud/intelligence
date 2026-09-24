import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TASK_PRIVATE_FORBIDDEN, requireTaskAccess } from '../src/middlewares/taskPrivacyMiddleware.js';

// La cerradura de un pendiente privado vive en el servidor (Rodny, 23 de septiembre de
// 2026). El tablero ya no recibe su contenido, pero los comentarios, los adjuntos y la
// propia tarea tienen rutas propias: sin esto, cualquiera del equipo con el id de la
// tarea —que está a la vista en la tarjeta— los pide y los recibe en texto plano.

const privateTask = {
    id: 't2',
    isPrivate: true,
    creatorId: 'u-jefe',
    assignee: { userId: 'u-maria' },
    viewers: [{ userId: 'u-elisa' }]
};

const run = async (task, user, params = { taskId: 't2' }) => {
    const prismaClient = { task: { findUnique: async () => task } };
    let nextCalled = false;
    let payload = null;
    let statusCode = 200;
    const res = {
        status(code) { statusCode = code; return this; },
        json(body) { payload = body; return this; }
    };
    await requireTaskAccess({ prismaClient })({ params, user }, res, () => { nextCalled = true; });
    return { nextCalled, statusCode, payload };
};

test('una tarea que no es privada deja pasar a cualquiera', async () => {
    const { nextCalled } = await run({ id: 't1', isPrivate: false }, { userId: 'u-otro' });
    assert.equal(nextCalled, true);
});

test('pasan quien la creó, quien la ejecuta y las personas elegidas', async () => {
    for (const userId of ['u-jefe', 'u-maria', 'u-elisa']) {
        const { nextCalled } = await run(privateTask, { userId });
        assert.equal(nextCalled, true, `${userId} tendría que poder abrirla`);
    }
});

// Esto es lo que antes devolvía los comentarios en texto plano a quien pegara la
// dirección en el navegador.
test('a quien no puede abrirla se le responde 403 y no se ejecuta la ruta', async () => {
    const { nextCalled, statusCode, payload } = await run(privateTask, { userId: 'u-otro' });

    assert.equal(nextCalled, false, 'la ruta no puede llegar a ejecutarse');
    assert.equal(statusCode, 403);
    assert.equal(payload.error, 'TASK_PRIVATE');
    assert.equal(payload.message, TASK_PRIVATE_FORBIDDEN);
});

test('ningún rol entra por su cargo, tampoco aquí', async () => {
    const { statusCode } = await run(privateTask, { userId: 'u-admin', role: 'ADMIN' });
    assert.equal(statusCode, 403);
});

test('sin sesión tampoco se abre', async () => {
    assert.equal((await run(privateTask, null)).statusCode, 403);
    assert.equal((await run(privateTask, {})).statusCode, 403);
});

// El identificador llega como `taskId` en unas rutas y como `id` en otras.
test('funciona con los dos nombres del parámetro', async () => {
    assert.equal((await run(privateTask, { userId: 'u-otro' }, { id: 't2' })).statusCode, 403);
    assert.equal((await run(privateTask, { userId: 'u-maria' }, { id: 't2' })).nextCalled, true);
});

// Cada controlador responde su propio 404; contestarlo aquí cambiaría respuestas que la
// pantalla ya espera.
test('una tarea que no existe se deja pasar para que el controlador conteste', async () => {
    const { nextCalled } = await run(null, { userId: 'u-otro' });
    assert.equal(nextCalled, true);
});

// Ante la duda no se abre: un fallo de lectura no puede convertirse en un permiso.
test('si la base de datos falla no se deja pasar', async () => {
    const prismaClient = { task: { findUnique: async () => { throw new Error('sin conexión'); } } };
    let nextCalled = false;
    let statusCode = 200;
    const res = { status(code) { statusCode = code; return this; }, json() { return this; } };
    await requireTaskAccess({ prismaClient })({ params: { taskId: 't2' }, user: { userId: 'u-otro' } }, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 500);
});

// Rodny, 24 de septiembre de 2026: crear un privado es de admin y project manager;
// cambiar su privacidad, solo de quien lo creó. Las dos puertas están en el servidor,
// que es lo que manda: la pantalla esconde el control, pero eso es cortesía.
test('el servidor rechaza crear un privado a quien no dirige, y cambiarlo a quien no lo creó', () => {
    const controller = readFileSync(new URL('../src/controllers/taskController.js', import.meta.url), 'utf8');

    assert.match(
        controller,
        /taskData\.isPrivate && !canCreatePrivateTask\(req\.user\)/,
        'crear un pendiente privado tiene que comprobar el rol'
    );
    assert.match(
        controller,
        /\('isPrivate' in req\.body \|\| 'viewerIds' in req\.body\) && !canChangeTaskPrivacy\(task, req\.user\)/,
        'cambiar la privacidad tiene que comprobar que quien pide es quien la creó'
    );

    // Y los campos tienen que estar permitidos, o el cambio se caería en silencio.
    const security = readFileSync(new URL('../src/config/security.js', import.meta.url), 'utf8');
    assert.match(security, /'isPrivate',/);
    assert.match(security, /'viewerIds',/);
});

// Contrato: toda ruta que enseñe o cambie lo que hay dentro de una tarea pasa por el
// guardián. Si mañana se añade otra y se olvida, esta prueba lo dice.
test('todas las rutas del contenido de una tarea llevan el guardián', () => {
    const routes = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
    const guarded = [
        "get('/tasks/:taskId/comments'",
        "post('/tasks/:taskId/comments'",
        "get('/tasks/:taskId/comments/:commentId/file'",
        "get('/tasks/:taskId/comments/:commentId/download'",
        "patch('/tasks/:taskId/comments/:commentId'",
        "delete('/tasks/:taskId/comments/:commentId'",
        "post('/tasks/:taskId/comments/:commentId/reactions'",
        "get('/tasks/:taskId/attachments/:attachmentId/file'",
        "get('/tasks/:taskId/attachments/:attachmentId/download'",
        "get('/tasks/:taskId/work-history'",
        "patch('/tasks/:taskId'",
        "delete('/tasks/:taskId'"
    ];

    // El alias tiene que salir del middleware de verdad, no de cualquier función que
    // alguien llame igual.
    assert.match(routes, /const guardTask = requireTaskAccess\(\)/);
    assert.match(routes, /from '\.\.\/middlewares\/taskPrivacyMiddleware\.js'/);

    for (const route of guarded) {
        const line = routes.split('\n').find((candidate) => candidate.includes(route));
        assert.ok(line, `la ruta ${route} tendría que existir`);
        assert.match(line, /guardTask/, `${route} enseña o cambia el contenido de una tarea y no pasa por el guardián`);
    }
});
