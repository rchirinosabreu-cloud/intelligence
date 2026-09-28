import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernedFetch } from '../src/services/aiEgress.js';
import { aiRequestContextMiddleware, currentAiContext, runWithAiContext } from '../src/lib/aiRequestContext.js';
import { buildUsageEvent, extractUsage, toCsv, USAGE_RETENTION_DAYS, createAiUsageLog } from '../src/services/aiUsageLog.js';

// Registro central de uso de IA (27 de septiembre de 2026): quién, desde qué módulo, con qué
// proveedor y modelo, para qué cliente y con qué resultado. Nunca el contenido enviado.

const OPENAI = 'https://api.openai.com/v1/responses';
const allowAll = { assertEgress: async () => ({ allowed: true }) };
const recorder = () => {
    const events = [];
    return { events, record: async (event) => { events.push(event); } };
};
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

test('lee los tokens de las tres formas de respuesta de OpenAI', () => {
    assert.deepEqual(extractUsage({ usage: { input_tokens: 120, output_tokens: 30 } }), { inputTokens: 120, outputTokens: 30 });
    assert.deepEqual(extractUsage({ usage: { prompt_tokens: 50, completion_tokens: 7 } }), { inputTokens: 50, outputTokens: 7 });
    assert.deepEqual(extractUsage({ usage: { prompt_tokens: 9, total_tokens: 9 } }), { inputTokens: 9, outputTokens: null });
    assert.deepEqual(extractUsage({}), { inputTokens: null, outputTokens: null });
    assert.deepEqual(extractUsage(null), { inputTokens: null, outputTokens: null });
});

test('el evento toma la persona y el módulo de la petición, y el caso de uso gobernado manda', () => {
    const base = { provider: 'openai', model: 'gpt-5.6-luna', target: new URL(OPENAI), outcome: 'ALLOWED' };
    const fromRequest = buildUsageEvent({ ...base, context: { actorId: 'u1', module: 'reports', route: 'POST /api/reports/:id/generate-narrative' } });
    assert.equal(fromRequest.actorId, 'u1');
    assert.equal(fromRequest.flow, 'reports');
    assert.equal(fromRequest.route, 'POST /api/reports/:id/generate-narrative');
    assert.equal(fromRequest.endpoint, '/v1/responses');

    const governed = buildUsageEvent({ ...base, context: { actorId: 'u1', module: 'content' }, governanceContext: { clientId: 'c9', useCase: 'parrillas.review' } });
    assert.equal(governed.flow, 'parrillas.review');
    assert.equal(governed.clientId, 'c9');

    const automatic = buildUsageEvent({ ...base, context: null });
    assert.equal(automatic.actorId, null);
    assert.equal(automatic.flow, 'automatico');
});

test('una llamada permitida queda registrada con estado, duración y tokens, sin contenido', async () => {
    const log = recorder();
    const fetchImpl = async () => jsonResponse({ output: 'secreto del cliente', usage: { input_tokens: 800, output_tokens: 90 } });
    const governed = createGovernedFetch({ fetchImpl, governance: allowAll, usageLog: log });

    const response = await runWithAiContext({ actorId: 'u-rodny', module: 'minutes', route: 'POST /api/minutes/:id/analyze' }, () => governed(OPENAI, {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-5.6-terra', input: 'Acta confidencial de la reunión con el cliente' })
    }));
    assert.equal((await response.json()).output, 'secreto del cliente', 'quien llamó sigue leyendo la respuesta');
    await settle();

    assert.equal(log.events.length, 1);
    const [event] = log.events;
    assert.equal(event.outcome, 'ALLOWED');
    assert.equal(event.statusCode, 200);
    assert.equal(event.provider, 'openai');
    assert.equal(event.model, 'gpt-5.6-terra');
    assert.equal(event.actorId, 'u-rodny');
    assert.equal(event.flow, 'minutes');
    assert.equal(event.inputTokens, 800);
    assert.equal(event.outputTokens, 90);
    assert.ok(Number.isInteger(event.durationMs) && event.durationMs >= 0);
    const serialized = JSON.stringify(event);
    assert.doesNotMatch(serialized, /Acta confidencial|secreto del cliente/, 'nunca el contenido');
});

