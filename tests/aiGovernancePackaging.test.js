import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('gobierno de IA se entrega completo con ruta, servicios, pantalla y documentos', () => {
  const files = [
    'src/routes/api/aiGovernance.js', 'src/services/aiGovernanceService.js',
    'src/services/aiGovernanceGate.js', 'src/services/aiEgress.js', 'src/lib/aiGovernance.js',
    'src/components/modules/Governance/GovernanceCenter.jsx',
    'src/components/modules/Governance/GovernanceRecords.jsx',
    'scripts/ensure-ai-governance-schema.js',
    ...['01-programa', '02-politica', '03-incidentes', '04-riesgos', '05-autorizacion', '06-operacion'].map(id => `docs/seguridad-ia/${id}.md`)
  ];
  for (const file of files) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `Falta en el checkout: ${file}`);
  assert.match(read('src/routes/index.js'), /import\s*\{\s*createAiGovernanceRouter\s*\}\s*from\s*['"]\.\/api\/aiGovernance\.js['"]/);
  assert.match(read('src/routes/index.js'), /router\.use\(['"]\/ai-governance['"],\s*createAiGovernanceRouter\(\)\)/);
  assert.match(read('src/App.jsx'), /path="\/gobierno-ia"\s+element=\{<AdminGuard><GovernanceCenter\s*\/>/);
  assert.match(JSON.parse(read('package.json')).scripts.prestart, /ensure-ai-governance-schema\.js/);
  for (const name of ['System', 'Risk', 'Authorization', 'Incident', 'ClientPolicy', 'Event']) {
    assert.match(read('prisma/schema.prisma'), new RegExp(`model AiGovernance${name} \\{`));
  }
});

test('el grafo real del servidor resuelve todos los imports locales, incluido gobierno de IA', async () => {
  // No ejecuta el servidor, no carga .env y no consulta DB ni proveedores.
  const result = await build({ entryPoints: ['server.js'], bundle: true, platform: 'node',
    format: 'esm', packages: 'external', write: false, metafile: true, logLevel: 'silent' });
  for (const file of ['src/routes/api/aiGovernance.js', 'src/services/aiGovernanceService.js', 'src/services/aiEgress.js']) {
    assert.ok(result.metafile.inputs[file], `El servidor no incluye ${file}`);
  }
});
