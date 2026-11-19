import test from 'node:test';
import assert from 'node:assert/strict';
import { planCycle, periodMovePreview, contractEndNotice, cycleRangeLabel } from '../src/lib/publicationPeriod.js';
import { periodMoveMessage, planPeriodName, planPeriodRange } from '../src/lib/contentPlanPeriod.js';
import { planPeriodOptions } from '../src/lib/contentPlanNavigation.js';

const bonsai = [
  { startDate: '2026-10-10', cutDay: 10, endDate: '2026-11-09', createdAt: '2026-10-01' },
  { startDate: '2026-11-10', cutDay: 10, endDate: '2026-12-09', renewalDecision: 'PENDIENTE', createdAt: '2026-11-10' }
];
const november = { year: 2026, month: 11 };

test('con corte 10 la parrilla de noviembre es bimensual: noviembre–diciembre, del 10 nov al 9 dic', () => {
  const cycle = planCycle(november, bonsai);
  assert.deepEqual(cycle, { cutDay: 10, label: 'Noviembre–diciembre', start: '2026-11-10', end: '2026-12-09', mixed: true });
  const plan = { ...november, cycle };
  assert.equal(planPeriodName(plan), 'noviembre–diciembre 2026');
  assert.equal(planPeriodRange(plan), '10 nov – 9 dic');
  assert.equal(cycleRangeLabel(planCycle({ year: 2026, month: 12 }, bonsai)), '10 dic 2026 – 9 ene 2027');
});

test('con corte 1 la parrilla se sigue llamando por su mes y no muestra rango', () => {
  const plan = { ...november, cycle: planCycle(november, []) };
  assert.equal(plan.cycle.mixed, false);
  assert.equal(planPeriodName(plan), 'noviembre 2026');
  assert.equal(planPeriodRange(plan), '');
  assert.equal(planPeriodName(november), 'noviembre 2026');
});

test('el selector de período nombra la parrilla por su ciclo', () => {
  const plan = { id: 'p', clientId: 'c', client: { slug: 'bonsai' }, ...november, cycle: planCycle(november, bonsai) };
  assert.equal(planPeriodOptions(plan)[0].label, 'Noviembre–diciembre 2026');
});

test('una fecha dentro del ciclo y del contrato no pregunta nada', () => {
  assert.equal(periodMoveMessage(periodMovePreview(november, '2026-12-05', bonsai)), null);
});

test('una fecha de otro ciclo pregunta antes de mover la pieza', () => {
  const message = periodMoveMessage(periodMovePreview(november, '2026-12-01', []));
  assert.equal(message.title, 'La pieza cambiaría de parrilla');
  assert.equal(message.confirmLabel, 'Mover a diciembre');
  assert.equal(message.cancelLabel, 'Cambiar la fecha');
  assert.match(message.description, /va del 1 nov al 30 nov 2026/);
  assert.doesNotMatch(message.description, /\(/);
});

test('una fecha después del fin del contrato lo dice, con y sin cambio de parrilla', () => {
  const moved = periodMoveMessage(periodMovePreview(november, '2026-12-12', bonsai));
  assert.equal(moved.title, 'Esta fecha queda fuera del contrato');
  assert.match(moved.description, /termina el 9 dic 2026 y no hay renovación registrada/);
  assert.match(moved.description, /diciembre–enero 2026 \(10 dic 2026 – 9 ene 2027\)/);
  const ending = [{ startDate: '2026-11-01', cutDay: 1, endDate: '2026-11-20', renewalDecision: 'NO_RENOVAR', createdAt: 'x' }];
  const stays = periodMoveMessage(periodMovePreview(november, '2026-11-25', ending));
  assert.equal(stays.confirmLabel, 'Dejar esta fecha');
  assert.match(stays.description, /no se va a renovar/);
});

test('la renovación ya registrada evita el aviso de fin de contrato', () => {
  assert.equal(contractEndNotice('2026-11-15', bonsai), null);
  assert.deepEqual(contractEndNotice('2026-12-10', bonsai), { endDate: '2026-12-09', noRenewal: false });
  assert.equal(contractEndNotice('2027-05-01', [{ startDate: '2026-01-01', cutDay: 1 }]), null);
});
