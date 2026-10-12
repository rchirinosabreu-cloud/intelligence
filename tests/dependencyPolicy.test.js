import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  classifyPackages,
  isPermissiveExpression,
  productionPackages,
} from '../scripts/license-inventory.mjs';
import { collectAdvisories, evaluateAdvisories } from '../scripts/security-audit-gate.mjs';

const ALLOWED = ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause', 'Zlib'];

test('una expresión SPDX vale si alguna alternativa es permisiva y todas las partes de un AND lo son', () => {
  assert.equal(isPermissiveExpression('MIT', ALLOWED), true);
  assert.equal(isPermissiveExpression('(MIT OR GPL-3.0-or-later)', ALLOWED), true);
  assert.equal(isPermissiveExpression('(MPL-2.0 OR Apache-2.0)', ALLOWED), true);
  assert.equal(isPermissiveExpression('(MIT AND Zlib)', ALLOWED), true);
  assert.equal(isPermissiveExpression('Apache-2.0 AND LGPL-3.0-or-later', ALLOWED), false);
  assert.equal(isPermissiveExpression('GPL-3.0', ALLOWED), false);
  assert.equal(isPermissiveExpression('MPL-2.0', ALLOWED), false);
  assert.equal(isPermissiveExpression('Apache-2.0 WITH LLVM-exception', ALLOWED), true);
  assert.equal(isPermissiveExpression('(MIT', ALLOWED), false);
  assert.equal(isPermissiveExpression('', ALLOWED), false);
});

test('el inventario cuenta producción y opcionales, nunca lo de desarrollo', () => {
  const lock = {
    packages: {
      '': { name: 'raiz' },
      'node_modules/a': { version: '1.0.0', license: 'MIT' },
      'node_modules/b': { version: '2.0.0', license: 'GPL-3.0', dev: true },
      'node_modules/c': { version: '3.0.0', license: 'ISC', devOptional: true },
      'node_modules/d': { version: '4.0.0', license: 'Apache-2.0', optional: true },
      'node_modules/x/node_modules/a': { version: '1.0.0', license: 'MIT' },
      'node_modules/sin-licencia': { version: '0.1.0' },
    },
  };
  const packages = productionPackages(lock, { readManifest: () => null });
  assert.deepEqual(packages.map((pkg) => `${pkg.name}@${pkg.version}`), ['a@1.0.0', 'd@4.0.0', 'sin-licencia@0.1.0']);
  assert.equal(packages.find((pkg) => pkg.name === 'd').optional, true);
  assert.equal(packages.find((pkg) => pkg.name === 'sin-licencia').license, 'DESCONOCIDA');
});

test('una licencia fuera de la lista se rechaza salvo que esté anotada, y solo con esa misma licencia', () => {
  const policy = {
    permitidas: ALLOWED,
    aclaraciones: { 'viejo@1.0.0': { licencia: 'MIT' } },
    pendientesDeDecision: { '@img/sharp-libvips-*': { licencia: 'LGPL-3.0-or-later', motivo: 'binario' } },
  };
  const result = classifyPackages([
    { name: 'a', version: '1.0.0', license: 'MIT' },
    { name: 'viejo', version: '1.0.0', license: 'BSD' },
    { name: 'viejo', version: '2.0.0', license: 'BSD' },
    { name: '@img/sharp-libvips-linux-x64', version: '1.3.4', license: 'LGPL-3.0-or-later' },
    { name: '@img/sharp-libvips-linux-x64', version: '2.0.0', license: 'GPL-3.0' },
    { name: 'nuevo', version: '1.0.0', license: 'AGPL-3.0' },
    { name: 'misterio', version: '1.0.0', license: 'DESCONOCIDA' },
  ], policy);
  assert.deepEqual(result.map((pkg) => pkg.status), [
    'permitida', 'aclarada', 'rechazada', 'pendiente', 'rechazada', 'rechazada', 'rechazada',
  ]);
});

test('la política real de la plataforma no deja ninguna licencia de producción sin revisar', () => {
  const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const policy = JSON.parse(fs.readFileSync(new URL('../scripts/license-policy.json', import.meta.url), 'utf8'));
  const rejected = classifyPackages(productionPackages(lock), policy).filter((pkg) => pkg.status === 'rechazada');
  assert.deepEqual(rejected.map((pkg) => `${pkg.name}@${pkg.version} ${pkg.license}`), []);
});

const AUDIT_REPORT = {
  vulnerabilities: {
    xlsx: { via: [{ source: 1, severity: 'high', title: 'Prototype Pollution', url: 'https://github.com/advisories/GHSA-4r6h-8v6p-xvw6' }] },
    nodemailer: { via: [
      { source: 2, severity: 'high', title: 'DoS', url: 'https://github.com/advisories/GHSA-v53p-9fqp-m79j' },
      { source: 3, severity: 'moderate', title: 'Menor', url: 'https://github.com/advisories/GHSA-8vvx-rff5-p5rq' },
    ] },
    braces: { via: [{ source: 4, severity: 'critical', title: 'Grave', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }] },
    micromatch: { via: ['braces'] },
  },
};

test('la puerta bloquea un aviso alto o crítico sin excepción y deja pasar los moderados', () => {
  const advisories = collectAdvisories(AUDIT_REPORT);
  assert.equal(advisories.length, 4);
  const result = evaluateAdvisories(advisories, {
    'GHSA-4r6h-8v6p-xvw6': { revisarAntesDe: '2026-11-30' },
  }, '2026-10-12');
  assert.deepEqual(result.blocking.map((item) => item.id).sort(), ['GHSA-v53p-9fqp-m79j', 'GHSA-vfj7-8cjw-p6xm']);
  assert.deepEqual(result.excepted.map((item) => item.id), ['GHSA-4r6h-8v6p-xvw6']);
  assert.deepEqual(result.expired, []);
});

test('una excepción vencida o sin fecha vuelve a bloquear, y una que sobra se avisa', () => {
  const advisories = collectAdvisories(AUDIT_REPORT);
  const result = evaluateAdvisories(advisories, {
    'GHSA-4r6h-8v6p-xvw6': { revisarAntesDe: '2026-10-11' },
    'GHSA-v53p-9fqp-m79j': {},
    'GHSA-vfj7-8cjw-p6xm': { revisarAntesDe: '2026-10-12' },
    'GHSA-0000-0000-0000': { revisarAntesDe: '2026-12-31' },
  }, '2026-10-12');
  assert.deepEqual(result.expired.map((item) => item.id).sort(), ['GHSA-4r6h-8v6p-xvw6', 'GHSA-v53p-9fqp-m79j']);
  assert.deepEqual(result.excepted.map((item) => item.id), ['GHSA-vfj7-8cjw-p6xm']);
  assert.deepEqual(result.unused, ['GHSA-0000-0000-0000']);
});
