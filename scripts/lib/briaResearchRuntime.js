import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';

// Read only the configured runtime values; never copy the environment into the corpus or browser.
export const loadResearchConfig = async file => {
  const parsed = dotenv.parse(await readFile(file, 'utf8'));
  return Object.fromEntries(['OPENAI_API_KEY', 'DATABASE_URL', 'OPENAI_MODEL_CHAT', 'OPENAI_MODEL'].filter(key => parsed[key]).map(key => [key, parsed[key]]));
};

// Evaluaciones ficticias: inyectar la credencial evita que los procesos aislados necesiten abrir un .env.
// A diferencia de la investigación, estos casos no reciben una conexión a la plataforma.
export const loadCaseEvalConfig = async ({ env = process.env, load = loadResearchConfig } = {}) => {
  const source = env.OPENAI_API_KEY ? env : await load(env.BRIA_PROJECT_ENV || '.env');
  return { ...Object.fromEntries(['OPENAI_API_KEY', 'OPENAI_MODEL_CHAT', 'OPENAI_MODEL'].filter(key => source[key]).map(key => [key, source[key]])),
    ...Object.fromEntries(['BRIA_EVAL_MODEL', 'BRIA_EVAL_MAX_CALLS', 'BRIA_EVAL_MAX_INPUT_BYTES', 'BRIA_EVAL_MAX_OUTPUT_TOKENS'].filter(key => env[key]).map(key => [key, env[key]])) };
};

export const createCaseEvalProvider = async ({ apiKey, models, fetchImpl = globalThis.fetch, usage = [], env = process.env }) => {
  // Límites totales del proceso, no por caso. Se reservan antes de la red y no se
  // devuelven al fallar: un timeout puede haber sido procesado y facturado.
  const maxCalls = Number(env.BRIA_EVAL_MAX_CALLS), maxInput = Number(env.BRIA_EVAL_MAX_INPUT_BYTES), maxOutput = Number(env.BRIA_EVAL_MAX_OUTPUT_TOKENS);
  const model = env.BRIA_EVAL_MODEL;
  if (!model || ![maxCalls, maxInput, maxOutput].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Declara un presupuesto explícito de evaluación: modelo, llamadas, bytes de entrada y tokens de salida totales.');
  if (models?.chat !== model) throw new Error('El modelo de evaluación no coincide con el declarado en el presupuesto.');
  let calls = 0, input = 0, output = 0;
  const budgetedFetch = async (url, init) => {
    const body = JSON.parse(init.body), bytes = Buffer.byteLength(init.body), tokens = body.max_output_tokens;
    if (body.model !== model) throw new Error('El modelo de la llamada no coincide con el presupuesto de evaluación.');
    if (!Number.isSafeInteger(tokens) || tokens <= 0 || calls + 1 > maxCalls || input + bytes > maxInput || output + tokens > maxOutput) throw new Error('Presupuesto de evaluación agotado; no se envió otra llamada.');
    calls++; input += bytes; output += tokens;
    return fetchImpl(url, init);
  };
  const [{ createOpenAIClient }, { createGovernanceService }] = await Promise.all([
    import('../../src/services/openAIClient.js'), import('../../src/services/aiGovernanceService.js')
  ]);
  // El servicio real de gobierno, sobre un inventario ficticio vacío: nunca consultar políticas de producción.
  const governance = createGovernanceService({ pool: { query: async sql => {
    if (sql !== 'SELECT EXISTS (SELECT 1 FROM "AiGovernanceClientPolicy" WHERE enabled=true) AS enabled') throw new Error('Consulta inesperada en la evaluación ficticia.');
    return { rows: [{ enabled: false }] };
  } } });
  return createOpenAIClient({ apiKey, models, fetchImpl: budgetedFetch, governance, usageLog: { record: async event => { usage.push(event); } } });
};

// The research owner is not a production User. Production policies are read as-is;
// audit metadata stays local, and this adapter cannot write to the application database.
export const createResearchGovernancePool = ({ pool, record }) => ({
  async query(sql, args) {
    if (/^INSERT INTO "AiGovernanceEvent" /.test(sql)) {
      await record({ entityType: args[1], entityId: args[2], action: args[4], reason: args[5], after: args[7] });
      return { rows: [] };
    }
    if (!/^SELECT\s/i.test(sql)) throw new Error('La conexión de investigación es de solo lectura.');
    return pool.query(sql, args);
  }
});
