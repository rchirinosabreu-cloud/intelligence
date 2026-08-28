import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import XLSX from 'xlsx';
import {
  calculateCatalogFinalPrice,
  isVariablePriceService,
  mapCatalogCategory
} from '../src/services/serviceCatalogImport.js';

const [, , inputPath, outputPath = 'data/service_catalog_2026.json'] = process.argv;
if (!inputPath) {
  throw new Error('Uso: node scripts/extract-service-catalog.js <tarifario.xlsm> [salida.json]');
}

const workbook = XLSX.readFile(inputPath, { cellFormula: true, cellNF: true });
const sheet = workbook.Sheets.Tarifario;
if (!sheet) throw new Error('El archivo no contiene la hoja Tarifario.');

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
let currentCategory = '';
const services = [];

for (const [index, row] of rows.slice(1).entries()) {
  if (row[0]) currentCategory = String(row[0]).trim();
  const name = String(row[1] || '').trim();
  if (!name) continue;

  const variablePrice = isVariablePriceService(name);
  const cost = variablePrice ? 0 : Number(row[4]);
  const currentPrice = Number(row[3]) || 0;
  const suggestedPrice = Number(row[7]) || 0;

  services.push({
    sourceRow: index + 2,
    category: mapCatalogCategory(currentCategory),
    name,
    description: String(row[2] || '').trim(),
    estimatedCost: cost,
    currentPrice,
    finalPrice: calculateCatalogFinalPrice(cost, { variablePrice }),
    suggestedPrice,
    variablePrice
  });
}

if (services.length !== 114) {
  throw new Error(`Se esperaban 114 servicios y se encontraron ${services.length}.`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(services, null, 2)}\n`, 'utf8');
console.log(`Catálogo extraído: ${services.length} servicios en ${outputPath}`);
