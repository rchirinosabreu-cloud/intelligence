// Local research owner authorized OpenAI processing of questions and necessary source excerpts.
// Runtime credentials stay server-side; production policies are read-only and logs stay local.
import express from 'express';
import { createServer } from 'vite';
import { readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createBriaResearchRepository } from '../src/services/briaResearchRepository.js';
import { createBriaLivingRouter } from '../src/routes/api/briaLiving.js';
import pg from 'pg';
import { loadResearchConfig, createResearchGovernancePool } from './lib/briaResearchRuntime.js';
import { createGovernanceService } from '../src/services/aiGovernanceService.js';
import { createOpenAIClient } from '../src/services/openAIClient.js';
import { createBriaResearchChatService } from '../src/services/briaResearchChatService.js';
import { createBriaAssistantRouter } from '../src/routes/api/briaAssistant.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';
import { createBriaKnowledgeRepository } from '../src/services/briaKnowledgeRepository.js';
import { createBriaKnowledgeService } from '../src/services/briaKnowledgeService.js';
import { createBriaKnowledgeRouter } from '../src/routes/api/briaKnowledge.js';
import { canUseBria } from '../src/lib/briaLivingMemory.js';
import { createResearchPlatformReadAdapter } from './lib/briaResearchPlatform.js';
import { briaAssistantTools } from '../src/services/briaAssistantTools.js';
import { createBriaConversationRepository } from '../src/services/briaConversationRepository.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
import { createBriaConversationRouter } from '../src/routes/api/briaConversations.js';
import { createBriaModelRuntime } from '../src/services/briaModelRuntime.js';
import { getBriaChatStorage } from '../src/services/briaChatStorage.js';
import { startBriaChatPurgeWorker } from '../src/services/briaChatPurge.js';

