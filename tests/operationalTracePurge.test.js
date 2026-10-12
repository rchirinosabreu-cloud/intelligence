import test from 'node:test';
import assert from 'node:assert/strict';
import { recordOperationalTrace, TRACE_RETENTION_DAYS } from '../src/services/operationalTraceService.js';
import { AUDIT_PURGE_SQL } from '../src/lib/auditImmutability.js';

// La base rechaza borrar la traza operativa salvo en una transacción marcada como purga (AGENTS.md §21).
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const now = new Date('2026-10-12T15:00:00Z');

test('dentro de la transacción de otro no se purga, y la ventana diaria no se gasta', async () => {
    const calls = [];
    const tx = { operationalTraceEvent: { create: async ({ data }) => data, deleteMany: async () => calls.push('deleteMany') } };
    await recordOperationalTrace({ eventType: 'TASK_OPENED', actorId: 'u1', occurredAt: now, db: tx });
    await settle();
    assert.deepEqual(calls, [], 'la marca quedaría puesta hasta el final de una transacción ajena');
});

test('la purga diaria corre en su propia transacción, marcada antes de borrar lo vencido', async () => {
    const calls = [];
    const tx = {
        $executeRawUnsafe: async (sql) => calls.push(sql),
        operationalTraceEvent: { deleteMany: async ({ where }) => { calls.push(where.occurredAt.lt.toISOString()); return { count: 3 }; } }
    };
    const db = {
        $transaction: async (fn) => fn(tx),
        operationalTraceEvent: { create: async ({ data }) => data, deleteMany: async () => calls.push('fuera de la transacción') }
    };
    await recordOperationalTrace({ eventType: 'TASK_OPENED', actorId: 'u1', occurredAt: now, db });
    await settle();
    const cutoff = new Date(now.getTime() - TRACE_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
    assert.deepEqual(calls, [AUDIT_PURGE_SQL, cutoff]);
});
