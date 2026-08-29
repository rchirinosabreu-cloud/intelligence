import { pathToFileURL } from 'node:url';
import prisma from '../src/lib/prisma.js';
import { normalizeQuotationItemTitle } from '../src/services/quotationDomainService.js';

export const normalizeStoredQuotationTitles = async (database = prisma) => {
  const [services, quotations] = await Promise.all([
    database.serviceCatalog.findMany({ select: { id: true, name: true } }),
    database.quotation.findMany({ select: { id: true, items: true } })
  ]);

  const normalizedServiceNames = services.map(({ id, name }) => ({
    id,
    currentName: name,
    normalizedName: normalizeQuotationItemTitle(name)
  }));
  const collisions = new Map();
  normalizedServiceNames.forEach(({ id, normalizedName }) => {
    if (!collisions.has(normalizedName)) collisions.set(normalizedName, []);
    collisions.get(normalizedName).push(id);
  });
  const duplicate = [...collisions.entries()].find(([, ids]) => ids.length > 1);
  if (duplicate) {
    throw new Error(`La normalización produciría un nombre duplicado: ${duplicate[0]}`);
  }

  const serviceUpdates = normalizedServiceNames.filter(({ currentName, normalizedName }) => (
    currentName !== normalizedName
  ));
  const quotationUpdates = quotations.flatMap((quotation) => {
    if (!Array.isArray(quotation.items)) return [];
    const items = quotation.items.map((item) => ({
      ...item,
      name: normalizeQuotationItemTitle(item?.name)
    }));
    const changed = items.some((item, index) => item.name !== quotation.items[index]?.name);
    return changed ? [{ id: quotation.id, items }] : [];
  });

  await database.$transaction(async (tx) => {
    for (const service of serviceUpdates) {
      await tx.serviceCatalog.update({
        where: { id: service.id },
        data: { name: service.normalizedName }
      });
    }
    for (const quotation of quotationUpdates) {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { items: quotation.items }
      });
    }
  }, { timeout: 60_000 });

  return {
    updatedServices: serviceUpdates.length,
    updatedQuotations: quotationUpdates.length
  };
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  normalizeStoredQuotationTitles()
    .then((result) => console.log('[QuotationTitles] Normalización completada:', result))
    .catch((error) => {
      console.error('[QuotationTitles] Error:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
