import { readFileSync } from 'node:fs';
import prisma from '../src/lib/prisma.js';
import { clientBrandService } from '../src/services/clientBrandService.js';
import { runBrandImport } from '../src/services/clientBrandImport.js';

// Carga las fichas de marca extraídas de los manuales (data/client-brands.json), con sus logos bajados de Drive
// (Rodny, 18 de noviembre de 2026). Es la misma carga que el botón de la pestaña Marcas. Simula por defecto;
// escribe con `--confirmar IMPORTAR`. Nunca pisa una ficha existente: solo le añade los logos que le falten.
//
//   node scripts/import-client-brands.js                      → simula
//   node scripts/import-client-brands.js --confirmar IMPORTAR → carga

const args = process.argv.slice(2);
const confirmed = args.includes('--confirmar') && args[args.indexOf('--confirmar') + 1] === 'IMPORTAR';
const file = args.find((arg) => arg.endsWith('.json')) || new URL('../data/client-brands.json', import.meta.url);
const dataset = JSON.parse(readFileSync(file, 'utf8'));

const result = await runBrandImport({ db: prisma, service: clientBrandService(), dataset, apply: confirmed });
for (const line of result.report) {
    const detail = line.action === 'OMITIR'
        ? line.reason
        : `${line.colors} colores, ${line.fonts} tipografías, logos: ${confirmed ? `${line.logosAdded} subidos` : `${line.logosNew} por subir`}${line.logosAlready ? ` (${line.logosAlready} ya estaban)` : ''}`;
    console.log(`${line.action.padEnd(10)} ${line.name} — ${detail}`);
    for (const problem of line.logoProblems || []) console.log(`           ! ${problem}`);
}
console.log(confirmed ? '\nListo.' : '\nSimulación: no se escribió nada. Para cargar: --confirmar IMPORTAR');
await prisma.$disconnect();
