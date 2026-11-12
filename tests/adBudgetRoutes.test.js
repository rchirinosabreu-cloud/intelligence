import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createAdBudgetRouter } from '../src/routes/api/adBudgets.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const EDITOR = { userId: 'u1', role: 'EDITOR', modulePermissions: { pautas: true, pautas_editar: true } };

const serve = async (service, user = EDITOR) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { ...user }; next(); });
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
    app.use((req, _res, next) => { req.user = { ...EDITOR }; next(); });
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

test('ver no es editar: sin «Editar pautas» se lee, pero nada se escribe; tampoco un administrador sin la casilla', async () => {
    const wrote = [];
    const service = {
        list: async () => ({ today: '2026-11-12', budgets: [] }),
        detail: async () => ({ ok: true }),
        create: async () => { wrote.push('create'); return {}; },
        recordSpend: async () => { wrote.push('spend'); return {}; }
    };
    const metaService = { overview: async () => ({ configured: true }), syncNow: async () => ({ skipped: true }), assign: async () => { wrote.push('assign'); return {}; } };
    const people = {
        viewer: { userId: 'v', role: 'EDITOR', modulePermissions: { pautas: true } },
        admin: { userId: 'a', role: 'ADMIN', modulePermissions: {} },
        editor: EDITOR,
        orphan: { userId: 'o', role: 'EDITOR', modulePermissions: { pautas_editar: true } }
    };
    for (const [who, user] of Object.entries(people)) {
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => { req.user = { ...user }; next(); });
        app.use('/ad-budgets', createAdBudgetRouter({ service, metaService }));
        const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
        const url = `http://127.0.0.1:${server.address().port}/ad-budgets`;
        try {
            const list = await (await fetch(url)).json();
            assert.equal(list.canEdit, who === 'editor', `${who}: canEdit`);
            assert.equal((await fetch(`${url}/b1`)).status, 200, `${who} lee el detalle`);
            assert.equal((await fetch(`${url}/meta/sync`, { method: 'POST' })).status, 200, `${who} puede pedir leer Meta`);
            const post = (path, method = 'POST') => fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const statuses = [(await post('')).status, (await post('/b1/spend')).status, (await post('/b1/meta-campaigns', 'PUT')).status];
            if (who === 'editor') assert.deepEqual(statuses, [201, 201, 200]);
            else {
                assert.deepEqual(statuses, [403, 403, 403], `${who} no escribe`);
                assert.match((await (await post('')).json()).error, /Editar pautas/);
            }
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    }
    assert.deepEqual(wrote, ['create', 'spend', 'assign'], 'solo el editor llegó a escribir');
});

test('toda ruta que escribe lleva el guardián de editar; las de leer no', () => {
    const text = source('src/routes/api/adBudgets.js');
    for (const line of text.split(/\r?\n/).filter((row) => /router\.(post|patch|put|delete)\(/.test(row))) {
        if (line.includes("'/meta/sync'")) assert.doesNotMatch(line, /, edit,/, 'leer Meta es de quien ve');
        else assert.match(line, /, edit, /, line.trim());
    }
    for (const line of text.split(/\r?\n/).filter((row) => /router\.get\(/.test(row))) assert.doesNotMatch(line, /, edit, /, line.trim());
});