test('una llamada bloqueada por el gobierno de IA se registra y el bloqueo se mantiene', async () => {
    const log = recorder();
    const blocked = Object.assign(new Error('Sin autorización'), { status: 403, code: 'AI_AUTHORIZATION_REQUIRED' });
    const governed = createGovernedFetch({ fetchImpl: async () => jsonResponse({}), governance: { assertEgress: async () => { throw blocked; } }, usageLog: log });

    await assert.rejects(governed(OPENAI, { method: 'POST', body: JSON.stringify({ model: 'gpt-5.6-luna' }), governanceContext: { clientId: 'c1', useCase: 'parrillas.review' } }), blocked);
    await settle();
    assert.equal(log.events[0].outcome, 'BLOCKED');
    assert.equal(log.events[0].errorCode, 'AI_AUTHORIZATION_REQUIRED');
    assert.equal(log.events[0].clientId, 'c1');
});

test('un fallo de red o del proveedor también queda registrado', async () => {
    const log = recorder();
    const down = createGovernedFetch({ fetchImpl: async () => { throw new Error('ECONNRESET'); }, governance: allowAll, usageLog: log });
    await assert.rejects(down(OPENAI, { method: 'POST', body: JSON.stringify({ model: 'm' }) }), /ECONNRESET/);
    const rateLimited = createGovernedFetch({ fetchImpl: async () => jsonResponse({ error: {} }, 429), governance: allowAll, usageLog: log });
    await rateLimited(OPENAI, { method: 'POST', body: JSON.stringify({ model: 'm' }) });
    await settle();
    assert.deepEqual(log.events.map((e) => [e.outcome, e.statusCode]), [['ERROR', null], ['ERROR', 429]]);
});

test('si el registro falla, la llamada de IA no se entera', async () => {
    const governed = createGovernedFetch({
        fetchImpl: async () => jsonResponse({ ok: true }),
        governance: allowAll,
        usageLog: { record: async () => { throw new Error('base caída'); } }
    });
    const response = await governed(OPENAI, { method: 'POST', body: JSON.stringify({ model: 'm' }) });
    assert.equal(response.status, 200);
    await settle();
});

test('las respuestas en streaming no se leen para contar tokens', async () => {
    const log = recorder();
    let consumed = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {}\n\n')); controller.close(); } });
    const governed = createGovernedFetch({ fetchImpl: async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), governance: allowAll, usageLog: log });
    const response = await governed(OPENAI, { method: 'POST', body: JSON.stringify({ model: 'm', stream: true }) });
    consumed = (await response.text()).includes('data:');
    await settle();
    assert.equal(consumed, true, 'el streaming le llega entero a quien llamó');
    assert.equal(log.events[0].inputTokens, null);
});

test('el middleware deja la persona y la ruta normalizada disponibles en todo el trabajo asíncrono', async () => {
    const req = { method: 'POST', originalUrl: '/api/reports/8f14e45f-ceea-467f-a0e6-7c1a4b2f3d90/generate-narrative?x=1', user: { userId: 'u7' } };
    let seen;
    await new Promise((resolve) => aiRequestContextMiddleware(req, {}, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen = currentAiContext();
        resolve();
    }));
    assert.deepEqual(seen, { actorId: 'u7', module: 'reports', route: 'POST /api/reports/:id/generate-narrative' });
    assert.equal(currentAiContext(), null, 'fuera de la petición no hay contexto');
});

