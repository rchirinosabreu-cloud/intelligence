import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaAdBudgetClient } from '../src/services/metaAdBudgetClient.js';

// El cliente que lee presupuestos en Meta (12 de noviembre de 2026), contra un fetch de mentira. Solo lee: cambiar el
// presupuesto es del Administrador de anuncios de Meta (Rodny, 13 de noviembre de 2026).
const recorder = (responses) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: new URL(url), init });
        const body = responses.shift() ?? {};
        return { ok: !body.error, status: body.error ? 400 : 200, json: async () => body };
    };
    return { calls, client: createMetaAdBudgetClient({ fetchImpl, origin: 'https://graph.test', version: 'v25.0' }) };
};

test('la llave va en la cabecera, y si la campaña no tiene presupuesto se leen sus conjuntos', async () => {
    const { calls, client } = recorder([
        { name: 'Con presupuesto', daily_budget: '3000', lifetime_budget: '0', effective_status: 'ACTIVE' },
        { name: 'Sin presupuesto', daily_budget: '0', lifetime_budget: '0', effective_status: 'ACTIVE' },
        { data: [{ id: 'as-1', name: 'Conjunto', daily_budget: '1000', campaign_id: '2' }] }
    ]);
    const rows = await client.readCampaignBudgets({ campaignIds: ['1', '2'], token: 'secreta' });
    assert.deepEqual(rows.map((row) => [row.campaignId, row.level, row.raw.id]), [['1', 'CAMPAIGN', '1'], ['2', 'ADSET', 'as-1']]);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer secreta');
    assert.equal(calls.every((call) => call.init.method === 'GET'), true, 'nunca escribe en Meta');
    assert.equal(calls.some((call) => call.url.toString().includes('secreta')), false, 'nunca en la dirección');
    assert.equal(calls[2].url.pathname, '/v25.0/2/adsets');
});

test('la plataforma no tiene forma de cambiar un presupuesto en Meta', () => {
    const { client } = recorder([]);
    assert.deepEqual(Object.keys(client), ['readCampaignBudgets']);
});

test('una campaña que falla vuelve con su error y no frena a las demás', async () => {
    const { client } = recorder([
        { error: { message: 'Unsupported get request', code: 100 } },
        { name: 'Bien', daily_budget: '3000', lifetime_budget: '0', effective_status: 'ACTIVE' }
    ]);
    const rows = await client.readCampaignBudgets({ campaignIds: ['1', '2'], token: 't' });
    assert.equal(rows[0].error.code, 100);
    assert.equal(rows[1].raw.name, 'Bien');
});
