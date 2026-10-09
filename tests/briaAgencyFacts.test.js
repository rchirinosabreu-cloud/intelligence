import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFact, factDigest, factAccess, factVisible, correctionIntent, planFactImport,
  resolveClientLinks, presentFact, CERTAINTY_WORDS
} from '../src/lib/briaAgencyFacts.js';

const fact = (over = {}) => ({
  id: 'aristea-007', entidad: 'Aristea', tipoEntidad: 'cliente', fichaNativa: 'Aristea', tema: 'acuerdo',
  afirmacion: 'El último contrato firmado venció el 10 de septiembre de 2026.', certeza: 'NO_CONCLUYENTE',
  desde: '2026-09-11', hasta: null, fuentes: [{ tipo: 'drive', ref: 'Hoja «Contratos»', fecha: '2026-08-10' }],
  proposito: 'operacion', sensibilidad: 'normal', observadoEl: '2026-10-07', ...over
});
const admin = { role: 'ADMIN', isActive: true, modulePermissions: { bria: true } };
const pm = { role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, parrillas: true } };

test('a fact needs entity, statement, a known certainty and purpose, and a real date', () => {
  assert.equal(validateFact(fact()).entity, 'Aristea');
  assert.throws(() => validateFact(fact({ certeza: 'SEGURO' })), /certeza/i);
  assert.throws(() => validateFact(fact({ proposito: 'chisme' })), /propósito/i);
  assert.throws(() => validateFact(fact({ afirmacion: '' })), /afirmación/i);
  assert.throws(() => validateFact(fact({ afirmacion: 'x'.repeat(601) })), /afirmación/i);
  assert.throws(() => validateFact(fact({ desde: '2026-02-30' })), /fecha/i);
  assert.throws(() => validateFact(fact({ hasta: '2026-09-01' })), /termina antes/i);
});

test('direction facts are always restricted, whatever the source said', () => {
  assert.equal(validateFact(fact({ proposito: 'direccion', sensibilidad: 'normal' })).sensitivity, 'restringida');
});

test('credentials and personal data never enter the agency memory', () => {
  for (const afirmacion of ['La contraseña: Brain2026*', 'Escríbele a gerencia@cliente.com', 'Cuenta 1234567890 de Bancolombia', 'password = abc123']) {
    assert.throws(() => validateFact(fact({ afirmacion })), /credencial|dato personal/i, afirmacion);
  }
});

test('the digest changes with the content, not with the order of keys', () => {
  const a = factDigest(validateFact(fact()));
  assert.equal(a, factDigest(validateFact({ ...fact() })));
  assert.notEqual(a, factDigest(validateFact(fact({ afirmacion: 'Otra cosa distinta.' }))));
});

test('who sees what: operation and editorial for admin and PM; money, sales and direction by their own permission', () => {
  const p = factAccess(pm);
  assert.deepEqual([...p.purposes].sort(), ['editorial', 'operacion', 'personas']);
  assert.deepEqual(p.restricted, []);
  const a = factAccess(admin);
  assert.deepEqual([...a.purposes].sort(), ['comercial', 'direccion', 'editorial', 'financiero', 'operacion', 'personas']);
  assert.deepEqual([...a.restricted].sort(), ['comercial', 'direccion', 'editorial', 'financiero', 'operacion', 'personas']);
  const pmWithMoney = factAccess({ ...pm, modulePermissions: { ...pm.modulePermissions, financiero: true, crm: true } });
  assert.ok(pmWithMoney.purposes.includes('financiero') && pmWithMoney.purposes.includes('comercial'));
  assert.deepEqual(pmWithMoney.restricted, ['financiero']);
  assert.deepEqual(factAccess({ ...pm, modulePermissions: { parrillas: true } }).purposes, [], 'Bria off: nothing');
  assert.deepEqual(factAccess({ role: 'EDITOR', modulePermissions: { bria: true } }).purposes, []);
});

test('a restricted fact is visible only when its purpose is allowed restricted', () => {
  const debt = validateFact(fact({ proposito: 'financiero', sensibilidad: 'restringida' }));
  assert.equal(factVisible(debt, factAccess(admin)), true);
  assert.equal(factVisible(debt, factAccess(pm)), false);
  assert.equal(factVisible(validateFact(fact()), factAccess(pm)), true);
});

