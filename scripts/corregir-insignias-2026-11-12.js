#!/usr/bin/env node
// Corrección de insignias autorizada por Rodny el 12 de noviembre de 2026: «tienes que quitarle a Brayan esas dos
// insignias y los 10 puntos … y darle a Rodny 5 puntos por su "Al día" de ayer».
//
// Brayan cerró el 12 a las 6:27 un video que terminó la víspera y recibió «Buen comienzo» y el «Al día» viejo (se
// ganaba al ponerse al día con lo vencido). Rodny terminó todo lo del 11 y no lo recibió. Desde ese día «Al día» se
// entrega al cierre de la jornada (`caughtUpAtClose`).
//
// Simula por defecto y dice exactamente qué cambiaría; escribe solo con `--confirmar CORREGIR`, en una transacción con
// el mismo candado de los reconocimientos. Antes de borrar guarda las filas en `output/` para poder reponerlas. Si lo
// que encuentra no es exactamente lo descrito (dos insignias de Brayan del 12, ninguna de Rodny del 11), no escribe.
//
//   node --env-file=C:\Proyectos\intelligence\.env scripts/corregir-insignias-2026-11-12.js
//   node --env-file=C:\Proyectos\intelligence\.env scripts/corregir-insignias-2026-11-12.js --confirmar CORREGIR
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { insertRecognitionAward, recognitionTransaction } from '../src/services/recognitionService.js';
import { CAUGHT_UP_POLICY, caughtUpAtClose, dayCloseCutoff } from '../src/services/recognitionRules.js';
import { closeViewsFor } from '../src/services/caughtUpAtCloseService.js';

const BRAYAN_DAY = '2026-11-12';
const RODNY_DAY = '2026-11-11';
const confirm = process.argv.includes('--confirmar') && process.argv[process.argv.indexOf('--confirmar') + 1] === 'CORREGIR';
const prisma = new PrismaClient();
const bogota = (value) => value ? new Date(new Date(value).getTime() - 5 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) : '—';

const onlyMember = async (prefix) => {
  const rows = await prisma.teamMember.findMany({ where: { name: { startsWith: prefix, mode: 'insensitive' }, isActive: true }, select: { id: true, name: true, userId: true } });
  if (rows.length !== 1 || !rows[0].userId) throw new Error(`Esperaba una sola persona activa que empiece por «${prefix}» con cuenta; encontré ${rows.length}.`);
  return rows[0];
};

try {
  const brayan = await onlyMember('Brayan');
  const rodny = await onlyMember('Rodny');

  const awards = await prisma.recognitionAward.findMany({ where: { recipientId: brayan.userId, dayKey: BRAYAN_DAY, kind: { in: ['FIRST_TASK', 'CAUGHT_UP'] } }, orderBy: { occurredAt: 'asc' } });
  const titles = new Map((await prisma.task.findMany({ where: { id: { in: awards.map((award) => award.taskId).filter(Boolean) } }, select: { id: true, title: true } })).map((task) => [task.id, task.title]));
  console.log(`\n${brayan.name}: insignias del ${BRAYAN_DAY} que se quitarían`);
  for (const award of awards) console.log(`  - ${award.kind.padEnd(11)} ${bogota(award.occurredAt)}  «${titles.get(award.taskId) || 'sin tarea'}»  (regla v${award.ruleVersion})`);
  const expected = awards.length === 2 && new Set(awards.map((award) => award.kind)).size === 2;

  const existing = await prisma.recognitionAward.findFirst({ where: { recipientId: rodny.userId, kind: 'CAUGHT_UP', dayKey: RODNY_DAY } });
  const views = (await closeViewsFor(prisma, { day: RODNY_DAY, memberIds: [rodny.id] })).get(rodny.id);
  const check = caughtUpAtClose({ day: RODNY_DAY, views });
  console.log(`\n${rodny.name}: «Al día» del ${RODNY_DAY} que se daría`);
  console.log(existing ? '  - Ya tiene «Al día» ese día: no se añadiría otro.' : '  - No lo tiene todavía.');
  console.log(`  - Con la regla nueva, al cierre de ese día: ${check.closed} cerradas antes de las 18:00 y ${check.pending} pendientes de ese día o antes → ${check.eligible ? 'la gana' : 'NO la ganaría'}.`);
  for (const view of views.filter((v) => v.status !== 'REALIZADA' || new Date(v.completedAt) >= dayCloseCutoff(RODNY_DAY))) console.log(`    · abierta a las 18:00: «${view.title}» (${view.status}, vence ${view.dueDate ? new Date(view.dueDate).toISOString().slice(0, 10) : '—'})`);

  if (!expected || existing) {
    console.log('\nNo coincide con lo descrito (dos insignias de Brayan del 12 y ninguna «Al día» de Rodny del 11). No se escribió nada.');
  } else if (!confirm) {
    console.log('\nSimulación: no se escribió nada. Para aplicarlo: añade --confirmar CORREGIR');
  } else {
    await mkdir('output', { recursive: true });
    const receipt = `output/correccion-insignias-${Date.now()}.json`;
    await writeFile(receipt, JSON.stringify({ deleted: awards, authorizedBy: 'Rodny Chirinos', at: new Date().toISOString() }, null, 2));
    const result = await recognitionTransaction(prisma, async (tx) => {
      const deleted = await tx.recognitionAward.deleteMany({ where: { id: { in: awards.map((award) => award.id) }, recipientId: brayan.userId } });
      const granted = await insertRecognitionAward(tx, { kind: 'CAUGHT_UP', recipientId: rodny.userId, at: dayCloseCutoff(RODNY_DAY), ruleVersion: 2, actorId: rodny.userId, seenAt: new Date(),
        evidence: { policy: CAUGHT_UP_POLICY, closedToday: check.closed, pending: check.pending, manual: true,
          reason: 'Corrección autorizada por Rodny el 12 de noviembre de 2026: terminó lo del 11 y la regla anterior no se la dio.' } });
      return { deleted: deleted.count, granted: Boolean(granted) };
    });
    console.log(`\nListo: ${result.deleted} insignias quitadas a ${brayan.name} y ${result.granted ? '«Al día» del 11 para ' + rodny.name : 'ninguna nueva para ' + rodny.name}. Copia de lo quitado: ${receipt}`);
  }
} finally {
  await prisma.$disconnect();
}
