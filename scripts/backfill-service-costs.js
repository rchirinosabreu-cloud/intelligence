import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../src/lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const parseCsvLine = (line) => {
  const columns = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === ',' && !insideQuotes) {
      columns.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  columns.push(current.trim());
  return columns;
};

const parseCatalogMoney = (value) => {
  const normalized = String(value || '')
    .replace(/[$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const main = async () => {
  const csvPath = path.join(__dirname, '..', 'data', 'tarifario_2026.csv');
  const csv = await readFile(csvPath, 'utf8');
  const costByName = new Map();

  csv.split(/\r?\n/).slice(4).forEach((line) => {
    if (!line.trim()) return;
    const columns = parseCsvLine(line);
    const name = String(columns[1] || '').trim();
    const cost = parseCatalogMoney(columns[3]);
    if (name && cost !== null) costByName.set(name, cost);
  });

  const services = await prisma.serviceCatalog.findMany({
    where: { costo_real_estimado: null },
    select: { id: true, name: true }
  });
  const updates = services
    .filter((service) => costByName.has(service.name))
    .map((service) => prisma.serviceCatalog.update({
      where: { id: service.id },
      data: { costo_real_estimado: costByName.get(service.name) }
    }));

  if (updates.length > 0) await prisma.$transaction(updates);
  console.log(`[CatalogCostBackfill] ${updates.length} costos completados; ${services.length - updates.length} sin coincidencia.`);
};

main()
  .catch((error) => {
    console.error('[CatalogCostBackfill] Error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
