// Gives every catalog description the same structure (bold labels, one bullet
// per item) so a service lands in a quotation already formatted.
//
//   node scripts/format-service-catalog-descriptions.js --json       # rewrite data/service_catalog_2026.json only
//   node scripts/format-service-catalog-descriptions.js --dry-run    # show what would change in the database
//   node scripts/format-service-catalog-descriptions.js              # apply to the database
//
// For services that exist in the JSON (matched by name) the curated JSON text
// wins, so hand-made adjustments there reach the database; anything else is
// formatted from its current text. Running it twice changes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formatCatalogDescription } from '../src/services/serviceCatalogDescription.js';
import { resolveCatalogIdentity } from '../src/services/serviceCatalogImport.js';
import { normalizeQuotationItemTitle } from '../src/services/quotationDomainService.js';

// Stored names are title-cased by normalize-quotation-titles ("Auditoría De
// Marca") while the JSON keeps sentence case, so both sides are normalized.
const identity = (name) => normalizeQuotationItemTitle(resolveCatalogIdentity(String(name || '').trim()));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const catalogPath = path.join(__dirname, '../data/service_catalog_2026.json');

export const readCatalogFile = (filePath = catalogPath) => (fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : []);

export const formatCatalogFile = (filePath = catalogPath) => {
  const services = readCatalogFile(filePath);
  let changed = 0;
  for (const service of services) {
    const next = formatCatalogDescription(service.description);
    if (next !== service.description) { service.description = next; changed += 1; }
  }
  fs.writeFileSync(filePath, `${JSON.stringify(services, null, 2)}\n`, 'utf8');
  return { total: services.length, changed };
};

export const formatStoredCatalogDescriptions = async (database, { dryRun = false, catalog = [] } = {}) => {
  const curated = new Map(catalog.map((service) => [identity(service.name), service.description]));
  const services = await database.serviceCatalog.findMany({ select: { id: true, name: true, description: true }, orderBy: { name: 'asc' } });
  const changes = services
    .map((service) => ({ ...service, next: formatCatalogDescription(curated.get(identity(service.name)) ?? service.description) }))
    .filter((service) => service.next !== service.description)
    .map(({ id, name, description, next }) => ({ id, name, before: description, after: next }));

  if (!dryRun && changes.length) {
    await database.$transaction(async (tx) => {
      for (const change of changes) {
        await tx.serviceCatalog.update({ where: { id: change.id }, data: { description: change.after } });
      }
    }, { timeout: 60_000 });
  }
  return { total: services.length, updated: dryRun ? 0 : changes.length, changes };
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const flags = new Set(process.argv.slice(2));
  const tag = '[CatalogDescriptions]';
  if (flags.has('--json')) {
    const result = formatCatalogFile();
    console.log(`${tag} ${result.changed} de ${result.total} descripciones reescritas en ${path.relative(process.cwd(), catalogPath)}.`);
  } else {
    const dryRun = flags.has('--dry-run');
    const { default: prisma } = await import('../src/lib/prisma.js');
    try {
      const result = await formatStoredCatalogDescriptions(prisma, { dryRun, catalog: readCatalogFile() });
      for (const change of result.changes) {
        console.log(`\n— ${change.name}`);
        if (flags.has('--verbose')) console.log(change.after.split('\n').map((line) => `    ${line}`).join('\n'));
      }
      console.log(`\n${tag} ${result.changes.length} de ${result.total} servicios ${dryRun ? 'cambiarían' : 'actualizados'}${dryRun ? ' (simulación, nada escrito)' : ''}.`);
    } catch (error) {
      console.error(`${tag} Error:`, error);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  }
}
