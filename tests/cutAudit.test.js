import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCuts } from '../src/lib/cutAudit.js';
import { cycleOf } from '../src/lib/clientOperations.js';

const item = (date, status = 'APROBADO', format = 'Post') => ({ publishDate: `${date}T12:00:00.000Z`, status, format });
const shown = (cycle, plans, quota) => {
  const items = plans.filter((plan) => plan.year === cycle.year && plan.month === cycle.month).flatMap((plan) => plan.contentItems);
  return { ...cycle, quota, created: items.length, reached: { publicada: items.filter((row) => row.status === 'PUBLICADO').length } };
};

test('un cliente con corte 15 y una parrilla por mes calendario: el arqueo dice qué piezas están en el corte equivocado', () => {
  const plans = [
    { year: 2026, month: 11, contentItems: [item('2026-11-03', 'PUBLICADO'), item('2026-11-20', 'PUBLICADO'), item('2026-11-28')] },
    { year: 2026, month: 12, contentItems: [item('2026-12-02', 'PUBLICADO'), item('2026-12-20')] },
  ];
  const cycles = [cycleOf(2026, 10, 15), cycleOf(2026, 11, 15), cycleOf(2026, 12, 15)].map((cycle) => shown(cycle, plans, 4));
  const audit = auditCuts({ cycles, plans, contracts: [{ cutDay: 15 }] });
  const november = audit.cortes[1];
  assert.deepEqual(november.mostrado, { piezas: 3, publicadas: 2 });
  assert.deepEqual(november.porFecha, { piezas: 3, publicadas: 2 });
  assert.match(november.avisos.join('|'), /1 en la parrilla con fecha fuera del corte \(1 publicadas\)/);
  assert.match(november.avisos.join('|'), /1 con fecha del corte en otra parrilla \(1 publicadas\)/);
  assert.equal(audit.limpio, false);
});

test('historias, parrillas repetidas, piezas de más y cambio de corte quedan avisados; lo que cuadra sale limpio', () => {
  const plans = [
    { year: 2026, month: 11, contentItems: [item('2026-11-03'), item('2026-11-04', 'APROBADO', 'Historia')] },
    { year: 2026, month: 11, contentItems: [item('2026-11-10')] },
  ];
  const cycle = shown(cycleOf(2026, 11, 1), plans, 2);
  const audit = auditCuts({ cycles: [cycle], plans, contracts: [{ cutDay: 1 }, { cutDay: 15 }] });
  const notices = audit.cortes[0].avisos.join('|');
  assert.match(notices, /1 historias contadas como piezas/);
  assert.match(notices, /2 parrillas del mismo período/);
  assert.match(notices, /1 piezas de más sobre la cuota/);
  assert.deepEqual(audit.cortesDeContrato, [1, 15]);

  const clean = [{ year: 2026, month: 11, contentItems: [item('2026-11-03'), item('2026-11-10')] }];
  assert.equal(auditCuts({ cycles: [shown(cycleOf(2026, 11, 1), clean, 2)], plans: clean, contracts: [{ cutDay: 1 }] }).limpio, true);
});

test('una cuenta que vive en la hoja de MIO no se compara con las parrillas de la plataforma', () => {
  const cycle = { ...cycleOf(2026, 11, 1), quota: 8, created: 8, reached: { publicada: 3 }, source: { kind: 'HOJA_MIO' } };
  const audit = auditCuts({ cycles: [cycle], plans: [], contracts: [{ cutDay: 1 }] });
  assert.equal(audit.cortes[0].hoja, true);
  assert.deepEqual(audit.cortes[0].avisos, []);
});
