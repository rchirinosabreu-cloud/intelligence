import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCatalogIdentity } from '../src/services/serviceCatalogImport.js';

if (process.env.DATABASE_PUBLIC_URL) process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
const { default: prisma } = await import('../src/lib/prisma.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, '../data/service_catalog_2026.json');

export const syncServiceCatalog = async (database, services) => database.$transaction(async (tx) => {
    const existing = await tx.serviceCatalog.findMany({ select: { id: true, name: true } });
    const existingByName = new Map(existing.map((service) => [service.name, service]));
    const retainedIds = [];

    for (const source of services) {
        const legacyName = resolveCatalogIdentity(source.name);
        const match = existingByName.get(source.name) || existingByName.get(legacyName);
        const data = {
            category: source.category,
            name: source.name,
            description: source.description,
            costo_real_estimado: source.estimatedCost,
            valor_neto_actual: source.currentPrice,
            valor_neto: source.finalPrice,
            precio_comercial_sugerido: source.suggestedPrice,
            precio_variable: source.variablePrice,
            activo: true
        };

        if (match) {
            const updated = await tx.serviceCatalog.update({ where: { id: match.id }, data });
            retainedIds.push(updated.id);
        } else {
            const created = await tx.serviceCatalog.create({ data });
            retainedIds.push(created.id);
        }
    }

    const retired = await tx.serviceCatalog.updateMany({
        where: { id: { notIn: retainedIds }, activo: true },
        data: { activo: false }
    });
    return { retained: retainedIds.length, retired: retired.count };
}, { maxWait: 10000, timeout: 120000 });

const seedCatalog = async () => {
    const services = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const result = await syncServiceCatalog(prisma, services);
    console.log(`Catálogo sincronizado: ${result.retained} servicios vigentes; ${result.retired} anteriores archivados.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    seedCatalog()
        .catch((error) => {
            console.error('Fallo crítico durante la sincronización del catálogo:', error);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
