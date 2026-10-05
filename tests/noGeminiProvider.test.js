import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Gemini se retiró por completo (octubre de 2026): OpenAI es el único proveedor de IA.
// Este contrato impide que vuelva código, configuración o un destino de red de Gemini.
// Las pruebas y la documentación histórica quedan fuera: pueden nombrarlo para negarlo.
const RUNTIME_PATHS = ['src', 'server.js', 'scripts', 'lib', 'public', 'prisma', 'package.json', 'Dockerfile', '.env.example', '.github', 'vite.config.js', 'index.html'];
const FORBIDDEN = /gemini|generativelanguage\.googleapis\.com|@google\/genai|@google\/generative-ai/i;

const trackedRuntimeFiles = () => execFileSync('git', ['ls-files', '--', ...RUNTIME_PATHS], { encoding: 'utf8' })
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .filter(file => !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|mp3|mp4)$/i.test(file));

test('ningún archivo de ejecución menciona Gemini ni su API', () => {
  const offenders = trackedRuntimeFiles().filter(file => {
    try {
      return FORBIDDEN.test(readFileSync(file, 'utf8'));
    } catch {
      return false;
    }
  });
  assert.deepEqual(offenders, []);
});

test('package.json no depende de ningún SDK de Google para IA generativa', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.deepEqual(deps.filter(name => /genai|generative-ai/i.test(name)), []);
});
