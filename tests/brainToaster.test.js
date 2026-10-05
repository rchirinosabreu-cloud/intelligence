import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { toastLine, cleanToastText, TOAST_TEXT_LIMIT } from '../src/lib/toastText.js';
import { createToastBridge } from '../src/components/ui/use-toast.js';

// Avisos de la plataforma (Rodny, 4 de octubre de 2026: «píldora neutra», una sola línea, la pauta
// para cualquier aviso en adelante). Un solo visor, `BrainToaster`, y el texto en una línea.

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const sourceFiles = execSync('git ls-files src', { cwd: root }).toString().split('\n').filter((file) => /\.(jsx?|tsx?)$/.test(file));

test('a generic title is dropped and a real one joins the description on one line', () => {
  assert.equal(toastLine({ title: 'Error', description: 'No se pudo reintegrar la tarea.' }), 'No se pudo reintegrar la tarea.');
  assert.equal(toastLine({ title: 'Éxito', description: 'Guardado.' }), 'Guardado.');
  // Se unen como dos frases: tocar la mayúscula de la descripción rompería siglas y nombres.
  assert.equal(toastLine({ title: 'Tarea reintegrada', description: 'La tarea volvió a Pendiente.' }), 'Tarea reintegrada. La tarea volvió a Pendiente.');
  assert.equal(toastLine({ title: 'Nota eliminada' }), 'Nota eliminada');
  assert.equal(toastLine({ title: 'Error de descarga', description: 'PDF no disponible.' }), 'Error de descarga. PDF no disponible.');
  assert.equal(toastLine({ title: 'Aviso', description: 'Rodny revisó la pieza.' }), 'Rodny revisó la pieza.');
  assert.equal(toastLine({ title: 'Guardado.', description: 'Listo para revisar.' }), 'Guardado. Listo para revisar.');
});

test('line breaks and leading emojis never reach the pill', () => {
  assert.equal(cleanToastText('✅ Resumen unificado listo'), 'Resumen unificado listo');
  assert.equal(cleanToastText('Primera línea\n\nsegunda'), 'Primera línea segunda');
  assert.equal(cleanToastText(42), '42');
});

test('useToast() sends a single plain line with the right kind', () => {
  const calls = [];
  const hot = { success: (m, o) => calls.push(['success', m, o]), error: (m, o) => calls.push(['error', m, o]), dismiss() {} };
  createToastBridge(hot)({ title: 'Error', description: 'No se pudo guardar la tarea.', variant: 'destructive' });
  createToastBridge(hot)({ title: 'Campo actualizado', description: 'La propiedad se guardó.' });
  assert.deepEqual(calls.map(([kind, message]) => [kind, message]), [
    ['error', 'No se pudo guardar la tarea.'],
    ['success', 'Campo actualizado. La propiedad se guardó.']
  ]);
});

test('the app mounts only BrainToaster, below the header, and nothing else mounts a toaster', () => {
  const app = read('src/App.jsx');
  assert.match(app, /import BrainToaster from '@\/components\/ui\/BrainToaster'/);
  assert.doesNotMatch(app, /import \{[^}]*\bToaster\b[^}]*\} from 'react-hot-toast'/);
  for (const file of sourceFiles) {
    if (file === 'src/components/ui/BrainToaster.jsx') continue;
    assert.doesNotMatch(read(file), /<Toaster\b/, `${file} monta su propio visor de avisos`);
  }
  const toaster = read('src/components/ui/BrainToaster.jsx');
  assert.match(toaster, /position="top-center"/);
  assert.match(toaster, /brain-popover-surface/);
  assert.match(toaster, /truncate/);
  assert.match(toaster, /aria-live/);
  assert.doesNotMatch(toaster, /\b(?:bg|text|border)-(?:red|rose|green|emerald|purple|violet|indigo|sky|teal)-/);
  assert.equal(readFileSync(new URL('src/components/ui/use-toast.js', root), 'utf8').includes('createElement'), false);
});

test('toast texts written in the code are short and have no emojis', () => {
  const emoji = /\p{Extended_Pictographic}/u;
  const literal = /\btoast(?:\.(?:success|error|loading))?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  const problems = [];
  for (const file of sourceFiles) {
    const source = read(file);
    for (const [, , text] of source.matchAll(literal)) {
      // Lo que va entre ${…} se cuenta como una palabra de ocho letras, no por el largo del código.
      const visible = text.replace(/\$\{[^}]*\}/g, 'xxxxxxxx');
      if (visible.length > TOAST_TEXT_LIMIT) problems.push(`${file}: «${text}» (${visible.length})`);
      if (emoji.test(text)) problems.push(`${file}: «${text}» lleva emoji`);
    }
    if (/\btoast[\w.]*\([^)]*icon:\s*['"]/.test(source)) problems.push(`${file}: icono propio en un aviso`);
  }
  assert.deepEqual(problems, []);
});

test('the old toaster that was never mounted is gone', () => {
  assert.throws(() => read('src/components/ui/toaster.jsx'));
  assert.throws(() => read('src/components/ui/toast.jsx'));
  assert.doesNotMatch(read('package.json'), /@radix-ui\/react-toast/);
});
