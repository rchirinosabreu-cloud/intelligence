import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La auditoría de código muerto (docs/AUDITORIA_CODIGO.md) solo protege si la CI la corre
// y si cada excepción explica por qué existe.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const config = readFileSync('knip.jsonc', 'utf8');

test('package.json expone la auditoría con sus dos pasadas', () => {
  const script = pkg.scripts['audit:dead-code'];
  assert.ok(script, 'falta el script audit:dead-code');
  assert.match(script, /knip[^&]*--include files,dependencies/);
  assert.match(script, /knip --production --include files/);
  assert.ok(pkg.devDependencies.knip, 'knip debe ser dependencia de desarrollo');
});

test('la integración continua corre la auditoría', () => {
  assert.match(ci, /run: npm run audit:dead-code\s*$/m);
});

test('cada exclusión de knip lleva un comentario con su motivo', () => {
  for (const key of ['ignoreFiles', 'ignore', 'ignoreDependencies', 'ignoreBinaries']) {
    const block = config.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`));
    if (!block) continue;
    const lines = block[1].split('\n').map(line => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      if (!line.startsWith('"')) return;
      const previous = lines.slice(0, index).reverse().find(other => !other.startsWith('"'));
      assert.ok(previous?.startsWith('//'), `${key}: ${line} necesita un comentario con su motivo`);
    });
  }
});
