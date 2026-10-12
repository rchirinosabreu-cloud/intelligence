// Inventario de licencias de las dependencias de producción.
//
//   npm run licenses          # reescribe docs/INVENTARIO_DE_LICENCIAS.md y verifica la política
//   npm run licenses:check    # solo verifica (lo corre CI); no escribe nada
//
// Lee package-lock.json, no la red ni una dependencia nueva: npm ya anota ahí la
// licencia de cada paquete. Si un paquete no la anota, se busca en su package.json
// de node_modules (campo «license» o el antiguo «licenses»).
//
// Cuenta todo lo que no es de desarrollo, incluidos los binarios opcionales que npm
// instala según el sistema operativo: el inventario dice lo que puede llegar a
// producción, no solo lo que hay en este equipo.
//
// La política vive en scripts/license-policy.json:
//   - «permitidas»: licencias permisivas (MIT, Apache-2.0, BSD…).
//   - «aclaraciones»: paquetes que no declaran su licencia en SPDX, leídos a mano.
//   - «pendientesDeDecision»: licencias fuera de la lista que ya estaban, anotadas
//     con su motivo para que una persona decida. No cuentan como aprobadas.
// Cualquier otra licencia (GPL, AGPL, LGPL, MPL, desconocida…) hace fallar la verificación.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCKFILE = path.join(ROOT, 'package-lock.json');
const POLICY_FILE = path.join(ROOT, 'scripts', 'license-policy.json');
const INVENTORY_FILE = path.join(ROOT, 'docs', 'INVENTARIO_DE_LICENCIAS.md');

const UNKNOWN = 'DESCONOCIDA';

function declaredLicense(entry) {
  if (!entry) return null;
  if (typeof entry.license === 'string') return entry.license;
  if (entry.license && typeof entry.license.type === 'string') return entry.license.type;
  if (Array.isArray(entry.licenses) && entry.licenses.length) {
    const types = entry.licenses.map((item) => (typeof item === 'string' ? item : item?.type)).filter(Boolean);
    if (types.length) return types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
  }
  return null;
}

