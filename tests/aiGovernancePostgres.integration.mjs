import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOpenAIClient } from '../src/services/openAIClient.js';
const clientId = `gov-client-${randomUUID()}`;
const url = process.env.TEST_DATABASE_URL;
if (url !== 'postgresql://governance_test@127.0.0.1:55449/governance_test') throw new Error('Use only the isolated governance_test database. Never load .env.');
const pool = new pg.Pool({ connectionString: url });
const { ensureAiGovernanceSchema } = await import('../scripts/ensure-ai-governance-schema.js').catch(() => ({}));
const { createGovernanceService } = await import('../src/services/aiGovernanceService.js').catch(() => ({}));
let service;
test.before(async () => {
  await pool.query('CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, name TEXT, "isActive" BOOLEAN, role TEXT)');
  await pool.query('CREATE TABLE IF NOT EXISTS "TeamMember" (id TEXT PRIMARY KEY, "userId" TEXT, "isActive" BOOLEAN)');
  await pool.query('CREATE TABLE IF NOT EXISTS "Client" (id TEXT PRIMARY KEY, name TEXT, "isArchived" BOOLEAN DEFAULT false)');
  await pool.query(`INSERT INTO "User" VALUES ('gov-admin','Prueba Admin',true,'ADMIN'), ('gov-editor','Prueba Editor',true,'EDITOR') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO "TeamMember" VALUES ('gov-team-a','gov-admin',true), ('gov-team-e','gov-editor',true) ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO "Client" VALUES ($1,'Empresa de prueba',false)`, [clientId]);
  if (ensureAiGovernanceSchema) { const c = await pool.connect(); try { await ensureAiGovernanceSchema(c); await ensureAiGovernanceSchema(c); } finally { c.release(); } }
  if (createGovernanceService) service = createGovernanceService({ pool });
});
test.after(() => pool.end());
const admin = 'gov-admin';
const systemInput = () => ({ name: 'Sistema de prueba', status: 'APPROVED', data: { provider: 'openai', model: 'model-test', purpose: 'Revisión de contenido', ownerId: admin, systemType: 'GENERATIVE', dataClasses: ['CONFIDENTIAL'], region: 'Solo prueba', retention: 'Solo prueba', training: 'Solo prueba', subprocessors: 'Solo prueba', evidenceRef: 'Expediente sintético' } });
test('solo administradores activos con pertenencia vigente acceden', async () => {
  assert.ok(service, 'falta implementar el servicio');
  await assert.rejects(service.list('gov-editor', 'systems'), e => e.status === 403);
  await assert.rejects(service.list('unknown', 'systems'), e => e.status === 403);
  await pool.query(`UPDATE "TeamMember" SET "isActive"=false WHERE id='gov-team-a'`);
  try { await assert.rejects(service.list(admin, 'systems'), e => e.status === 403); }
  finally { await pool.query(`UPDATE "TeamMember" SET "isActive"=true WHERE id='gov-team-a'`); }
});
test('crear conserva auditoría atómica y bloquea ediciones obsoletas', async () => {
  assert.ok(service, 'falta implementar el servicio');
  const record = await service.save(admin, 'systems', null, systemInput());
  assert.equal(record.version, 1);
  const results = await Promise.allSettled([1, 2].map(n => service.save(admin, 'systems', record.id, { ...systemInput(), name: `Edición ${n}`, status: 'SUSPENDED', expectedVersion: 1, reason: 'Cambio de condiciones' })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  const history = await service.history(admin, 'systems', record.id);
  assert.equal(history.length, 2);
  assert.equal(history[0].actorId, admin);
});
test('un error al auditar revierte el registro completo', async () => {
  assert.ok(service, 'falta implementar el servicio');
  await pool.query(`CREATE OR REPLACE FUNCTION fail_gov_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='force-audit-failure' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER governance_test_failure BEFORE INSERT ON "AiGovernanceEvent" FOR EACH ROW EXECUTE FUNCTION fail_gov_audit()');
  try {
    await assert.rejects(service.save(admin, 'systems', null, { ...systemInput(), name: 'Must rollback', reason: 'force-audit-failure' }));
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "AiGovernanceSystem" WHERE name='Must rollback'`)).rows[0].n, 0);
  } finally { await pool.query('DROP TRIGGER governance_test_failure ON "AiGovernanceEvent"'); }
});
test('control activado bloquea sin aprobación y revalida suspensión antes de la llamada', async () => {
  assert.ok(service, 'falta implementar el servicio');
  const system = await service.save(admin, 'systems', null, systemInput());
  const risk = await service.save(admin, 'risks', null, { name: 'Evaluación de prueba', status: 'MITIGATED', clientId, systemId: system.id, data: { ownerId: admin, description: 'Riesgo simulado', probability: 4, impact: 5, controls: 'Controles simulados', residualProbability: 1, residualImpact: 2, evidenceRef: 'Prueba local' } });
  await service.setPolicy(admin, clientId, { enabled: true, reason: 'Prueba del bloqueo', expectedVersion: 0 });
  const context = { clientId, provider: 'openai', model: 'model-test', useCase: 'parrillas.review', dataClasses: ['CONFIDENTIAL'] };
  await assert.rejects(service.assertUse(context), e => e.code === 'AI_AUTHORIZATION_REQUIRED');
  const auth = await service.save(admin, 'authorizations', null, { name: 'Permiso de prueba', status: 'APPROVED', systemId: system.id, riskId: risk.id, clientId, data: { ownerId: admin, contractRef: 'Prueba', useCase: 'parrillas.review', dataClasses: ['CONFIDENTIAL'], recipientEmail: 'empresa@example.invalid', noticeAt: '2025-01-01T10:00', noticeEvidenceRef: 'Aviso sintético', approvedAt: '2025-01-02T10:00', approverName: 'Persona ficticia', startsAt: '2025-02-01T10:00', expiresAt: '2030-01-01T10:00', evidenceRef: 'Autorización sintética' } });
  assert.equal((await service.assertUse(context)).authorizationId, auth.id);
  // Real HTTP transport, confined to loopback; real policy and audit in synthetic PostgreSQL.
  let requests = 0;
  const sink = createServer((req, res) => { requests++; req.resume(); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ id: 'synthetic', output_text: 'OK' })); });
  sink.listen(0, '127.0.0.1'); await once(sink, 'listening');
  try {
    const ai = createOpenAIClient({ apiKey: 'synthetic', governance: service, models: { chat: 'model-test' }, fetchImpl: (_url, options) => fetch(`http://127.0.0.1:${sink.address().port}`, options) });
    await assert.rejects(ai.generate({ prompt: 'Synthetic' }), e => e.code === 'AI_SCOPE_REQUIRED');
    await assert.rejects(ai.generate({ prompt: 'Synthetic', governanceContext: { clientId, useCase: 'different-purpose' } }), e => e.code === 'AI_AUTHORIZATION_REQUIRED');
    assert.equal(requests, 0);
    await ai.generate({ prompt: 'Synthetic', governanceContext: { clientId, useCase: 'parrillas.review' } });
    assert.equal(requests, 1);
    await assert.rejects(ai.generate({ prompt: 'Synthetic', model: 'unapproved-model', governanceContext: { clientId, useCase: 'parrillas.review' } }), e => e.code === 'AI_AUTHORIZATION_REQUIRED');
    assert.equal(requests, 1);
  } finally { await new Promise(resolve => sink.close(resolve)); }
  await assert.rejects(service.save(admin, 'authorizations', auth.id, { ...auth, expectedVersion: 1, reason: 'Intento de alterar permiso' }), e => e.status === 409);
  await service.save(admin, 'systems', system.id, { ...systemInput(), status: 'SUSPENDED', expectedVersion: 1, reason: 'Suspensión de prueba' });
  await assert.rejects(service.assertEgress(context), e => e.code === 'AI_AUTHORIZATION_REQUIRED');
});
test('incidentes conservan plazo original al editar y exigen evidencia de comunicación', async () => {
  assert.ok(service, 'falta implementar el servicio');
  const body = { name: 'Incidente sintético', clientId, data: { ownerId: admin, severity: 'HIGH', description: 'Solo prueba', impact: 'Confidencialidad', detectedAt: '2026-01-01T09:00', recipientEmail: 'empresa@example.invalid' } };
  const incident = await service.save(admin, 'incidents', null, body);
  await assert.rejects(service.save(admin, 'incidents', incident.id, { ...body, data: { ...body.data, detectedAt: '2026-01-02T09:00' }, expectedVersion: 1, reason: 'Intento de aplazar' }), e => e.status === 409);
  const page = await service.list(admin, 'incidents');
  assert.ok(page.items.find(r => r.id === incident.id).notificationOverdue);
});