test('a correction or confirmation in the human message is explicit; a question is not', () => {
  for (const text of ['No, eso ya cambió: Caribbean terminó en agosto', 'Te corrijo, Endova paga 2.992.000', 'Eso está mal', 'Sí, corrígelo en la memoria', 'Confirmo que sigue vigente', 'Recuerda que Promo Group no quiere tendencias', 'En realidad el contrato es con la Corporación', 'Ya no trabajamos con ellos']) {
    assert.equal(correctionIntent(text), true, text);
  }
  for (const text of ['¿Cómo va Aristea este mes?', 'Prepárame los pendientes de Endova', 'Resume la parrilla']) {
    assert.equal(correctionIntent(text), false, text);
  }
});

test('importing never overwrites what the team confirmed and never resurrects a retired fact', () => {
  const incoming = [validateFact(fact()), validateFact(fact({ id: 'aristea-008', afirmacion: 'Nuevo hecho.' })), validateFact(fact({ id: 'aristea-009', afirmacion: 'Cambiado.' })), validateFact(fact({ id: 'aristea-010', afirmacion: 'Retirado.' }))];
  const existing = [
    { id: 'aristea-007', origin: 'LECTURA', status: 'SUPERSEDED', digest: 'old' },
    { id: 'aristea-009', origin: 'LECTURA', status: 'ACTIVE', digest: 'old' },
    { id: 'aristea-010', origin: 'LECTURA', status: 'RETIRED', digest: 'old' }
  ];
  const plan = planFactImport(existing, incoming);
  assert.deepEqual(plan.create.map((f) => f.id), ['aristea-008']);
  assert.deepEqual(plan.update.map((f) => f.id), ['aristea-009']);
  assert.deepEqual(plan.keep.map((f) => f.id).sort(), ['aristea-007', 'aristea-010']);
  assert.deepEqual(planFactImport([{ id: 'aristea-009', origin: 'LECTURA', status: 'ACTIVE', digest: factDigest(incoming[2]) }], [incoming[2]]).unchanged.map((f) => f.id), ['aristea-009']);
});

test('client links: exact native name, never a guess between two live candidates; overrides win', () => {
  const clients = [
    { id: 'c1', name: 'Aristea', slug: 'aristea', isArchived: false },
    { id: 'c2', name: 'Promo Group / Endova', slug: 'promo-group-endova', isArchived: false },
    { id: 'c3', name: 'Promo Group / Endova', slug: 'promo-group-endova-old', isArchived: true },
    { id: 'c4', name: 'Gobernación de Bolívar', slug: 'gobernacion', isArchived: false },
    { id: 'c5', name: 'Gobernacion de Bolivar', slug: 'gobernacion-2', isArchived: false }
  ];
  const links = resolveClientLinks([
    { entidad: 'Aristea', fichaNativa: 'Aristea' },
    { entidad: 'Endova', fichaNativa: 'Promo Group / Endova' },
    { entidad: 'Gobernación de Bolívar', fichaNativa: 'Gobernación de Bolívar' },
    { entidad: 'Mari Colón Kodesh', fichaNativa: null },
    { entidad: 'Wine & Wonder', fichaNativa: 'FoobeSpain' }
  ], clients, { 'Wine & Wonder': 'aristea' });
  assert.equal(links.get('Aristea').clientId, 'c1');
  assert.equal(links.get('Endova').clientId, 'c2', 'live ficha preferred over archived twin');
  assert.equal(links.get('Gobernación de Bolívar').clientId, null);
  assert.match(links.get('Gobernación de Bolívar').reason, /varias/i);
  assert.equal(links.get('Mari Colón Kodesh').clientId, null);
  assert.equal(links.get('Wine & Wonder').clientId, 'c1', 'override by slug');
});

test('a fact is presented to the model with its certainty in words and its source, never internal keys', () => {
  const shown = presentFact({ ...validateFact(fact()), origin: 'LECTURA', status: 'ACTIVE', actorName: 'Lectura del negocio', asOf: '2026-10-07' });
  assert.equal(shown.certeza, CERTAINTY_WORDS.NO_CONCLUYENTE);
  assert.equal(shown.origen, 'Lectura del negocio (7 de octubre de 2026)');
  assert.match(shown.fuente, /Contratos/);
  assert.equal('sensitivity' in shown, false);
  const team = presentFact({ ...validateFact(fact({ certeza: 'CONFIRMADO' })), origin: 'EQUIPO', status: 'ACTIVE', actorName: 'Rodny', updatedAt: '2026-10-09T15:00:00Z' });
  assert.equal(team.origen, 'Confirmado por Rodny el 9 de octubre de 2026');
});
