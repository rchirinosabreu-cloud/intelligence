import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { governanceError } from '../lib/aiGovernance.js';

// Registro central de uso de IA (27 de septiembre de 2026). Cada salida hacia un proveedor
// de IA deja una fila: quién, desde qué flujo, proveedor, modelo, cliente, resultado, tokens
// y duración. Nunca el contenido enviado ni recibido. Se conserva un año.

export const USAGE_RETENTION_DAYS = 365;
const PAGE_SIZE = 50;
const OUTCOMES = new Set(['ALLOWED', 'BLOCKED', 'ERROR']);

const int = (value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : null);

export const extractUsage = (json) => {
    const usage = json && typeof json === 'object' ? json.usage : null;
    if (!usage || typeof usage !== 'object') return { inputTokens: null, outputTokens: null };
    return {
        inputTokens: int(usage.input_tokens ?? usage.prompt_tokens),
        outputTokens: int(usage.output_tokens ?? usage.completion_tokens)
    };
};

export const buildUsageEvent = ({ provider, model, target, context, governanceContext, outcome, statusCode = null, durationMs = null, usage = {}, errorCode = null }) => ({
    id: randomUUID(),
    actorId: context?.actorId || null,
    clientId: governanceContext?.clientId || null,
    provider: String(provider || 'desconocido').slice(0, 40),
    model: String(model || 'desconocido').slice(0, 120),
    endpoint: String(target?.pathname || '').slice(0, 200),
    flow: String(governanceContext?.useCase || context?.module || 'automatico').slice(0, 80),
    route: context?.route ? String(context.route).slice(0, 220) : null,
    outcome: OUTCOMES.has(outcome) ? outcome : 'ERROR',
    statusCode: Number.isInteger(statusCode) ? statusCode : null,
    durationMs: int(durationMs),
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    errorCode: errorCode ? String(errorCode).slice(0, 80) : null
});

const CSV_COLUMNS = [
    ['occurredAt', 'Fecha'], ['actorName', 'Persona'], ['flow', 'Flujo'], ['provider', 'Proveedor'], ['model', 'Modelo'],
    ['clientName', 'Cliente'], ['outcome', 'Resultado'], ['statusCode', 'Estado HTTP'], ['inputTokens', 'Tokens entrada'],
    ['outputTokens', 'Tokens salida'], ['durationMs', 'Duración ms']
];

// Comillas siempre; una celda que empieza por = + - @ se neutraliza para que Excel no la ejecute.
const csvCell = (value) => {
    if (value === null || value === undefined) return '';
    let text = value instanceof Date ? value.toISOString() : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
};

export const toCsv = (rows) => [
    CSV_COLUMNS.map(([, label]) => label).join(','),
    ...rows.map((row) => CSV_COLUMNS.map(([key]) => csvCell(row[key])).join(','))
].join('\n') + '\n';

const clampDays = (value) => Math.min(365, Math.max(1, Number.parseInt(value, 10) || 30));

