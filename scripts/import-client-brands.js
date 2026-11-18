import { readFileSync } from 'node:fs';
import prisma from '../src/lib/prisma.js';
import { matchBrandToClient, normalizeBrandInput } from '../src/lib/clientBrand.js';

// Carga las fichas de marca extraídas de los manuales (data/client-brands.json) en la plataforma
// (Rodny, 18 de noviembre de 2026). Simula por defecto: dice qué cliente encontró, qué cargaría y qué falta.
// Solo escribe con `--confirmar IMPORTAR`, y nunca pisa una ficha que ya exista salvo con `--reemplazar`
// (lo escrito por el equipo manda). Contra producción, solo con el OK de Rodny.
//
//   node scripts/import-client-brands.js                      → simula
//   node scripts/import-client-brands.js --confirmar IMPORTAR → escribe las que faltan

const args = process.argv.slice(2);
const confirmed = args.includes('--confirmar') && args[args.indexOf('--confirmar') + 1] === 'IMPORTAR';
const replace = args.includes('--reemplazar');
const file = args.find((arg) => arg.endsWith('.json')) || new URL('../data/client-brands.json', import.meta.url);

const dataset = JSON.parse(readFileSync(file, 'utf8'));
const clients = await prisma.client.findMany({
    where: { isArchived: false },
    select: { id: true, name: true, slug: true, brand: { select: { id: true, revision: true } } }
});

const plan = [];
for (const entry of dataset.brands) {
    const { client, problem } = matchBrandToClient(entry, clients);
    const { brand, problems } = normalizeBrandInput(entry);
    if (!client) { plan.push({ entry, action: 'OMITIR', reason: problem }); continue; }
    if (problems.length) { plan.push({ entry, client, action: 'OMITIR', reason: problems.join(' ') }); continue; }
    if (client.brand && !replace) { plan.push({ entry, client, action: 'OMITIR', reason: 'ya tiene ficha (usa --reemplazar para pisarla)' }); continue; }
    plan.push({ entry, client, brand, action: client.brand ? 'REEMPLAZAR' : 'CREAR' });
}

for (const item of plan) {
    const name = item.client?.name || item.entry.aliases[0];
    const detail = item.brand ? `${item.brand.colors.length} colores, ${item.brand.fonts.length} tipografías` : item.reason;
    console.log(`${item.action.padEnd(10)} ${name} — ${detail}`);
}

if (!confirmed) {
    console.log('\nSimulación: no se escribió nada. Para cargar: --confirmar IMPORTAR');
} else {
    let written = 0;
    for (const item of plan.filter((p) => p.brand)) {
        const data = { ...item.brand, source: String(item.entry.source || 'Importado de manuales').slice(0, 200) };
        if (item.client.brand) {
            await prisma.clientBrand.update({ where: { id: item.client.brand.id }, data: { ...data, revision: { increment: 1 } } });
        } else {
            await prisma.clientBrand.create({ data: { ...data, clientId: item.client.id } });
        }
        written += 1;
    }
    console.log(`\nListo: ${written} fichas escritas.`);
}
await prisma.$disconnect();
