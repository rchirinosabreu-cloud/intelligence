import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DESTRUCTIVE_TOKEN = '346.84 77.17% 49.8%';
// A destructive `variant` may be chosen at runtime; the token is still the one
// in play, so an expression offering "destructive" counts as much as a literal.
const semanticDangerPattern = /(?:text|bg|border|ring|shadow|fill)-destructive|brain-(?:danger|alert)|variant=(?:["']destructive["']|\{[^{}]*["']destructive["'][^{}]*\})/;

// Resolve only literal class constants. Ambiguous/shadowed names stay
// unresolved instead of guessing a scope.
const resolveClassConstants = (source) => {
  const declarations = new Map();
  for (const [, name] of source.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=/g)) {
    declarations.set(name, (declarations.get(name) || 0) + 1);
  }
  const classConstants = new Map();
  for (const match of source.matchAll(/\bconst\s+([\w$]+)\s*=\s*(?:'([^'\\\r\n]*)'|"([^"\\\r\n]*)")\s*;/g)) {
    if (declarations.get(match[1]) === 1) classConstants.set(match[1], match[2] ?? match[3]);
  }
  return classConstants;
};

// Substitute `className={NAME}` with the literal it resolves to, so a shared
// class constant declared far from the control is still visible to the checks.
const expandClassConstants = (text, classConstants) => text.replace(
  /\bclassName\s*=\s*\{\s*([\w$]+)\s*\}/g,
  (attribute, name) => classConstants.has(name) ? `className="${classConstants.get(name)}"` : attribute,
);

const findUnstyledDeleteIcons = (source) => {
  const classConstants = resolveClassConstants(source);
  return [...source.matchAll(/<Trash2\b/g)]
    .filter(match => !semanticDangerPattern.test(
      expandClassConstants(source.slice(Math.max(0, match.index - 900), match.index + 120), classConstants),
    ))
    .map(match => match.index);
};

const findUnstyledDestructiveButtons = (source) => {
  // Never use unrelated declarations or styles from a preceding/following button.
  const classConstants = resolveClassConstants(source);

  const buttons = source.matchAll(/<(button|Button)\b(?:(?!<\/?(?:button|Button)\b)[\s\S])*?<\/\1>/g);
  return [...buttons]
    .filter(match => /(?:Eliminar|Borrar|Descartar)/.test(match[0]))
    .filter(match => !semanticDangerPattern.test(expandClassConstants(match[0], classConstants)))
    .map(match => match.index);
};

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
    for (const index of findUnstyledDeleteIcons(source)) {
      failures.push(`${file}:${source.slice(0, index).split('\n').length}`);
    }
  }

  assert.deepEqual(failures, [], `Delete controls without the global destructive token:\n${failures.join('\n')}`);
});

test('text-only destructive buttons consume the semantic destructive token', () => {
  const failures = [];

  for (const file of collectJsxFiles('src')) {
    const source = readFileSync(file, 'utf8');
    for (const index of findUnstyledDestructiveButtons(source)) {
      failures.push(`${file}:${source.slice(0, index).split('\n').length}`);
    }
  }

  assert.deepEqual(failures, [], `Text-only destructive buttons without the global token:\n${failures.join('\n')}`);
});

test('destructive button validation resolves its referenced local string class constant', () => {
  const source = `
    const action = 'text-primary min-h-11';
    const destructive = 'brain-destructive-text text-destructive min-h-11';
    <button className={action} onClick={() => move()}>Subir etapa</button>
    <button className={destructive} onClick={() => remove()}>Eliminar etapa</button>
    <Button className={destructive}>Borrar cuota</Button>
  `;
  assert.deepEqual(findUnstyledDestructiveButtons(source), []);
});

test('an unused destructive constant cannot style a neutral destructive button', () => {
  const source = `
    const destructive = 'text-destructive';
    const action = 'text-primary';
    <button className={action}>Eliminar etapa</button>
    <button className="text-primary">Descartar borrador y recargar</button>
  `;
  assert.deepEqual(findUnstyledDestructiveButtons(source), [source.indexOf('<button'), source.lastIndexOf('<button')]);
});

test('ambiguous local class names do not borrow a constant from another scope', () => {
  const source = `
    function Neutral() {
      const action = 'text-primary';
      return <button className={action}>Eliminar etapa</button>;
    }
    function Other() {
      const action = 'text-destructive';
      return <button className={action}>Continuar</button>;
    }
  `;
  assert.deepEqual(findUnstyledDestructiveButtons(source), [source.indexOf('<button')]);
});

test('destructive styles on an adjacent button cannot hide an unstyled delete button', () => {
  const source = `
    <Button className="text-destructive">Cancelar</Button>
    <button className="text-primary">Eliminar etapa</button>
    <button className="text-destructive">Borrar cuota</button>
  `;
  assert.deepEqual(findUnstyledDestructiveButtons(source), [source.indexOf('<button')]);
});

test('direct semantic classes and destructive variants remain valid', () => {
  const source = `
    <button className="text-destructive" onClick={() => remove()}>Eliminar etapa</button>
    <Button variant="destructive">Descartar borrador</Button>
  `;
  assert.deepEqual(findUnstyledDestructiveButtons(source), []);
});

test('a delete icon styled through a distant shared class constant is accepted', () => {
  const source = `
    const destructiveIconButton = "rounded-lg brain-destructive-text text-destructive hover:bg-destructive/10";
    ${' '.repeat(900)}
    <button className={destructiveIconButton} aria-label="Descartar grabación"><Trash2 className="h-5 w-5" /></button>
  `;
  assert.deepEqual(findUnstyledDeleteIcons(source), []);
});

test('a delete icon styled through a neutral class constant is still flagged', () => {
  const source = `
    const iconButton = "rounded-lg text-muted-foreground hover:bg-muted";
    ${' '.repeat(900)}
    <button className={iconButton} aria-label="Descartar grabación"><Trash2 className="h-5 w-5" /></button>
  `;
  assert.equal(findUnstyledDeleteIcons(source).length, 1);
});

test('a runtime-selected destructive variant counts as the semantic token', () => {
  const source = `
    <Button variant={dialog?.type === "delete" ? "destructive" : "default"} className="min-h-11">Eliminar</Button>
  `;
  assert.deepEqual(findUnstyledDestructiveButtons(source), []);
});

test('a runtime-selected variant without the destructive token is still flagged', () => {
  const source = `
    <Button variant={dialog?.type === "delete" ? "outline" : "default"} className="min-h-11">Eliminar</Button>
  `;
  assert.equal(findUnstyledDestructiveButtons(source).length, 1);
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
