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
]);

export async function applyRecognitionCorrections(db, { corrections = RECOGNITION_CORRECTIONS, now = new Date() } = {}) {
  const retired = [];
  for (const correction of corrections) {
    const where = { kind: correction.kind, dayKey: correction.day };
    if (correction.before === 'MORNING') where.occurredAt = { lt: dayStartCutoff(correction.day) };
    const awards = await db.recognitionAward.findMany({ where, select: { id: true, kind: true, recipientId: true, occurredAt: true, evidence: true } });
    for (const award of awards) {
      await db.recognitionAward.update({ where: { id: award.id }, data: {
        kind: `${award.kind}${RETIRED_SUFFIX}`,
        evidence: { ...(award.evidence || {}), retired: { at: now.toISOString(), requestedBy: correction.requestedBy, reason: correction.reason, previousKind: award.kind } },
      } });
      retired.push({ id: award.id, kind: award.kind, recipientId: award.recipientId, occurredAt: award.occurredAt });
    }
  }
  return retired;
}