test('el CSV escapa comillas, comas y fórmulas', () => {
    const csv = toCsv([{ occurredAt: '2026-09-27T10:00:00.000Z', actorName: 'Ana, "la jefa"', flow: '=HYPERLINK("x")', provider: 'openai', model: 'm', clientName: null, outcome: 'ALLOWED', statusCode: 200, inputTokens: 1, outputTokens: 2, durationMs: 30 }]);
    const [header, row] = csv.trim().split('\n');
    assert.match(header, /^Fecha,Persona,Flujo,Proveedor,Modelo,Cliente,Resultado/);
    assert.match(row, /"Ana, ""la jefa"""/);
    assert.match(row, /"'=HYPERLINK\(""x""\)"/);
});

// Base en memoria con la forma mínima de pg para el servicio.
const fakePool = ({ admins = ['u-admin'] } = {}) => {
    const rows = [];
    const queries = [];
    return {
        rows, queries,
        query: async (sql, params = []) => {
            queries.push(sql);
            if (sql.includes('FROM "User" u JOIN "TeamMember"')) return { rows: admins.includes(params[0]) ? [{ id: params[0] }] : [] };
            if (sql.startsWith('INSERT INTO "AiUsageEvent"')) { rows.push(params); return { rows: [] }; }
            if (sql.startsWith('DELETE FROM "AiUsageEvent"')) return { rowCount: 0, rows: [] };
            return { rows: [] };
        }
    };
};

test('solo administradores activos consultan el registro, y se purga lo de más de un año', async () => {
    const pool = fakePool();
    const log = createAiUsageLog({ pool, clock: () => new Date('2026-09-27T12:00:00Z') });
    await log.record(buildUsageEvent({ provider: 'openai', model: 'm', target: new URL(OPENAI), outcome: 'ALLOWED', context: { actorId: 'u1', module: 'chat' } }));
    assert.equal(pool.rows.length, 1);
    assert.ok(pool.queries.some((sql) => sql.startsWith('DELETE FROM "AiUsageEvent"')), 'purga con retención');
    assert.equal(USAGE_RETENTION_DAYS, 365);

    await assert.rejects(log.list('u-editor', {}), (error) => error.status === 403);
    await log.list('u-admin', { days: 9999 });
    await log.summary('u-admin', { days: 30 });
});

test('las rutas de uso responden resumen, lista y CSV, y respetan el 403 del servicio', async () => {
    const { default: express } = await import('express');
    const { createAiGovernanceRouter } = await import('../src/routes/api/aiGovernance.js');
    const forbidden = Object.assign(new Error('Solo administradores activos pueden consultar el uso de IA.'), { status: 403, code: 'GOVERNANCE_FORBIDDEN' });
    const usageLog = {
        summary: async (userId) => { if (userId !== 'u-admin') throw forbidden; return { calls: 3 }; },
        list: async () => ({ items: [{ id: 'e1' }], hasMore: false, page: 1 }),
        exportCsv: async () => 'Fecha\n'
    };
    const app = express();
    app.use((req, res, next) => { req.user = { userId: req.headers['x-user'] }; next(); });
    app.use('/api/ai-governance', createAiGovernanceRouter({ service: {}, usageLog }));
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/ai-governance`;
    try {
        const ok = await fetch(`${base}/usage/summary?days=30`, { headers: { 'x-user': 'u-admin' } });
        assert.deepEqual(await ok.json(), { calls: 3 });
        const denied = await fetch(`${base}/usage/summary`, { headers: { 'x-user': 'u-editor' } });
        assert.equal(denied.status, 403);
        const list = await fetch(`${base}/usage`, { headers: { 'x-user': 'u-admin' } });
        assert.equal((await list.json()).items[0].id, 'e1');
        const csv = await fetch(`${base}/usage/export`, { headers: { 'x-user': 'u-admin' } });
        assert.match(csv.headers.get('content-type'), /text\/csv/);
        assert.match(csv.headers.get('content-disposition'), /uso-ia-\d{4}-\d{2}-\d{2}\.csv/);
    } finally {
        server.close();
    }
});
