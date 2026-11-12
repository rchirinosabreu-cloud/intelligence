import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaAdBudgetClient } from '../src/services/metaAdBudgetClient.js';

// El cliente que lee y cambia presupuestos en Meta (12 de noviembre de 2026), contra un fetch de mentira.
const recorder = (responses) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: new URL(url), init });
        const body = responses.shift() ?? { success: true };
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
    assert.equal(calls.some((call) => call.url.toString().includes('secreta')), false, 'nunca en la dirección');
    assert.equal(calls[2].url.pathname, '/v25.0/2/adsets');
});

test('cambiar manda solo el campo del presupuesto; validar agrega validate_only', async () => {
    const { calls, client } = recorder([]);
    await client.setBudget({ objectId: '1', field: 'daily_budget', minor: 4000, token: 't' });
    await client.setBudget({ objectId: '1', field: 'daily_budget', minor: 4000, token: 't', validateOnly: true });
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.body, 'daily_budget=4000');
    assert.equal(new URLSearchParams(calls[1].init.body).get('execution_options'), '["validate_only"]');
    await assert.rejects(client.setBudget({ objectId: '1', field: 'status', minor: 0, token: 't' }), /Solo se cambia el presupuesto/);
});

test('un error de Meta llega con su código para decirlo en palabras', async () => {
    const { client } = recorder([{ error: { message: 'Permissions error', code: 200, error_user_msg: 'No tienes permiso' } }]);
    await assert.rejects(client.setBudget({ objectId: '1', field: 'daily_budget', minor: 1, token: 't' }), (error) => error.name === 'MetaGraphError' && error.code === 200 && error.userMessage === 'No tienes permiso');
});