function readInstalledManifest(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, lockPath, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function productionPackages(lock, { readManifest = readInstalledManifest } = {}) {
  const seen = new Map();
  for (const [lockPath, entry] of Object.entries(lock.packages || {})) {
    if (!lockPath || entry.link) continue;
    if (entry.dev || entry.devOptional) continue;
    const name = entry.name || lockPath.slice(lockPath.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const version = entry.version || '';
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    const license = declaredLicense(entry) || declaredLicense(readManifest(lockPath)) || UNKNOWN;
    seen.set(key, { name, version, license, optional: Boolean(entry.optional) });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

// Evalúa una expresión SPDX: «A OR B» vale si alguna alternativa es permisiva;
// «A AND B» exige todas; «A WITH excepción» se juzga por A.
export function isPermissiveExpression(expression, allowed) {
  const tokens = String(expression).replace(/[()]/g, (paren) => ` ${paren} `).trim().split(/\s+/).filter(Boolean);
  let index = 0;
  const allowedSet = new Set(allowed);

  function parseOr() {
    let result = parseAnd();
    while (tokens[index]?.toUpperCase() === 'OR') {
      index += 1;
      const right = parseAnd();
      result = result || right;
    }
    return result;
  }
  function parseAnd() {
    let result = parseAtom();
    while (tokens[index]?.toUpperCase() === 'AND') {
      index += 1;
      const right = parseAtom();
      result = result && right;
    }
    return result;
  }
  function parseAtom() {
    const token = tokens[index];
    index += 1;
    if (token === '(') {
      const result = parseOr();
      if (tokens[index] !== ')') throw new Error(`Paréntesis sin cerrar en «${expression}»`);
      index += 1;
      return result;
    }
    if (!token || token === ')' || /^(AND|OR|WITH)$/i.test(token)) {
      throw new Error(`Expresión de licencia ilegible: «${expression}»`);
    }
    if (tokens[index]?.toUpperCase() === 'WITH') index += 2;
    return allowedSet.has(token);
  }

  try {
    const result = parseOr();
    return index === tokens.length ? result : false;
  } catch {
    return false;
  }
}

function matchesPattern(pattern, name) {
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name;
}

export function classifyPackages(packages, policy) {
  const allowed = policy.permitidas || [];
  const clarifications = policy.aclaraciones || {};
  const pending = Object.entries(policy.pendientesDeDecision || {}).filter(([key]) => !key.startsWith('$'));
  return packages.map((pkg) => {
    const clarification = clarifications[`${pkg.name}@${pkg.version}`];
    const effective = clarification?.licencia || pkg.license;
    if (effective !== UNKNOWN && isPermissiveExpression(effective, allowed)) {
      return { ...pkg, effective, status: clarification ? 'aclarada' : 'permitida' };
    }
    const decision = pending.find(([pattern, rule]) => matchesPattern(pattern, pkg.name) && rule.licencia === pkg.license);
    if (decision) return { ...pkg, effective, status: 'pendiente', motivo: decision[1].motivo };
    return { ...pkg, effective, status: 'rechazada' };
  });
}

function escapeCell(text) {
  return String(text).replace(/\|/g, '\\|');
}

export function renderInventory(classified) {
  const counts = new Map();
  for (const pkg of classified) counts.set(pkg.effective, (counts.get(pkg.effective) || 0) + 1);
  const summary = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const pending = classified.filter((pkg) => pkg.status === 'pendiente');
  const rejected = classified.filter((pkg) => pkg.status === 'rechazada');

  const lines = [
    '# Inventario de licencias',
    '',
    'Dependencias de producción de la plataforma (lo que no es de desarrollo en `package-lock.json`),',
    'con la licencia que declara cada paquete. **No se edita a mano:** se genera con `npm run licenses`',
    'y la política que lo verifica está en `scripts/license-policy.json` (AGENTS.md, sección 21).',
    '',
    'Incluye los binarios opcionales que npm instala según el sistema operativo (marcados «opcional»):',
    'en producción (Linux) solo se instala el que corresponde.',
    '',
    `**${classified.length} paquetes.**`,
    '',
    '## Resumen por licencia',
    '',
    '| Licencia | Paquetes |',
    '| --- | ---: |',
    ...summary.map(([license, count]) => `| ${escapeCell(license)} | ${count} |`),
    '',
  ];

  if (pending.length || rejected.length) {
    lines.push('## Fuera de la lista permitida', '');
    lines.push('Estas licencias no son permisivas y **esperan una decisión**; no se dan por aprobadas.', '');
    lines.push('| Paquete | Versión | Licencia | Estado | Motivo |', '| --- | --- | --- | --- | --- |');
    for (const pkg of [...rejected, ...pending]) {
      const status = pkg.status === 'pendiente' ? 'Pendiente de decisión' : 'No permitida';
      lines.push(`| ${escapeCell(pkg.name)} | ${pkg.version} | ${escapeCell(pkg.license)} | ${status} | ${escapeCell(pkg.motivo || '—')} |`);
    }
    lines.push('');
  }

  lines.push('## Todos los paquetes', '');
  lines.push('| Paquete | Versión | Licencia | Notas |', '| --- | --- | --- | --- |');
  for (const pkg of classified) {
    const notes = [];
    if (pkg.optional) notes.push('opcional');
    if (pkg.status === 'aclarada') notes.push(`declara «${pkg.license}»`);
    if (pkg.status === 'pendiente') notes.push('pendiente de decisión');
    if (pkg.status === 'rechazada') notes.push('no permitida');
    lines.push(`| ${escapeCell(pkg.name)} | ${pkg.version} | ${escapeCell(pkg.effective)} | ${escapeCell(notes.join(', '))} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const lock = JSON.parse(fs.readFileSync(LOCKFILE, 'utf8'));
  const policy = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8'));
  const classified = classifyPackages(productionPackages(lock), policy);
  const inventory = renderInventory(classified);

  if (checkOnly) {
    const current = fs.existsSync(INVENTORY_FILE) ? fs.readFileSync(INVENTORY_FILE, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== inventory) {
      // Solo avisa: una actualización de Dependabot cambia versiones y no puede
      // regenerar el archivo. Lo que bloquea es la política, no el documento.
      console.log('::warning::docs/INVENTARIO_DE_LICENCIAS.md no está al día; ejecuta `npm run licenses` y súbelo.');
    }
  } else {
    fs.writeFileSync(INVENTORY_FILE, inventory);
    console.log(`Inventario escrito en ${path.relative(ROOT, INVENTORY_FILE)} (${classified.length} paquetes).`);
  }

  for (const pkg of classified.filter((item) => item.status === 'pendiente')) {
    console.log(`Pendiente de decisión: ${pkg.name}@${pkg.version} (${pkg.license})`);
  }
  const rejected = classified.filter((pkg) => pkg.status === 'rechazada');
  if (rejected.length) {
    console.error(`\n${rejected.length} dependencia(s) de producción con una licencia fuera de la lista permitida:`);
    for (const pkg of rejected) console.error(`  - ${pkg.name}@${pkg.version}: ${pkg.license}`);
    console.error('\nCámbiala por una alternativa con licencia permisiva o pide una decisión (scripts/license-policy.json).');
    process.exitCode = 1;
    return;
  }
  console.log('Todas las licencias de producción están permitidas o anotadas para decisión.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
