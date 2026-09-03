import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DESTRUCTIVE_TOKEN = '346.84 77.17% 49.8%';
const semanticDangerPattern = /(?:text|bg|border|ring|shadow|fill)-destructive|brain-(?:danger|alert)|variant=["']destructive["']/;

const collectJsxFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return collectJsxFiles(path);
  return /\.(?:jsx|tsx)$/.test(entry.name) ? [path] : [];
});

test('Brainstudio defines #E11D48 as the single destructive color in both themes', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const declarations = css.match(/--destructive:\s*346\.84 77\.17% 49\.8%;\s*\/\* #E11D48 \*\//g) || [];

  assert.equal(declarations.length, 2, `Expected the ${DESTRUCTIVE_TOKEN} token in light and dark themes`);
});

test('rendered delete controls consume the semantic destructive token', () => {
  const failures = [];

  for (const file of collectJsxFiles('src')) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<Trash2\b/g)) {
      const context = source.slice(Math.max(0, match.index - 900), match.index + 120);
      if (!semanticDangerPattern.test(context)) failures.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
    }
  }

  assert.deepEqual(failures, [], `Delete controls without the global destructive token:\n${failures.join('\n')}`);
});

test('text-only destructive buttons consume the semantic destructive token', () => {
  const failures = [];

  for (const file of collectJsxFiles('src')) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<(?:button|Button)\b[^>]*>[\s\S]{0,500}?(?:Eliminar|Borrar|Descartar)[\s\S]{0,80}?<\/(?:button|Button)>/g)) {
      if (!semanticDangerPattern.test(match[0])) {
        failures.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
      }
    }
  }

  assert.deepEqual(failures, [], `Text-only destructive buttons without the global token:\n${failures.join('\n')}`);
});

test('lifecycle danger dialog and shared confirmation use semantic destructive styles', () => {
  const lifecycle = readFileSync('src/components/modules/TaskLifecycleDialog.jsx', 'utf8');
  const confirmation = readFileSync('src/components/ui/ConfirmDialog.jsx', 'utf8');

  assert.doesNotMatch(lifecycle, /(?:text|bg|border|ring|shadow)-red-/);
  assert.match(lifecycle, /bg-destructive/);
  assert.match(lifecycle, /text-destructive/);
  assert.doesNotMatch(confirmation, /#[Ee]11[Dd]48|#[Bb][Ee]123[Cc]/);
  assert.match(confirmation, /bg-destructive/);
  assert.match(confirmation, /text-destructive/);
});

test('semantic alert surfaces consume the same destructive token', () => {
  const failures = [];

  for (const file of collectJsxFiles('src')) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<[^>]*role=["']alert["'][^>]*>/gs)) {
      const context = source.slice(match.index, match.index + 900);
      if (!semanticDangerPattern.test(context)) {
        failures.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
      }
    }
  }

  assert.deepEqual(failures, [], `Alert surfaces without the global destructive token:\n${failures.join('\n')}`);
});

test('rendered alert icons inherit the semantic destructive color', () => {
  const failures = [];

  for (const file of collectJsxFiles('src')) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<(?:AlertCircle|AlertTriangle)\b/g)) {
      const context = source.slice(Math.max(0, match.index - 900), match.index + 180);
      if (!semanticDangerPattern.test(context)) failures.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
    }
  }

  assert.deepEqual(failures, [], `Alert icons without the global destructive token:\n${failures.join('\n')}`);
});

test('shared danger primitives do not fall back to red or rose utility palettes', () => {
  for (const file of [
    'src/components/ui/Badge.jsx',
    'src/components/ui/toast.jsx',
    'src/components/modules/Minutes/ui/toast.jsx',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /(?:text|bg|border|ring|shadow)-(?:red|rose)-/, file);
    assert.match(source, /destructive/, file);
  }
});

test('the global destructive-color decision is durable project guidance', () => {
  const instructions = readFileSync('AGENTS.md', 'utf8');

  assert.match(instructions, /#E11D48/);
  assert.match(instructions, /acciones de eliminaci[oó]n y alertas/i);
  assert.match(instructions, /(?:text|bg|border)-destructive/);
});
