// Puerta de vulnerabilidades de las dependencias de producción (la corre CI).
//
//   npm run audit:security
//
// Ejecuta `npm audit --omit=dev --json` y falla si aparece un aviso de severidad
// alta o crítica. La única salida es arreglarlo (actualizar la dependencia) o
// anotarlo en scripts/security-audit-exceptions.json con su motivo y una fecha
// «revisarAntesDe»: pasada esa fecha la excepción deja de valer y la puerta vuelve
// a fallar. Así nada queda aceptado para siempre por olvido.
//
// Los avisos moderados y bajos se listan, pero no bloquean. Detalle: AGENTS.md, sección 21.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCEPTIONS_FILE = path.join(ROOT, 'scripts', 'security-audit-exceptions.json');
const BLOCKING = new Set(['high', 'critical']);

function runAudit() {
  try {
    return execSync('npm audit --omit=dev --json', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    // npm audit sale con código 1 cuando encuentra vulnerabilidades: el JSON sigue en stdout.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

function advisoryId(via) {
  const match = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.exec(via.url || '');
  return match ? match[0] : String(via.source);
}

// Un aviso aparece una vez por paquete afectado; se agrupan por identificador.
export function collectAdvisories(report) {
  const advisories = new Map();
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities || {})) {
    for (const via of vulnerability.via || []) {
      if (typeof via === 'string') continue;
      const id = advisoryId(via);
      if (!advisories.has(id)) {
        advisories.set(id, { id, severity: via.severity, title: via.title, url: via.url, packages: new Set() });
      }
      advisories.get(id).packages.add(name);
    }
  }
  return [...advisories.values()].map((advisory) => ({ ...advisory, packages: [...advisory.packages].sort() }));
}

export function evaluateAdvisories(advisories, exceptions, today) {
  const blocking = [];
  const excepted = [];
  const expired = [];
  for (const advisory of advisories.filter((item) => BLOCKING.has(item.severity))) {
    const exception = exceptions[advisory.id];
    if (!exception) blocking.push(advisory);
    else if (!exception.revisarAntesDe || exception.revisarAntesDe < today) expired.push({ ...advisory, exception });
    else excepted.push({ ...advisory, exception });
  }
  const present = new Set(advisories.map((item) => item.id));
  const unused = Object.keys(exceptions).filter((id) => !id.startsWith('$') && !present.has(id));
  return { blocking, excepted, expired, unused };
}

function bogotaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function main() {
  const report = JSON.parse(runAudit());
  if (report.error) {
    console.error(`npm audit no pudo consultar los avisos: ${report.error.summary || report.error.code}`);
    process.exitCode = 1;
    return;
  }
  const exceptions = JSON.parse(fs.readFileSync(EXCEPTIONS_FILE, 'utf8'));
  const advisories = collectAdvisories(report);
  const { blocking, excepted, expired, unused } = evaluateAdvisories(advisories, exceptions, bogotaToday());

  const counts = report.metadata?.vulnerabilities || {};
  console.log(`Dependencias de producción: ${counts.critical || 0} críticas, ${counts.high || 0} altas, ${counts.moderate || 0} moderadas, ${counts.low || 0} bajas (paquetes afectados).`);

  for (const item of excepted) {
    console.log(`::warning::Excepción vigente hasta ${item.exception.revisarAntesDe}: ${item.id} (${item.packages.join(', ')}) — ${item.title}`);
  }
  for (const id of unused) {
    console.log(`::notice::La excepción ${id} ya no hace falta; quítala de scripts/security-audit-exceptions.json.`);
  }

  const failures = [...blocking, ...expired];
  if (failures.length) {
    console.error(`\n${failures.length} aviso(s) de severidad alta o crítica sin resolver:`);
    for (const item of blocking) {
      console.error(`  - [${item.severity}] ${item.id} en ${item.packages.join(', ')}: ${item.title}\n    ${item.url}`);
    }
    for (const item of expired) {
      console.error(`  - [${item.severity}] ${item.id} en ${item.packages.join(', ')}: la excepción venció el ${item.exception.revisarAntesDe}.`);
    }
    console.error('\nActualiza la dependencia (npm audit fix, sin --force) o, si no se puede todavía, anota el motivo en scripts/security-audit-exceptions.json.');
    process.exitCode = 1;
    return;
  }
  console.log('Sin avisos altos ni críticos pendientes en producción.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