export const createAiUsageLog = ({ pool, clock = () => new Date() }) => {
    let lastPruneAt = 0;

    const assertAdmin = async (userId) => {
        const { rows } = await pool.query(`SELECT u.id FROM "User" u JOIN "TeamMember" t ON t."userId"=u.id WHERE u.id=$1 AND u.role='ADMIN' AND u."isActive"=true AND t."isActive"=true`, [userId]);
        if (!rows.length) throw governanceError('Solo administradores activos pueden consultar el uso de IA.', 403, 'GOVERNANCE_FORBIDDEN');
    };

    const prune = async () => {
        const now = clock().getTime();
        if (now - lastPruneAt < 24 * 3600 * 1000) return;
        lastPruneAt = now;
        await pool.query(`DELETE FROM "AiUsageEvent" WHERE "occurredAt" < $1`, [new Date(now - USAGE_RETENTION_DAYS * 24 * 3600 * 1000)]);
    };

    const record = async (event) => {
        await pool.query(
            `INSERT INTO "AiUsageEvent" (id,"occurredAt","actorId","clientId",provider,model,endpoint,flow,route,outcome,"statusCode","durationMs","inputTokens","outputTokens","errorCode") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [event.id, clock(), event.actorId, event.clientId, event.provider, event.model, event.endpoint, event.flow, event.route, event.outcome, event.statusCode, event.durationMs, event.inputTokens, event.outputTokens, event.errorCode]
        );
        await prune();
    };

    const filters = (query = {}) => {
        const params = [new Date(clock().getTime() - clampDays(query.days) * 24 * 3600 * 1000)];
        const where = ['e."occurredAt" >= $1'];
        for (const key of ['provider', 'outcome', 'flow', 'clientId', 'actorId']) {
            if (typeof query[key] === 'string' && query[key].trim()) {
                params.push(query[key].trim().slice(0, 120));
                where.push(`e."${key}" = $${params.length}`);
            }
        }
        return { where: where.join(' AND '), params };
    };

    const SELECT = `SELECT e.id, e."occurredAt", e."actorId", COALESCE(tm.name, u.name) AS "actorName", e."clientId", c.name AS "clientName",
        e.provider, e.model, e.endpoint, e.flow, e.route, e.outcome, e."statusCode", e."durationMs", e."inputTokens", e."outputTokens", e."errorCode"
      FROM "AiUsageEvent" e
      LEFT JOIN "User" u ON u.id = e."actorId"
      LEFT JOIN "TeamMember" tm ON tm."userId" = e."actorId"
      LEFT JOIN "Client" c ON c.id = e."clientId"`;

    const list = async (userId, query = {}) => {
        await assertAdmin(userId);
        const { where, params } = filters(query);
        const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
        const { rows } = await pool.query(`${SELECT} WHERE ${where} ORDER BY e."occurredAt" DESC LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`, params);
        return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
    };

    const summary = async (userId, query = {}) => {
        await assertAdmin(userId);
        const { where, params } = filters(query);
        const [totals, byFlow, byProvider] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE outcome='BLOCKED')::int AS blocked, COUNT(*) FILTER (WHERE outcome='ERROR')::int AS errors,
              COUNT(DISTINCT "actorId")::int AS people, COALESCE(SUM("inputTokens"),0)::bigint AS "inputTokens", COALESCE(SUM("outputTokens"),0)::bigint AS "outputTokens"
              FROM "AiUsageEvent" e WHERE ${where}`, params),
            pool.query(`SELECT flow, COUNT(*)::int AS calls FROM "AiUsageEvent" e WHERE ${where} GROUP BY flow ORDER BY calls DESC LIMIT 8`, params),
            pool.query(`SELECT provider, model, COUNT(*)::int AS calls FROM "AiUsageEvent" e WHERE ${where} GROUP BY provider, model ORDER BY calls DESC LIMIT 8`, params)
        ]);
        const total = totals.rows[0] || {};
        return {
            days: clampDays(query.days),
            calls: total.calls || 0,
            blocked: total.blocked || 0,
            errors: total.errors || 0,
            people: total.people || 0,
            inputTokens: Number(total.inputTokens || 0),
            outputTokens: Number(total.outputTokens || 0),
            byFlow: byFlow.rows,
            byProvider: byProvider.rows
        };
    };

    const exportCsv = async (userId, query = {}) => {
        await assertAdmin(userId);
        const { where, params } = filters(query);
        const { rows } = await pool.query(`${SELECT} WHERE ${where} ORDER BY e."occurredAt" DESC LIMIT 20000`, params);
        return toCsv(rows);
    };

    return { record, list, summary, exportCsv };
};

let productionLog;
// Sin base configurada (muestras locales) o dentro de `node --test` no se abre ninguna conexión:
// el registro calla. Algunos módulos cargan .env, que apunta a producción, y una prueba nunca
// puede escribir allí (AGENTS.md, sección 8).
const silentLog = { record: async () => {}, list: async () => ({ items: [], hasMore: false, page: 1 }), summary: async () => null, exportCsv: async () => toCsv([]) };
export const getAiUsageLog = () => productionLog ||= (process.env.DATABASE_URL && !process.env.NODE_TEST_CONTEXT
    ? createAiUsageLog({ pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }) })
    : silentLog);
