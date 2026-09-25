// Limpieza de una vez de los hallazgos acumulados (Rodny, 25 de septiembre de
// 2026). Hasta hoy nada cerraba un hallazgo que dejaba de detectarse, así que la
// pila creció hasta hacer inservible la revisión: más de mil abiertos, muchos de
// parrillas reescritas hace semanas.
//
//   node scripts/archive-open-review-findings.js                  # solo informa
//   node scripts/archive-open-review-findings.js --confirm ARCHIVAR
//
// No borra nada: pasa a STALE, que sale de la lista activa y se conserva en el
// historial. Lo que siga siendo real vuelve a abrirse solo en la próxima
// revisión de esa parrilla, ya con el techo nuevo. No toca lo que alguien pidió
// verificar, lo que alguien descartó ni lo ya resuelto.
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import prisma from '../src/lib/prisma.js';

const CONFIRM_WORD = 'ARCHIVAR';
export const CLEANUP_REASON = 'Limpieza inicial: la revisión vuelve a detectarlo si sigue vigente';

export const confirmationGiven = (argv) => {
  const index = argv.indexOf('--confirm');
  return index !== -1 && argv[index + 1] === CONFIRM_WORD;
};

export const buildFindingCleanupFilter = () => ({ status: 'OPEN' });

export const runFindingCleanup = async ({
  db = prisma,
  apply = false,
  now = new Date(),
  logger = console
} = {}) => {
  const where = buildFindingCleanupFilter();
  const found = await db.contentPlanReviewFinding.count({ where });
  logger.log(`Hallazgos abiertos acumulados: ${found}.`);
  if (!found) return { found: 0, archived: 0 };
  if (!apply) {
    logger.log(`\nSimulación: no se cambió nada. Repite con  --confirm ${CONFIRM_WORD}  para archivarlos.`);
    logger.log('Nada se borra: salen de la lista activa y vuelven si la próxima revisión los detecta.');
    return { found, archived: 0 };
  }
  const { count } = await db.contentPlanReviewFinding.updateMany({
    where,
    data: { status: 'STALE', actionReason: CLEANUP_REASON, lastActionAt: now, lastActionById: null }
  });
  logger.log(`\n${count} hallazgos archivados. Las parrillas activas se revisan de nuevo al editarlas.`);
  return { found, archived: count };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = new URL(process.env.DATABASE_URL);
  console.log(`Base: ${target.host}${target.pathname}`);
  await runFindingCleanup({ apply: confirmationGiven(process.argv) });
  await prisma.$disconnect().catch(() => {});
}
