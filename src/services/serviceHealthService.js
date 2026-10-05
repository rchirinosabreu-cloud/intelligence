import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import {
  SERVICE_CATALOG,
  LIGHTS,
  CHECK_STATUSES,
  resolveServiceLight,
  overallLight,
  isServiceDue,
  hourlyHistory,
  classifyNetworkFailure
} from '../lib/serviceHealth.js';
import { createServiceHealthProbes } from './serviceHealthProbes.js';

/**
 * Semáforo de servicios (4 de octubre de 2026): corre las comprobaciones que tocan, guarda cada una
 * en `ServiceHealthCheck` y arma el tablero que ve un administrador. El historial se queda 30 días.
 */

const HOUR = 60 * 60 * 1000;
const RETENTION_MS = 30 * 24 * HOUR;
const MESSAGE_MAX = 300;

const normalizeOutcome = (outcome) => {
  const status = CHECK_STATUSES.includes(outcome?.status) ? outcome.status : 'FAIL';
  return {
    status,
    critical: status === 'FAIL' && outcome?.critical === true,
    latencyMs: Number.isFinite(outcome?.latencyMs) ? Math.round(outcome.latencyMs) : null,
    message: outcome?.message ? String(outcome.message).slice(0, MESSAGE_MAX) : null,
    errorCode: outcome?.errorCode ? String(outcome.errorCode).slice(0, 60) : null
  };
};

export const createServiceHealthService = ({
  db = prisma,
  catalog = SERVICE_CATALOG,
  probes = null,
  now = () => new Date(),
  logger = console
} = {}) => {
  let lastPurgeAt = 0;
  const resolveProbes = () => probes || createServiceHealthProbes({ db });

  const latestCheckTimes = async () => {
    const rows = await db.serviceHealthCheck.groupBy({ by: ['serviceId'], _max: { checkedAt: true } });
    return new Map(rows.map((item) => [item.serviceId, item._max.checkedAt]));
  };

  const purgeOldChecks = async () => {
    lastPurgeAt = now().getTime();
    return db.serviceHealthCheck.deleteMany({ where: { checkedAt: { lt: new Date(now().getTime() - RETENTION_MS) } } });
  };

  /** Comprueba lo que toca (o todo con `force`) y guarda una fila por servicio comprobado. */
  const runDueChecks = async ({ force = false } = {}) => {
    const available = resolveProbes();
    const latest = force ? new Map() : await latestCheckTimes();
    const due = catalog.filter((service) => isServiceDue(service, latest.get(service.id) || null, now()));
    if (!due.length) return [];

    const outcomes = await Promise.all(due.map(async (service) => {
      let outcome;
      try {
        outcome = available[service.id]
          ? await available[service.id]()
          : { status: 'FAIL', message: 'No hay comprobación para este servicio.', errorCode: 'NO_PROBE' };
      } catch (error) {
        outcome = { status: 'FAIL', ...classifyNetworkFailure(error) };
      }
      return { id: randomUUID(), serviceId: service.id, checkedAt: now(), ...normalizeOutcome(outcome) };
    }));

    await db.serviceHealthCheck.createMany({ data: outcomes });
    if (now().getTime() - lastPurgeAt > HOUR) {
      await purgeOldChecks().catch((error) => logger.error('[ServiceHealth] No se pudo purgar el historial:', error.message));
    }
    return outcomes;
  };

  const getBoard = async () => {
    const since = new Date(now().getTime() - 24 * HOUR);
    const rows = await db.serviceHealthCheck.findMany({
      where: { checkedAt: { gte: since } },
      orderBy: { checkedAt: 'desc' },
      select: { serviceId: true, status: true, critical: true, latencyMs: true, message: true, errorCode: true, checkedAt: true }
    });
    const byService = new Map();
    for (const item of rows) {
      if (!byService.has(item.serviceId)) byService.set(item.serviceId, []);
      byService.get(item.serviceId).push(item);
    }

    const services = catalog.map((service) => {
      const checks = byService.get(service.id) || [];
      const { light, reason } = resolveServiceLight(checks, { now: now(), intervalMs: service.intervalMs });
      const counted = checks.filter((item) => item.status !== 'NOT_CONFIGURED');
      const healthy = counted.filter((item) => item.status !== 'FAIL').length;
      const lastFailure = checks.find((item) => item.status === 'FAIL') || null;
      return {
        id: service.id,
        label: service.label,
        purpose: service.purpose,
        impact: service.impact,
        light,
        reason,
        lastCheck: checks[0] || null,
        lastFailure: lastFailure ? { checkedAt: lastFailure.checkedAt, message: lastFailure.message } : null,
        uptime24h: counted.length ? Math.floor((healthy / counted.length) * 100) : null,
        history: hourlyHistory(checks, { now: now() })
      };
    });

    const counts = Object.fromEntries(Object.values(LIGHTS).map((light) => [light, 0]));
    services.forEach((service) => { counts[service.light] += 1; });
    return {
      generatedAt: now().toISOString(),
      overall: overallLight(services.map((service) => service.light)),
      counts,
      lastCheckedAt: rows[0]?.checkedAt || null,
      services
    };
  };

  return { runDueChecks, getBoard, purgeOldChecks };
};

let defaultService;
export const serviceHealthService = () => (defaultService ||= createServiceHealthService());
