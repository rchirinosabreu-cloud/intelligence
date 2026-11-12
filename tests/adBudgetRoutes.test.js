import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createAdBudgetRouter } from '../src/routes/api/adBudgets.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const serve = async (service) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { userId: 'u1' }; next(); });
    app.use('/ad-budgets', createAdBudgetRouter({ service }));
    const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    const url = `http://127.0.0.1:${server.address().port}/ad-budgets`;
    return { url, close: () => new Promise((resolve) => server.close(resolve)) };
};

test('las rutas de Meta van antes de «/:id» y llegan a su servicio con la persona', async () => {
    const seen = [];
    const metaService = {
        overview: async () => ({ configured: true }),
        syncNow: async () => { seen.push('sync'); return { skipped: true }; },
        setIgnored: async (id, ignored, user) => { seen.push(['ignore', id, ignored, user.userId]); return { ok: true }; },
        suggestions: async (id) => ({ suggested: [id] }),
        assign: async (id, ids, user) => { seen.push(['assign', id, ids, user.userId]); return { ok: true }; }
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { userId: 'u1' }; next(); });
    app.use('/ad-budgets', createAdBudgetRouter({ service: { detail: async () => { throw new Error('no debía llegar aquí'); } }, metaService }));
    const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    const url = `http://127.0.0.1:${server.address().port}/ad-budgets`;
    try {
        assert.deepEqual(await (await fetch(`${url}/meta`)).json(), { configured: true });
        assert.equal((await fetch(`${url}/meta/sync`, { method: 'POST' })).status, 200);
        await fetch(`${url}/meta/campaigns/123/ignore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ignored: false }) });
        assert.deepEqual(await (await fetch(`${url}/b1/meta-suggestions`)).json(), { suggested: ['b1'] });
        await fetch(`${url}/b1/meta-campaigns`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignIds: ['1', '2'] }) });
        assert.deepEqual(seen, ['sync', ['ignore', '123', false, 'u1'], ['assign', 'b1', ['1', '2'], 'u1']]);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('el módulo entero pasa por su casilla', () => {
    assert.match(source('src/routes/index.js'), /router\.use\('\/ad-budgets', requireModulePermission\('pautas'\), createAdBudgetRouter\(\)\)/);
});

test('un error de validación responde su frase; uno inesperado, una frase genérica', async () => {
    const { url, close } = await serve({
        create: async () => { throw Object.assign(new Error('Escribe el presupuesto.'), { statusCode: 422 }); },
        detail: async () => { throw new Error('la base se cayó'); }
    });
    const logged = console.error;
    console.error = () => {};
    try {
        const rejected = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(rejected.status, 422);
        assert.deepEqual(await rejected.json(), { error: 'Escribe el presupuesto.' });
        const broken = await fetch(`${url}/x`);
        assert.equal(broken.status, 500);
        assert.doesNotMatch((await broken.json()).error, /base/);
    } finally {
        console.error = logged;
        await close();
    }
});

test('«options» no se confunde con una pauta y la lectura de gasto llega con quien la hizo', async () => {
    const calls = [];
    const { url, close } = await serve({
        options: async () => ({ clients: [], team: [] }),
        recordSpend: async (id, input, actor) => { calls.push({ id, input, actor }); return { ok: true }; }
    });
    try {
        assert.deepEqual(await (await fetch(`${url}/options`)).json(), { clients: [], team: [] });
        const saved = await fetch(`${url}/b1/spend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spent: 10 }) });
        assert.equal(saved.status, 201);
        assert.equal(calls[0].id, 'b1');
        assert.equal(calls[0].actor.userId, 'u1');
    } finally {
        await close();
    }
});
