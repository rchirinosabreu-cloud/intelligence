import test from 'node:test';
import assert from 'node:assert/strict';
import { clientOperationPlanPath, deriveClientAlerts } from '../src/lib/clientOperationAlerts.js';

const reason = (code, level = 'yellow', category = 'operation', month = 11) => ({
  code, level, category, text: code,
  action: { type: 'current_plan', year: 2026, month },
});

test('las alertas separan contrato y priorizan gravedad y problema, sin recalcular el semáforo', () => {
  const evaluation = {
    level: 'red',
    reasons: [
      reason('MISSING_PIECES', 'yellow', 'planning'),
      reason('REPORT_PENDING'),
      reason('CONTRACT_EXPIRED', 'yellow', 'contract'),
      reason('PREVIOUS_SHORTFALL', 'red', 'operation', 10),
      reason('PLANNED_SAME_DAY', 'yellow', 'planning'),
      reason('NO_PLAN'),
      reason('TASKS_OVERDUE'),
      reason('CURRENT_OVERDUE', 'red'),
      reason('PUBLISHING_BEHIND'),
      reason('PLANNED_GAP', 'yellow', 'planning'),
    ],
  };
  const before = structuredClone(evaluation);
  const alerts = deriveClientAlerts(evaluation);
  assert.deepEqual(alerts.primary.map(({ code }) => code), [
    'CURRENT_OVERDUE', 'PREVIOUS_SHORTFALL', 'NO_PLAN', 'PUBLISHING_BEHIND',
    'TASKS_OVERDUE', 'REPORT_PENDING', 'MISSING_PIECES', 'PLANNED_GAP', 'PLANNED_SAME_DAY',
  ]);
  assert.deepEqual(alerts.contract, [evaluation.reasons[2]]);
  assert.deepEqual(evaluation, before, 'conserva motivos, orden original y color calculado');
});

test('una alerta roja siempre precede a una amarilla, aunque su código tenga menor prioridad', () => {
  const overdue = reason('CURRENT_OVERDUE');
  const behind = reason('PUBLISHING_BEHIND', 'red');
  assert.deepEqual(deriveClientAlerts({ reasons: [overdue, behind] }).primary, [behind, overdue]);
});

test('solo se eliminan alertas idénticas: otro periodo, texto o destino siguen visibles', () => {
  const first = reason('PREVIOUS_SHORTFALL', 'red', 'operation', 10);
  const reorderedDuplicate = { action: { month: 10, year: 2026, type: 'current_plan' }, text: first.text, category: first.category, level: first.level, code: first.code };
  const otherMonth = reason('PREVIOUS_SHORTFALL', 'red', 'operation', 9);
  const otherText = { ...first, text: 'Faltan otras piezas.' };
  const otherTarget = { ...first, action: { ...first.action, type: 'previous_plan' } };
  assert.deepEqual(deriveClientAlerts({ reasons: [first, reorderedDuplicate, otherMonth, otherText, otherTarget] }).primary,
    [first, otherMonth, otherText, otherTarget]);
});

test('los motivos legados se conservan sin interpretar su texto ni inventar una acción', () => {
  const legacy = { level: 'yellow', text: 'Contrato vencido: revisar la ficha.' };
  assert.deepEqual(deriveClientAlerts({ reasons: [legacy] }), { primary: [legacy], contract: [] });
  assert.equal(deriveClientAlerts({ reasons: [legacy] }).primary[0].action, undefined);
  assert.deepEqual(deriveClientAlerts(), { primary: [], contract: [] });
});

const client = {
  slug: 'cliente-prueba',
  cycles: {
    current: { year: 2026, month: 11, pieces: [{ planId: 'plan-noviembre' }, { planId: 'plan-noviembre' }] },
    previous: { year: 2026, month: 10, pieces: [{ planId: 'plan-octubre' }] },
  },
};

test('abrir el aviso de octubre lleva a octubre aunque el mes actual sea noviembre', () => {
  assert.equal(clientOperationPlanPath(client, client.cycles.previous), '/parrillas/plan-octubre');
  assert.equal(clientOperationPlanPath(client, client.cycles.current), '/parrillas/plan-noviembre');
});

test('el callback legado sin ciclo sigue abriendo la parrilla actual', () => {
  assert.equal(clientOperationPlanPath(client), '/parrillas/plan-noviembre');
  assert.equal(clientOperationPlanPath(client, undefined), '/parrillas/plan-noviembre');
});

test('un ciclo sin piezas usa la ruta existente del cliente y su mes', () => {
  assert.equal(clientOperationPlanPath(client, { year: 2026, month: 10 }), '/parrillas/cliente-prueba/octubre-2026');
  assert.equal(clientOperationPlanPath(client, { year: 2025, month: 12, pieces: [] }), '/parrillas/cliente-prueba/diciembre-2025');
});

test('un mes sin ninguna pieza abre Parrillas para buscar o crear, sin llevar a un plan inexistente', () => {
  const empty = { year: 2026, month: 11, created: 0, pieces: [] };
  assert.equal(clientOperationPlanPath(client, empty), '/parrillas');
  assert.equal(clientOperationPlanPath(client, { ...empty, source: { kind: 'HOJA_MIO' } }), '/parrillas/hoja/cliente-prueba/noviembre-2026');
  assert.equal(clientOperationPlanPath(client, { ...empty, created: 3 }), '/parrillas/cliente-prueba/noviembre-2026', 'un histórico sin detalle de piezas conserva el mes');
});

test('con varias parrillas o identificadores incompletos se abre el periodo, no una parrilla arbitraria', () => {
  const cycle = { year: 2026, month: 10, pieces: [{ planId: 'primera' }, { planId: 'segunda' }] };
  assert.equal(clientOperationPlanPath(client, cycle), '/parrillas/cliente-prueba/octubre-2026');
  assert.equal(clientOperationPlanPath(client, { ...cycle, pieces: [{ planId: 'primera' }, {}] }), '/parrillas/cliente-prueba/octubre-2026');
});

test('la hoja abre su vista del mes y nunca interpreta un identificador externo como parrilla nativa', () => {
  const cycle = { year: 2026, month: 10, source: { kind: 'HOJA_MIO' }, pieces: [{ planId: 'externo' }] };
  assert.equal(clientOperationPlanPath(client, cycle), '/parrillas/hoja/cliente-prueba/octubre-2026');
  assert.equal(clientOperationPlanPath({ ...client, externalPlanUrl: 'https://docs.google.com/spreadsheets/d/example' }, { year: 2026, month: 11 }),
    '/parrillas/hoja/cliente-prueba/noviembre-2026');
});

test('sin periodo válido no se manda a otro mes ni se construye una ruta inválida', () => {
  for (const cycle of [null, {}, { year: 2026, month: 13 }, { year: 2026, month: 0 }, { month: 10, pieces: [{ planId: 'otro' }] }]) {
    assert.equal(clientOperationPlanPath(client, cycle), '/parrillas');
  }
  assert.equal(clientOperationPlanPath(), '/parrillas');
  assert.equal(clientOperationPlanPath({}, { year: 2026, month: 10 }), '/parrillas');
});
