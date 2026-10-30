import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createExternalPlansRouter } from '../src/routes/api/externalPlans.js';
import { parseMonthSlug } from '../src/services/externalPlanService.js';

// El espejo de las parrillas de MIO en Parrillas: la lista, un mes (por «noviembre-2026») y «Leer ahora». Un error interno
// nunca se muestra tal cual.

const withServer = async (router, run) => {
    const app = express();
    app.use(express.json());
    app.use('/x', router);
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try { await run(`http://127.0.0.1:${server.address().port}/x`); } finally { server.close(); }
};

test('el mes llega por su nombre y año', () => {
    assert.deepEqual(parseMonthSlug('noviembre-2026'), { year: 2026, month: 11 });
    assert.deepEqual(parseMonthSlug('Enero-2027'), { year: 2027, month: 1 });
    assert.equal(parseMonthSlug('nov-2026'), null);
    assert.equal(parseMonthSlug('noviembre'), null);
});

test('la lista, un mes y «Leer ahora»', async () => {
    const calls = [];
    const router = createExternalPlansRouter({
        list: async () => [{ client: { slug: 'villa' } }],
        getMonth: async (_db, args) => { calls.push(['get', args]); return args.slug === 'villa' ? { pieces: [] } : null; },
        refresh: async (_db, slug) => { calls.push(['refresh', slug]); return slug === 'villa' ? [{ ok: true }, { ok: false, problem: 'La hoja no tiene una pestaña de diciembre.' }] : null; }
    });
    await withServer(router, async (base) => {
        assert.deepEqual(await (await fetch(base)).json(), [{ client: { slug: 'villa' } }]);
        assert.equal((await fetch(`${base}/villa/noviembre-2026`)).status, 200);
        assert.equal((await fetch(`${base}/otro/noviembre-2026`)).status, 404);
        assert.equal((await fetch(`${base}/villa/novembre-2026`)).status, 400);
        const refreshed = await (await fetch(`${base}/villa/refresh`, { method: 'POST' })).json();
        assert.deepEqual(refreshed, { ok: false, problem: 'La hoja no tiene una pestaña de diciembre.' });
        assert.equal((await fetch(`${base}/otro/refresh`, { method: 'POST' })).status, 404);
    });
    assert.deepEqual(calls[0], ['get', { slug: 'villa', year: 2026, month: 11 }]);
});

test('cambiar el estado y responder: la identidad sale de la sesión y el motivo de un rechazo se dice', async () => {
    const calls = [];
    const router = createExternalPlansRouter({
        updateStatus: async (_db, args) => {
            calls.push(['status', args]);
            if (args.status === 'MOVIDA') throw Object.assign(new Error('La hoja cambió: la fila 3 ya no es Post 1.'), { status: 409, code: 'ROW_MOVED' });
            return { ok: true };
        },
        reply: async (_db, args) => { calls.push(['reply', args]); return { ok: true }; }
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { userId: 'u-kami' }; next(); });
    app.use('/x', router);
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/x`;
    const send = (method, path, body) => fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
        assert.equal((await send('PATCH', '/villa/noviembre-2026/pieces/3/status', { status: 'APROBADO', expected: 'EN REVISIÓN', userId: 'otro' })).status, 200);
        const moved = await send('PATCH', '/villa/noviembre-2026/pieces/3/status', { status: 'MOVIDA' });
        assert.equal(moved.status, 409);
        assert.match((await moved.json()).error, /ya no es Post 1/);
        assert.equal((await send('POST', '/villa/noviembre-2026/comments/g1/replies', { content: 'Hola', resolve: 'true' })).status, 200);
    } finally {
        server.close();
    }
    assert.deepEqual(calls[0], ['status', { slug: 'villa', year: 2026, month: 11, row: 3, status: 'APROBADO', expected: 'EN REVISIÓN', userId: 'u-kami' }], 'quien cambia lo dice la sesión, nunca el cuerpo');
    assert.equal(calls[2][1].resolve, false, 'solo un true de verdad marca resuelto');
});

test('un fallo interno no se muestra', async () => {
    const boom = async () => { throw new Error('postgres://secreto'); };
    const router = createExternalPlansRouter({ list: boom, getMonth: boom, refresh: boom });
    const original = console.error;
    console.error = () => {};
    try {
        await withServer(router, async (base) => {
            const response = await fetch(base);
            assert.equal(response.status, 500);
            assert.doesNotMatch(await response.text(), /secreto/);
        });
    } finally {
        console.error = original;
    }
});
