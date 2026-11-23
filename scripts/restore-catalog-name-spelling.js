// Devuelve a los servicios del catálogo la escritura curada de data/service_catalog_2026.json
// («Auditoría de marca», «Administración de Meta Ads», «Marca Plan Básico»). La base los tenía con mayúscula en
// cada palabra por la regla anterior («Auditoría De Marca»), y el equipo comercial pidió el 23 de noviembre de 2026
// escribirlos como en español. Solo cambia mayúsculas y minúsculas de nombres que ya coinciden con el catálogo
// curado; los servicios creados a mano y las propuestas ya guardadas no se tocan. Corre en cada arranque, es
// idempotente y nunca detiene el servidor.
//   node scripts/restore-catalog-name-spelling.js --dry-run
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveCatalogIdentity } from '../src/services/serviceCatalogImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, '../data/service_catalog_2026.json');
const fold = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CO');

export const restoreCatalogNameSpelling = async (database, { catalog = [], dryRun = false } = {}) => {
  const curated = new Map();
  for (const { name } of catalog) {
    curated.set(fold(name), name);
    curated.set(fold(resolveCatalogIdentity(name)), name);
  }
  const services = await database.serviceCatalog.findMany({ select: { id: true, name: true } });
  const taken = new Set(services.map((service) => service.name));
  const changes = [];
  for (const service of services) {
    const next = curated.get(fold(service.name));
    // Solo se corrige la escritura: si el nombre curado es otro texto, o ya existe en otro servicio, se deja igual.
    if (!next || next === service.name || fold(next) !== fold(service.name) || taken.has(next)) continue;
    taken.add(next);
    changes.push({ id: service.id, before: service.name, after: next });
  }
  if (!dryRun && changes.length) {
    await database.$transaction(async (tx) => {
      for (const change of changes) await tx.serviceCatalog.update({ where: { id: change.id }, data: { name: change.after } });
    }, { timeout: 60_000 });
  }
  return { total: services.length, updated: dryRun ? 0 : changes.length, changes };
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const tag = '[CatalogNames]';
  const dryRun = process.argv.includes('--dry-run');
  let prisma;
  try {
    ({ default: prisma } = await import('../src/lib/prisma.js'));
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const result = await restoreCatalogNameSpelling(prisma, { catalog, dryRun });
    for (const change of result.changes) console.log(`${tag} ${change.before} -> ${change.after}`);
    console.log(`${tag} ${result.changes.length} de ${result.total} nombres ${dryRun ? 'cambiarían (simulación)' : 'corregidos'}.`);
  } catch (error) {
    // Un fallo aquí no debe impedir que la plataforma arranque.
    console.error(`${tag} No se pudo revisar la escritura de los nombres:`, error?.message || error);
  } finally {
    await prisma?.$disconnect?.();
  }
}
