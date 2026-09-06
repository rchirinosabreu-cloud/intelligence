import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseBriaEvalArgs } from '../scripts/eval-bria-reviews.js';

test('CLI es solo validación por defecto; requiere opt-in para gasto y valida todas las opciones', () => {
  assert.equal(parseBriaEvalArgs([]).live, false);
  assert.equal(parseBriaEvalArgs(['--live', '--repeats', '2', '--max-calls', '8']).repeats, 2);
  assert.throws(() => parseBriaEvalArgs(['--repeats', 'NaN']), /repeticiones/);
  assert.throws(() => parseBriaEvalArgs(['--max-calls', '201']), /presupuesto/);
  assert.throws(() => parseBriaEvalArgs(['--cases', 'missing']), /casos/);
  assert.throws(() => parseBriaEvalArgs(['--variant', 'wrong']), /variante/i);
  assert.throws(() => parseBriaEvalArgs(['--typo']), /Unknown option/);
});

test('validación CLI funciona sin clave de IA ni base de datos y no presenta métricas simuladas', () => {
  const env = { ...process.env, DATABASE_URL: 'postgresql://do-not-contact.invalid/db' };
  delete env.OPENAI_API_KEY;
  const output = execFileSync(process.execPath, ['scripts/eval-bria-reviews.js'], { cwd: process.cwd(), env, encoding: 'utf8', timeout: 10000 });
  const result = JSON.parse(output);
  assert.equal(result.mode, 'VALIDATE_ONLY');
  assert.equal(result.providerCalls, 0);
  assert.equal(result.cases, 36);
  assert.equal(result.modelQualityMeasured, false);
});
