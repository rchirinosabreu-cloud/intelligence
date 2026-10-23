// Rentabilidad por cliente: lee del mes lo facturado a cada cliente, los egresos de la operación, las sesiones de
// trabajo y las tareas cerradas, y entrega la cuenta de `buildClientProfitability` (22 de octubre de 2026). Solo lee.
// La nómina entra como los egresos de Nómina del libro, sumada con el resto: nunca se lee por persona.

import prisma from '../lib/prisma.js';
import { buildClientProfitability, isOperatingExpense, isClientIncome, PROFITABILITY_LIMITS } from '../lib/clientProfitability.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';

const SESSION_LIMIT = 20000;
// El mes en reloj de Bogotá: la medianoche de allá son las 05:00 UTC.
const monthRange = (year, month) => ({ start: new Date(Date.UTC(year, month - 1, 1, 5)), end: new Date(Date.UTC(year, month, 1, 5)) });

/** El último mes completo en Bogotá, que es el que se revisa por defecto. */
export const lastClosedMonth = (at = new Date()) => {
  const [year, month] = bogotaDate(at).split('-').map(Number);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
};

export const createClientProfitabilityService = ({ db = prisma } = {}) => ({
  async read({ year, month }) {
    const { start, end } = monthRange(year, month);
    const [receivables, records, sessions, closed] = await Promise.all([
      db.accountsReceivable.findMany({ where: { kind: 'CLIENTE', clientId: { not: null }, OR: [{ year, month }, { year: null, period: { gte: start, lt: end } }] }, select: { clientId: true, amount: true } }),
      // Egresos e ingresos del mes: los ingresos cuentan solo para el cliente sin cuenta por cobrar del mes.
      db.financialRecord.findMany({ where: { type: { in: ['EXPENSE', 'INCOME'] }, scenario: 'ACTUAL', status: 'POSTED', isProjection: false, OR: [{ year, month }, { year: null, date: { gte: start, lt: end } }] }, select: { type: true, amount: true, category: true, section: true, clientId: true } }),
      db.taskWorkSession.findMany({ where: { startedAt: { gte: start, lt: end }, endedAt: { not: null }, isOverlapping: false }, select: { durationMs: true, task: { select: { clientId: true } } }, take: SESSION_LIMIT }),
      db.task.findMany({ where: { status: 'REALIZADA', completedAt: { gte: start, lt: end } }, select: { clientId: true, workSessions: { where: { isOverlapping: false }, select: { durationMs: true } } } })
    ]);
    const ids = [...new Set([...receivables, ...records].map((row) => row.clientId).concat(sessions.map((row) => row.task?.clientId)).filter(Boolean))];
    const clients = ids.length ? await db.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } }) : [];
    const result = buildClientProfitability({
      year, month, clients,
      receivables,
      incomes: records.filter(isClientIncome),
      unlinkedIncomeCents: records.filter((row) => row.type === 'INCOME' && !row.clientId && isClientIncome({ ...row, clientId: 'sin-cliente' })).reduce((sum, row) => sum + Math.round(Number(row.amount || 0) * 100), 0),
      expenses: records.filter(isOperatingExpense),
      sessions: sessions.map((row) => ({ clientId: row.task?.clientId || null, ms: Number(row.durationMs) || 0 })),
      closedTasks: closed.map((task) => ({ clientId: task.clientId, measuredMs: task.workSessions.reduce((sum, session) => { const ms = Number(session.durationMs) || 0; return ms > 0 && ms <= PROFITABILITY_LIMITS.forgottenSessionMs ? sum + ms : sum; }, 0) }))
    });
    // Nunca recortar en silencio: si el mes trae más sesiones de las que se leen, se dice.
    if (sessions.length === SESSION_LIMIT) result.notes.push(`Se leyeron las primeras ${SESSION_LIMIT.toLocaleString('es-CO')} sesiones del mes: las horas pueden quedarse cortas.`);
    return result;
  }
});

let instance;
export const clientProfitabilityService = () => instance ||= createClientProfitabilityService();