const directory = process.env.BRIA_RESEARCH_DIRECTORY;
if (!directory) throw new Error('Indica BRIA_RESEARCH_DIRECTORY con la carpeta privada de lectura.');
const port = Number(process.env.BRIA_PREVIEW_PORT || 3017);
const origin = `http://127.0.0.1:${port}`;
const session = randomBytes(32).toString('hex');
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return res.sendStatus(403);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.json({ limit: '64kb' }));
const repo = createBriaResearchRepository({ directory });
const config = await loadResearchConfig(process.env.BRIA_PROJECT_ENV || 'C:/Proyectos/intelligence/.env');
if (!config.OPENAI_API_KEY || !config.DATABASE_URL) throw new Error('Falta la configuración del modelo o de políticas.');
const policyPool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, options: '-c default_transaction_read_only=on' });
const record = async event => appendFile(path.join(directory, 'bria-api-usage.jsonl'), JSON.stringify({ recordedAt: new Date().toISOString(), researchOwner: true, ...event }) + '\n', { mode: 0o600 });
const governance = createGovernanceService({ pool: createResearchGovernancePool({ pool: policyPool, record }) });
const ai = createOpenAIClient({ apiKey: config.OPENAI_API_KEY, models: { chat: config.OPENAI_MODEL_CHAT || config.OPENAI_MODEL || 'gpt-5.6-terra' }, governance, usageLog: { record } });
const knowledgePool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
if (!(await knowledgePool.query("SELECT to_regclass('bria_memory.learnings') IS NOT NULL AS ready")).rows[0].ready) await knowledgePool.query(await readFile(new URL('./sql/bria-knowledge.sql', import.meta.url), 'utf8'));
await knowledgePool.query(await readFile(new URL('./sql/bria-conversations.sql', import.meta.url), 'utf8'));
const persisted = createBriaKnowledgeRepository({ pool: knowledgePool, workspace: 'research:social.brainstudio@gmail.com' });
const resolveOwner = async user => {
  if (!canUseBria(user)) throw Object.assign(new Error('Bria no está activada.'), { status: 403 });
  return { ref: 'local-research-owner', name: 'Rodny', role: 'ADMIN', accountIds: [], permissions: user.modulePermissions };
};
const knowledge = createBriaKnowledgeService({ repository: persisted, resolveActor: resolveOwner });
const documents = { ...repo, search: async (...args) => (await persisted.status()).latestImport?.status === 'COMPLETED' ? persisted.search(...args) : repo.search(...args), read: async (...args) => (await persisted.status()).latestImport?.status === 'COMPLETED' ? persisted.read(...args) : repo.read(...args), overview: async user => ({ ...await repo.overview(user), database: await persisted.status() }) };
const platform = { tools: briaAssistantTools.filter(tool => ['buscar_cliente','parrilla_de_cliente','leer_piezas_de_parrilla'].includes(tool.name)), context: { db: createResearchPlatformReadAdapter({ pool: policyPool }) } };
// A fresh bounded runtime per turn; an idle preview must not inherit an expired deadline.
const chat = createBriaResearchChatService({ repository: documents, ai: user => createBriaModelRuntime({ ai, env: { ...config, ...process.env }, user }), knowledge, platform });
const storage = getBriaChatStorage({ ...config, ...process.env });
startBriaChatPurgeWorker({ pool: knowledgePool, storage });
const conversations = createBriaConversationService({ repository: createBriaConversationRepository({ pool: knowledgePool, storage, workspace: persisted.workspace }), resolveActor: resolveOwner, assistant: chat, ai });
app.use('/api', (req, res, next) => {
  if (!String(req.headers.cookie || '').split(';').some((part) => part.trim() === `bria_preview=${session}`)) return res.sendStatus(401);
  req.user = { id: 'local-research-owner', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, parrillas: true } };
  next();
});
app.use('/api/bria/living', createBriaLivingRouter({ repository: documents }));
app.use('/api/bria/knowledge', createBriaKnowledgeRouter({ service: knowledge }));
app.use('/api/bria/conversations', (req, _res, next) => runWithAiContext({ actorId: null, module: 'bria', route: 'LOCAL RESEARCH /api/bria/conversations' }, next), createBriaConversationRouter({ service: conversations }));
app.get('/api/bria/platform/clients', async (_req, res) => {
  try { res.json(await platform.context.db.client.findMany({ where: { name: { contains: '' } } })); }
  catch (failure) { console.error('[BriaPlatform]', failure.code); res.status(503).json({ message: 'No se pudieron leer las cuentas actuales.' }); }
});
app.get('/api/bria/platform/plans', async (_req, res) => {
  try { res.json((await policyPool.query(`SELECT p.id,p.month,p.year,p.status,c.name AS client,(SELECT count(*)::int FROM "ContentItem" i WHERE i."planId"=p.id AND i."deletedAt" IS NULL) AS pieces FROM "ContentPlan" p JOIN "Client" c ON c.id=p."clientId" WHERE p."deletedAt" IS NULL AND p.year=2026 AND p.month=10 ORDER BY c.name`)).rows); }
  catch (failure) { console.error('[BriaPlatform]', failure.code); res.status(503).json({ message: 'No se pudieron leer las parrillas actuales.' }); }
});
app.get('/api/bria/platform/plans/:id', async (req, res) => {
  try { res.json(await platform.tools.find(tool => tool.name === 'leer_piezas_de_parrilla').run({ planId: req.params.id, desde: 0 }, platform.context)); }
  catch (failure) { console.error('[BriaPlatform]', failure.code); res.status(503).json({ message: 'No se pudieron leer las piezas de la parrilla.' }); }
});
app.use('/api/bria', (req, _res, next) => runWithAiContext({ actorId: null, module: 'bria', route: 'LOCAL RESEARCH /api/bria/ask' }, next), createBriaAssistantRouter({ service: chat }));
const vite = await createServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'custom' });
app.get(['/', '/activation', '/clientes', '/parrillas', '/gestion', '/parrillas/:id'], async (req, res, next) => {
  try {
    // Navigation from the owner's app/browser creates a same-site, HTTP-only local session.
    res.setHeader('Set-Cookie', `bria_preview=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200`);
    const template = await readFile(path.join(process.cwd(), req.path === '/activation' ? 'tests/fixtures/bria-activation.html' : 'tests/fixtures/bria-living.html'), 'utf8');
    res.type('html').send(await vite.transformIndexHtml(req.originalUrl, template));
  } catch (error) { next(error); }
});
app.use(vite.middlewares);
const server = app.listen(port, '127.0.0.1', () => console.log(`Bria lista: ${origin}`));
const close = async () => { server.close(); repo.close(); await policyPool.end(); await knowledgePool.end(); await vite.close(); process.exit(0); };
process.on('SIGINT', close); process.on('SIGTERM', close);
