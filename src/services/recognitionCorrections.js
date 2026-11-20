import { dayStartCutoff } from './recognitionRules.js';

// Correcciones de reconocimientos pedidas por Rodny, aplicadas al arrancar y sin repetirse (`applyRecognitionCorrections`).
// Retirar no borra: el reconocimiento cambia a un tipo «retirado» que la liga y los logros no cuentan, y su `evidence`
// guarda quién lo pidió, cuándo, por qué y qué tipo era. La clave única se conserva, así que nadie lo vuelve a ganar
// ese día por accidente.
export const RETIRED_SUFFIX = '_RETIRADO';
export const RECOGNITION_CORRECTIONS = Object.freeze([
  // Rodny, 20 de noviembre de 2026: «pon buen comienzo con regla desde las 8am, y entonces le retiras a Sara esos 5 ptos».
  // Sara cerró a la 1:07 a. m., antes de que la regla empezara a contar desde las 8:00.
  { kind: 'FIRST_TASK', day: '2026-11-20', before: 'MORNING', requestedBy: 'Rodny',
    reason: '«Buen comienzo» cuenta desde las 8:00; este se otorgó en la madrugada.' },
  // Rodny, 20 de noviembre de 2026: «Sara también se equivocó con dos fechas, entonces ni Elar ni Nattal serían entregas
  // anticipadas». Solo se aplica si encuentra exactamente las dos; si no, no toca nada y deja la lista en el registro.
  { kind: 'EARLY_DELIVERY', month: '2026-11', recipientName: 'Sara', clients: ['elar', 'nattal'], expected: 2, requestedBy: 'Rodny',
    reason: 'La fecha de entrega se puso por error: no fue una entrega anticipada.' },
]);

export async function applyRecognitionCorrections(db, { corrections = RECOGNITION_CORRECTIONS, now = new Date() } = {}) {
  const retired = [];
  for (const correction of corrections) {
    const where = { kind: correction.kind, dayKey: correction.day ? correction.day : { startsWith: correction.month } };
    if (correction.before === 'MORNING') where.occurredAt = { lt: dayStartCutoff(correction.day) };
    if (correction.recipientName) where.recipient = { name: { startsWith: correction.recipientName } };
    let awards = await db.recognitionAward.findMany({ where, select: { id: true, kind: true, recipientId: true, taskId: true, occurredAt: true, evidence: true } });
    if (correction.clients) {
      const tasks = await db.task.findMany({ where: { id: { in: awards.map(award => award.taskId).filter(Boolean) } }, select: { id: true, title: true, client: { select: { name: true } } } });
      const clientOf = new Map(tasks.map(task => [task.id, task]));
      const matches = (award) => correction.clients.some(name => String(clientOf.get(award.taskId)?.client?.name || '').toLowerCase().includes(name));
      awards = awards.filter(matches).map(award => ({ ...award, task: clientOf.get(award.taskId) }));
      if (correction.expected && awards.length !== correction.expected) {
        console.warn('[Reconocimientos] Corrección sin aplicar: se esperaban', correction.expected, 'y hay', awards.length,
          JSON.stringify(awards.map(award => ({ id: award.id, dia: award.occurredAt, tarea: award.task?.title, cliente: award.task?.client?.name }))));
        continue;
      }
    }
    for (const award of awards) {
      await db.recognitionAward.update({ where: { id: award.id }, data: {
        kind: `${award.kind}${RETIRED_SUFFIX}`,
        evidence: { ...(award.evidence || {}), retired: { at: now.toISOString(), requestedBy: correction.requestedBy, reason: correction.reason, previousKind: award.kind } },
      } });
      retired.push({ id: award.id, kind: award.kind, recipientId: award.recipientId, occurredAt: award.occurredAt, task: award.task?.title, client: award.task?.client?.name });
    }
  }
  return retired;
}
