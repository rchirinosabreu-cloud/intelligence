// Cómo se usa Bria (10 de octubre de 2026). Rodny: «pulirla con el uso». Lee las conversaciones guardadas (solo
// cuántas, de quién, con qué herramientas, cuáles quedaron sin respuesta y cuántos tokens costaron), nunca su
// contenido. Es una brújula para saber qué pulir; no evalúa a nadie. Solo administradores.

import { getSidecarPool } from '../lib/sidecarPool.js';

export const USAGE_PERIODS = [7, 30];
const FALLBACK_ANSWER = 'No pude armar una respuesta con lo que encontré. Intenta preguntarlo de otra forma.';
const day = (value) => new Date(value).toISOString().slice(0, 10);

/** Resume filas de turnos en cifras. Pura: recibe filas, devuelve números y nombres. */
export const summarizeBriaUsage = (rows = [], { days = 7 } = {}) => {
  const people = new Map();
  const tools = new Map();
  const perDay = new Map();
  let questions = 0, answers = 0, unanswered = 0, failed = 0, tokens = 0, cached = 0, calls = 0;
  const models = new Set();
  for (const row of rows) {
    const key = row.actor_ref;
    if (!people.has(key)) people.set(key, { nombre: row.name || 'Cuenta sin nombre', preguntas: 0, ultimaVez: null });
    const person = people.get(key);
    if (row.role === 'user') {
      questions += 1; person.preguntas += 1;
      const when = day(row.created_at);
      perDay.set(when, (perDay.get(when) || 0) + 1);
      if (!person.ultimaVez || when > person.ultimaVez) person.ultimaVez = when;
      continue;
    }
    answers += 1;
    const meta = row.metadata || {};
    for (const tool of meta.toolsUsed || []) tools.set(tool, (tools.get(tool) || 0) + 1);
    if (String(row.content || '').trim() === FALLBACK_ANSWER) unanswered += 1;
    if ((meta.failures || []).length) failed += 1;
    if (meta.usage) { tokens += Number(meta.usage.totalTokens) || 0; cached += Number(meta.usage.cachedTokens) || 0; calls += Number(meta.usage.calls) || 0; for (const model of meta.usage.models || []) models.add(model); }
  }
  return {
    periodo: `${days} días`,
    personas: [...people.values()].sort((a, b) => b.preguntas - a.preguntas || a.nombre.localeCompare(b.nombre, 'es')),
    preguntas: questions,
    respuestas: answers,
    sinRespuesta: unanswered,
    conFallaDeHerramienta: failed,
    herramientas: [...tools.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([nombre, veces]) => ({ nombre, veces })),
    porDia: [...perDay.entries()].sort().map(([dia, preguntas]) => ({ dia, preguntas })),
    coste: { llamadasAlModelo: calls, tokens, tokensEnCache: cached, modelos: [...models].sort() }
  };
};

export const createBriaUsageService = ({ pool, workspace = 'application' } = {}) => ({
  async summary({ days = 7 } = {}) {
    const period = USAGE_PERIODS.includes(Number(days)) ? Number(days) : 7;
    const rows = (await pool.query(`SELECT c.actor_ref, u.name, t.role, t.content, t.metadata, t.created_at
      FROM bria_memory.conversation_turns t
      JOIN bria_memory.conversations c ON c.id = t.conversation_id
      LEFT JOIN public."User" u ON u.id = c.actor_ref
      WHERE c.workspace = $1 AND t.created_at >= now() - ($2::int * interval '1 day')
      ORDER BY t.created_at`, [workspace, period])).rows;
    return summarizeBriaUsage(rows, { days: period });
  }
});

let instance;
export const getBriaUsageService = () => instance ||= createBriaUsageService({ pool: getSidecarPool() });
