// Local-only, disposable pilot. Not imported by the application or production startup.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/brainstudio_test') {
  throw new Error('La muestra solo admite la base local brainstudio_test en 127.0.0.1:55439. No se cargará .env.');
}
process.env.DATABASE_URL = url.href;
const port = Number(process.env.BRIA_PILOT_PORT || 3002);
if (![3002, 3003].includes(port)) throw new Error('El piloto solo admite los puertos locales 3002 o 3003.');
const origin = `http://127.0.0.1:${port}`;
const [{ createClientCriterionService }, { createClientCriteriaRouter }, { TRACEABLE_RUBRIC, parseTraceableReview }] = await Promise.all([
  import('../src/services/briaClientCriterionService.js'), import('../src/routes/api/clientCriteria.js'), import('../src/services/briaTraceableScore.js')
]);
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
const service = createClientCriterionService(db);
const app = express();
app.use(express.json({ limit: '16kb' }));
const key = randomUUID();
const client = await db.client.create({ data: { name: 'Cliente de ejemplo · piloto local', slug: `bria-local-pilot-${key}` } });
const users = {};
for (const [label, role] of [['Responsable', 'EDITOR'], ['Colaborador', 'EDITOR'], ['PM', 'PROJECT_MANAGER'], ['Admin', 'ADMIN']]) {
  users[label] = await db.user.create({ data: { name: `${label} de ejemplo`, role, email: `${label}-${key}@local.invalid`, password: 'not-a-valid-password-hash', modulePermissions: { parrillas: true } } });
}
const member = await db.teamMember.create({ data: { name: 'Responsable de ejemplo', role: 'Editorial', userId: users.Responsable.id } });
const plan = await db.contentPlan.create({ data: { clientId: client.id, ownerId: member.id, month: 9, year: 2026 } });
await service.propose({ planId: plan.id, actorUserId: users.Colaborador.id, requestId: randomUUID(), category: 'MARCA', text: 'Usar un tono cercano y tratar a la audiencia de tú.', reason: 'La guía vigente del cliente define este tratamiento.' });
let selected = 'Responsable';
const snapshot = { items: [{ id: 'piece', copyText: 'Nuestros diseños comunica tu idea.', objective: 'Explicar los servicios de diseño.' }] };
const known = new Set(['GRAMMAR_AGREEMENT', 'GRAMMAR_SPELLING', 'GRAMMAR_CLARITY', 'STRATEGY_OBJECTIVE']);
const review = parseTraceableReview(JSON.stringify({ summary: 'Muestra del cálculo con respuestas ficticias, no una revisión real de IA.', reviewedItemIds: ['piece'], checks: TRACEABLE_RUBRIC.rules.map(rule => ({
  itemId: 'piece', ruleKey: rule.key, outcome: !known.has(rule.key) ? 'NOT_ASSESSABLE' : rule.key === 'GRAMMAR_AGREEMENT' ? 'FAIL' : 'PASS',
  severity: rule.key === 'GRAMMAR_AGREEMENT' ? 'WARNING' : 'NONE', field: 'copyText', quote: snapshot.items[0].copyText,
  detail: !known.has(rule.key) ? 'La muestra no contiene el contexto necesario para este criterio.' : rule.key === 'GRAMMAR_AGREEMENT' ? 'El sujeto plural requiere «comunican».' : 'Chequeo explícito de ejemplo sin defecto.',
  recommendation: rule.key === 'GRAMMAR_AGREEMENT' ? 'Cambiar «comunica» por «comunican».' : '', evidenceIds: []
})) }), snapshot, []);
app.get('/api/demo', (_req, res) => res.json({ planId: plan.id, selected, viewers: Object.keys(users), review }));
app.post('/api/demo/viewer', (req, res) => {
  if (!Object.hasOwn(users, req.body?.viewer)) return res.status(400).json({ error: 'Usuario de ejemplo desconocido.' });
  selected = req.body.viewer;
  return res.json({ selected });
});
app.use('/api/content/plans/:planId/criteria', (req, res, next) => {
  if (req.params.planId !== plan.id) return res.status(404).json({ error: 'Esta muestra solo permite su parrilla ficticia.' });
  req.user = { userId: users[selected].id };
  next();
}, createClientCriteriaRouter(service));
app.use('/api', (_req, res) => res.status(404).json({ error: 'API fuera del alcance del piloto local.' }));
const vite = await createViteServer({ logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify(origin) }, server: { host: '127.0.0.1', middlewareMode: true, hmr: { host: '127.0.0.1', port: port + 20000 } }, appType: 'mpa' });
app.use(vite.middlewares);
const server = app.listen(port, '127.0.0.1', () => console.log(`Piloto aislado listo: ${origin}/tests/fixtures/bria-pilot.html · PostgreSQL local · sin llamadas a IA`));
let closing = false;
const close = async () => {
  if (closing) return; closing = true;
  server.close();
  await vite.close();
  // Only fixture IDs created by this process, and only the validated local database.
  await db.client.delete({ where: { id: client.id } });
  await db.teamMember.delete({ where: { id: member.id } });
  await db.user.deleteMany({ where: { id: { in: Object.values(users).map(user => user.id) } } });
  await db.$disconnect(); process.exit(0);
};
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => close().catch(error => { console.error('Cierre del piloto local:', error); process.exit(1); }));
